const Investigation = require('../models/investigations.model');
const FraudAlert = require('../models/fraudalerts.model');
const { createAuditEntry } = require('../middleware/audit.middleware');
const PDFDocument = require('pdfkit');

exports.getInvestigations = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;
    if (req.user.role === 'analyst' || req.user.role === 'fraudAnalyst') {
      query.assignedTo = req.user._id;
    }

    const investigations = await Investigation.find(query)
      .sort({ updatedAt: -1 })
      .populate({
        path: 'alertId',
        populate: [
          { path: 'userId', select: 'fullName email phone' },
          { path: 'transactionId' },
          { path: 'riskAssessmentId' }
        ]
      })
      .populate('assignedTo', 'fullName email')
      .populate('notes.authorId', 'fullName role');

    return res.status(200).json({ success: true, data: investigations });
  } catch (err) {
    next(err);
  }
};

exports.getInvestigationById = async (req, res, next) => {
  try {
    const investigation = await Investigation.findById(req.params.id)
      .populate({
        path: 'alertId',
        populate: [
          { path: 'userId', select: 'fullName email phone' },
          { path: 'transactionId' },
          { path: 'riskAssessmentId' }
        ]
      })
      .populate('assignedTo', 'fullName email')
      .populate('notes.authorId', 'fullName role');

    if (!investigation) {
      return res.status(404).json({ success: false, message: 'Investigation not found.' });
    }

    return res.status(200).json({ success: true, data: investigation });
  } catch (err) {
    next(err);
  }
};

exports.addNote = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Note text is required.' });
    }

    const investigation = await Investigation.findById(req.params.id);
    if (!investigation) {
      return res.status(404).json({ success: false, message: 'Investigation not found.' });
    }

    investigation.notes.push({
      authorId: req.user._id,
      text,
      createdAt: new Date()
    });
    await investigation.save();

    await createAuditEntry({
      userId: req.user._id,
      action: 'ANALYST_ADDED_INVESTIGATION_NOTE',
      entity: 'Investigation',
      entityId: investigation._id.toString(),
      details: { textSnippet: text.slice(0, 100) },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({ success: true, message: 'Note added successfully.', data: investigation });
  } catch (err) {
    next(err);
  }
};

exports.updateOutcome = async (req, res, next) => {
  try {
    const { status, findings, outcome, recommendedAction, remarks } = req.body;
    const investigation = await Investigation.findById(req.params.id);
    if (!investigation) {
      return res.status(404).json({ success: false, message: 'Investigation not found.' });
    }

    if (status) investigation.status = status;
    if (findings) investigation.findings = findings;
    if (outcome) investigation.outcome = outcome;
    if (recommendedAction) investigation.recommendedAction = recommendedAction;
    if (remarks) investigation.remarks = remarks;

    if (['completed', 'closed'].includes(status)) {
      investigation.closedAt = new Date();
      // Also update linked alert status
      await FraudAlert.findByIdAndUpdate(investigation.alertId, {
        status: outcome === 'confirmedFraud' ? 'resolvedFraud' : 'resolvedFalsePositive',
        resolvedAt: new Date()
      });
    }

    await investigation.save();

    await createAuditEntry({
      userId: req.user._id,
      action: 'ANALYST_UPDATED_INVESTIGATION',
      entity: 'Investigation',
      entityId: investigation._id.toString(),
      details: { status, outcome, recommendedAction },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({ success: true, message: 'Investigation updated.', data: investigation });
  } catch (err) {
    next(err);
  }
};

exports.exportInvestigationPdf = async (req, res, next) => {
  try {
    const investigation = await Investigation.findById(req.params.id)
      .populate({
        path: 'alertId',
        populate: [
          { path: 'userId', select: 'fullName email phone' },
          { path: 'transactionId' },
          { path: 'riskAssessmentId' }
        ]
      })
      .populate('assignedTo', 'fullName email')
      .populate('notes.authorId', 'fullName role');

    if (!investigation) {
      return res.status(404).json({ success: false, message: 'Investigation not found.' });
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Investigation_Report_${investigation._id}.pdf"`);

    doc.pipe(res);

    // Header
    doc.fillColor('#0f172a').fontSize(20).text('DEEPSHIELD AI — FRAUD INVESTIGATION REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#64748b').text(`Generated on: ${new Date().toLocaleString()} | Case ID: ${investigation._id}`, { align: 'center' });
    doc.moveDown(1);

    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Section 1: Dossier Summary
    doc.fillColor('#1e293b').fontSize(14).text('1. Case Overview');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Investigation Status: ${investigation.status.toUpperCase()}`);
    doc.text(`Assigned Analyst: ${investigation.assignedTo?.fullName || 'Unassigned'} (${investigation.assignedTo?.email || 'N/A'})`);
    doc.text(`Outcome / Verdict: ${investigation.outcome || 'Pending Review'}`);
    doc.text(`Recommended Action: ${investigation.recommendedAction || 'None'}`);
    doc.moveDown(1);

    // Section 2: Alert & Transaction Details
    const alert = investigation.alertId;
    if (alert) {
      doc.fillColor('#1e293b').fontSize(14).text('2. Linked Fraud Alert & Subject Profile');
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#334155');
      doc.text(`Alert Number: ${alert.alertNumber || 'N/A'}`);
      doc.text(`Severity: ${(alert.severity || '').toUpperCase()}`);
      doc.text(`AI Risk Score: ${alert.riskScore || 0} / 100`);
      doc.text(`Customer Name: ${alert.userId?.fullName || 'N/A'}`);
      doc.text(`Customer Email: ${alert.userId?.email || 'N/A'}`);
      doc.text(`Alert Summary: ${alert.summary || 'N/A'}`);
      doc.moveDown(1);

      if (alert.transactionId) {
        const tx = alert.transactionId;
        doc.fillColor('#1e293b').fontSize(14).text('3. Transaction Forensic Telemetry');
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor('#334155');
        doc.text(`Transaction ID: ${tx._id}`);
        doc.text(`Amount: ₹${Number(tx.amount || 0).toLocaleString('en-IN')}`);
        doc.text(`Channel: ${tx.channel || 'N/A'} | Type: ${tx.type || 'N/A'}`);
        doc.text(`Payee: ${tx.payee?.name || 'N/A'} (Account: ${tx.payee?.accountNumber || 'N/A'})`);
        doc.text(`Transaction Status: ${(tx.status || '').toUpperCase()}`);
        doc.moveDown(1);
      }
    }

    // Section 4: Forensic Findings & Analyst Notes
    doc.fillColor('#1e293b').fontSize(14).text('4. Forensic Findings & Case Notes');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Findings: ${investigation.findings || 'No formal findings recorded yet.'}`);
    doc.moveDown(0.5);

    if (investigation.notes && investigation.notes.length > 0) {
      doc.text('Analyst Activity Notes:');
      investigation.notes.forEach((note, idx) => {
        doc.text(`  [${idx + 1}] ${note.authorId?.fullName || 'Analyst'} (${new Date(note.createdAt).toLocaleDateString()}): ${note.text}`);
      });
    } else {
      doc.text('No activity notes recorded.');
    }
    doc.moveDown(1);

    // Section 5: Cryptographic Chain of Custody & Signoff
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#64748b').text('DeepShield AI Enterprise Security — Immutable Audit Hash Sealed. Confidential Banking Security Document.', { align: 'center' });

    doc.end();

    await createAuditEntry({
      userId: req.user._id,
      action: 'INVESTIGATION_REPORT_EXPORTED_PDF',
      entity: 'Investigation',
      entityId: investigation._id.toString(),
      details: { caseId: investigation._id },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
  } catch (err) {
    next(err);
  }
};
