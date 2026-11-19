import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { FileText, Download, BarChart3, AlertTriangle, Activity, Code, Table, Sparkles, TrendingUp, BrainCircuit } from 'lucide-react';
import DailyRiskForecastChart from '../../components/analytics/DailyRiskForecastChart';

export default function ReportsCenter() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrator';

  // Report types — analysts cannot access auditTrail (admin-only)
  const allReportTypes = [
    { value: 'transactionSummary', label: '📊 Transaction Monitoring Summary', roles: ['administrator', 'fraudAnalyst', 'analyst'], url: '/api/v1/reports/transactions' },
    { value: 'fraudAlertSummary', label: '🚨 Fraud Alert & Incident Report',   roles: ['administrator', 'fraudAnalyst', 'analyst'], url: '/api/v1/reports/fraud' },
    { value: 'detectionSummary',  label: '🤖 Multi-Modal AI Detections',        roles: ['administrator', 'fraudAnalyst', 'analyst'], url: '/api/v1/reports/detections' },
    { value: 'auditTrail',        label: '🔐 Audit Log Trail (Admin Only)',      roles: ['administrator'],                             url: '/api/v1/reports/audit' }
  ];

  const availableReports = allReportTypes.filter(r => r.roles.includes(user?.role));

  const [reportType, setReportType]   = useState(availableReports[0]?.value || 'transactionSummary');
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [reportData, setReportData]   = useState(null);
  const [error, setError]             = useState('');
  const [viewMode, setViewMode]       = useState('table'); // 'table' or 'json'

  const handleGenerate = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setReportData(null);

      const selected = allReportTypes.find(r => r.value === reportType);
      const url = selected?.url || '/api/v1/reports/transactions';

      const res = await axios.get(`${url}?from=${fromDate}&to=${toDate}`);
      if (res.data.success) {
        setReportData(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate transaction summary on initial load
  useEffect(() => {
    handleGenerate();
  }, [reportType]);

  const handleDownloadJSON = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${reportType}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    let csvRows = [];
    if (reportType === 'transactionSummary' && reportData.transactions) {
      csvRows.push(['Timestamp', 'Customer Name', 'Customer Email', 'Account Number', 'Payee', 'Type', 'Amount (INR)', 'Risk Level', 'Status'].join(','));
      reportData.transactions.forEach(t => {
        csvRows.push([
          `"${new Date(t.timestamp || t.createdAt).toLocaleString()}"`,
          `"${t.userId?.fullName || 'Customer'}"`,
          `"${t.userId?.email || ''}"`,
          `"${t.customerId?.accountNumber || ''}"`,
          `"${t.payee?.name || ''}"`,
          `"${t.type || ''}"`,
          t.amount || 0,
          `"${t.riskLevel || 'low'}"`,
          `"${t.status || ''}"`
        ].join(','));
      });
    } else if (reportType === 'fraudAlertSummary' && reportData.alerts) {
      csvRows.push(['Alert Number', 'Timestamp', 'Customer Name', 'Customer Email', 'Alert Type', 'Severity', 'Risk Score', 'Status', 'Summary'].join(','));
      reportData.alerts.forEach(a => {
        csvRows.push([
          `"${a.alertNumber || ''}"`,
          `"${new Date(a.alertTime || a.createdAt).toLocaleString()}"`,
          `"${a.userId?.fullName || 'Customer'}"`,
          `"${a.userId?.email || ''}"`,
          `"${a.alertType || ''}"`,
          `"${a.severity || ''}"`,
          a.riskScore || 0,
          `"${a.status || ''}"`,
          `"${(a.summary || '').replace(/"/g, '""')}"`
        ].join(','));
      });
    }

    if (csvRows.length === 0) {
      alert('CSV formatting is available for Transaction & Fraud Alert summaries. Use JSON export for other reports.');
      return;
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-white" />
          {isAdmin ? 'Executive Reports & Analytics Center' : 'Fraud Analyst Reports & Export'}
        </h2>
        <p className="text-xs text-blue-100 mt-1">
          {isAdmin
            ? 'Generate full audit reports, transaction compliance summaries, blocked transfer lists, and AI telemetry.'
            : 'Generate transaction monitoring summaries, fraud alert reports, and AI detection statistics.'}
        </p>
        {!isAdmin && (
          <p className="mt-2 text-[11px] text-amber-200 bg-amber-900/30 border border-amber-700/30 rounded-lg px-3 py-1.5 inline-block">
            🔒 Audit Log Trail is restricted to System Administrators only.
          </p>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Report Generation Form */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Report Category</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 text-sm"
            >
              {availableReports.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg shadow-sm font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Activity className="w-4 h-4" />
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </form>
      </div>

      {/* Report Result */}
      {reportData && (
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900 capitalize">{reportData.reportType}</h2>
              <p className="text-xs text-slate-500">
                Generated: {new Date(reportData.generatedAt).toLocaleString()} • Period: {reportData.period?.from} to {reportData.period?.to}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-0.5">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                    viewMode === 'table'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  Table
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                    viewMode === 'json'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  JSON
                </button>
              </div>
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                onClick={handleDownloadJSON}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                JSON
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <div className="text-xs text-slate-500 mb-1">Total Records</div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {reportData.totalTransactions ?? reportData.totalAlerts ?? reportData.totalEntries ?? reportData.totalDetections ?? 0}
              </div>
            </div>
            {reportData.approved !== undefined && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <div className="text-xs text-slate-500 mb-1">Approved</div>
                <div className="text-2xl font-bold font-mono text-emerald-700">{reportData.approved}</div>
              </div>
            )}
            {reportData.blocked !== undefined && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
                <div className="text-xs text-slate-500 mb-1">Blocked / Fraud</div>
                <div className="text-2xl font-bold font-mono text-red-700">{reportData.blocked}</div>
              </div>
            )}
            {reportData.totalAmount !== undefined && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
                <div className="text-xs text-slate-500 mb-1">Total Volume</div>
                <div className="text-xl font-bold font-mono text-blue-700">₹{reportData.totalAmount?.toLocaleString('en-IN')}</div>
              </div>
            )}
          </div>

          {/* Daily Risk Trends & Tomorrow's Turn Forecast Line Graph */}
          {(reportType === 'transactionSummary' || reportData.chartSeries) && (
            <DailyRiskForecastChart reportData={reportData} />
          )}

          {/* Table View */}
          {viewMode === 'table' ? (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              {reportType === 'transactionSummary' && reportData.transactions ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Customer Profile</th>
                        <th className="px-4 py-3">Payee / Description</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Risk Level</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {reportData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400">No transactions matching selected criteria.</td>
                        </tr>
                      ) : (
                        reportData.transactions.map((t) => (
                          <tr key={t._id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-slate-500">
                              {new Date(t.timestamp || t.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{t.userId?.fullName || 'Customer'}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {t.userId?.email || ''} • #{t.customerId?.accountNumber || ''}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{t.payee?.name || t.description || 'Transfer'}</div>
                              <div className="text-[10px] text-slate-400">{t.type?.toUpperCase()}</div>
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-slate-900">
                              ₹{t.amount?.toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                t.riskLevel === 'high'
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : t.riskLevel === 'medium'
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}>
                                {t.riskLevel || 'low'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                t.status === 'blocked'
                                  ? 'bg-red-500 text-white'
                                  : t.status === 'approved'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-amber-500 text-white'
                              }`}>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : reportType === 'fraudAlertSummary' && reportData.alerts ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Alert #</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Summary</th>
                        <th className="px-4 py-3">Risk Score</th>
                        <th className="px-4 py-3">Severity</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {reportData.alerts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400">No fraud alerts matching selected criteria.</td>
                        </tr>
                      ) : (
                        reportData.alerts.map((a) => (
                          <tr key={a._id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-blue-700">{a.alertNumber}</td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{a.userId?.fullName || 'Customer'}</div>
                              <div className="text-[10px] text-slate-500">{a.userId?.email || ''}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 max-w-sm truncate">{a.summary}</td>
                            <td className="px-4 py-3 font-mono font-bold text-red-600">{a.riskScore}/100</td>
                            <td className="px-4 py-3 capitalize font-bold text-slate-700">{a.severity}</td>
                            <td className="px-4 py-3 capitalize font-semibold text-slate-700">{a.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="p-4 text-xs text-emerald-400 font-mono max-h-80 overflow-y-auto">
                  {JSON.stringify(reportData, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <pre className="p-4 rounded-xl bg-slate-900 border border-slate-700 text-xs text-emerald-400 font-mono max-h-96 overflow-y-auto">
              {JSON.stringify(reportData, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
