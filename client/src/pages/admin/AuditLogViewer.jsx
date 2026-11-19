import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/v1/audit-logs?action=${actionFilter}&limit=100`);
      if (res.data.success) {
        setLogs(res.data.data.logs || res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const handleVerifyChain = async () => {
    try {
      setVerifying(true);
      const res = await axios.get('/api/v1/audit-logs/verify-chain');
      setVerificationResult(res.data);
    } catch (err) {
      setVerificationResult({
        valid: false,
        message: err.response?.data?.message || err.message
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Cryptographic Audit Trail (SHA-256 Chained)
          </h1>
          <p className="text-sm text-slate-500">
            Immutable, cryptographically chained audit log ledger verifying zero unauthorized tampering across bank operations.
          </p>
        </div>
        <button
          onClick={handleVerifyChain}
          disabled={verifying}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-sm font-semibold text-sm flex items-center gap-2 transition-all"
        >
          {verifying ? 'Verifying Hashes...' : '🔒 Verify SHA-256 Hash Chain'}
        </button>
      </div>

      {verificationResult && (
        <div className={`p-4 rounded-xl border ${
          verificationResult.valid
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{verificationResult.valid ? '✅' : '❌'}</span>
            <div>
              <div className="font-bold text-sm">
                {verificationResult.valid ? 'Chain Integrity Verified: Intact' : 'Integrity Alert: Chain Broken or Tampered'}
              </div>
              <div className="text-xs opacity-80">{verificationResult.message || `All ${verificationResult.totalVerified || logs.length} audit entries cryptographically linked and validated.`}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Filter by action keyword (e.g. AUTH, TRANSACTION, ADMIN)..."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>

      {/* Log List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-900">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">User &amp; IP</th>
                <th className="px-6 py-3">Entity</th>
                <th className="px-6 py-3 font-mono">Current Hash (SHA-256)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-400 font-sans">Loading audit ledger...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-400 font-sans">No audit records found.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-slate-500 text-xs">
                      {new Date(log.timestamp || log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-semibold text-blue-700">{log.action}</span>
                    </td>
                    <td className="px-6 py-3 font-sans">
                      <div className="text-slate-900">{log.userId?.fullName || log.userId || 'System'}</div>
                      <div className="text-xs text-slate-400">{log.ipAddress || '127.0.0.1'}</div>
                    </td>
                    <td className="px-6 py-3 font-sans">
                      <span className="text-slate-500">{log.entity || '—'}</span>
                    </td>
                    <td className="px-6 py-3 font-mono text-teal-600 text-xs">
                      {log.currentHash ? `${log.currentHash.slice(0, 16)}...${log.currentHash.slice(-8)}` : 'GENESIS'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
