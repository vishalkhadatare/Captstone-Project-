import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCcw,
  AlertTriangle,
  ShieldAlert,
  Lock,
  CheckCircle2,
  FileKey,
  Flame,
  Info,
} from 'lucide-react';
import { Examination, EmergencyRegenerateResponse } from '../../types';
import { api } from '../../api';

interface EmergencyRegenModalProps {
  exam: Examination;
  currentVersionCode?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: EmergencyRegenerateResponse) => void;
}

export const EmergencyRegenModal: React.FC<EmergencyRegenModalProps> = ({
  exam,
  currentVersionCode,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [quarantineQuestions, setQuarantineQuestions] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Background page scroll locking & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const isReasonValid = reason.trim().length >= 5;
  const canSubmit = isReasonValid && confirmed && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.emergencyRegenerate(exam.id, {
        reason: reason.trim(),
        quarantine_suspect_questions: quarantineQuestions,
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Emergency regeneration failed.');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-regen-title"
      className="fixed inset-x-0 bottom-0 z-50 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-start p-4 sm:p-6 overflow-hidden"
      style={{ top: 'var(--header-height, 4rem)' }}
      onClick={e => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-rose-200/80 w-full max-w-xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        style={{ maxHeight: 'calc(100dvh - var(--header-height, 4rem) - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header - Pinned at top of modal */}
        <div className="shrink-0 px-6 py-4 bg-linear-to-r from-rose-950 via-rose-900 to-slate-900 text-white flex items-center justify-between border-b border-rose-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 id="emergency-regen-title" className="font-bold text-base leading-tight">Emergency Paper Regeneration</h3>
              <p className="text-xs text-rose-200/80">
                Invalidate compromised version and compile new encrypted paper
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-rose-300/70 hover:text-white p-1 rounded-lg hover:bg-rose-800/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form wrapping scrollable content and pinned footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Security Warning Banner */}
            <div className="p-4 rounded-xl bg-rose-50/90 border border-rose-200 text-rose-950 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-rose-900">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>High-Priority Security Action Notice</span>
              </div>
              <p className="text-xs leading-relaxed text-rose-800">
                This action will <strong className="text-rose-900 font-semibold">permanently invalidate</strong> the current paper version, quarantine suspect questions from the question pool, and deterministically generate a new AES-256 encrypted paper set with 3-of-5 Shamir Secret Sharing. This action is irreversible and recorded in immutable audit ledgers.
              </p>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <div className="flex-1">{errorMessage}</div>
              </div>
            )}

            {/* Examination Context */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block">Examination</span>
                <span className="font-bold text-slate-900">{exam.name}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Subject / Category</span>
                <span className="font-bold text-slate-900">{exam.subject} ({exam.category})</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Current Status</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
                  {exam.status}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Active Version Code</span>
                <span className="font-mono font-bold text-slate-700">
                  {currentVersionCode || exam.version_code || 'V1 (Active)'}
                </span>
              </div>
            </div>

            {/* Reason Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  Reason for Emergency Regeneration <span className="text-rose-500">*</span>
                </label>
                <span className={`text-[11px] font-mono ${
                  reason.trim().length >= 5 ? 'text-emerald-600' : 'text-slate-400'
                }`}>
                  {reason.trim().length}/5 min chars
                </span>
              </div>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Detail the leak suspicion, compromised set, breach vector, or official directive necessitating emergency re-generation..."
                required
                disabled={loading}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-600 focus:ring-1 focus:ring-rose-600 text-xs text-slate-900 transition-colors"
              />
            </div>

            {/* Quarantine Questions Checkbox */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <input
                type="checkbox"
                id="quarantineToggle"
                checked={quarantineQuestions}
                onChange={e => setQuarantineQuestions(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <label htmlFor="quarantineToggle" className="text-xs cursor-pointer">
                <span className="font-bold text-slate-800 block">
                  Quarantine suspect/compromised questions from pool
                </span>
                <span className="text-[11px] text-slate-500 leading-normal block">
                  Questions from the invalidated version will be moved to QUARANTINED status and strictly excluded from the new replacement paper compilation.
                </span>
              </label>
            </div>

            {/* Final Authorization Checkbox */}
            <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 flex items-start gap-3">
              <input
                type="checkbox"
                id="confirmAuthorization"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <label htmlFor="confirmAuthorization" className="text-xs text-rose-950 font-medium cursor-pointer">
                I confirm that I am authorized to trigger this emergency regeneration and acknowledge that the previous version will be permanently superseded and cannot be restored.
              </label>
            </div>
          </div>

          {/* Modal Actions - Pinned at bottom of modal */}
          <div className="shrink-0 px-6 py-3.5 flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/80">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Regenerating & Encrypting...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Proceed with Emergency Regeneration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
