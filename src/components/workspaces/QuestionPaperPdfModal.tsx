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

              {/* Official University Header matching SLR-HL-475 */}
              <div className="space-y-3 border-b-2 border-slate-900 pb-4">
                {/* Top Row: Seat No. box on left, SLR-HL code and Set letter box on right */}
                <div className="flex items-center justify-between font-mono text-xs font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="border border-slate-900 px-2 py-1 text-xs font-black">Seat No.</span>
                    <div className="w-32 h-7 border border-slate-900 flex items-center px-2 text-[10px] text-slate-400">
                      [ Write Seat No ]
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black tracking-wider uppercase text-slate-900">
                      {paperData.version?.paper_code || 'SLR-HL-475'}
                    </span>
                    <div className="flex items-center border-2 border-slate-900 rounded overflow-hidden">
                      <span className="bg-slate-900 text-white text-xs font-black px-2 py-1">Set</span>
                      <span className="text-sm font-black px-2.5 py-0.5 text-slate-950 bg-slate-100">
                        {paperData.version?.version_code?.includes('SET-2') ? 'Q' : paperData.version?.version_code?.includes('SET-3') ? 'R' : 'P'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Main Examination Titles */}
                <div className="text-center space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    CONFIDENTIAL &bull; UNIVERSITY BOARD EXAMINATION &bull; PROTECTED UNDER OFFICIAL SECRECY ACT
                  </div>
                  <h1 className="text-base sm:text-lg font-black text-slate-950 tracking-tight uppercase leading-snug">
                    S.Y. (B.Tech.) (Sem - I) (New) (CBCS) Examination: Oct/Nov-2022
                  </h1>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 uppercase">
                    {paperData.exam.name || 'COMPUTER SCIENCE & ENGINEERING'}
                  </h2>
                  <div className="text-xs font-bold text-slate-800 uppercase">
                    Subject: {paperData.exam.subject || 'Computer Graphics'}
                  </div>

                  <div className="flex flex-wrap items-center justify-between pt-2 text-xs font-bold text-slate-900 border-t border-slate-300 mt-2 font-mono">
                    <span>Day & Date: <strong>Monday, 20-03-2023</strong></span>
                    <span>Time: <strong>02:00 PM To 05:00 PM</strong></span>
                    <span>Max. Marks: <strong>70</strong></span>
                  </div>
                </div>

                {/* University Instructions */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-300 text-xs text-slate-800 space-y-1">
                  <div className="font-extrabold text-slate-950 uppercase text-[11px]">
                    Instructions:
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px] leading-relaxed">
                    <li>Q. No. 1 is compulsory. It should be solved in the first 30 minutes in answer book. Page no 03 (Starting page of the Answer Book). Each question carries one mark.</li>
                    <li>Don’t forget to Mention question paper set (P/Q/R/S) on top of page.</li>
                    <li>Figures to the right indicate full marks.</li>
                    <li>Assume suitable data wherever needed and mention it clearly.</li>
                  </ol>
                </div>
              </div>

              {/* Section 1: MCQ / Objective Type Questions */}
              <div className="space-y-4 border-b border-slate-300 pb-6">
                <div className="flex items-center justify-between font-bold text-xs border-b border-slate-400 pb-1 text-slate-900 font-mono">
                  <span className="uppercase text-sm font-black">MCQ/Objective Type Questions</span>
                  <span>Duration: 30 Minutes &nbsp;|&nbsp; Marks: 14</span>
                </div>

                <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                  <span>Q.1 Choose the correct alternatives from the options.</span>
                  <span className="font-mono text-sm font-black pr-2">14</span>
                </div>

                <div className="space-y-3.5 pl-2">
                  {paperData.questions.slice(0, 14).map((q, idx) => (
                    <div key={q.id || idx} className="space-y-1.5 text-xs">
                      <div className="flex items-start gap-2 font-semibold text-slate-950">
                        <span className="font-bold shrink-0">{idx + 1})</span>
                        <div className="whitespace-pre-wrap leading-snug">{q.content_text}</div>
                      </div>

                      {/* Question Image / Diagram */}
                      {(q.diagram_url || q.image_url) && (
                        <div className="py-1 pl-6">
                          <img
                            src={q.diagram_url || q.image_url}
                            alt="Question diagram"
                            className="max-h-48 rounded border border-slate-300 object-contain bg-white"
                          />
                        </div>
                      )}

                      {/* MCQ Options a), b), c), d) */}
                      {Array.isArray(q.options) && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-6 pt-0.5 text-slate-800">
                          {q.options.map((opt: any, optIdx: number) => {
                            const optText = typeof opt === 'string' ? opt : (opt?.text ?? opt?.value ?? '');
                            const optLabel = opt?.label || String.fromCharCode(97 + optIdx);
                            const isCorrect = q.correct_answer === optLabel || q.correct_answer === String.fromCharCode(65 + optIdx);

                            return (
                              <div key={optIdx} className="flex items-center gap-1.5 text-xs">
                                <span className="font-bold shrink-0">{optLabel})</span>
                                <span>{optText}</span>
                                {showAnswerKey && isCorrect && (
                                  <span className="ml-1 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">
                                    [CORRECT]
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
              </div>

              {/* Section – I */}
              <div className="space-y-4 border-b border-slate-300 pb-6">
                <div className="flex items-center justify-between font-black text-sm border-b border-slate-400 pb-1 text-slate-950 uppercase font-mono">
                  <span>Section – I</span>
                  <span>Max. Marks: 28</span>
                </div>

                {/* Q.2 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                    <span>Q.2 Answer the following question. (Any Four)</span>
                    <span className="font-mono text-sm font-black pr-2">16</span>
                  </div>
                  <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                    <div className="flex items-start justify-between gap-2">
                      <span>a) Distinguish between the Raster Scan display and Random Scan display.</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span>b) Explain 2D Rotation transformation with matrix representations.</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span>c) Explain any four Computer graphics real-world applications.</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span>d) Scale the polygon with coordinates P(2,5), Q(7,10), C(10,2) by 2 units in both x and y direction.</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span>e) Explain Run Length Encoding in image compression.</span>
                    </div>
                  </div>
                </div>

                {/* Q.3 */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                    <span>Q.3 Answer the following question. (Any One)</span>
                    <span className="font-mono text-sm font-black pr-2">06</span>
                  </div>
                  <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                    <div>a) Consider a line from (0,0) to (5,6). Use DDA algorithm to rasterize this line.</div>
                    <div>b) Write Bresenham’s Circle generation algorithm with derivation.</div>
                  </div>
                </div>

                {/* Q.4 */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                    <span>Q.4 Attempt the following.</span>
                    <span className="font-mono text-sm font-black pr-2">06</span>
                  </div>
                  <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                    <div>a) Beam Penetration Technique in color CRT monitors.</div>
                    <div>b) Shadow Mask Technique in color CRT monitors.</div>
                  </div>
                </div>
              </div>

              {/* Section – II */}
              <div className="space-y-4 border-b border-slate-300 pb-6">
                <div className="flex items-center justify-between font-black text-sm border-b border-slate-400 pb-1 text-slate-950 uppercase font-mono">
                  <span>Section – II</span>
                  <span>Max. Marks: 28</span>
                </div>

                {/* Q.5 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                    <span>Q.5 Answer the following question. (Any Four)</span>
                    <span className="font-mono text-sm font-black pr-2">16</span>
                  </div>
                  <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                    <div>a) Write a short note on segmented display file structure.</div>
                    <div>b) Explain Viewing transformation pipeline in detail.</div>
                    <div>c) Explain properties of Bezier curves and control points.</div>
                    <div>d) Explain Z-Buffer depth buffer algorithm for hidden surface removal.</div>
                    <div>e) Explain Painter’s algorithm for surface visibility.</div>
                  </div>
                </div>

                {/* Q.6 */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                    <span>Q.6 Answer the following question. (Any One)</span>
                    <span className="font-mono text-sm font-black pr-2">06</span>
                  </div>
                  <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                    <div>a) Explain Warnock area subdivision algorithm.</div>
                    <div>b) What is antialiasing? Explain different techniques of antialiasing.</div>
                  </div>
                </div>

                {/* Q.7 */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                    <span>Q.7 Explain Cohen-Sutherland Line Clipping algorithm.</span>
                    <span className="font-mono text-sm font-black pr-2">06</span>
                  </div>
                </div>
              </div>

              {/* Official Paper Footer */}
              <div className="pt-4 flex flex-wrap items-center justify-between text-[11px] text-slate-600 font-mono border-t-2 border-slate-900">
                <div>
                  Generated: {new Date(paperData.version?.generated_at || Date.now()).toLocaleDateString()}
                </div>
                <div className="text-center font-extrabold text-slate-900">
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

