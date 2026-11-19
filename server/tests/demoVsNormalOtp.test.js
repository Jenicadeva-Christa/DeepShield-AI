const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const StaffProfile = require('../src/models/staffprofiles.model');
const Transaction = require('../src/models/transactions.model');
const Otp = require('../src/models/otps.model');
const emailService = require('../src/services/email.service');
const { hashPassword, hashSHA256 } = require('../src/utils/crypto.utils');
const { connectDB, disconnectDB } = require('../src/config/db');

describe('DeepShield AI - Demo Accounts vs Normal User Email OTP Separation', () => {
  let sendEmailSpy;
  let sentMails = [];
  let consoleSpy;
  let consoleLogs = [];

  const DEMO_EMAILS = [
    { email: 'customer1@deepshield.ai', password: 'Password@123', role: 'customer' },
    { email: 'customer2@deepshield.ai', password: 'Password@123', role: 'customer' },
    { email: 'customer3@deepshield.ai', password: 'Password@123', role: 'customer' },
    { email: 'analyst1@deepshield.ai', password: 'Password@123', role: 'fraudAnalyst' },
    { email: 'analyst2@deepshield.ai', password: 'Password@123', role: 'fraudAnalyst' },
    { email: 'admin@deepshield.ai', password: 'Admin@123', role: 'administrator' }
  ];

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
    await Customer.deleteMany({});
    await StaffProfile.deleteMany({});
    await Transaction.deleteMany({});
    await Otp.deleteMany({});

    // Spy on emailService.sendOtpEmail
    sendEmailSpy = jest.spyOn(emailService, 'sendOtpEmail').mockImplementation(async (params) => {
      sentMails.push(params);
      return { success: true, messageId: `msg-${Date.now()}` };
    });

    // Spy on console.log to inspect terminal output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLogs.push(args.join(' '));
    });

    // Seed the 6 predefined demo accounts
    const commonHash = await hashPassword('Password@123');
    const adminHash = await hashPassword('Admin@123');

    // Admin
    const adminUser = await User.create({
      fullName: 'System Administrator',
      email: 'admin@deepshield.ai',
      phone: '+919876543210',
      passwordHash: adminHash,
      role: 'administrator',
      status: 'active'
    });
    await StaffProfile.create({ userId: adminUser._id, employeeId: 'EMP-ADM-001', department: 'Administration' });

    // Analysts
    const analyst1User = await User.create({
      fullName: 'Lead Analyst',
      email: 'analyst1@deepshield.ai',
      phone: '+919876543211',
      passwordHash: commonHash,
      role: 'fraudAnalyst',
      status: 'active'
    });
    await StaffProfile.create({ userId: analyst1User._id, employeeId: 'EMP-FA-001', department: 'Fraud Operations' });

    const analyst2User = await User.create({
      fullName: 'Junior Analyst',
      email: 'analyst2@deepshield.ai',
      phone: '+919876543212',
      passwordHash: commonHash,
      role: 'fraudAnalyst',
      status: 'active'
    });
    await StaffProfile.create({ userId: analyst2User._id, employeeId: 'EMP-FA-002', department: 'Fraud Operations' });

    // Customers
    for (let i = 1; i <= 3; i++) {
      const custUser = await User.create({
        fullName: `Customer ${i}`,
        email: `customer${i}@deepshield.ai`,
        phone: `+91987654321${i + 2}`,
        passwordHash: commonHash,
        role: 'customer',
        status: 'active'
      });
      await Customer.create({
        userId: custUser._id,
        accountNumber: `30090000000${i}`,
        balance: 300000,
        currency: 'INR'
      });
    }
  });

  afterAll(async () => {
    if (sendEmailSpy) sendEmailSpy.mockRestore();
    if (consoleSpy) consoleSpy.mockRestore();
    await disconnectDB();
  });

  beforeEach(() => {
    sentMails = [];
    consoleLogs = [];
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Demo Login: All 6 predefined demo accounts log in without email OTP
  // -------------------------------------------------------------------------
  test('1. Each of the six predefined demo accounts logs in without email OTP or email dispatch', async () => {
    for (const demo of DEMO_EMAILS) {
      // Test with slight whitespace / case variations to test normalization
      const variedEmail = `  ${demo.email.toUpperCase()}  `;

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: variedEmail, password: demo.password });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.otpRequired).toBe(false);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.role).toBe(demo.role);
      expect(res.body.data.user.email).toBe(demo.email);

      // Verify NO email was sent
      expect(sendEmailSpy).not.toHaveBeenCalled();
      expect(sentMails.length).toBe(0);

      // Verify NO OTP record was left pending in MongoDB for this user
      const otpCount = await Otp.countDocuments({ userId: res.body.data.user.id, purpose: 'login', consumed: false });
      expect(otpCount).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Demo Account Incorrect Password Protection
  // -------------------------------------------------------------------------
  test('2. Demo account rejects incorrect password and tracks failed attempts', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer1@deepshield.ai', password: 'WrongPassword@999' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Invalid password');
    expect(res.body.data).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 3. Normal User Login Requires Gmail OTP
  // -------------------------------------------------------------------------
  test('3. Non-demo accounts require Gmail email OTP during login and do NOT bypass', async () => {
    // Create a normal registered customer
    const normalPasswordHash = await hashPassword('MyPass@456');
    const normalUser = await User.create({
      fullName: 'Real External Customer',
      email: 'external.user@gmail.com',
      phone: '+919811122233',
      passwordHash: normalPasswordHash,
      role: 'customer',
      status: 'active'
    });
    await Customer.create({
      userId: normalUser._id,
      accountNumber: '300998877112',
      balance: 150000,
      currency: 'INR'
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'external.user@gmail.com', password: 'MyPass@456' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeUndefined(); // Cannot get token yet
    expect(res.body.data.sessionId).toBeDefined();
    expect(res.body.data.maskedEmail).toBe('e***********r@gmail.com');

    // Confirm email was dispatched through emailService
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sentMails.length).toBe(1);
    expect(sentMails[0].to).toBe('external.user@gmail.com');
    expect(sentMails[0].purpose).toBe('login');

    // Verify OTP completes login for normal user
    const otpCode = sentMails[0].otpCode;
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId: normalUser._id, otpCode, sessionId: res.body.data.sessionId });

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.accessToken).toBeDefined();
    expect(verifyRes.body.data.user.email).toBe('external.user@gmail.com');
  });

  // -------------------------------------------------------------------------
  // 4. Registration: Cannot Register or Overwrite Demo Accounts
  // -------------------------------------------------------------------------
  test('4. Registration with any predefined demo account email is blocked', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Imposter Demo',
        email: 'customer1@deepshield.ai',
        phone: '+919999900000',
        password: 'Password@123'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('predefined demo account');
  });

  // -------------------------------------------------------------------------
  // 5. Demo Account Transaction Step-Up: Logs in Terminal, NOT sent via Email
  // -------------------------------------------------------------------------
  test('5. Demo account transaction OTP appears in terminal, is NOT sent to email, and must be entered', async () => {
    // Log in customer1
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer1@deepshield.ai', password: 'Password@123' });
    const token = loginRes.body.data.accessToken;

    // Initiate a transfer that lands in Medium Risk (triggers stepUpAuth)
    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'transfer',
        amount: 15000,
        payee: { name: 'New Unknown Payee', accountNumber: '300977778888', bank: 'SBI', isNew: true },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-DEMO-1', isKnown: true }
      });

    expect(txRes.statusCode).toBe(200);
    expect(txRes.body.data.stepUpRequired).toBe(true);
    expect(txRes.body.data.transaction.status).toBe('pendingStepUp');

    // Confirm NO email was sent to customer1@deepshield.ai
    expect(sendEmailSpy).not.toHaveBeenCalled();

    // Confirm OTP was printed in the backend terminal console
    const terminalOutput = consoleLogs.join('\n');
    expect(terminalOutput).toContain('[DEMO ACCOUNT TRANSACTION STEP-UP]');
    expect(terminalOutput).toContain('[STEP-UP OTP CODE]:');

    // Extract OTP from MongoDB
    const txId = txRes.body.data.transaction._id;
    const otpDoc = await Otp.findOne({ relatedTransactionId: txId, consumed: false });
    expect(otpDoc).toBeTruthy();

    const rawOtp = txRes.body.data.devOtp; // In test mode devOtp is populated for Jest

    // Complete transaction with correct OTP
    const stepUpRes = await request(app)
      .post(`/api/v1/transactions/${txId}/step-up`)
      .set('Authorization', `Bearer ${token}`)
      .send({ otpCode: rawOtp });

    expect(stepUpRes.statusCode).toBe(200);
    expect(stepUpRes.body.success).toBe(true);
    expect(stepUpRes.body.data.transaction.status).toBe('approved');
    expect(stepUpRes.body.data.transaction.stepUp.verified).toBe(true);

    // Verify OTP was consumed
    const consumedOtp = await Otp.findById(otpDoc._id);
    expect(consumedOtp.consumed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Demo Transaction OTP Security: Reused, Expired, and Incorrect Rejection
  // -------------------------------------------------------------------------
  test('6. Expired, incorrect, and reused demo transaction OTPs are rejected', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer2@deepshield.ai', password: 'Password@123' });
    const token = loginRes.body.data.accessToken;

    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'transfer',
        amount: 15000,
        payee: { name: 'Unknown Payee', accountNumber: '300977779999', isNew: true }
      });

    const txId = txRes.body.data.transaction._id;
    const validOtp = txRes.body.data.devOtp;

    // Test A: Incorrect OTP
    const wrongRes = await request(app)
      .post(`/api/v1/transactions/${txId}/step-up`)
      .set('Authorization', `Bearer ${token}`)
      .send({ otpCode: '000000' });
    expect(wrongRes.statusCode).toBe(400);
    expect(wrongRes.body.message).toContain('Invalid OTP code');

    // Test B: Expired OTP
    await Otp.updateOne({ relatedTransactionId: txId }, { expiresAt: new Date(Date.now() - 1000) });
    const expiredRes = await request(app)
      .post(`/api/v1/transactions/${txId}/step-up`)
      .set('Authorization', `Bearer ${token}`)
      .send({ otpCode: validOtp });
    expect(expiredRes.statusCode).toBe(400);
    expect(expiredRes.body.message).toContain('expired');

    // Reset expiry for reuse test
    await Otp.updateOne({ relatedTransactionId: txId }, { expiresAt: new Date(Date.now() + 5 * 60 * 1000) });

    // Successfully verify OTP
    const approveRes = await request(app)
      .post(`/api/v1/transactions/${txId}/step-up`)
      .set('Authorization', `Bearer ${token}`)
      .send({ otpCode: validOtp });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.body.data.transaction.status).toBe('approved');

    // Test C: Reused OTP should be rejected
    const reuseRes = await request(app)
      .post(`/api/v1/transactions/${txId}/step-up`)
      .set('Authorization', `Bearer ${token}`)
      .send({ otpCode: validOtp });
    expect(reuseRes.statusCode).toBe(400);
    expect(reuseRes.body.message).toContain('cannot be verified in current status');
  });

  // -------------------------------------------------------------------------
  // 7. Normal User Transaction OTP: Sent via Email, NOT logged in console
  // -------------------------------------------------------------------------
  test('7. Normal registered user transaction OTP is dispatched via email and NOT printed in console', async () => {
    // Log in external user
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'external.user@gmail.com', password: 'MyPass@456' });
    const sessionId = loginRes.body.data.sessionId;
    const loginOtp = sentMails[0].otpCode;

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId: loginRes.body.data.userId, otpCode: loginOtp, sessionId });
    const normalToken = verifyRes.body.data.accessToken;

    sentMails = [];
    consoleLogs = [];
    sendEmailSpy.mockClear();

    // Trigger step-up transaction for normal user
    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${normalToken}`)
      .send({
        type: 'transfer',
        amount: 15000,
        payee: { name: 'Third Party Payee', accountNumber: '300911223344', isNew: true }
      });

    expect(txRes.statusCode).toBe(200);
    expect(txRes.body.data.stepUpRequired).toBe(true);

    // Verify email was dispatched to external user
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sentMails.length).toBe(1);
    expect(sentMails[0].to).toBe('external.user@gmail.com');
    expect(sentMails[0].purpose).toBe('transactionStepUp');

    // Verify OTP is NOT in the console logs
    const outputLogs = consoleLogs.join('\n');
    expect(outputLogs).not.toContain(sentMails[0].otpCode);
  });
});
