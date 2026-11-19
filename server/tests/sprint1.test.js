const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const AuditLog = require('../src/models/auditlogs.model');
const { connectDB } = require('../src/config/db');
const { verifyAuditChain } = require('../src/middleware/audit.middleware');

jest.setTimeout(30000);

beforeAll(async () => {
  await connectDB();
  await User.deleteMany({});
  await Customer.deleteMany({});
  if (AuditLog.collection) {
    await AuditLog.collection.deleteMany({});
  }
});

afterAll(async () => {
  const mongoose = require('mongoose');
  await mongoose.disconnect();
});

describe('Agile Sprint 1: Foundation, Secure Access & Audit Infrastructure (User Stories US-1.1 - US-1.3)', () => {
  let testUserId = null;
  let testOtpCode = null;

  test('US-1.1: Customer Self-Registration & Baseline Profile Provisioning', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Agile Sprint Customer',
        email: 'agilecustomer@deepshield.ai',
        phone: '+919999900000',
        password: 'Password@123',
        address: '123 Sprint Lane, Mumbai',
        dateOfBirth: '1995-01-01',
        gender: 'Male',
        idProofType: 'Aadhaar'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBeDefined();

    testUserId = res.body.data.userId;
    testOtpCode = res.body.data.devOtp;
  });

  test('US-1.2: Brute-Force Defense & Automated 15-Minute Account Lockout', async () => {
    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'agilecustomer@deepshield.ai', password: 'WrongPassword' });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toContain('Invalid password');
    }

    const res5 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'agilecustomer@deepshield.ai', password: 'WrongPassword' });

    expect(res5.statusCode).toEqual(403);
    expect(res5.body.message).toContain('locked');

    const user = await User.findById(testUserId);
    expect(user.status).toEqual('locked');
  });

  test('US-1.3: Cryptographic SHA-256 Tamper-Evident Audit Chain Integrity', async () => {
    const verification = await verifyAuditChain();
    expect(verification.verified).toBe(true);
    expect(verification.totalLogs).toBeGreaterThan(0);
  });
});
