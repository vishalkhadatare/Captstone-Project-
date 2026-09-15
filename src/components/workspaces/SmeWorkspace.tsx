import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  EyeOff,
  ShieldCheck,
  RotateCcw,
  BookOpen,
  Filter,
} from 'lucide-react';
import { User, Question } from '../../types';
import { api } from '../../api';
import { NavSubTab } from '../Sidebar';
import { AuthorityProctorEnclave } from '../proctor/AuthorityProctorEnclave';

interface SmeWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
}

export const SmeWorkspace: React.FC<SmeWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Verification Form State
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState('');
  const [syllabusAccurate, setSyllabusAccurate] = useState(true);
  const [questionClarity, setQuestionClarity] = useState(true);
  const [filterMode, setFilterMode] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const res = await api.getQuestions();
      const loaded = res.questions || [];
      setQuestions(loaded);
      if (loaded.length > 0) {
        setSelectedQuestion(prev => {
          if (prev && loaded.some(q => q.id === prev.id)) {
            return loaded.find(q => q.id === prev.id) || loaded[0];
          }
          const firstPending = loaded.find(q => q.status === 'UNDER_VERIFICATION' || q.status === 'DRAFT');
          return firstPending || loaded[0];
        });
      } else {
        setSelectedQuestion(null);
      }
    } catch (err: any) {
      console.error('SME load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (status: 'VERIFIED' | 'REJECTED') => {
    if (!selectedQuestion) return;
    setStatusMessage(null);
    setRejectionError(null);

    const trimmedFeedback = feedback.trim();

    // Mandatory rejection reason validation
    if (status === 'REJECTED') {
      if (!trimmedFeedback || trimmedFeedback.length < 5) {
        setRejectionError('Please provide a specific rejection reason (at least 5 characters) explaining what needs revision before rejecting.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const res = await api.verifyQuestion(selectedQuestion.id, {
        decision: status,
        status,
        feedback: trimmedFeedback,
        syllabus_accurate: syllabusAccurate,
        answer_verified: questionClarity,
      });

      const updatedStatus = res.newStatus || (status === 'VERIFIED' ? 'ELIGIBLE_FOR_PAPER' : 'REJECTED');

      // Update local question list immediately
      setQuestions(prev =>
        prev.map(q =>
          q.id === selectedQuestion.id
            ? { ...q, status: updatedStatus }
            : q
        )
      );

      // Update selected question status
      setSelectedQuestion(prev => (prev ? { ...prev, status: updatedStatus } : null));

      setStatusMessage({
        type: 'success',
        text: status === 'VERIFIED'
          ? `Question ${selectedQuestion.id} approved and marked eligible for examination pools.`
          : `Question ${selectedQuestion.id} has been marked as REJECTED with reason recorded.`,
      });

      setFeedback('');
      setRejectionError(null);
      onRefresh();

      // Refresh list to stay in sync
      setTimeout(() => {
        loadQuestions();
      }, 300);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to process question verification.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingQuestions = questions.filter(
    q => q.status === 'UNDER_VERIFICATION' || q.status === 'DRAFT'
  );
  const verifiedQuestions = questions.filter(
    q => q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER'
  );
  const rejectedQuestions = questions.filter(
    q => q.status === 'REJECTED' || q.status === 'COMPROMISED' || q.status === 'QUARANTINED'
  );

  const displayedQuestions = questions.filter(q => {
    if (filterMode === 'PENDING') return q.status === 'UNDER_VERIFICATION' || q.status === 'DRAFT';
    if (filterMode === 'VERIFIED') return q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER';
    if (filterMode === 'REJECTED') return q.status === 'REJECTED' || q.status === 'COMPROMISED' || q.status === 'QUARANTINED';
    return true;
  });

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 shadow-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* SME QUESTION REVIEW WORKSPACE */}
      {(activeSubTab === 'assigned_questions' || activeSubTab === 'question_verification') && (
        <AuthorityProctorEnclave
          currentUser={currentUser}
          workspaceType="SME_QUESTION_VETTING"
          title="SME Question Vetting Enclave"
        >
          <div className="space-y-6">
          {/* Top Metrics Banner */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="border-b pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Subject Matter Expert Console
                </span>
                <h2 className="text-xl font-bold text-slate-900">SME Double-Blind Question Review Portal</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Curriculum vetting, syllabus compliance, and option solvability evaluation. Answer keys are strictly blinded for evaluation integrity.
                </p>
              </div>
            </div>

            {/* 4 Interactive Filter Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Card 1: Total Pool */}
              <button
                type="button"
                onClick={() => setFilterMode('ALL')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  filterMode === 'ALL'
                    ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-700 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:shadow-xs hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-slate-600 font-medium block">Total Pool</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    filterMode === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {filterMode === 'ALL' ? 'Active' : 'Show All'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-slate-900 mt-1 block">{questions.length}</span>
                <span className="text-[10px] text-slate-500 mt-0.5 block font-medium">Click to show all questions</span>
              </button>

              {/* Card 2: Pending Review */}
              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'PENDING' ? 'ALL' : 'PENDING')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  filterMode === 'PENDING'
                    ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-500 shadow-xs'
                    : 'bg-amber-50/60 border-amber-200 hover:bg-amber-100/60 hover:shadow-xs hover:border-amber-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-amber-800 font-medium block">Pending Review</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    filterMode === 'PENDING' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {filterMode === 'PENDING' ? 'Filtering' : 'Filter'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-amber-700 mt-1 block">{pendingQuestions.length}</span>
                <span className="text-[10px] text-amber-700/80 mt-0.5 block font-medium">Click to filter pending</span>
              </button>

              {/* Card 3: Verified & Eligible */}
              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'VERIFIED' ? 'ALL' : 'VERIFIED')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  filterMode === 'VERIFIED'
                    ? 'bg-emerald-100/90 border-emerald-400 ring-2 ring-emerald-500 shadow-xs'
                    : 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100/60 hover:shadow-xs hover:border-emerald-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-emerald-800 font-medium block">Verified & Eligible</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    filterMode === 'VERIFIED' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {filterMode === 'VERIFIED' ? 'Filtering' : 'Filter'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-emerald-700 mt-1 block">{verifiedQuestions.length}</span>
                <span className="text-[10px] text-emerald-700/80 mt-0.5 block font-medium">Click to filter verified</span>
              </button>

              {/* Card 4: Rejected / Needs Revision */}
              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'REJECTED' ? 'ALL' : 'REJECTED')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  filterMode === 'REJECTED'
                    ? 'bg-rose-100/90 border-rose-400 ring-2 ring-rose-500 shadow-xs'
                    : 'bg-rose-50/60 border-rose-200 hover:bg-rose-100/60 hover:shadow-xs hover:border-rose-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-rose-800 font-medium block">Rejected / Needs Revision</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    filterMode === 'REJECTED' ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {filterMode === 'REJECTED' ? 'Filtering' : 'Filter'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-rose-700 mt-1 block">{rejectedQuestions.length}</span>
                <span className="text-[10px] text-rose-700/80 mt-0.5 block font-medium">Click to filter rejected</span>
              </button>
            </div>
          </div>

          {/* Unified Two-Column Review Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Question List Column */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3 lg:col-span-1">
              <div className="flex justify-between items-center border-b pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Questions Queue</h3>
                  {filterMode !== 'ALL' && (
                    <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold ${
                      filterMode === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : filterMode === 'REJECTED'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {filterMode}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {filterMode !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('ALL')}
                      className="text-[10px] text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer underline"
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    {displayedQuestions.length} Items
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading questions queue...</div>
              ) : displayedQuestions.length === 0 ? (
                <p className="text-xs text-slate-400 p-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No questions found under {filterMode.toLowerCase()} filter.
                </p>
              ) : (
                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {displayedQuestions.map(q => (
                    <div
                      key={q.id}
                      onClick={() => {
                        setSelectedQuestion(q);
                        setRejectionError(null);
                      }}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                        selectedQuestion?.id === q.id
                          ? 'bg-emerald-50 border-emerald-400 font-medium text-emerald-950 ring-1 ring-emerald-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-[11px] font-bold text-slate-800">{q.id}</span>
                        <span
                          className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold ${
                            q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER'
                              ? 'bg-emerald-100 text-emerald-800'
                              : q.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {q.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-700 font-semibold">{q.subject} - {q.topic}</div>
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-1">{q.content_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification Inspection Pane */}
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4 lg:col-span-2 text-xs">
              {selectedQuestion ? (
                <div className="space-y-4">
                  <div className="border-b pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">Academic Question Evaluation</h3>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                          <EyeOff className="w-3 h-3 text-slate-500" /> Blind Assessment
                        </span>
                      </div>
                      <p className="text-slate-500 font-mono text-[11px] mt-0.5">
                        ID: {selectedQuestion.id} • {selectedQuestion.subject} • {selectedQuestion.topic}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
                        selectedQuestion.status === 'VERIFIED' || selectedQuestion.status === 'ELIGIBLE_FOR_PAPER'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : selectedQuestion.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      STATUS: {selectedQuestion.status}
                    </span>
                  </div>

                  {/* Question Statement */}
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-slate-700 font-bold">
                      <span>Question Statement:</span>
                      <span className="text-[11px] font-normal text-slate-500">Language: {selectedQuestion.language || 'English'}</span>
                    </div>
                    <p className="text-slate-900 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                      {selectedQuestion.content_text}
                    </p>
                  </div>

                  {/* Options List (Blind Evaluation: No Answer Highlighted) */}
                  {selectedQuestion.options_json && (
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                      <span className="font-bold text-slate-700 block">Candidate Options (A-D):</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(() => {
                          try {
                            const raw = typeof selectedQuestion.options_json === 'string'
                              ? JSON.parse(selectedQuestion.options_json)
                              : selectedQuestion.options_json;
                            const opts = Array.isArray(raw) ? raw : [];
                            if (opts.length > 0) {
                              return opts.map((opt: any, idx: number) => {
                                const optText = typeof opt === 'string'
                                  ? opt
                                  : (opt?.text ?? opt?.value ?? opt?.option ?? JSON.stringify(opt));
                                const optLabel = (typeof opt === 'object' && opt?.label)
                                  ? opt.label
                                  : String.fromCharCode(65 + idx);
                                return (
                                  <div
                                    key={idx}
                                    className="p-2.5 rounded-lg bg-white border border-slate-200 text-slate-800 flex items-start gap-2 shadow-2xs"
                                  >
                                    <span className="font-mono font-bold text-slate-500 shrink-0">
                                      ({optLabel})
                                    </span>
                                    <span className="text-xs leading-normal">{optText}</span>
                                  </div>
                                );
                              });
                            }
                            return null;
                          } catch {
                            return <div className="text-slate-500">Custom descriptive / theory format.</div>;
                          }
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Marks & Syllabus Metrics (Answer Key completely hidden for Double-Blind Integrity) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 text-[11px] block">Target Marks Weightage</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {selectedQuestion.marks} Marks {selectedQuestion.negative_marks ? `(-${selectedQuestion.negative_marks} neg)` : ''}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 text-[11px] block">Estimated Difficulty</span>
                      <span className="font-bold text-slate-900 text-sm">{selectedQuestion.difficulty}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 text-[11px] block">Curriculum Alignment</span>
                      <span className="font-bold text-slate-900 text-sm truncate">{selectedQuestion.syllabus || 'Standard Core'}</span>
                    </div>
                  </div>

                  {/* SME Verification Checklist */}
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>SME Academic Verification Checklist</span>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={syllabusAccurate}
                        onChange={e => setSyllabusAccurate(e.target.checked)}
                        className="rounded text-emerald-800 mt-0.5 shrink-0"
                      />
                      <span className="text-slate-800 font-medium">
                        Question adheres strictly to curriculum standards, syllabus topics, and appropriate target grade difficulty.
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={questionClarity}
                        onChange={e => setQuestionClarity(e.target.checked)}
                        className="rounded text-emerald-800 mt-0.5 shrink-0"
                      />
                      <span className="text-slate-800 font-medium">
                        Question formulation is unambiguous, free of phrasing errors, and has mathematically/factually solvable options.
                      </span>
                    </label>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-slate-700 font-bold">
                          SME Review Notes / Rejection Reason
                        </label>
                        <span className="text-[10px] text-rose-600 font-semibold">
                          * Mandatory if rejecting question
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={feedback}
                        onChange={e => {
                          setFeedback(e.target.value);
                          if (rejectionError) setRejectionError(null);
                        }}
                        placeholder="Required when rejecting: Specify syllabus discrepancies, phrasing flaws, or inaccuracies..."
                        className={`w-full px-3 py-2 rounded-lg bg-white border ${
                          rejectionError ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-300'
                        } text-slate-900 placeholder:text-slate-400 focus:outline-emerald-600 text-xs`}
                      />
                      {rejectionError && (
                        <div className="mt-1.5 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                          <span>{rejectionError}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleVerify('VERIFIED')}
                        className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{submitting ? 'Processing...' : 'Approve & Verify Question'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleVerify('REJECTED')}
                        className="px-4 py-2.5 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>{submitting ? 'Processing...' : 'Reject Question'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFeedback('');
                          setRejectionError(null);
                          setSyllabusAccurate(true);
                          setQuestionClarity(true);
                        }}
                        className="px-3 py-2 text-slate-600 hover:text-slate-900 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset Inputs
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
                  <p>Select a question from the left queue to inspect and verify.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </AuthorityProctorEnclave>
    )}

      {/* VERIFICATION HISTORY */}
      {activeSubTab === 'verification_history' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="border-b pb-3">
            <h3 className="text-base font-bold text-slate-900">SME Evaluation History Ledger</h3>
            <p className="text-xs text-slate-500">
              Audit record of all academic questions reviewed, approved, or rejected under double-blind examination security.
            </p>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {questions.filter(q => q.status !== 'DRAFT' && q.status !== 'UNDER_VERIFICATION').length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center bg-slate-50 rounded-lg border border-dashed">
                No completed verifications or rejections recorded yet.
              </p>
            ) : (
              questions
                .filter(q => q.status !== 'DRAFT' && q.status !== 'UNDER_VERIFICATION')
                .map(q => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <span className="font-mono text-emerald-800">{q.id}</span>
                        <span>•</span>
                        <span>{q.subject}</span>
                        <span className="text-slate-400 font-normal">({q.topic})</span>
                      </div>
                      <p className="text-slate-600 line-clamp-1 mt-0.5">{q.content_text}</p>
                      <div className="text-[10px] text-slate-500 mt-1 font-mono">
                        Difficulty: {q.difficulty} • Marks: {q.marks} • Syllabus: {q.syllabus}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded text-[10px] font-bold shrink-0 uppercase ${
                        q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {q.status}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
