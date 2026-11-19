import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function SystemConfigs() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState('');

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/admin/configs');
      if (res.data.success) {
        setConfigs(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleEdit = (cfg) => {
    setEditingKey(cfg.key);
    setEditValue(typeof cfg.value === 'object' ? JSON.stringify(cfg.value, null, 2) : cfg.value);
  };

  const handleSave = async (key) => {
    try {
      let parsedValue = editValue;
      try {
        parsedValue = JSON.parse(editValue);
      } catch (e) {
        // keep as string / number if not valid json
      }

      const res = await axios.put(`/api/v1/admin/configs/${key}`, { value: parsedValue });
      if (res.data.success) {
        setMessage(`Configuration '${key}' updated successfully.`);
        setEditingKey(null);
        fetchConfigs();
      }
    } catch (err) {
      setMessage('Error updating config: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          System Configuration Registry
        </h1>
        <p className="text-sm text-slate-500">
          Manage risk thresholds, step-up MFA parameters, session timeouts, and AI model weightings.
        </p>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm flex justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-blue-700 font-bold">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading system parameters...</div>
        ) : configs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No configuration keys found.</div>
        ) : (
          configs.map((cfg) => (
            <div
              key={cfg._id || cfg.key}
              className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col md:flex-row justify-between gap-4"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-blue-900 text-base">{cfg.key}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                    {typeof cfg.value === 'object' ? 'JSON' : typeof cfg.value}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{cfg.description || 'System runtime parameter'}</p>

                {editingKey === cfg.key ? (
                  <div className="pt-2 space-y-2">
                    <textarea
                      rows={typeof cfg.value === 'object' ? 4 : 2}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full p-2 font-mono text-xs bg-white border border-blue-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(cfg.key)}
                        className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white border border-teal-600 rounded text-xs font-semibold transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingKey(null)}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="mt-2 p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-emerald-400 font-mono overflow-x-auto">
                    {typeof cfg.value === 'object' ? JSON.stringify(cfg.value, null, 2) : String(cfg.value)}
                  </pre>
                )}
              </div>

              {editingKey !== cfg.key && (
                <div className="self-start">
                  <button
                    onClick={() => handleEdit(cfg)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs transition-colors"
                  >
                    Edit Value
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
