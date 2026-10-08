import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Clock,
  Eye,
  AlertTriangle,
  X,
  CheckCircle2,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { api } from '../api';
import { User } from '../types';

interface ViewOncePaperPreviewModalProps {
  examType: 'COMPETITIVE' | 'UNIVERSITY';
  examId: string;
  paperId: string;
  paperTitle: string;
  sessionToken: string;
  durationSeconds: number;
  currentUser: User | null;
  onClose: (reason: 'CONFIRMED_FINALIZE' | 'USER_CLOSED' | 'CANCELLED' | 'EXPIRED') => void;
  onConfirmFinalize?: () => void;
  children: React.ReactNode;
}

export const ViewOncePaperPreviewModal: React.FC<ViewOncePaperPreviewModalProps> = ({
  examType,
  examId,
  paperId,
  paperTitle,
  sessionToken,
  durationSeconds: initialDurationSeconds,
  currentUser,
  onClose,
  onConfirmFinalize,
  children,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(initialDurationSeconds || 900);
  const [isObscured, setIsObscured] = useState(false);
  const [obscureReason, setObscureReason] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConsuming, setIsConsuming] = useState(false);
  const [securityWarnings, setSecurityWarnings] = useState<string[]>([]);
  const hasConsumedRef = useRef(false);

  // Formatted countdown timer MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Safe server-side consume call
  const triggerConsume = useCallback(
    async (reason: 'CONFIRMED_FINALIZE' | 'USER_CLOSED' | 'CANCELLED' | 'EXPIRED') => {
      if (hasConsumedRef.current) return;
      hasConsumedRef.current = true;
      setIsConsuming(true);
      try {
        await api.consumeViewOnce({
          examType,
          paperId,
          sessionToken,
          reason,
        });
      } catch (err) {
        console.warn('[ViewOnce] Consume notice:', err);
      } finally {
        setIsConsuming(false);
        onClose(reason);
        if (reason === 'CONFIRMED_FINALIZE' && onConfirmFinalize) {
          onConfirmFinalize();
        }
      }
    },
    [examType, paperId, sessionToken, onClose, onConfirmFinalize]
  );

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          triggerConsume('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [triggerConsume]);

  // Window defocus / visibility change / PrintScreen protection
  useEffect(() => {
    const handleBlur = () => {
      setIsObscured(true);
      setObscureReason('Window defocus detected. Paper content obscured for examination security.');
      api.recordViewOnceSecurityEvent({
        examType,
        examId,
        paperId,
        sessionToken,
        eventType: 'WINDOW_DEFOCUS_DETECTED',
        details: { timestamp: new Date().toISOString() },
      }).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsObscured(true);
        setObscureReason('Tab or app switch detected. Paper content obscured for examination security.');
        api.recordViewOnceSecurityEvent({
          examType,
          examId,
          paperId,
          sessionToken,
          eventType: 'VISIBILITY_HIDDEN_DETECTED',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Intercept PrintScreen
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        setIsObscured(true);
        setObscureReason('Screenshot key detected. Screen capture is strictly prohibited during paper verification.');
        setSecurityWarnings((prev) => [...prev.slice(-4), 'Screenshot attempt intercepted']);
        api.recordViewOnceSecurityEvent({
          examType,
          examId,
          paperId,
          sessionToken,
          eventType: 'PRINTSCREEN_KEY_DETECTED',
          details: { key: e.key, code: e.code, timestamp: new Date().toISOString() },
        }).catch(() => {});
        return;
      }

      // Intercept Ctrl+P, Cmd+P (Print)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        setSecurityWarnings((prev) => [...prev.slice(-4), 'Browser Print shortcut blocked']);
        api.recordViewOnceSecurityEvent({
          examType,
          examId,
          paperId,
          sessionToken,
          eventType: 'PRINT_SHORTCUT_BLOCKED',
          details: { shortcut: 'Ctrl+P', timestamp: new Date().toISOString() },
        }).catch(() => {});
        return;
      }

      // Intercept Ctrl+S, Cmd+S (Save)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        setSecurityWarnings((prev) => [...prev.slice(-4), 'Save webpage shortcut blocked']);
        return;
      }

      // Intercept Escape key to trigger confirmation exit
      if (e.key === 'Escape') {
        setShowConfirmModal(true);
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown, true);

    // Unload beacon to consume preview on refresh/navigate away
    const handleBeforeUnload = () => {
      if (!hasConsumedRef.current) {
        hasConsumedRef.current = true;
        try {
          const payload = JSON.stringify({
            examType,
            paperId,
            sessionToken,
            reason: 'USER_CLOSED',
          });
          navigator.sendBeacon('/api/delivery/view-once/consume', payload);
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [examType, examId, paperId, sessionToken]);

  const timestampStr = new Date().toLocaleString();
  const watermarkText = `ZEROLEAK CONFIDENTIAL • VIEW ONLY • ${currentUser?.email || 'OFFICIAL'} • ${currentUser?.role || 'EXAM_MANAGER'} • ${paperId.slice(0, 8).toUpperCase()} • ${timestampStr}`;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col overflow-hidden select-none"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {/* ========================================================================= */}
      {/* 1. TOP SECURITY CONTROL BAR                                               */}
      {/* ========================================================================= */}
      <header className="bg-slate-900 border-b border-slate-800 text-white px-5 py-3 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider uppercase">
                SECURE VIEW-ONCE VERIFICATION
              </span>
              <span className="text-xs font-bold text-slate-200 truncate max-w-xs md:max-w-md">
                {paperTitle}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Exam: {examId} • Paper ID: {paperId} • Viewer: {currentUser?.full_name || currentUser?.email} ({currentUser?.role})
            </p>
          </div>
        </div>

        {/* Live Timer, Policy Strip, & Finish Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Security Countdown Timer */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold ${
              secondsRemaining < 120
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse'
                : 'bg-slate-800 border-slate-700 text-amber-300'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>SESSION EXPIRES IN {formatTime(secondsRemaining)}</span>
          </div>

          {/* Policy Notice Tooltip / Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>No Download &bull; No Print &bull; Single View Only</span>
          </div>

          {/* Finish Verification Button */}
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <FileCheck className="w-4 h-4" />
            <span>Finish Verification</span>
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Close Preview (Permanently Consumes One-Time Session)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. SECURITY POLICY BANNER STRIP                                           */}
      {/* ========================================================================= */}
      <div className="bg-amber-950/80 border-b border-amber-900/60 px-5 py-2 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>One-Time Preview Policy:</strong> This paper preview can be viewed only once for verification. After closing this preview, it cannot be opened again.
          </span>
        </div>
        {securityWarnings.length > 0 && (
          <div className="flex items-center gap-1.5 text-rose-300 font-mono text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Security Interception Active: {securityWarnings[securityWarnings.length - 1]}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN PAPER DOCUMENT PREVIEW CANVAS (WITH WATERMARK & DEFOCUS SHIELD)   */}
      {/* ========================================================================= */}
      <main className="flex-1 relative overflow-y-auto p-4 sm:p-8 bg-slate-900 flex justify-center">
        {/* Full-bleed repeating security watermark layer */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 z-40 overflow-hidden flex flex-wrap gap-x-20 gap-y-24 p-8 justify-around items-around opacity-15 rotate-[-22deg]"
        >
          {Array.from({ length: 48 }).map((_, idx) => (
            <div
              key={idx}
              className="font-mono text-xs font-bold text-slate-400 tracking-wider whitespace-nowrap"
            >
              {watermarkText}
            </div>
          ))}
        </div>

        {/* Paper Document Container (Centered Sheet) */}
        <div className="relative z-10 w-full max-w-4xl bg-white text-slate-900 rounded-2xl shadow-2xl p-6 sm:p-10 border border-slate-300 min-h-full">
          {children}
        </div>

        {/* ========================================================================= */}
        {/* DEFOCUS / SCREEN CAPTURE BLUR SHIELD OVERLAY                             */}
        {/* ========================================================================= */}
        {isObscured && (
          <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="max-w-md bg-slate-900 border-2 border-rose-500/80 rounded-3xl p-7 shadow-2xl space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white">Security Protection Active</h3>
                <p className="text-xs text-rose-300 font-medium">{obscureReason}</p>
                <p className="text-[11px] text-slate-400 mt-2">
                  To protect confidential examination papers against unauthorized capture, paper contents are obscured whenever the verification window loses active focus.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsObscured(false)}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Resume Secure Verification
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 4. VERIFICATION CONFIRMATION MODAL                                        */}
      {/* ========================================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-scaleUp">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
                  Verification Confirmation
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                  &ldquo;I have verified this paper. Continue to Finalize &amp; Encrypt?&rdquo;
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Notice Regarding View-Once Preview:</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Closing this session will permanently mark the generated preview as <strong>CONSUMED</strong>.
                The raw paper preview cannot be reopened. You can either confirm to proceed with scheduling Finalize &amp; Encrypt, or cancel.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isConsuming}
                onClick={() => triggerConsume('CANCELLED')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel &amp; Close Preview
              </button>

              <button
                type="button"
                disabled={isConsuming}
                onClick={() => triggerConsume('CONFIRMED_FINALIZE')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{isConsuming ? 'Finalizing...' : 'Confirm & Finalize'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
