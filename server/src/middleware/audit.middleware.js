const AuditLog = require('../models/auditlogs.model');
const { hashSHA256 } = require('../utils/crypto.utils');

async function createAuditEntry({ userId, action, entity, entityId, details, ipAddress, userAgent, outcome = 'success' }) {
  try {
    // Get the last audit log to obtain its hash
    const lastLog = await AuditLog.findOne().sort({ timestamp: -1, _id: -1 }).lean();
    const previousHash = lastLog ? lastLog.hash : '0000000000000000000000000000000000000000000000000000000000000000';
    
    const timestamp = new Date();
    const payloadString = [
      previousHash,
      timestamp.toISOString(),
      userId ? userId.toString() : 'anonymous',
      action || '',
      entity || '',
      entityId || '',
      outcome || 'success',
      JSON.stringify(details || {})
    ].join('|');

    const hash = hashSHA256(payloadString);

    const logEntry = new AuditLog({
      userId,
      action,
      entity,
      entityId,
      details,
      ipAddress,
      userAgent,
      outcome,
      timestamp,
      previousHash,
      hash
    });

    await logEntry.save();
    return logEntry;
  } catch (err) {
    console.error(`[Audit Log Error]: ${err.message}`);
  }
}

// Middleware to audit requests automatically
function auditMiddleware(actionName, entityName) {
  return async (req, res, next) => {
    const originalJson = res.json;
    res.json = function (body) {
      res.json = originalJson;
      const outcome = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';
      createAuditEntry({
        userId: req.user ? req.user._id : null,
        action: actionName || `${req.method}_${req.baseUrl}${req.path}`,
        entity: entityName || 'API',
        entityId: req.params.id || null,
        details: { body: req.body, status: res.statusCode },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        outcome
      }).catch(err => console.error(err));
      return res.json(body);
    };
    next();
  };
}

// Verify the integrity of the audit log hash chain
async function verifyAuditChain() {
  const logs = await AuditLog.find().sort({ timestamp: 1, _id: 1 }).lean();
  let isValid = true;
  let brokenIndex = -1;
  let reason = '';

  let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.previousHash !== expectedPrevHash) {
      isValid = false;
      brokenIndex = i;
      reason = `Previous hash mismatch at index ${i} (ID: ${log._id}). Expected: ${expectedPrevHash}, Found: ${log.previousHash}`;
      break;
    }

    const payloadString = [
      log.previousHash,
      new Date(log.timestamp).toISOString(),
      log.userId ? log.userId.toString() : 'anonymous',
      log.action || '',
      log.entity || '',
      log.entityId || '',
      log.outcome || 'success',
      JSON.stringify(log.details || {})
    ].join('|');

    const calculatedHash = hashSHA256(payloadString);
    if (calculatedHash !== log.hash) {
      isValid = false;
      brokenIndex = i;
      reason = `Hash mismatch at index ${i} (ID: ${log._id}). Recalculated: ${calculatedHash}, Stored: ${log.hash}`;
      break;
    }

    expectedPrevHash = log.hash;
  }

  return {
    verified: isValid,
    totalLogs: logs.length,
    brokenIndex,
    reason
  };
}

module.exports = {
  createAuditEntry,
  auditMiddleware,
  verifyAuditChain
};
