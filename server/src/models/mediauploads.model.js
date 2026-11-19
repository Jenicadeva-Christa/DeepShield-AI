const mongoose = require('mongoose');

const mediaUploadSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: {
      type: String,
      enum: [
        'identityDocument',
        'selfie',
        'video',
        'voiceSample',
        'textMessage',
        'emailBody',
        'url',
        'document',
        'supportCall'
      ],
      required: true
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', 'audio', 'text', 'document', 'url'],
      required: true
    },
    originalName: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    sha256: { type: String },
    gridFsFileId: { type: mongoose.Schema.Types.ObjectId },
    textContent: { type: String, maxlength: 20000 },
    status: {
      type: String,
      enum: ['uploaded', 'preprocessing', 'analysed', 'failed', 'purged'],
      default: 'uploaded'
    },
    preprocessing: { type: mongoose.Schema.Types.Mixed },
    relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    retentionUntil: { type: Date }
  },
  { timestamps: true }
);

mediaUploadSchema.index({ sha256: 1 });
mediaUploadSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('MediaUpload', mediaUploadSchema);
