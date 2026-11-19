const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'FraudAlert' },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    type: {
      type: String,
      enum: [
        'fraudAlert',
        'loginAlert',
        'otp',
        'passwordChange',
        'verificationUpdate',
        'investigationUpdate',
        'systemUpdate'
      ],
      required: true
    },
    channel: {
      type: String,
      enum: ['inApp', 'email', 'sms'],
      default: 'inApp'
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'failed', 'read'],
      default: 'queued'
    },
    sentAt: { type: Date, default: Date.now },
    readAt: { type: Date }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, status: 1, sentAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
