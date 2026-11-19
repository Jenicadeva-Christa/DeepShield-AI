import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, AlertTriangle, ArrowUpRight, TrendingUp, Users, Wallet, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/admin/dashboard-stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching admin dashboard stats:', err);
      toast.error('Failed to load live dashboard statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider border border-white/20">
            Agile Operations • Sprint Iteration Active
          </span>
          <h2 className="text-2xl font-bold mt-2">Executive Fraud Monitoring &amp; Control Center</h2>
          <p className="text-xs text-blue-100 mt-1">
            Real-time telemetry, model calibration, transaction audits &amp; user governance
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-all border border-white/20 text-xs font-bold flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Live Data
        </button>
      </div>

      {/* Real-Time Dynamic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Total Transactions</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-2 font-mono">
            {loading ? '...' : (stats?.totalTransactions ?? 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats?.approvedTransactions ?? 0} approved • {stats?.pendingTransactions ?? 0} pending 2FA
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-bold text-red-600 uppercase tracking-wider">
            <span>Blocked Transactions</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-600 dark:text-red-400 mt-2 font-mono">
            {loading ? '...' : (stats?.blockedTransactions ?? 0)}
          </p>
          <p className="text-[11px] text-red-500 mt-1">Auto-blocked by AI Risk Engine</p>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-bold text-amber-600 uppercase tracking-wider">
            <span>Fraud Incident Rate</span>
            <ShieldCheck className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-2 font-mono">
            {loading ? '...' : `${stats?.fraudRate ?? 0}%`}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats?.openAlerts ?? 0} open investigation alerts
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-bold text-teal-600 uppercase tracking-wider">
            <span>Avg Customer Balance</span>
            <Wallet className="w-4 h-4 text-teal-500" />
          </div>
          <p className="text-3xl font-black text-teal-600 dark:text-teal-400 mt-2 font-mono">
            {loading ? '...' : `₹${Math.round(stats?.avgAccountBalance ?? 0).toLocaleString('en-IN')}`}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Across {stats?.totalCustomers ?? 0} active banking profiles
          </p>
        </div>
      </div>

      {/* Live Transaction Audits Table */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Live Monitored Transactions &amp; Security Events
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time feed of all client transactions, blocked transfers, and AI risk decisions
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-bold border border-teal-200">
            Real-Time Feed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Customer / Account</th>
                <th className="px-4 py-3">Payee / Description</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Risk Level</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    Loading live transactions...
                  </td>
                </tr>
              ) : !stats?.recentTransactions || stats.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    No transactions recorded in system yet.
                  </td>
                </tr>
              ) : (
                stats.recentTransactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {new Date(tx.timestamp || tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <div className="text-[10px] text-slate-400">
                        {new Date(tx.timestamp || tx.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div>{tx.userId?.fullName || 'Customer'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {tx.userId?.email || ''} • #{tx.customerId?.accountNumber || 'Acc'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      <div>{tx.payee?.name || tx.description || 'Transfer'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {tx.payee?.accountNumber ? `To: ${tx.payee.accountNumber}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      ₹{tx.amount?.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        tx.riskLevel === 'high'
                          ? 'bg-red-100 text-red-600'
                          : tx.riskLevel === 'medium'
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {tx.riskLevel || 'low'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold capitalize ${
                        tx.status === 'blocked'
                          ? 'bg-red-500 text-white'
                          : tx.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {tx.status}
                      </span>
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
