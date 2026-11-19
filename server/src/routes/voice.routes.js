const express = require('express');
const multer = require('multer');
const router = express.Router();
const voiceController = require('../controllers/voice.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max voice upload
});

// All voice routes require valid JWT authentication
router.use(authenticateToken);

router.post('/recognize', upload.single('file'), voiceController.recognizeVoice);
router.get('/history', voiceController.getVoiceHistory);
router.get('/model/status', voiceController.getModelStatus);
router.get('/:id', voiceController.getVoiceRecordById);

module.exports = router;
