import React from 'react';
import { LaTeXText } from '../common/LaTeXText';

export interface PrintPaperQuestion {
  id: string;
  originalQuestionId?: string;
  displayNumber?: string;
  questionNumber?: number | string;
  sectionName?: string;
  subject?: string;
  questionType?: string;
  questionText: string;
  options?: Array<{ label?: string; text: string }>;
  translatedText?: string;
  translatedOptions?: Array<{ label?: string; text: string }>;
  marks?: number;
  negativeMarks?: number;
  translationRequired?: boolean;
  translationLanguage?: string;
  sourcePdf?: string;
  sourcePage?: number;
  sourceQuestionNumber?: string;
}

export interface PrintPaperSection {
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
  questions: PrintPaperQuestion[];
}

export interface PrintExaminationPaperProps {
  paper: {
    id: string;
    title: string;
    examType: string;
    durationMinutes: number;
    totalQuestions: number;
    totalMarks: number;
    totalPositiveMarks?: number;
    totalNegativeMarks?: number;
    examDate?: string;
    examTime?: string;
    instructions?: string;
    sections: PrintPaperSection[];
    questions?: PrintPaperQuestion[];
    paperFingerprint?: string;
    generatedAt?: string;
  };
}

export const CompetitivePrintExaminationPaper: React.FC<PrintExaminationPaperProps> = ({ paper }) => {
  const watermarkText = `ZEROLEAK SECURE ENCLAVE • ${paper.title.toUpperCase()} • ${paper.paperFingerprint?.slice(0, 16) || 'AUTH-VERIFIED'}`;

  // Helper to determine if an option set can be rendered in 2 compact columns
  const shouldRenderTwoColumnOptions = (options: Array<{ text: string }>): boolean => {
    if (!options || options.length === 0) return false;
    // If any option exceeds 28 characters, render in single stacked column
    return options.every(opt => (opt.text || '').length <= 28);
  };

  // Convert A/B/C/D to (1), (2), (3), (4)
  const formatOptionIndex = (index: number): string => `(${index + 1})`;

  return (
    <div
      className="bg-white text-black font-serif antialiased select-none relative max-w-[960px] mx-auto p-6 sm:p-12 border border-neutral-300 shadow-md my-4"
      style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Subtle Security Diagonal Watermark in Background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.035] overflow-hidden flex items-center justify-center select-none">
        <p className="text-3xl font-mono font-bold rotate-[-30deg] tracking-widest text-black uppercase">
          {watermarkText}
        </p>
      </div>

      {/* Institutional Document Header */}
      <div className="border-b-2 border-black pb-4 text-center space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-widest text-neutral-800">
          {paper.examType || 'COMPETITIVE EXAMINATION'}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-black">
          {paper.title}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs sm:text-sm font-medium text-neutral-800 pt-1">
          <span>Time Allowed: <strong>{paper.durationMinutes} Minutes</strong></span>
          <span>Maximum Marks: <strong>{paper.totalMarks}</strong></span>
          <span>Total Questions: <strong>{paper.totalQuestions}</strong></span>
          {paper.examDate && <span>Date: <strong>{paper.examDate}</strong></span>}
          {paper.examTime && <span>Session: <strong>{paper.examTime}</strong></span>}
        </div>
      </div>

      {/* Candidate Instructions */}
      {paper.instructions && (
        <div className="my-3 text-xs leading-relaxed text-neutral-900 border-b border-black pb-3">
          <p className="font-bold uppercase tracking-wide text-[11px] mb-0.5">Read the following instructions carefully:</p>
          <p className="whitespace-pre-line italic text-neutral-800">{paper.instructions}</p>
        </div>
      )}

      {/* Sequential Subject Sections */}
      <div className="space-y-8 mt-4">
        {paper.sections.map((section, sIdx) => {
          const questions = section.questions || [];
          if (questions.length === 0) return null;

          // Dynamically compute the question range (e.g. Q. No. 1 to 35)
          const firstQNum = questions[0].displayNumber || questions[0].questionNumber || 1;
          const lastQNum = questions[questions.length - 1].displayNumber || questions[questions.length - 1].questionNumber || questions.length;
          const sectionBoxTitle = `${section.subject.toUpperCase()} : SECTION-${section.sectionLetter || String.fromCharCode(65 + sIdx)} (Q. No. ${firstQNum} to ${lastQNum})`;

          return (
            <div key={section.sectionLetter || sIdx} className="space-y-4">
              {/* Boxed / Bordered Section Heading */}
              <div className="border border-black py-1 px-4 text-center font-bold uppercase tracking-wider text-xs sm:text-sm bg-neutral-50/50">
                {sectionBoxTitle}
              </div>

              {/* TWO-COLUMN QUESTION LAYOUT */}
              <div className="columns-1 md:columns-2 gap-8 [column-rule:1px_solid_#d4d4d4] text-[13px] sm:text-[13.5px] leading-relaxed text-black">
                {questions.map((q, qIdx) => {
                  const qNum = q.displayNumber || q.questionNumber || qIdx + 1;
                  const marksText = q.marks ? `[${q.marks}]` : '';
                  const options = q.options || [];
                  const isCompactTwoCol = shouldRenderTwoColumnOptions(options);

                  // Support statement-based and long questions
                  return (
                    <div
                      key={q.id || qIdx}
                      className="break-inside-avoid mb-6 text-black font-serif"
                    >
                      {/* Question Text with Number */}
                      <div className="text-justify leading-relaxed">
                        <span className="font-bold text-black mr-1.5">{qNum}.</span>
                        <LaTeXText text={q.questionText} className="inline text-black font-serif" />
                        {marksText && (
                          <span className="text-[11px] font-sans font-semibold text-neutral-700 ml-1.5 inline-block">
                            {marksText}
                          </span>
                        )}
                      </div>

                      {/* Bilingual Translation (Immediately below original question) */}
                      {q.translationRequired && q.translatedText && (
                        <div className="mt-1 text-neutral-800 text-[12.5px] leading-relaxed italic border-l border-neutral-400 pl-2">
                          <LaTeXText text={q.translatedText} className="inline font-serif text-neutral-900" />
                        </div>
                      )}

                      {/* MCQ Options */}
                      {options.length > 0 && (
                        <div
                          className={`mt-2 ${
                            isCompactTwoCol
                              ? 'grid grid-cols-2 gap-x-3 gap-y-1'
                              : 'space-y-1'
                          }`}
                        >
                          {options.map((opt, oIdx) => {
                            const optLabel = formatOptionIndex(oIdx);
                            const translatedOpt = q.translatedOptions?.[oIdx];

                            return (
                              <div
                                key={oIdx}
                                className="flex items-start gap-1 text-[12.5px] sm:text-[13px] leading-snug"
                              >
                                <span className="font-bold text-black shrink-0">{optLabel}</span>
                                <div className="space-y-0.5">
                                  <span>
                                    <LaTeXText text={opt.text} className="inline font-serif text-black" />
                                  </span>
                                  {q.translationRequired && translatedOpt && (
                                    <span className="block text-[11.5px] italic text-neutral-700">
                                      <LaTeXText text={translatedOpt.text} className="inline font-serif" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Document End Footer */}
      <div className="border-t border-black mt-8 pt-3 text-center text-xs font-bold uppercase tracking-widest text-neutral-700">
        *** END OF QUESTION PAPER ***
      </div>
    </div>
  );
};
