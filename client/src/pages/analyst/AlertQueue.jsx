import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  AlertTriangle,
  UserCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  RefreshCw,
  ArrowRight,
  Search,
  FolderOpen
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AlertQueue({ initialTab }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || initialTab || 'queue';

  const [alerts, setAlerts] = useState([]);
  const [myAlerts, setMyAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(true);
  const [assigningId, setAssigningId] = useState(null);
  const [errorQueue, setErrorQueue] = useState('');
  const [errorMy, setErrorMy] = useState('');

  const loadAlerts = async () => {
    setLoading(true);
    setErrorQueue('');
    try {
      const res = await axios.get('/api/v1/alerts');
      if (res.data.success) {
        setAlerts(res.data.data);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load alert queue.';
      setErrorQueue(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadMyAlerts = async () => {
    setLoadingMy(true);
    setErrorMy('');
    try {
      const res = await axios.get('/api/v1/alerts/my');
      if (res.data.success) {
        setMyAlerts(res.data.data);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load assigned cases.';
      setErrorMy(msg);
      toast.error(msg);
    } finally {
      setLoadingMy(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    loadMyAlerts();
  }, []);

  const setTab = (tab) => {
    setSearchParams({ tab });
  };

  const assignToMe = async (alertId) => {
    try {
      setAssigningId(alertId);
      const res = await axios.patch(`/api/v1/alerts/${alertId}/assign`);
      if (res.data.success) {
        toast.success(res.data.message || 'Case assigned to you successfully!');
        // Synchronously update local state for immediate feedback
        const updatedCase = res.data.data?.alert;
        if (updatedCase) {
          setAlerts((prev) =>
            prev.map((a) => (a._id === alertId ? { ...a, ...updatedCase } : a))
          );
        }
        await Promise.all([loadAlerts(), loadMyAlerts()]);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to assign case.';
      toast.error(msg);
    } finally {
      setAssigningId(null);
    }
  };

  const isAssignedToCurrentUser = (alert) => {
    if (!alert.assignedTo || !user) return false;
    const assignedId = typeof alert.assignedTo === 'object' ? alert.assignedTo._id : alert.assignedTo;
    const currentUserId = user._id || user.id;
    return assignedId?.toString() === currentUserId?.toString();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'underInvestigation':
      case 'inProgress':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'assigned':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'resolvedFraud':
      case 'completed':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'resolvedFalsePositive':
      case 'closed':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-amber-400 text-slate-900 font-bold';
      case 'low':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-slate-500 text-white';
    }
  };

  const activeAssignedCount = myAlerts.filter(
    (a) =>
      ['open', 'underInvestigation', 'assigned'].includes(a.status) ||
      ['assigned', 'inProgress'].includes(a.investigation?.status)
  ).length;

  const resolvedCount = myAlerts.filter(
    (a) =>
      ['resolvedFraud', 'resolvedFalsePositive', 'closed'].includes(a.status) ||
      ['completed', 'closed'].includes(a.investigation?.status)
  ).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider border border-white/20">
              Analyst Operations
            </span>
          </div>
          <h2 className="text-2xl font-bold mt-2">
            {currentTab === 'myStatus' ? 'My Assigned Cases & Status' : 'Fraud Alert Queue'}
          </h2>
          <p className="text-xs text-blue-100 mt-1">
            {currentTab === 'myStatus'
              ? 'Real-time synchronization of cases assigned to your analyst dossier'
              : 'Real-time fraud alert triage, assignment, and risk evidence review'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              loadAlerts();
              loadMyAlerts();
            }}
            className="px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-all border border-white/20 text-xs font-bold flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingMy ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1">
        <button
          onClick={() => setTab('queue')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 ${
            currentTab === 'queue'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>All Alerts Queue</span>
          <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs ${
            currentTab === 'queue' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {alerts.length}
          </span>
        </button>

        <button
          onClick={() => setTab('myStatus')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 ${
            currentTab === 'myStatus'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>My Status</span>
          <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs ${
            currentTab === 'myStatus' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {myAlerts.length}
          </span>
        </button>
      </div>

      {/* VIEW 1: FRAUD ALERT QUEUE */}
      {currentTab === 'queue' && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700">
              Total Alerts in Queue: {alerts.length}
            </span>
            <span className="text-slate-500">
              {alerts.filter((a) => !a.assignedTo).length} Unassigned
            </span>
          </div>

          {errorQueue && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-red-700 text-xs flex justify-between items-center">
              <span>{errorQueue}</span>
              <button onClick={loadAlerts} className="underline font-bold">Retry</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Alert Number</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Severity / Score</th>
                  <th className="px-6 py-4">Customer / Summary</th>
                  <th className="px-6 py-4">Assigned Analyst</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-teal-600" />
                        <span>Loading fraud alert queue from database...</span>
                      </div>
                    </td>
                  </tr>
                ) : alerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      No active alerts in queue.
                    </td>
                  </tr>
                ) : (
                  alerts.map((a) => {
                    const isMine = isAssignedToCurrentUser(a);
                    const isAssigned = Boolean(a.assignedTo);
                    const assignedName = a.assignedTo?.fullName || (isMine ? user?.fullName : 'Assigned');

                    return (
                      <tr key={a._id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-blue-700 dark:text-blue-400">
                          {a.alertNumber}
                        </td>
                        <td className="px-6 py-4 uppercase font-semibold text-slate-500 text-xs">
                          {a.alertType}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full font-bold uppercase text-[10px] ${getSeverityBadge(
                              a.severity
                            )}`}
                          >
                            {a.severity} ({a.riskScore}/100)
                          </span>
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <div className="font-semibold text-slate-900 dark:text-slate-200 truncate">
                            {a.userId?.fullName || 'Customer'}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 truncate text-[11px]">
                            {a.summary}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {isMine ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 font-bold text-[11px] border border-blue-200">
                              <UserCheck className="w-3 h-3" /> You
                            </span>
                          ) : isAssigned ? (
                            <span className="text-slate-600">
                              {assignedName}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-semibold capitalize text-[10px] border ${getStatusBadge(
                              a.status
                            )}`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {isMine ? (
                            <Link
                              to={`/analyst/investigations?caseId=${a._id}`}
                              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors"
                            >
                              Investigate <ArrowRight className="w-3 h-3" />
                            </Link>
                          ) : isAssigned ? (
                            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-medium cursor-not-allowed">
                              Assigned
                            </span>
                          ) : (
                            <button
                              onClick={() => assignToMe(a._id)}
                              disabled={assigningId === a._id}
                              className="px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors disabled:opacity-50 border border-blue-200"
                            >
                              {assigningId === a._id ? (
                                <span className="flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3 animate-spin" /> Assigning...
                                </span>
                              ) : (
                                'Assign To Me'
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: MY STATUS */}
      {currentTab === 'myStatus' && (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Total Cases Assigned</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
                  {loadingMy ? '...' : myAlerts.length}
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Under Investigation</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
                  {loadingMy ? '...' : activeAssignedCount}
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Resolved Cases</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
                  {loadingMy ? '...' : resolvedCount}
                </p>
              </div>
            </div>
          </div>

          {/* Assigned Cases List Container */}
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Assigned Fraud Investigation Dossiers
                </h3>
                <p className="text-xs text-slate-500">
                  Cases currently linked to analyst ID: <span className="font-mono">{user?.email || user?.fullName}</span>
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                {myAlerts.length} Cases On Record
              </div>
            </div>

            {errorMy && (
              <div className="p-4 bg-red-50 border-b border-red-200 text-red-700 text-xs flex justify-between items-center">
                <span>{errorMy}</span>
                <button onClick={loadMyAlerts} className="underline font-bold">Retry</button>
              </div>
            )}

            {loadingMy ? (
              <div className="py-16 text-center text-slate-500">
                <div className="flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
                  <span className="text-sm font-semibold">Retrieving your assigned cases from MongoDB...</span>
                </div>
              </div>
            ) : myAlerts.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-200">
                  <UserCheck className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">
                  No cases assigned to you yet.
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">
                  You do not currently have any active fraud investigations assigned. Browse the Alert Queue and click &ldquo;Assign to Me&rdquo; to assign a case to yourself.
                </p>
                <button
                  onClick={() => setTab('queue')}
                  className="mt-5 px-5 py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-md inline-flex items-center gap-2 transition-all"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Browse Alert Queue
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Case ID</th>
                      <th className="px-6 py-4">Fraud Type</th>
                      <th className="px-6 py-4">Suspicious Entity / Description</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4">Risk Level</th>
                      <th className="px-6 py-4">Assigned Date</th>
                      <th className="px-6 py-4">Investigation Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {myAlerts.map((a) => {
                      const investigationStatus = a.investigation?.status || a.status;
                      const assignedDate = a.investigation?.assignedAt || a.updatedAt || a.createdAt;

                      return (
                        <tr key={a._id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-blue-700 dark:text-blue-400">
                            {a.alertNumber}
                          </td>
                          <td className="px-6 py-4 uppercase font-semibold text-slate-500 text-xs">
                            {a.alertType}
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <p className="text-slate-800 dark:text-slate-200 font-medium truncate">
                              {a.summary}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {a.userId?.fullName || 'Customer'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {a.userId?.email || a.userId?.phone || ''}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-1 rounded-full font-bold uppercase text-[10px] ${getSeverityBadge(
                                a.severity
                              )}`}
                            >
                              {a.severity} ({a.riskScore}/100)
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-mono text-[11px]">
                            {assignedDate
                              ? new Date(assignedDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : 'Recent'}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-1 rounded-full font-bold capitalize text-[10px] border ${getStatusBadge(
                                investigationStatus
                              )}`}
                            >
                              {investigationStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              to={`/analyst/investigations?caseId=${a._id}`}
                              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                            >
                              Investigate <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
