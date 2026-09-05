import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  Activity,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Eye,
  Camera,
  Mic,
  Maximize2,
  UserX,
  Play,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
} from 'lucide-react';
import { api } from '../../api';
import { ExamAttempt, ProctorSettings } from '../../types';
import { ProctorReviewModal } from './ProctorReviewModal';

interface ProctorDashboardProps {
  onLaunchCandidateSimulator?: () => void;
}

export const ProctorDashboard: React.FC<ProctorDashboardProps> = ({
  onLaunchCandidateSimulator,
}) => {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [exams, setExams] = useState<{ id: string; name: string; subject: string }[]>([]);
  const [metrics, setMetrics] = useState({
    total_attempts: 0,
    active_sessions: 0,
    flagged_sessions: 0,
    critical_sessions: 0,
    avg_risk_score: 0,
  });

  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRisk, setSelectedRisk] = useState<string>('ALL');

  // Active Review Modal
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null);

  // Settings Modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<ProctorSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const pollingRef = useRef<any>(null);

  useEffect(() => {
    loadDashboard();
    loadSettings();
  }, [selectedExamId, selectedStatus, selectedRisk]);

  useEffect(() => {
    if (autoRefresh) {
      pollingRef.current = setInterval(() => {
        loadDashboard(false);
      }, 4000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [autoRefresh, selectedExamId, selectedStatus, selectedRisk]);

  const loadDashboard = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api.proctor.getDashboard({
        exam_id: selectedExamId,
        status: selectedStatus,
        risk_level: selectedRisk,
      });

      setAttempts(res.attempts || []);
      setExams(res.exams || []);
      if (res.metrics) setMetrics(res.metrics);
    } catch (e: any) {
      console.warn('Dashboard fetch error:', e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await api.proctor.getSettings();
      if (res.settings) setSettings(res.settings);
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      await api.proctor.updateSettings(settings);
      setShowSettingsModal(false);
      loadDashboard();
    } catch (err: any) {
      alert(`Settings update failed: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold mb-2">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Real-time Anti-Cheat & Telemetry Console</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-serif">
            Live Proctoring & Telemetric Evidence Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            ZeroLeak multi-layer behavioural surveillance: Page visibility, fullscreen locks, face absence/multi-face detection, audio anomalies, and forensic timelines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Candidate Test Simulator Button */}
          {onLaunchCandidateSimulator && (
            <button
              onClick={onLaunchCandidateSimulator}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-teal-800 to-emerald-700 hover:from-teal-700 hover:to-emerald-600 text-white text-xs font-bold shadow transition-all flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Simulate Candidate Exam</span>
            </button>
          )}

          {/* Configurable Risk Weights Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-50 transition-all flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Risk Weights</span>
          </button>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span>{autoRefresh ? 'Live Polling (4s)' : 'Polling Paused'}</span>
          </button>
        </div>
      </div>

      {/* 2. Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Attempts</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1 block">
            {metrics.total_attempts}
          </span>
          <span className="text-[10px] text-slate-400">All registered attempts</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Live Connected</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1 block">
            {metrics.active_sessions}
          </span>
          <span className="text-[10px] text-slate-400">Currently in exam</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Flagged for Review</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1 block">
            {metrics.flagged_sessions}
          </span>
          <span className="text-[10px] text-slate-400">Score &ge; 60 or &ge; 3 warnings</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">Critical Risk</span>
          <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono mt-1 block">
            {metrics.critical_sessions}
          </span>
          <span className="text-[10px] text-slate-400">High / Critical tier</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Avg Risk Score</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1 block">
            {metrics.avg_risk_score} / 100
          </span>
          <span className="text-[10px] text-slate-400">Telemetry mean index</span>
        </div>
      </div>

      {/* 3. Filter Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="font-bold text-slate-700 dark:text-slate-300">Filter By:</span>
        </div>

        <select
          value={selectedExamId}
          onChange={e => setSelectedExamId(e.target.value)}
          className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
        >
          <option value="ALL">All Examinations</option>
          {exams.map(ex => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
        >
          <option value="ALL">All Statuses</option>
          <option value="IN_PROGRESS">Active / In Progress</option>
          <option value="FLAGGED_FOR_REVIEW">Flagged for Review</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="VERIFIED_VALID">Verified Valid</option>
        </select>

        <select
          value={selectedRisk}
          onChange={e => setSelectedRisk(e.target.value)}
          className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
        >
          <option value="ALL">All Risk Tiers</option>
          <option value="NORMAL">Normal (0–20)</option>
          <option value="LOW">Low Risk (21–40)</option>
          <option value="MEDIUM">Medium Risk (41–60)</option>
          <option value="HIGH">High Risk (61–80)</option>
          <option value="CRITICAL">Critical Risk (81–100)</option>
        </select>

        <button
          onClick={() => loadDashboard(true)}
          className="ml-auto px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* 4. Live Candidates Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-4">Candidate</th>
                <th className="py-3.5 px-4">Exam & Subject</th>
                <th className="py-3.5 px-4">Progress</th>
                <th className="py-3.5 px-4">Risk Index</th>
                <th className="py-3.5 px-4">Hardware Telemetry</th>
                <th className="py-3.5 px-4">Warnings</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {attempts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No proctored examination attempts match the active filter criteria.
                  </td>
                </tr>
              ) : (
                attempts.map(att => {
                  const progressPct = att.total_questions > 0 ? Math.round((att.answered_questions / att.total_questions) * 100) : 0;
                  return (
                    <tr key={att.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Candidate Column */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {att.verification_snapshot ? (
                            <img
                              src={att.verification_snapshot}
                              alt={att.student_name}
                              className="w-10 h-10 rounded-xl object-cover border border-emerald-400 shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 shrink-0">
                              {att.student_name ? att.student_name[0] : 'S'}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">{att.student_name}</span>
                            <span className="font-mono text-[11px] text-slate-500 block">{att.student_id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Exam Column */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800 dark:text-slate-200 block truncate max-w-[180px]">
                          {att.exam_name || att.exam_id}
                        </span>
                        <span className="text-[11px] text-slate-400 block">{att.exam_subject}</span>
                      </td>

                      {/* Progress Column */}
                      <td className="py-3 px-4">
                        <div className="space-y-1 w-24">
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>{att.answered_questions}/{att.total_questions}</span>
                            <span>{progressPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Risk Score */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${
                            att.risk_level === 'CRITICAL'
                              ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                              : att.risk_level === 'HIGH'
                              ? 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800'
                              : att.risk_level === 'MEDIUM'
                              ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                          }`}>
                            {att.risk_level} ({att.risk_score}/100)
                          </span>
                        </div>
                      </td>

                      {/* Live Hardware Telemetry */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span title={`Camera: ${att.camera_status || 'ACTIVE'}`} className={`p-1 rounded-md ${att.camera_status === 'DISABLED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-emerald-600'}`}>
                            <Camera className="w-3.5 h-3.5" />
                          </span>

                          <span title={`Mic: ${att.microphone_status || 'ACTIVE'}`} className={`p-1 rounded-md ${att.microphone_status === 'DISABLED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-emerald-600'}`}>
                            <Mic className="w-3.5 h-3.5" />
                          </span>

                          <span title={`Fullscreen: ${att.fullscreen_status || 'ACTIVE'}`} className={`p-1 rounded-md ${att.fullscreen_status === 'EXITED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-emerald-600'}`}>
                            <Maximize2 className="w-3.5 h-3.5" />
                          </span>

                          <span title={`Face: ${att.face_status || 'DETECTED'}`} className={`p-1 rounded-md font-mono text-[10px] font-bold ${
                            att.face_status === 'MULTIPLE'
                              ? 'bg-rose-100 text-rose-700'
                              : att.face_status === 'NOT_DETECTED'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-emerald-600'
                          }`}>
                            {att.faces_detected_count ?? 1}F
                          </span>
                        </div>
                      </td>

                      {/* Warnings */}
                      <td className="py-3 px-4">
                        <span className={`font-mono font-bold ${att.warning_count >= 3 ? 'text-rose-600' : att.warning_count > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                          {att.warning_count}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          att.status === 'FLAGGED_FOR_REVIEW'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : att.status === 'VERIFIED_VALID'
                            ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                            : att.status === 'SUBMITTED'
                            ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse'
                        }`}>
                          {att.status === 'FLAGGED_FOR_REVIEW' ? 'FLAGGED' : att.status}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setReviewAttemptId(att.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs transition-all flex items-center gap-1.5 ml-auto shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Forensic Review</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Detailed Forensic Review Modal */}
      {reviewAttemptId && (
        <ProctorReviewModal
          attemptId={reviewAttemptId}
          onClose={() => setReviewAttemptId(null)}
          onDecisionSaved={() => loadDashboard(false)}
        />
      )}

      {/* 6. Configurable Risk Weights Modal */}
      {showSettingsModal && settings && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white font-serif">
                  Configurable Proctor Risk Score Weights
                </h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-700">
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Adjust how many penalty points each suspicious activity signal contributes to the 0–100 Proctor Risk Score.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Tab Switch (+pts)</label>
                <input
                  type="number"
                  value={settings.tab_switch_points}
                  onChange={e => setSettings({ ...settings, tab_switch_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Fullscreen Exit (+pts)</label>
                <input
                  type="number"
                  value={settings.fullscreen_exit_points}
                  onChange={e => setSettings({ ...settings, fullscreen_exit_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Face Not Detected (+pts)</label>
                <input
                  type="number"
                  value={settings.face_not_detected_points}
                  onChange={e => setSettings({ ...settings, face_not_detected_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Multiple Faces (+pts)</label>
                <input
                  type="number"
                  value={settings.multiple_faces_points}
                  onChange={e => setSettings({ ...settings, multiple_faces_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Camera Disabled (+pts)</label>
                <input
                  type="number"
                  value={settings.camera_disabled_points}
                  onChange={e => setSettings({ ...settings, camera_disabled_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Audio Activity (+pts)</label>
                <input
                  type="number"
                  value={settings.audio_activity_points}
                  onChange={e => setSettings({ ...settings, audio_activity_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Copy / Paste (+pts)</label>
                <input
                  type="number"
                  value={settings.copy_paste_points}
                  onChange={e => setSettings({ ...settings, copy_paste_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Shortcuts (+pts)</label>
                <input
                  type="number"
                  value={settings.key_shortcut_points}
                  onChange={e => setSettings({ ...settings, key_shortcut_points: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Max Warnings Count</label>
                <input
                  type="number"
                  value={settings.max_warnings}
                  onChange={e => setSettings({ ...settings, max_warnings: Number(e.target.value) })}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow"
              >
                {savingSettings ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

