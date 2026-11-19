const mongoose = require('mongoose');

const authenticationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    loginTime: { type: Date, default: Date.now },
    logoutTime: { type: Date },
    loginStatus: {
      type: String,
      enum: ['passwordFailed', 'otpPending', 'success', 'failed', 'locked', 'loggedOut'],
      default: 'otpPending'
    },
    otpStatus: {
      type: String,
      enum: ['notRequired', 'sent', 'verified', 'failed', 'expired'],
      default: 'notRequired'
    },
    isVerified: { type: Boolean, default: false },
    sessionId: { type: String },
    refreshTokenHash: { type: String, select: false },
    failureReason: { type: String }
  },
  { timestamps: true }
);

authenticationSchema.index({ userId: 1, loginTime: -1 });
authenticationSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Authentication', authenticationSchema);
