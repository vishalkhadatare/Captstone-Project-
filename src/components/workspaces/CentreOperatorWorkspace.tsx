import React, { useState, useEffect } from 'react';
import {
  FolderLock,
  Lock,
  Printer,
  Laptop,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { User, Examination, PrintCopy, DynamicWatermarkData } from '../../types';
import { api, getDeviceFingerprint } from '../../api';
import { NavSubTab } from '../Sidebar';
import { SecureViewerModal } from '../SecureViewerModal';

interface CentreOperatorWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
}

export const CentreOperatorWorkspace: React.FC<CentreOperatorWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
}) => {
  const [releasedExams, setReleasedExams] = useState<Examination[]>([]);
  const [printHistory, setPrintHistory] = useState<PrintCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Secure Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPaper, setViewerPaper] = useState<any | null>(null);
  const [viewerWatermark, setViewerWatermark] = useState<DynamicWatermarkData | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedPaperVersionId, setSelectedPaperVersionId] = useState<string>('');

  // Print state
  const [printCount, setPrintCount] = useState(10);
  const [printing, setPrinting] = useState(false);

  const deviceFp = getDeviceFingerprint();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [relRes, histRes] = await Promise.all([
        api.getReleasedExams().catch(() => ({ examinations: [] })),
        api.getPrintHistory().catch(() => ({ printHistory: [] })),
      ]);

      setReleasedExams(relRes.examinations || []);
      setPrintHistory(histRes.printHistory || []);
    } catch (err: any) {
      console.error('Operator load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSecureViewer = async (exam: Examination) => {
    setStatusMessage(null);
    try {
      const res = await api.openSecureViewer(exam.id);
      setViewerPaper(res.paperContent);
      setViewerWatermark(res.watermark);
      setSelectedExamId(exam.id);
      setSelectedPaperVersionId(res.paperVersionId);
      setViewerOpen(true);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handlePrintAuthorizedCopies = async (examId: string, paperVersionId: string) => {
    setPrinting(true);
    setStatusMessage(null);
    try {
      const res = await api.printAuthorizedCopy(examId, paperVersionId || 'V001', printCount);
      setStatusMessage({
        type: 'success',
        text: `${res.message} Generated ${res.copies.length} unique serialized copies (${res.copies[0]?.copyId} to ${res.copies[res.copies.length - 1]?.copyId}).`,
      });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* DASHBOARD */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="border-b pb-3 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Examination Delivery Terminal
                </span>
                <h2 className="text-xl font-bold text-slate-900">Centre Operator Enclave</h2>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-full">
                CENTRE TERMINAL ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Released Examinations</span>
                <span className="text-2xl font-bold text-slate-900">{releasedExams.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Printed Copies Total</span>
                <span className="text-2xl font-bold text-slate-900">{printHistory.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Hardware Status</span>
                <span className="text-2xl font-bold text-emerald-700">TRUSTED</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Scheduled Examination Papers</h3>
            {releasedExams.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No examinations assigned to this centre.</p>
            ) : (
              <div className="space-y-2">
                {releasedExams.map(ex => (
                  <div
                    key={ex.id}
                    className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{ex.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Schedule Date: {ex.exam_date} {ex.exam_time} • Unlock Minute: {ex.unlock_time}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenSecureViewer(ex)}
                      className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open Secure Paper Viewer</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RELEASED EXAMINATIONS / SECURE VIEWER */}
      {(activeSubTab === 'released_examinations' || activeSubTab === 'secure_viewer') && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Time-Locked Secure Examination Releases
          </h3>
          <p className="text-xs text-slate-500">
            Plaintext paper decryption is cryptographically time-locked. The server evaluates official clock timestamps and releases paper content only when the unlock minute arrives.
          </p>

          <div className="space-y-3">
            {releasedExams.map(ex => (
              <div
                key={ex.id}
                className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">{ex.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Unlock Minute: <span className="font-bold text-emerald-900">{ex.unlock_time}</span> • Status: {ex.status}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenSecureViewer(ex)}
                    className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Launch Secure Enclave Viewer</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRINT MANAGEMENT */}
      {activeSubTab === 'print_management' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b pb-2">
              Controlled & Traceable Examination Printing
            </h3>
            <p className="text-xs text-slate-500">
              Each printed physical copy receives an indelible dynamic watermark header, unique serialized COPY ID, operator fingerprint, and blockchain hash.
            </p>

            <div className="space-y-3 text-xs">
              <label className="block text-slate-700 font-bold">
                Select Examination for Quota-Authorized Batch Printing
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedExamId}
                  onChange={e => setSelectedExamId(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                >
                  <option value="">-- Choose Examination --</option>
                  {releasedExams.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600">Copies:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={printCount}
                    onChange={e => setPrintCount(Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                  />
                </div>

                <button
                  onClick={() => handlePrintAuthorizedCopies(selectedExamId, 'V001')}
                  disabled={printing || !selectedExamId}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>{printing ? 'Printing...' : 'Print Serialized Batch'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Print Copies Audit Table */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Serialized Print Copy Logs</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {printHistory.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">No copies printed yet.</p>
              ) : (
                printHistory.map(p => (
                  <div key={p.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900">{p.copy_id}</span>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Tx Hash: {p.tx_hash?.substring(0, 16)}... • {new Date(p.printed_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      PRINTED & LOGGED
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DEVICE STATUS */}
      {activeSubTab === 'device_status' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4 text-xs">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Workstation Hardware Terminal Status
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 rounded border">
              <span className="text-slate-500 block">Hardware Fingerprint:</span>
              <span className="font-mono font-bold text-slate-900">{deviceFp}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded border">
              <span className="text-slate-500 block">Hardware Integrity:</span>
              <span className="font-bold text-emerald-700">FIPS 140-2 ENCLAVE BOUND</span>
            </div>
          </div>
        </div>
      )}

      {/* Secure Viewer Modal */}
      {viewerOpen && viewerPaper && (
        <SecureViewerModal
          paper={viewerPaper}
          watermark={viewerWatermark}
          currentUser={currentUser}
          onClose={() => setViewerOpen(false)}
          onPrintCopy={() => handlePrintAuthorizedCopies(selectedExamId, selectedPaperVersionId)}
        />
      )}
    </div>
  );
};
