const mongoose = require('mongoose');

const fraudAlertSchema = new mongoose.Schema(
  {
    alertNumber: { type: String, required: true, unique: true }, // Format: FA-YYYY-000001
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    riskAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    alertType: {
      type: String,
      enum: [
        'deepfake',
        'voiceFraud',
        'phishing',
        'socialEngineering',
        'transactionFraud',
        'identityFraud',
        'suspiciousLogin'
      ],
      required: true
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true
    },
    riskScore: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        'open',
        'acknowledged',
        'underInvestigation',
        'resolvedFraud',
        'resolvedFalsePositive',
        'closed',
        'archived'
      ],
      default: 'open'
    },
    summary: { type: String, required: true },
    evidenceRefs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DetectionResult' }],
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    alertTime: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    archivedAt: { type: Date }
  },
  { timestamps: true }
);

fraudAlertSchema.index({ status: 1, severity: 1, alertTime: -1 });
fraudAlertSchema.index({ assignedTo: 1 });

module.exports = mongoose.model('FraudAlert', fraudAlertSchema);
