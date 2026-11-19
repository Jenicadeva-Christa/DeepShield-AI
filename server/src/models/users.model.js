const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['customer', 'administrator', 'fraudAnalyst', 'analyst', 'bankingStaff'],
      default: 'customer',
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'locked', 'suspended'],
      default: 'active',
      required: true
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
