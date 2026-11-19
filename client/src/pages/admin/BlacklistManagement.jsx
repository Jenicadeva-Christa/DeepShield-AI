import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function BlacklistManagement() {
  const [blacklists, setBlacklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    type: 'accountNumber',
    value: '',
    reason: '',
    category: 'mule account',
    severity: 'high',
    notes: ''
  });
  const [message, setMessage] = useState('');

  const fetchBlacklists = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/v1/admin/blacklists?type=${typeFilter}&search=${search}`);
      if (res.data.success) {
        setBlacklists(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlacklists();
  }, [typeFilter, search]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/v1/admin/blacklists', formData);
      if (res.data.success) {
        setMessage('Entity added to blacklist.');
        setShowAddModal(false);
        setFormData({
          type: 'accountNumber',
          value: '',
          reason: '',
          category: 'mule account',
          severity: 'high',
          notes: ''
        });
        fetchBlacklists();
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Error adding to blacklist.');
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Are you sure you want to remove this entity from blacklist?')) return;
    try {
      const res = await axios.delete(`/api/v1/admin/blacklists/${id}`);
      if (res.data.success) {
        setMessage('Entity removed from blacklist.');
        fetchBlacklists();
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Error removing item.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Blacklist &amp; Threat Entity Registry
          </h1>
          <p className="text-sm text-slate-500">
            Enforce real-time hard-override blocks on fraudulent bank accounts, IP subnets, device IDs, and phishing domains.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-sm font-semibold transition-all"
        >
          + Add Threat Entity
        </button>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm flex justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-blue-700 font-bold">&times;</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Search by value or keyword..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:border-blue-500 text-sm"
        >
          <option value="">All Entity Types</option>
          <option value="accountNumber">Bank Account</option>
          <option value="ipAddress">IP Address</option>
          <option value="deviceId">Device ID</option>
          <option value="domain">Domain / Website</option>
          <option value="phoneNumber">Phone Number</option>
          <option value="email">Email Address</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-900">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Entity Value</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-400">Loading blacklist records...</td>
                </tr>
              ) : blacklists.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-400">No blacklist entries found.</td>
                </tr>
              ) : (
                blacklists.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                        {item.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold text-red-700">{item.value}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{item.category}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.severity === 'critical' ? 'bg-red-100 text-red-700 border border-red-200' :
                        'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {item.severity === 'critical' ? 'critical' : 'high'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">{item.reason || item.notes || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleRemove(item._id)}
                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Add Threat Entity to Blacklist</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Entity Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="accountNumber">Bank Account Number</option>
                  <option value="ipAddress">IP Address</option>
                  <option value="deviceId">Device Fingerprint ID</option>
                  <option value="domain">Domain / Hostname</option>
                  <option value="phoneNumber">Phone Number</option>
                  <option value="email">Email Address</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Entity Value</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 998877665544 or 192.168.1.1"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Threat Intel Notes</label>
                <textarea
                  rows={2}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Why is this entity being blocked?"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Add to Blacklist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
