const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const IdentityVerification = require('../src/models/identityverifications.model');
const { connectDB } = require('../src/config/db');
const {
  validateAadhaar,
  validatePAN,
  validatePassport,
  validateDocumentNumber
} = require('../src/utils/documentValidation.utils');
const {
  analyzeDocumentAuthenticity,
  hashSaltedDocumentNumber
} = require('../src/engine/documentAuthenticity.engine');
const { generateAccessToken, hashPassword } = require('../src/utils/crypto.utils');

jest.setTimeout(30000);

describe('Identity Verification Module - Format Validation & Scoring Tests', () => {
  let customerToken = null;
  let customerUser = null;
  let customerProfile = null;

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({ email: 'identity_test_user@deepshield.ai' });
    await Customer.deleteMany({ accountNumber: '990011223344' });

    const passwordHash = await hashPassword('Password@123');
    customerUser = await User.create({
      fullName: 'Rajesh Kumar',
      email: 'identity_test_user@deepshield.ai',
      phone: '+919876543210',
      passwordHash,
      role: 'customer',
      status: 'active'
    });

    customerProfile = await Customer.create({
      userId: customerUser._id,
      accountNumber: '990011223344',
      phone: '+919876543210',
      balance: 50000,
      riskScore: 10,
      verified: false
    });

    customerToken = generateAccessToken({
      id: customerUser._id,
      email: customerUser.email,
      role: customerUser.role,
      fullName: customerUser.fullName
    });
  });

  afterAll(async () => {
    await IdentityVerification.deleteMany({ userId: customerUser?._id });
    await Customer.deleteMany({ _id: customerProfile?._id });
    await User.deleteMany({ _id: customerUser?._id });
  });

  // ==========================================
  // 1. Aadhaar Validation Tests
  // ==========================================
  describe('1. Aadhaar Validation Tests', () => {
    test('Case 1: Empty document number — reject', () => {
      const res = validateAadhaar('');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });

    test('Case 2: Whitespace-only document number — reject', () => {
      const res = validateAadhaar('   ');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });

    test('Case 3: Eleven numeric digits — reject', () => {
      const res = validateAadhaar('99998888777');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });

    test('Case 4: Twelve numeric digits — pass the format check', () => {
      const res = validateAadhaar('999988887777');
      expect(res.isValid).toBe(true);
      expect(res.cleanedDocNum).toBe('999988887777');
    });

    test('Case 5: Thirteen numeric digits — reject', () => {
      const res = validateAadhaar('9999888877777');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });

    test('Case 6: Letters mixed with digits — reject', () => {
      const res = validateAadhaar('99998888777A');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });

    test('Case 7: Special characters — reject', () => {
      const res = validateAadhaar('9999-8888-777');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });

    test('Case 8: Leading or trailing whitespace — trimmed cleanly without altering digits', () => {
      const res = validateAadhaar('   999988887777   ');
      expect(res.isValid).toBe(true);
      expect(res.cleanedDocNum).toBe('999988887777');
    });

    test('Case 9: Internal spaces — strictly rejected (never silently stripped)', () => {
      const res = validateAadhaar('9999 8888 7777');
      expect(res.isValid).toBe(false);
      expect(res.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });

    test('Case 10: Direct backend request containing an invalid 11-digit Aadhaar — reject with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/identity/submit')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          documentType: 'aadhaar',
          documentNumber: '99998888777', // 11 digits
          fullName: 'Rajesh Kumar',
          dateOfBirth: '1995-05-15'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorType).toBe('INVALID_DOCUMENT_FORMAT');
      expect(res.body.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });
  });

  // ==========================================
  // 2. PAN Validation Tests
  // ==========================================
  describe('2. PAN Validation Tests', () => {
    test('Case 1: Correctly formatted input — pass the format check', () => {
      const res = validatePAN('ABCDE1234F');
      expect(res.isValid).toBe(true);
      expect(res.cleanedDocNum).toBe('ABCDE1234F');
    });

    test('Case 2: Incorrectly structured input — reject', () => {
      const res = validatePAN('ABCD12345F'); // 4 letters + 5 digits
      expect(res.isValid).toBe(false);
      expect(res.message).toContain('PAN must be 10 characters');
    });

    test('Case 3: Empty input — reject', () => {
      const res = validatePAN('');
      expect(res.isValid).toBe(false);
    });

    test('Case 4: Unsupported characters or internal spaces — reject', () => {
      const res1 = validatePAN('ABCDE 1234F');
      expect(res1.isValid).toBe(false);

      const res2 = validatePAN('ABCDE1234#');
      expect(res2.isValid).toBe(false);
    });
  });

  // ==========================================
  // 3. Passport Validation Tests
  // ==========================================
  describe('3. Passport Validation Tests', () => {
    test('Case 1: Valid input for supported passport format — pass the format check', () => {
      const res = validatePassport('A1234567');
      expect(res.isValid).toBe(true);
      expect(res.cleanedDocNum).toBe('A1234567');
    });

    test('Case 2: Invalid structure — reject', () => {
      const res = validatePassport('12345678'); // Missing leading letter
      expect(res.isValid).toBe(false);
      expect(res.message).toContain('Passport number must contain 1 letter');
    });

    test('Case 3: Empty input — reject', () => {
      const res = validatePassport('');
      expect(res.isValid).toBe(false);
    });

    test('Case 4: Invalid length or internal spaces — reject', () => {
      const res1 = validatePassport('A12345'); // Too short
      expect(res1.isValid).toBe(false);

      const res2 = validatePassport('A 123456');
      expect(res2.isValid).toBe(false);
    });
  });

  // ==========================================
  // 4. Scoring and Integration Pipeline Tests
  // ==========================================
  describe('4. Scoring and Integration Pipeline Tests', () => {
    test('Case 1: An 11-digit Aadhaar number must not receive a normal authenticity score (null score, invalid verdict)', async () => {
      const result = await analyzeDocumentAuthenticity({
        docType: 'aadhaar',
        docNum: '99998888777',
        extractedName: 'Rajesh Kumar',
        customerProfile
      });

      expect(result.verdict).toBe('invalid');
      expect(result.authenticityScore).toBeNull();
      expect(result.ocrChecks.formatValid).toBe(false);
    });

    test('Case 2: Direct backend request with 11-digit Aadhaar returns 400 and stops before scoring', async () => {
      const initialCount = await IdentityVerification.countDocuments({ userId: customerUser._id });

      const res = await request(app)
        .post('/api/v1/identity/submit')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          documentType: 'aadhaar',
          documentNumber: '99998888777',
          fullName: 'Rajesh Kumar',
          dateOfBirth: '1995-05-15'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);

      // Verify no record was created in the database
      const finalCount = await IdentityVerification.countDocuments({ userId: customerUser._id });
      expect(finalCount).toBe(initialCount);
    });

    test('Case 3: Invalid input must not be saved as a successfully verified identity', async () => {
      const records = await IdentityVerification.find({
        userId: customerUser._id,
        documentType: 'aadhaar',
        documentNumberMasked: /777$/
      });
      expect(records.length).toBe(0);
    });

    test('Case 4: A valid-format Aadhaar (12 digits) proceeds through verification workflow', async () => {
      const validAadhaar = '999988887777';
      const res = await request(app)
        .post('/api/v1/identity/submit')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          documentType: 'aadhaar',
          documentNumber: validAadhaar,
          fullName: 'Rajesh Kumar',
          dateOfBirth: '1995-05-15'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.documentNumberMasked).toBe('XXXX-XXXX-7777');
      expect(res.body.data.authenticityScore).toBeDefined();
      expect(res.body.data.ocrChecks.formatValid).toBe(true);
    });

    test('Case 5: Duplicate detection continues working for valid-format submissions', async () => {
      const dupAadhaar = '999988887777';
      // Attempting to submit the same verified document again
      const res = await request(app)
        .post('/api/v1/identity/submit')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          documentType: 'aadhaar',
          documentNumber: dupAadhaar,
          fullName: 'Rajesh Kumar',
          dateOfBirth: '1995-05-15'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Duplicate document rejection');
    });

    test('Case 6: Direct backend request with valid PAN proceeds through verification', async () => {
      const res = await request(app)
        .post('/api/v1/identity/submit')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          documentType: 'pan',
          documentNumber: 'ABCDE1234F',
          fullName: 'Rajesh Kumar',
          dateOfBirth: '1995-05-15'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.documentType).toBe('pan');
      expect(res.body.data.ocrChecks.formatValid).toBe(true);
    });

    test('Case 7: Direct backend request with invalid PAN is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/v1/identity/submit')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          documentType: 'pan',
          documentNumber: 'INVALID_PAN',
          fullName: 'Rajesh Kumar',
          dateOfBirth: '1995-05-15'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorType).toBe('INVALID_DOCUMENT_FORMAT');
    });

    test('Case 8: Direct backend request with 13-digit Aadhaar is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/v1/identity/submit')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          documentType: 'aadhaar',
          documentNumber: '1234567890123',
          fullName: 'Rajesh Kumar',
          dateOfBirth: '1995-05-15'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Aadhaar number must contain exactly 12 digits.');
    });
  });
});
