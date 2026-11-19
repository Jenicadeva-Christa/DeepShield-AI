const SystemConfig = require('../models/systemconfigs.model');
const Blacklist = require('../models/blacklists.model');
const AIModel = require('../models/aimodels.model');
const Transaction = require('../models/transactions.model');
const Customer = require('../models/customers.model');
const FraudAlert = require('../models/fraudalerts.model');
const User = require('../models/users.model');
const { createAuditEntry } = require('../middleware/audit.middleware');

// --- Admin Dashboard Stats ---
exports.getDashboardStats = async (req, res, next) => {
  try {
    const totalTransactions = await Transaction.countDocuments();
    const blockedTransactions = await Transaction.countDocuments({ status: 'blocked' });
    const approvedTransactions = await Transaction.countDocuments({ status: 'approved' });
    const pendingTransactions = await Transaction.countDocuments({ status: 'pendingStepUp' });
    
    const fraudRate = totalTransactions > 0
      ? Number(((blockedTransactions / totalTransactions) * 100).toFixed(2))
      : 0;

    const avgBalRes = await Customer.aggregate([
      { $group: { _id: null, avgBalance: { $avg: '$balance' } } }
    ]);
    const avgAccountBalance = avgBalRes[0]?.avgBalance || 0;

    const totalCustomers = await Customer.countDocuments();
    const totalAlerts = await FraudAlert.countDocuments();
    const openAlerts = await FraudAlert.countDocuments({ status: 'open' });

    // Recent 15 transactions with populated customer and user info
    const recentTransactions = await Transaction.find()
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(15)
      .populate('userId', 'fullName email phone')
      .populate('customerId', 'accountNumber balance');

    return res.status(200).json({
      success: true,
      data: {
        totalTransactions,
        blockedTransactions,
        approvedTransactions,
        pendingTransactions,
        fraudRate,
        avgAccountBalance,
        totalCustomers,
        totalAlerts,
        openAlerts,
        recentTransactions
      }
    });
  } catch (err) {
    next(err);
  }
};

// --- System Configs ---
exports.getConfigs = async (req, res, next) => {
  try {
    const configs = await SystemConfig.find().sort({ key: 1 });
    return res.status(200).json({ success: true, data: configs });
  } catch (err) {
    next(err);
  }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    const config = await SystemConfig.findOneAndUpdate(
      { key },
      { value, description, lastModifiedBy: req.user._id, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_UPDATED_SYSTEM_CONFIG',
      entity: 'SystemConfig',
      entityId: config._id.toString(),
      details: { key, value },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({ success: true, message: `Configuration '${key}' updated.`, data: config });
  } catch (err) {
    next(err);
  }
};

// --- Blacklists ---
exports.getBlacklists = async (req, res, next) => {
  try {
    const { type, search } = req.query;
    const query = {};
    if (type) query.type = type;
    if (search) query.value = { $regex: search, $options: 'i' };

    // Upgrade any legacy medium/low entries to high
    await Blacklist.updateMany(
      { severity: { $in: ['medium', 'low'] } },
      { $set: { severity: 'high' } }
    );

    const blacklists = await Blacklist.find(query).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: blacklists });
  } catch (err) {
    next(err);
  }
};

exports.addBlacklist = async (req, res, next) => {
  try {
    const { type, value, reason, category, severity, notes } = req.body;
    const normalizedValue = (value || '').trim().toLowerCase();

    const existing = await Blacklist.findOne({ type, normalizedValue });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Entity is already blacklisted.' });
    }

    const item = await Blacklist.create({
      type,
      value: (value || '').trim(),
      normalizedValue,
      reason,
      category: category || 'suspicious activity',
      severity: severity === 'critical' ? 'critical' : 'high',
      notes,
      addedBy: req.user._id
    });

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_ADDED_BLACKLIST',
      entity: 'Blacklist',
      entityId: item._id.toString(),
      details: { type, value },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(201).json({ success: true, message: 'Entity added to blacklist.', data: item });
  } catch (err) {
    next(err);
  }
};

exports.removeBlacklist = async (req, res, next) => {
  try {
    const item = await Blacklist.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Blacklist entry not found.' });
    }

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_REMOVED_BLACKLIST',
      entity: 'Blacklist',
      entityId: req.params.id,
      details: { type: item.type, value: item.value },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({ success: true, message: 'Entity removed from blacklist.' });
  } catch (err) {
    next(err);
  }
};

// --- AI Models ---
exports.getAIModels = async (req, res, next) => {
  try {
    const models = await AIModel.find().sort({ modelType: 1, version: -1 });
    return res.status(200).json({ success: true, data: models });
  } catch (err) {
    next(err);
  }
};

exports.updateAIModelStatus = async (req, res, next) => {
  try {
    const { isCurrentVersion, threshold } = req.body;
    const model = await AIModel.findById(req.params.id);
    if (!model) {
      return res.status(404).json({ success: false, message: 'AI Model not found.' });
    }

    if (typeof isCurrentVersion === 'boolean') model.status = isCurrentVersion ? 'active' : 'inactive';
    if (typeof threshold === 'number') model.threshold = threshold;

    await model.save();

    return res.status(200).json({ success: true, message: 'AI Model updated.', data: model });
  } catch (err) {
    next(err);
  }
};

exports.seedAIModels = async (req, res, next) => {
  try {
    const existing = await AIModel.countDocuments();
    if (existing === 0) {
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
    }
    const allModels = await AIModel.find().sort({ modelType: 1 });
    return res.status(200).json({ success: true, message: 'AI Models seeded successfully.', data: allModels });
  } catch (err) {
    next(err);
  }
};

