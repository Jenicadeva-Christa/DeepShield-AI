const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const IdentityVerification = require('../src/models/identityverifications.model');
const DetectionResult = require('../src/models/detectionresults.model');
const MediaUpload = require('../src/models/mediauploads.model');
const { connectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword, encryptText } = require('../src/utils/crypto.utils');
const { analyzeTextPhishing } = require('../src/engine/textPhishing.engine');
const { analyzeDocumentAuthenticity, hashSaltedDocumentNumber } = require('../src/engine/documentAuthenticity.engine');

jest.setTimeout(60000);

let customerToken = null;
let customerUser = null;
let customerProfile = null;

beforeAll(async () => {
  await connectDB();
  await User.deleteMany({});
  await Customer.deleteMany({});
  // Use direct collection access to bypass audit-log immutability hooks on other models
  await IdentityVerification.deleteMany({});
  await DetectionResult.deleteMany({});
  await MediaUpload.deleteMany({});

  const passwordHash = await hashPassword('Password@123');
  customerUser = await User.create({
    fullName: 'Amrita Patel',
    email: 'spiral3tester@deepshield.ai',
    phone: '+919988776655',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  customerProfile = await Customer.create({
    userId: customerUser._id,
    accountNumber: '400111222333',
    balance: 250000,
    currency: 'INR',
    address: encryptText('Bengaluru, India'),
    baseline: {
      averageAmount: 8000,
      stdAmount: 3000,
      usualHours: [10, 15, 19],
      usualCities: ['Bengaluru'],
      knownDeviceIds: ['DEV-S3-01'],
      knownPayees: []
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

describe('Spiral 3: Multi-Modal Detection & Identity Verification Tests', () => {

  test('1. Text Phishing engine classifies known phishing message as suspicious or malicious (FR-9.1)', async () => {
    const phishingText =
      'URGENT: Your HDFC account is suspended. Share your OTP and PIN with our agent on 9000000001 or click http://hdfc-verify-secure.ml/login to restore access immediately.';

    const result = await analyzeTextPhishing(phishingText);

    expect(result).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(['suspicious', 'malicious']).toContain(result.verdict);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(30);
    expect(result.confidence).toBeLessThanOrEqual(0.90); // Section 9.1 confidence cap
    expect(Array.isArray(result.indicators)).toBe(true);
    expect(result.indicators.length).toBeGreaterThan(0);
    console.log(`[Spiral 3 T1] Phishing verdict: ${result.verdict}, score: ${result.score}, confidence: ${result.confidence}`);
  });

  test('2. Text Phishing engine classifies a legitimate bank SMS as safe or low-risk (FR-9.1)', async () => {
    const legitimateText =
      'Dear Customer, your SBI account 1234XXXX5678 has been credited with INR 10,000 on 19-Sep-2026. Available balance: INR 85,000. -SBI';

    const result = await analyzeTextPhishing(legitimateText);

    expect(result).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(result.confidence).toBeLessThanOrEqual(0.90);
    expect(typeof result.score).toBe('number');
    console.log(`[Spiral 3 T2] Legitimate SMS verdict: ${result.verdict}, score: ${result.score}`);
    // Legitimate messages should have low fraud score (below malicious threshold)
    expect(result.score).toBeLessThan(70);
  });

  test('3. Text Detection API endpoint screens a phishing message and returns 200 with verdict (FR-9.1)', async () => {
    const res = await request(app)
      .post('/api/v1/detect/text')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        textContent: 'Congratulations! You have won INR 1,00,000 lottery. Call 9999888777 and share OTP for immediate credit to your account.',
        purpose: 'textMessage'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.detection).toBeDefined();
    expect(res.body.data.detection.verdict).toBeDefined();
    expect(['safe', 'suspicious', 'malicious']).toContain(res.body.data.detection.verdict);
    expect(res.body.data.detection.confidence).toBeLessThanOrEqual(0.90);
    console.log(`[Spiral 3 T3] API phishing verdict: ${res.body.data.detection.verdict}`);
  });

  test('4. Document Authenticity engine rejects duplicate document (same hash) as malicious (FR-4.2.5)', async () => {
    const dupDocNum = '234567891234'; // Valid Aadhaar: 12 digits, starts 2-9
    const docHash = hashSaltedDocumentNumber(dupDocNum);

    // Pre-seed a verified identity with this document hash in the DB
    await IdentityVerification.create({
      customerId: customerProfile._id,
      userId: customerUser._id,
      documentType: 'aadhaar',
      documentNumberMasked: `XXXX-XXXX-${dupDocNum.slice(-4)}`,
      documentNumberHash: docHash,
      verificationStatus: 'verified',
      verificationMethod: 'document'
    });

    // Now attempt to analyse the same document number (should flag as duplicate)
    const result = await analyzeDocumentAuthenticity({
      docType: 'aadhaar',
      docNum: dupDocNum,
      extractedName: 'Another Person',
      customerProfile: customerProfile
    });

    expect(result).toBeDefined();
    expect(result.isDuplicate).toBe(true);
    expect(result.verdict).toEqual('malicious');
    expect(result.authenticityScore).toBeLessThan(40);
    console.log(`[Spiral 3 T4] Duplicate doc verdict: ${result.verdict}, isDuplicate: ${result.isDuplicate}`);
  });

  test('5. Identity Verification API creates a KYC record for a fresh valid Aadhaar (FR-4.2)', async () => {
    const res = await request(app)
      .post('/api/v1/identity/submit')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        documentType: 'aadhaar',
        documentNumber: '987654321098', // different from the duplicate hash in test 4
        fullName: 'Amrita Patel',
        dateOfBirth: '1992-04-15'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    // submitIdentity returns { data: verificationDocument }
    const identity = res.body.data;
    expect(identity).toBeDefined();
    expect(identity.documentType).toEqual('aadhaar');
    expect(['pending', 'verified', 'needsReview']).toContain(identity.verificationStatus);
    console.log(`[Spiral 3 T5] KYC submission status: ${identity.verificationStatus}`);
  });

});
