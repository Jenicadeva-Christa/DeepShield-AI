import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldAlert, CheckCircle, Clock, RefreshCw, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AnalystDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/alerts/stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching analyst stats:', err);
      toast.error('Failed to load analyst workspace statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider border border-white/20">
            Agile Operations • Fraud Response Team
          </span>
          <h2 className="text-2xl font-bold mt-2">Fraud Analyst Investigation Workspace</h2>
          <p className="text-xs text-blue-100 mt-1">Real-time alert triage, evidence analysis, and case resolution</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-all border border-white/20 text-xs font-bold flex items-center gap-2 self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Workspace
        </button>
      </div>

      {/* Dynamic KPI Cards - Live Database Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Open High Risk Alerts</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {loading ? '...' : (stats?.openHighRisk ?? 0)}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Active Open Cases</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {loading ? '...' : (stats?.totalOpen ?? 0)}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Resolved Cases</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {loading ? '...' : (stats?.resolvedCount ?? 0)}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Total Incidents Tracked</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {loading ? '...' : (stats?.totalAlerts ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Live Recent Incidents Feed */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Recent Fraud Alerts &amp; Escalations
            </h3>
            <p className="text-xs text-slate-500">Live feed of automatically flagged customer incidents</p>
          </div>
          <Link
            to="/analyst/alerts"
            className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
          >
            <span>View Full Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Alert Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Risk Score</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">
                    Loading alerts...
                  </td>
                </tr>
              ) : !stats?.recentAlerts || stats.recentAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">
                    No active fraud alerts in system.
                  </td>
                </tr>
              ) : (
                stats.recentAlerts.map((alert) => (
                  <tr key={alert._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                      {alert.alertNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      <div>{alert.userId?.fullName || 'Customer'}</div>
                      <div className="text-[10px] text-slate-500">{alert.userId?.email || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {alert.summary}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                        {alert.riskScore}/100
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                        alert.status === 'open'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}>
                        {alert.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/analyst/investigations"
                        className="px-2.5 py-1 rounded-lg bg-blue-900 text-white text-[11px] font-semibold hover:bg-blue-800 transition-colors"
                      >
                        Investigate
                      </Link>
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
