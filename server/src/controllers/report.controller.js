const Report = require('../models/reports.model');
const Transaction = require('../models/transactions.model');
const FraudAlert = require('../models/fraudalerts.model');
const User = require('../models/users.model');
const Customer = require('../models/customers.model');
const AuditLog = require('../models/auditlogs.model');
const DetectionResult = require('../models/detectionresults.model');
const { createAuditEntry } = require('../middleware/audit.middleware');
const { DecisionTreeForecaster } = require('../engine/decisionTreeForecaster');

function dateRange(from, to) {
  const filter = {};
  if (from) {
    const fromD = new Date(from);
    fromD.setHours(0, 0, 0, 0);
    filter.$gte = fromD;
  }
  if (to) {
    const toD = new Date(to);
    toD.setHours(23, 59, 59, 999);
    filter.$lte = toD;
  }
  return Object.keys(filter).length ? filter : null;
}

// ─── 1. Generate Transaction Summary Report ──────────────────────────────────
exports.generateTransactionReport = async (req, res, next) => {
  try {
    const { from, to, format = 'json' } = req.query;
    const txFilter = {};
    const dr = dateRange(from, to);
    if (dr) txFilter.createdAt = dr;

    if (req.user.role === 'customer') {
      const customer = await Customer.findOne({ userId: req.user._id });
      if (customer) txFilter.customerId = customer._id;
    }

    const transactions = await Transaction.find(txFilter)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('customerId')
      .populate('userId', 'fullName email phone');

    const totalAmount = transactions.reduce((s, t) => s + (t.amount || 0), 0);
    const approved = transactions.filter(t => t.status === 'approved').length;
    const blocked = transactions.filter(t => t.status === 'blocked').length;
    const pending = transactions.filter(t => t.status === 'pendingStepUp').length;

    // Run Decision Tree Daily Aggregator & Forecasting Engine
    const forecastReport = DecisionTreeForecaster.generateForecastReport(transactions);

    const summary = {
      reportType: 'transactionSummary',
      generatedAt: new Date().toISOString(),
      period: { from: from || 'all-time', to: to || 'now' },
      totalTransactions: transactions.length,
      totalAmount,
      approved,
      blocked,
      pending,
      dailyRiskTrends: forecastReport.dailySeries,
      chartSeries: forecastReport.chartSeries,
      tomorrowForecast: forecastReport.tomorrowForecast,
      transactions: transactions.slice(0, 100)
    };

    const report = await Report.create({
      reportType: 'transactionSummary',
      generatedBy: req.user._id,
      format: ['pdf', 'xlsx', 'csv', 'json'].includes(format) ? format : 'json',
      fileName: `tx_summary_${Date.now()}.${format || 'json'}`,
      filters: { from, to },
      summary: { totalTransactions: transactions.length, totalAmount, approved, blocked },
      status: 'completed'
    });

    await createAuditEntry({
      userId: req.user._id,
      action: 'REPORT_GENERATED',
      entity: 'Report',
      entityId: report._id.toString(),
      details: { reportType: 'transactionSummary', format },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

// ─── 2. Generate Fraud / Alert Report ────────────────────────────────────────
exports.generateFraudReport = async (req, res, next) => {
  try {
    const { from, to, format = 'json' } = req.query;
    const filter = {};
    const dr = dateRange(from, to);
    if (dr) filter.createdAt = dr;

    const alerts = await FraudAlert.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('userId', 'fullName email phone')
      .populate('transactionId')
      .populate('assignedTo', 'fullName email');

    const open = alerts.filter(a => a.status === 'open').length;
    const resolved = alerts.filter(a => a.status === 'resolved' || (a.status && a.status.startsWith('resolved'))).length;
    const highSeverity = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;

    const summary = {
      reportType: 'fraudAlertSummary',
      generatedAt: new Date().toISOString(),
      period: { from: from || 'all-time', to: to || 'now' },
      totalAlerts: alerts.length,
      open,
      resolved,
      highSeverity,
      alerts: alerts.slice(0, 50)
    };

    const report = await Report.create({
      reportType: 'fraudAlertSummary',
      generatedBy: req.user._id,
      format: ['pdf', 'xlsx', 'csv', 'json'].includes(format) ? format : 'json',
      fileName: `fraud_summary_${Date.now()}.${format || 'json'}`,
      filters: { from, to },
      summary: { totalAlerts: alerts.length, open, resolved, highSeverity },
      status: 'completed'
    });

    await createAuditEntry({
      userId: req.user._id,
      action: 'REPORT_GENERATED',
      entity: 'Report',
      entityId: report._id.toString(),
      details: { reportType: 'fraudAlertSummary' },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

// ─── 3. Generate Audit Trail Report ──────────────────────────────────────────
exports.generateAuditReport = async (req, res, next) => {
  try {
    const { from, to, userId: targetUserId } = req.query;
    const filter = {};
    const dr = dateRange(from, to);
    if (dr) filter.timestamp = dr;
    if (targetUserId) filter.userId = targetUserId;

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(300)
      .populate('userId', 'fullName email role');

    const summary = {
      reportType: 'auditTrail',
      generatedAt: new Date().toISOString(),
      period: { from: from || 'all-time', to: to || 'now' },
      totalEntries: logs.length,
      logs: logs.slice(0, 100)
    };

    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

// ─── 4. Generate Detection / AI Report ───────────────────────────────────────
exports.generateDetectionReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    const dr = dateRange(from, to);
    if (dr) filter.createdAt = dr;

    const detections = await DetectionResult.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);

    const byModule = {};
    const byVerdict = { safe: 0, suspicious: 0, malicious: 0 };
    for (const d of detections) {
      byModule[d.module] = (byModule[d.module] || 0) + 1;
      if (byVerdict[d.verdict] !== undefined) byVerdict[d.verdict]++;
    }

    const summary = {
      reportType: 'detectionSummary',
      generatedAt: new Date().toISOString(),
      period: { from: from || 'all-time', to: to || 'now' },
      totalDetections: detections.length,
      byModule,
      byVerdict,
      detections: detections.slice(0, 50)
    };

    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

// ─── 5. List All Reports ──────────────────────────────────────────────────────
exports.listReports = async (req, res, next) => {
  try {
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('generatedBy', 'fullName email role');

    return res.status(200).json({ success: true, data: reports });
  } catch (err) {
    next(err);
  }
};
