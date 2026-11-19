const mongoose = require('mongoose');

const idempotencySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true },
    requestHash: { type: String },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    responseCode: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-expire after 24 hours
  },
  { timestamps: true }
);

module.exports = mongoose.model('Idempotency', idempotencySchema);
