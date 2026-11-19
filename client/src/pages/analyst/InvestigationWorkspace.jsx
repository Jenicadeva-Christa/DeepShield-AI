import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function InvestigationWorkspace() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const caseIdParam = searchParams.get('caseId');

  const [investigations, setInvestigations] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [resolutionForm, setResolutionForm] = useState({
    outcome: 'confirmedFraud',
    recommendedAction: 'suspendAccount',
    findings: '',
    remarks: ''
  });
  const [message, setMessage] = useState('');

  const fetchInvestigations = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/v1/investigations?status=${statusFilter}`);
      if (res.data.success) {
        const list = res.data.data;
        setInvestigations(list);
        if (caseIdParam) {
          const match = list.find((inv) =>
            inv._id === caseIdParam ||
            inv.alertId?._id === caseIdParam ||
            inv.alertId?.alertNumber === caseIdParam
          );
          if (match) {
            setSelectedCase(match);
          } else if (list.length > 0 && !selectedCase) {
            setSelectedCase(list[0]);
          }
        } else if (list.length > 0 && !selectedCase) {
          setSelectedCase(list[0]);
        }
      }
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || 'Failed to load investigation dossiers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestigations();
  }, [statusFilter]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!selectedCase || !noteText.trim()) return;
    try {
      const res = await axios.post(`/api/v1/investigations/${selectedCase._id}/notes`, {
        text: noteText
      });
      if (res.data.success) {
        setNoteText('');
        setSelectedCase(res.data.data);
        fetchInvestigations();
      }
    } catch (err) {
      setMessage('Error adding note: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleResolveCase = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;
    try {
      const res = await axios.patch(`/api/v1/investigations/${selectedCase._id}/outcome`, {
        status: 'completed',
        ...resolutionForm
      });
      if (res.data.success) {
        setMessage('Investigation resolved and recorded.');
        setSelectedCase(res.data.data);
        fetchInvestigations();
      }
    } catch (err) {
      setMessage('Error resolving case: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleExportPdf = async () => {
    if (!selectedCase) return;
    try {
      const res = await axios.get(`/api/v1/investigations/${selectedCase._id}/pdf`, {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Investigation_Report_${selectedCase.alertId?.alertNumber || selectedCase._id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage('Error exporting PDF report: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Fraud Investigation Workspace
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          In-depth forensic examination of suspicious transactions, multi-modal fraud artifacts, customer history, and resolution actions.
        </p>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm flex justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-blue-700 font-bold">&times;</button>
        </div>
      )}

      {/* Main Workspace Layout: Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Case Queue */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Active Dossiers</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="assigned">Assigned</option>
              <option value="inProgress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-6 text-center text-slate-400 text-sm">Loading investigation dossiers...</div>
            ) : investigations.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No active cases assigned.</div>
            ) : (
              investigations.map((c) => {
                const isSelected = selectedCase?._id === c._id;
                return (
                  <div
                    key={c._id}
                    onClick={() => setSelectedCase(c)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400 shadow-md'
                        : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-xs font-bold text-blue-700">
                        {c.alertId?.alertNumber || `CASE-${c._id.slice(-6)}`}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        c.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : c.status === 'inProgress'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-900 font-semibold">
                      {c.alertId?.userId?.fullName || 'Target Customer'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {c.alertId?.summary || 'Suspicious financial transaction'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Case Examination & Actions */}
        <div className="lg:col-span-2 space-y-6">
          {selectedCase ? (
            <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <span>{selectedCase.alertId?.alertNumber || 'Active Case Dossier'}</span>
                    <span className="text-xs font-normal px-2.5 py-0.5 rounded-lg bg-red-100 text-red-700 border border-red-200 font-mono">
                      Risk Score: {selectedCase.alertId?.riskScore || 85}/100
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Target: {selectedCase.alertId?.userId?.fullName} ({selectedCase.alertId?.userId?.email})
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExportPdf}
                    type="button"
                    className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <span>📄 Export PDF Report</span>
                  </button>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Assigned Analyst</div>
                    <div className="text-xs font-semibold text-slate-700">{selectedCase.assignedTo?.fullName || user?.fullName}</div>
                  </div>
                </div>
              </div>

              {/* Alert & Evidence Details */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Incident Summary</h3>
                <p className="text-sm text-slate-700">{selectedCase.alertId?.summary || 'High severity anomaly detected by Risk Fusion ML engine.'}</p>
                {selectedCase.alertId?.transactionId && (
                  <div className="pt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono text-slate-500">
                    <div>Amount: <span className="text-teal-600 font-bold">₹{selectedCase.alertId.transactionId.amount}</span></div>
                    <div>Type: <span className="text-slate-700">{selectedCase.alertId.transactionId.type}</span></div>
                    <div>City: <span className="text-slate-700">{selectedCase.alertId.transactionId.location?.city || 'Unknown'}</span></div>
                    <div>Payee: <span className="text-slate-700">{selectedCase.alertId.transactionId.payee?.name || '—'}</span></div>
                  </div>
                )}
              </div>

              {/* Investigation Notes / Chain */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Case Examination Log &amp; Notes</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(!selectedCase.notes || selectedCase.notes.length === 0) ? (
                    <div className="text-xs text-slate-400 italic">No notes recorded yet.</div>
                  ) : (
                    selectedCase.notes.map((n, i) => (
                      <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                        <div className="flex justify-between text-slate-400 font-mono text-[10px]">
                          <span>{n.authorId?.fullName || 'Analyst'}</span>
                          <span>{new Date(n.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="text-slate-700">{n.text}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Log analyst observation or verification result..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Add Note
                  </button>
                </form>
              </div>

              {/* Resolution Form */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Final Determination &amp; Resolution</h3>
                <form onSubmit={handleResolveCase} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Final Outcome</label>
                      <select
                        value={resolutionForm.outcome}
                        onChange={(e) => setResolutionForm({ ...resolutionForm, outcome: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="confirmedFraud">Confirmed Fraudulent Attack</option>
                        <option value="falsePositive">False Positive (Legitimate Customer)</option>
                        <option value="inconclusive">Inconclusive / Pending Telecom Proof</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Recommended Enforcement</label>
                      <select
                        value={resolutionForm.recommendedAction}
                        onChange={(e) => setResolutionForm({ ...resolutionForm, recommendedAction: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="suspendAccount">Suspend Account &amp; Lock Credentials</option>
                        <option value="blockTransaction">Block Single Transaction Only</option>
                        <option value="requestReverification">Force Video KYC Re-Verification</option>
                        <option value="escalate">Escalate to Law Enforcement (FIU/CERT-In)</option>
                        <option value="none">No Action Required (Dismiss)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Investigation Findings</label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Detail the technical indicators, ISP findings, and phone confirmation..."
                      value={resolutionForm.findings}
                      onChange={(e) => setResolutionForm({ ...resolutionForm, findings: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg shadow-sm font-bold text-xs tracking-wider uppercase transition-all"
                  >
                    Resolve &amp; Close Case Dossier
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
              Select an investigation dossier from the left list to begin forensic examination.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
