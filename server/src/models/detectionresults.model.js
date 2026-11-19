const mongoose = require('mongoose');

const detectionResultSchema = new mongoose.Schema(
  {
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaUpload' },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    module: {
      type: String,
      enum: [
        'imageDeepfake',
        'videoDeepfake',
        'voiceFraud',
        'phishing',
        'socialEngineering',
        'documentAuthenticity',
        'transactionAnomaly'
      ],
      required: true
    },
    verdict: {
      type: String,
      enum: ['authentic', 'safe', 'inconclusive', 'suspicious', 'manipulated', 'malicious'],
      required: true
    },
    score: { type: Number, required: true, min: 0, max: 100 },
    confidence: { type: Number, required: true, min: 0, max: 0.9 }, // Capped at 0.90 per Section 9.1
    indicators: [
      {
        name: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed },
        weight: { type: Number },
        explanation: { type: String, required: true }
      }
    ],
    perFrame: [
      {
        timeSec: { type: Number },
        score: { type: Number }
      }
    ],
    modelId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIModel' },
    modelVersion: { type: String },
    processingMs: { type: Number },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'completed'
    },
    errorMessage: { type: String }
  },
  { timestamps: true }
);

detectionResultSchema.index({ mediaId: 1 });
detectionResultSchema.index({ module: 1, createdAt: -1 });
detectionResultSchema.index({ userId: 1 });

module.exports = mongoose.model('DetectionResult', detectionResultSchema);
