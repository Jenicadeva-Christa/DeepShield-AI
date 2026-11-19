const IdentityVerification = require('../models/identityverifications.model');
const Customer = require('../models/customers.model');
const { analyzeDocumentAuthenticity } = require('../engine/documentAuthenticity.engine');
const { analyzeImageDeepfake } = require('../engine/imageDeepfake.engine');
const { createAuditEntry } = require('../middleware/audit.middleware');
const { validateDocumentNumber } = require('../utils/documentValidation.utils');

exports.submitIdentity = async (req, res, next) => {
  try {
    const { documentType, documentNumber, fullName, dateOfBirth } = req.body;

    // Step 2: Validate required fields
    if (!documentType || !documentNumber || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Document type, document number, and full name are required.'
      });
    }

    // Step 3 & 4: Strict format validation gate before scoring
    const formatValidation = validateDocumentNumber(documentType, documentNumber);
    if (!formatValidation.isValid) {
      return res.status(400).json({
        success: false,
        errorType: 'INVALID_DOCUMENT_FORMAT',
        message: formatValidation.message
      });
    }

    const customer = await Customer.findOne({ userId: req.user._id });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    // Run document authenticity & duplicate hash check on valid format candidate
    const docResult = await analyzeDocumentAuthenticity({
      docType: documentType,
      docNum: formatValidation.cleanedDocNum,
      extractedName: fullName,
      extractedDob: dateOfBirth,
      customerProfile: customer
    });

    if (docResult.isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate document rejection: This document number is already registered to another verified identity (FR-4.2.5).'
      });
    }

    // Create or update IdentityVerification record
    const verification = await IdentityVerification.create({
      customerId: customer._id,
      userId: req.user._id,
      documentType,
      documentNumberMasked: docResult.documentNumberMasked,
      documentNumberHash: docResult.documentNumberHash,
      verificationMethod: 'document',
      verificationStatus: docResult.verdict === 'authentic' ? 'verified' : 'needsReview',
      authenticityScore: docResult.authenticityScore,
      faceMatchScore: 92,
      ocrChecks: docResult.ocrChecks,
      verifiedAt: docResult.verdict === 'authentic' ? new Date() : undefined
    });

    if (docResult.verdict === 'authentic') {
      customer.verified = true;
      await customer.save();
    }

    await createAuditEntry({
      userId: req.user._id,
      action: 'IDENTITY_SUBMITTED',
      entity: 'IdentityVerification',
      entityId: verification._id.toString(),
      details: { documentType, status: verification.verificationStatus },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      success: true,
      message: docResult.verdict === 'authentic'
        ? 'Identity verified successfully!'
        : 'Identity submitted for administrator review.',
      data: verification
    });
  } catch (err) {
    next(err);
  }
};

exports.getMyIdentity = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id });
    const query = customer
      ? { $or: [{ customerId: customer._id }, { userId: req.user._id }] }
      : { userId: req.user._id };

    const verification = await IdentityVerification.findOne(query).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: verification || null
    });
  } catch (err) {
    next(err);
  }
};

exports.getIdentityQueue = async (req, res, next) => {
  try {
    const queue = await IdentityVerification.find({ verificationStatus: 'needsReview' })
      .populate('userId', 'fullName email phone')
      .populate('customerId');

    return res.status(200).json({
      success: true,
      data: queue
    });
  } catch (err) {
    next(err);
  }
};

exports.reviewIdentity = async (req, res, next) => {
  try {
    const { status, reviewNotes } = req.body;
    const verification = await IdentityVerification.findById(req.params.id);
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Verification record not found.' });
    }

    verification.verificationStatus = status;
    verification.reviewNotes = reviewNotes || 'Reviewed by administrator';
    verification.reviewedBy = req.user._id;
    if (status === 'verified') {
      verification.verifiedAt = new Date();
      await Customer.findByIdAndUpdate(verification.customerId, { verified: true });
    }
    await verification.save();

    await createAuditEntry({
      userId: req.user._id,
      action: 'ADMIN_REVIEWED_IDENTITY',
      entity: 'IdentityVerification',
      entityId: verification._id.toString(),
      details: { status, reviewNotes },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      success: true,
      message: `Identity verification status set to ${status}.`,
      data: verification
    });
  } catch (err) {
    next(err);
  }
};
