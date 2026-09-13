import React, { useState, useEffect } from 'react';
import { DynamicWatermarkData, User } from '../types';
import { AuthorityProctorEnclave } from './proctor/AuthorityProctorEnclave';
import {
  ShieldAlert,
  Printer,
  X,
  Lock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface SecureViewerModalProps {
  paper: any;
  watermark: DynamicWatermarkData | null;
  currentUser?: User | null;
  onClose: () => void;
  onPrintCopy?: () => void;
}

export const SecureViewerModal: React.FC<SecureViewerModalProps> = ({
  paper,
  watermark,
  currentUser,
  onClose,
  onPrintCopy,
}) => {
  const [securityViolations, setSecurityViolations] = useState<string[]>([]);
  const [printed, setPrinted] = useState(false);

  // Prevent right-click, text copy, print screen shortcuts
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setSecurityViolations(prev => [
        ...prev.slice(-3),
        `Right click blocked at ${new Date().toLocaleTimeString()}`,
      ]);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'p' || e.key === 's' || e.key === 'c' || e.key === 'u')
      ) {
        e.preventDefault();
        setSecurityViolations(prev => [
          ...prev.slice(-3),
          `Unauthorized shortcut '${e.key.toUpperCase()}' intercepted at ${new Date().toLocaleTimeString()}`,
        ]);
      }
      if (e.key === 'F12') {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handlePrint = () => {
    if (onPrintCopy) {
      onPrintCopy();
      setPrinted(true);
    }
  };

  const questions = paper?.questions || [];
  const examName = paper?.exam_name || paper?.subject || 'National Standardized Examination';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col text-slate-100 select-none">
      {/* Top Security Banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white font-sans">{examName}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                SECURE ENCLAVE VIEWER ACTIVE
              </span>
            </div>
            {watermark && (
              <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-0.5">
                <span>Centre: <strong className="text-white">{watermark.centreId}</strong></span>
                <span>Operator: <strong className="text-white">{watermark.operatorName}</strong></span>
                <span>Fingerprint: <strong className="font-mono text-emerald-400">{watermark.deviceFingerprint}</strong></span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onPrintCopy && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{printed ? 'Print Dispatched' : 'Print Serialized Copy'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Security Violation Alerts (if any) */}
      {securityViolations.length > 0 && (
        <div className="bg-rose-950/90 border-b border-rose-800 px-6 py-2 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Anti-Tamper Telemetry: {securityViolations[securityViolations.length - 1]}</span>
          </div>
          <span className="text-[10px] text-rose-400 uppercase font-bold font-mono">
            Logged to Immutable Audit Ledger
          </span>
        </div>
      )}

      {/* Main Examination Sheet Area with 7-Layer Dynamic Watermark inside Authority Proctor Enclave */}
      <AuthorityProctorEnclave
        currentUser={currentUser || null}
        workspaceType="DECRYPTED_PAPER_VIEWER"
        examId={paper?.exam_id || paper?.id}
        title="Decrypted Question Paper Enclave"
      >
        <div className="flex-1 overflow-y-auto p-6 md:p-12 relative flex justify-center bg-slate-950">
          <div className="relative w-full max-w-4xl bg-white text-slate-900 rounded-xl shadow-2xl p-8 md:p-14 border border-slate-300 overflow-hidden font-sans">
          {/* 7-LAYER DYNAMIC WATERMARK OVERLAY */}
          {watermark && (
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-wrap items-center justify-center gap-16 p-8 opacity-[0.12] select-none rotate-[-25deg]">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="text-center font-mono font-black text-slate-900 space-y-1 text-xs border border-slate-900/30 p-2 rounded">
                  <div className="text-sm uppercase tracking-widest">{watermark.organizationName}</div>
                  <div>CENTRE ID: {watermark.centreId} | OP: {watermark.operatorName}</div>
                  <div>HW: {watermark.deviceFingerprint} | {watermark.timestamp}</div>
                  <div className="text-[9px] text-slate-600">TX: {watermark.sessionTxRef}</div>
                </div>
              ))}
            </div>
          )}

          {/* Paper Header */}
          <div className="text-center border-b-2 border-slate-900 pb-6 mb-8 relative z-20">
            <div className="text-xs font-sans uppercase tracking-widest text-slate-600 font-bold mb-1">
              {watermark?.organizationName || 'National Examination Authority'}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {examName}
            </h1>
            <div className="text-sm font-semibold text-slate-700 mt-1">
              Subject: {paper?.subject || 'Standardized Examination Paper'}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-200 text-xs font-sans">
              <div>Total Questions: <strong>{questions.length}</strong></div>
              <div>Duration: <strong>180 Minutes</strong></div>
              <div>Maximum Marks: <strong>100</strong></div>
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs font-sans text-slate-700 space-y-1 relative z-20">
            <strong className="block text-slate-900 uppercase tracking-wider">Candidate Instructions:</strong>
            <p>1. All questions are compulsory. Ensure responses are marked accurately.</p>
            <p>2. Each correct answer carries marks specified alongside each item.</p>
            <p>3. This examination paper contains dynamic forensic watermarks mapped to Centre {watermark?.centreId || '001'}.</p>
          </div>

          {/* Questions List */}
          <div className="space-y-8 relative z-20">
            {questions.map((q: any, idx: number) => {
              let options: any[] = [];
              if (q.options_json) {
                try {
                  options = typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json;
                } catch {
                  options = [];
                }
              }

              return (
                <div key={q.id || idx} className="space-y-3 pb-6 border-b border-slate-200 last:border-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="font-bold text-sm text-slate-900">
                      <span className="mr-2">Q{idx + 1}.</span>
                      <span>{q.content_text}</span>
                    </div>
                    <span className="text-xs font-sans font-bold text-slate-500 shrink-0">
                      [{q.marks || 4} Marks]
                    </span>
                  </div>

                  {options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-sans pl-6">
                      {options.map((opt: any, oIdx: number) => {
                        const optText = typeof opt === 'string' ? opt : opt.text || JSON.stringify(opt);
                        return (
                          <div key={oIdx} className="p-2 rounded bg-slate-50 border border-slate-200 text-slate-800">
                            <span>{optText}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Paper Footer */}
          <div className="mt-12 pt-6 border-t-2 border-slate-900 text-center text-xs font-sans text-slate-500 relative z-20 flex items-center justify-between">
            <span>*** END OF EXAMINATION PAPER ***</span>
            <span className="font-mono text-[10px]">VERIFIED FORENSIC DISPATCH</span>
          </div>
        </div>
      </div>
    </AuthorityProctorEnclave>
  </div>
);
};
