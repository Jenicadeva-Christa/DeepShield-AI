const express = require('express');
const multer = require('multer');
const router = express.Router();
const detectionController = require('../controllers/detection.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit to support 1-minute video deepfake uploads
});

router.use(authenticateToken);

router.post('/text', detectionController.detectText);
router.post('/url', detectionController.detectText);
router.post('/image', upload.single('file'), detectionController.detectImage);
router.post('/video', upload.single('file'), detectionController.detectVideo);
router.post('/audio', upload.single('file'), detectionController.detectAudio);
router.post('/document', upload.single('file'), detectionController.detectDocument);

router.get('/history', detectionController.getDetectionHistory);

module.exports = router;
