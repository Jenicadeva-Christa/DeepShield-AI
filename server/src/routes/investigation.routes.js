const express = require('express');
const router = express.Router();
const investigationController = require('../controllers/investigation.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateToken);
router.use(requireRole('administrator', 'fraudAnalyst', 'analyst'));

router.get('/', investigationController.getInvestigations);
router.get('/:id/pdf', investigationController.exportInvestigationPdf);
router.get('/:id', investigationController.getInvestigationById);
router.post('/:id/notes', investigationController.addNote);
router.patch('/:id/outcome', investigationController.updateOutcome);

module.exports = router;
