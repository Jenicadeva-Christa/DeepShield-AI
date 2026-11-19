const AuditLog = require('../models/auditlogs.model');
const { verifyAuditChain } = require('../middleware/audit.middleware');

exports.getAuditLogs = async (req, res, next) => {
  try {
    const { action, userId, outcome, page = 1, limit = 50 } = req.query;
    const query = {};

    if (action) query.action = { $regex: action, $options: 'i' };
    if (userId) query.userId = userId;
    if (outcome) query.outcome = outcome;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1, _id: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'fullName email role');

    const total = await AuditLog.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: logs,
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

exports.verifyChain = async (req, res, next) => {
  try {
    const verification = await verifyAuditChain();
    return res.status(200).json({
      success: true,
      message: verification.verified
        ? 'Audit log SHA-256 hash chain integrity verified successfully. No tampering detected.'
        : 'WARNING: Audit log hash chain verification failed. Tampering or data corruption detected!',
      data: verification
    });
  } catch (err) {
    next(err);
  }
};
