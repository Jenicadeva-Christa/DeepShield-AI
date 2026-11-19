const FraudAlert = require('../models/fraudalerts.model');
const Investigation = require('../models/investigations.model');
const Notification = require('../models/notifications.model');
const Transaction = require('../models/transactions.model');
const { createAuditEntry } = require('../middleware/audit.middleware');

exports.getAnalystStats = async (req, res, next) => {
  try {
    const openHighRisk = await FraudAlert.countDocuments({
      status: 'open',
      severity: { $in: ['high', 'critical'] }
    });
    const activeAssigned = await FraudAlert.countDocuments({
      assignedTo: req.user._id,
      status: { $in: ['open', 'underInvestigation'] }
    });
    const totalOpen = await FraudAlert.countDocuments({
      status: { $in: ['open', 'underInvestigation'] }
    });
    const resolvedCount = await FraudAlert.countDocuments({
      status: { $in: ['resolvedFraud', 'resolvedFalsePositive', 'closed'] }
    });
    const totalAlerts = await FraudAlert.countDocuments();

    const recentAlerts = await FraudAlert.find()
      .sort({ alertTime: -1, createdAt: -1 })
      .limit(6)
      .populate('userId', 'fullName email')
      .populate('transactionId');

    return res.status(200).json({
      success: true,
      data: {
        openHighRisk,
        activeAssigned: typeof activeAssigned === 'number' ? activeAssigned : 0,
        resolvedCount,
        totalAlerts,
        totalOpen,
        recentAlerts
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getAlerts = async (req, res, next) => {
  try {
    const { status, severity, alertType, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (alertType) query.alertType = alertType;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const alerts = await FraudAlert.find(query)
      .sort({ alertTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'fullName email phone')
      .populate('assignedTo', 'fullName email')
      .populate('transactionId')
      .populate('riskAssessmentId');

    const total = await FraudAlert.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getMyAlerts = async (req, res, next) => {
  try {
    const isCustomer = req.user.role === 'customer';
    const query = isCustomer
      ? { userId: req.user._id }
      : { assignedTo: req.user._id };

    const alerts = await FraudAlert.find(query)
      .sort({ alertTime: -1, createdAt: -1 })
      .populate('userId', 'fullName email phone')
      .populate('assignedTo', 'fullName email')
      .populate('transactionId')
      .populate('riskAssessmentId');

    // Attach linked investigation info for analysts
    const alertIds = alerts.map((a) => a._id);
    const investigations = await Investigation.find({ alertId: { $in: alertIds } })
      .populate('assignedTo', 'fullName email');

    const invMap = {};
    investigations.forEach((inv) => {
      invMap[inv.alertId.toString()] = inv;
    });

    const enrichedAlerts = alerts.map((alert) => {
      const alertObj = alert.toObject();
      alertObj.investigation = invMap[alert._id.toString()] || null;
      return alertObj;
    });

    return res.status(200).json({
      success: true,
      data: enrichedAlerts
    });
  } catch (err) {
    next(err);
  }
};

exports.getAlertById = async (req, res, next) => {
  try {
    const alert = await FraudAlert.findById(req.params.id)
      .populate('userId', 'fullName email phone')
      .populate('assignedTo', 'fullName email')
      .populate('transactionId')
      .populate('riskAssessmentId')
      .populate('evidenceRefs');

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    const investigation = await Investigation.findOne({ alertId: alert._id }).populate('notes.authorId', 'fullName role');

    return res.status(200).json({
      success: true,
      data: { alert, investigation }
    });
  } catch (err) {
    next(err);
  }
};

exports.acknowledgeAlert = async (req, res, next) => {
  try {
    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    alert.acknowledgedBy = req.user._id;
    if (alert.status === 'open') {
      alert.status = 'acknowledged';
    }
    await alert.save();

    return res.status(200).json({
      success: true,
      message: 'Alert acknowledged.',
      data: alert
    });
  } catch (err) {
    next(err);
  }
};

exports.assignAlert = async (req, res, next) => {
  try {
    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    const targetAnalystId = (req.body && req.body.analystId) ? req.body.analystId : req.user._id;

    // Check if case is already assigned
    if (alert.assignedTo) {
      const currentAssignedStr = alert.assignedTo.toString();
      const targetAssignedStr = targetAnalystId.toString();

      // If already assigned to the same analyst, return success idempotently
      if (currentAssignedStr === targetAssignedStr) {
        let investigation = await Investigation.findOne({ alertId: alert._id });
        if (!investigation) {
          investigation = await Investigation.create({
            alertId: alert._id,
            assignedTo: targetAnalystId,
            assignedAt: alert.updatedAt || new Date(),
            startedAt: new Date(),
            status: 'assigned'
          });
        }
        await alert.populate('assignedTo', 'fullName email');
        await alert.populate('userId', 'fullName email phone');
        await alert.populate('transactionId');
        await alert.populate('riskAssessmentId');
        await investigation.populate('assignedTo', 'fullName email');

        return res.status(200).json({
          success: true,
          message: 'Case is already assigned to you.',
          data: { alert, investigation }
        });
      }

      // If assigned to another analyst and caller is not administrator
      if (req.user.role !== 'administrator') {
        return res.status(400).json({
          success: false,
          message: 'This case is already assigned to another analyst.'
        });
      }
    }

    alert.assignedTo = targetAnalystId;
    alert.status = 'underInvestigation';
    await alert.save();

    // Create or update Investigation
    let investigation = await Investigation.findOne({ alertId: alert._id });
    if (!investigation) {
      investigation = await Investigation.create({
        alertId: alert._id,
        assignedTo: targetAnalystId,
        assignedAt: new Date(),
        startedAt: new Date(),
        status: 'assigned'
      });
    } else {
      investigation.assignedTo = targetAnalystId;
      if (!investigation.assignedAt) investigation.assignedAt = new Date();
      if (investigation.status === 'closed' || investigation.status === 'completed') {
        investigation.status = 'inProgress';
      }
      await investigation.save();
    }

    // Populate for frontend
    await alert.populate('assignedTo', 'fullName email');
    await alert.populate('userId', 'fullName email phone');
    await alert.populate('transactionId');
    await alert.populate('riskAssessmentId');
    await investigation.populate('assignedTo', 'fullName email');

    await createAuditEntry({
      userId: req.user._id,
      action: 'ALERT_ASSIGNED',
      entity: 'FraudAlert',
      entityId: alert._id.toString(),
      details: { assignedTo: targetAnalystId },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      success: true,
      message: 'Alert assigned to analyst and investigation opened.',
      data: { alert, investigation }
    });
  } catch (err) {
    next(err);
  }
};

exports.updateAlertStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const alert = await FraudAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    alert.status = status;
    if (['resolvedFraud', 'resolvedFalsePositive', 'closed'].includes(status)) {
      alert.resolvedAt = new Date();
    }
    await alert.save();

    return res.status(200).json({
      success: true,
      message: `Alert status updated to ${status}.`,
      data: alert
    });
  } catch (err) {
    next(err);
  }
};

exports.reportFraud = async (req, res, next) => {
  try {
    const { transactionId, summary } = req.body;
    const countAlerts = await FraudAlert.countDocuments();
    const alertNumber = `FA-${new Date().getFullYear()}-${(countAlerts + 1).toString().padStart(6, '0')}`;

    const alert = await FraudAlert.create({
      alertNumber,
      transactionId: transactionId || null,
      userId: req.user._id,
      alertType: 'transactionFraud',
      severity: 'medium',
      riskScore: 60,
      status: 'open',
      summary: summary || 'Customer reported suspicious fraud activity.'
    });

    return res.status(201).json({
      success: true,
      message: 'Fraud report submitted successfully. Our security team will review it immediately.',
      data: alert
    });
  } catch (err) {
    next(err);
  }
};
