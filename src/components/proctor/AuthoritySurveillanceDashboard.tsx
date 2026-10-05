import React, { useState, useEffect, useRef } from 'react';
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
  Play,
  Pause,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AuthorityProctorSession,
  AuthorityProctorEvent,
  AuthoritySurveillanceMetrics,
  User,
  VoiceEvidenceItem,
  CameraEvidenceItem,
} from '../../types';
import { api } from '../../api';

interface AuthoritySurveillanceDashboardProps {
  currentUser: User | null;
}

const parseEventDetails = (ev: AuthorityProctorEvent) => {
  let meta: any = {};
  if (typeof ev.metadata === 'string') {
    try {
      meta = JSON.parse(ev.metadata);
    } catch {
      meta = { text: ev.metadata };
    }
  } else if (ev.metadata && typeof ev.metadata === 'object') {
    meta = ev.metadata;
  }

  // Friendly title
  const cleanTitle = (ev.event_type || 'Surveillance Event')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Friendly description
  let description = '';
  if (meta.reason) {
    description = meta.reason;
  } else if (meta.note) {
    description = meta.note;
  } else if (meta.description) {
    description = meta.description;
  } else if (meta.text) {
    description = meta.text;
  } else if (meta.action) {
    description = `Action recorded: ${meta.action}`;
  } else if (meta.warning_number) {
    description = `Official proctor warning #${meta.warning_number} recorded.`;
  } else if (ev.event_type === 'SESSION_INITIALIZED' || ev.event_type === 'SESSION_START') {
    description = 'Candidate securely authenticated and initialized proctoring session.';
  } else if (ev.event_type === 'AUDIO_ACTIVITY') {
    description = meta.db ? `Audio level detected at ${meta.db} dB.` : 'Microphone audio activity recorded.';
  } else if (ev.event_type === 'FACE_NOT_DETECTED') {
    description = 'Candidate face was absent from camera frame.';
  } else if (ev.event_type === 'MULTIPLE_FACES') {
    description = 'Multiple individuals detected in webcam surveillance field.';
  } else if (ev.event_type === 'WINDOW_BLUR' || ev.event_type === 'TAB_SWITCH') {
    description = 'Browser lost focus or tab switched away from enclave examination window.';
  } else if (ev.event_type === 'FULLSCREEN_EXIT') {
    description = 'Candidate attempted to exit mandatory fullscreen security container.';
  } else if (ev.event_type === 'DEVTOOLS_ATTEMPT') {
    description = 'Attempted access to browser developer tools or unauthorized inspection keys.';
  } else if (ev.event_type === 'EMERGENCY_LOCKDOWN') {
    description = meta.reason ? `Screen locked: ${meta.reason}` : 'Terminal emergency remote blackout invoked by security auditor.';
  } else if (Object.keys(meta).length > 0) {
    description = Object.entries(meta)
      .filter(([k]) => !['raw', 'stack', 'timestamp'].includes(k))
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' • ');
  } else {
    description = 'Automated telemetry event logged by surveillance monitor.';
  }

  // Color badge
  const severity = ev.severity || 'LOW';
  let badgeClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let dotColor = 'bg-emerald-500';
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    badgeClasses = 'bg-rose-50 text-rose-700 border-rose-200';
    dotColor = 'bg-rose-500';
  } else if (severity === 'MEDIUM') {
    badgeClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
  }

  return { cleanTitle, description, badgeClasses, dotColor, meta };
};

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
  const [sessionEvidence, setSessionEvidence] = useState<VoiceEvidenceItem[]>([]);
  const [sessionCameraEvidence, setSessionCameraEvidence] = useState<CameraEvidenceItem[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewTab, setReviewTab] = useState<'all' | 'camera' | 'voice' | 'events'>('all');

  // Dedicated Photo Viewer & Audio Player Modals
  const [photoViewerModal, setPhotoViewerModal] = useState<{
    open: boolean;
    evidence: {
      url: string;
      title?: string;
      timestamp?: string;
      evidenceId?: string;
      warningNumber?: number;
      officialName?: string;
    } | null;
  }>({ open: false, evidence: null });

  const [audioPlayerModal, setAudioPlayerModal] = useState<{
    open: boolean;
    evidence: VoiceEvidenceItem | null;
  }>({ open: false, evidence: null });

  // Auditor Inquiry Decision State
  const [auditorRemarksInput, setAuditorRemarksInput] = useState('');
  const [reviewActionLoading, setReviewActionLoading] = useState(false);

  // Lockdown Modal State
  const [lockdownModalOpen, setLockdownModalOpen] = useState(false);
  const [sessionToLock, setSessionToLock] = useState<AuthorityProctorSession | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [locking, setLocking] = useState(false);

  // Status Notification
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // WebRTC Real-Time Live Audio Surveillance State
  const [isLiveAudioStreaming, setIsLiveAudioStreaming] = useState(false);
  const [liveAudioConnecting, setLiveAudioConnecting] = useState(false);
  const [liveAudioError, setLiveAudioError] = useState<string | null>(null);
  const [liveAudioVolume, setLiveAudioVolume] = useState(1);
  const [isLiveAudioMuted, setIsLiveAudioMuted] = useState(false);

  const liveAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const auditorPeerConnRef = useRef<RTCPeerConnection | null>(null);
  const candidatePollIntervalRef = useRef<any>(null);

  const handleStartLiveAudio = async (sessionId: string) => {
    setLiveAudioConnecting(true);
    setLiveAudioError(null);

    try {
      // 1. Fetch SDP offer from translator
      const offerRes = await api.authorityProctor.getOffer(sessionId);
      if (!offerRes.offer || !offerRes.offer.sdp) {
        throw new Error('Translator has not initiated an audio feed yet, or workstation microphone is inactive.');
      }

      // 2. Clean up any previous peer connection
      if (auditorPeerConnRef.current) {
        auditorPeerConnRef.current.close();
        auditorPeerConnRef.current = null;
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      auditorPeerConnRef.current = pc;

      // 3. Handle incoming remote audio track
      pc.ontrack = (event) => {
        if (liveAudioPlayerRef.current && event.streams[0]) {
          liveAudioPlayerRef.current.srcObject = event.streams[0];
          liveAudioPlayerRef.current.volume = isLiveAudioMuted ? 0 : liveAudioVolume;
          liveAudioPlayerRef.current.play().catch((e) => {
            console.warn('Audio auto-play policy notice:', e);
          });
        }
      };

      // 4. Handle Auditor ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          api.authorityProctor.postCandidate(sessionId, 'AUDITOR', event.candidate).catch(() => {});
        }
      };

      // 5. Set Remote Description (offer)
      await pc.setRemoteDescription(new RTCSessionDescription(offerRes.offer));

      // 6. Create Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 7. Post Answer to backend
      await api.authorityProctor.postAnswer(sessionId, {
        sdp: answer.sdp,
        type: answer.type,
      });

      // 8. Fetch translator ICE candidates
      const candRes = await api.authorityProctor.getCandidates(sessionId, 'TRANSLATOR');
      if (candRes.candidates && Array.isArray(candRes.candidates)) {
        for (const cand of candRes.candidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
      }

      // 9. Periodic candidate sync
      candidatePollIntervalRef.current = setInterval(async () => {
        try {
          const update = await api.authorityProctor.getCandidates(sessionId, 'TRANSLATOR');
          if (update.candidates && Array.isArray(update.candidates)) {
            for (const cand of update.candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
          }
        } catch {}
      }, 2500);

      setIsLiveAudioStreaming(true);
    } catch (err: any) {
      console.error('Start live audio failed:', err);
      setLiveAudioError(err.message || 'Unable to establish WebRTC audio stream.');
      setIsLiveAudioStreaming(false);
    } finally {
      setLiveAudioConnecting(false);
    }
  };

  const handleStopLiveAudio = (sessionId?: string) => {
    if (candidatePollIntervalRef.current) {
      clearInterval(candidatePollIntervalRef.current);
      candidatePollIntervalRef.current = null;
    }
    if (auditorPeerConnRef.current) {
      auditorPeerConnRef.current.close();
      auditorPeerConnRef.current = null;
    }
    if (liveAudioPlayerRef.current) {
      liveAudioPlayerRef.current.pause();
      liveAudioPlayerRef.current.srcObject = null;
    }
    setIsLiveAudioStreaming(false);
    setLiveAudioConnecting(false);
    if (sessionId) {
      api.authorityProctor.stopLiveAudio(sessionId).catch(() => {});
    }
  };

  const handleVolumeChange = (vol: number) => {
    setLiveAudioVolume(vol);
    if (liveAudioPlayerRef.current) {
      liveAudioPlayerRef.current.volume = isLiveAudioMuted ? 0 : vol;
    }
  };

  const handleToggleMute = () => {
    const newMuted = !isLiveAudioMuted;
    setIsLiveAudioMuted(newMuted);
    if (liveAudioPlayerRef.current) {
      liveAudioPlayerRef.current.volume = newMuted ? 0 : liveAudioVolume;
    }
  };

  const handleCloseReview = () => {
    handleStopLiveAudio(selectedSession?.id);
    setSelectedSession(null);
  };

  useEffect(() => {
    return () => {
      handleStopLiveAudio();
    };
  }, []);

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
    setReviewTab('all');
    setLoadingReview(true);
    setReviewError(null);
    try {
      const res = await api.authorityProctor.getSessionReview(session.id);
      setSelectedSession(res.session);
      setSessionEvents(res.events || []);
      setSessionEvidence(res.evidence || []);
      setSessionCameraEvidence(res.camera_evidence || []);
    } catch (err: any) {
      console.error('Error fetching review:', err);
      setReviewError(err.message || 'Unable to load security evidence.');
    } finally {
      setLoadingReview(false);
    }
  };

  const handleAuditorAction = async (action: 'MARK_REVIEWED' | 'ESCALATE' | 'CLOSE_CASE') => {
    if (!selectedSession) return;
    setReviewActionLoading(true);
    try {
      const res = await api.authorityProctor.reviewAction(selectedSession.id, {
        action,
        remarks: auditorRemarksInput.trim() || undefined,
      });
      setSelectedSession(res.session);
      setStatusMessage({ type: 'success', text: res.message });
      setAuditorRemarksInput('');
      loadDashboard(false);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to execute auditor action.' });
    } finally {
      setReviewActionLoading(false);
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
      if (selectedSession && selectedSession.id === sessionToLock.id) {
        setSelectedSession({
          ...selectedSession,
          emergency_locked: 1,
          emergency_lock_reason: lockReason,
        });
      }
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
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {(s.has_camera_evidence || s.verification_snapshot || (s.camera_evidence_count && s.camera_evidence_count > 0)) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Camera className="w-2.5 h-2.5" />
                            Camera Evidence Available
                          </span>
                        )}
                        {(s.has_voice_evidence || (s.voice_evidence_count && s.voice_evidence_count > 0)) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Mic className="w-2.5 h-2.5" />
                            Voice Evidence ({s.voice_evidence_count || 1})
                          </span>
                        )}
                        {s.warning_count !== undefined && s.warning_count > 0 && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            s.warning_count >= 3
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {s.warning_count}/3 Warnings
                          </span>
                        )}
                      </div>
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
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            s.microphone_status === 'ACTIVE'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {s.microphone_status === 'ACTIVE' ? (
                            <>
                              <Mic className="w-3 h-3 text-slate-500" />
                              {s.audio_level_db !== undefined ? `${s.audio_level_db} dB` : 'Active'}
                            </>
                          ) : (
                            <>
                              <MicOff className="w-3 h-3 text-rose-500" />
                              Mic Off
                            </>
                          )}
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
                      {s.status === 'FLAGGED_FOR_REVIEW' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 w-fit animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          FLAGGED FOR REVIEW
                        </span>
                      ) : s.status === 'LOCKED' ? (
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
        <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200/90 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col text-slate-800 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.18)] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-100 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                      Authority Forensic Review: {selectedSession.user_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold text-slate-700">
                        {selectedSession.user_role} Enclave
                      </span>
                      <span>•</span>
                      <span>Workspace: <strong className="text-slate-700 font-medium">{selectedSession.workspace_type}</strong></span>
                      <span>•</span>
                      <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                        Session: {selectedSession.id}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Pills & Close */}
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-1.5">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
                    selectedSession.status === 'ACTIVE' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedSession.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    {selectedSession.status === 'ACTIVE' ? 'Session Active' : selectedSession.status}
                  </span>

                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
                    selectedSession.camera_status === 'ACTIVE' 
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-200' 
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <Camera className="w-3 h-3 text-cyan-600" />
                    Cam: {selectedSession.camera_status}
                  </span>

                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
                    selectedSession.microphone_status === 'ACTIVE' 
                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <Mic className="w-3 h-3 text-blue-600" />
                    Mic: {selectedSession.microphone_status}
                  </span>

                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
                    selectedSession.face_status === 'VERIFIED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    <UserCheck className="w-3 h-3 text-emerald-600" />
                    {selectedSession.face_status === 'VERIFIED' ? 'Presence Verified' : selectedSession.face_status}
                  </span>
                </div>

                <button
                  onClick={handleCloseReview}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors cursor-pointer ml-1"
                  title="Close Modal"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              {/* Evidence Summary Metric Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Camera Snapshots */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Camera Snapshots</div>
                    <div className="text-base font-extrabold text-slate-800 font-mono">
                      {sessionCameraEvidence.length + (selectedSession.verification_snapshot ? 1 : 0)} Captured
                    </div>
                  </div>
                </div>

                {/* Voice Recordings */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-200/60">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Voice Evidence</div>
                    <div className="text-base font-extrabold text-slate-800 font-mono">
                      {sessionEvidence.length} Recordings
                    </div>
                  </div>
                </div>

                {/* Security Events */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Surveillance Events</div>
                    <div className="text-base font-extrabold text-slate-800 font-mono">
                      {sessionEvents.length} Logged
                    </div>
                  </div>
                </div>

                {/* Warnings Capped */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                    (selectedSession.warning_count || 0) >= 3 
                      ? 'bg-rose-50 text-rose-600 border-rose-200/60' 
                      : (selectedSession.warning_count || 0) > 0 
                      ? 'bg-amber-50 text-amber-600 border-amber-200/60' 
                      : 'bg-slate-100 text-slate-600 border-slate-200/60'
                  }`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Proctor Warnings</div>
                    <div className={`text-base font-extrabold font-mono ${
                      (selectedSession.warning_count || 0) >= 3 ? 'text-rose-600' : (selectedSession.warning_count || 0) > 0 ? 'text-amber-600' : 'text-slate-800'
                    }`}>
                      {selectedSession.warning_count || 0} / 3 Capped
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-Column Forensic Workspace */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Biometrics, Leak Risk & Auditor Actions (4 cols) */}
                <div className="lg:col-span-4 space-y-4">
                  {/* Identity Verification Card */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Identity Verification Photo
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Biometric Check
                      </span>
                    </div>

                    {selectedSession.verification_snapshot ? (
                      <div className="space-y-2">
                        <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                          <img
                            src={selectedSession.verification_snapshot}
                            alt="Verification"
                            className="w-full h-36 object-cover -scale-x-100 cursor-pointer group-hover:scale-105 transition-transform duration-200"
                            onClick={() =>
                              setPhotoViewerModal({
                                open: true,
                                evidence: {
                                  url: selectedSession.verification_snapshot!,
                                  title: 'Initial Identity Verification Snapshot',
                                  timestamp: selectedSession.created_at,
                                  evidenceId: 'VERIF-INIT',
                                  warningNumber: 0,
                                  officialName: selectedSession.user_name,
                                },
                              })
                            }
                          />
                          <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <span className="px-2.5 py-1 rounded-md bg-white/95 text-slate-800 text-[10px] font-semibold flex items-center gap-1 shadow-sm">
                              <Maximize2 className="w-3 h-3 text-emerald-600" />
                              Expand Photo
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setPhotoViewerModal({
                              open: true,
                              evidence: {
                                url: selectedSession.verification_snapshot!,
                                title: 'Initial Identity Verification Snapshot',
                                timestamp: selectedSession.created_at,
                                evidenceId: 'VERIF-INIT',
                                warningNumber: 0,
                                officialName: selectedSession.user_name,
                              },
                            })
                          }
                          className="w-full py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
                          View High-Resolution Image
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-32 bg-slate-50 rounded-lg flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 text-xs p-4 text-center">
                        <CameraOff className="w-6 h-6 mb-1 text-slate-300" />
                        <span>No Initial Photo Captured</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Session initiated without webcam photo</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Enclave:</span>
                        <strong className="text-slate-700 font-medium">{selectedSession.workspace_type}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Started:</span>
                        <span className="text-slate-700 font-mono text-[10px]">{new Date(selectedSession.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Security & Leak Risk Card */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Leak Risk Telemetry
                      </span>
                      <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                        selectedSession.leak_risk_score >= 60
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : selectedSession.leak_risk_score >= 30
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {selectedSession.leak_risk_level || (selectedSession.leak_risk_score >= 60 ? 'HIGH' : selectedSession.leak_risk_score >= 30 ? 'MEDIUM' : 'LOW')}
                      </span>
                    </div>

                    {/* Progress bar gauge */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-xs font-medium text-slate-600">Leak Risk Score:</span>
                        <span className={`text-xl font-extrabold font-mono ${
                          selectedSession.leak_risk_score >= 60 ? 'text-rose-600' : selectedSession.leak_risk_score >= 30 ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {selectedSession.leak_risk_score} <span className="text-xs font-normal text-slate-400">/ 100</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            selectedSession.leak_risk_score >= 60
                              ? 'bg-rose-500'
                              : selectedSession.leak_risk_score >= 30
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, selectedSession.leak_risk_score))}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 text-xs divide-y divide-slate-100">
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-500">Live Face Presence:</span>
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${selectedSession.face_status === 'VERIFIED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {selectedSession.face_status} ({selectedSession.faces_detected_count} Faces)
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500">Hardware Telemetry:</span>
                        <span className="font-mono text-[11px] text-slate-700">
                          Cam: <strong className="text-emerald-600">{selectedSession.camera_status}</strong> | Mic:{' '}
                          <strong className="text-blue-600">{selectedSession.microphone_status === 'ACTIVE' ? `${selectedSession.audio_level_db} dB` : 'Off'}</strong>
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-slate-500">Warnings Incurred:</span>
                        <span className={`font-mono font-bold text-xs ${
                          (selectedSession.warning_count || 0) >= 3 ? 'text-rose-600' : (selectedSession.warning_count || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {selectedSession.warning_count || 0} / 3 Warnings
                        </span>
                      </div>
                    </div>

                    {selectedSession.emergency_locked ? (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-rose-900">
                          <Lock className="w-3.5 h-3.5 text-rose-600" />
                          Terminal Under Emergency Lockdown
                        </div>
                        <div className="text-[11px] leading-tight text-rose-700">
                          {selectedSession.emergency_lock_reason || 'Remote blackout executed by security auditor.'}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Authorized Real-Time Live Audio Surveillance (WebRTC) */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-blue-600" />
                        Live Microphone Surveillance
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        isLiveAudioStreaming
                          ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {isLiveAudioStreaming ? '● LIVE AUDIO ACTIVE' : 'STANDBY'}
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Workstation Audio Level:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {selectedSession.microphone_status === 'ACTIVE'
                            ? `${selectedSession.audio_level_db ?? -45} dB`
                            : 'Inactive'}
                        </span>
                      </div>

                      {/* Decibel audio level visual bar */}
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isLiveAudioStreaming
                              ? 'bg-blue-500'
                              : selectedSession.microphone_status === 'ACTIVE'
                              ? 'bg-emerald-500'
                              : 'bg-slate-300'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(8, ((selectedSession.audio_level_db ?? -60) + 65) * 2)
                            )}%`,
                          }}
                        />
                      </div>

                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {isLiveAudioStreaming
                          ? 'Secure WebRTC continuous audio connection active. Audio is streaming directly to your auditor speakers/headphones.'
                          : 'Listen to authorized continuous live microphone audio from the translator workstation in real-time.'}
                      </p>

                      {liveAudioError && (
                        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                          <span>{liveAudioError}</span>
                        </div>
                      )}
                    </div>

                    {/* Audio Controls */}
                    {!isLiveAudioStreaming ? (
                      <button
                        type="button"
                        onClick={() => handleStartLiveAudio(selectedSession.id)}
                        disabled={liveAudioConnecting || selectedSession.status !== 'ACTIVE'}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                      >
                        {liveAudioConnecting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Connecting WebRTC Live Audio...</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-4 h-4" />
                            <span>Start Live Audio</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between gap-3 bg-blue-50/70 p-2.5 rounded-xl border border-blue-200/70">
                          <button
                            type="button"
                            onClick={handleToggleMute}
                            className="p-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                            title={isLiveAudioMuted ? 'Unmute Live Audio' : 'Mute Live Audio'}
                          >
                            {isLiveAudioMuted ? <VolumeX className="w-4 h-4 text-rose-600" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
                          </button>

                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500">Vol:</span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={isLiveAudioMuted ? 0 : liveAudioVolume}
                              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                              className="w-full accent-blue-600 h-1.5 cursor-pointer"
                            />
                            <span className="text-[10px] font-mono font-semibold text-slate-700 w-8 text-right">
                              {Math.round((isLiveAudioMuted ? 0 : liveAudioVolume) * 100)}%
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleStopLiveAudio(selectedSession.id)}
                          className="w-full py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <VolumeX className="w-4 h-4" />
                          <span>Stop Live Audio</span>
                        </button>
                      </div>
                    )}

                    {/* Hidden HTML5 Audio Element for WebRTC Stream Playback */}
                    <audio ref={liveAudioPlayerRef} autoPlay playsInline className="hidden" />
                  </div>

                  {/* CBI Chief Vigilance & Security Auditor Review Actions */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        CBI Auditor Decision & Actions
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {selectedSession.review_status || 'PENDING_REVIEW'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-slate-600 block">
                        Forensic Findings & Remarks:
                      </label>
                      <textarea
                        value={auditorRemarksInput}
                        onChange={(e) => setAuditorRemarksInput(e.target.value)}
                        rows={2}
                        placeholder="Enter formal compliance findings, inquiry notes, or clearance remarks..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-slate-400 resize-none transition-colors"
                      />
                      {selectedSession.auditor_remarks && (
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-md border border-slate-200/60 italic">
                          Previous note by {selectedSession.reviewed_by || 'Auditor'}: "{selectedSession.auditor_remarks}"
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleAuditorAction('MARK_REVIEWED')}
                        disabled={reviewActionLoading}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Reviewed
                      </button>

                      <button
                        onClick={() => handleAuditorAction('ESCALATE')}
                        disabled={reviewActionLoading}
                        className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Escalate Inquiry
                      </button>

                      <button
                        onClick={() => handleAuditorAction('CLOSE_CASE')}
                        disabled={reviewActionLoading}
                        className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5 text-slate-500" />
                        Close Case
                      </button>

                      {!selectedSession.emergency_locked && (
                        <button
                          onClick={() => handleOpenLockdown(selectedSession)}
                          className="px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5 text-rose-600" />
                          Lockdown Screen
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Evidence Gallery, Audio Recordings & Event Timeline (8 cols) */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Category Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
                    <button
                      onClick={() => setReviewTab('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        reviewTab === 'all'
                          ? 'bg-white text-slate-800 shadow-xs border border-slate-200/70'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      All Evidence & Logs
                      <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                        {sessionEvents.length + sessionCameraEvidence.length + sessionEvidence.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setReviewTab('camera')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        reviewTab === 'camera'
                          ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200/70'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-600" />
                      Camera Snapshots
                      <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        {sessionCameraEvidence.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setReviewTab('voice')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        reviewTab === 'voice'
                          ? 'bg-white text-indigo-800 shadow-xs border border-indigo-200/70'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5 text-indigo-600" />
                      Voice Evidence
                      <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                        {sessionEvidence.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setReviewTab('events')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        reviewTab === 'events'
                          ? 'bg-white text-blue-800 shadow-xs border border-blue-200/70'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Surveillance Timeline
                      <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                        {sessionEvents.length}
                      </span>
                    </button>
                  </div>

                  {/* Loading State */}
                  {loadingReview && (
                    <div className="bg-white rounded-xl border border-slate-200/90 p-8 text-center space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                      <p className="text-xs text-slate-600 font-medium">Loading session audit evidence and event timeline...</p>
                    </div>
                  )}

                  {/* Error State */}
                  {reviewError && !loadingReview && (
                    <div className="bg-rose-50 rounded-xl border border-rose-200 p-4 text-xs text-rose-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{reviewError}</span>
                      </div>
                      <button
                        onClick={() => selectedSession && handleOpenReview(selectedSession)}
                        className="px-2.5 py-1 rounded-md bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {!loadingReview && (
                    <>
                      {/* 1. Camera Snapshot Evidence Gallery */}
                      {(reviewTab === 'all' || reviewTab === 'camera') && (
                        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Camera className="w-4 h-4 text-emerald-600" />
                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                Camera Snapshot Evidence ({sessionCameraEvidence.length})
                              </h4>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              CBI Forensic Gallery
                            </span>
                          </div>

                          {sessionCameraEvidence.length === 0 && !selectedSession.verification_snapshot ? (
                            <div className="text-center py-6 text-slate-400 text-xs bg-slate-50/60 rounded-lg border border-dashed border-slate-200">
                              No camera snapshots captured for this proctoring session.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {sessionCameraEvidence.map((cam) => (
                                <div
                                  key={cam.id}
                                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/70 border border-slate-200/80 space-y-2 text-center transition-colors"
                                >
                                  <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-white">
                                    <img
                                      src={cam.image_data_url}
                                      alt={cam.event_type}
                                      className="w-full h-24 object-cover -scale-x-100 cursor-pointer group-hover:scale-105 transition-transform duration-200"
                                      onClick={() =>
                                        setPhotoViewerModal({
                                          open: true,
                                          evidence: {
                                            url: cam.image_data_url,
                                            title: cam.event_type,
                                            timestamp: cam.created_at,
                                            evidenceId: cam.id,
                                            warningNumber: cam.warning_number,
                                            officialName: cam.user_name,
                                          },
                                        })
                                      }
                                    />
                                    <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                      <Maximize2 className="w-4 h-4 text-white drop-shadow" />
                                    </div>
                                  </div>
                                  <div className="text-[11px] font-semibold text-slate-800 truncate" title={cam.event_type}>
                                    {cam.event_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {new Date(cam.created_at).toLocaleTimeString()}
                                    {cam.warning_number ? (
                                      <span className="ml-1 text-amber-700 font-bold font-mono">
                                        (W#{cam.warning_number})
                                      </span>
                                    ) : null}
                                  </div>
                                  <button
                                    onClick={() =>
                                      setPhotoViewerModal({
                                        open: true,
                                        evidence: {
                                          url: cam.image_data_url,
                                          title: cam.event_type,
                                          timestamp: cam.created_at,
                                          evidenceId: cam.id,
                                          warningNumber: cam.warning_number,
                                          officialName: cam.user_name,
                                        },
                                      })
                                    }
                                    className="w-full py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Maximize2 className="w-2.5 h-2.5 text-emerald-600" />
                                    View Image
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. Auditor Voice Evidence Recordings */}
                      {(reviewTab === 'all' || reviewTab === 'voice') && (
                        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Mic className="w-4 h-4 text-indigo-600" />
                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                Auditor Voice Evidence Recordings ({sessionEvidence.length})
                              </h4>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              CBI Chief Vigilance Review Queue
                            </span>
                          </div>

                          {sessionEvidence.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 text-xs bg-slate-50/60 rounded-lg border border-dashed border-slate-200">
                              No voice recordings submitted for this proctoring session.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {sessionEvidence.map((ev) => (
                                <div
                                  key={ev.id}
                                  className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-2.5"
                                >
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-slate-800">{ev.submitted_by || ev.user_name}</span>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-slate-500 font-mono text-[11px]">
                                        {new Date(ev.created_at).toLocaleTimeString()} ({ev.duration_seconds}s)
                                      </span>
                                      {ev.warning_number ? (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                          Warning #{ev.warning_number}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                                        ID: {ev.id}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {ev.review_status || 'PENDING_REVIEW'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <audio
                                      controls
                                      src={ev.audio_data_url}
                                      className="flex-1 h-8 accent-indigo-600 rounded"
                                    />
                                    <button
                                      onClick={() => setAudioPlayerModal({ open: true, evidence: ev })}
                                      className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                                    >
                                      <Play className="w-3 h-3 text-indigo-600" />
                                      Play in Player
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. Chronological Surveillance Event Log */}
                      {(reviewTab === 'all' || reviewTab === 'events') && (
                        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Activity className="w-4 h-4 text-blue-600" />
                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                Chronological Surveillance Event Log ({sessionEvents.length})
                              </h4>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              Real-Time Telemetry Log
                            </span>
                          </div>

                          {sessionEvents.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs bg-slate-50/60 rounded-lg border border-dashed border-slate-200">
                              No suspicious events logged for this proctoring session.
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {sessionEvents.map((ev, idx) => {
                                const parsed = parseEventDetails(ev);
                                const matchingCam = sessionCameraEvidence.find(
                                  (c) => (c.warning_number && c.warning_number === parsed.meta.warning_number) || c.event_type === ev.event_type
                                );
                                const matchingAudio = sessionEvidence.find(
                                  (a) => a.warning_number && a.warning_number === parsed.meta.warning_number
                                );

                                return (
                                  <div
                                    key={ev.id || idx}
                                    className="p-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/70 flex items-start justify-between gap-3 text-xs transition-colors"
                                  >
                                    <div className="space-y-1.5 flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1.5 ${parsed.badgeClasses}`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${parsed.dotColor}`} />
                                          {parsed.cleanTitle}
                                        </span>
                                        <span className="text-slate-500 font-mono text-[11px]">
                                          {new Date(ev.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="text-[10px] font-mono text-slate-400">
                                          Severity: <strong>{ev.severity}</strong>
                                        </span>
                                      </div>

                                      <p className="text-xs text-slate-700 leading-relaxed font-normal">
                                        {parsed.description}
                                      </p>

                                      {/* Attached Evidence Quick Buttons */}
                                      {(matchingCam || matchingAudio) && (
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                          {matchingCam && (
                                            <button
                                              onClick={() =>
                                                setPhotoViewerModal({
                                                  open: true,
                                                  evidence: {
                                                    url: matchingCam.image_data_url,
                                                    title: matchingCam.event_type,
                                                    timestamp: matchingCam.created_at,
                                                    evidenceId: matchingCam.id,
                                                    warningNumber: matchingCam.warning_number,
                                                    officialName: selectedSession.user_name,
                                                  },
                                                })
                                              }
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                                            >
                                              <Camera className="w-3 h-3 text-emerald-600" />
                                              View Captured Snapshot
                                            </button>
                                          )}

                                          {matchingAudio && (
                                            <button
                                              onClick={() => setAudioPlayerModal({ open: true, evidence: matchingAudio })}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                                            >
                                              <Mic className="w-3 h-3 text-indigo-600" />
                                              Play Voice Evidence ({matchingAudio.duration_seconds}s)
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="text-right shrink-0">
                                      <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 text-xs">
                                        +{ev.risk_points} pts
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHOTO VIEWER MODAL */}
      {photoViewerModal.open && photoViewerModal.evidence && (
        <div className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 text-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  Forensic Camera Snapshot Evidence
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evidence ID: <span className="font-mono text-emerald-700 font-semibold">{photoViewerModal.evidence.evidenceId || 'CAM-EV-AUDIT'}</span>
                  {photoViewerModal.evidence.officialName ? ` • Official: ${photoViewerModal.evidence.officialName}` : ''}
                </p>
              </div>
              <button
                onClick={() => setPhotoViewerModal({ open: false, evidence: null })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-2 shadow-inner">
              <img
                src={photoViewerModal.evidence.url}
                alt="Forensic Evidence"
                className="max-h-[50vh] w-auto object-contain rounded-lg -scale-x-100 shadow-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">Associated Event</span>
                <span className="font-semibold text-slate-800">{photoViewerModal.evidence.title || 'Camera Snapshot'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">Timestamp</span>
                <span className="font-mono text-slate-700 font-medium">
                  {photoViewerModal.evidence.timestamp ? new Date(photoViewerModal.evidence.timestamp).toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[10px] font-mono text-amber-700 font-semibold bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                RESTRICTED FORENSIC RECORD • ACCESS CONTROLLED
              </span>
              <button
                onClick={() => setPhotoViewerModal({ open: false, evidence: null })}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECURE AUDIO PLAYER MODAL */}
      {audioPlayerModal.open && audioPlayerModal.evidence && (
        <div className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 text-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-indigo-600" />
                  Forensic Voice Evidence Player
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evidence ID: <span className="font-mono text-indigo-700 font-semibold">{audioPlayerModal.evidence.id}</span>
                </p>
              </div>
              <button
                onClick={() => setAudioPlayerModal({ open: false, evidence: null })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Official:</span>
                <span className="font-semibold text-slate-800">{audioPlayerModal.evidence.user_name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Duration:</span>
                <span className="font-mono font-semibold text-slate-800">{audioPlayerModal.evidence.duration_seconds}s</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Recorded At:</span>
                <span className="font-mono text-slate-700">{new Date(audioPlayerModal.evidence.created_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Designated Recipient:</span>
                <span className="font-semibold text-indigo-700">{audioPlayerModal.evidence.recipient || 'CBI Chief Vigilance & Security Auditor'}</span>
              </div>
              <audio
                controls
                autoPlay={false}
                src={audioPlayerModal.evidence.audio_data_url}
                className="w-full h-10 mt-2 accent-indigo-600 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[10px] font-mono text-amber-700 font-semibold bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                RESTRICTED FORENSIC AUDIO • ACCESS MONITORED
              </span>
              <button
                onClick={() => setAudioPlayerModal({ open: false, evidence: null })}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Player
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY LOCKDOWN MODAL */}
      {lockdownModalOpen && sessionToLock && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border-2 border-rose-500/80 rounded-2xl w-full max-w-md p-6 text-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Confirm Emergency Screen Lockdown
                </h3>
                <p className="text-xs text-rose-700 font-medium">
                  Target: {sessionToLock.user_name} ({sessionToLock.user_role})
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-xl text-xs text-slate-700 leading-relaxed">
              This action will <strong className="text-rose-900">instantly blackout the official's screen</strong> and terminate their access to the confidential question paper or decryption vault to prevent unauthorized leakage.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Reason for Lockdown:
              </label>
              <textarea
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 placeholder:text-slate-400 resize-none transition-colors"
                placeholder="Specify detected threat or reason..."
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setLockdownModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLockdown}
                disabled={locking}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
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

