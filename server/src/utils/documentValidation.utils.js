/**
 * Document Number Validation Utility
 * Enforces strict, document-specific format rules across DeepShield AI.
 */

/**
 * Validates an Indian Aadhaar Card number according to strict rules:
 * - Exactly 12 numeric digits
 * - Only numeric digits allowed (no letters, special characters, or symbols)
 * - 11 digits, 13 digits, or any length != 12 must be rejected
 * - Leading/trailing whitespace may be trimmed, but internal spaces/separators are strictly rejected
 * - Empty or whitespace-only values rejected
 * - Never silently truncates or appends missing digits
 */
function validateAadhaar(rawDocNum) {
  if (rawDocNum === undefined || rawDocNum === null || typeof rawDocNum !== 'string') {
    return {
      isValid: false,
      message: 'Aadhaar number must contain exactly 12 digits.'
    };
  }

  const trimmed = rawDocNum.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      message: 'Aadhaar number must contain exactly 12 digits.'
    };
  }

  // Reject internal spaces or separators (rule 8: never silently remove internal whitespace)
  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      message: 'Aadhaar number must contain exactly 12 digits.'
    };
  }

  // Must contain only digits and be exactly 12 characters long
  if (!/^\d{12}$/.test(trimmed)) {
    return {
      isValid: false,
      message: 'Aadhaar number must contain exactly 12 digits.'
    };
  }

  return {
    isValid: true,
    cleanedDocNum: trimmed
  };
}

/**
 * Validates an Indian Permanent Account Number (PAN):
 * - Exactly 10 characters
 * - First 5 characters: uppercase English letters [A-Z]
 * - Next 4 characters: numeric digits [0-9]
 * - Last character: uppercase English letter [A-Z]
 * - Internal spaces/separators are rejected
 */
function validatePAN(rawDocNum) {
  if (rawDocNum === undefined || rawDocNum === null || typeof rawDocNum !== 'string') {
    return {
      isValid: false,
      message: 'PAN is required.'
    };
  }

  const trimmed = rawDocNum.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      message: 'PAN is required.'
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      message: 'PAN must not contain spaces.'
    };
  }

  const normalized = trimmed.toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(normalized)) {
    return {
      isValid: false,
      message: 'PAN must be 10 characters: 5 letters followed by 4 digits and 1 letter (e.g. ABCDE1234F).'
    };
  }

  return {
    isValid: true,
    cleanedDocNum: normalized
  };
}

/**
 * Validates an Indian Passport number:
 * - Exactly 8 characters
 * - First character: uppercase letter [A-Z]
 * - Next 7 characters: numeric digits [0-9]
 * - Internal spaces/separators are rejected
 */
function validatePassport(rawDocNum) {
  if (rawDocNum === undefined || rawDocNum === null || typeof rawDocNum !== 'string') {
    return {
      isValid: false,
      message: 'Passport number is required.'
    };
  }

  const trimmed = rawDocNum.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      message: 'Passport number is required.'
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      message: 'Passport number must not contain spaces.'
    };
  }

  const normalized = trimmed.toUpperCase();
  if (!/^[A-Z]{1}[0-9]{7}$/.test(normalized)) {
    return {
      isValid: false,
      message: 'Passport number must contain 1 letter followed by 7 digits (e.g. A1234567).'
    };
  }

  return {
    isValid: true,
    cleanedDocNum: normalized
  };
}

/**
 * Validates an Indian Driving License:
 * - 2 state code letters followed by 13 digits (15 characters total)
 */
function validateDrivingLicense(rawDocNum) {
  if (rawDocNum === undefined || rawDocNum === null || typeof rawDocNum !== 'string') {
    return {
      isValid: false,
      message: 'Driving license number is required.'
    };
  }

  const trimmed = rawDocNum.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      message: 'Driving license number is required.'
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      message: 'Driving license number must not contain spaces.'
    };
  }

  const normalized = trimmed.toUpperCase();
  if (!/^[A-Z]{2}[0-9]{13}$/.test(normalized)) {
    return {
      isValid: false,
      message: 'Driving license must contain 2 state code letters followed by 13 digits (e.g. DL1420110012345).'
    };
  }

  return {
    isValid: true,
    cleanedDocNum: normalized
  };
}

/**
 * Dispatches validation based on the selected document type.
 */
function validateDocumentNumber(docType, rawDocNum) {
  const normalizedType = (docType || '').trim().toLowerCase();

  switch (normalizedType) {
    case 'aadhaar':
      return validateAadhaar(rawDocNum);
    case 'pan':
      return validatePAN(rawDocNum);
    case 'passport':
      return validatePassport(rawDocNum);
    case 'drivinglicense':
      return validateDrivingLicense(rawDocNum);
    default:
      return {
        isValid: false,
        message: `Unsupported document type: ${docType}`
      };
  }
}

module.exports = {
  validateAadhaar,
  validatePAN,
  validatePassport,
  validateDrivingLicense,
  validateDocumentNumber
};
