const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alert.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateToken);

router.get('/my', alertController.getMyAlerts);
router.get('/stats', requireRole('fraudAnalyst', 'analyst', 'administrator'), alertController.getAnalystStats);
router.post('/report', requireRole('customer'), alertController.reportFraud);

router.get('/', requireRole('fraudAnalyst', 'analyst', 'administrator'), alertController.getAlerts);
router.get('/:id', alertController.getAlertById);
router.patch('/:id/acknowledge', requireRole('fraudAnalyst', 'analyst', 'administrator'), alertController.acknowledgeAlert);
router.patch('/:id/assign', requireRole('fraudAnalyst', 'analyst', 'administrator'), alertController.assignAlert);
router.patch('/:id/status', requireRole('fraudAnalyst', 'analyst', 'administrator'), alertController.updateAlertStatus);

module.exports = router;
