import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { History, Download, Filter, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    riskLevel: ''
  });

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.status) params.status = filters.status;
      if (filters.riskLevel) params.riskLevel = filters.riskLevel;

      const res = await axios.get('/api/v1/transactions/my', { params });
      if (res.data.success) {
        setTransactions(res.data.data.transactions || []);
      }
    } catch (err) {
      toast.error('Failed to load transaction history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [filters]);

  const exportCSV = () => {
    if (transactions.length === 0) {
      toast.error('No transactions to export.');
      return;
    }
    const headers = ['ID', 'Date', 'Type', 'Amount', 'Payee', 'Status', 'Risk Level'];
    const rows = transactions.map(t => [
      t._id,
      new Date(t.timestamp).toLocaleString(),
      t.type,
      t.amount,
      t.payee?.name || '',
      t.status,
      t.riskLevel || 'low'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Transaction_History_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV export generated!');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Transaction History</h2>
          <p className="text-xs text-blue-100 mt-1">Filter, inspect risk levels, and export statements</p>
        </div>
        <button
          onClick={exportCSV}
          className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-all border border-white/20 text-xs font-bold flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
          <Filter className="w-4 h-4 text-slate-400" />
          <span>Filters:</span>
        </div>

        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium focus:outline-none focus:border-blue-500"
        >
          <option value="">All Types</option>
          <option value="transfer">Bank Transfer</option>
          <option value="deposit">Inbound Deposit</option>
          <option value="upi">UPI Payment</option>
          <option value="billPayment">Bill Payment</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium focus:outline-none focus:border-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed</option>
          <option value="pendingStepUp">Pending Step-Up</option>
          <option value="underReview">Under Review (Hold)</option>
          <option value="blocked">Blocked</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={filters.riskLevel}
          onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
          className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium focus:outline-none focus:border-blue-500"
        >
          <option value="">All Risk Levels</option>
          <option value="low">Low Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="high">High Risk</option>
        </select>
      </div>

      {/* Transactions Table */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Payee / Description</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Risk Level</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">Loading transactions...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">No transactions found.</td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">{new Date(t.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {t.payee?.name || t.description}
                      <p className="text-[10px] text-slate-400 font-mono">#{t.payee?.accountNumber || ''}</p>
                    </td>
                    <td className="px-6 py-4 uppercase font-semibold text-slate-500 text-xs">{t.type}</td>
                    <td className="px-6 py-4 font-extrabold text-slate-900">₹{t.amount.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                        t.riskLevel === 'high'
                          ? 'bg-red-100 text-red-700'
                          : t.riskLevel === 'medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {t.riskLevel || 'low'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-700">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold capitalize ${
                        t.status === 'approved' || t.status === 'completed'
                          ? 'text-emerald-700 bg-emerald-50'
                          : t.status === 'underReview'
                          ? 'text-amber-800 bg-amber-50 border border-amber-200'
                          : t.status === 'pendingStepUp'
                          ? 'text-blue-800 bg-blue-50 border border-blue-200'
                          : 'text-red-700 bg-red-50'
                      }`}>
                        {t.status === 'underReview' ? 'Under Review (Hold)' : t.status}
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
