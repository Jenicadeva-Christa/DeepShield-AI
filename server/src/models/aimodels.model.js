const mongoose = require('mongoose');

const aiModelSchema = new mongoose.Schema(
  {
    modelName: { type: String, required: true },
    modelType: {
      type: String,
      enum: [
        'imageDeepfake',
        'videoDeepfake',
        'voiceFraud',
        'phishing',
        'socialEngineering',
        'documentAuthenticity',
        'transactionAnomaly',
        'riskFusion'
      ],
      required: true
    },
    algorithm: { type: String, required: true },
    version: { type: String, required: true, default: '1.0.0' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'training', 'deprecated'],
      default: 'active'
    },
    accuracy: { type: Number },
    evaluationNotes: { type: String },
    trainedAt: { type: Date, default: Date.now },
    parameters: { type: mongoose.Schema.Types.Mixed },
    artifactFileId: { type: mongoose.Schema.Types.ObjectId },
    trainingSummary: {
      trainSamples: { type: Number },
      validationSamples: { type: Number },
      testSamples: { type: Number },
      dataSource: { type: String, default: 'bootstrap' },
      precision: { type: Number },
      recall: { type: Number },
      f1: { type: Number },
      confusionMatrix: { type: mongoose.Schema.Types.Mixed }
    }
  },
  { timestamps: true }
);

aiModelSchema.index({ modelType: 1, status: 1 });
aiModelSchema.index({ modelName: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('AIModel', aiModelSchema);
