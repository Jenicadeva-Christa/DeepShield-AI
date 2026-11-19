const mongoose = require('mongoose');

const investigationSchema = new mongoose.Schema(
  {
    alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'FraudAlert', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now },
    startedAt: { type: Date },
    closedAt: { type: Date },
    status: {
      type: String,
      enum: ['assigned', 'inProgress', 'awaitingCustomer', 'completed', 'closed'],
      default: 'assigned'
    },
    findings: { type: String },
    remarks: { type: String },
    notes: [
      {
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    outcome: {
      type: String,
      enum: ['confirmedFraud', 'falsePositive', 'inconclusive']
    },
    recommendedAction: {
      type: String,
      enum: ['none', 'blockTransaction', 'suspendAccount', 'requestReverification', 'escalate'],
      default: 'none'
    }
  },
  { timestamps: true }
);

investigationSchema.index({ assignedTo: 1, status: 1 });
investigationSchema.index({ alertId: 1 });

module.exports = mongoose.model('Investigation', investigationSchema);
