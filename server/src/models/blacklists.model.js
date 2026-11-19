const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'domain',
        'url',
        'phoneNumber',
        'email',
        'accountNumber',
        'ipAddress',
        'deviceId',
        'keywordPattern'
      ],
      required: true
    },
    value: { type: String, required: true },
    normalizedValue: { type: String, required: true, lowercase: true, trim: true },
    category: { type: String }, // e.g. phishing, scam, mule account
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'high'
    },
    source: {
      type: String,
      enum: ['government', 'publicDatabase', 'internal', 'analyst'],
      default: 'internal'
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

blacklistSchema.index({ type: 1, normalizedValue: 1 }, { unique: true });

module.exports = mongoose.model('Blacklist', blacklistSchema);
