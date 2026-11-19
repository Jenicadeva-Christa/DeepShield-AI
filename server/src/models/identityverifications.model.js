const mongoose = require('mongoose');

const identityVerificationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentType: {
      type: String,
      enum: ['aadhaar', 'pan', 'passport', 'drivingLicense', 'voterId', 'other'],
      required: true
    },
    documentNumberMasked: { type: String },
    documentNumberHash: { type: String },
    verificationMethod: {
      type: String,
      enum: ['document', 'otp', 'biometricFace', 'voice', 'manual'],
      default: 'document'
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'needsReview'],
      default: 'pending'
    },
    documentMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaUpload' },
    selfieMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaUpload' },
    ocrChecks: {
      nameMatched: { type: Boolean },
      dobMatched: { type: Boolean },
      formatValid: { type: Boolean }
    },
    authenticityScore: { type: Number, min: 0, max: 100 },
    faceMatchScore: { type: Number, min: 0, max: 100 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNotes: { type: String },
    verifiedAt: { type: Date },
    reVerificationRequired: { type: Boolean, default: false }
  },
  { timestamps: true }
);

identityVerificationSchema.index({ documentNumberHash: 1 }, { unique: true, sparse: true });
identityVerificationSchema.index({ customerId: 1, verificationStatus: 1 });

module.exports = mongoose.model('IdentityVerification', identityVerificationSchema);
