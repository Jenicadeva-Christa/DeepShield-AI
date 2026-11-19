const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const Transaction = require('../src/models/transactions.model');
const RiskAssessment = require('../src/models/riskassessments.model');
const FraudAlert = require('../src/models/fraudalerts.model');
const Investigation = require('../src/models/investigations.model');
const IdentityVerification = require('../src/models/identityverifications.model');
const Notification = require('../src/models/notifications.model');
const Otp = require('../src/models/otps.model');
const { connectDB, disconnectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword, hashSHA256 } = require('../src/utils/crypto.utils');

jest.setTimeout(60000);

describe('DeepShield AI — Complete MongoDB Persistence Test Suite', () => {
  let customerUser = null;
  let customerProfile = null;
  let customerToken = null;
  let analystUser = null;
  let analystToken = null;

  let outboundTxId = null;
  let inboundTxId = null;

  beforeAll(async () => {
    // Connect to database
    await connectDB();
    await User.deleteMany({});
    await Customer.deleteMany({});
    await Transaction.deleteMany({});
    await FraudAlert.deleteMany({});
    await Investigation.deleteMany({});
    await IdentityVerification.deleteMany({});
    await Notification.deleteMany({});
    await Otp.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // ==========================================
  // 1. USER PERSISTENCE & REGISTRATION
  // ==========================================
  test('1. User Registration: New user registers and is saved in MongoDB', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Kavita Sundaram',
        email: 'kavita.sundaram@deepshield.ai',
        phone: '+919870001122',
        password: 'Password@123',
        address: 'Bandra West, Mumbai'
      });

    expect(regRes.statusCode).toBe(201);
    expect(regRes.body.success).toBe(true);
    expect(regRes.body.data.email).toBe('kavita.sundaram@deepshield.ai');

    // Confirm existence in MongoDB
    customerUser = await User.findOne({ email: 'kavita.sundaram@deepshield.ai' });
    expect(customerUser).not.toBeNull();
    expect(customerUser.fullName).toBe('Kavita Sundaram');
    expect(customerUser.role).toBe('customer');

    // Confirm Customer profile in MongoDB
    customerProfile = await Customer.findOne({ userId: customerUser._id });
    expect(customerProfile).not.toBeNull();
    expect(customerProfile.balance).toBe(100000);
    expect(customerProfile.accountNumber).toBeDefined();

    customerToken = generateAccessToken({
      id: customerUser._id,
      email: customerUser.email,
      role: customerUser.role,
      fullName: customerUser.fullName
    });
  });

  test('2. Server Restart Simulation: Disconnect and reconnect keeps registered user intact', async () => {
    // Simulate server shutdown and restart by disconnecting mongoose
    await mongoose.disconnect();
    expect(mongoose.connection.readyState).toBe(0);

    // Reconnect to database
    await connectDB();
    expect(mongoose.connection.readyState).toBe(1);

    // Retrieve user record again from MongoDB
    const reloadedUser = await User.findOne({ email: 'kavita.sundaram@deepshield.ai' });
    expect(reloadedUser).not.toBeNull();
    expect(reloadedUser._id.toString()).toBe(customerUser._id.toString());
    expect(reloadedUser.fullName).toBe('Kavita Sundaram');
  });

  test('3. Login after Restart: User can log in with saved password & OTP', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'kavita.sundaram@deepshield.ai',
        password: 'Password@123'
      });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.success).toBe(true);

    // Verify OTP record was created in MongoDB
    const otpRecord = await Otp.findOne({
      userId: customerUser._id,
      purpose: 'login',
      consumed: false
    });
    expect(otpRecord).not.toBeNull();
  });

  // ==========================================
  // 2. TRANSACTION PERSISTENCE
  // ==========================================
  test('4. Outbound Transaction: Initiated and persisted in MongoDB', async () => {
    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        type: 'transfer',
        amount: 2500,
        payee: { name: 'Apollo Pharmacy', accountNumber: '3009112233', bank: 'HDFC Bank', isNew: false },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-WEB-KAVITA', ipAddress: '103.21.12.44', isKnown: true },
        description: 'Healthcare supplies'
      });

    expect(txRes.statusCode).toBe(200);
    expect(txRes.body.success).toBe(true);
    expect(txRes.body.data.transaction).toBeDefined();

    outboundTxId = txRes.body.data.transaction._id;

    // Verify persistence in MongoDB Transaction collection
    const savedTx = await Transaction.findById(outboundTxId);
    expect(savedTx).not.toBeNull();
    expect(savedTx.amount).toBe(2500);
    expect(savedTx.type).toBe('transfer');
    expect(savedTx.status).toBe('approved');
    expect(savedTx.customerId.toString()).toBe(customerProfile._id.toString());

    // Verify updated balance in MongoDB Customer document (100000 - 2500 = 97500)
    const updatedCustomer = await Customer.findById(customerProfile._id);
    expect(updatedCustomer.balance).toBe(97500);
  });

  test('5. Inbound Transaction (Deposit): Processed and persisted in MongoDB with RiskAssessment', async () => {
    const depositRes = await request(app)
      .post('/api/v1/transactions/receive')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        amount: 25000,
        sender: { name: 'Infosys Salary Account', accountNumber: '3009778899', bank: 'ICICI Bank' },
        channel: 'upi',
        description: 'Monthly consulting retainer'
      });

    expect(depositRes.statusCode).toBe(200);
    expect(depositRes.body.success).toBe(true);
    expect(depositRes.body.data.transaction).toBeDefined();

    inboundTxId = depositRes.body.data.transaction._id;

    // Verify persistence in MongoDB
    const savedDeposit = await Transaction.findById(inboundTxId);
    expect(savedDeposit).not.toBeNull();
    expect(savedDeposit.amount).toBe(25000);
    expect(savedDeposit.type).toBe('deposit');
    expect(savedDeposit.status).toBe('approved');
    expect(savedDeposit.riskAssessmentId).toBeDefined();

    // Verify customer balance reflects credit (97500 + 25000 = 122500)
    const updatedCust = await Customer.findById(customerProfile._id);
    expect(updatedCust.balance).toBe(122500);
  });

  test('6. Transaction History: Retrieves both inbound and outbound persisted records', async () => {
    const histRes = await request(app)
      .get('/api/v1/transactions/my')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(histRes.statusCode).toBe(200);
    expect(histRes.body.success).toBe(true);
    expect(histRes.body.data.transactions.length).toBe(2);

    const txIds = histRes.body.data.transactions.map((t) => t._id.toString());
    expect(txIds).toContain(outboundTxId.toString());
    expect(txIds).toContain(inboundTxId.toString());
  });

  test('7. Browser Refresh Simulation: Re-querying history endpoint preserves complete state', async () => {
    // Query 1
    const res1 = await request(app)
      .get('/api/v1/transactions/my')
      .set('Authorization', `Bearer ${customerToken}`);

    // Query 2
    const res2 = await request(app)
      .get('/api/v1/transactions/my')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res1.body.data.transactions.length).toBe(res2.body.data.transactions.length);
    expect(res2.body.data.balance).toBe(122500);
  });

  test('8. Filter Verification: Type and risk filters work on persisted data', async () => {
    // Filter by deposit
    const depRes = await request(app)
      .get('/api/v1/transactions/my?type=deposit')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(depRes.statusCode).toBe(200);
    expect(depRes.body.data.transactions.length).toBe(1);
    expect(depRes.body.data.transactions[0].type).toBe('deposit');

    // Filter by transfer
    const trRes = await request(app)
      .get('/api/v1/transactions/my?type=transfer')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(trRes.statusCode).toBe(200);
    expect(trRes.body.data.transactions.length).toBe(1);
    expect(trRes.body.data.transactions[0].type).toBe('transfer');
  });

  // ==========================================
  // 3. SERVER RESTART & TRANSACTION HISTORY PERSISTENCE
  // ==========================================
  test('9. Server Restart: Transactions and balance persist across database disconnect/reconnect', async () => {
    // Disconnect
    await mongoose.disconnect();
    expect(mongoose.connection.readyState).toBe(0);

    // Reconnect
    await connectDB();
    expect(mongoose.connection.readyState).toBe(1);

    // Re-query transaction history
    const histResAfter = await request(app)
      .get('/api/v1/transactions/my')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(histResAfter.statusCode).toBe(200);
    expect(histResAfter.body.data.transactions.length).toBe(2);
    expect(histResAfter.body.data.balance).toBe(122500);
  });

  // ==========================================
  // 4. IDENTITY VERIFICATION PERSISTENCE
  // ==========================================
  test('10. Identity Verification: Record is saved in MongoDB and retrieved via /me', async () => {
    const submitRes = await request(app)
      .post('/api/v1/identity/submit')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        documentType: 'aadhaar',
        documentNumber: '999988887777',
        fullName: 'Kavita Sundaram',
        dateOfBirth: '1995-05-15'
      });

    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.body.success).toBe(true);

    // Verify record in MongoDB
    const idRecord = await IdentityVerification.findOne({ userId: customerUser._id });
    expect(idRecord).not.toBeNull();
    expect(idRecord.documentType).toBe('aadhaar');
    expect(idRecord.authenticityScore).toBeDefined();

    // Verify GET /me returns the persisted record
    const meRes = await request(app)
      .get('/api/v1/identity/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(meRes.statusCode).toBe(200);
    expect(meRes.body.data).not.toBeNull();
    expect(meRes.body.data.documentType).toBe('aadhaar');
  });

  // ==========================================
  // 5. FRAUD ANALYST CASE ASSIGNMENT PERSISTENCE
  // ==========================================
  test('11. Fraud Alerts and Analyst Assignments: Persisted in MongoDB', async () => {
    const passwordHash = await hashPassword('Password@123');
    analystUser = await User.create({
      fullName: 'Sanjay Kumar (Analyst)',
      email: 'sanjay.analyst@deepshield.ai',
      phone: '+919870002233',
      passwordHash,
      role: 'fraudAnalyst',
      status: 'active'
    });

    analystToken = generateAccessToken({
      id: analystUser._id,
      email: analystUser.email,
      role: analystUser.role,
      fullName: analystUser.fullName
    });

    const alert = await FraudAlert.create({
      alertNumber: 'FA-2026-888999',
      userId: customerUser._id,
      alertType: 'transactionFraud',
      severity: 'high',
      riskScore: 88,
      status: 'open',
      summary: 'Suspicious transaction flagged for analyst assignment'
    });

    // Analyst claims case
    const assignRes = await request(app)
      .patch(`/api/v1/alerts/${alert._id}/assign`)
      .set('Authorization', `Bearer ${analystToken}`);

    expect(assignRes.statusCode).toBe(200);
    expect(assignRes.body.success).toBe(true);

    // Verify MongoDB persistence
    const savedAlert = await FraudAlert.findById(alert._id);
    expect(savedAlert.assignedTo.toString()).toBe(analystUser._id.toString());
    expect(savedAlert.status).toBe('underInvestigation');

    const savedInv = await Investigation.findOne({ alertId: alert._id });
    expect(savedInv).not.toBeNull();
    expect(savedInv.assignedTo.toString()).toBe(analystUser._id.toString());

    // Verify Analyst My Status retrieves the case
    const myStatusRes = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analystToken}`);

    expect(myStatusRes.statusCode).toBe(200);
    expect(myStatusRes.body.data.length).toBe(1);
    expect(myStatusRes.body.data[0]._id.toString()).toBe(alert._id.toString());
  });

  // ==========================================
  // 6. NOTIFICATIONS PERSISTENCE
  // ==========================================
  test('12. In-App Notifications: Stored in MongoDB and marked as read', async () => {
    const notif = await Notification.create({
      userId: customerUser._id,
      type: 'systemUpdate',
      title: 'Transfer Complete',
      message: '₹8,000 sent to Apollo Pharmacy',
      status: 'queued'
    });

    // Retrieve notifications
    const getRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.data.notifications.length).toBeGreaterThanOrEqual(1);

    // Mark as read
    const readRes = await request(app)
      .patch(`/api/v1/notifications/${notif._id}/read`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(readRes.statusCode).toBe(200);
    expect(readRes.body.data.status).toBe('read');

    // Confirm read status in MongoDB
    const checkNotif = await Notification.findById(notif._id);
    expect(checkNotif.status).toBe('read');
  });

  // ==========================================
  // 7. USER ISOLATION & DATA SECURITY
  // ==========================================
  test('13. User Isolation: Customer B cannot see Customer A transactions', async () => {
    const passHash = await hashPassword('Password@123');
    const customerB = await User.create({
      fullName: 'Customer B',
      email: 'customer.b@deepshield.ai',
      phone: '+919870009999',
      passwordHash: passHash,
      role: 'customer',
      status: 'active'
    });

    await Customer.create({
      userId: customerB._id,
      accountNumber: '300999887766',
      balance: 50000,
      currency: 'INR'
    });

    const tokenB = generateAccessToken({
      id: customerB._id,
      email: customerB.email,
      role: customerB.role,
      fullName: customerB.fullName
    });

    const bRes = await request(app)
      .get('/api/v1/transactions/my')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(bRes.statusCode).toBe(200);
    // Customer B has no transactions
    expect(bRes.body.data.transactions).toEqual([]);
    expect(bRes.body.data.balance).toBe(50000);
  });
});
