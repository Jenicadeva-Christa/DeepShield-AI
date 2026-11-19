const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entity: { type: String },
    entityId: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
    timestamp: { type: Date, default: Date.now, required: true },
    previousHash: { type: String },
    hash: { type: String }
  },
  { timestamps: true }
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ action: 1 });

// Immutable schema level pre-hooks: block updates and deletes (FR-4.13.7)
auditLogSchema.pre('updateOne', function () {
  throw new Error('AuditLog records are immutable and cannot be updated.');
});
auditLogSchema.pre('updateMany', function () {
  throw new Error('AuditLog records are immutable and cannot be updated.');
});
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('AuditLog records are immutable and cannot be updated.');
});
auditLogSchema.pre('deleteOne', function () {
  throw new Error('AuditLog records are immutable and cannot be deleted.');
});
auditLogSchema.pre('deleteMany', function () {
  throw new Error('AuditLog records are immutable and cannot be deleted.');
});
auditLogSchema.pre('findOneAndDelete', function () {
  throw new Error('AuditLog records are immutable and cannot be deleted.');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
