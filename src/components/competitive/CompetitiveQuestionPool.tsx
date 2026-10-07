import React, { useState, useEffect } from 'react';
import { CheckCircle, CheckCircle2, AlertTriangle, Layers, Search, FileText, ArrowRight, ArrowLeft, RefreshCw, Eye, Edit3, X, Check } from 'lucide-react';
import { SubjectRule } from './CompetitiveBlueprintForm';
import { api } from '../../api';

interface ExtractedQuestionItem {
  id: string;
  exam_id: string;
  subject: string;
  question_number?: string;
  question_type: string;
  question_text: string;
  options?: Array<{ label: string; text: string }>;
  subQuestions?: string[];
  marks: number;
  negative_marks: number;
  source_pdf?: string;
  source_page?: number;
  source_question_number?: string;
  verification_status: string;
  hasVisual?: boolean;
  requiresVisual?: boolean;
  visualElements?: Array<{
    id: string;
    type: string;
    extractionMethod?: string;
    sourcePdf?: string;
    sourcePage?: number;
    questionNumber?: string;
    dataUrl?: string;
    publicUrl?: string;
    caption?: string;
    position?: string;
  }>;
  tableData?: {
    headers?: string[];
    rows?: string[][];
    caption?: string;
  } | null;
  equations?: string[];
  captions?: string[];
  sharedVisualGroupId?: string | null;
  visualValidationStatus?: string;
}

interface QuestionPoolProps {
  examId: string;
  subjects: SubjectRule[];
  onBack: () => void;
  onProceed: () => void;
}

export const CompetitiveQuestionPool: React.FC<QuestionPoolProps> = ({
  examId,
  subjects,
  onBack,
  onProceed,
}) => {
  const [questions, setQuestions] = useState<ExtractedQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<ExtractedQuestionItem | null>(null);

  // Load questions from backend
  const loadPoolData = async () => {
    setLoading(true);
    try {
      const resp = await api.competitive.getQuestionPools(examId);
      if (resp && resp.success) {
        setQuestions(resp.questions || []);
      }
    } catch (err) {
      console.error('Failed to load question pools:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPoolData();
  }, [examId]);

  // Group questions by subject
  const questionsBySubject: Record<string, ExtractedQuestionItem[]> = {};
  subjects.forEach(s => {
    questionsBySubject[s.subjectName.toLowerCase()] = [];
  });

  questions.forEach(q => {
    const norm = (q.subject || '').trim().toLowerCase();
    if (!questionsBySubject[norm]) questionsBySubject[norm] = [];
    questionsBySubject[norm].push(q);
  });

  // Filtered list
  const filteredQuestions = questions.filter(q => {
    const matchesSubject =
      selectedSubjectFilter === 'ALL' ||
      (q.subject || '').toLowerCase() === selectedSubjectFilter.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      q.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.source_pdf || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSubject && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Step 4: Real Extracted Question Pools & Verification</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Question-level provenance tracking. Each question and its associated diagrams, tables, figures, symbols, and equations are extracted from your uploaded source PDFs and bound as one atomic question block.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPoolData}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto border border-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Pools</span>
        </button>
      </div>

      {/* Subject Pool Overview Cards (Requirement 11) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {subjects.map(s => {
          const norm = s.subjectName.toLowerCase();
          const inPool = questionsBySubject[norm] || [];
          const count = inPool.length;
          const isSatisfied = count >= s.numberOfQuestions;

          return (
            <div
              key={s.id}
              onClick={() => setSelectedSubjectFilter(s.subjectName)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                selectedSubjectFilter.toLowerCase() === norm
                  ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/10'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider">
                  {s.subjectName}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isSatisfied
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {isSatisfied ? 'Ready' : 'Under Pool'}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-xl font-mono font-black text-slate-900">
                    {count}
                  </span>
                  <span className="text-xs text-slate-500 ml-1">/ {s.numberOfQuestions} req</span>
                </div>
                <span className="text-[11px] text-slate-600 font-medium">
                  {s.marksPerQuestion}M • {s.questionType}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedSubjectFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              selectedSubjectFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            All Subjects ({questions.length})
          </button>
          {subjects.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSubjectFilter(s.subjectName)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                selectedSubjectFilter.toLowerCase() === s.subjectName.toLowerCase()
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {s.subjectName} ({(questionsBySubject[s.subjectName.toLowerCase()] || []).length})
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search questions or source PDFs..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:bg-white"
          />
        </div>
      </div>

      {/* Question Cards (Requirement 10 & 14: Source Provenance + Bound Visuals) */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-600" />
          <p>Loading question pools from database...</p>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="p-12 rounded-xl border border-dashed border-slate-300 text-center space-y-2 bg-white">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h4 className="text-xs font-bold text-slate-800">
            No Extracted Questions in this Subject Pool
          </h4>
          <p className="text-[11px] text-slate-500">
            Please navigate back to Step 3 and upload source PDF question papers for this subject.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((q, idx) => {
            const visuals = Array.isArray(q.visualElements) ? q.visualElements : [];
            const hasTable = Boolean(q.tableData && (q.tableData.headers?.length || q.tableData.rows?.length));
            const hasEquations = Array.isArray(q.equations) && q.equations.length > 0;

            return (
              <div
                key={q.id || idx}
                className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200 text-[11px]">
                      {q.question_number ? `Q.${q.question_number}` : `Question #${idx + 1}`}
                    </span>
                    <span className="px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-700 text-[10px]">
                      {q.subject}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {q.question_type}
                    </span>
                    {visuals.length > 0 && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {visuals.length} Bound Visual{visuals.length > 1 ? 's' : ''} ({visuals.map(v => v.type).join(', ')})
                      </span>
                    )}
                    {hasTable && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                        Table Preserved
                      </span>
                    )}
                    {hasEquations && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                        {q.equations!.length} Equation{q.equations!.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {q.sharedVisualGroupId && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        Shared Visual Group
                      </span>
                    )}
                  </div>

                  {/* Source Traceability Badge (Requirement 14 & 30) */}
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                    <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200">
                      Source: <strong className="text-slate-700">{q.source_pdf || 'Uploaded PDF'}</strong>{' '}
                      {q.source_page ? `• Page ${q.source_page}` : ''}
                      {q.source_question_number ? ` • Orig Q#${q.source_question_number}` : ''}
                    </span>
                    <span className="text-emerald-700 font-bold">
                      +{q.marks || 4}M {q.negative_marks ? `/-${q.negative_marks}M` : ''}
                    </span>
                  </div>
                </div>

                {/* Question Text */}
                <div className="text-xs text-slate-900 font-medium leading-relaxed whitespace-pre-wrap">
                  {q.question_text}
                </div>

                {/* Bound Visual Elements (Diagrams, Figures, Images, Tables, Graphs, Equations) */}
                {visuals.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {visuals.map((vis, vIdx) => {
                      const imgSrc = vis.dataUrl || vis.publicUrl;
                      return (
                        <div
                          key={vis.id || vIdx}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center space-y-1.5"
                        >
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={vis.caption || `Question ${q.question_number || idx + 1} ${vis.type}`}
                              className="max-h-44 w-auto max-w-full object-contain bg-white border border-slate-200 rounded p-1"
                              loading="lazy"
                            />
                          ) : (
                            <div className="text-[11px] text-slate-600 italic py-3">
                              [Preserved {vis.type} • {vis.sourcePdf || q.source_pdf} p.{vis.sourcePage || q.source_page || 1}]
                            </div>
                          )}
                          <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span className="uppercase font-bold text-slate-700">{vis.type}</span>
                            <span>{vis.extractionMethod || 'embedded'}</span>
                          </div>
                          {vis.caption && (
                            <p className="text-[11px] italic text-slate-700 text-center">{vis.caption}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Preserved Structured Table */}
                {hasTable && q.tableData && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left border-collapse text-[11px]">
                      {q.tableData.headers && q.tableData.headers.length > 0 && (
                        <thead className="bg-slate-100 text-slate-800 font-bold">
                          <tr>
                            {q.tableData.headers.map((h, hIdx) => (
                              <th key={hIdx} className="border border-slate-200 px-2.5 py-1">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      {q.tableData.rows && q.tableData.rows.length > 0 && (
                        <tbody>
                          {q.tableData.rows.map((r, rIdx) => (
                            <tr key={rIdx} className="even:bg-slate-50">
                              {r.map((c, cIdx) => (
                                <td key={cIdx} className="border border-slate-200 px-2.5 py-1 text-slate-700">
                                  {c}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      )}
                    </table>
                  </div>
                )}

                {/* MCQ Options */}
                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    {q.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-start gap-2"
                      >
                        <span className="w-5 h-5 rounded-full bg-slate-200 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 text-slate-800">
                          {opt.label}
                        </span>
                        <span className="text-slate-800">{opt.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Upload PDFs</span>
        </button>

        <button
          type="button"
          onClick={onProceed}
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <span>Proceed to Step 5: Validate Blueprint</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

