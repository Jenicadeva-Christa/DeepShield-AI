const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: [
        'investigation',
        'fraudSummary',
        'fraudAlertSummary',
        'transactionSummary',
        'aiAccuracy',
        'auditReport',
        'auditTrail',
        'detectionSummary',
        'dashboard'
      ],
      required: true
    },
    format: {
      type: String,
      enum: ['pdf', 'xlsx', 'csv', 'json'],
      default: 'json'
    },
    description: { type: String },
    investigationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investigation' },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    generatedAt: { type: Date, default: Date.now },
    filters: { type: mongoose.Schema.Types.Mixed },
    gridFsFileId: { type: mongoose.Schema.Types.ObjectId },
    fileName: { type: String, default: () => `report_${Date.now()}.json` },
    sizeBytes: { type: Number },
    summary: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['generating', 'completed', 'failed'], default: 'completed' }
  },
  { timestamps: true }
);

reportSchema.index({ generatedBy: 1, generatedAt: -1 });
reportSchema.index({ reportType: 1 });

module.exports = mongoose.model('Report', reportSchema);
