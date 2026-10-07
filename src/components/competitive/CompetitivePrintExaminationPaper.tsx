import React from 'react';
import { LaTeXText } from '../common/LaTeXText';

export interface CompetitiveVisualItem {
  id: string;
  type: 'diagram' | 'figure' | 'image' | 'table' | 'graph' | 'chart' | 'equation' | 'symbol' | 'region_crop' | string;
  extractionMethod?: string;
  sourcePdf?: string;
  sourceFileId?: string;
  sourcePage?: number;
  questionNumber?: string;
  bbox?: [number, number, number, number];
  width?: number;
  height?: number;
  aspectRatio?: number;
  dataUrl?: string;
  publicUrl?: string;
  caption?: string;
  position?: 'above_question' | 'below_stem' | 'below_question' | 'inline_option';
  sharedGroupId?: string | null;
  sharedQuestionNumbers?: string[];
  tableData?: {
    headers?: string[];
    rows?: string[][];
    caption?: string;
  };
}

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
  translationStatus?: string;
  subQuestions?: Array<
    | string
    | {
        label?: string;
        text: string;
        marks?: number;
        translatedText?: string;
      }
  >;
  marks?: number;
  negativeMarks?: number;
  translationRequired?: boolean;
  translationLanguage?: string;
  sourcePdf?: string;
  sourcePage?: number;
  sourceQuestionNumber?: string;
  diagramSvg?: string;
  imageUrl?: string;
  diagramUrl?: string;
  hasVisual?: boolean;
  requiresVisual?: boolean;
  visualReferences?: string[];
  visualElements?: CompetitiveVisualItem[];
  equations?: string[];
  captions?: string[];
  sharedVisualGroupId?: string | null;
  sharedWithQuestionNumbers?: string[];
  isPrimarySharedVisualInstance?: boolean;
  visualValidationStatus?: string;
  tableData?: {
    headers?: string[];
    rows?: string[][];
    caption?: string;
  } | null;
}

export interface PrintPaperSection {
  sectionLetter?: string;
  sectionCode?: string;
  sectionName?: string;
  subject?: string;
  subjectName?: string;
  questionType?: string;
  marksPerQuestion?: number;
  negativeMarks?: number;
  translationRequired?: boolean;
  translationLanguage?: string;
  totalQuestions?: number;
  questionCount?: number;
  totalSectionMarks?: number;
  sectionMarks?: number;
  questions: PrintPaperQuestion[];
}

export interface PrintExaminationPaperProps {
  paper: {
    id: string;
    title?: string;
    examName?: string;
    examType: string;
    durationMinutes: number;
    totalQuestions: number;
    totalMarks: number;
    totalPositiveMarks?: number;
    totalNegativeMarks?: number;
    examDate?: string;
    examTime?: string;
    scheduleExamDate?: string | null;
    decryptionTimeDisplay?: string | null;
    scheduleTimezone?: string | null;
    instructions?: string;
    enableTranslation?: boolean;
    translationLanguage?: string | null;
    translationStatus?: string;
    sections: PrintPaperSection[];
    originalSections?: PrintPaperSection[];
    bilingualSections?: PrintPaperSection[];
    questions?: PrintPaperQuestion[];
    paperFingerprint?: string;
    visualValidation?: {
      valid: boolean;
      status: 'VERIFIED' | 'NEEDS_REVIEW';
      totalQuestions: number;
      questionsRequiringVisuals: number;
      questionsWithVisuals: number;
      totalVisualElements: number;
      summary: string;
      issues?: Array<{
        questionNumber: string;
        issueType: string;
        severity: 'ERROR' | 'WARNING';
        message: string;
      }>;
    };
    generatedAt?: string;
  };
  viewMode?: 'BILINGUAL' | 'ORIGINAL_ENGLISH';
  operatorPrintMeta?: {
    copyId?: string;
    centreCode?: string;
    operatorName?: string;
    decryptedAt?: string;
    printedAt?: string;
    txHash?: string;
  };
}

export const CompetitivePrintExaminationPaper: React.FC<PrintExaminationPaperProps> = ({
  paper,
  viewMode = 'BILINGUAL',
  operatorPrintMeta,
}) => {
  const isOriginalEnglishOnly = viewMode === 'ORIGINAL_ENGLISH';
  const paperTitle = paper.title || paper.examName || 'Competitive Examination';
  const activeSections: PrintPaperSection[] = isOriginalEnglishOnly
    ? paper.originalSections && paper.originalSections.length > 0
      ? paper.originalSections
      : paper.sections
    : paper.bilingualSections && paper.bilingualSections.length > 0
      ? paper.bilingualSections
      : paper.sections;

  const watermarkText = operatorPrintMeta?.copyId
    ? `ZEROLEAK AUTHORIZED PRINT • ${operatorPrintMeta.copyId} • ${operatorPrintMeta.centreCode || 'CTR-101'} • ${paperTitle.toUpperCase()}`
    : `ZEROLEAK SECURE ENCLAVE • ${paperTitle.toUpperCase()} • ${paper.paperFingerprint?.slice(0, 16) || 'AUTH-VERIFIED'}`;

  // Helper to determine if an option set can be rendered in 2 compact columns
  const shouldRenderTwoColumnOptions = (
    options: Array<{ text: string }>,
    translatedOptions?: Array<{ text: string }>
  ): boolean => {
    if (!options || options.length === 0) return false;
    const hasTranslation =
      !isOriginalEnglishOnly &&
      translatedOptions &&
      translatedOptions.some(t => Boolean(t?.text));
    const maxLen = hasTranslation ? 22 : 28;
    return (
      options.every(opt => (opt.text || '').length <= maxLen) &&
      (!hasTranslation || (translatedOptions || []).every(opt => (opt?.text || '').length <= maxLen))
    );
  };

  // Convert A/B/C/D to (1), (2), (3), (4) or preserve label
  const formatOptionIndex = (index: number, label?: string): string =>
    label ? `(${label})` : `(${index + 1})`;

  const effectiveExamDate = paper.scheduleExamDate || paper.examDate;

  const renderVisualElementsBlock = (
    visuals: CompetitiveVisualItem[],
    qNum: string | number,
    printedCaptions: Set<string>
  ) => {
    if (!visuals || visuals.length === 0) return null;
    return (
      <div className="my-2.5 space-y-2">
        {visuals.map((vis, vIdx) => {
          const imgSrc = vis.dataUrl || vis.publicUrl;
          const capClean = (vis.caption || '').trim();
          if (capClean) {
            printedCaptions.add(capClean.toLowerCase());
          }
          const isEquationOrSymbol = vis.type === 'equation' || vis.type === 'symbol';
          return (
            <figure
              key={vis.id || `${qNum}-vis-${vIdx}`}
              className="my-1.5 p-2 border border-neutral-300 bg-white flex flex-col items-center justify-center break-inside-avoid"
            >
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={capClean || `Question ${qNum} ${vis.type || 'visual'}`}
                  className={`${
                    isEquationOrSymbol ? 'max-h-24' : 'max-h-56'
                  } w-auto max-w-full object-contain`}
                  loading="lazy"
                />
              ) : (
                <div className="px-3 py-2 text-[11px] italic text-neutral-700 bg-neutral-50 border border-dashed border-neutral-300 w-full text-center">
                  [Preserved {String(vis.type || 'visual').toUpperCase()} from {vis.sourcePdf || 'Draft PDF'} (Page {vis.sourcePage || 1})]
                </div>
              )}
              {capClean && (
                <figcaption className="mt-1 text-[11px] italic text-neutral-800 text-center font-serif">
                  <LaTeXText text={capClean} />
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="bg-white text-black font-serif antialiased select-none relative max-w-[960px] mx-auto p-6 sm:p-12 border border-neutral-300 shadow-md my-4 print:shadow-none print:border-none print:my-0 print:p-4"
      style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Subtle Security Diagonal Watermark in Background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] overflow-hidden flex items-center justify-center select-none">
        <p className="text-3xl font-mono font-bold rotate-[-30deg] tracking-widest text-black uppercase text-center px-6">
          {watermarkText}
        </p>
      </div>

      {/* Authorized Centre Print Security Header (When Printed by Centre Operator) */}
      {operatorPrintMeta && (
        <div className="mb-3 p-2 border border-neutral-800 bg-neutral-50 text-[10px] font-mono flex flex-wrap items-center justify-between gap-2 text-neutral-900">
          <div>
            <strong>AUTHORIZED CENTRE PRINT COPY:</strong> {operatorPrintMeta.copyId || 'OFFICIAL-MASTER'} •{' '}
            <strong>CENTRE:</strong> {operatorPrintMeta.centreCode || 'CTR-101'}
          </div>
          <div>
            <strong>OPERATOR:</strong> {operatorPrintMeta.operatorName || 'Authorized Superintendent'} •{' '}
            <strong>PAPER ID:</strong> {paper.id}
          </div>
          {operatorPrintMeta.txHash && (
            <div className="w-full text-[9px] text-neutral-700 border-t border-neutral-300 pt-1">
              <strong>TIME-LOCK AUDIT HASH:</strong> {operatorPrintMeta.txHash} •{' '}
              <strong>PRINTED AT (SERVER CLOCK):</strong>{' '}
              {operatorPrintMeta.printedAt ? new Date(operatorPrintMeta.printedAt).toLocaleString() : 'VERIFIED'}
            </div>
          )}
        </div>
      )}

      {/* Institutional Document Header */}
      <div className="border-b-2 border-black pb-4 text-center space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-widest text-neutral-800">
          {paper.examType || 'COMPETITIVE EXAMINATION'}
          {!isOriginalEnglishOnly && paper.enableTranslation && paper.translationLanguage
            ? ` • BILINGUAL EDITION (ENGLISH & ${paper.translationLanguage.toUpperCase()})`
            : ' • ENGLISH EDITION'}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-black">
          {paperTitle}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs sm:text-sm font-medium text-neutral-800 pt-1">
          <span>
            Paper Code: <strong className="font-mono">{paper.id.slice(0, 14).toUpperCase()}</strong>
          </span>
          <span>
            Time Allowed: <strong>{paper.durationMinutes} Minutes</strong>
          </span>
          <span>
            Maximum Marks: <strong>{paper.totalMarks}</strong>
          </span>
          <span>
            Total Questions: <strong>{paper.totalQuestions}</strong>
          </span>
          {effectiveExamDate && (
            <span>
              Exam Date: <strong>{effectiveExamDate}</strong>
            </span>
          )}
          {(paper.decryptionTimeDisplay || paper.examTime) && (
            <span>
              Session / Unlock: <strong>{paper.decryptionTimeDisplay || paper.examTime}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Candidate Instructions */}
      {paper.instructions && (
        <div className="my-3 text-xs leading-relaxed text-neutral-900 border-b border-black pb-3">
          <p className="font-bold uppercase tracking-wide text-[11px] mb-0.5">
            Read the following instructions carefully:
          </p>
          <p className="whitespace-pre-line italic text-neutral-800">{paper.instructions}</p>
        </div>
      )}

      {/* Sequential Subject Sections */}
      <div className="space-y-8 mt-4">
        {activeSections.map((section, sIdx) => {
          const questions = section.questions || [];
          if (questions.length === 0) return null;

          // Dynamically compute the question range (e.g. Q. No. 1 to 10) without duplicate "Q"
          const firstQNum = String(
            questions[0].questionNumber || questions[0].displayNumber || 1
          ).replace(/^Q\.?\s*/i, '');
          const lastQNum = String(
            questions[questions.length - 1].questionNumber ||
              questions[questions.length - 1].displayNumber ||
              questions.length
          ).replace(/^Q\.?\s*/i, '');
          const subjectLabel = section.subject || section.subjectName || 'GENERAL';
          const sectionCodeLabel =
            section.sectionLetter || section.sectionCode || String.fromCharCode(65 + sIdx);
          const sectionBoxTitle = `${subjectLabel.toUpperCase()} : ${
            sectionCodeLabel.toUpperCase().startsWith('SECTION')
              ? sectionCodeLabel.toUpperCase()
              : `SECTION-${sectionCodeLabel}`
          } (Q. No. ${firstQNum} to ${lastQNum})`;

          const cleanDisplayText = (raw?: string): string => {
            if (!raw) return '';
            return String(raw)
              .replace(/\uF057/g, 'Ω')
              .replace(/\uF0B0/g, '°')
              .replace(/\uF06D/g, 'μ')
              .replace(/\uF070/g, 'π')
              .replace(/\uF06C/g, 'λ')
              .replace(/\uF0B1/g, '±')
              .replace(/\uF0AE/g, '→')
              .replace(/\uF0B4/g, '×')
              .replace(/\uF044/g, 'Δ')
              .replace(/\uF061/g, 'α')
              .replace(/\uF062/g, 'β')
              .replace(/\uF067/g, 'γ')
              .replace(/\uF071/g, 'θ')
              .replace(/[\uF020-\uF0FF]/g, ' ')
              .replace(/\*[A-Z0-9_-]{2,10}\*/g, ' ')
              .replace(/\b[A-Z]{3,8}\s*\/\s*[A-Z0-9]{1,4}\s*\/\s*(?:Page|પૃષ્ઠ|पृष्ठ)\s*[0-9૦-૯०-९]+\b/gi, ' ')
              .replace(/\bALHCA\b/g, ' ')
              .replace(/\bSPACE\s+FOR\s+ROUGH\s+WORK\b/gi, ' ')
              .replace(/રફ\s+વર્ક\s+માટે\s+જગ્યા(?:\s+અંગ્રેજી)?/g, ' ')
              .replace(/(?:^|\s)[0-9૦-૯०-९]*\s*www\.[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/gi, ' ')
              .replace(/_{5,}/g, '____')
              .replace(/^\s*\.\s*(?=[A-Za-z0-9\u0900-\u0DFF(])/, '')
              .replace(/\s{2,}/g, ' ')
              .trim();
          };

          return (
            <div key={sectionCodeLabel || sIdx} className="space-y-4">
              {/* Boxed / Bordered Section Heading */}
              <div className="border border-black py-1 px-4 text-center font-bold uppercase tracking-wider text-xs sm:text-sm bg-neutral-50/50">
                {sectionBoxTitle}
              </div>

              {/* TWO-COLUMN QUESTION LAYOUT */}
              <div className="columns-1 md:columns-2 print:columns-2 gap-8 [column-rule:1px_solid_#d4d4d4] text-[13px] sm:text-[13.5px] leading-relaxed text-black">
                {questions.map((q, qIdx) => {
                  const qNum = q.displayNumber || q.questionNumber || `Q${qIdx + 1}`;
                  const marksText = q.marks ? `[${q.marks}]` : '';

                  // Auto-promote (1)-(4) / (A)-(D) subQuestions to options if options array is empty
                  let options = Array.isArray(q.options) ? [...q.options] : [];
                  let effectiveSubQuestions = Array.isArray(q.subQuestions) ? [...q.subQuestions] : [];
                  if (options.length === 0 && effectiveSubQuestions.length > 0) {
                    const promoted: Array<{ label: string; text: string }> = [];
                    const restSubs: typeof effectiveSubQuestions = [];
                    for (const sq of effectiveSubQuestions) {
                      if (typeof sq === 'string') {
                        const m = sq.trim().match(/^(?:\(([1-4A-Da-d])\)|\[([1-4A-Da-d])\])\s*(.+)/);
                        if (m) {
                          const rawLbl = (m[1] || m[2] || '').toUpperCase();
                          const lbl =
                            rawLbl === '1'
                              ? 'A'
                              : rawLbl === '2'
                              ? 'B'
                              : rawLbl === '3'
                              ? 'C'
                              : rawLbl === '4'
                              ? 'D'
                              : rawLbl;
                          promoted.push({ label: lbl, text: cleanDisplayText(m[3]) });
                          continue;
                        }
                      }
                      restSubs.push(sq);
                    }
                    if (promoted.length > 0) {
                      options = promoted;
                      effectiveSubQuestions = restSubs;
                    }
                  } else {
                    options = options.map(o => ({
                      ...o,
                      text: cleanDisplayText(o.text),
                    }));
                  }

                  const cleanedQuestionText = cleanDisplayText(q.questionText);
                  const cleanedTranslatedText = cleanDisplayText(q.translatedText);

                  const showTranslation =
                    !isOriginalEnglishOnly &&
                    (Boolean(q.translationRequired) || Boolean(paper.enableTranslation)) &&
                    Boolean(cleanedTranslatedText);
                  const isCompactTwoCol = shouldRenderTwoColumnOptions(options, q.translatedOptions);

                  const visualElements: CompetitiveVisualItem[] = Array.isArray(q.visualElements)
                    ? q.visualElements
                    : [];
                  const isSecondaryShared = Boolean(
                    q.sharedVisualGroupId && q.isPrimarySharedVisualInstance === false
                  );
                  const printedCaptions = new Set<string>();

                  const aboveVisuals = !isSecondaryShared
                    ? visualElements.filter(v => v.position === 'above_question')
                    : [];
                  const belowStemVisuals = !isSecondaryShared
                    ? visualElements.filter(
                        v => !v.position || v.position === 'below_stem' || v.position === 'inline_option'
                      )
                    : [];
                  const belowQuestionVisuals = !isSecondaryShared
                    ? visualElements.filter(v => v.position === 'below_question')
                    : [];

                  const hasRenderedTableImage = belowStemVisuals.some(
                    v =>
                      (v.type === 'table' || v.extractionMethod === 'table_visual_crop') &&
                      Boolean(v.dataUrl || v.publicUrl)
                  );

                  const unprintedEquations = Array.isArray(q.equations)
                    ? q.equations.filter(eq => eq && !cleanedQuestionText?.includes(eq))
                    : [];

                  return (
                    <div
                      key={q.id || qIdx}
                      className="break-inside-avoid mb-6 text-black font-serif break-words [overflow-wrap:anywhere]"
                    >
                      {/* Multi-Question Shared Visual Direction / Reference */}
                      {q.sharedVisualGroupId && (
                        <div className="mb-1.5 text-[11.5px] italic text-neutral-800 bg-neutral-50 border border-neutral-300 px-2.5 py-1">
                          {isSecondaryShared ? (
                            <span>
                              Note: Refer to the shared diagram/table provided above for linked questions (
                              {(q.sharedWithQuestionNumbers || []).join(', ')}).
                            </span>
                          ) : (
                            <span className="font-semibold not-italic">
                              Directions
                              {Array.isArray(q.sharedWithQuestionNumbers) &&
                              q.sharedWithQuestionNumbers.length > 1
                                ? ` (Linked Qs: ${q.sharedWithQuestionNumbers.join(', ')})`
                                : ''}
                              : Study the following visual/data carefully and answer the question(s).
                            </span>
                          )}
                        </div>
                      )}

                      {/* 1. Visuals positioned ABOVE question stem */}
                      {aboveVisuals.length > 0 &&
                        renderVisualElementsBlock(aboveVisuals, qNum, printedCaptions)}

                      {/* 2. Question Text with Number (English) */}
                      <div className="text-justify leading-relaxed break-words [overflow-wrap:anywhere]">
                        <span className="font-bold text-black mr-1.5">{qNum}.</span>
                        <LaTeXText text={cleanedQuestionText} className="inline text-black font-serif" />
                        {marksText && (
                          <span className="text-[11px] font-sans font-semibold text-neutral-700 ml-1.5 inline-block">
                            {marksText}
                          </span>
                        )}
                      </div>

                      {/* Approved Regional Translation (e.g. Marathi / Gujarati) Immediately Below English Question */}
                      {showTranslation && cleanedTranslatedText && (
                        <div className="mt-1.5 text-neutral-900 text-[13px] leading-relaxed border-l-2 border-neutral-500 pl-2.5 py-0.5 bg-neutral-50/40 break-words [overflow-wrap:anywhere]">
                          <span className="font-bold text-neutral-800 mr-1.5">{qNum}.</span>
                          <LaTeXText text={cleanedTranslatedText} className="inline font-serif text-black" />
                        </div>
                      )}

                      {/* 3. Visuals positioned BELOW STEM (Diagrams, Figures, Graphs, Charts, Equation Crops, Table Crops) */}
                      {belowStemVisuals.length > 0 &&
                        renderVisualElementsBlock(belowStemVisuals, qNum, printedCaptions)}

                      {/* Structured Table Data (when not already rendered as a cropped table image) */}
                      {!isSecondaryShared &&
                        !hasRenderedTableImage &&
                        q.tableData &&
                        (q.tableData.headers || q.tableData.rows) && (
                          <div className="my-2 overflow-x-auto break-inside-avoid">
                            {q.tableData.caption && (
                              <div className="text-[11px] font-bold text-neutral-800 mb-1">
                                <LaTeXText text={q.tableData.caption} />
                              </div>
                            )}
                            <table className="w-full border-collapse border border-black text-[11.5px]">
                              {q.tableData.headers && q.tableData.headers.length > 0 && (
                                <thead>
                                  <tr className="bg-neutral-100">
                                    {q.tableData.headers.map((h, hIdx) => (
                                      <th
                                        key={hIdx}
                                        className="border border-black px-2 py-1 text-left font-bold"
                                      >
                                        <LaTeXText text={h} />
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                              )}
                              {q.tableData.rows && q.tableData.rows.length > 0 && (
                                <tbody>
                                  {q.tableData.rows.map((r, rIdx) => (
                                    <tr key={rIdx}>
                                      {r.map((cell, cIdx) => (
                                        <td key={cIdx} className="border border-black px-2 py-1">
                                          <LaTeXText text={cell} />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              )}
                            </table>
                          </div>
                        )}

                      {/* Legacy Diagram SVG or Fallback Image URL when visualElements array is empty */}
                      {visualElements.length === 0 && q.diagramSvg && (
                        <div
                          className="my-2 p-2 border border-neutral-300 bg-white flex justify-center"
                          dangerouslySetInnerHTML={{ __html: q.diagramSvg }}
                        />
                      )}
                      {visualElements.length === 0 && (q.imageUrl || q.diagramUrl) && (
                        <div className="my-2 flex justify-center">
                          <img
                            src={q.imageUrl || q.diagramUrl}
                            alt={`Question ${qNum} Diagram`}
                            className="max-h-52 object-contain border border-neutral-300 p-1"
                          />
                        </div>
                      )}

                      {/* Preserved Mathematical Equations (if extracted separately from stem) */}
                      {unprintedEquations.length > 0 && (
                        <div className="my-1.5 px-2.5 py-1 bg-neutral-50 border border-neutral-200 text-[12px] font-mono text-black">
                          {unprintedEquations.map((eq, eqIdx) => (
                            <div key={eqIdx}>
                              <LaTeXText text={eq} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Sub-questions if present */}
                      {effectiveSubQuestions.length > 0 && (
                        <div className="mt-2 pl-4 space-y-1.5 text-[12.5px]">
                          {effectiveSubQuestions.map((sq, sqIdx) => {
                            if (typeof sq === 'string') {
                              return (
                                <div key={sqIdx}>
                                  <LaTeXText text={cleanDisplayText(sq)} className="inline font-serif text-black" />
                                </div>
                              );
                            }
                            return (
                              <div key={sqIdx} className="space-y-0.5">
                                <div>
                                  <span className="font-bold mr-1.5">
                                    {sq.label || `(${String.fromCharCode(97 + sqIdx)})`}
                                  </span>
                                  <LaTeXText text={cleanDisplayText(sq.text)} className="inline font-serif text-black" />
                                  {sq.marks && (
                                    <span className="text-[10px] font-sans font-semibold text-neutral-600 ml-1">
                                      [{sq.marks}]
                                    </span>
                                  )}
                                </div>
                                {!isOriginalEnglishOnly && sq.translatedText && (
                                  <div className="text-neutral-800 pl-3 border-l border-neutral-300">
                                    <LaTeXText text={cleanDisplayText(sq.translatedText)} className="inline font-serif" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 4. MCQ Options (Preserving Original Numbering & Bilingual Options) */}
                      {options.length > 0 && (
                        <div
                          className={`mt-2 ${
                            isCompactTwoCol
                              ? 'grid grid-cols-2 gap-x-3 gap-y-1.5'
                              : 'space-y-1.5'
                          }`}
                        >
                          {options.map((opt, oIdx) => {
                            const optLabel = formatOptionIndex(oIdx, opt.label);
                            const translatedOpt = q.translatedOptions?.[oIdx];
                            const cleanTransOptText = translatedOpt?.text
                              ? cleanDisplayText(translatedOpt.text)
                              : '';

                            return (
                              <div
                                key={oIdx}
                                className="flex items-start gap-1.5 text-[12.5px] sm:text-[13px] leading-snug break-words [overflow-wrap:anywhere]"
                              >
                                <span className="font-bold text-black shrink-0">{optLabel}</span>
                                <div className="space-y-0.5 min-w-0">
                                  <span className="block">
                                    <LaTeXText text={opt.text} className="inline font-serif text-black" />
                                  </span>
                                  {!isOriginalEnglishOnly &&
                                    (q.translationRequired || paper.enableTranslation) &&
                                    cleanTransOptText &&
                                    cleanTransOptText !== opt.text && (
                                      <span className="block text-[12px] text-neutral-800 font-medium">
                                        <LaTeXText text={cleanTransOptText} className="inline font-serif" />
                                      </span>
                                    )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 5. Visuals positioned BELOW QUESTION */}
                      {belowQuestionVisuals.length > 0 &&
                        renderVisualElementsBlock(belowQuestionVisuals, qNum, printedCaptions)}

                      {/* 6. Remaining Figure/Table Captions not yet printed under a visual */}
                      {Array.isArray(q.captions) &&
                        q.captions
                          .filter(c => c && !printedCaptions.has(c.trim().toLowerCase()))
                          .map((cap, cIdx) => (
                            <div
                              key={cIdx}
                              className="mt-1 text-[11px] italic text-neutral-800 text-center font-serif"
                            >
                              <LaTeXText text={cap.trim()} />
                            </div>
                          ))}
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

