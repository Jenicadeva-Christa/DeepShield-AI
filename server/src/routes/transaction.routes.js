const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { idempotencyGuard } = require('../middleware/idempotency.middleware');

router.use(authenticateToken);

// UPI limits summary endpoint (placed before /:id)
router.get('/limits/upi', requireRole('customer'), transactionController.getUpiLimits);

router.post('/', requireRole('customer'), idempotencyGuard, transactionController.createTransaction);
router.post('/receive', requireRole('customer'), idempotencyGuard, transactionController.receiveTransaction);
router.post('/:transactionId/step-up', requireRole('customer'), transactionController.stepUpTransaction);
router.get('/my', requireRole('customer'), transactionController.getMyTransactions);

router.get('/', requireRole('fraudAnalyst', 'analyst', 'bankingStaff', 'administrator'), transactionController.getTransactions);
router.get('/:id', transactionController.getTransactionById);

module.exports = router;
