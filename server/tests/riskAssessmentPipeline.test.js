const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const Transaction = require('../src/models/transactions.model');
const FraudAlert = require('../src/models/fraudalerts.model');
const Blacklist = require('../src/models/blacklists.model');
const SystemConfig = require('../src/models/systemconfigs.model');
const { connectDB, disconnectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword, encryptText } = require('../src/utils/crypto.utils');

jest.setTimeout(45000);

let customerToken = null;
let customerUser = null;
let customerProfile = null;

beforeAll(async () => {
  await connectDB();
  await User.deleteMany({});
  await Customer.deleteMany({});
  await Transaction.deleteMany({});
  await FraudAlert.deleteMany({});
  await Blacklist.deleteMany({});
  await SystemConfig.deleteMany({});

  // Seed default SystemConfigs
  await SystemConfig.create({
    key: 'riskThresholds',
    value: { lowMax: 39, mediumMax: 69 },
    category: 'thresholds',
    description: 'Risk level boundaries for Low, Medium, and High'
  });

  // Seed Blacklisted Mule Account
  await Blacklist.create({
    type: 'accountNumber',
    value: '998877665544',
    normalizedValue: '998877665544',
    category: 'mule account',
    severity: 'high',
    active: true
  });

  const passwordHash = await hashPassword('Password@123');
  customerUser = await User.create({
    fullName: 'Risk Pipeline Tester',
    email: 'riskpipeline@deepshield.ai',
    phone: '+919822334455',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  customerProfile = await Customer.create({
    userId: customerUser._id,
    accountNumber: '300911223344',
    balance: 500000,
    currency: 'INR',
    address: encryptText('Colaba, Mumbai'),
    baseline: {
      averageAmount: 5000,
      stdAmount: 2500,
      averageDeposit: 25000,
      stdDeposit: 12000,
      usualHours: [9, 14, 18],
      usualCities: ['Mumbai'],
      knownDeviceIds: ['DEV-KNOWN-PHONE'],
      knownPayees: ['300988001122'],
      knownSenders: ['300977001122']
    }
  });

  customerToken = generateAccessToken({
    id: customerUser._id,
    email: customerUser.email,
    role: customerUser.role,
    fullName: customerUser.fullName
  });
});

afterAll(async () => {
  await disconnectDB();
});

describe('Consistent Transaction Risk Assessment Pipeline Test Suite', () => {

  const resetState = async (initialBalance = 500000) => {
    await Transaction.deleteMany({});
    await FraudAlert.deleteMany({});
    await Customer.findByIdAndUpdate(customerProfile._id, { balance: initialBalance });
  };

  // -------------------------------------------------------------
  // Test 1: ₹25,00,000 incoming deposit from a new/unverified sender
  // -------------------------------------------------------------
  test('Test 1: ₹25,00,000 incoming deposit from unverified sender is held for review and does NOT credit balance', async () => {
    await resetState(500000);

    const res = await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        channel: 'transfer',
        amount: 2500000,
        sender: {
          name: 'Unknown Offshore Entity',
          accountNumber: '887766554433',
          bank: 'Offshore Trust',
          isVerified: false,
          isKnown: false
        },
        description: 'Large Foreign Inbound Credit'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // Risk score must be high (>= 70) due to extreme surge (100x baseline) + unverified sender
    expect(res.body.data.riskLevel).toBe('high');
    expect(res.body.data.riskScore).toBeGreaterThanOrEqual(70);

    // Status must be 'underReview' (compliance hold)
    expect(res.body.data.transaction.status).toBe('underReview');

    // Contributing factor should clearly explain the high-value surge
    const factors = res.body.data.indicators.map(i => i.factor);
    expect(factors).toContain('Extreme High-Value Inbound Surge');
    expect(factors).toContain('Unverified High-Value Remitter');

    // Fraud alert must be created
    expect(res.body.data.fraudAlert).toBeDefined();

    // Customer balance must NOT be credited: still ₹5,00,000
    const cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(500000);
  });

  // -------------------------------------------------------------
  // Test 2: ₹25,00,000 incoming deposit from a verified sender with legitimate history
  // -------------------------------------------------------------
  test('Test 2: ₹25,00,000 incoming deposit from verified sender accounts for sender trust without false mule penalty', async () => {
    await resetState(500000);

    const res = await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        channel: 'transfer',
        amount: 2500000,
        sender: {
          name: 'Verified Corporate Employer Ltd',
          accountNumber: '300977001122', // In customer baseline knownSenders
          bank: 'HDFC Bank',
          isVerified: true,
          isKnown: true
        },
        description: 'Executive Bonus Credit'
      });

    expect(res.statusCode).toBe(200);
    // Factor list should NOT contain 'Unverified High-Value Remitter' because sender is verified
    const factorNames = res.body.data.indicators.map(i => i.factor);
    expect(factorNames).not.toContain('Unverified High-Value Remitter');
  });

  // -------------------------------------------------------------
  // Test 3: ₹25,000 incoming deposit within customer's normal pattern
  // -------------------------------------------------------------
  test('Test 3: ₹25,00,000 anomaly is resolved; normal ₹25,000 deposit is Low Risk and automatically credited', async () => {
    await resetState(500000);

    const res = await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        channel: 'transfer',
        amount: 25000,
        sender: {
          name: 'Monthly Client Payment',
          accountNumber: '300977001122',
          bank: 'SBI',
          isVerified: true
        },
        description: 'Client Retainer'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.riskLevel).toBe('low');
    expect(res.body.data.riskScore).toBeLessThan(40);
    expect(res.body.data.transaction.status).toBe('approved');

    // Balance must be credited: 500,000 + 25,000 = 525,000
    const cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(525000);
  });

  // -------------------------------------------------------------
  // Test 4: ₹15,000 outgoing transfer to a new, unverified recipient (Step-Up, NOT blocked)
  // -------------------------------------------------------------
  test('Test 4: ₹15,000 outgoing transfer to a new payee triggers Step-Up OTP (Medium Risk) instead of being blocked', async () => {
    await resetState(500000);

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 15000,
        payee: {
          name: 'New Friend Payee',
          accountNumber: '300955443322',
          bank: 'ICICI Bank',
          isNew: true
        },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-KNOWN-PHONE', isKnown: true },
        description: 'Shared dinner payment'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // Must be Medium Risk (40-69), NOT High Risk (70+)
    expect(res.body.data.riskAssessment.riskLevel).toBe('medium');
    expect(res.body.data.riskAssessment.aiScore).toBeGreaterThanOrEqual(40);
    expect(res.body.data.riskAssessment.aiScore).toBeLessThan(70);

    // Status must be 'pendingStepUp', stepUpRequired = true, NOT blocked
    expect(res.body.data.transaction.status).toBe('pendingStepUp');
    expect(res.body.data.stepUpRequired).toBe(true);
    expect(res.body.data.fraudAlert).toBeNull();

    // Funds must NOT be deducted yet: still ₹5,00,000
    let cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(500000);

    // Verify valid Step-Up OTP completes and approves the transaction
    const otpRes = await request(app)
      .post(`/api/v1/transactions/${res.body.data.transaction._id}/step-up`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ otpCode: res.body.data.devOtp });

    expect(otpRes.statusCode).toBe(200);
    expect(otpRes.body.data.transaction.status).toBe('approved');

    // Balance is now debited: 500,000 - 15,000 = 485,000
    cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(485000);
  });

  // -------------------------------------------------------------
  // Test 5: ₹15,000 outgoing transfer to a trusted recipient with normal history
  // -------------------------------------------------------------
  test('Test 5: ₹15,000 outgoing transfer to a trusted/known payee is Low Risk and auto-approved', async () => {
    await resetState(500000);

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 15000,
        payee: {
          name: 'Regular Payee',
          accountNumber: '300988001122', // In customer baseline knownPayees
          bank: 'SBI',
          isNew: false
        },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-KNOWN-PHONE', isKnown: true },
        description: 'Regular monthly payment'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.riskAssessment.riskLevel).toBe('low');
    expect(res.body.data.transaction.status).toBe('approved');

    // Balance debited cleanly: 500,000 - 15,000 = 485,000
    const cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(485000);
  });

  // -------------------------------------------------------------
  // Test 6: Low-value transaction involving a confirmed blacklisted account
  // -------------------------------------------------------------
  test('Test 6: Mandatory security override: low-value transfer (₹1,500) to blacklisted mule account is auto-blocked', async () => {
    await resetState(500000);

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 1500, // Very low amount, but payee is on active blacklist
        payee: {
          name: 'Confirmed Mule Payee',
          accountNumber: '998877665544',
          bank: 'Unknown'
        },
        device: { deviceId: 'DEV-KNOWN-PHONE', isKnown: true }
      });

    expect(res.statusCode).toBe(200);
    // Must be Critical/High risk with score = 95
    expect(res.body.data.riskAssessment.aiScore).toBe(95);
    expect(res.body.data.riskAssessment.riskLevel).toBe('high');
    expect(res.body.data.transaction.status).toBe('blocked');
    expect(res.body.data.fraudAlert).toBeDefined();

    // Balance must NOT be deducted
    const cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(500000);
  });

  // -------------------------------------------------------------
  // Test 7: Multiple rapid transactions exceeding velocity limit
  // -------------------------------------------------------------
  test('Test 7: Multiple rapid transactions in 10-minute window trigger High Velocity anomaly', async () => {
    await resetState(500000);

    // Create 3 recent transactions within 5 minutes
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    for (let i = 0; i < 3; i++) {
      await Transaction.create({
        customerId: customerProfile._id,
        userId: customerUser._id,
        type: 'transfer',
        amount: 1000,
        status: 'approved',
        timestamp: fiveMinsAgo,
        payee: { name: 'Prior Payee' }
      });
    }

    // Now 4th transaction triggers velocity signal
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 8000,
        payee: { name: 'Quick Payee', accountNumber: '300911002233', isNew: true },
        device: { deviceId: 'DEV-KNOWN-PHONE', isKnown: true }
      });

    expect(res.statusCode).toBe(200);
    const factors = res.body.data.riskAssessment.topFactors.map(f => f.factor);
    expect(factors).toContain('High Transaction Velocity');
  });

  // -------------------------------------------------------------
  // Test 8: AI model failure or missing model output uses calibrated fallback
  // -------------------------------------------------------------
  test('Test 8: AI model inference fallback gracefully handles model absence without crashing or silent zero-score', async () => {
    const { calculateReconstructionError } = require('../src/engine/transactionAutoencoder');
    
    // Simulate feature vector
    const featureVec = [0.8, 0.5, 0.3, 0.2, 0.2, 1.0, 1.0, 0.0, 0.5];
    const result = await calculateReconstructionError(featureVec);

    expect(result).toBeDefined();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  // -------------------------------------------------------------
  // Test 9: Blocked transaction never updates account balance
  // -------------------------------------------------------------
  test('Test 9: Blocked transaction never deducts from customer balance', async () => {
    await resetState(500000);

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 90000,
        payee: {
          name: 'Blacklisted Recipient',
          accountNumber: '998877665544',
          bank: 'DarkBank'
        }
      });

    expect(res.body.data.transaction.status).toBe('blocked');

    const cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(500000); // Completely unchanged
  });

  // -------------------------------------------------------------
  // Test 10: Pending transactions appear accurately as pending/underReview in history
  // -------------------------------------------------------------
  test('Test 10: Held and step-up transactions appear with exact pending status in transaction history', async () => {
    await resetState(500000);

    // 1. Create a held inbound deposit
    await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        channel: 'transfer',
        amount: 2500000,
        sender: { name: 'Held Remitter', accountNumber: '7788990011', isVerified: false }
      });

    // 2. Fetch customer transaction history
    const historyRes = await request(app)
      .get('/api/v1/transactions/my')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.data.transactions.length).toBe(1);

    const txInHistory = historyRes.body.data.transactions[0];
    expect(txInHistory.status).toBe('underReview');
    expect(txInHistory.status).not.toBe('completed');
    expect(txInHistory.status).not.toBe('approved');
  });

});
