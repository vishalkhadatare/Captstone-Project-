import React, { useState, useEffect } from 'react';
import {
  FolderLock,
  Lock,
  Laptop,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { User, Examination, PrintCopy, DynamicWatermarkData, TrustedDevice } from '../../types';
import { api, getDeviceFingerprint, getOrCreateBrowserDeviceIdentity } from '../../api';
import { NavSubTab } from '../Sidebar';
import { SecureViewerModal } from '../SecureViewerModal';
import { PrintRelayPanel } from '../PrintRelayPanel';
import { PrintSecurityGate } from '../PrintSecurityGate';

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
  // This account's own workstations, as the trust ledger sees them. The Device
  // Status screen reads the live record instead of asserting a fixed banner, so
  // a revoked or pending terminal shows as such instead of as "TRUSTED".
  const [terminals, setTerminals] = useState<TrustedDevice[]>([]);
  // The local `HW-...` label is a convenience string; the ledger identifies a
  // terminal by the UUID of its key pair, so that is what we match on.
  const [terminalUuid, setTerminalUuid] = useState<string>('');
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

  // Print security gate state. Nothing is minted until the operator re-enters
  // their own password and reads back the one-time code the server mints.
  const [gateOpen, setGateOpen] = useState(false);
  const [gateExamId, setGateExamId] = useState('');
  const [gateExamName, setGateExamName] = useState('');

  const deviceFp = getDeviceFingerprint();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [relRes, histRes, devRes] = await Promise.all([
        api.getReleasedExams().catch(() => ({ examinations: [] })),
        api.getPrintHistory().catch(() => ({ printHistory: [] })),
        api.getDevices().catch(() => ({ devices: [] })),
      ]);

      setReleasedExams(relRes.examinations || []);
      setPrintHistory(histRes.printHistory || []);
      setTerminals(devRes.devices || []);
      const identity = await getOrCreateBrowserDeviceIdentity().catch(() => null);
      setTerminalUuid(identity?.deviceUuid || '');
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

  /**
   * Printing no longer happens straight from this click. The click opens the
   * print security gate; the server only mints copies once the operator has
   * re-authenticated and echoed back the one-time authorisation code.
   */
  const openPrintGate = (examId: string, examName: string) => {
    if (!examId) {
      setStatusMessage({ type: 'error', text: 'Select an examination before printing.' });
      return;
    }
    setGateExamId(examId);
    setGateExamName(examName || 'Selected examination');
    setGateOpen(true);
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
                  onClick={() =>
                    openPrintGate(
                      selectedExamId,
                      releasedExams.find(exam => exam.id === selectedExamId)?.name || ''
                    )
                  }
                  disabled={printing || !selectedExamId}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4" />
                  <span>Authorize &amp; Print Batch</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" />
              <span>
                Printing is gated: the release is armed with your account password and a single-use code, and it can
                be spent exactly once. To print from another desk, a phone or a tablet on this Wi-Fi, open a relay
                below instead of moving the paper by hand.
              </span>
            </div>
          </div>

          {/* WI-FI SECURE PRINT RELAY */}
          <PrintRelayPanel exams={releasedExams} onActivity={loadData} />

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
      {activeSubTab === 'device_status' && (() => {
        const thisTerminal = terminals.find(t => terminalUuid && t.device_uuid === terminalUuid);
        const statusLabel = (status: string) =>
          status === 'APPROVED' || status === 'TRUSTED'
            ? 'ACCESS GRANTED'
            : status;
        const statusClass = (status: string) =>
          status === 'APPROVED' || status === 'TRUSTED'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : status === 'PENDING' || status === 'PENDING_APPROVAL'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-rose-50 text-rose-800 border-rose-200';

        return (
          <div className="space-y-6 text-xs">
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b pb-2">
                Workstation Hardware Terminal Status
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="text-slate-500 block">Hardware Fingerprint</span>
                  <span className="font-mono font-bold text-slate-900 break-all">{deviceFp}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="text-slate-500 block">Trust Ledger Status</span>
                  {thisTerminal ? (
                    <span className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusClass(thisTerminal.status)}`}>
                      {statusLabel(thisTerminal.status)}
                    </span>
                  ) : (
                    <span className="font-bold text-slate-500">NOT ON RECORD</span>
                  )}
                </div>
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="text-slate-500 block">Hardware Integrity</span>
                  <span className="font-bold text-emerald-700">FIPS 140-2 ENCLAVE BOUND</span>
                </div>
              </div>

              {thisTerminal && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1 text-[11px] text-slate-600">
                  <div>Terminal: <span className="font-semibold text-slate-900">{thisTerminal.device_name}</span></div>
                  <div>Operating system: <span className="font-semibold text-slate-900">{thisTerminal.operating_system || '—'} {thisTerminal.os_version || ''}</span></div>
                  <div>Key schedule: <span className="font-mono font-semibold text-slate-900">{thisTerminal.encryption_algorithm || 'ECDSA-P256'}</span></div>
                  <div>Registered: <span className="font-semibold text-slate-900">{thisTerminal.registered_at ? new Date(thisTerminal.registered_at).toLocaleString() : '—'}</span></div>
                  <div>Last seen: <span className="font-semibold text-slate-900">{thisTerminal.last_seen_at ? new Date(thisTerminal.last_seen_at).toLocaleString() : '—'}</span></div>
                  <div>Attestation: <span className="font-semibold text-slate-900">{thisTerminal.attestation_status || 'UNAVAILABLE'}</span></div>
                </div>
              )}
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
                Terminals Bound to This Centre Account
              </h3>
              {terminals.length === 0 ? (
                <p className="text-slate-400 p-4 text-center">No workstations are bound to this account yet.</p>
              ) : (
                <div className="space-y-2">
                  {terminals.map(t => (
                    <div key={t.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">
                          {t.device_name}
                          {!!terminalUuid && t.device_uuid === terminalUuid && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              THIS WORKSTATION
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          FP: {t.device_fingerprint} • IP: {t.ip_address}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Last seen {t.last_seen_at ? new Date(t.last_seen_at).toLocaleString() : 'never'}
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border self-start sm:self-center shrink-0 ${statusClass(t.status)}`}>
                        {statusLabel(t.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Secure Viewer Modal */}
      {viewerOpen && viewerPaper && (
        <SecureViewerModal
          paper={viewerPaper}
          watermark={viewerWatermark}
          currentUser={currentUser}
          onClose={() => setViewerOpen(false)}
          onPrintCopy={() =>
            openPrintGate(selectedExamId, viewerPaper?.exam_name || viewerPaper?.subject || '')
          }
        />
      )}

      {/* Print Security Gate */}
      {gateOpen && (
        <PrintSecurityGate
          examId={gateExamId}
          examName={gateExamName}
          copies={printCount}
          onClose={() => setGateOpen(false)}
          onReleased={message => {
            setStatusMessage({ type: 'success', text: message });
            loadData();
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
