import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  Examination,
  Question,
  User,
  ExamCategory,
  ExamType,
  QuestionStatus,
} from '../types';
import {
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Sparkles,
  Bot,
  BrainCircuit,
  Filter,
  RefreshCw,
  Send,
  ShieldCheck,
  Building,
} from 'lucide-react';

interface ExamModuleProps {
  currentUser: User | null;
  onRefresh: () => void;
}

export const ExaminationModule: React.FC<ExamModuleProps> = ({ currentUser, onRefresh }) => {
  const [exams, setExams] = useState<Examination[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSubTab, setActiveSubTab] = useState<'exams' | 'questions' | 'sme_tasks' | 'ai_pattern'>('exams');
  const [selectedExam, setSelectedExam] = useState<Examination | null>(null);

  // Forms
  const [showExamModal, setShowExamModal] = useState(false);
  const [examForm, setExamForm] = useState({
    name: 'National Computer Science & Cryptography Entrance Examination 2026',
    subject: 'Computer Science & Information Security',
    category: 'University Exam' as ExamCategory,
    exam_type: 'MCQ' as ExamType,
    exam_date: '2026-08-25',
    exam_time: '10:00 AM',
    unlock_time: '2026-08-25T09:30:00.000Z',
    total_marks: 100,
    total_questions: 20,
    duration_minutes: 180,
  });

  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionForm, setQuestionForm] = useState({
    subject: 'Computer Science & Information Security',
    topic: 'Applied Cryptography & Hash Functions',
    difficulty: 'HARD' as 'EASY' | 'MEDIUM' | 'HARD',
    marks: 4,
    negative_marks: 1,
    correct_answer: 'Option C',
    language: 'English',
    syllabus: 'Unit 4: Public Key Cryptography & SHA-256',
    question_type: 'MCQ' as 'MCQ' | 'THEORY',
    content_text: 'In AES-256-GCM authenticated encryption, what is the exact function of the Galois Authentication Tag (GMAC)?',
    option_a: 'It compresses the plaintext before AES block transformation',
    option_b: 'It generates the initial public-private keypair for the symmetric session',
    option_c: 'It provides cryptographic integrity and authenticity assurance for both ciphertext and associated data',
    option_d: 'It acts as an external pseudo-random padding mechanism',
  });

  // SME Verification Form
  const [verificationFeedback, setVerificationFeedback] = useState<{ [qId: string]: { status: 'VERIFIED' | 'REJECTED' | 'QUARANTINED'; remarks: string; corrections: string } }>({});

  // AI Tools
  const [aiSimilarityCandidate, setAiSimilarityCandidate] = useState('');
  const [aiSimilarityResult, setAiSimilarityResult] = useState<any | null>(null);
  const [similarityLoading, setSimilarityLoading] = useState(false);

  // AI Pattern Analyzer
  const [patternSampleText, setPatternSampleText] = useState(`PART A: 10 Compulsory Multiple Choice Questions (2 marks each = 20 marks).
PART B: 5 Short Analytical Questions (Answer any 4, 10 marks each = 40 marks).
PART C: 2 Comprehensive System Design Case Studies (Answer any 1, 40 marks).
Total Marks: 100.`);
  const [aiPatternResult, setAiPatternResult] = useState<any | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);

  const [filterTopic, setFilterTopic] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [examRes, qRes, membersRes] = await Promise.all([
        api.getExaminations(),
        api.getQuestions(),
        api.getOrgMembers(),
      ]);

      setExams(examRes.examinations || []);
      setQuestions(qRes.questions || []);
      setMembers(membersRes.members || []);
      if (examRes.examinations && examRes.examinations.length > 0 && !selectedExam) {
        setSelectedExam(examRes.examinations[0]);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createExamination(examForm);
      setActionMessage({ type: 'success', text: res.message });
      setShowExamModal(false);
      loadData();
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        ...questionForm,
      };
      if (questionForm.question_type === 'MCQ') {
        payload.options_json = JSON.stringify([
          { label: 'Option A', text: questionForm.option_a },
          { label: 'Option B', text: questionForm.option_b },
          { label: 'Option C', text: questionForm.option_c },
          { label: 'Option D', text: questionForm.option_d },
        ]);
      }

      const res = await api.createQuestion(payload);
      setActionMessage({ type: 'success', text: res.message });
      setShowQuestionModal(false);
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleAssignSme = async (questionId: string, smeId: string) => {
    try {
      const res = await api.assignQuestion(questionId, smeId);
      setActionMessage({ type: 'success', text: res.message });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleVerifyQuestion = async (questionId: string) => {
    const feedback = verificationFeedback[questionId] || { status: 'VERIFIED', remarks: 'Mathematically verified syllabus compliance and correct key.', corrections: '' };
    try {
      const res = await api.verifyQuestion(questionId, {
        status: feedback.status,
        remarks: feedback.remarks,
        corrections: feedback.corrections,
      });
      setActionMessage({ type: 'success', text: res.message });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleRunAiSimilarity = async () => {
    if (!aiSimilarityCandidate) return;
    setSimilarityLoading(true);
    try {
      const res = await api.checkAiSimilarity(aiSimilarityCandidate);
      setAiSimilarityResult(res.result);
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setSimilarityLoading(false);
    }
  };

  const handleAnalyzePattern = async () => {
    if (!selectedExam) return;
    setPatternLoading(true);
    try {
      const res = await api.analyzeTheoryPattern(selectedExam.id, patternSampleText);
      setAiPatternResult(res.pattern);
      setActionMessage({ type: 'success', text: 'Theory pattern extracted using Gemini AI' });
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setPatternLoading(false);
    }
  };

  const handleConfirmPattern = async () => {
    if (!selectedExam || !aiPatternResult) return;
    try {
      const res = await api.confirmPattern(selectedExam.id, {
        pattern_data: aiPatternResult,
      });
      setActionMessage({ type: 'success', text: res.message });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const smeMembers = members.filter(m => m.role === 'SME' || m.role === 'ORG_OWNER');

  const filteredQuestions = questions.filter(q => {
    if (filterTopic && !q.topic.toLowerCase().includes(filterTopic.toLowerCase()) && !q.content_text.toLowerCase().includes(filterTopic.toLowerCase())) {
      return false;
    }
    if (filterStatus !== 'ALL' && q.status !== filterStatus) {
      return false;
    }
    return true;
  });

  const verifiedEligibleCount = questions.filter(q => q.status === 'ELIGIBLE_FOR_PAPER' || q.status === 'VERIFIED').length;

  return (
    <div className="space-y-6">
      {/* Top Academic Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-serif">
            2. Examination Management & Question Pool
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure examination schedules, syllabus blueprints, MCQ/Theory pools, SME peer verification, and AI question similarity analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          {(currentUser?.role === 'EXAM_MANAGER' || currentUser?.role === 'ORG_OWNER') && (
            <button
              onClick={() => setShowExamModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-900/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Examination</span>
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs font-bold px-1.5 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveSubTab('exams')}
          className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'exams'
              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Examinations ({exams.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('questions')}
          className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'questions'
              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Question Pool ({questions.length})</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px]">
            {verifiedEligibleCount} Ready
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('sme_tasks')}
          className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'sme_tasks'
              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
          }`}
        >
          <BrainCircuit className="w-3.5 h-3.5" />
          <span>SME Verification Console</span>
        </button>

        <button
          onClick={() => setActiveSubTab('ai_pattern')}
          className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'ai_pattern'
              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>AI Pattern Analyzer</span>
        </button>
      </div>

      {/* SUB-VIEW 1: EXAMINATIONS TABLE */}
      {activeSubTab === 'exams' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Active Examination Records
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Section 20: Examinations with categories (NEET, JEE, CET, University, Custom) and immutable unlock release timestamps.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exams.length === 0 ? (
                <div className="col-span-2 py-10 text-center text-slate-400 space-y-3">
                  <p className="text-xs">No examinations created yet.</p>
                  <button
                    onClick={() => setShowExamModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
                  >
                    Create First Examination
                  </button>
                </div>
              ) : (
                exams.map(exam => (
                  <div
                    key={exam.id}
                    onClick={() => setSelectedExam(exam)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedExam?.id === exam.id
                        ? 'bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 uppercase">
                        {exam.category}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {exam.status}
                      </span>
                    </div>

                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1 mb-1">
                      {exam.name}
                    </h3>
                    <div className="text-xs text-indigo-400 font-medium mb-3">
                      Subject: {exam.subject} ({exam.exam_type})
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg">
                      <div>Date: <span className="text-white font-medium">{exam.exam_date}</span></div>
                      <div>Duration: <span className="text-white font-medium">{exam.duration_minutes} Mins</span></div>
                      <div>Marks: <span className="text-white font-medium">{exam.total_marks}</span></div>
                      <div>Questions: <span className="text-white font-medium">{exam.total_questions}</span></div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                      <div className="text-amber-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Unlock: {new Date(exam.unlock_time).toLocaleString()}</span>
                      </div>
                      <span className="font-mono text-slate-500">{exam.id.substring(0, 12)}...</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: QUESTION POOL REPOSITORY */}
      {activeSubTab === 'questions' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-500" />
                  Secure Question Pool Repository (Section 22)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage syllabus items, marks, difficulty, options, and status. Only verified questions are eligible for final paper generation.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowQuestionModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 text-xs">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search questions by topic, content text, or syllabus..."
                  value={filterTopic}
                  onChange={e => setFilterTopic(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Statuses ({questions.length})</option>
                <option value="ELIGIBLE_FOR_PAPER">Eligible For Paper</option>
                <option value="VERIFIED">Verified</option>
                <option value="UNDER_VERIFICATION">Under Verification</option>
                <option value="DRAFT">Draft</option>
                <option value="QUARANTINED">Quarantined / Compromised</option>
              </select>
            </div>

            {/* AI Duplicate Checker Utility */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  AI Question Duplicate & Similarity Detector (Section 29)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Check potential new question text against all active questions in the database to prevent duplicate or highly similar content.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type or paste question to check similarity..."
                  value={aiSimilarityCandidate}
                  onChange={e => setAiSimilarityCandidate(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-white"
                />
                <button
                  onClick={handleRunAiSimilarity}
                  disabled={similarityLoading || !aiSimilarityCandidate}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {similarityLoading ? 'Checking...' : 'Run AI Check'}
                </button>
              </div>

              {aiSimilarityResult && (
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Analysis Result:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      aiSimilarityResult.is_duplicate_or_too_similar
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}>
                      {aiSimilarityResult.is_duplicate_or_too_similar ? 'DUPLICATE DETECTED' : 'UNIQUE QUESTION'}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{aiSimilarityResult.analysis}</p>
                </div>
              )}
            </div>

            {/* Questions List */}
            <div className="space-y-3">
              {filteredQuestions.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-400">No questions match the current filters.</p>
              ) : (
                filteredQuestions.map((q, idx) => {
                  let options: any[] = [];
                  if (q.options_json) {
                    try {
                      options = JSON.parse(q.options_json);
                    } catch {
                      options = [];
                    }
                  }

                  return (
                    <div
                      key={q.id}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-400">#{idx + 1}</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{q.topic}</span>
                          <span className="text-slate-500">({q.syllabus})</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            q.difficulty === 'HARD'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : q.difficulty === 'MEDIUM'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {q.difficulty}
                          </span>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            q.status === 'ELIGIBLE_FOR_PAPER' || q.status === 'VERIFIED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : q.status === 'UNDER_VERIFICATION'
                              ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                              : q.status === 'QUARANTINED'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {q.status}
                          </span>

                          <span className="font-mono text-[10px] text-slate-400">
                            +{q.marks} / -{q.negative_marks}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                        {q.content_text}
                      </p>

                      {options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                          {options.map((opt: any, oIdx: number) => (
                            <div
                              key={oIdx}
                              className={`p-2 rounded-lg border ${
                                opt.label === q.correct_answer
                                  ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300 font-medium'
                                  : 'bg-slate-900/50 border-slate-800 text-slate-400'
                              }`}
                            >
                              <span className="font-bold mr-1.5">{opt.label}:</span>
                              <span>{opt.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* SME Assignment Controls */}
                      {currentUser?.role === 'EXAM_MANAGER' && q.status === 'DRAFT' && (
                        <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 text-[11px]">
                          <span className="text-slate-400">Assign to Subject Matter Expert:</span>
                          <div className="flex items-center gap-2">
                            <select
                              id={`sme-select-${q.id}`}
                              className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                            >
                              {smeMembers.map(s => (
                                <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const select = document.getElementById(`sme-select-${q.id}`) as HTMLSelectElement;
                                if (select) handleAssignSme(q.id, select.value);
                              }}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
                            >
                              Assign
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: SME VERIFICATION CONSOLE */}
      {activeSubTab === 'sme_tasks' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-indigo-500" />
                Subject Matter Expert (SME) Verification Console (Section 27)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                SME reviews assigned questions, verifies scientific/academic accuracy, confirms syllabus mapping, checks answer keys, and approves for inclusion.
              </p>
            </div>

            <div className="space-y-4">
              {questions.filter(q => q.status === 'UNDER_VERIFICATION' || q.status === 'DRAFT').length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p>All questions are currently verified and eligible for paper generation.</p>
                </div>
              ) : (
                questions
                  .filter(q => q.status === 'UNDER_VERIFICATION' || q.status === 'DRAFT')
                  .map(q => (
                    <div key={q.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-white">{q.topic}</span>
                          <span className="text-slate-400 ml-2">({q.subject} - {q.syllabus})</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                          {q.status}
                        </span>
                      </div>

                      <p className="text-slate-200 font-medium bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                        {q.content_text}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Verification remarks / Academic justification"
                          value={verificationFeedback[q.id]?.remarks || ''}
                          onChange={e =>
                            setVerificationFeedback({
                              ...verificationFeedback,
                              [q.id]: {
                                ...(verificationFeedback[q.id] || { status: 'VERIFIED', corrections: '' }),
                                remarks: e.target.value,
                              },
                            })
                          }
                          className="sm:col-span-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                        />

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setVerificationFeedback({
                                ...verificationFeedback,
                                [q.id]: {
                                  ...(verificationFeedback[q.id] || { remarks: 'Verified compliant', corrections: '' }),
                                  status: 'VERIFIED',
                                },
                              });
                              handleVerifyQuestion(q.id);
                            }}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center justify-center gap-1 text-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve & Verify</span>
                          </button>

                          <button
                            onClick={() => {
                              setVerificationFeedback({
                                ...verificationFeedback,
                                [q.id]: {
                                  ...(verificationFeedback[q.id] || { remarks: 'Rejected due to syllabus mismatch', corrections: '' }),
                                  status: 'REJECTED',
                                },
                              });
                              handleVerifyQuestion(q.id);
                            }}
                            className="py-1.5 px-3 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg font-semibold text-xs"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: AI THEORY PATTERN ANALYZER */}
      {activeSubTab === 'ai_pattern' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Theory Exam Pattern Analyzer & Manager Confirmation (Section 24 & 25)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI analyzes previous reference papers/syllabus guidelines to extract section breakdowns, optional choices, and mark allocations. Examination Manager confirms or modifies before locking.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3 text-xs">
                <label className="block text-slate-400 font-semibold uppercase text-[10px]">
                  Sample Exam Guideline / Syllabus Reference Text
                </label>
                <textarea
                  rows={8}
                  value={patternSampleText}
                  onChange={e => setPatternSampleText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                />

                <button
                  onClick={handleAnalyzePattern}
                  disabled={patternLoading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-md"
                >
                  <Bot className="w-4 h-4" />
                  <span>{patternLoading ? 'Analyzing Structure...' : 'Extract Blueprint with Gemini AI'}</span>
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <label className="block text-slate-400 font-semibold uppercase text-[10px]">
                  AI Extracted Blueprint & Manager Confirmation
                </label>

                {!aiPatternResult ? (
                  <div className="h-48 rounded-xl bg-slate-950 border border-slate-800 p-4 flex items-center justify-center text-slate-500 text-center">
                    Click 'Extract Blueprint' to run the AI pattern structural breakdown.
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-400">Extracted Pattern Scheme:</span>
                      <span className="font-mono text-[10px] text-slate-400">Total Marks: {aiPatternResult.totalMarks || 100}</span>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {aiPatternResult.sections?.map((sec: any, idx: number) => (
                        <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800">
                          <div className="font-semibold text-white">{sec.sectionName}</div>
                          <div className="text-[11px] text-slate-400">
                            {sec.questionCount} Questions × {sec.marksPerQuestion} Marks (Choice: {sec.optionalChoice})
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800 pt-2">
                      Guideline Note: {aiPatternResult.guidelines}
                    </p>

                    <button
                      onClick={handleConfirmPattern}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm & Lock Exam Blueprint</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Examination Modal */}
      {showExamModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-serif">
                Create Examination Blueprint (Section 20 & 21)
              </h2>
              <button onClick={() => setShowExamModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateExam} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Examination Title</label>
                <input
                  type="text"
                  value={examForm.name}
                  onChange={e => setExamForm({ ...examForm, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Subject</label>
                  <input
                    type="text"
                    value={examForm.subject}
                    onChange={e => setExamForm({ ...examForm, subject: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Exam Category</label>
                  <select
                    value={examForm.category}
                    onChange={e => setExamForm({ ...examForm, category: e.target.value as ExamCategory })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="NEET">NEET Examination</option>
                    <option value="JEE">JEE Examination</option>
                    <option value="Competitive Exam">Competitive Exam</option>
                    <option value="TCET / CET-type Exam">TCET / CET-type Exam</option>
                    <option value="University Exam">University Examination</option>
                    <option value="Custom Exam">Custom Examination</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Format Type</label>
                  <select
                    value={examForm.exam_type}
                    onChange={e => setExamForm({ ...examForm, exam_type: e.target.value as ExamType })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="MCQ">Multiple Choice Questions (MCQ)</option>
                    <option value="THEORY">Theory / Descriptive Format</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Exam Date</label>
                  <input
                    type="date"
                    value={examForm.exam_date}
                    onChange={e => setExamForm({ ...examForm, exam_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={examForm.total_marks}
                    onChange={e => setExamForm({ ...examForm, total_marks: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Total Questions Needed</label>
                  <input
                    type="number"
                    value={examForm.total_questions}
                    onChange={e => setExamForm({ ...examForm, total_questions: parseInt(e.target.value) || 20 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-400 font-semibold mb-1">Time Lock Release UTC (ISO Timestamp)</label>
                  <input
                    type="text"
                    value={examForm.unlock_time}
                    onChange={e => setExamForm({ ...examForm, unlock_time: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExamModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold shadow-md"
                >
                  Save & Initialize Exam
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-serif">
                Add Question to Secure Repository (Section 22)
              </h2>
              <button onClick={() => setShowQuestionModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Subject</label>
                  <input
                    type="text"
                    value={questionForm.subject}
                    onChange={e => setQuestionForm({ ...questionForm, subject: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Topic</label>
                  <input
                    type="text"
                    value={questionForm.topic}
                    onChange={e => setQuestionForm({ ...questionForm, topic: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Difficulty Level</label>
                  <select
                    value={questionForm.difficulty}
                    onChange={e => setQuestionForm({ ...questionForm, difficulty: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="EASY">EASY (Foundational)</option>
                    <option value="MEDIUM">MEDIUM (Standard Analytical)</option>
                    <option value="HARD">HARD (Advanced Complex)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Syllabus Reference</label>
                  <input
                    type="text"
                    value={questionForm.syllabus}
                    onChange={e => setQuestionForm({ ...questionForm, syllabus: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Question Text</label>
                <textarea
                  rows={3}
                  value={questionForm.content_text}
                  onChange={e => setQuestionForm({ ...questionForm, content_text: e.target.value })}
                  required
                  className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Options for MCQ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Option A</label>
                  <input
                    type="text"
                    value={questionForm.option_a}
                    onChange={e => setQuestionForm({ ...questionForm, option_a: e.target.value })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Option B</label>
                  <input
                    type="text"
                    value={questionForm.option_b}
                    onChange={e => setQuestionForm({ ...questionForm, option_b: e.target.value })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Option C</label>
                  <input
                    type="text"
                    value={questionForm.option_c}
                    onChange={e => setQuestionForm({ ...questionForm, option_c: e.target.value })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Option D</label>
                  <input
                    type="text"
                    value={questionForm.option_d}
                    onChange={e => setQuestionForm({ ...questionForm, option_d: e.target.value })}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Correct Answer Key</label>
                  <select
                    value={questionForm.correct_answer}
                    onChange={e => setQuestionForm({ ...questionForm, correct_answer: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="Option A">Option A</option>
                    <option value="Option B">Option B</option>
                    <option value="Option C">Option C</option>
                    <option value="Option D">Option D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Marks Allotted</label>
                  <input
                    type="number"
                    value={questionForm.marks}
                    onChange={e => setQuestionForm({ ...questionForm, marks: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Negative Marks</label>
                  <input
                    type="number"
                    value={questionForm.negative_marks}
                    onChange={e => setQuestionForm({ ...questionForm, negative_marks: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold shadow-md"
                >
                  Deposit to Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
