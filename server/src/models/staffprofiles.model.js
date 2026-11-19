const mongoose = require('mongoose');

const staffProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    employeeId: { type: String, required: true, unique: true },
    department: { type: String },
    designation: { type: String },
    activeCaseCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('StaffProfile', staffProfileSchema);
