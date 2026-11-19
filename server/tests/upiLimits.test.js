const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const Transaction = require('../src/models/transactions.model');
const FraudAlert = require('../src/models/fraudalerts.model');
const Blacklist = require('../src/models/blacklists.model');
const SystemConfig = require('../src/models/systemconfigs.model');
const Idempotency = require('../src/models/idempotencies.model');
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
  await Idempotency.deleteMany({});

  // Seed default SystemConfigs including UPI limits
  await SystemConfig.create({
    key: 'upiLimits',
    value: {
      p2p: {
        perTransactionLimit: 100000,
        dailyCumulativeLimit: 100000,
        rollingWindowHours: 24,
        description: 'Standard Person-to-Person (P2P) Outgoing UPI Limit'
      },
      verifiedMerchant: {
        perTransactionLimit: 200000,
        dailyCumulativeLimit: 500000,
        rollingWindowHours: 24,
        description: 'Verified Merchant (P2M) Outgoing UPI Limit'
      },
      inbound: {
        standardCredit: {
          perTransactionLimit: 200000,
          dailyCumulativeLimit: 500000,
          rollingWindowHours: 24,
          description: 'Project Inbound UPI Credit Limit'
        },
        p2pCredit: {
          perTransactionLimit: 100000,
          dailyCumulativeLimit: 200000,
          rollingWindowHours: 24,
          description: 'Inbound P2P Transfer Credit Limit'
        }
      }
    },
    category: 'rules',
    description: 'UPI Per-Transaction and Daily Rolling 24h Limits'
  });

  // Blacklist entry for mule screening test
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
    fullName: 'UPI Limit Validation Tester',
    email: 'upitester@deepshield.ai',
    phone: '+919811122233',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  customerProfile = await Customer.create({
    userId: customerUser._id,
    accountNumber: '300912345678',
    balance: 1000000, // ₹10,00,000 for ample testing headroom
    currency: 'INR',
    address: encryptText('Marine Drive, Mumbai'),
    baseline: {
      averageAmount: 50000,
      stdAmount: 20000,
      usualHours: [9, 12, 16, 20],
      usualCities: ['Mumbai'],
      knownDeviceIds: ['DEV-UPI-TEST'],
      knownPayees: ['300999001122']
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

describe('UPI Per-Transaction and Daily Cumulative Limit Validation Test Suite', () => {

  // Clean transactions before test cases that require a fresh rolling window
  const resetTransactions = async () => {
    await Transaction.deleteMany({});
    await Idempotency.deleteMany({});
    await Customer.findByIdAndUpdate(customerProfile._id, { balance: 1000000 });
  };

  // -------------------------------------------------------------
  // Test 1: UPI payment of ₹1,00,000 with no previous payments (Passes)
  // -------------------------------------------------------------
  test('Test 1: Standard P2P UPI payment of ₹1,00,000 with no previous payments is allowed', async () => {
    await resetTransactions();

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 100000,
        payee: { name: 'P2P Contact', accountNumber: '300999001122', bank: 'SBI', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transaction.status).toBe('approved');
    expect(res.body.data.transaction.amount).toBe(100000);

    // Verify balance was deducted
    const updatedCust = await Customer.findById(customerProfile._id);
    expect(updatedCust.balance).toBe(900000);
  });

  // -------------------------------------------------------------
  // Test 2: UPI payment of ₹1,00,001 with no previous payments (Rejected - Per-Tx Limit)
  // -------------------------------------------------------------
  test('Test 2: Standard P2P UPI payment of ₹1,00,001 is rejected before deduction', async () => {
    await resetTransactions();

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 100001,
        payee: { name: 'P2P Contact', accountNumber: '300999001122', bank: 'SBI', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('UPI_PER_TRANSACTION_LIMIT_EXCEEDED');
    expect(res.body.message).toMatch(/per-transaction limit exceeded/i);

    // Verify balance was NOT deducted
    const updatedCust = await Customer.findById(customerProfile._id);
    expect(updatedCust.balance).toBe(1000000);

    // Verify no approved transaction was recorded
    const txCount = await Transaction.countDocuments({ status: { $in: ['approved', 'completed'] } });
    expect(txCount).toBe(0);
  });

  // -------------------------------------------------------------
  // Test 3: ₹60,000 followed by ₹30,000, then attempted ₹15,000 (Cumulative Exceeded)
  // -------------------------------------------------------------
  test('Test 3: ₹60,000 + ₹30,000 allowed, then attempted ₹15,000 rejected (cumulative ₹1,05,000 > ₹1,00,000)', async () => {
    await resetTransactions();

    // 1st payment: ₹60,000
    const res1 = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 60000,
        payee: { name: 'Recipient A', accountNumber: '300999001122', bank: 'SBI', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });
    expect(res1.statusCode).toBe(200);

    // 2nd payment: ₹30,000
    const res2 = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 30000,
        payee: { name: 'Recipient B', accountNumber: '300999001123', bank: 'HDFC', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });
    expect(res2.statusCode).toBe(200);

    // Check remaining limit summary endpoint
    const limitSummaryRes = await request(app)
      .get('/api/v1/transactions/limits/upi?category=p2p')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(limitSummaryRes.statusCode).toBe(200);
    expect(limitSummaryRes.body.data.amountUsed24h).toBe(90000);
    expect(limitSummaryRes.body.data.remainingLimit).toBe(10000);

    // 3rd attempted payment: ₹15,000 (exceeds remaining ₹10,000 limit)
    const res3 = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 15000,
        payee: { name: 'Recipient C', accountNumber: '300999001124', bank: 'ICICI', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(res3.statusCode).toBe(400);
    expect(res3.body.success).toBe(false);
    expect(res3.body.code).toBe('UPI_DAILY_LIMIT_EXCEEDED');
    expect(res3.body.message).toMatch(/daily cumulative limit exceeded/i);

    // Balance should have deducted only 60k + 30k = 90k, not 15k
    const updatedCust = await Customer.findById(customerProfile._id);
    expect(updatedCust.balance).toBe(910000);
  });

  // -------------------------------------------------------------
  // Test 4: New 24-hour window after older transactions age out of rolling window
  // -------------------------------------------------------------
  test('Test 4: Transactions older than 24 hours age out of the rolling window and restore the limit', async () => {
    await resetTransactions();

    // Insert an approved ₹1,00,000 transaction from 25 hours ago
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await Transaction.create({
      customerId: customerProfile._id,
      userId: customerUser._id,
      type: 'upi',
      channel: 'upi',
      amount: 100000,
      status: 'approved',
      timestamp: twentyFiveHoursAgo,
      payee: { name: 'Past Payee', accountNumber: '300999001199', category: 'p2p' }
    });

    // Verify limit summary shows full ₹1,00,000 available
    const limitsRes = await request(app)
      .get('/api/v1/transactions/limits/upi?category=p2p')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(limitsRes.body.data.amountUsed24h).toBe(0);
    expect(limitsRes.body.data.remainingLimit).toBe(100000);

    // Attempt new ₹1,00,000 transaction now -> should succeed
    const newTxRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 100000,
        payee: { name: 'New Contact', accountNumber: '300999001122', bank: 'SBI', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(newTxRes.statusCode).toBe(200);
    expect(newTxRes.body.success).toBe(true);
    expect(newTxRes.body.data.transaction.status).toBe('approved');
  });

  // -------------------------------------------------------------
  // Test 5: Failed or blocked transaction must not count toward successful-payment totals
  // -------------------------------------------------------------
  test('Test 5: Blocked or rejected transactions do not count toward rolling cumulative limit', async () => {
    await resetTransactions();

    // 1. Send transaction to blacklisted mule account (₹75,000) -> auto-blocked by risk engine
    const blockedRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 75000,
        payee: { name: 'Blacklisted Mule', accountNumber: '998877665544', bank: 'Offshore', isNew: true },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(blockedRes.statusCode).toBe(200);
    expect(blockedRes.body.data.transaction.status).toBe('blocked');

    // 2. Also record a transaction with status: 'rejected'
    await Transaction.create({
      customerId: customerProfile._id,
      userId: customerUser._id,
      type: 'upi',
      channel: 'upi',
      amount: 50000,
      status: 'rejected',
      timestamp: new Date(),
      payee: { name: 'Rejected Payee', accountNumber: '300999000000', category: 'p2p' }
    });

    // Check limit usage - neither blocked nor rejected should count!
    const limitsRes = await request(app)
      .get('/api/v1/transactions/limits/upi?category=p2p')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(limitsRes.body.data.amountUsed24h).toBe(0);
    expect(limitsRes.body.data.remainingLimit).toBe(100000);

    // Now send a fresh ₹1,00,000 UPI transaction -> must succeed!
    const successRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 100000,
        payee: { name: 'Clean Contact', accountNumber: '300999001122', bank: 'SBI', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(successRes.statusCode).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.transaction.status).toBe('approved');
  });

  // -------------------------------------------------------------
  // Test 6: Incoming credit evaluated against its own configured policy
  // -------------------------------------------------------------
  test('Test 6: Inbound UPI credit is evaluated against configurable inbound policy, not outgoing P2P limits', async () => {
    await resetTransactions();

    // Inbound policy allows ₹2,00,000 per transaction (higher than outgoing ₹1,00,000 limit)
    const inboundRes = await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        channel: 'upi',
        amount: 150000, // ₹1,50,000 exceeds P2P ₹1,00,000 debit limit, but is within inbound ₹2,00,000 limit
        sender: { name: 'Corporate Remitter', accountNumber: '300988776655', bank: 'HDFC' },
        description: 'Consulting Retainer'
      });

    expect(inboundRes.statusCode).toBe(200);
    expect(inboundRes.body.success).toBe(true);
    expect(inboundRes.body.data.transaction.status).toBe('approved');

    // Attempt incoming credit exceeding inbound per-transaction limit of ₹2,00,000 (e.g. ₹2,50,000)
    const excessInbound = await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        channel: 'upi',
        amount: 250000,
        sender: { name: 'Large Remitter', accountNumber: '300988776656', bank: 'SBI' },
        description: 'Exceeding Limit Deposit'
      });

    expect(excessInbound.statusCode).toBe(400);
    expect(excessInbound.body.success).toBe(false);
    expect(excessInbound.body.code).toBe('UPI_INBOUND_PER_TRANSACTION_LIMIT_EXCEEDED');
  });

  // -------------------------------------------------------------
  // Test 7: Two simultaneous payment requests that would collectively exceed the limit
  // -------------------------------------------------------------
  test('Test 7: Simultaneous concurrent payment requests are locked sequentially to prevent limit bypass', async () => {
    await resetTransactions();

    // Already use ₹60,000
    await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 60000,
        payee: { name: 'Initial Contact', accountNumber: '300999001122', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    // Remaining limit is ₹40,000.
    // Fire two concurrent requests of ₹30,000 simultaneously:
    // Total requested = ₹60,000 > ₹40,000 remaining.
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          type: 'upi',
          channel: 'upi',
          amount: 30000,
          payee: { name: 'Concurrent Payee 1', accountNumber: '300999001123', category: 'p2p' },
          device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
        }),
      request(app)
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          type: 'upi',
          channel: 'upi',
          amount: 30000,
          payee: { name: 'Concurrent Payee 2', accountNumber: '300999001124', category: 'p2p' },
          device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
        })
    ]);

    const results = [resA, resB];
    const successful = results.filter((r) => r.statusCode === 200);
    const rejected = results.filter((r) => r.statusCode === 400 && r.body.code === 'UPI_DAILY_LIMIT_EXCEEDED');

    expect(successful.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Total successful payments in DB must be exactly 60k + 30k = 90k (<= 100k)
    const approvedTx = await Transaction.find({ status: { $in: ['approved', 'completed'] } });
    const totalOut = approvedTx.reduce((sum, tx) => sum + tx.amount, 0);
    expect(totalOut).toBe(90000);
  });

  // -------------------------------------------------------------
  // Test 8: Duplicate submission with Idempotency Key does not execute twice
  // -------------------------------------------------------------
  test('Test 8: Duplicate submission with idempotency key returns cached response without duplicate execution', async () => {
    await resetTransactions();

    const idempotencyKey = 'idemp-test-key-abc-12345';

    // 1st submission
    const firstRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 25000,
        payee: { name: 'Idempotency Payee', accountNumber: '300999001122', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(firstRes.statusCode).toBe(200);
    const firstTxId = firstRes.body.data.transaction._id;

    // Balance after 1st submission: 1,000,000 - 25,000 = 975,000
    const custAfterFirst = await Customer.findById(customerProfile._id);
    expect(custAfterFirst.balance).toBe(975000);

    // 2nd duplicate submission with identical key
    const secondRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 25000,
        payee: { name: 'Idempotency Payee', accountNumber: '300999001122', category: 'p2p' },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(secondRes.statusCode).toBe(200);
    // Identical transaction ID returned from cached idempotency
    expect(secondRes.body.data.transaction._id).toBe(firstTxId);

    // Balance must NOT be debited twice
    const custAfterSecond = await Customer.findById(customerProfile._id);
    expect(custAfterSecond.balance).toBe(975000);

    // Exactly one transaction record in DB
    const txCount = await Transaction.countDocuments({ customerId: customerProfile._id });
    expect(txCount).toBe(1);
  });

  // -------------------------------------------------------------
  // Test 9: High-value incoming payment triggers fraud assessment independently of limit validation
  // -------------------------------------------------------------
  test('Test 9: Passing UPI limit validation runs fraud-risk assessment independently', async () => {
    await resetTransactions();

    // Deposit from blacklisted mule account, within inbound limits (₹48,500 < ₹2,00,000 limit)
    const res = await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        channel: 'upi',
        amount: 48500,
        sender: { name: 'Blacklisted Mule Remitter', accountNumber: '998877665544', bank: 'Unknown' },
        description: 'Suspicious Structuring Deposit'
      });

    expect(res.statusCode).toBe(200);
    // Even though limit check passed, fraud engine flagged and held/blocked funds
    expect(['high', 'critical']).toContain(res.body.data.riskLevel);
    expect(['underReview', 'blocked']).toContain(res.body.data.transaction.status);
    expect(res.body.data.fraudAlert).toBeDefined();

    // Verify customer balance was NOT credited
    const cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(1000000);
  });

  // -------------------------------------------------------------
  // Test 10: Verified merchant payment using category-specific limit
  // -------------------------------------------------------------
  test('Test 10: Verified merchant payment of ₹1,50,000 succeeds under category-specific limit', async () => {
    await resetTransactions();

    // 1. Verify that standard P2P payment of ₹1,50,000 is rejected (since P2P max is ₹1,00,000)
    const p2pRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 150000,
        category: 'p2p',
        payee: { name: 'Standard P2P Payee', accountNumber: '300999001122', category: 'p2p' }
      });
    expect(p2pRes.statusCode).toBe(400);
    expect(p2pRes.body.code).toBe('UPI_PER_TRANSACTION_LIMIT_EXCEEDED');

    // 2. But verifiedMerchant limit is ₹2,00,000 per-tx / ₹5,00,000 daily -> Payment of ₹1,50,000 succeeds!
    const merchantRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'upi',
        channel: 'upi',
        amount: 150000,
        category: 'verifiedMerchant',
        payee: {
          name: 'Apollo Hospital & Healthcare',
          accountNumber: '300955667788',
          bank: 'Axis Bank',
          category: 'verifiedMerchant',
          isMerchant: true
        },
        device: { deviceId: 'DEV-UPI-TEST', isKnown: true }
      });

    expect(merchantRes.statusCode).toBe(200);
    expect(merchantRes.body.success).toBe(true);
    expect(merchantRes.body.data.transaction.amount).toBe(150000);

    // If AI risk engine prompts step-up OTP, verify OTP to complete transaction
    if (merchantRes.body.data.stepUpRequired) {
      const stepUpRes = await request(app)
        .post(`/api/v1/transactions/${merchantRes.body.data.transaction._id}/step-up`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ otpCode: merchantRes.body.data.devOtp });

      expect(stepUpRes.statusCode).toBe(200);
      expect(stepUpRes.body.data.transaction.status).toBe('approved');
    } else {
      expect(merchantRes.body.data.transaction.status).toBe('approved');
    }

    // Verify balance was debited: 1,000,000 - 150,000 = 850,000
    const cust = await Customer.findById(customerProfile._id);
    expect(cust.balance).toBe(850000);
  });
});
