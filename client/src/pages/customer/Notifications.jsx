import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/notifications/me');
      if (res.data.success) {
        setNotifications(res.data.data.notifications);
        setUnreadCount(res.data.data.unreadCount);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await axios.patch(`/api/v1/notifications/${id}/read`);
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await axios.post('/api/v1/notifications/read-all');
      setMessage('All notifications marked as read.');
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Security &amp; Account Notifications
          </h1>
          <p className="text-sm text-slate-500">
            Real-time security alerts, transaction authorizations, and KYC verification status updates.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors"
          >
            Mark All as Read ({unreadCount})
          </button>
        )}
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm flex justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-blue-600 font-bold">&times;</button>
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm bg-white border border-slate-200 rounded-xl">
            You have no notifications at this time.
          </div>
        ) : (
          notifications.map((n) => {
            const isUnread = n.status !== 'read';
            return (
              <div
                key={n._id}
                className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                  isUnread
                    ? 'bg-white border-blue-200 shadow-sm'
                    : 'bg-slate-50 border-slate-200 opacity-75'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">
                    {n.type === 'fraudAlert' ? '🚨' :
                     n.type === 'loginAlert' ? '🔐' :
                     n.type === 'verificationUpdate' ? '🪪' : '🔔'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">{n.title}</h3>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                    <div className="text-[10px] text-slate-400 mt-2">
                      {new Date(n.sentAt || n.createdAt).toLocaleString()} &bull; Channel: {n.channel}
                    </div>
                  </div>
                </div>

                {isUnread && (
                  <button
                    onClick={() => handleMarkAsRead(n._id)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded text-xs transition-colors shrink-0"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
