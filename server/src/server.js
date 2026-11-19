require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);
  
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`[Socket.io] User ${userId} joined room ${userId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

async function autoSeedDefaultAccounts() {
  try {
    const User = require('./models/users.model');
    const Customer = require('./models/customers.model');
    const StaffProfile = require('./models/staffprofiles.model');
    const SystemConfig = require('./models/systemconfigs.model');
    const Blacklist = require('./models/blacklists.model');
    const AIModel = require('./models/aimodels.model');
    const { hashPassword, encryptText } = require('./utils/crypto.utils');

    const existingAdmin = await User.findOne({ role: 'administrator' });
    if (!existingAdmin) {
      console.log('[AutoSeed] Seeding default accounts (Admin, Analysts, Customers)...');

      const commonHash = await hashPassword('Password@123');
      const adminHash = await hashPassword('Admin@123');

      // Administrator
      const admin = await User.create({
        fullName: 'System Administrator',
        email: 'admin@deepshield.ai',
        phone: '+919876543210',
        passwordHash: adminHash,
        role: 'administrator',
        status: 'active'
      });
      await StaffProfile.create({ userId: admin._id, employeeId: 'EMP-1001', department: 'Executive', designation: 'Chief Information Security Officer' });

      // Fraud Analysts
      const analyst1 = await User.create({
        fullName: 'Rohan Sharma (Lead Analyst)',
        email: 'analyst1@deepshield.ai',
        phone: '+919876543211',
        passwordHash: commonHash,
        role: 'fraudAnalyst',
        status: 'active'
      });
      await StaffProfile.create({ userId: analyst1._id, employeeId: 'EMP-2001', department: 'Fraud Risk Operations', designation: 'Senior Fraud Analyst' });

      const analyst2 = await User.create({
        fullName: 'Priya Verma (Fraud Analyst)',
        email: 'analyst2@deepshield.ai',
        phone: '+919876543212',
        passwordHash: commonHash,
        role: 'fraudAnalyst',
        status: 'active'
      });
      await StaffProfile.create({ userId: analyst2._id, employeeId: 'EMP-2002', department: 'Fraud Risk Operations', designation: 'Fraud Investigator' });

      // Default Customers
      const customers = [
        { fullName: 'Rajesh Kumar', email: 'customer1@deepshield.ai', phone: '+919810011111', balance: 250000, city: 'Mumbai' },
        { fullName: 'Sneha Reddy',  email: 'customer2@deepshield.ai', phone: '+919810022222', balance: 180000, city: 'Hyderabad' },
        { fullName: 'Vikram Singh', email: 'customer3@deepshield.ai', phone: '+919810033333', balance: 450000, city: 'Delhi' }
      ];

      for (let i = 0; i < customers.length; i++) {
        const c = customers[i];
        const u = await User.create({
          fullName: c.fullName, email: c.email, phone: c.phone,
          passwordHash: commonHash, role: 'customer', status: 'active'
        });
        await Customer.create({
          userId: u._id,
          accountNumber: '3009' + (10000000 + i * 1111111).toString(),
          balance: c.balance,
          currency: 'INR',
          address: encryptText(c.city + ', India'),
          baseline: { averageAmount: 10000, stdAmount: 4000, usualHours: [9, 14, 18], usualCities: [c.city], knownDeviceIds: [], knownPayees: [] }
        });
      }
      console.log('[AutoSeed] ✅ Default accounts created successfully!');
    }

    // Essential System Configs
    const existingConfigs = await SystemConfig.countDocuments();
    if (existingConfigs === 0) {
      await SystemConfig.insertMany([
        { key: 'riskThresholds', value: { lowMax: 39, mediumMax: 69 }, category: 'thresholds', description: 'Risk level boundaries' },
        { key: 'maxFailedLogins', value: 5, category: 'security', description: 'Max login failures before lockout' },
        { key: 'lockMinutes', value: 15, category: 'security', description: 'Lockout duration in minutes' },
        { key: 'otpExpiryMinutes', value: 5, category: 'security', description: 'OTP validity period' },
        { key: 'highValueAmount', value: 50000, category: 'rules', description: 'High-value transaction threshold' }
      ]);
      console.log('[AutoSeed] ✅ System configurations seeded.');
    }

    // Essential Blacklists - ensure default threat entities exist unconditionally
    const defaultBlacklists = [
      { type: 'accountNumber', value: '998877665544', normalizedValue: '998877665544', category: 'mule account', severity: 'critical', source: 'government' },
      { type: 'accountNumber', value: '112233445566', normalizedValue: '112233445566', category: 'mule account', severity: 'critical', source: 'analyst' },
      { type: 'accountNumber', value: '556677889900', normalizedValue: '556677889900', category: 'mule account', severity: 'critical', source: 'internal' },
      { type: 'phoneNumber', value: '+919876500111', normalizedValue: '+919876500111', category: 'scam', severity: 'high', source: 'government' },
      { type: 'phoneNumber', value: '+919876500222', normalizedValue: '+919876500222', category: 'scam', severity: 'high', source: 'analyst' },
      { type: 'phoneNumber', value: '+919876500333', normalizedValue: '+919876500333', category: 'scam', severity: 'high', source: 'publicDatabase' },
      { type: 'email', value: 'support@sbi-fraud-desk.com', normalizedValue: 'support@sbi-fraud-desk.com', category: 'phishing', severity: 'high', source: 'government' },
      { type: 'domain', value: 'verify-sbi-bank-login.com', normalizedValue: 'verify-sbi-bank-login.com', category: 'phishing', severity: 'high', source: 'government' }
    ];

    for (const b of defaultBlacklists) {
      await Blacklist.findOneAndUpdate(
        { normalizedValue: b.normalizedValue },
        { $set: b },
        { upsert: true, new: true }
      );
    }
    console.log('[AutoSeed] ✅ Essential blacklist threats verified/upserted.');

    // Automatically elevate any existing medium or low severity blacklist records to high
    await Blacklist.updateMany(
      { severity: { $in: ['medium', 'low'] } },
      { $set: { severity: 'high' } }
    );

    // AI & Machine Learning Models
    const existingModels = await AIModel.countDocuments();
    if (existingModels === 0) {
      const defaultAIModels = [
        { modelName: 'TF-IDF Naive Bayes Phishing Detector', modelType: 'phishing', algorithm: 'TF-IDF + Multinomial Naive Bayes', version: '1.0.0', status: 'active', accuracy: 0.91, evaluationNotes: 'Trained on 300 seed text samples (Indian English banking lures)', trainingSummary: { trainSamples: 210, validationSamples: 45, testSamples: 45, dataSource: 'real', precision: 0.92, recall: 0.89, f1: 0.90 } },
        { modelName: 'TensorFlow.js Transaction Autoencoder', modelType: 'transactionAnomaly', algorithm: 'TF.js Autoencoder + Isolation Forest in JS', version: '1.0.0', status: 'active', accuracy: 0.88, evaluationNotes: 'Trained on normal transaction history with calibrated synthetic fraud signals', trainingSummary: { trainSamples: 300, validationSamples: 60, testSamples: 60, dataSource: 'real', precision: 0.86, recall: 0.89, f1: 0.87 } },
        { modelName: 'face-api + TF.js MLP Deepfake Classifier', modelType: 'imageDeepfake', algorithm: 'SSD MobileNet + 68 Landmarks + ELA + TF.js MLP', version: '1.0.0', status: 'active', accuracy: 0.78, evaluationNotes: 'Evaluated on face crop forensics and landmark symmetry', trainingSummary: { trainSamples: 140, validationSamples: 30, testSamples: 30, dataSource: 'bootstrap', precision: 0.79, recall: 0.76, f1: 0.77 } },
        { modelName: 'Frame Temporal Video Deepfake Model', modelType: 'videoDeepfake', algorithm: 'Multi-frame TF.js Temporal Distance Classifier', version: '1.0.0', status: 'active', accuracy: 0.74, evaluationNotes: 'Analyzes frame-level face descriptor variations', trainingSummary: { trainSamples: 70, validationSamples: 15, testSamples: 15, dataSource: 'bootstrap', precision: 0.75, recall: 0.72, f1: 0.73 } },
        { modelName: 'Meyda MFCC Voice Fraud Classifier', modelType: 'voiceFraud', algorithm: 'Meyda MFCC + Spectral Statistics + TF.js NN', version: '1.0.0', status: 'active', accuracy: 0.76, evaluationNotes: 'Separates genuine speech from synthetic/cloned speech', trainingSummary: { trainSamples: 100, validationSamples: 20, testSamples: 20, dataSource: 'bootstrap', precision: 0.77, recall: 0.74, f1: 0.75 } },
        { modelName: 'Document Authenticity & OCR Classifier', modelType: 'documentAuthenticity', algorithm: 'Tesseract.js OCR + Format Sanity + Metadata Hash', version: '1.0.0', status: 'active', accuracy: 0.92, evaluationNotes: 'Validates PAN, Aadhaar, Passport formats and duplicate hashes', trainingSummary: { trainSamples: 100, validationSamples: 20, testSamples: 20, dataSource: 'real', precision: 0.93, recall: 0.91, f1: 0.92 } },
        { modelName: 'TensorFlow.js Logistic Risk Fusion Calibrator', modelType: 'riskFusion', algorithm: 'TF.js Bounded Logistic Regression', version: '1.0.0', status: 'active', accuracy: 0.94, evaluationNotes: 'Calibrates multi-modal risk scores with hard rule overrides', trainingSummary: { trainSamples: 250, validationSamples: 50, testSamples: 50, dataSource: 'real', precision: 0.95, recall: 0.93, f1: 0.94 } }
      ];
      await AIModel.insertMany(defaultAIModels);
      console.log(`[AutoSeed] ✅ ${defaultAIModels.length} AI & ML models registered into production registry.`);
    }

    console.log('[AutoSeed] ✅ Default accounts created successfully!');
    console.log('[AutoSeed] Admin:    admin@deepshield.ai    / Admin@123');
    console.log('[AutoSeed] Analyst:  analyst1@deepshield.ai / Password@123');
    console.log('[AutoSeed] Customer: customer1@deepshield.ai / Password@123');
  } catch (err) {
    console.error('[AutoSeed] Error during auto-seeding:', err.message);
  }
}

async function startServer() {
  try {
    await connectDB();
    await autoSeedDefaultAccounts();
    server.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(` DeepShield AI Server running on http://localhost:${PORT}`);
      console.log(` Process Model: Agile Model (Scrum Framework / Sprints 1-4)`);
      console.log(` API Endpoint: http://localhost:${PORT}/api/v1`);
      console.log(` Health Endpoint: http://localhost:${PORT}/api/v1/health`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error(`[Server Start Error]: ${err.message}`);
    process.exit(1);
  }
}


const gracefulShutdown = async () => {
  console.log('\n[Server] Shutdown signal received. Closing server and database connections gracefully...');
  server.close(async () => {
    try {
      const { disconnectDB } = require('./config/db');
      await disconnectDB();
    } catch (e) {}
    console.log('[Server] DeepShield AI Server stopped cleanly.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
