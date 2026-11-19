const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateToken);
router.use(requireRole('administrator'));

// Dashboard Stats
router.get('/dashboard-stats', adminController.getDashboardStats);

// Configs
router.get('/configs', adminController.getConfigs);
router.put('/configs/:key', adminController.updateConfig);

// Blacklists
router.get('/blacklists', adminController.getBlacklists);
router.post('/blacklists', adminController.addBlacklist);
router.delete('/blacklists/:id', adminController.removeBlacklist);

// AI Models
router.get('/models', adminController.getAIModels);
router.post('/models/seed', adminController.seedAIModels);
router.patch('/models/:id', adminController.updateAIModelStatus);

module.exports = router;
