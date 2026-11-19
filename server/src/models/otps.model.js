const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: {
      type: String,
      enum: ['login', 'registration', 'passwordReset', 'transactionStepUp'],
      required: true
    },
    channel: {
      type: String,
      enum: ['email', 'sms', 'inApp'],
      default: 'email'
    },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0, max: 3 },
    consumed: { type: Boolean, default: false },
    sessionId: { type: String },
    relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ userId: 1, purpose: 1 });
otpSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Otp', otpSchema);
