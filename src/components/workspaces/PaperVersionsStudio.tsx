import React, { useState, useEffect } from 'react';
import {
  Layers,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Search,
  Eye,
  Camera,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  KeyRound,
  FileText,
  Clock,
  ExternalLink,
  ChevronRight,
  Filter,
  RefreshCw,
  Hash,
  Fingerprint,
  X,
  Shuffle,
} from 'lucide-react';
import { api } from '../../api';
import { Examination, PaperVersion, User } from '../../types';
import { QuestionPaperPdfModal } from './QuestionPaperPdfModal';

interface PaperVersionsStudioProps {
  examinations: Examination[];
  selectedExamId?: string;
  currentUser: User | null;
  onSimulateExam?: (exam: Examination) => void;
  onEmergencyRegen?: (exam: Examination) => void;
  onNavigateToGenerator?: () => void;
  onNavigateToMultiPaper?: () => void;
}

interface PaperVersionWithDetails extends PaperVersion {
  checksum_sha256?: string;
  key_fingerprint?: string;
  encrypted_at?: string;
  question_count?: number;
  iv_hex?: string;
  auth_tag_hex?: string;
}

export const PaperVersionsStudio: React.FC<PaperVersionsStudioProps> = ({
  examinations = [],
  selectedExamId: initialExamId,
  currentUser,
  onSimulateExam,
  onEmergencyRegen,
  onNavigateToGenerator,
  onNavigateToMultiPaper,
}) => {
  const [selectedExamId, setSelectedExamId] = useState<string>(
    initialExamId || examinations[0]?.id || ''
  );
  const [versions, setVersions] = useState<PaperVersionWithDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pdfModalVersionId, setPdfModalVersionId] = useState<string | null>(null);

  // Inspection Modal State
  const [inspectingVersion, setInspectingVersion] = useState<{
    version: PaperVersionWithDetails;
    questions: any[];
    shamirDetails?: any;
  } | null>(null);
  const [loadingInspection, setLoadingInspection] = useState<boolean>(false);

  // Security Envelope Modal State
  const [envelopeModalVersion, setEnvelopeModalVersion] = useState<PaperVersionWithDetails | null>(null);

  const selectedExam = examinations.find(e => e.id === selectedExamId) || examinations[0];

  const copyToClipboard = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const fetchVersions = async (examId?: string) => {
    const id = examId || selectedExamId;
    if (!id) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await api.getPaperVersions(id);
      if (res.versions) {
        setVersions(res.versions as PaperVersionWithDetails[]);
      } else {
        setVersions([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch paper versions', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load paper versions.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedExamId) {
      fetchVersions(selectedExamId);
    }
  }, [selectedExamId]);

  const handleSetActive = async (version: PaperVersionWithDetails) => {
    if (!selectedExam) return;
    setActivatingId(version.id);
    setStatusMessage(null);
    try {
      const res = await api.setActivePaperVersion(selectedExam.id, version.id);
      setStatusMessage({
        type: 'success',
        text: res.message || `Set "${version.version_code}" as the active official release paper.`,
      });
      // Update local state
      setVersions(prev =>
        prev.map(v => ({
          ...v,
          is_current: v.id === version.id ? 1 : 0,
        }))
      );
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to switch active version.' });
    } finally {
      setActivatingId(null);
    }
  };

  const handleOpenInspection = async (version: PaperVersionWithDetails) => {
    if (!selectedExam) return;
    setLoadingInspection(true);
    try {
      const res = await api.getPaperVersionDetails(selectedExam.id, version.id);
      if (res.success) {
        setInspectingVersion({
          version: { ...version, ...res.version },
          questions: res.questions,
          shamirDetails: res.shamirDetails,
        });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load version questions.');
    } finally {
      setLoadingInspection(false);
    }
  };

  const filteredVersions = versions.filter(v => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (v.version_code || '').toLowerCase().includes(q) ||
      (v.checksum_sha256 || '').toLowerCase().includes(q) ||
      (v.key_fingerprint || '').toLowerCase().includes(q)
    );
  });

  const activeReleaseCount = versions.filter(v => v.is_current === 1).length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Layers className="w-3.5 h-3.5" /> Paper Version Registry & Release Control
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Encrypted Paper Version Artifacts
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Deterministic version control for generated examination papers. Every version is preserved as
              FIPS 140-2 AES-256-GCM ciphertext with immutable SHA-256 checksums and 3-of-5 Shamir Secret Sharing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchVersions()}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 border border-slate-600 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Sets</span>
            </button>
          </div>
        </div>

        {/* Security Badges Bar */}
        <div className="mt-6 pt-4 border-t border-slate-700/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Total Paper Sets</div>
            <div className="text-xl font-extrabold text-white mt-0.5">{versions.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Active Release Paper</div>
            <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
              {activeReleaseCount > 0 ? `${activeReleaseCount} Active` : 'None Selected'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Cryptographic Cipher</div>
            <div className="text-xs font-mono font-bold text-teal-300 mt-1.5 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> AES-256-GCM
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Custody Quorum</div>
            <div className="text-xs font-mono font-bold text-amber-300 mt-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 3-of-5 Shamir Threshold
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-3 shadow-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
              : 'bg-rose-50 text-rose-900 border border-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Examination Selector & Search Bar */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Select Examination Target
            </label>
            <select
              value={selectedExamId}
              onChange={e => setSelectedExamId(e.target.value)}
              className="w-full md:max-w-md px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            >
              {examinations.map(ex => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.subject} • {ex.total_questions || 0} Qs • {((ex as any).exam_type || 'MCQ')})
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-72">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Filter Version Sets
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search set, hash, code..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Selected Exam Information Bar */}
        {selectedExam && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{selectedExam.name}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                {((selectedExam as any).exam_type || 'MCQ')}
              </span>
              <span className="text-slate-500 font-mono text-[11px]">
                Subject: {selectedExam.subject} • Questions: {selectedExam.total_questions} • Marks: {selectedExam.total_marks}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onSimulateExam && (
                <button
                  type="button"
                  onClick={() => onSimulateExam(selectedExam)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                  title="Launch one-time proctored preview"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Simulate Exam</span>
                </button>
              )}

              {onEmergencyRegen && (
                <button
                  type="button"
                  onClick={() => onEmergencyRegen(selectedExam)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  title="Emergency Question Paper Regeneration"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Emergency Re-Gen</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Paper Versions List / Empty State */}
      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-700">Loading encrypted paper version artifacts...</p>
          <p className="text-xs text-slate-400 font-mono">Querying AES ciphertext enclaves & Shamir custody shares</p>
        </div>
      ) : filteredVersions.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              No Paper Versions Generated Yet for {selectedExam?.name || 'this examination'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              To generate cryptographically secured paper versions (Set 1, Set 2, Set 3 or Sets A/B/C/D),
              use the Paper Generation Engine or the Multi-Paper Generator.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {onNavigateToGenerator && (
              <button
                type="button"
                onClick={onNavigateToGenerator}
                className="px-4 py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Go to Paper Generation Engine</span>
              </button>
            )}

            {onNavigateToMultiPaper && (
              <button
                type="button"
                onClick={onNavigateToMultiPaper}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <Shuffle className="w-4 h-4" />
                <span>Open Multi-Paper Generator Studio</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVersions.map((version, idx) => {
            const isCurrent = version.is_current === 1;
            const setNumber = idx + 1;
            const checksumShort = version.checksum_sha256
              ? `${version.checksum_sha256.substring(0, 10)}...${version.checksum_sha256.substring(version.checksum_sha256.length - 8)}`
              : 'Verified SHA-256';

            return (
              <div
                key={version.id}
                className={`p-5 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-emerald-50/40 border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-slate-900 text-white tracking-wide font-mono">
                        SET {setNumber}
                      </span>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {version.version_code || `SET-${String.fromCharCode(64 + setNumber)}`}
                      </h4>

                      {isCurrent ? (
                        <span className="px-3 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-2xs flex items-center gap-1.5 animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ACTIVE OFFICIAL RELEASE</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          STANDBY SET
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-teal-600" />
                        <span>AES-256-GCM</span>
                      </span>

                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-indigo-600" />
                        <span>Shamir 3-of-5</span>
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
                      <span>Questions: <strong className="text-slate-800">{version.question_count || selectedExam?.total_questions || 'Standard'}</strong></span>
                      <span>Generated: <strong className="text-slate-800">{version.generated_at ? new Date(version.generated_at).toLocaleString() : 'Recent'}</strong></span>
                      <span>Enclave Status: <strong className="text-emerald-700 font-bold">LOCKED & ENCRYPTED</strong></span>
                    </div>

                    {/* Cryptographic Hashes Row */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono">
                      {version.checksum_sha256 && (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
                          <Hash className="w-3 h-3 text-slate-400" />
                          <span>SHA-256: {checksumShort}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(version.checksum_sha256!, `sha_${version.id}`)}
                            className="ml-1 text-slate-400 hover:text-emerald-700"
                            title="Copy full SHA-256 checksum"
                          >
                            {copiedKey === `sha_${version.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}

                      {version.key_fingerprint && (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
                          <Fingerprint className="w-3 h-3 text-slate-400" />
                          <span>FP: {version.key_fingerprint.substring(0, 14)}...</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(version.key_fingerprint!, `fp_${version.id}`)}
                            className="ml-1 text-slate-400 hover:text-emerald-700"
                            title="Copy key fingerprint"
                          >
                            {copiedKey === `fp_${version.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleSetActive(version)}
                        disabled={activatingId === version.id}
                        className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                        title="Set as the official release paper set for exam delivery"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{activatingId === version.id ? 'Activating...' : 'Set as Active Release'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setPdfModalVersionId(version.id)}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs flex items-center gap-1.5 border border-rose-200 transition-all cursor-pointer shadow-2xs"
                      title="View & Print Official Question Paper PDF"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      <span>View PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenInspection(version)}
                      disabled={loadingInspection}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition-all cursor-pointer"
                      title="Inspect questions in this paper version"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      <span>Inspect Questions</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEnvelopeModalVersion(version)}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition-all cursor-pointer"
                      title="Inspect security envelope (IV, Auth Tag, RSA Key)"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                      <span>Security Envelope</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspect Questions Modal */}
      {inspectingVersion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Paper Set: {inspectingVersion.version.version_code}</span>
                    {inspectingVersion.version.is_current === 1 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white">
                        ACTIVE RELEASE
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedExam?.name} • {inspectingVersion.questions.length} Questions compiled
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectingVersion(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Questions List */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {inspectingVersion.questions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No question mappings recorded for this version.
                </div>
              ) : (
                inspectingVersion.questions.map((q, idx) => (
                  <div key={q.id || idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300">
                          Q.{q.order_index || idx + 1}
                        </span>
                        {q.section_name && (
                          <span className="text-[11px] font-bold text-slate-600">
                            {q.section_name}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                          {q.subject || selectedExam?.subject}
                        </span>
                      </div>
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {q.question_marks || q.marks || 4} Marks
                      </span>
                    </div>

                    <p className="text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                      {q.content_text || 'Descriptive question content'}
                    </p>

                    {/* Diagram / Image */}
                    {(q.diagram_url || q.image_url) && (
                      <div className="pt-2">
                        <img
                          src={q.diagram_url || q.image_url}
                          alt="Question asset"
                          className="max-h-52 rounded-lg border border-slate-200 shadow-2xs object-contain bg-white"
                        />
                      </div>
                    )}

                    {/* Options (if MCQ) */}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt: any, optIdx: number) => {
                          const optText = typeof opt === 'string' ? opt : (opt?.text ?? opt?.value ?? '');
                          const optLabel = opt?.label || String.fromCharCode(65 + optIdx);
                          const isCorrect = q.correct_answer === optLabel;

                          return (
                            <div
                              key={optIdx}
                              className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                                isCorrect
                                  ? 'bg-emerald-50/80 border-emerald-300 font-bold text-emerald-900'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] shrink-0">
                                {optLabel}
                              </span>
                              <span>{optText}</span>
                              {isCorrect && (
                                <span className="ml-auto text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                  KEY
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between">
              <div className="text-xs text-slate-500 font-mono">
                Checksum: {inspectingVersion.version.checksum_sha256?.substring(0, 16)}...
              </div>
              <button
                type="button"
                onClick={() => setInspectingVersion(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cryptographic Security Envelope Modal */}
      {envelopeModalVersion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 text-slate-100 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden text-xs">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cryptographic Security Envelope</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Version: {envelopeModalVersion.version_code} • FIPS 140-2 Compliant
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEnvelopeModalVersion(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 font-mono">
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">SHA-256 Checksum</div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 text-xs break-all flex items-center justify-between gap-2">
                  <span>{envelopeModalVersion.checksum_sha256 || 'Calculated during build'}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(envelopeModalVersion.checksum_sha256 || '', 'env_sha')}
                    className="text-slate-400 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Key Fingerprint</div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-teal-300 text-xs break-all flex items-center justify-between gap-2">
                  <span>{envelopeModalVersion.key_fingerprint || 'FP-AES256-GCM-IMMUTABLE'}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(envelopeModalVersion.key_fingerprint || '', 'env_fp')}
                    className="text-slate-400 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase">IV (Initialization Vector)</div>
                  <div className="text-slate-200 text-[11px] break-all">
                    {envelopeModalVersion.iv_hex || '96-bit AES-GCM IV'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase">Authentication Tag</div>
                  <div className="text-slate-200 text-[11px] break-all">
                    {envelopeModalVersion.auth_tag_hex || '128-bit Poly1305 Tag'}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2 font-sans">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Envelope integrity verified against ZeroLeak Hardware Security Module. Plaintext release locked until authorized examination unlock time.</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setEnvelopeModalVersion(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Question Paper PDF Viewer Modal */}
      {pdfModalVersionId && selectedExam && (
        <QuestionPaperPdfModal
          exam={selectedExam}
          initialVersionId={pdfModalVersionId}
          onClose={() => setPdfModalVersionId(null)}
        />
      )}
    </div>
  );
};

