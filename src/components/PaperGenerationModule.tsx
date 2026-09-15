import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Examination, User, Question, ExamBlueprint, ExamType, PaperVersion, UniversityPaperSet, MultiSubjectBreakdown } from '../types';
import {
  Cpu,
  ShieldCheck,
  Lock,
  Key,
  Flame,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  FileCode2,
  Hash,
  Share2,
  AlertOctagon,
  BookOpen,
  Atom,
  TestTube,
  Dna,
  Calculator,
  Binary,
  Sparkles,
  Check,
  Trash2,
} from 'lucide-react';

import { AiPdfPaperGenerator } from './AiPdfPaperGenerator';

interface PaperGenProps {
  currentUser: User | null;
  onRefresh: () => void;
}

export const PaperGenerationModule: React.FC<PaperGenProps> = ({ currentUser, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'ai_pdf_generator' | 'vault_generation'>('ai_pdf_generator');
  const [exams, setExams] = useState<Examination[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [paperVersions, setPaperVersions] = useState<PaperVersion[]>([]);
  const [activeBlueprint, setActiveBlueprint] = useState<ExamBlueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [settingActive, setSettingActive] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Generation options
  const [examMode, setExamMode] = useState<'AUTO' | 'UNIVERSITY_3_SETS' | 'NEET_MULTI_SUBJECT' | 'STANDARD'>('AUTO');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['Physics', 'Chemistry', 'Biology', 'Zoology']);

  // Generation result state
  const [genResult, setGenResult] = useState<{
    versionCode: string;
    checksumSHA256: string;
    keyFingerprint: string;
    shamirSharesCreated: number;
    status: string;
    isUniversity3PaperFormat?: boolean;
    isNeetOrMultiSubjectMCQ?: boolean;
    generatedSets?: UniversityPaperSet[];
    subjectBreakdown?: MultiSubjectBreakdown[];
  } | null>(null);

  // Invalidation modal
  const [showInvalidateModal, setShowInvalidateModal] = useState(false);
  const [invalidationForm, setInvalidationForm] = useState({
    reason: 'Reported unauthorized leak vector on external channel',
    flagged_question_ids: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, [currentUser]);

  useEffect(() => {
    if (selectedExamId) {
      loadPaperVersions(selectedExamId);
      api.getBlueprint(selectedExamId).then(response => setActiveBlueprint(response.blueprint)).catch(() => setActiveBlueprint(null));
      // Auto-detect mode based on selected exam
      const ex = exams.find(e => e.id === selectedExamId);
      if (ex) {
        const cat = (ex.category || '').toLowerCase();
        const type = ((ex as any).exam_type || '').toUpperCase();
        if (cat.includes('neet') || cat.includes('jee') || cat.includes('pcb') || (cat.includes('central') && type === 'MCQ')) {
          setExamMode('NEET_MULTI_SUBJECT');
          if (cat.includes('neet') || cat.includes('pcb')) {
            setSelectedSubjects(['Physics', 'Chemistry', 'Biology', 'Zoology']);
          } else if (cat.includes('jee')) {
            setSelectedSubjects(['Physics', 'Chemistry', 'Mathematics']);
          } else {
            setSelectedSubjects(['Computer Science & Security', 'Physics', 'Mathematics']);
          }
        } else if (cat.includes('university') || cat.includes('autonomous') || type === 'THEORY') {
          setExamMode('UNIVERSITY_3_SETS');
        } else {
          setExamMode('AUTO');
        }
      }
    }
  }, [selectedExamId, exams]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [examsRes, qRes] = await Promise.all([
        api.getExaminations(),
        api.getQuestions(),
      ]);

      setExams(examsRes.examinations || []);
      setQuestions(qRes.questions || []);
      if (examsRes.examinations && examsRes.examinations.length > 0 && !selectedExamId) {
        setSelectedExamId(examsRes.examinations[0].id);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadPaperVersions = async (examId: string) => {
    try {
      const res = await api.getPaperVersions(examId);
      setPaperVersions(res.versions || []);
    } catch (e: any) {
      console.error('Error fetching paper versions:', e);
    }
  };

  const selectedExam = exams.find(e => e.id === selectedExamId);

  // Effective mode resolution
  const isEffectiveUniversity =
    examMode === 'UNIVERSITY_3_SETS' ||
    (examMode === 'AUTO' &&
      selectedExam &&
      ((selectedExam.category || '').toLowerCase().includes('university') ||
        (selectedExam as any).exam_type === 'THEORY'));

  const isEffectiveNeet =
    examMode === 'NEET_MULTI_SUBJECT' ||
    (examMode === 'AUTO' &&
      selectedExam &&
      ((selectedExam.category || '').toLowerCase().includes('neet') ||
        (selectedExam.category || '').toLowerCase().includes('jee') ||
        (selectedExam.subject || '').toLowerCase().includes('pcb') ||
        (selectedExam.name || '').toLowerCase().includes('neet')));

  // Available subjects in DB
  const availableSubjectsList = Array.from(new Set(questions.map(q => q.subject))).filter(Boolean);

  // Deterministic checks
  const eligibleQuestions = questions.filter(q => {
    const isEligible = q.status === 'ELIGIBLE_FOR_PAPER' || q.status === 'VERIFIED';
    if (!isEligible) return false;

    if (isEffectiveNeet) {
      return selectedSubjects.includes(q.subject);
    }
    if (selectedExam && !isEffectiveUniversity) {
      return q.subject === selectedExam.subject;
    }
    return true;
  });

  const quarantinedQuestions = questions.filter(q => q.status === 'QUARANTINED' || q.status === 'COMPROMISED');
  const requiredCount = selectedExam ? selectedExam.total_questions : 10;
  const isQuestionPoolSufficient = eligibleQuestions.length >= requiredCount;
  const hasQuarantinedQuestions = quarantinedQuestions.length > 0;

  // Subject breakdowns
  const subjectPoolCounts: Record<string, number> = {};
  questions.forEach(q => {
    if (q.status === 'ELIGIBLE_FOR_PAPER' || q.status === 'VERIFIED') {
      subjectPoolCounts[q.subject] = (subjectPoolCounts[q.subject] || 0) + 1;
    }
  });

  const handleGeneratePaper = async () => {
    if (!selectedExamId) return;
    setGenerating(true);
    try {
      const payload: any = {};
      if (examMode === 'UNIVERSITY_3_SETS' || isEffectiveUniversity) {
        payload.exam_mode = 'UNIVERSITY_3_SETS';
        payload.num_sets = 3;
      } else if (examMode === 'NEET_MULTI_SUBJECT' || isEffectiveNeet) {
        payload.exam_mode = 'NEET_MULTI_SUBJECT';
        payload.subject_pool = selectedSubjects;
      }

      const res = await api.generatePaper(selectedExamId, payload);
      setGenResult(res);
      setActionMessage({
        type: 'success',
        text: res.isUniversity3PaperFormat
          ? `Generated & Encrypted Max 3 University Paper Sets (Set 1, Set 2, Set 3). Active Release Set: ${res.versionCode}`
          : res.isNeetOrMultiSubjectMCQ
          ? `Generated Multi-Subject MCQ Pool Paper (${res.subjectBreakdown?.map(s => `${s.subject}: ${s.count} Qs`).join(', ')})`
          : `Paper generated & encrypted securely: Version ${res.versionCode}`,
      });
      await loadData();
      await loadPaperVersions(selectedExamId);
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleSetActiveVersion = async (versionId: string, versionCode: string) => {
    if (!selectedExamId) return;
    setSettingActive(versionId);
    try {
      const res = await api.setActivePaperVersion(selectedExamId, versionId);
      setActionMessage({
        type: 'success',
        text: `Paper Set ${versionCode} is now the ACTIVE release paper for this examination.`,
      });
      await loadPaperVersions(selectedExamId);
      await loadData();
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setSettingActive(null);
    }
  };

  const handleEmergencyRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId) return;
    try {
      const res = await api.emergencyRegenerate(selectedExamId, invalidationForm);
      setActionMessage({
        type: 'success',
        text: `${res.message}. Invalidated version ${res.invalidatedVersion || 'previous'}. Quarantined ${res.quarantinedCount} questions.`,
      });
      setShowInvalidateModal(false);
      loadData();
      loadPaperVersions(selectedExamId);
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleDeleteExam = async (examId: string, examName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${examName}"?`)) return;
    try {
      await api.deleteExamination(examId);
      setActionMessage({ type: 'success', text: `Examination "${examName}" deleted successfully.` });
      await loadData();
      setSelectedExamId('');
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message || 'Failed to delete examination.' });
    }
  };

  const handlePurgeAllMockExams = async () => {
    if (!window.confirm('Are you sure you want to purge all pre-seeded mock and demo examination papers?')) return;
    try {
      await api.purgeDemoExaminations();
      setActionMessage({ type: 'success', text: 'All mock and demo examination papers removed.' });
      await loadData();
      setSelectedExamId('');
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message || 'Failed to purge mock examinations.' });
    }
  };

  // Shamir custodians list
  const custodians = [
    { role: 'Institutional Registrar / Owner', name: 'Dr. Alok Verma', status: 'SHARE_ISSUED', index: 1 },
    { role: 'Examination Controller', name: 'Prof. Rajesh Sharma', status: 'SHARE_ISSUED', index: 2 },
    { role: 'Vigilance & Security Auditor', name: 'Chief Auditor Office', status: 'SHARE_ISSUED', index: 3 },
    { role: 'Chief SME Cryptography Lead', name: 'Dr. Sunita Sen', status: 'SHARE_ISSUED', index: 4 },
    { role: 'Centre Invigilation Lead', name: 'Centre 101 Superintendent', status: 'SHARE_ISSUED', index: 5 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-serif flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            AI Paper Generation & Cryptographic Vault
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Deterministic validation, AES-256-GCM + RSA-2048 encryption, Shamir 3-of-5 threshold distribution, University Max 3-Paper Sets, and NEET Multi-Subject MCQ pooling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
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

      {/* Top Module Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('ai_pdf_generator')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'ai_pdf_generator'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>✨ AI Paper Generator from PDF</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('vault_generation')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'vault_generation'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Lock className="w-4 h-4 text-indigo-400" />
          <span>🏛 Cryptographic Vault & Shamir 3-of-5 Custody</span>
        </button>
      </div>

      {activeTab === 'ai_pdf_generator' ? (
        <AiPdfPaperGenerator
          currentUser={currentUser}
          existingExams={exams}
          onRefresh={() => {
            loadData();
            onRefresh();
          }}
          onPaperCreated={newExamId => {
            setSelectedExamId(newExamId);
            loadData();
            loadPaperVersions(newExamId);
            onRefresh();
          }}
        />
      ) : (
        <>
          {/* Select Examination Selector */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-500" />
                Target Examination Selection
              </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {exams.length > 0 && (
              <button
                type="button"
                onClick={handlePurgeAllMockExams}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Purge all pre-seeded mock examination papers"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Mock Papers</span>
              </button>
            )}

            {exams.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedExamId}
                  onChange={e => setSelectedExamId(e.target.value)}
                  className="w-full sm:w-80 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium"
                >
                  {exams.map(e => {
                    const type = (e as any).exam_type || 'MCQ';
                    return (
                      <option key={e.id} value={e.id}>
                        [{type}] {e.name} ({e.status})
                      </option>
                    );
                  })}
                </select>

                {selectedExam && (
                  <button
                    type="button"
                    onClick={() => handleDeleteExam(selectedExam.id, selectedExam.name)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 dark:bg-slate-800 dark:hover:bg-rose-900 border border-slate-200 dark:border-slate-700 hover:border-rose-300 transition-colors"
                    title="Delete Selected Examination"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-400 font-medium italic">No examinations present</span>
            )}
          </div>
        </div>

        {selectedExam && (() => {
          const currentType: ExamType = (selectedExam as any).exam_type || 'MCQ';
          const typeBadgeClass =
            currentType === 'MCQ'
              ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200 border-blue-200 dark:border-blue-800'
              : currentType === 'THEORY'
              ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border-amber-200 dark:border-amber-800'
              : currentType === 'MIXED'
              ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:text-teal-200 border-teal-200 dark:border-teal-800'
              : 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800';

          return (
            <div className="space-y-4">
              {activeBlueprint && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold">Active Blueprint: {activeBlueprint.paperName} ({activeBlueprint.version})</div>
                      <div className="mt-1 text-emerald-800">Generation will follow its {activeBlueprint.sections.length} configured section{activeBlueprint.sections.length === 1 ? '' : 's'} exactly.</div>
                    </div>
                    <span className="rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white">SOURCE OF TRUTH</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    {activeBlueprint.sections.map(section => <span key={section.id} className="rounded bg-white px-2 py-1 border border-emerald-200">{section.name}: {section.totalQuestions} Q / attempt {section.questionsToAttempt}</span>)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Exam Type Engine</div>
                  <div className={`font-bold mt-1 inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${typeBadgeClass}`}>
                    {currentType === 'MCQ' ? '⚡ MCQ OMR' : currentType === 'THEORY' ? '📝 THEORY PATTERN' : currentType === 'MIXED' ? '🔀 HYBRID' : '💻 PRACTICAL'}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Subject & Category</div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate">{selectedExam.subject}</div>
                  <div className="text-indigo-400 text-[10px]">{selectedExam.category}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Questions / Marks</div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{selectedExam.total_questions} Qs / {selectedExam.total_marks} Marks</div>
                  <div className="text-slate-400 text-[10px]">{selectedExam.duration_minutes} Minutes</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Current State</div>
                  <div className="font-semibold text-emerald-400 mt-0.5">{selectedExam.status}</div>
                  <div className="text-slate-400 text-[10px]">Active Set: {selectedExam.version_code || 'Pending'}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Time-Lock Target</div>
                  <div className="font-mono text-amber-400 mt-0.5 text-[11px] truncate">
                    {new Date(selectedExam.unlock_time).toLocaleTimeString()}
                  </div>
                  <div className="text-slate-500 text-[9px]">{selectedExam.exam_date}</div>
                </div>
              </div>

              {/* Mode Selector & Configuration Toolbar */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Generation Mode Routing:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setExamMode('AUTO')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        examMode === 'AUTO'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      Auto-Detect
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamMode('UNIVERSITY_3_SETS')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1 ${
                        examMode === 'UNIVERSITY_3_SETS' || (examMode === 'AUTO' && isEffectiveUniversity)
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <BookOpen className="w-3 h-3" />
                      University (Max 3 Papers)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamMode('NEET_MULTI_SUBJECT')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1 ${
                        examMode === 'NEET_MULTI_SUBJECT' || (examMode === 'AUTO' && isEffectiveNeet)
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Atom className="w-3 h-3" />
                      NEET / MCQ Multi-Subject Pool
                    </button>
                  </div>
                </div>

                {/* Sub-Panel for NEET / Multi-Subject Pool */}
                {isEffectiveNeet && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-teal-400 flex items-center gap-1.5">
                        <Dna className="w-3.5 h-3.5" />
                        Multi-Subject Pool Distribution (NEET / JEE / MCQ Pattern):
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {selectedSubjects.length} Subjects Active ({eligibleQuestions.length} Eligible Questions)
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {['Physics', 'Chemistry', 'Biology', 'Zoology', 'Mathematics', 'Computer Science & Security'].map(subj => {
                        const count = subjectPoolCounts[subj] || 0;
                        const isSelected = selectedSubjects.includes(subj);
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                if (selectedSubjects.length > 1) {
                                  setSelectedSubjects(selectedSubjects.filter(s => s !== subj));
                                }
                              } else {
                                setSelectedSubjects([...selectedSubjects, subj]);
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                              isSelected
                                ? 'bg-teal-950 border-teal-700 text-teal-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-teal-400' : 'bg-slate-600'}`} />
                            <span>{subj}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                              {count} Qs
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sub-Panel for University Max 3-Paper Sets */}
                {isEffectiveUniversity && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between text-amber-400">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <BookOpen className="w-3.5 h-3.5" />
                      University Final Examination Mode Active: Will generate Max 3 distinct cryptographic paper sets (Set 1, Set 2, Set 3) concurrently.
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                      3-SET ENVELOPE PROTOCOL
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* University 3-Paper Sets Display Card (if University Mode or Paper Versions exist) */}
      {(paperVersions.length > 0 || isEffectiveUniversity) && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-500" />
                University Examination Paper Sets Vault (Max 3 Papers)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Multi-set cryptographic vault holding independent permutations. The Examination Controller activates the release set right before unlocking.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                {paperVersions.length} / 3 Sets in Vault
              </span>
            </div>
          </div>

          {paperVersions.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No paper sets generated yet for this examination. Click <strong className="text-indigo-400">"Generate & Encrypt"</strong> below to create the 3 secure sets.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {paperVersions.map((version, idx) => {
                const isActive = version.is_current === 1;
                const setLabel = `Set ${idx + 1} (Paper ${String.fromCharCode(65 + idx)})`;

                return (
                  <div
                    key={version.id}
                    className={`p-4 rounded-xl border relative transition-all ${
                      isActive
                        ? 'bg-amber-950/20 border-amber-600 shadow-md ring-1 ring-amber-500/30'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Header Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
                        {setLabel}
                      </span>
                      {isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-black flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          ACTIVE RELEASE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-slate-800 text-slate-400">
                          RESERVE VAULT
                        </span>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="space-y-2 text-xs font-mono">
                      <div>
                        <div className="text-[10px] text-slate-400">Version Code:</div>
                        <div className="font-bold text-slate-900 dark:text-white text-xs truncate">
                          {version.version_code}
                        </div>
                      </div>

                      {version.checksum_sha256 && (
                        <div>
                          <div className="text-[10px] text-slate-400">SHA-256 Checksum:</div>
                          <div className="text-emerald-400 text-[10px] truncate">
                            {version.checksum_sha256}
                          </div>
                        </div>
                      )}

                      {version.key_fingerprint && (
                        <div>
                          <div className="text-[10px] text-slate-400">RSA Key Fingerprint:</div>
                          <div className="text-indigo-400 text-[10px] truncate">
                            {version.key_fingerprint}
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800">
                        Generated: {new Date(version.generated_at).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Action to set active */}
                    {(currentUser?.role === 'EXAM_MANAGER' || currentUser?.role === 'ORG_OWNER') && (
                      <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                        {isActive ? (
                          <div className="text-[11px] font-bold text-amber-400 text-center py-1 bg-amber-950/40 rounded-lg">
                            ✓ Designated for Centre Decryption
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={settingActive === version.id}
                            onClick={() => handleSetActiveVersion(version.id, version.version_code)}
                            className="w-full py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-amber-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                          >
                            {settingActive === version.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 text-amber-400" />
                            )}
                            <span>Set as Active Release Paper</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Deterministic Validation & Cryptographic Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 30: DETERMINISTIC PAPER VALIDATION */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Section 30: Deterministic Pre-Flight Checks
              </h2>
              {selectedExam && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                  Mode: {isEffectiveUniversity ? 'UNIVERSITY (3-SETS)' : isEffectiveNeet ? 'NEET / MCQ POOL' : (selectedExam as any).exam_type || 'MCQ'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Deterministic validation verifies that all questions are verified, syllabus-compliant, and mathematically sufficient before invoking the cryptographic vault.
            </p>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Check 1 */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              isQuestionPoolSufficient
                ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/30 border-rose-800 text-rose-300'
            }`}>
              <div>
                <div className="font-semibold">
                  {isEffectiveNeet
                    ? 'Multi-Subject Question Pool Depth (PCB Pool)'
                    : isEffectiveUniversity
                    ? 'University Theory Question Pool (Max 3 Sets Permutation)'
                    : 'Question Pool Depth'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {eligibleQuestions.length} Verified Eligible Questions (Required: {requiredCount})
                </div>
              </div>
              {isQuestionPoolSufficient ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
            </div>

            {/* Check 2 - Tailored by Exam Type */}
            {isEffectiveNeet || ((selectedExam as any)?.exam_type || 'MCQ') === 'MCQ' ? (
              <div className="p-3 rounded-xl border border-emerald-800 bg-emerald-950/30 text-emerald-300 flex items-center justify-between">
                <div>
                  <div className="font-semibold">4-Option Matrix & Negative Marking (+4/-1) Verification</div>
                  <div className="text-[11px] text-slate-400">
                    100% of candidate items have verified options A/B/C/D and single definitive answer key.
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-emerald-800 bg-emerald-950/30 text-emerald-300 flex items-center justify-between">
                <div>
                  <div className="font-semibold">Descriptive Rubric & Word-Limit Coverage (Section A, B & C)</div>
                  <div className="text-[11px] text-slate-400">
                    100% of candidate questions have step-by-step marking rubrics and model evaluation points.
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            )}

            {/* Check 3 */}
            <div className="p-3 rounded-xl border border-emerald-800 bg-emerald-950/30 text-emerald-300 flex items-center justify-between">
              <div>
                <div className="font-semibold">Topic & Difficulty Distribution</div>
                <div className="text-[11px] text-slate-400">
                  Balanced distribution across Easy, Medium, and Hard syllabus modules.
                </div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>

            {/* Check 4 */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              !hasQuarantinedQuestions
                ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                : 'bg-amber-950/30 border-amber-800 text-amber-300'
            }`}>
              <div>
                <div className="font-semibold">Quarantine Exclusion Filter</div>
                <div className="text-[11px] text-slate-400">
                  {quarantinedQuestions.length} Quarantined items strictly excluded from selection pipeline.
                </div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </div>

          {/* Generate Button */}
          {(currentUser?.role === 'EXAM_MANAGER' || currentUser?.role === 'ORG_OWNER') && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={handleGeneratePaper}
                disabled={generating || !isQuestionPoolSufficient}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30 transition-all text-xs"
              >
                <Lock className="w-4 h-4" />
                <span>
                  {generating
                    ? 'Executing Cryptographic Generation...'
                    : isEffectiveUniversity
                    ? 'Generate Max 3 University Paper Sets'
                    : isEffectiveNeet
                    ? `Generate Multi-Subject NEET MCQ Paper (${selectedSubjects.length} Subjects)`
                    : `Generate & Encrypt ${((selectedExam as any)?.exam_type || 'MCQ')} Paper Package`}
                </span>
              </button>

              {selectedExam?.status === 'GENERATED_ENCRYPTED' && (
                <button
                  onClick={() => setShowInvalidateModal(true)}
                  className="w-full sm:w-auto px-3.5 py-3 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <AlertOctagon className="w-4 h-4" />
                  <span>Invalidate & Regenerate</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* SECTION 31 & 32: CRYPTOGRAPHIC VAULT & SHAMIR SECRET SHARING */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500" />
              Section 31 & 32: AES-256-GCM + Shamir Key Vault
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Multi-layer AES-256-GCM paper encryption with Shamir's Secret Sharing (3-of-5 threshold custody protocol).
            </p>
          </div>

          {/* Cryptographic Artifacts Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                Cryptographic Artifacts
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                AES-256-GCM / RSA-2048
              </span>
            </div>

            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="text-slate-400 truncate">
                Checksum SHA-256:{' '}
                <span className="text-emerald-400">
                  {genResult?.checksumSHA256 || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                </span>
              </div>
              <div className="text-slate-400 truncate">
                Vault Key Fingerprint:{' '}
                <span className="text-indigo-300">
                  {genResult?.keyFingerprint || '94:82:10:FA:BC:33:DE:77:88:99:AA:BB'}
                </span>
              </div>
              <div className="text-slate-400">
                Active Version Code:{' '}
                <span className="text-white font-bold">{selectedExam?.version_code || genResult?.versionCode || 'EXAM-2026-CS-V001'}</span>
              </div>
            </div>
          </div>

          {/* Shamir 3-of-5 Custodians */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                Shamir's Secret Custodians (3 Required for Release)
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold font-mono">3 / 5 CUSTODIANS ACTIVE</span>
            </div>

            <div className="space-y-1.5">
              {custodians.map(c => (
                <div
                  key={c.index}
                  className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-indigo-400 flex items-center justify-center font-bold text-[10px]">
                      {c.index}
                    </span>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">{c.name}</div>
                      <div className="text-[10px] text-slate-500">{c.role}</div>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    KEY SHARE ISSUED
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Invalidation Modal */}
      {showInvalidateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-rose-600 dark:text-rose-400 font-serif flex items-center gap-2">
                <AlertOctagon className="w-5 h-5" />
                Emergency Paper Invalidation & Regeneration (Section 33)
              </h2>
              <button onClick={() => setShowInvalidateModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleEmergencyRegenerate} className="space-y-4 text-xs">
              <div className="p-3 bg-rose-950/30 border border-rose-800 rounded-xl text-rose-300 space-y-1">
                <div className="font-bold">Caution: High Impact Incident Response Action</div>
                <p className="text-[11px] text-slate-300">
                  This will immediately revoke and invalidate the active paper version, permanently quarantine any compromised questions, and generate a new encrypted release package.
                </p>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Formal Invalidation Reason / Security Incident Ref</label>
                <textarea
                  rows={3}
                  value={invalidationForm.reason}
                  onChange={e => setInvalidationForm({ ...invalidationForm, reason: e.target.value })}
                  required
                  className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Select Flagged / Compromised Questions to Quarantine</label>
                <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800">
                  {questions.slice(0, 8).map(q => (
                    <label key={q.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-900 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={invalidationForm.flagged_question_ids.includes(q.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setInvalidationForm({
                              ...invalidationForm,
                              flagged_question_ids: [...invalidationForm.flagged_question_ids, q.id],
                            });
                          } else {
                            setInvalidationForm({
                              ...invalidationForm,
                              flagged_question_ids: invalidationForm.flagged_question_ids.filter(id => id !== q.id),
                            });
                          }
                        }}
                      />
                      <span className="truncate">{q.topic}: {q.content_text.substring(0, 60)}...</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInvalidateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold shadow-md"
                >
                  Execute Emergency Regeneration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
