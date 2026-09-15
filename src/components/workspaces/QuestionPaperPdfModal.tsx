import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Printer,
  X,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  Layers,
  ChevronDown,
  Download,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { api } from '../../api';
import { Examination, PaperVersion } from '../../types';

interface QuestionPaperPdfModalProps {
  exam: Examination;
  initialVersionId?: string;
  onClose: () => void;
}

export const QuestionPaperPdfModal: React.FC<QuestionPaperPdfModalProps> = ({
  exam,
  initialVersionId,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paperData, setPaperData] = useState<{
    version: any;
    questions: any[];
    allVersions?: any[];
    exam: Examination;
  } | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(initialVersionId || '');
  const printRef = useRef<HTMLDivElement>(null);

  const fetchPaper = async (versionId?: string) => {
    setLoading(true);
    setError(null);
    try {
      if (versionId) {
        const res = await api.getPaperVersionDetails(exam.id, versionId);
        if (res.success) {
          setPaperData({
            version: res.version,
            questions: res.questions,
            exam: res.exam || exam,
          });
          setSelectedVersionId(res.version.id);
        } else {
          setError('Failed to load selected version.');
        }
      } else {
        const res = await api.getCurrentPaper(exam.id);
        if (res.success) {
          setPaperData({
            version: res.version,
            questions: res.questions,
            allVersions: res.allVersions,
            exam: res.exam || exam,
          });
          setSelectedVersionId(res.version.id);
        } else {
          setError('No paper available for this examination.');
        }
      }
    } catch (err: any) {
      console.error('Failed to load paper for PDF modal', err);
      setError(err.message || 'Failed to load question paper.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaper(initialVersionId);
  }, [exam.id, initialVersionId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Container */}
      <div className="bg-white text-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Control Bar (Hidden during window.print()) */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white">Official Question Paper PDF</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                  PDF READY
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-md">
                {paperData?.version?.version_code || exam.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Version Switcher */}
            {paperData?.allVersions && paperData.allVersions.length > 1 && (
              <select
                value={selectedVersionId}
                onChange={(e) => {
                  setSelectedVersionId(e.target.value);
                  fetchPaper(e.target.value);
                }}
                className="bg-slate-800 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
              >
                {paperData.allVersions.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.version_code} {v.is_current ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Answer Key Toggle */}
            <button
              type="button"
              onClick={() => setShowAnswerKey(!showAnswerKey)}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all ${
                showAnswerKey
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title="Toggle Answer Key display"
            >
              {showAnswerKey ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showAnswerKey ? 'Answer Key ON' : 'Answer Key OFF'}</span>
            </button>

            {/* Print / Save PDF Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-slate-100/70" id="printable-question-paper">
          {loading ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-600 font-semibold">
                Loading official cryptographic question paper...
              </p>
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-rose-50 text-rose-800 rounded-xl border border-rose-200 space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
              <p className="text-sm font-bold">{error}</p>
              <button
                type="button"
                onClick={() => fetchPaper()}
                className="px-4 py-1.5 bg-rose-700 text-white rounded-lg font-bold text-xs cursor-pointer"
              >
                Retry Loading
              </button>
            </div>
          ) : paperData ? (
            /* Printable A4 Paper Layout */
            <div
              ref={printRef}
              className="bg-white text-slate-900 p-6 sm:p-10 rounded-xl shadow-md border border-slate-300 max-w-3xl mx-auto space-y-6 relative print:shadow-none print:border-none print:p-0 print:m-0"
            >
              {/* Paper Watermark */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] select-none text-slate-950 font-black text-6xl rotate-[-30deg] uppercase">
                ZeroLeak Enclave Sealed
              </div>

              {/* Official Header */}
              <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  CONFIDENTIAL &bull; PROTECTED UNDER OFFICIAL SECRECY ACT
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight uppercase">
                  {paperData.exam.name}
                </h1>
                <div className="text-xs sm:text-sm font-bold text-slate-700">
                  Subject: {paperData.exam.subject} &bull; Category: {paperData.exam.category}
                </div>

                <div className="flex flex-wrap items-center justify-between pt-3 text-xs font-bold text-slate-800 border-t border-slate-200 mt-3 font-mono">
                  <span>Paper Code: <strong>{paperData.version?.version_code || 'V1-SET-A'}</strong></span>
                  <span>Time Allowed: <strong>{paperData.exam.duration_minutes || 180} Minutes</strong></span>
                  <span>Maximum Marks: <strong>{paperData.exam.total_marks || 100}</strong></span>
                </div>
              </div>

              {/* General Instructions */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1 text-slate-700">
                <div className="font-black text-slate-900 uppercase tracking-wide text-[11px]">
                  General Instructions:
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-[11px] leading-relaxed">
                  <li>This question paper contains {paperData.questions.length} compulsory questions.</li>
                  <li>Each question carries 4 marks unless otherwise specified.</li>
                  <li>Negative marking: -1 mark is deducted for every incorrect MCQ response.</li>
                  <li>Choose the single most appropriate option for each question.</li>
                  <li>Cryptographic verification fingerprint: <span className="font-mono text-[10px]">{paperData.version?.key_fingerprint || paperData.version?.checksum_sha256?.substring(0, 16) || 'FIPS-140-2'}</span></li>
                </ol>
              </div>

              {/* Questions Stream */}
              <div className="space-y-6">
                {paperData.questions.map((q, idx) => (
                  <div key={q.id || idx} className="space-y-2 border-b border-slate-200 pb-4 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 font-bold text-slate-950 text-sm leading-snug">
                        <span className="font-extrabold text-slate-900 shrink-0">
                          Q.{q.order_index || idx + 1}.
                        </span>
                        <div className="whitespace-pre-wrap font-medium text-slate-900">
                          {q.content_text}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs text-slate-600 shrink-0 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        [{q.question_marks || 4} Marks]
                      </span>
                    </div>

                    {/* Question Image / Diagram */}
                    {(q.diagram_url || q.image_url) && (
                      <div className="py-2 pl-6">
                        <img
                          src={q.diagram_url || q.image_url}
                          alt="Question diagram"
                          className="max-h-56 rounded-lg border border-slate-200 object-contain bg-white"
                        />
                      </div>
                    )}

                    {/* Options (MCQ) */}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pl-6">
                        {q.options.map((opt: any, optIdx: number) => {
                          const optText = typeof opt === 'string' ? opt : (opt?.text ?? opt?.value ?? '');
                          const optLabel = opt?.label || String.fromCharCode(65 + optIdx);
                          const isCorrect = q.correct_answer === optLabel;

                          return (
                            <div
                              key={optIdx}
                              className={`p-2 rounded-lg border text-xs flex items-center gap-2 ${
                                showAnswerKey && isCorrect
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                                  : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                showAnswerKey && isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 border border-slate-300'
                              }`}>
                                {optLabel}
                              </span>
                              <span>{optText}</span>
                              {showAnswerKey && isCorrect && (
                                <span className="ml-auto text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">
                                  CORRECT KEY
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Official Paper Footer */}
              <div className="pt-6 border-t-2 border-slate-900 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono">
                <div>
                  Generated: {new Date(paperData.version?.generated_at || Date.now()).toLocaleDateString()}
                </div>
                <div className="text-center font-bold text-slate-700">
                  *** END OF QUESTION PAPER ***
                </div>
                <div>
                  SHA-256: {paperData.version?.checksum_sha256 ? `${paperData.version.checksum_sha256.substring(0, 12)}...` : 'PROTECTED'}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

