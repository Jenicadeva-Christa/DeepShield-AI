require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/users.model');
const Customer = require('../models/customers.model');
const StaffProfile = require('../models/staffprofiles.model');
const Transaction = require('../models/transactions.model');
const SystemConfig = require('../models/systemconfigs.model');
const Blacklist = require('../models/blacklists.model');
const AIModel = require('../models/aimodels.model');
const FraudAlert = require('../models/fraudalerts.model');
const Investigation = require('../models/investigations.model');
const { hashPassword, hashSHA256, encryptText } = require('../utils/crypto.utils');
const { createAuditEntry } = require('../middleware/audit.middleware');

async function seedData() {
  console.log('[Seed Script] Starting DeepShield AI data seeding...');
  await connectDB();

  // Clear existing collections
  await User.deleteMany({});
  await Customer.deleteMany({});
  await StaffProfile.deleteMany({});
  await Transaction.deleteMany({});
  await SystemConfig.deleteMany({});
  await Blacklist.deleteMany({});
  await AIModel.deleteMany({});
  await FraudAlert.deleteMany({});
  await Investigation.deleteMany({});

  console.log('[Seed Script] Existing collections cleared.');

  // 1. System Configurations
  const configs = [
    { key: 'riskThresholds', value: { lowMax: 39, mediumMax: 69 }, category: 'thresholds', description: 'Risk level boundaries for Low, Medium, and High' },
    { key: 'fusionWeights', value: { transactionAnomaly: 0.35, deepfake: 0.20, identity: 0.15, voice: 0.10, phishing: 0.10, socialEngineering: 0.10 }, category: 'weights', description: 'Component weights for risk scoring' },
    { key: 'maxFailedLogins', value: 5, category: 'security', description: 'Maximum password failures before account lockout' },
    { key: 'lockMinutes', value: 15, category: 'security', description: 'Account lockout duration in minutes' },
    { key: 'sessionTimeoutMinutes', value: 15, category: 'security', description: 'Idle session timeout in minutes' },
    { key: 'otpExpiryMinutes', value: 5, category: 'security', description: 'OTP validity period in minutes' },
    { key: 'otpMaxAttempts', value: 3, category: 'security', description: 'Max OTP validation retries' },
    { key: 'uploadLimitsMB', value: { image: 10, audio: 25, video: 100, document: 20 }, category: 'uploads', description: 'Maximum upload file sizes in MB' },
    { key: 'highValueAmount', value: 50000, category: 'rules', description: 'Threshold amount for high-value transactions' },
    { key: 'velocityLimits', value: { perTenMinutes: 3, perHour: 8 }, category: 'rules', description: 'Transaction count limits for velocity checks' },
    {
      key: 'upiLimits',
      value: {
        p2p: { perTransactionLimit: 100000, dailyCumulativeLimit: 100000, rollingWindowHours: 24, description: 'Standard Person-to-Person (P2P) Outgoing UPI Limit' },
        verifiedMerchant: { perTransactionLimit: 200000, dailyCumulativeLimit: 500000, rollingWindowHours: 24, description: 'Verified Merchant (P2M) Outgoing UPI Limit' },
        inbound: {
          standardCredit: { perTransactionLimit: 200000, dailyCumulativeLimit: 500000, rollingWindowHours: 24, description: 'Project Inbound UPI Credit Limit (Simulation Rule)' },
          p2pCredit: { perTransactionLimit: 100000, dailyCumulativeLimit: 200000, rollingWindowHours: 24, description: 'Inbound P2P Transfer Credit Limit' }
        }
      },
      category: 'rules',
      description: 'UPI Per-Transaction and Daily Rolling 24h Limits for P2P, Verified Merchant, and Inbound Credits'
    },
    { key: 'retentionDays', value: 90, category: 'retention', description: 'Days to retain media uploads' }
  ];
  await SystemConfig.insertMany(configs);
  console.log(`[Seed Script] Inserted ${configs.length} System Configurations.`);

  // 2. Blacklists (~30 entries)
  const blacklists = [
    { type: 'domain', value: 'verify-sbi-bank-login.com', normalizedValue: 'verify-sbi-bank-login.com', category: 'phishing', severity: 'high', source: 'government' },
    { type: 'domain', value: 'hdfc-secure-update-kyc.net', normalizedValue: 'hdfc-secure-update-kyc.net', category: 'phishing', severity: 'high', source: 'government' },
    { type: 'domain', value: 'icici-bonus-reward-points.info', normalizedValue: 'icici-bonus-reward-points.info', category: 'phishing', severity: 'high', source: 'publicDatabase' },
    { type: 'domain', value: 'axis-netbanking-portal.org', normalizedValue: 'axis-netbanking-portal.org', category: 'phishing', severity: 'high', source: 'analyst' },
    { type: 'url', value: 'http://192.168.1.100/sbi/login.html', normalizedValue: 'http://192.168.1.100/sbi/login.html', category: 'phishing', severity: 'high', source: 'analyst' },
    { type: 'url', value: 'https://tinyurl.com/claim-cash-reward-bank', normalizedValue: 'https://tinyurl.com/claim-cash-reward-bank', category: 'phishing', severity: 'high', source: 'internal' },
    { type: 'phoneNumber', value: '+919876500111', normalizedValue: '+919876500111', category: 'scam', severity: 'high', source: 'government' },
    { type: 'phoneNumber', value: '+919876500222', normalizedValue: '+919876500222', category: 'scam', severity: 'high', source: 'analyst' },
    { type: 'phoneNumber', value: '+919876500333', normalizedValue: '+919876500333', category: 'scam', severity: 'high', source: 'publicDatabase' },
    { type: 'email', value: 'support@sbi-fraud-desk.com', normalizedValue: 'support@sbi-fraud-desk.com', category: 'phishing', severity: 'high', source: 'government' },
    { type: 'email', value: 'alert@kyc-verification-help.org', normalizedValue: 'alert@kyc-verification-help.org', category: 'phishing', severity: 'high', source: 'analyst' },
    { type: 'accountNumber', value: '998877665544', normalizedValue: '998877665544', category: 'mule account', severity: 'high', source: 'government' },
    { type: 'accountNumber', value: '112233445566', normalizedValue: '112233445566', category: 'mule account', severity: 'high', source: 'analyst' },
    { type: 'accountNumber', value: '556677889900', normalizedValue: '556677889900', category: 'mule account', severity: 'high', source: 'internal' },
    { type: 'ipAddress', value: '185.220.101.4', normalizedValue: '185.220.101.4', category: 'tor node', severity: 'high', source: 'publicDatabase' },
    { type: 'ipAddress', value: '198.51.100.42', normalizedValue: '198.51.100.42', category: 'malicious bot', severity: 'high', source: 'analyst' },
    { type: 'keywordPattern', value: 'AnyDesk', normalizedValue: 'anydesk', category: 'remote access', severity: 'high', source: 'internal' },
    { type: 'keywordPattern', value: 'TeamViewer', normalizedValue: 'teamviewer', category: 'remote access', severity: 'high', source: 'internal' },
    { type: 'keywordPattern', value: 'share OTP immediately', normalizedValue: 'share otp immediately', category: 'social engineering', severity: 'high', source: 'analyst' },
    { type: 'keywordPattern', value: 'account blocked within 24 hours', normalizedValue: 'account blocked within 24 hours', category: 'urgency lure', severity: 'high', source: 'internal' }
  ];
  await Blacklist.insertMany(blacklists);
  console.log(`[Seed Script] Inserted ${blacklists.length} Blacklist entries.`);

  // 3. AI Models Registry
  const models = [
    { modelName: 'TF-IDF Naive Bayes Phishing Detector', modelType: 'phishing', algorithm: 'TF-IDF + Multinomial Naive Bayes', version: '1.0.0', status: 'active', accuracy: 0.91, evaluationNotes: 'Trained on 300 seed text samples (Indian English banking lures)', trainingSummary: { trainSamples: 210, validationSamples: 45, testSamples: 45, dataSource: 'real', precision: 0.92, recall: 0.89, f1: 0.90 } },
    { modelName: 'TensorFlow.js Transaction Autoencoder', modelType: 'transactionAnomaly', algorithm: 'TF.js Autoencoder + Isolation Forest in JS', version: '1.0.0', status: 'active', accuracy: 0.88, evaluationNotes: 'Trained on normal transaction history with calibrated synthetic fraud signals', trainingSummary: { trainSamples: 300, validationSamples: 60, testSamples: 60, dataSource: 'real', precision: 0.86, recall: 0.89, f1: 0.87 } },
    { modelName: 'face-api + TF.js MLP Deepfake Classifier', modelType: 'imageDeepfake', algorithm: 'SSD MobileNet + 68 Landmarks + ELA + TF.js MLP', version: '1.0.0', status: 'active', accuracy: 0.78, evaluationNotes: 'Evaluated on face crop forensics and landmark symmetry', trainingSummary: { trainSamples: 140, validationSamples: 30, testSamples: 30, dataSource: 'bootstrap', precision: 0.79, recall: 0.76, f1: 0.77 } },
    { modelName: 'Frame Temporal Video Deepfake Model', modelType: 'videoDeepfake', algorithm: 'Multi-frame TF.js Temporal Distance Classifier', version: '1.0.0', status: 'active', accuracy: 0.74, evaluationNotes: 'Analyzes frame-level face descriptor variations', trainingSummary: { trainSamples: 70, validationSamples: 15, testSamples: 15, dataSource: 'bootstrap', precision: 0.75, recall: 0.72, f1: 0.73 } },
    { modelName: 'Meyda MFCC Voice Fraud Classifier', modelType: 'voiceFraud', algorithm: 'Meyda MFCC + Spectral Statistics + TF.js NN', version: '1.0.0', status: 'active', accuracy: 0.76, evaluationNotes: 'Separates genuine speech from synthetic/cloned speech', trainingSummary: { trainSamples: 100, validationSamples: 20, testSamples: 20, dataSource: 'bootstrap', precision: 0.77, recall: 0.74, f1: 0.75 } },
    { modelName: 'Document Authenticity & OCR Classifier', modelType: 'documentAuthenticity', algorithm: 'Tesseract.js OCR + Format Sanity + Metadata Hash', version: '1.0.0', status: 'active', accuracy: 0.92, evaluationNotes: 'Validates PAN, Aadhaar, Passport formats and duplicate hashes', trainingSummary: { trainSamples: 100, validationSamples: 20, testSamples: 20, dataSource: 'real', precision: 0.93, recall: 0.91, f1: 0.92 } },
    { modelName: 'TensorFlow.js Logistic Risk Fusion Calibrator', modelType: 'riskFusion', algorithm: 'TF.js Bounded Logistic Regression', version: '1.0.0', status: 'active', accuracy: 0.94, evaluationNotes: 'Calibrates multi-modal risk scores with hard rule overrides', trainingSummary: { trainSamples: 250, validationSamples: 50, testSamples: 50, dataSource: 'real', precision: 0.95, recall: 0.93, f1: 0.94 } }
  ];
  await AIModel.insertMany(models);
  console.log(`[Seed Script] Inserted ${models.length} AI Models Registry records.`);

  // 4. Create Users (1 Admin, 2 Analysts, 1 Staff, 5 Customers)
  const commonPasswordHash = await hashPassword('Password@123');
  const adminPasswordHash = await hashPassword('Admin@123');

  // Administrator
  const admin = await User.create({
    fullName: 'System Administrator',
    email: 'admin@deepshield.ai',
    phone: '+919876543210',
    passwordHash: adminPasswordHash,
    role: 'administrator',
    status: 'active'
  });
  await StaffProfile.create({ userId: admin._id, employeeId: 'EMP-1001', department: 'Executive', designation: 'Chief Information Security Officer' });

  // Fraud Analysts
  const analyst1 = await User.create({
    fullName: 'Rohan Sharma (Lead Analyst)',
    email: 'analyst1@deepshield.ai',
    phone: '+919876543211',
    passwordHash: commonPasswordHash,
    role: 'fraudAnalyst',
    status: 'active'
  });
  await StaffProfile.create({ userId: analyst1._id, employeeId: 'EMP-2001', department: 'Fraud Risk Operations', designation: 'Senior Fraud Analyst', activeCaseCount: 2 });

  const analyst2 = await User.create({
    fullName: 'Priya Verma (Fraud Analyst)',
    email: 'analyst2@deepshield.ai',
    phone: '+919876543212',
    passwordHash: commonPasswordHash,
    role: 'fraudAnalyst',
    status: 'active'
  });
  await StaffProfile.create({ userId: analyst2._id, employeeId: 'EMP-2002', department: 'Fraud Risk Operations', designation: 'Fraud Investigator', activeCaseCount: 1 });

  // Banking Staff
  const staff1 = await User.create({
    fullName: 'Amit Patel (Branch Officer)',
    email: 'staff1@deepshield.ai',
    phone: '+919876543213',
    passwordHash: commonPasswordHash,
    role: 'bankingStaff',
    status: 'active'
  });
  await StaffProfile.create({ userId: staff1._id, employeeId: 'EMP-3001', department: 'Customer Support', designation: 'Senior Banking Support Officer' });

  // 5 Customers
  const customerData = [
    { fullName: 'Rajesh Kumar', email: 'customer1@deepshield.ai', phone: '+919810011111', balance: 250000, avg: 12000, std: 4000, city: 'Mumbai' },
    { fullName: 'Sneha Reddy', email: 'customer2@deepshield.ai', phone: '+919810022222', balance: 180000, avg: 8500, std: 2500, city: 'Hyderabad' },
    { fullName: 'Vikram Singh', email: 'customer3@deepshield.ai', phone: '+919810033333', balance: 450000, avg: 25000, std: 9000, city: 'Delhi' },
    { fullName: 'Ananya Gupta', email: 'customer4@deepshield.ai', phone: '+919810044444', balance: 95000, avg: 4200, std: 1500, city: 'Bengaluru' },
    { fullName: 'Siddharth Nair', email: 'customer5@deepshield.ai', phone: '+919810055555', balance: 310000, avg: 16000, std: 5500, city: 'Chennai' }
  ];

  const createdCustomers = [];

  for (let i = 0; i < customerData.length; i++) {
    const c = customerData[i];
    const u = await User.create({
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      passwordHash: commonPasswordHash,
      role: 'customer',
      status: 'active'
    });

    const cust = await Customer.create({
      userId: u._id,
      accountNumber: '3009' + (10000000 + i * 1111111).toString(),
      balance: c.balance,
      currency: 'INR',
      address: encryptText(`${101 + i} Park Street, ${c.city}, India`),
      dateOfBirth: new Date(1988 + i * 2, i, 15),
      gender: i % 2 === 0 ? 'Male' : 'Female',
      idProofType: 'Aadhaar',
      verified: true,
      baseline: {
        averageAmount: c.avg,
        stdAmount: c.std,
        usualHours: [9, 11, 14, 16, 19],
        usualCities: [c.city, 'Mumbai'],
        knownDeviceIds: [`DEV-CHIP-${1000 + i}`],
        knownPayees: [`30098888${i}`, `30097777${i}`],
        lastLocation: { lat: 19.076, lng: 72.8777, at: new Date() }
      }
    });

    createdCustomers.push({ user: u, customer: cust });

    // Generate ~60 historic transactions for baseline testing
    const txTypes = ['transfer', 'upi', 'cardPayment', 'withdrawal', 'billPayment'];
    const channels = ['web', 'mobile', 'upi'];
    const now = Date.now();

    for (let t = 0; t < 60; t++) {
      const daysAgo = 60 - t;
      const timestamp = new Date(now - daysAgo * 24 * 60 * 60 * 1000 + Math.random() * 3600000);
      const isHighRiskSample = t === 58; // one high risk historic transaction

      const txAmount = isHighRiskSample
        ? c.avg * 8 // anomaly
        : Math.max(100, Math.round(c.avg + (Math.random() - 0.5) * c.std * 2));

      await Transaction.create({
        customerId: cust._id,
        userId: u._id,
        type: txTypes[t % txTypes.length],
        amount: txAmount,
        currency: 'INR',
        channel: channels[t % channels.length],
        description: `Payment to Merchant ${t + 1}`,
        payee: {
          name: isHighRiskSample ? 'Mule Account Overseas' : `Payee Merchant ${t % 5}`,
          accountNumber: isHighRiskSample ? '998877665544' : `30098888${t % 5}`,
          bank: 'HDFC Bank',
          isNew: isHighRiskSample
        },
        location: { city: isHighRiskSample ? 'Moscow' : c.city, country: 'India', lat: 19.076, lng: 72.8777 },
        device: { deviceId: `DEV-CHIP-${1000 + i}`, ipAddress: '103.21.12.44', userAgent: 'Mozilla/5.0', isKnown: !isHighRiskSample },
        timestamp,
        status: isHighRiskSample ? 'blocked' : 'completed',
        riskLevel: isHighRiskSample ? 'high' : 'low'
      });
    }
    console.log(`[Seed Script] Created Customer ${c.fullName} with 60 historic transactions.`);
  }

  // Create 1 sample FraudAlert and Investigation
  const sampleCustomer = createdCustomers[0];
  const sampleTx = await Transaction.findOne({ customerId: sampleCustomer.customer._id, riskLevel: 'high' });

  if (sampleTx) {
    const alert = await FraudAlert.create({
      alertNumber: 'FA-2026-000001',
      transactionId: sampleTx._id,
      userId: sampleCustomer.user._id,
      alertType: 'transactionFraud',
      severity: 'high',
      riskScore: 84.5,
      status: 'underInvestigation',
      summary: 'High value anomaly ($96,000 INR) transferred to unverified new payee from unknown location.',
      assignedTo: analyst1._id,
      alertTime: new Date()
    });

    await Investigation.create({
      alertId: alert._id,
      assignedTo: analyst1._id,
      assignedAt: new Date(),
      startedAt: new Date(),
      status: 'inProgress',
      findings: 'Transaction amount is 8x higher than customer average baseline. Destination account matches flagged blacklisted mule pattern.',
      notes: [
        { authorId: analyst1._id, text: 'Initiated investigation. Customer contacted via registered phone.', createdAt: new Date() }
      ],
      recommendedAction: 'blockTransaction'
    });

    console.log('[Seed Script] Sample Fraud Alert (FA-2026-000001) & Investigation created.');
  }

  // Initial Audit Log Entry
  await createAuditEntry({
    userId: admin._id,
    action: 'DATABASE_SEEDED',
    entity: 'System',
    entityId: 'SYSTEM',
    details: { message: 'Initial seed data populated successfully.' },
    ipAddress: '127.0.0.1',
    userAgent: 'DeepShield Seed Script'
  });

  console.log(`\n======================================================`);
  console.log(` DeepShield AI Data Seeding Completed Successfully!`);
  console.log(`======================================================`);
  console.log(` Demo Login Accounts:`);
  console.log(` 1. Administrator:   admin@deepshield.ai    / Admin@123`);
  console.log(` 2. Fraud Analyst:    analyst1@deepshield.ai / Password@123`);
  console.log(` 3. Banking Staff:    staff1@deepshield.ai   / Password@123`);
  console.log(` 4. Customer:         customer1@deepshield.ai/ Password@123`);
  console.log(`======================================================\n`);

  process.exit(0);
}

seedData().catch(err => {
  console.error('[Seed Script Error]:', err);
  process.exit(1);
});
