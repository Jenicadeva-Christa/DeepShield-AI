const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateToken);

router.get('/transactions', reportController.generateTransactionReport);
router.get('/fraud', requireRole('administrator', 'analyst'), reportController.generateFraudReport);
router.get('/audit', requireRole('administrator'), reportController.generateAuditReport);
router.get('/detections', requireRole('administrator', 'analyst'), reportController.generateDetectionReport);
router.get('/', requireRole('administrator', 'analyst'), reportController.listReports);

module.exports = router;
