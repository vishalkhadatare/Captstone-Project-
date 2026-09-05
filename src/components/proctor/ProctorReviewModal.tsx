import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  FileText,
  Activity,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api';
import { ExamAttempt, ProctorEvent } from '../../types';

interface ProctorReviewModalProps {
  attemptId: string;
  onClose: () => void;
  onDecisionSaved: () => void;
}

export const ProctorReviewModal: React.FC<ProctorReviewModalProps> = ({
  attemptId,
  onClose,
  onDecisionSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [remarks, setRemarks] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadAttemptDetails();
  }, [attemptId]);

  const loadAttemptDetails = async () => {
    setLoading(true);
    try {
      const res = await api.proctor.getAttemptReview(attemptId);
      setAttempt(res.attempt);
      setEvents(res.events || []);
      if (res.attempt?.proctor_remarks) {
        setRemarks(res.attempt.proctor_remarks);
      }
    } catch (e: any) {
      console.error('Failed to load review details:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordDecision = async (decision: 'VERIFIED_VALID' | 'VIOLATION_CONFIRMED') => {
    setSavingDecision(true);
    setActionMessage(null);
    try {
      await api.proctor.recordDecision(attemptId, {
        decision,
        remarks: remarks.trim(),
      });
      setActionMessage({
        type: 'success',
        text: `Evaluation recorded as ${decision === 'VERIFIED_VALID' ? 'VALID' : 'VIOLATION CONFIRMED'}.`,
      });
      onDecisionSaved();
      loadAttemptDetails();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to save decision.' });
    } finally {
      setSavingDecision(false);
    }
  };

  const getEventBadgeClass = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-950 text-rose-300 border-rose-800';
      case 'HIGH':
        return 'bg-orange-950 text-orange-300 border-orange-800';
      case 'MEDIUM':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-900 text-emerald-400 border border-slate-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-serif">
                Forensic Proctoring Review & Evidence Timeline
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Attempt ID: <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">{attemptId}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500">Loading candidate forensic timeline...</div>
        ) : !attempt ? (
          <div className="p-16 text-center text-xs text-rose-500">Attempt record not found.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top Summary: Candidate Info + Risk Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Candidate Verification Photo Card */}
              <div className="md:col-span-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 flex flex-col items-center text-center space-y-3">
                {attempt.verification_snapshot ? (
                  <img
                    src={attempt.verification_snapshot}
                    alt="Candidate Verification Snapshot"
                    className="w-full h-36 object-cover rounded-xl border-2 border-emerald-500/80 shadow-md"
                  />
                ) : (
                  <div className="w-full h-36 bg-slate-200 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-400">
                    <User className="w-12 h-12" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{attempt.student_name}</h3>
                  <p className="text-xs font-mono text-slate-500">{attempt.student_id}</p>
                  <p className="text-[11px] text-slate-400">{attempt.student_email}</p>
                </div>
              </div>

              {/* Exam & Score Overview */}
              <div className="md:col-span-8 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Exam</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">{attempt.exam_name || 'Exam'}</span>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Answered</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                      {attempt.answered_questions} / {attempt.total_questions}
                    </span>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Objective Score</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono block mt-0.5">{attempt.score} marks</span>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Warnings</span>
                    <span className={`font-bold block mt-0.5 ${attempt.warning_count > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                      {attempt.warning_count} issued
                    </span>
                  </div>
                </div>

                {/* Risk Score Progress Bar */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Calculated Proctor Risk Score
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${
                      attempt.risk_level === 'CRITICAL'
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        : attempt.risk_level === 'HIGH'
                        ? 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300'
                        : attempt.risk_level === 'MEDIUM'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {attempt.risk_level} ({attempt.risk_score}/100)
                    </span>
                  </div>

                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        attempt.risk_score >= 80
                          ? 'bg-rose-500'
                          : attempt.risk_score >= 60
                          ? 'bg-orange-500'
                          : attempt.risk_score >= 40
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, attempt.risk_score)}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-slate-400">
                    *Principle: Browser signals are evidence for human review, not automated proof of cheating.
                  </p>
                </div>
              </div>
            </div>

            {/* Chronological Event Timeline */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chronological Telemetric Timeline ({events.length} Events)</span>
              </h3>

              {events.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  No suspicious events were logged during this attempt.
                </div>
              ) : (
                <div className="space-y-2.5 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                  {events.map((ev, idx) => {
                    const timeStr = new Date(ev.timestamp).toLocaleTimeString();
                    return (
                      <div key={ev.id || idx} className="relative flex items-start gap-4 pl-8 group">
                        <div className={`absolute left-2 top-1.5 w-3 h-3 rounded-full border-2 bg-white dark:bg-slate-900 ${
                          ev.severity === 'CRITICAL'
                            ? 'border-rose-500 bg-rose-500'
                            : ev.severity === 'HIGH'
                            ? 'border-orange-500 bg-orange-500'
                            : ev.severity === 'MEDIUM'
                            ? 'border-amber-500 bg-amber-500'
                            : 'border-emerald-500 bg-emerald-500'
                        }`} />

                        <div className="flex-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                                {ev.event_type}
                              </span>
                              <span className={`px-2 py-0.5 text-[9px] font-bold rounded border ${getEventBadgeClass(ev.severity)}`}>
                                {ev.severity}
                              </span>
                              {ev.risk_points > 0 && (
                                <span className="text-[10px] text-rose-500 font-mono">
                                  +{ev.risk_points} pts
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">{timeStr}</span>
                          </div>

                          {ev.metadata && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800 mt-1">
                              {typeof ev.metadata === 'object'
                                ? Object.entries(ev.metadata).map(([k, v]) => (
                                    <div key={k} className="flex gap-2">
                                      <span className="text-slate-400">{k}:</span>
                                      <span className="text-slate-700 dark:text-slate-300">{String(v)}</span>
                                    </div>
                                  ))
                                : String(ev.metadata)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Proctor Evaluation & Decision Panel */}
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Manual Proctor Committee Evaluation</span>
              </h3>

              {attempt.proctor_decision && attempt.proctor_decision !== 'PENDING' && (
                <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                  attempt.proctor_decision === 'VERIFIED_VALID'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                }`}>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Current Assessment: {attempt.proctor_decision === 'VERIFIED_VALID' ? 'CLEARED AS VALID EXAMINATION' : 'CONFIRMED CHEATING / VIOLATION'}</span>
                </div>
              )}

              {actionMessage && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  actionMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  <AlertCircle className="w-4 h-4" />
                  <span>{actionMessage.text}</span>
                </div>
              )}

              <textarea
                rows={3}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Enter proctor audit notes, explanation, or committee verdict rationale..."
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-emerald-500"
              />

              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                <button
                  onClick={() => handleRecordDecision('VERIFIED_VALID')}
                  disabled={savingDecision}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Clear Flags & Mark Valid</span>
                </button>

                <button
                  onClick={() => handleRecordDecision('VIOLATION_CONFIRMED')}
                  disabled={savingDecision}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow transition-all flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Confirm Proctor Violation</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

