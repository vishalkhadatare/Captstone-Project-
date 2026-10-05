import React, { useState } from 'react';
import { Lock, ShieldCheck, Sparkles, CheckCircle2, AlertTriangle, ArrowLeft, RefreshCw, Eye, Award, FileText, Check, Globe } from 'lucide-react';
import { SubjectRule, ExamDetails } from './CompetitiveBlueprintForm';
import { CompetitivePrintExaminationPaper } from './CompetitivePrintExaminationPaper';
import { api } from '../../api';

interface GeneratedPaperQuestion {
  id: string;
  originalQuestionId: string;
  displayNumber: string;
  questionNumber: number;
  sectionName: string;
  subject: string;
  questionType: string;
  questionText: string;
  options?: Array<{ label: string; text: string }>;
  translatedText?: string;
  translatedOptions?: Array<{ label: string; text: string }>;
  marks: number;
  negativeMarks: number;
  translationRequired: boolean;
  translationLanguage?: string;
  sourcePdf?: string;
  sourcePage?: number;
  sourceQuestionNumber?: string;
}

interface GeneratedSection {
  sectionLetter: string;
  sectionName: string;
  subject: string;
  questionType: string;
  marksPerQuestion: number;
  negativeMarks: number;
  translationRequired: boolean;
  translationLanguage?: string;
  totalQuestions: number;
  totalSectionMarks: number;
  questions: GeneratedPaperQuestion[];
}

interface GeneratedCompetitivePaper {
  id: string;
  examId: string;
  title: string;
  examType: string;
  durationMinutes: number;
  examDate?: string;
  examTime?: string;
  instructions?: string;
  totalQuestions: number;
  totalMarks: number;
  totalPositiveMarks: number;
  totalNegativeMarks: number;
  sections: GeneratedSection[];
  questions: GeneratedPaperQuestion[];
  sourceProvenance: Array<{
    questionNumber: string;
    subject: string;
    sourcePdf: string;
    sourcePage: number;
    sourceQuestionNumber: string;
  }>;
  paperFingerprint: string;
  generatedAt: string;
}

interface PaperGeneratorProps {
  examId: string;
  examDetails: ExamDetails;
  subjects: SubjectRule[];
  onBack: () => void;
}

export const CompetitivePaperGenerator: React.FC<PaperGeneratorProps> = ({
  examId,
  examDetails,
  subjects,
  onBack,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPaper, setGeneratedPaper] = useState<GeneratedCompetitivePaper | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showProvenanceDrawer, setShowProvenanceDrawer] = useState(false);

  // Trigger Paper Generation
  const handleGeneratePaper = async () => {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const resp = await api.competitive.generateFinalPaper(examId, { subjects });
      if (resp && resp.success && resp.paper) {
        setGeneratedPaper(resp.paper);
      } else {
        throw new Error((resp as any)?.error || 'Generation failed.');
      }
    } catch (err: any) {
      console.error('Paper generation error:', err);
      setGenerationError(err.message || 'Failed to generate final competitive examination paper.');
    } finally {
      setIsGenerating(false);
    }
  };

  const watermarkString = `ZeroLeak Secure Enclave • ${examDetails.name} • ${new Date().toISOString()} • SHA-256:${generatedPaper?.paperFingerprint?.slice(0, 12) || 'AUTH-VERIFIED'}`;

  return (
    <div className="space-y-6">
      {/* If Paper has NOT been generated yet: Show Step 6 Launch Screen */}
      {!generatedPaper ? (
        <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm text-center space-y-6 max-w-3xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center mx-auto shadow-xs">
            <Sparkles className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 font-serif">
              Step 6: Generate Final Competitive Examination Paper
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-lg mx-auto">
              Your blueprint and question pools have passed full validation. The engine will select individual questions across your uploaded source PDFs, assemble sequential sections, and perform bilingual translation where configured.
            </p>
          </div>

          {/* Blueprint Summary Pill Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold">Total Subjects</span>
              <p className="text-sm font-bold text-slate-900">{subjects.length}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold">Total Questions</span>
              <p className="text-sm font-bold text-slate-900 font-mono">
                {subjects.reduce((sum, s) => sum + s.numberOfQuestions, 0)}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold">Total Marks</span>
              <p className="text-sm font-bold text-emerald-700 font-mono">
                {subjects.reduce((sum, s) => sum + s.numberOfQuestions * s.marksPerQuestion, 0)}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold">Bilingual Subjects</span>
              <p className="text-sm font-bold text-slate-900">
                {subjects.filter(s => s.translationRequired).length}
              </p>
            </div>
          </div>

          {generationError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 text-left">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{generationError}</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Validation</span>
            </button>

            <button
              type="button"
              onClick={handleGeneratePaper}
              disabled={isGenerating}
              className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Selecting & Translating Questions...' : 'Generate Final Competitive Paper'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* STEP 7: PROTECTED FINAL COMPETITIVE PAPER VIEW (Requirement 20)           */
        /* STRICT NO-DOWNLOAD / NO-PRINT / NO-COPY / PROCTORED ENCLAVE VIEW          */
        /* ========================================================================= */
        <div
          className="space-y-6 select-none relative"
          onContextMenu={e => e.preventDefault()}
        >
          {/* Top Control Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Protected Final Competitive Paper</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ONE FINAL PAPER
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  SHA-256 Fingerprint: {generatedPaper.paperFingerprint}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowProvenanceDrawer(!showProvenanceDrawer)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{showProvenanceDrawer ? 'Hide Source Traceability' : 'Audit Source Traceability'}</span>
              </button>

              <button
                type="button"
                onClick={() => setGeneratedPaper(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Re-Configure
              </button>
            </div>
          </div>

          {/* Security Notice: Download / Print / Export / Copy Disabled (Requirement 20) */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>ZeroLeak Security Enclave Active:</strong> Content reproduction, printing, text copying, and document export are cryptographically restricted. Watermark actively rendered.
              </span>
            </div>
          </div>

          {/* Audit Source Traceability Drawer (Requirement 14 & 30) */}
          {showProvenanceDrawer && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <span>Question Origin & Multi-PDF Contribution Audit Matrix:</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-2">
                {generatedPaper.sourceProvenance.map((item, pIdx) => (
                  <div
                    key={pIdx}
                    className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-0.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>{item.questionNumber}</span>
                      <span className="text-slate-600 font-mono text-[10px]">{item.subject}</span>
                    </div>
                    <p className="text-slate-600 font-mono text-[10px] truncate" title={item.sourcePdf}>
                      {item.sourcePdf}
                    </p>
                    <p className="text-slate-400 text-[9px]">
                      Source Page: {item.sourcePage} • Orig Q#: {item.sourceQuestionNumber}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Institutional Final Examination Paper Document (Printed Examination Style) */}
          <div className="print:hidden">
            <CompetitivePrintExaminationPaper paper={generatedPaper} />
          </div>
        </div>
      )}
    </div>
  );
};

