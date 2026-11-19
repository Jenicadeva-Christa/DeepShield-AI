import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileCheck, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { validateDocumentNumber } from '../../utils/documentValidation';

export default function VerifyIdentity() {
  const [formData, setFormData] = useState({
    documentType: 'aadhaar',
    documentNumber: '999988887777',
    fullName: 'Rajesh Kumar',
    dateOfBirth: '1995-05-15'
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [submissionError, setSubmissionError] = useState('');

  // Restore previously saved verification from MongoDB on mount
  useEffect(() => {
    async function loadPreviousVerification() {
      try {
        const res = await axios.get('/api/v1/identity/me');
        if (res.data.success && res.data.data) {
          setResult(res.data.data);
          setFormData((prev) => ({
            ...prev,
            documentType: res.data.data.documentType || prev.documentType,
            documentNumber: res.data.data.maskedDocumentNumber || prev.documentNumber,
            fullName: res.data.data.fullName || prev.fullName
          }));
        }
      } catch (err) {
        console.warn('Could not restore previous identity record:', err.message);
      }
    }
    loadPreviousVerification();
  }, []);

  const handleDocumentTypeChange = (e) => {
    const newDocType = e.target.value;
    setFormData(prev => ({ ...prev, documentType: newDocType }));
    // Clear stale result and re-validate if document number is present
    setResult(null);
    setSubmissionError('');
    if (formData.documentNumber) {
      const check = validateDocumentNumber(newDocType, formData.documentNumber);
      setValidationError(check.isValid ? '' : check.message);
    } else {
      setValidationError('');
    }
  };

  const handleDocumentNumberChange = (e) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, documentNumber: val }));
    // Clear stale result whenever user alters the document number
    setResult(null);
    setSubmissionError('');

    // Dynamic validation
    if (val.trim()) {
      const check = validateDocumentNumber(formData.documentType, val);
      setValidationError(check.isValid ? '' : check.message);
    } else {
      setValidationError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmissionError('');

    // Step 1: Pre-submission format validation gate
    const validation = validateDocumentNumber(formData.documentType, formData.documentNumber);
    if (!validation.isValid) {
      setValidationError(validation.message);
      setResult(null);
      toast.error(validation.message);
      return;
    }

    setValidationError('');
    setLoading(true);
    setResult(null);

    try {
      const res = await axios.post('/api/v1/identity/submit', {
        documentType: formData.documentType,
        documentNumber: validation.cleanedDocNum,
        fullName: formData.fullName.trim(),
        dateOfBirth: formData.dateOfBirth
      });

      if (res.data.success) {
        setResult(res.data.data);
        toast.success(res.data.message);
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Identity verification submission failed.';
      const isFormatErr = err.response?.data?.errorType === 'INVALID_DOCUMENT_FORMAT';
      if (isFormatErr) {
        setValidationError(errMsg);
      } else {
        setSubmissionError(errMsg);
      }
      setResult(null);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const docTypeLabel = formData.documentType === 'aadhaar'
    ? 'Aadhaar'
    : formData.documentType === 'pan'
    ? 'PAN'
    : formData.documentType === 'passport'
    ? 'Passport'
    : formData.documentType.toUpperCase();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 text-white">Customer Identity Verification</h2>
          <p className="text-xs text-blue-100 mt-1">Aadhaar, PAN, Passport OCR validation &amp; duplicate document rejection</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
          <FileCheck className="w-6 h-6 text-white" />
        </div>
      </div>

      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-5">
        <h3 className="font-bold text-slate-900 text-base pb-2 border-b border-slate-100">
          Document Verification Form
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Document Type</label>
            <select
              value={formData.documentType}
              onChange={handleDocumentTypeChange}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            >
              <option value="aadhaar">Aadhaar Card (12 Digits)</option>
              <option value="pan">PAN Card (5 Letters + 4 Digits + 1 Letter)</option>
              <option value="passport">Passport (1 Letter + 7 Digits)</option>
              <option value="drivingLicense">Driving License (15 Characters)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Document Number</label>
            <input
              type="text"
              value={formData.documentNumber}
              onChange={handleDocumentNumberChange}
              placeholder={
                formData.documentType === 'aadhaar'
                  ? 'Enter 12-digit Aadhaar (e.g. 999988887777)'
                  : formData.documentType === 'pan'
                  ? 'Enter 10-character PAN (e.g. ABCDE1234F)'
                  : formData.documentType === 'passport'
                  ? 'Enter Passport number (e.g. A1234567)'
                  : 'Enter document number'
              }
              required
              className={`w-full px-3 py-2.5 rounded-lg bg-white border text-slate-900 text-sm font-mono uppercase transition-colors focus:outline-none ${
                validationError
                  ? 'border-red-400 focus:ring-1 focus:ring-red-300 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
              }`}
            />

            {/* Validation Error Banner */}
            {validationError && (
              <div className="mt-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <div>
                  <p className="font-bold text-red-700">
                    Validation Error: Invalid {docTypeLabel} Format
                  </p>
                  <p className="text-red-600 mt-0.5">{validationError}</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Full Name on Document</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, fullName: e.target.value }));
                  setResult(null);
                  setSubmissionError('');
                }}
                required
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Date of Birth</label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }));
                  setResult(null);
                  setSubmissionError('');
                }}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Submission Failure Banner */}
          {submissionError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
              <span>{submissionError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || Boolean(validationError)}
            className="w-full py-3 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Validating Format &amp; Duplicate Hash...</span>
              </>
            ) : (
              <span>Submit Identity Document</span>
            )}
          </button>
        </form>

        {/* Verification Result Panel - only displayed when valid verification result exists */}
        {result && !validationError && (
          <div className={`mt-6 p-5 rounded-xl space-y-3 animate-in fade-in duration-200 ${
            result.verificationStatus === 'verified'
              ? 'bg-emerald-50 border border-emerald-200'
              : result.verificationStatus === 'rejected'
              ? 'bg-red-50 border border-red-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-5 h-5 ${
                  result.verificationStatus === 'verified' ? 'text-emerald-600' :
                  result.verificationStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'
                }`} />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Verification Result</span>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                result.verificationStatus === 'verified'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : result.verificationStatus === 'rejected'
                  ? 'bg-red-100 text-red-700 border-red-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}>
                {result.verificationStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
              <div className="p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-slate-500 block text-[11px] uppercase font-semibold">Document Number</span>
                <span className="font-mono text-slate-900 text-sm font-bold mt-0.5 block">{result.documentNumberMasked}</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-slate-500 block text-[11px] uppercase font-semibold">Authenticity Score</span>
                <span className="font-mono text-blue-700 text-sm font-extrabold mt-0.5 block">
                  {result.authenticityScore !== null && result.authenticityScore !== undefined ? `${result.authenticityScore} / 100` : 'N/A (Unscored)'}
                </span>
              </div>
            </div>

            {result.ocrChecks && (
              <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                <span className="text-slate-500 uppercase font-semibold text-[10px] block">Automated Checks</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Format Validated
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] ${result.ocrChecks.nameMatched ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {result.ocrChecks.nameMatched ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {result.ocrChecks.nameMatched ? 'KYC Profile Name Matched' : 'KYC Profile Name Mismatch'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
