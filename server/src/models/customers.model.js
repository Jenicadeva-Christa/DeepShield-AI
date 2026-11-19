const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    accountNumber: { type: String, required: true, unique: true },
    balance: { type: Number, default: 100000, min: 0 },
    currency: { type: String, default: 'INR' },
    address: { type: String }, // Encrypted with AES-256-GCM
    dateOfBirth: { type: Date },
    gender: { type: String },
    idProofType: { type: String },
    verified: { type: Boolean, default: false },
    voiceProfile: {
      mfccMean: [{ type: Number }],
      sampleCount: { type: Number, default: 0 },
      enrolledAt: { type: Date }
    },
    baseline: {
      averageAmount: { type: Number, default: 5000 },
      stdAmount: { type: Number, default: 2500 },
      averageDeposit: { type: Number, default: 25000 },
      stdDeposit: { type: Number, default: 12000 },
      usualHours: [{ type: Number }],
      usualCities: [{ type: String }],
      knownDeviceIds: [{ type: String }],
      knownPayees: [{ type: String }],
      knownSenders: [{ type: String }],
      lastLocation: {
        lat: { type: Number },
        lng: { type: Number },
        at: { type: Date }
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
