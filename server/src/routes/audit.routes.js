const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateToken);
router.use(requireRole('administrator'));

router.get('/', auditController.getAuditLogs);
router.get('/verify-chain', auditController.verifyChain);

module.exports = router;
