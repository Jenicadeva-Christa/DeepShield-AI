const express = require('express');
const router = express.Router();
const identityController = require('../controllers/identity.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateToken);

router.post('/submit', requireRole('customer'), identityController.submitIdentity);
router.get('/me', requireRole('customer'), identityController.getMyIdentity);

router.get('/queue', requireRole('administrator'), identityController.getIdentityQueue);
router.patch('/:id/review', requireRole('administrator'), identityController.reviewIdentity);

module.exports = router;
