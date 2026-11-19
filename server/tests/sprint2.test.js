const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const Transaction = require('../src/models/transactions.model');
const FraudAlert = require('../src/models/fraudalerts.model');
const Blacklist = require('../src/models/blacklists.model');
const { connectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword, encryptText } = require('../src/utils/crypto.utils');

jest.setTimeout(30000);

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

  // Create blacklisted payee entry
  await Blacklist.create({
    type: 'accountNumber',
    value: '998877665544',
    normalizedValue: '998877665544',
    category: 'mule account',
    severity: 'high'
  });

  // Create customer directly with ample balance for test suite
  const passwordHash = await hashPassword('Password@123');
  customerUser = await User.create({
    fullName: 'Sprint Two Tester',
    email: 'sprinttwo@deepshield.ai',
    phone: '+919876543210',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  customerProfile = await Customer.create({
    userId: customerUser._id,
    accountNumber: '300999887766',
    balance: 500000,
    currency: 'INR',
    address: encryptText('Mumbai, India'),
    baseline: {
      averageAmount: 5000,
      stdAmount: 2500,
      usualHours: [9, 14, 18],
      usualCities: ['Mumbai'],
      knownDeviceIds: ['DEV-KNOWN-1'],
      knownPayees: ['300911112222']
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
  const mongoose = require('mongoose');
  await mongoose.disconnect();
});

describe('Agile Sprint 2: Real-time Transaction Monitoring & Risk Fusion (User Stories US-2.1 - US-2.4)', () => {

  test('US-2.1: Low-Risk Transfer Auto-Approved with Sub-Second Scoring', async () => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 2000,
        payee: { name: 'Verified Merchant', accountNumber: '300911112222', bank: 'SBI', isNew: false },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-KNOWN-1', isKnown: true }
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transaction.status).toEqual('approved');
    expect(res.body.data.riskAssessment.riskLevel).toEqual('low');
  });

  test('US-2.2: Medium-Risk Transfer Requires Step-Up OTP & Successfully Resolves', async () => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 16000, // Amount 3.2x average -> lands in Medium Risk (40-69)
        payee: { name: 'Unverified Payee', accountNumber: '300977778888', bank: 'ICICI', isNew: true },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-KNOWN-1', isKnown: true }
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.stepUpRequired).toBe(true);
    expect(res.body.data.transaction.status).toEqual('pendingStepUp');

    const txId = res.body.data.transaction._id;
    const stepUpOtp = res.body.data.devOtp;

    // Verify step-up OTP
    const stepUpRes = await request(app)
      .post(`/api/v1/transactions/${txId}/step-up`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ otpCode: stepUpOtp });

    expect(stepUpRes.statusCode).toEqual(200);
    expect(stepUpRes.body.data.transaction.status).toEqual('approved');
    expect(stepUpRes.body.data.transaction.stepUp.verified).toBe(true);
  });

  test('US-2.3: High-Risk Transfer (Blacklisted Mule Payee) Auto-Blocked & Alert Dispatched', async () => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 85000,
        payee: { name: 'Mule Account Blacklisted', accountNumber: '998877665544', bank: 'Unknown', isNew: true },
        location: { city: 'Moscow', country: 'Russia' },
        device: { deviceId: 'DEV-TOR-VPN', isKnown: false }
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.transaction.status).toEqual('blocked');
    expect(res.body.data.riskAssessment.riskLevel).toEqual('high');
    expect(res.body.data.fraudAlert).toBeDefined();
    expect(res.body.data.fraudAlert.alertNumber).toMatch(/^FA-\d{4}-\d{6}$/);
  });

  test('US-2.4: Agile Performance SLA - Transaction Scoring Completes Under 3 Seconds', async () => {
    const startTime = Date.now();

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 5000,
        payee: { name: 'Benchmark Merchant', accountNumber: '300955556666', bank: 'HDFC', isNew: false },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-BENCHMARK', isKnown: true }
      });

    const durationMs = Date.now() - startTime;
    console.log(`[Agile Benchmark Result] Transaction scoring finished in ${durationMs}ms`);

    expect(res.statusCode).toEqual(200);
    expect(durationMs).toBeLessThan(3000);
  });
});
