import React, { useState, useEffect } from 'react';
import { api, getDeviceFingerprint } from '../api';
import { Examination, PrintCopy, User, DynamicWatermarkData } from '../types';
import { SecureViewerModal } from './SecureViewerModal';
import {
  Printer,
  ShieldCheck,
  Lock,
  Unlock,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  Hash,
  Building2,
  Laptop,
} from 'lucide-react';

interface SecureDeliveryProps {
  currentUser: User | null;
  onRefresh: () => void;
}

export const SecureDeliveryModule: React.FC<SecureDeliveryProps> = ({ currentUser, onRefresh }) => {
  const [releasedExams, setReleasedExams] = useState<Examination[]>([]);
  const [printHistory, setPrintHistory] = useState<PrintCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Viewer State
  const [activeViewerData, setActiveViewerData] = useState<{
    examId: string;
    examName: string;
    paperContent: any;
    watermark: DynamicWatermarkData;
    paperVersionId: string;
  } | null>(null);

  const deviceFp = getDeviceFingerprint();

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [examsRes, printsRes] = await Promise.all([
        api.getReleasedExams(),
        api.getPrintHistory(),
      ]);

      setReleasedExams(examsRes.examinations || []);
      setPrintHistory(printsRes.printHistory || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenViewer = async (exam: Examination) => {
    try {
      const res = await api.openSecureViewer(exam.id);
      setActiveViewerData({
        examId: exam.id,
        examName: exam.name,
        paperContent: res.paperContent,
        watermark: res.watermark,
        paperVersionId: res.paperVersionId,
      });
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-serif">
            4. Secure Examination Delivery & Controlled Printing
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enforce server-side time-locks, anti-tamper Secure Viewer, multi-layer dynamic watermarking, and unique serial print authorization.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs font-bold px-1.5 hover:opacity-75">✕</button>
        </div>
      )}

      {/* SECTION 34: TIME-LOCK EXAMINATIONS QUEUE */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              Examination Centre Delivery Queue (Time-Lock Enforced)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Requirement #34: Time-lock decryption permits access only when the cryptographic unlock release schedule is reached.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Laptop className="w-3.5 h-3.5 text-emerald-400" />
            <span>Centre: {currentUser?.centre_id || 'CENTRE-101'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {releasedExams.length === 0 ? (
            <div className="col-span-2 py-8 text-center text-slate-400 text-xs">
              <p>No examinations are currently available for this delivery node.</p>
            </div>
          ) : (
            releasedExams.map(exam => {
              const isUnlocked = exam.isTimeUnlocked;

              return (
                <div
                  key={exam.id}
                  className={`p-4 rounded-xl border space-y-3 ${
                    isUnlocked
                      ? 'bg-emerald-950/20 border-emerald-800/80 shadow-md'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 uppercase">
                      {exam.category}
                    </span>
                    {isUnlocked ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                        <Unlock className="w-3 h-3 text-emerald-400" />
                        TIME-LOCK UNLOCKED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-400" />
                        LOCKED UNTIL RELEASE TIME
                      </span>
                    )}
                  </div>

                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1">
                    {exam.name}
                  </h3>

                  <div className="text-xs text-indigo-400 font-medium">
                    {exam.subject} ({exam.exam_type}) • {exam.total_questions} Questions • {exam.total_marks} Marks
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Server Time Lock Release:</span>
                      <span className="font-mono text-white font-medium">
                        {new Date(exam.unlock_time).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Centre Quota Remaining:</span>
                      <span className="text-emerald-400 font-bold">10 Copies Max</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-500">
                      Ver: {exam.version_code || 'EXAM-2026-CS-V001'}
                    </span>

                    <button
                      onClick={() => handleOpenViewer(exam)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                        isUnlocked
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isUnlocked ? 'Open Secure Viewer' : 'Verify Time Lock & Open'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* SECTION 38 & 39: CONTROLLED PRINTING HISTORY LOG */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Printer className="w-4 h-4 text-indigo-500" />
              Section 38 & 39: Controlled Printing Serial Registry
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Immutable ledger of every physical copy authorized, including sequential serial IDs (e.g. COPY-000001) and cryptographic transaction hashes.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">{printHistory.length} Prints Recorded</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Sequential Copy ID</th>
                <th className="py-2.5 px-3">Examination</th>
                <th className="py-2.5 px-3">Centre & Operator</th>
                <th className="py-2.5 px-3">Cryptographic TX Hash</th>
                <th className="py-2.5 px-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {printHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">No print copy transactions logged yet.</td>
                </tr>
              ) : (
                printHistory.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                        {p.copy_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                      {p.exam_name || 'Standard Technical Examination'}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-200">{p.centre_id}</div>
                      <div className="text-[10px] text-slate-400">{p.operator_name || 'Authorized Operator'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 text-[10px] truncate max-w-xs">
                      {p.tx_hash}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[10px]">
                      {new Date(p.printed_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full-Screen Secure Viewer Modal */}
      {activeViewerData && (
        <SecureViewerModal
          examId={activeViewerData.examId}
          examName={activeViewerData.examName}
          paperContent={activeViewerData.paperContent}
          watermark={activeViewerData.watermark}
          paperVersionId={activeViewerData.paperVersionId}
          onClose={() => setActiveViewerData(null)}
          onPrintSuccess={() => {
            loadData();
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
