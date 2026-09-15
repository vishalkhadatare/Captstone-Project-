import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Users,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  AlertTriangle,
  RefreshCw,
  Clock,
  Filter,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  Activity,
  UserCheck,
  AlertCircle,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { AuthorityProctorSession, AuthorityProctorEvent, AuthoritySurveillanceMetrics, User } from '../../types';
import { api } from '../../api';

interface AuthoritySurveillanceDashboardProps {
  currentUser: User | null;
}

export const AuthoritySurveillanceDashboard: React.FC<AuthoritySurveillanceDashboardProps> = ({
  currentUser,
}) => {
  const [metrics, setMetrics] = useState<AuthoritySurveillanceMetrics>({
    total_active_sessions: 0,
    high_risk_sessions: 0,
    shoulder_surfing_alerts: 0,
    locked_sessions: 0,
  });
  const [sessions, setSessions] = useState<AuthorityProctorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Forensic Review Modal State
  const [selectedSession, setSelectedSession] = useState<AuthorityProctorSession | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AuthorityProctorEvent[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);

  // Lockdown Modal State
  const [lockdownModalOpen, setLockdownModalOpen] = useState(false);
  const [sessionToLock, setSessionToLock] = useState<AuthorityProctorSession | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [locking, setLocking] = useState(false);

  // Status Notification
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  // Real-time polling every 4 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadDashboard(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadDashboard = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.authorityProctor.getSurveillanceDashboard();
      setMetrics(res.metrics);
      setSessions(res.sessions || []);
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error('Surveillance dashboard load error:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleOpenReview = async (session: AuthorityProctorSession) => {
    setSelectedSession(session);
    setLoadingReview(true);
    try {
      const res = await api.authorityProctor.getSessionReview(session.id);
      setSelectedSession(res.session);
      setSessionEvents(res.events || []);
    } catch (err: any) {
      console.error('Error fetching review:', err);
    } finally {
      setLoadingReview(false);
    }
  };

  const handleOpenLockdown = (session: AuthorityProctorSession) => {
    setSessionToLock(session);
    setLockReason('Suspected unauthorized photography / phone camera detection.');
    setLockdownModalOpen(true);
  };

  const handleConfirmLockdown = async () => {
    if (!sessionToLock) return;
    setLocking(true);
    try {
      await api.authorityProctor.emergencyLockSession(sessionToLock.id, lockReason);
      setStatusMessage({
        type: 'success',
        text: `Emergency lockdown issued for ${sessionToLock.user_name}. Terminal screen has been immediately blacked out.`,
      });
      setLockdownModalOpen(false);
      setSessionToLock(null);
      loadDashboard(false);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to issue emergency lockdown.' });
    } finally {
      setLocking(false);
    }
  };

  // Filtered sessions
  const filteredSessions = sessions.filter((s) => {
    if (filterRole !== 'ALL' && s.user_role !== filterRole) return false;
    if (filterStatus !== 'ALL' && s.status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        s.user_name.toLowerCase().includes(q) ||
        s.user_email.toLowerCase().includes(q) ||
        s.workspace_type.toLowerCase().includes(q) ||
        (s.exam_name && s.exam_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase tracking-wider mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            Live Authority Camera Surveillance
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShieldAlert className="w-7 h-7 text-emerald-400" />
            Authority Proctor Surveillance & Leak Prevention
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time monitoring of all examination officials working on confidential question papers and AES-256 decryption vaults.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-Sync (4s): {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => loadDashboard(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Now
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
              : 'bg-rose-950/80 border-rose-700 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 High-Level Surveillance Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Enclaves */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Officials on Camera
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Camera className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono">
              {metrics.total_active_sessions}
            </span>
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Streams
            </span>
          </div>
        </div>

        {/* High Leak Risk */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              High Leak Risk Officials
            </span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-600 font-mono">
              {metrics.high_risk_sessions}
            </span>
            <span className="text-xs text-slate-500">Risk Score ≥ 60</span>
          </div>
        </div>

        {/* Shoulder Surfing Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Shoulder-Surfing Alerts
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-600 font-mono">
              {metrics.shoulder_surfing_alerts}
            </span>
            <span className="text-xs text-amber-600 font-semibold">2+ Faces Detected</span>
          </div>
        </div>

        {/* Emergency Locked */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Locked Terminals
            </span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
              <Lock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 font-mono">
              {metrics.locked_sessions}
            </span>
            <span className="text-xs text-slate-500">Terminated by Admin</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by official name, email, workspace..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Role:</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Roles</option>
              <option value="EXAM_MANAGER">Exam Manager</option>
              <option value="TRANSLATOR">Linguistic Translator</option>
              <option value="CENTRE_OPERATOR">Centre Operator</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="LOCKED">Emergency Locked</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Last Synced: {lastRefreshed.toLocaleTimeString()}
        </div>
      </div>

      {/* Surveillance Table Grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">Authority Official</th>
                <th className="py-3.5 px-4">Role & Enclave</th>
                <th className="py-3.5 px-4">Hardware Telemetry</th>
                <th className="py-3.5 px-4">Face & Presence Status</th>
                <th className="py-3.5 px-4">Leak Risk Score</th>
                <th className="py-3.5 px-4">Session Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <ShieldCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    No active authority proctor sessions matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Official */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{s.user_name}</div>
                      <div className="text-[11px] text-slate-400">{s.user_email}</div>
                    </td>

                    {/* Role & Enclave */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          {s.user_role}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[180px]">
                        {s.workspace_type}
                      </div>
                      {s.exam_name && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                          {s.exam_name}
                        </div>
                      )}
                    </td>

                    {/* Hardware */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        {/* Camera */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            s.camera_status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          <Camera className="w-3 h-3" />
                          {s.camera_status}
                        </span>

                        {/* Mic */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <Mic className="w-3 h-3 text-slate-500" />
                          {s.audio_level_db} dB
                        </span>
                      </div>
                    </td>

                    {/* Face Status */}
                    <td className="py-3.5 px-4">
                      {s.face_status === 'SHOULDER_SURFING_DETECTED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                          <Users className="w-3.5 h-3.5 text-rose-600" />
                          SHOULDER SURFING (2+ Faces)
                        </span>
                      ) : s.face_status === 'ABSENT' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                          Official Absent (Masked)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Eye className="w-3.5 h-3.5 text-emerald-600" />
                          Verified Present (1 Face)
                        </span>
                      )}
                    </td>

                    {/* Risk Score */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              s.leak_risk_score >= 60
                                ? 'bg-rose-600'
                                : s.leak_risk_score >= 30
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(8, s.leak_risk_score))}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-slate-800">
                          {s.leak_risk_score}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          s.leak_risk_level === 'CRITICAL' || s.leak_risk_level === 'HIGH'
                            ? 'bg-rose-100 text-rose-700'
                            : s.leak_risk_level === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {s.leak_risk_level}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {s.status === 'LOCKED' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-900 text-rose-100 border border-rose-700 flex items-center gap-1 w-fit">
                          <Lock className="w-3 h-3" />
                          LOCKED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          ACTIVE
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenReview(s)}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Activity className="w-3 h-3 text-slate-500" />
                          Review Timeline
                        </button>
                        {s.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleOpenLockdown(s)}
                            className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                            title="Emergency Remote Lockdown to prevent paper leak"
                          >
                            <Lock className="w-3 h-3 text-rose-600" />
                            Lock Screen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FORENSIC REVIEW MODAL */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col text-slate-100 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    Authority Forensic Review: {selectedSession.user_name}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-700">
                    {selectedSession.user_role}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Enclave: <strong className="text-slate-200">{selectedSession.workspace_type}</strong> | Session: <span className="font-mono text-slate-300">{selectedSession.id}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedSession(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Snapshot and Risk Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Snapshot */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Identity Verification Photo
                  </span>
                  {selectedSession.verification_snapshot ? (
                    <img
                      src={selectedSession.verification_snapshot}
                      alt="Verification"
                      className="w-32 h-24 object-cover mx-auto rounded-lg border border-slate-700 -scale-x-100"
                    />
                  ) : (
                    <div className="w-32 h-24 bg-slate-900 rounded-lg mx-auto flex items-center justify-center text-slate-500 border border-slate-800 text-xs">
                      No Photo Captured
                    </div>
                  )}
                </div>

                {/* Risk and Status */}
                <div className="sm:col-span-2 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Leak Risk Score:</span>
                      <span className={`text-base font-extrabold font-mono ${
                        selectedSession.leak_risk_score >= 60 ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        {selectedSession.leak_risk_score} / 100 ({selectedSession.leak_risk_level})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Live Face Status:</span>
                      <span className="text-xs font-semibold text-slate-200">
                        {selectedSession.face_status} ({selectedSession.faces_detected_count} Faces)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Camera Telemetry:</span>
                      <span className="text-xs font-mono text-emerald-400">
                        {selectedSession.camera_status} | {selectedSession.microphone_status}
                      </span>
                    </div>
                  </div>

                  {selectedSession.emergency_locked ? (
                    <div className="mt-3 p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                      <strong>Emergency Locked:</strong> {selectedSession.emergency_lock_reason}
                    </div>
                  ) : (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleOpenLockdown(selectedSession)}
                        className="px-3 py-1.5 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Execute Emergency Screen Lockdown
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Event Timeline */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Chronological Surveillance Event Log
                </h4>

                {loadingReview ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading session audit events...
                  </div>
                ) : sessionEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No suspicious events logged for this session.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sessionEvents.map((ev, idx) => (
                      <div
                        key={ev.id || idx}
                        className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ev.severity === 'CRITICAL' || ev.severity === 'HIGH'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : ev.severity === 'MEDIUM'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}>
                              {ev.event_type}
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          {ev.metadata && (
                            <div className="text-[11px] text-slate-400 font-mono">
                              {typeof ev.metadata === 'string' ? ev.metadata : JSON.stringify(ev.metadata)}
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono text-emerald-400 font-bold">
                            +{ev.risk_points} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY LOCKDOWN MODAL */}
      {lockdownModalOpen && sessionToLock && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-600 rounded-2xl w-full max-w-md p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-950 border border-rose-800">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Confirm Emergency Screen Lockdown
                </h3>
                <p className="text-xs text-rose-300">
                  Target Official: {sessionToLock.user_name} ({sessionToLock.user_role})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              This action will <strong>instantly blackout the official's screen</strong> and terminate their access to the confidential question paper or decryption vault to prevent leakage.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Reason for Lockdown:
              </label>
              <textarea
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="Specify detected threat or reason..."
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setLockdownModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLockdown}
                disabled={locking}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {locking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Execute Remote Blackout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

