const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['transfer', 'upi', 'cardPayment', 'withdrawal', 'billPayment', 'deposit'],
      required: true
    },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    channel: {
      type: String,
      enum: ['web', 'mobile', 'atm', 'branch', 'upi', 'card', 'transfer', 'netbanking'],
      default: 'web'
    },
    description: { type: String },
    payee: {
      name: { type: String },
      accountNumber: { type: String },
      bank: { type: String },
      isNew: { type: Boolean, default: false },
      upiId: { type: String },
      category: { type: String, enum: ['p2p', 'verifiedMerchant', 'merchant', 'hospital', 'educational'], default: 'p2p' },
      isMerchant: { type: Boolean, default: false }
    },
    idempotencyKey: { type: String, sparse: true, index: true },
    location: {
      city: { type: String },
      country: { type: String, default: 'India' },
      lat: { type: Number },
      lng: { type: Number }
    },
    device: {
      deviceId: { type: String },
      ipAddress: { type: String },
      userAgent: { type: String },
      isKnown: { type: Boolean, default: true }
    },
    timestamp: { type: Date, default: Date.now, required: true },
    status: {
      type: String,
      enum: ['initiated', 'pendingStepUp', 'approved', 'completed', 'blocked', 'underReview', 'rejected'],
      default: 'initiated'
    },
    riskAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    stepUp: {
      required: { type: Boolean, default: false },
      verified: { type: Boolean, default: false },
      attempts: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

transactionSchema.index({ customerId: 1, timestamp: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ riskLevel: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
