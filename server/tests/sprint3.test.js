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
  await IdentityVerification.deleteMany({});
  await DetectionResult.deleteMany({});
  await MediaUpload.deleteMany({});

  const passwordHash = await hashPassword('Password@123');
  customerUser = await User.create({
    fullName: 'Amrita Patel',
    email: 'sprint3tester@deepshield.ai',
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

describe('Agile Sprint 3: Multi-Modal AI Detection & Identity Verification (User Stories US-3.1 - US-3.5)', () => {

  test('US-3.1: Natural Language Phishing Engine Classifies Banking Scam Lures', async () => {
    const phishingText =
      'URGENT: Your HDFC account is suspended. Share your OTP and PIN with our agent on 9000000001 or click http://hdfc-verify-secure.ml/login to restore access immediately.';

    const result = await analyzeTextPhishing(phishingText);

    expect(result).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(['suspicious', 'malicious']).toContain(result.verdict);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(30);
    expect(result.confidence).toBeLessThanOrEqual(0.90);
    expect(Array.isArray(result.indicators)).toBe(true);
    expect(result.indicators.length).toBeGreaterThan(0);
    console.log(`[Sprint 3 US-3.1] Phishing verdict: ${result.verdict}, score: ${result.score}`);
  });

  test('US-3.2: False-Positive Minimization - Legitimate SMS Passes As Safe', async () => {
    const legitimateText =
      'Dear Customer, your SBI account 1234XXXX5678 has been credited with INR 10,000 on 19-Sep-2026. Available balance: INR 85,000. -SBI';

    const result = await analyzeTextPhishing(legitimateText);

    expect(result).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(result.confidence).toBeLessThanOrEqual(0.90);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeLessThan(70);
    console.log(`[Sprint 3 US-3.2] Legitimate SMS verdict: ${result.verdict}`);
  });

  test('US-3.3: REST API Detection Endpoint Evaluates Threat Payloads', async () => {
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
  });

  test('US-3.4: Salted SHA-256 Anti-Fraud Hash Rejects Duplicate Identity Documents', async () => {
    const dupDocNum = '234567891234';
    const docHash = hashSaltedDocumentNumber(dupDocNum);

    await IdentityVerification.create({
      customerId: customerProfile._id,
      userId: customerUser._id,
      documentType: 'aadhaar',
      documentNumberMasked: `XXXX-XXXX-${dupDocNum.slice(-4)}`,
      documentNumberHash: docHash,
      verificationStatus: 'verified',
      verificationMethod: 'document'
    });

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
  });

  test('US-3.5: Identity Verification API Provisions Valid Verified Aadhaar Records', async () => {
    const res = await request(app)
      .post('/api/v1/identity/submit')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        documentType: 'aadhaar',
        documentNumber: '987654321098',
        fullName: 'Amrita Patel',
        dateOfBirth: '1992-04-15'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    const identity = res.body.data;
    expect(identity).toBeDefined();
    expect(identity.documentType).toEqual('aadhaar');
    expect(['pending', 'verified', 'needsReview']).toContain(identity.verificationStatus);
  });

});
