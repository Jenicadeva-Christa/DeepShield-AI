const crypto = require('crypto');
const IdentityVerification = require('../models/identityverifications.model');
const { validateDocumentNumber } = require('../utils/documentValidation.utils');

const DOCUMENT_PATTERNS = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  aadhaar: /^[2-9]{1}[0-9]{11}$/,
  passport: /^[A-Z]{1}[0-9]{7}$/,
  drivingLicense: /^[A-Z]{2}[0-9]{13}$/
};

// Verhoeff Algorithm for Aadhaar 12-digit Checksum Validation
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

function validateVerhoeff(numStr) {
  let c = 0;
  const inverted = numStr.split('').reverse().map(Number);
  for (let i = 0; i < inverted.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][inverted[i]]];
  }
  return c === 0;
}

// Known Impersonation & Non-Resident Foreign Celebrity / Fictional Entities
const KNOWN_IMPERSONATION_NAMES = [
  'elon musk',
  'donald trump',
  'joe biden',
  'vladimir putin',
  'mark zuckerberg',
  'bill gates',
  'jeff bezos',
  'barack obama',
  'sundar pichai',
  'satya nadella',
  'mickey mouse',
  'batman',
  'superman',
  'test user',
  'fake name',
  'sample user',
  'dummy person'
];

function hashSaltedDocumentNumber(docNum) {
  const salt = 'deepshield_identity_salt_2026';
  const cleaned = (docNum || '').replace(/\s+/g, '').toUpperCase();
  return crypto.createHash('sha256').update(cleaned + salt).digest('hex');
}

function validateDocumentFormat(docType, docNum) {
  return validateDocumentNumber(docType, docNum).isValid;
}

async function analyzeDocumentAuthenticity({ docType, docNum, extractedName, extractedDob, customerProfile }) {
  const startTime = Date.now();

  // Strict format validation gate: Invalid format never receives an authenticity score
  const formatCheck = validateDocumentNumber(docType, docNum);
  if (!formatCheck.isValid) {
    return {
      verdict: 'invalid',
      authenticityScore: null,
      confidence: 0,
      isDuplicate: false,
      isImpersonation: false,
      documentNumberHash: null,
      documentNumberMasked: null,
      ocrChecks: {
        nameMatched: false,
        dobMatched: false,
        formatValid: false,
        isImpersonation: false
      },
      indicators: [
        {
          name: 'Document Number Format Error',
          value: docNum,
          weight: 1.0,
          explanation: formatCheck.message
        }
      ],
      processingMs: Date.now() - startTime
    };
  }

  const cleanedDocNum = formatCheck.cleanedDocNum;
  const docHash = hashSaltedDocumentNumber(cleanedDocNum);
  const normalizedExtractedName = (extractedName || '').trim().toLowerCase();

  const indicators = [];
  let score = 100; // Starts at 100 authenticity score for valid candidate

  // 1. Check duplicate document number hash across all customer verifications
  const existingDoc = await IdentityVerification.findOne({
    documentNumberHash: docHash,
    verificationStatus: 'verified'
  });

  let isDuplicate = false;
  if (existingDoc) {
    isDuplicate = true;
    score -= 80;
    indicators.push({
      name: 'Duplicate Document Rejection',
      value: 'Duplicate Detected',
      weight: 0.80,
      explanation: 'CRITICAL: This document number is already registered to another verified identity in the system (FR-4.2.5).'
    });
  }

  // 2. Format Validation Passed
  indicators.push({
    name: 'Document Format Validated',
    value: 'Valid Format',
    weight: 0.0,
    explanation: `Document number matches standard ${docType.toUpperCase()} formatting pattern.`
  });

  // 3. Impersonation / Celebrity / Fictitious Identity Check
  let isImpersonation = false;
  for (const fakeName of KNOWN_IMPERSONATION_NAMES) {
    if (normalizedExtractedName.includes(fakeName)) {
      isImpersonation = true;
      score -= 90;
      indicators.push({
        name: 'High-Profile Impersonation / Troll ID Detected',
        value: extractedName,
        weight: 0.90,
        explanation: `CRITICAL FRAUD: Name '${extractedName}' matches known foreign public figure or fictitious entity who does not hold a domestic Indian ${docType.toUpperCase()}. Document flagged as synthetic forgery.`
      });
      break;
    }
  }

  // 4. Name Match Check with Customer Profile
  let nameMatched = true;
  if (extractedName && customerProfile?.fullName) {
    const pName = customerProfile.fullName.toLowerCase();
    const eName = normalizedExtractedName;
    if (!pName.includes(eName) && !eName.includes(pName)) {
      nameMatched = false;
      score -= 45;
      indicators.push({
        name: 'KYC Profile Name Mismatch',
        value: `${extractedName} vs ${customerProfile.fullName}`,
        weight: 0.45,
        explanation: `Extracted document name '${extractedName}' does not match registered account holder name '${customerProfile.fullName}'.`
      });
    } else {
      indicators.push({
        name: 'Profile Identity Corroboration',
        value: 'Name Matches Account Holder',
        weight: 0.0,
        explanation: 'Document name successfully matches customer registered banking profile.'
      });
    }
  }

  const finalAuthenticityScore = Math.max(0, score);
  const confidence = 0.90;

  let verdict = 'authentic';
  if (finalAuthenticityScore < 40 || isDuplicate || isImpersonation) verdict = 'malicious';
  else if (finalAuthenticityScore < 70 || !nameMatched) verdict = 'suspicious';

  return {
    verdict,
    authenticityScore: finalAuthenticityScore,
    confidence,
    isDuplicate,
    isImpersonation,
    documentNumberHash: docHash,
    documentNumberMasked: cleanedDocNum.length > 4 ? `XXXX-XXXX-${cleanedDocNum.slice(-4)}` : cleanedDocNum,
    ocrChecks: {
      nameMatched,
      dobMatched: true,
      formatValid: true,
      isImpersonation
    },
    indicators,
    processingMs: Date.now() - startTime
  };
}

module.exports = {
  analyzeDocumentAuthenticity,
  hashSaltedDocumentNumber,
  validateDocumentFormat,
  validateDocumentNumber,
  validateVerhoeff,
  KNOWN_IMPERSONATION_NAMES
};
