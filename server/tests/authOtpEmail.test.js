const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const StaffProfile = require('../src/models/staffprofiles.model');
const Otp = require('../src/models/otps.model');
const emailService = require('../src/services/email.service');
const { hashPassword, hashSHA256 } = require('../src/utils/crypto.utils');
const { connectDB, disconnectDB } = require('../src/config/db');

describe('DeepShield AI - Email OTP Authentication Workflow Test Suite', () => {
  let customerUser;
  let analystUser;
  let adminUser;
  let sentMails = [];
  let sendEmailSpy;

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
    await Customer.deleteMany({});
    await StaffProfile.deleteMany({});
    await Otp.deleteMany({});

    // Spy on emailService.sendOtpEmail to capture dispatched emails in memory
    sendEmailSpy = jest.spyOn(emailService, 'sendOtpEmail').mockImplementation(async (params) => {
      sentMails.push(params);
      const masked = emailService.maskEmail(params.to);
      return { success: true, messageId: `msg-${Date.now()}`, maskedEmail: masked };
    });

    // Seed test users
    const defaultPasswordHash = await hashPassword('Password@123');

    customerUser = await User.create({
      fullName: 'Cyber Customer',
      email: 'cybercustomer@deepshield.ai',
      phone: '+919876543210',
      passwordHash: defaultPasswordHash,
      role: 'customer',
      status: 'active'
    });
    await Customer.create({
      userId: customerUser._id,
      accountNumber: '300998765432',
      balance: 100000,
      currency: 'INR'
    });

    analystUser = await User.create({
      fullName: 'Security Analyst',
      email: 'secanalyst@deepshield.ai',
      phone: '+919876543211',
      passwordHash: defaultPasswordHash,
      role: 'fraudAnalyst',
      status: 'active'
    });
    await StaffProfile.create({
      userId: analystUser._id,
      department: 'Fraud Operations',
      employeeId: 'EMP-FA-991'
    });

    adminUser = await User.create({
      fullName: 'Chief Admin',
      email: 'chiefadmin@deepshield.ai',
      phone: '+919876543212',
      passwordHash: defaultPasswordHash,
      role: 'administrator',
      status: 'active'
    });
    await StaffProfile.create({
      userId: adminUser._id,
      department: 'Security Governance',
      employeeId: 'EMP-ADM-001'
    });
  });

  afterAll(async () => {
    if (sendEmailSpy) sendEmailSpy.mockRestore();
    await disconnectDB();
  });

  beforeEach(async () => {
    sentMails = [];
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------
  // Test 1: Valid credentials result in an email OTP
  // -------------------------------------------------------------
  test('1. Valid login credentials trigger email OTP dispatch to verified address', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(customerUser._id.toString());
    expect(res.body.data.sessionId).toBeDefined();
    expect(res.body.data.maskedEmail).toBe('c***********r@deepshield.ai');

    // Confirm email dispatch was invoked with correct parameters
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sentMails.length).toBe(1);
    expect(sentMails[0].to).toBe('cybercustomer@deepshield.ai');
    expect(sentMails[0].purpose).toBe('login');
    expect(sentMails[0].otpCode).toMatch(/^\d{6}$/);

    // Confirm OTP is stored as a SHA-256 hash in MongoDB
    const otpDoc = await Otp.findOne({ userId: customerUser._id, consumed: false });
    expect(otpDoc).toBeTruthy();
    expect(otpDoc.codeHash).toBe(hashSHA256(sentMails[0].otpCode));
    expect(otpDoc.sessionId).toBe(res.body.data.sessionId);
  });

  // -------------------------------------------------------------
  // Test 2: The correct OTP completes authentication
  // -------------------------------------------------------------
  test('2. The correct OTP completes authentication and returns JWT tokens', async () => {
    // Initiate login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    const { userId, sessionId } = loginRes.body.data;
    const dispatchedOtp = sentMails[0].otpCode;

    // Verify OTP
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId, otpCode: dispatchedOtp, sessionId });

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.accessToken).toBeDefined();
    expect(verifyRes.body.data.user.email).toBe('cybercustomer@deepshield.ai');
    expect(verifyRes.body.data.user.role).toBe('customer');

    // Verify OTP was consumed
    const updatedOtp = await Otp.findOne({ sessionId });
    expect(updatedOtp.consumed).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 3: An incorrect OTP is rejected
  // -------------------------------------------------------------
  test('3. An incorrect OTP is rejected with 400 and increments attempt count', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    const { userId, sessionId } = loginRes.body.data;

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId, otpCode: '000000', sessionId });

    expect(verifyRes.statusCode).toBe(400);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.message).toContain('Invalid OTP code. Attempt 1 of 3');

    const otpDoc = await Otp.findOne({ sessionId });
    expect(otpDoc.attempts).toBe(1);
    expect(otpDoc.consumed).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 4: An expired OTP is rejected
  // -------------------------------------------------------------
  test('4. An expired OTP is rejected', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    const { userId, sessionId } = loginRes.body.data;
    const dispatchedOtp = sentMails[0].otpCode;

    // Fast-forward OTP expiration in MongoDB
    await Otp.updateOne({ sessionId }, { expiresAt: new Date(Date.now() - 1000) });

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId, otpCode: dispatchedOtp, sessionId });

    expect(verifyRes.statusCode).toBe(400);
    expect(verifyRes.body.message).toContain('expired');
  });

  // -------------------------------------------------------------
  // Test 5: Repeated incorrect attempts are limited (lockout)
  // -------------------------------------------------------------
  test('5. Repeated incorrect attempts (max 3) lock the OTP attempt', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    const { userId, sessionId } = loginRes.body.data;
    const validOtp = sentMails[0].otpCode;

    // Fail 3 times
    for (let i = 1; i <= 3; i++) {
      const res = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ userId, otpCode: '999999', sessionId });
      expect(res.statusCode).toBe(400);
    }

    // 4th attempt with the valid OTP is rejected because attempts >= 3
    const fourthRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId, otpCode: validOtp, sessionId });

    expect(fourthRes.statusCode).toBe(400);
    expect(fourthRes.body.message).toContain('Maximum 3 invalid OTP attempts reached');
  });

  // -------------------------------------------------------------
  // Test 6: Resending an OTP invalidates the older code
  // -------------------------------------------------------------
  test('6. Resending an OTP invalidates older code and enforces cooldown', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    const { userId, sessionId } = loginRes.body.data;
    const firstOtp = sentMails[0].otpCode;

    // Clear cooldown window for testing resend by updating raw MongoDB createdAt
    await Otp.collection.updateMany(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: { createdAt: new Date(Date.now() - 35 * 1000) } }
    );

    const resendRes = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ userId, purpose: 'login', sessionId });

    expect(resendRes.statusCode).toBe(200);
    expect(resendRes.body.success).toBe(true);

    const secondOtp = sentMails[1].otpCode;
    expect(secondOtp).not.toBe(firstOtp);

    // Attempting to verify the first OTP should now fail because older OTP was consumed/invalidated
    const tryFirstOtp = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId, otpCode: firstOtp, sessionId });
    expect(tryFirstOtp.statusCode).toBe(400);

    // Verifying the second OTP should succeed
    const trySecondOtp = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ userId, otpCode: secondOtp, sessionId });
    expect(trySecondOtp.statusCode).toBe(200);
    expect(trySecondOtp.body.success).toBe(true);

    // Testing cooldown: rapid resend should be blocked with 429
    const rapidResend = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ userId, purpose: 'login' });
    expect(rapidResend.statusCode).toBe(429);
    expect(rapidResend.body.message).toContain('Please wait');
  });

  // -------------------------------------------------------------
  // Test 7: SMTP delivery failure does not grant access
  // -------------------------------------------------------------
  test('7. SMTP delivery failure aborts login and does not permit authentication', async () => {
    // Force email service to simulate delivery error (e.g. SMTP connection down / auth failed)
    sendEmailSpy.mockImplementationOnce(async () => {
      throw new Error('SMTP connection timed out');
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    expect(loginRes.statusCode).toBe(500);
    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.message).toContain('Unable to deliver verification code');

    // Confirm no valid unconsumed OTP was left active
    const activeOtps = await Otp.find({ userId: customerUser._id, consumed: false });
    expect(activeOtps.length).toBe(0);
  });

  // -------------------------------------------------------------
  // Test 8: No OTP is exposed in the terminal or API response
  // -------------------------------------------------------------
  test('8. No OTP code or secret is exposed in API responses', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cybercustomer@deepshield.ai', password: 'Password@123' });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.data.devOtp).toBeUndefined();
    expect(loginRes.body.data.otpCode).toBeUndefined();
    expect(JSON.stringify(loginRes.body)).not.toContain(sentMails[0].otpCode);
  });

  // -------------------------------------------------------------
  // Test 9: Customer, analyst, and admin login flows all work
  // -------------------------------------------------------------
  test('9. Customer, fraud analyst, and admin flows work with proper role payloads', async () => {
    // Analyst
    const analystLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'secanalyst@deepshield.ai', password: 'Password@123' });
    expect(analystLogin.statusCode).toBe(200);
    const analystOtp = sentMails[0].otpCode;
    const analystVerify = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        userId: analystLogin.body.data.userId,
        otpCode: analystOtp,
        sessionId: analystLogin.body.data.sessionId
      });
    expect(analystVerify.statusCode).toBe(200);
    expect(analystVerify.body.data.user.role).toBe('fraudAnalyst');
    expect(analystVerify.body.data.user.staffProfile).toBeDefined();

    // Admin
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'chiefadmin@deepshield.ai', password: 'Password@123' });
    expect(adminLogin.statusCode).toBe(200);
    const adminOtp = sentMails[1].otpCode;
    const adminVerify = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        userId: adminLogin.body.data.userId,
        otpCode: adminOtp,
        sessionId: adminLogin.body.data.sessionId
      });
    expect(adminVerify.statusCode).toBe(200);
    expect(adminVerify.body.data.user.role).toBe('administrator');
  });

  // -------------------------------------------------------------
  // Test 10: JWT authentication and protected routes work
  // -------------------------------------------------------------
  test('10. JWT authentication and protected /auth/me route function securely', async () => {
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'chiefadmin@deepshield.ai', password: 'Password@123' });
    const adminOtp = sentMails[0].otpCode;
    const adminVerify = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        userId: adminLogin.body.data.userId,
        otpCode: adminOtp,
        sessionId: adminLogin.body.data.sessionId
      });

    const token = adminVerify.body.data.accessToken;

    // Test protected route
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.statusCode).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.email).toBe('chiefadmin@deepshield.ai');
    expect(meRes.body.data.role).toBe('administrator');

    // Test with invalid token
    const invalidRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid_tampered_token');

    expect(invalidRes.statusCode).toBe(401);
  });
});
