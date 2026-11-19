import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Wallet, ArrowUpRight, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(user?.customerProfile || {});
  const [transactions, setTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txRes, alertRes, meRes] = await Promise.allSettled([
        axios.get('/api/v1/transactions/my?limit=5'),
        axios.get('/api/v1/alerts/my'),
        axios.get('/api/v1/auth/me')
      ]);

      if (txRes.status === 'fulfilled' && txRes.value.data.success) {
        setTransactions(txRes.value.data.data.transactions || []);
        if (txRes.value.data.data.balance !== undefined) {
          setProfile(prev => ({
            ...prev,
            balance: txRes.value.data.data.balance,
            accountNumber: txRes.value.data.data.accountNumber || prev.accountNumber
          }));
        }
      }

      if (alertRes.status === 'fulfilled' && alertRes.value.data.success) {
        setAlerts(alertRes.value.data.data || []);
      }

      if (meRes.status === 'fulfilled' && meRes.value.data.success) {
        if (meRes.value.data.data.customerProfile) {
          setProfile(meRes.value.data.data.customerProfile);
        }
      }
    } catch (err) {
      console.error('Error loading customer dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAlertsCount = alerts.filter(a => a.status === 'open').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider">
            Protected Account • Agile Sprint Core
          </span>
          <h2 className="text-2xl font-bold mt-2">Welcome back, {user?.fullName || 'Customer'}!</h2>
          <p className="text-xs text-blue-100 mt-1">
            Account #{profile.accountNumber || 'Pending'} • Real-time AI Anomaly &amp; Fraud Protection Active
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-white/15 border border-white/20 text-right">
            <p className="text-[10px] text-blue-100 uppercase font-bold">Total Available Balance</p>
            <p className="text-xl font-black text-white">
              ₹{(profile.balance ?? 100000).toLocaleString('en-IN')}
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-white/15 hover:bg-white/25 transition-all border border-white/20"
            title="Refresh Account"
          >
            <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Real-time KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Account Balance</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white">
              ₹{(profile.balance ?? 100000).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Identity Status</p>
            <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
              {profile.verified ? 'Verified Identity' : 'Standard KYC Active'}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Protection Tier</p>
            <p className="text-base font-extrabold text-teal-600 dark:text-teal-400">
              Active Shielding
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            openAlertsCount > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
          }`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Security Alerts</p>
            <p className={`text-xl font-extrabold text-slate-900 dark:text-white ${openAlertsCount > 0 ? 'text-red-600' : ''}`}>
              {openAlertsCount} {openAlertsCount === 1 ? 'Alert' : 'Alerts'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action & Live Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base">Your Recent Monitored Transactions</h3>
            <Link to="/customer/history" className="text-xs font-bold text-teal-600 hover:text-teal-700">
              View All History →
            </Link>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading your transactions...</div>
            ) : transactions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No transactions yet. Click <strong>"Perform Protected Transfer"</strong> to initiate your first transfer.
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx._id} className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {tx.payee?.name || tx.description || 'Transfer'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(tx.timestamp || tx.createdAt).toLocaleString()} • {tx.type?.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-slate-900 font-mono">
                      ₹{tx.amount?.toLocaleString('en-IN')}
                    </p>
                    <span className={`inline-block mt-1 bg-emerald-100 text-emerald-700 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                      tx.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : tx.status === 'blocked'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Security Quick Actions */}
        <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md space-y-4">
          <h3 className="font-bold text-lg">AI Protection Center</h3>
          <p className="text-xs text-blue-100">
            Screen suspicious messages, voice samples, documents or deepfakes before proceeding with high value transactions.
          </p>
          <div className="space-y-2.5 pt-2">
            <Link to="/customer/security-check" className="block p-3 rounded-lg bg-white/15 hover:bg-white/25 transition-all border border-white/20 text-xs font-semibold flex items-center justify-between">
              <span>Deepfake &amp; Phishing Security Check</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link to="/customer/transaction" className="block p-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-xs font-semibold flex items-center justify-between shadow-sm">
              <span>Perform Protected Transfer</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
