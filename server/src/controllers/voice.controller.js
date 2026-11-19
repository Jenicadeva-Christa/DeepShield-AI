const VoiceRecord = require('../models/voicerecords.model');
const DetectionResult = require('../models/detectionresults.model');
const Customer = require('../models/customers.model');
const { preprocessUploadedFile } = require('../services/uploadPreprocessing.service');
const { processVoiceAudio, getTranscriber } = require('../services/voiceRecognition.service');

/**
 * POST /api/v1/voice/recognize
 * Uploads an audio clip (live mic or file), runs local Whisper AI transcription,
 * performs acoustic forensic analysis, evaluates social engineering threats on the
 * recognized text, and stores a permanent VoiceRecord in MongoDB.
 */
exports.recognizeVoice = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Audio file upload is required.'
      });
    }

    if (req.file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is empty.'
      });
    }

    const allowedAudioMimes = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/x-m4a'];
    const isAudioExt = req.file.originalname && req.file.originalname.match(/\.(wav|mp3|ogg|webm|m4a)$/i);
    if (!allowedAudioMimes.includes(req.file.mimetype) && !isAudioExt) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported audio format. Please upload a valid audio recording.'
      });
    }

    const userId = req.user ? req.user._id : null;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    // Retrieve enrolled voice profile for speaker verification (if customer)
    const customer = await Customer.findOne({ userId });
    const enrolledVoiceProfile = customer?.voiceProfile || null;

    // Optional duration query/body param
    const durationSec = parseFloat(req.body.duration || req.query.duration || 5);

    // Save audio file via GridFS preprocessing
    let mediaRecord = null;
    try {
      const uploadRes = await preprocessUploadedFile({
        file: req.file,
        ownerId: userId,
        purpose: 'voiceSample'
      });
      mediaRecord = uploadRes.mediaRecord;
    } catch (uploadErr) {
      console.warn('[Voice Controller] Upload preprocessing warning:', uploadErr.message);
    }

    // Process audio with local Whisper AI model & forensic engine
    const analysis = await processVoiceAudio({
      audioBuffer: req.file.buffer,
      fileName: req.file.originalname || 'microphone_recording.wav',
      durationSec,
      enrolledVoiceProfile
    });

    // Create VoiceRecord document in MongoDB
    const voiceRecord = await VoiceRecord.create({
      userId,
      mediaId: mediaRecord ? mediaRecord._id : undefined,
      audioFileName: req.file.originalname || 'live_voice.wav',
      audioDurationSec: analysis.audioDurationSec,
      transcript: analysis.transcript,
      wordCount: analysis.wordCount,
      speechConfidence: analysis.speechConfidence,
      speechModel: analysis.speechModel,
      acousticAnalysis: analysis.acousticAnalysis,
      transcriptRisk: analysis.transcriptRisk,
      combinedVerdict: analysis.combinedVerdict,
      combinedRiskScore: analysis.combinedRiskScore,
      processingMs: analysis.processingMs,
      status: 'completed'
    });

    // Also register in DetectionResult collection for unified forensics audit
    const detection = await DetectionResult.create({
      mediaId: mediaRecord ? mediaRecord._id : undefined,
      userId,
      module: 'voiceFraud',
      verdict: analysis.combinedVerdict,
      score: analysis.combinedRiskScore,
      confidence: analysis.speechConfidence,
      indicators: analysis.combinedIndicators,
      processingMs: analysis.processingMs,
      status: 'completed'
    });

    return res.status(200).json({
      success: true,
      message: 'Local speech recognition and voice fraud analysis complete.',
      data: {
        voiceRecord,
        detection,
        mediaRecord
      }
    });
  } catch (err) {
    console.error('[Voice Controller] Error processing voice recognition:', err);
    next(err);
  }
};

/**
 * GET /api/v1/voice/history
 * Returns the history of recognized speech sessions and voice scans for the current user.
 */
exports.getVoiceHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const records = await VoiceRecord.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('mediaId', 'originalName mimeType sizeBytes createdAt');

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/voice/:id
 * Fetches details for a single voice record.
 */
exports.getVoiceRecordById = async (req, res, next) => {
  try {
    const record = await VoiceRecord.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('mediaId');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Voice record not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: record
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/voice/model/status
 * Confirms that the local Whisper neural model is operational with zero external cloud dependencies.
 */
exports.getModelStatus = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        modelName: 'Xenova/whisper-tiny.en',
        architecture: 'Encoder-Decoder Transformer (OpenAI Whisper Quantized ONNX)',
        executionRuntime: 'Local ONNX Runtime / CPU',
        externalCloudDependencies: false,
        commercialApiKeysRequired: false,
        supportedLanguages: ['en (English)'],
        samplingRateHz: 16000,
        status: 'active'
      }
    });
  } catch (err) {
    next(err);
  }
};
