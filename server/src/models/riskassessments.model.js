const mongoose = require('mongoose');

const riskAssessmentSchema = new mongoose.Schema(
  {
    subjectType: {
      type: String,
      enum: ['transaction', 'login', 'identityVerification', 'mediaScreening'],
      required: true
    },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    aiScore: { type: Number, required: true, min: 0, max: 100 },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true
    },
    predictionResult: {
      type: String,
      enum: ['approve', 'stepUpAuth', 'block', 'review'],
      required: true
    },
    componentScores: {
      transaction: { type: Number },
      deepfake: { type: Number },
      voice: { type: Number },
      phishing: { type: Number },
      socialEngineering: { type: Number },
      identity: { type: Number }
    },
    weightsUsed: { type: mongoose.Schema.Types.Mixed },
    thresholdsUsed: {
      lowMax: { type: Number, default: 39 },
      mediumMax: { type: Number, default: 69 }
    },
    topFactors: [
      {
        factor: { type: String, required: true },
        contribution: { type: Number },
        explanation: { type: String, required: true }
      }
    ],
    recommendations: [{ type: String }],
    modelId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIModel' },
    assessedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

riskAssessmentSchema.index({ transactionId: 1 });
riskAssessmentSchema.index({ riskLevel: 1, assessedAt: -1 });

module.exports = mongoose.model('RiskAssessment', riskAssessmentSchema);
