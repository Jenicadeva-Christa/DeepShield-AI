const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// AES-256-GCM Encryption for sensitive customer fields (address)
function encryptText(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptText(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '[Decryption Failed]';
  }
}

// SHA-256 Hashing
function hashSHA256(text) {
  const str = text !== undefined && text !== null ? text.toString() : '';
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Generate cryptographically secure 6-digit OTP code using Node.js crypto
function generateOTPCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Password Hashing with Bcrypt
async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// JWT Access & Refresh Tokens
function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'deepshield_jwt_secret_key_antigravity_2026_super_secure', {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'deepshield_jwt_refresh_secret_key_antigravity_2026_super_secure', {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'deepshield_jwt_secret_key_antigravity_2026_super_secure');
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'deepshield_jwt_refresh_secret_key_antigravity_2026_super_secure');
}

module.exports = {
  encryptText,
  decryptText,
  hashSHA256,
  generateOTPCode,
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
