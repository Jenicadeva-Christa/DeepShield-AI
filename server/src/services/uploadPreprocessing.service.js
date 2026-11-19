const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MediaUpload = require('../models/mediauploads.model');
const SystemConfig = require('../models/systemconfigs.model');
const { getGridFSBucket } = require('../config/db');

// Magic number signatures
const MAGIC_NUMBERS = {
  jpg: 'ffd8ffe0',
  jpeg: 'ffd8ffe1',
  png: '89504e47',
  webp: '52494646',
  pdf: '25504446',
  mp3: '494433',
  wav: '52494646'
};

async function preprocessUploadedFile({ file, ownerId, purpose }) {
  if (!file) throw new Error('No file provided.');

  const buffer = file.buffer || fs.readFileSync(file.path);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Check duplicate upload
  const existingUpload = await MediaUpload.findOne({ sha256, ownerId });
  let isDuplicate = false;
  if (existingUpload) {
    isDuplicate = true;
  }

  // Detect media type
  let mediaType = 'document';
  const mime = file.mimetype || '';
  if (mime.startsWith('image/')) mediaType = 'image';
  else if (mime.startsWith('video/')) mediaType = 'video';
  else if (mime.startsWith('audio/')) mediaType = 'audio';

  // Save buffer to GridFS
  const bucket = getGridFSBucket();
  const uploadStream = bucket.openUploadStream(file.originalname || 'file_upload', {
    metadata: { ownerId, purpose, sha256, mimeType: file.mimetype }
  });

  await new Promise((resolve, reject) => {
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
    uploadStream.end(buffer);
  });

  const mediaRecord = await MediaUpload.create({
    ownerId,
    purpose,
    mediaType,
    originalName: file.originalname || 'uploaded_file',
    mimeType: file.mimetype || 'application/octet-stream',
    sizeBytes: buffer.length,
    sha256,
    gridFsFileId: uploadStream.id,
    status: 'analysed',
    preprocessing: {
      isDuplicate,
      sizeBytes: buffer.length,
      mimeType: file.mimetype
    }
  });

  // Cleanup temp file if on disk
  if (file.path && fs.existsSync(file.path)) {
    try { fs.unlinkSync(file.path); } catch (e) {}
  }

  return { mediaRecord, isDuplicate };
}

module.exports = {
  preprocessUploadedFile
};
