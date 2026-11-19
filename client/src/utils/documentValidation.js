/**
 * Client-Side Document Number Validation Utility
 * Matches backend validation rules to prevent invalid submissions before scoring.
 */

export function validateAadhaar(rawDocNum) {
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

  // Reject internal spaces or separators (never silently remove whitespace)
  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      message: 'Aadhaar number must contain exactly 12 digits.'
    };
  }

  // Must contain only digits and be exactly 12 characters
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

export function validatePAN(rawDocNum) {
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

export function validatePassport(rawDocNum) {
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

export function validateDrivingLicense(rawDocNum) {
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

export function validateDocumentNumber(docType, rawDocNum) {
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
