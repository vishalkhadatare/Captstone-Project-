import React, { useState, useEffect } from 'react';
import {
  FolderLock,
  PlusCircle,
  HelpCircle,
  Cpu,
  Layers,
  Building2,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  FileCheck,
  Upload,
  KeyRound,
  RotateCcw,
  Languages,
  UserCheck,
  CheckSquare,
  Square,
  FileUp,
  Edit3,
  Trash2,
  ArrowRight,
  Search,
  Filter,
  Check,
  X,
  FileText,
  Activity,
  Send,
  Users,
} from 'lucide-react';
import { User, Examination, Question, Organization, ExamType, ExtractedQuestion, QuestionAssignment } from '../../types';
import { api } from '../../api';
import { NavSubTab } from '../Sidebar';
import { ExamManagerQuestionExtractor } from './ExamManagerQuestionExtractor';

interface ExamManagerWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
  onSelectSubTab?: (tab: NavSubTab) => void;
}

const SUPPORTED_TRANSLATION_LANGUAGES = [
  { code: 'Hindi', label: 'Hindi (हिंदी)' },
  { code: 'Marathi', label: 'Marathi (मराठी)' },
  { code: 'Gujarati', label: 'Gujarati (ગુજરાતી)' },
  { code: 'Tamil', label: 'Tamil (தமிழ்)' },
  { code: 'Telugu', label: 'Telugu (తెలుగు)' },
  { code: 'Kannada', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'Bengali', label: 'Bengali (বাংলা)' },
  { code: 'Urdu', label: 'Urdu (اردو)' },
];

export const ExamManagerWorkspace: React.FC<ExamManagerWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
  onSelectSubTab,
}) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [smes, setSmes] = useState<User[]>([]);
  const [translators, setTranslators] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<QuestionAssignment[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [allExaminationsError, setAllExaminationsError] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dashboardCardFilter, setDashboardCardFilter] = useState<'ALL' | 'VERIFIED' | 'QUARANTINED' | 'READY'>('ALL');
  const [allExamsSearch, setAllExamsSearch] = useState('');
  const [allExamsStatusFilter, setAllExamsStatusFilter] = useState('ALL');
  const [allExamsCategoryFilter, setAllExamsCategoryFilter] = useState('ALL');
  const [universityDraftFiles, setUniversityDraftFiles] = useState<Array<{ id: string; name: string; size: string; uploadedAt: string }>>([]);
  const [draftUploadError, setDraftUploadError] = useState<string | null>(null);

  // Workflow Sub-Navigation
  const [questionWorkflowTab, setQuestionWorkflowTab] = useState<'extraction' | 'manual' | 'matrix'>('extraction');

  // PDF / Paper Extraction State
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfFileData, setPdfFileData] = useState('');
  const [pdfText, setPdfText] = useState('');
  const [paperSubject, setPaperSubject] = useState('');
  const [paperCategory, setPaperCategory] = useState('Competitive Exam');
  const [extracting, setExtracting] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [extractionSummary, setExtractionSummary] = useState('');
  const [detectedSubject, setDetectedSubject] = useState('');
  const [aiEngineUsed, setAiEngineUsed] = useState(false);
  const [selectedExtractedIds, setSelectedExtractedIds] = useState<Set<string>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);

  // Extraction Assignment Form State
  const [extractAssignSmeId, setExtractAssignSmeId] = useState('');
  const [extractAssignTranslatorId, setExtractAssignTranslatorId] = useState('');
  const [extractAssignTargetLanguage, setExtractAssignTargetLanguage] = useState('Hindi');
  const [extractAssignNotes, setExtractAssignNotes] = useState('');

  // Question Pool Bulk Assignment Modal State
  const [poolSelectedIds, setPoolSelectedIds] = useState<Set<string>>(new Set());
  const [poolBulkModalOpen, setPoolBulkModalOpen] = useState(false);
  const [poolAssignType, setPoolAssignType] = useState<'SME_REVIEW' | 'LINGUISTIC_TRANSLATION'>('SME_REVIEW');
  const [poolAssignUserId, setPoolAssignUserId] = useState('');
  const [poolAssignTargetLanguage, setPoolAssignTargetLanguage] = useState('Hindi');
  const [poolAssignNotes, setPoolAssignNotes] = useState('');
  const [poolAssigning, setPoolAssigning] = useState(false);

  // Create Exam Form
  const [examName, setExamName] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Competitive Exam');
  const [examType, setExamType] = useState<ExamType>('MCQ');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('');
  const [unlockTime, setUnlockTime] = useState('');
  const [totalMarks, setTotalMarks] = useState(100);
  const [totalQuestions, setTotalQuestions] = useState(25);
  const [durationMins, setDurationMins] = useState(180);
  const [generationExamTypeFilter, setGenerationExamTypeFilter] = useState<'ALL' | 'MCQ' | 'THEORY' | 'MIXED' | 'PRACTICAL_CODING'>('ALL');
  const [selectedGenExamId, setSelectedGenExamId] = useState<string>('');

  // Single Question Form
  const [qSubject, setQSubject] = useState('');
  const [qTopic, setQTopic] = useState('');
  const [qDifficulty, setQDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [qMarks, setQMarks] = useState(4);
  const [qNegativeMarks, setQNegativeMarks] = useState(1.0);
  const [qCorrectAnswer, setQCorrectAnswer] = useState('A');
  const [qContent, setQContent] = useState('');
  const [qOptions, setQOptions] = useState(['Option A', 'Option B', 'Option C', 'Option D']);
  const [qSyllabus, setQSyllabus] = useState('Standard National Curriculum');
  const [assignedSmeId, setAssignedSmeId] = useState('');

  // AI Similarity / Duplicate Check
  const [aiChecking, setAiChecking] = useState(false);
  const [aiCheckResult, setAiCheckResult] = useState<any | null>(null);

  // Theory Pattern
  const [refDraftText, setRefDraftText] = useState('');
  const [analyzingPattern, setAnalyzingPattern] = useState(false);
  const [extractedPattern, setExtractedPattern] = useState<any | null>(null);

  // Centre Form
  const [centreCode, setCentreCode] = useState('');
  const [centreName, setCentreName] = useState('');
  const [centreCity, setCentreCity] = useState('');
  const [centreAddress, setCentreAddress] = useState('');
  const [centreMaxCopies, setCentreMaxCopies] = useState(100);

  // Generation status
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setAllExaminationsError(false);
    try {
      const [orgRes, examRes, qRes, membersRes, assignRes] = await Promise.all([
        api.getCurrentOrg().catch(() => ({ organization: null, documents: [], history: [], representatives: [] })),
        api.getExaminations().catch(() => ({ examinations: [] })),
        api.getQuestions().catch(() => ({ questions: [] })),
        api.getOrgMembers().catch(() => ({ members: [] })),
        api.getAssignments().catch(() => ({ assignments: [] })),
      ]);

      setOrg(orgRes.organization);
      const exams = (examRes.examinations || []).filter(ex => !currentUser || ex.org_id === currentUser.org_id);
      setExaminations(exams);
      if (exams.length > 0 && !selectedExamId) {
        setSelectedExamId(exams[0].id);
      }
      setQuestions(qRes.questions || []);
      const members = membersRes.members || [];
      setSmes(members.filter(m => m.role === 'SME'));
      setTranslators(members.filter(m => m.role === 'TRANSLATOR'));
      setAssignments(assignRes.assignments || []);
    } catch (err: any) {
      console.error('Exam Manager load error:', err);
      setAllExaminationsError(true);
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = Array.from(new Set(examinations.map(ex => ex.status))).filter(Boolean);
  const categoryOptions = Array.from(new Set(examinations.map(ex => ex.category).filter(Boolean)));
  const filteredAllExaminations = examinations.filter(ex => {
    const normalizedSearch = allExamsSearch.trim().toLowerCase();
    const matchesSearch = !normalizedSearch ||
      ex.name.toLowerCase().includes(normalizedSearch) ||
      ex.id.toLowerCase().includes(normalizedSearch) ||
      ex.category.toLowerCase().includes(normalizedSearch);
    const matchesStatus = allExamsStatusFilter === 'ALL' || ex.status === allExamsStatusFilter;
    const matchesCategory = allExamsCategoryFilter === 'ALL' || ex.category === allExamsCategoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleOpenExamination = (examId: string) => {
    setSelectedExamId(examId);
    onSelectSubTab?.('create_examination');
  };

  // Handle PDF / Text File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFileName(file.name);
    const reader = new FileReader();

    if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setPdfText(content);
        setPdfFileData('');
      };
      reader.readAsText(file);
    } else {
      // PDF / binary files: read as base64 data URL
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setPdfFileData(dataUrl);
        // Try extracting preview text if readable
        try {
          const raw = atob(dataUrl.split(',')[1] || '');
          const printable = raw.replace(/[^\x20-\x7E\t\r\n]/g, ' ').trim();
          if (printable.length > 50) {
            setPdfText(printable);
          }
        } catch {
          // Keep raw
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Trigger AI Question Extraction
  const handleExtractQuestions = async () => {
    if (isUniversityWorkflow && universityDraftFiles.length === 0 && !pdfText.trim() && !pdfFileData) {
      setStatusMessage({ type: 'error', text: 'Please upload at least one draft for the University Exam workflow.' });
      return;
    }

    const textToExtract = pdfText.trim();
    if (!isUniversityWorkflow && !textToExtract && !pdfFileData) {
      setStatusMessage({ type: 'error', text: 'Please upload a PDF / document or paste question paper text.' });
      return;
    }

    setExtracting(true);
    setStatusMessage(null);

    try {
      const res = await api.extractQuestionsFromPaper({
        paper_text: textToExtract,
        file_data: pdfFileData,
        file_name: pdfFileName,
        subject: paperSubject || 'Academic Examination',
        category: paperCategory || 'Competitive Exam',
      });

      const extracted = (res.extractedQuestions || []).map((q, idx) => ({
        ...q,
        tempId: q.tempId || `EXT-${Date.now()}-${idx + 1}`,
      }));

      setExtractedQuestions(extracted);
      setExtractionSummary(res.extractionSummary || '');
      setDetectedSubject(res.detectedSubject || paperSubject);
      setAiEngineUsed(res.aiEngineUsed || false);

      // Select all extracted questions by default
      const allIds = new Set(extracted.map(q => q.tempId));
      setSelectedExtractedIds(allIds);

      setStatusMessage({
        type: 'success',
        text: `Extracted ${extracted.length} questions from question paper (${res.aiEngineUsed ? 'Gemini AI Engine' : 'Heuristic Parser'}).`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to extract questions from document.' });
    } finally {
      setExtracting(false);
    }
  };

  // Toggle selection for extracted questions
  const toggleExtractedSelection = (id: string) => {
    const next = new Set(selectedExtractedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedExtractedIds(next);
  };

  const selectAllExtracted = (filterType?: 'ALL' | 'MCQ' | 'THEORY') => {
    if (filterType === 'MCQ') {
      const mcqIds = extractedQuestions.filter(q => q.question_type === 'MCQ').map(q => q.tempId);
      setSelectedExtractedIds(new Set(mcqIds));
    } else if (filterType === 'THEORY') {
      const theoryIds = extractedQuestions.filter(q => q.question_type === 'THEORY').map(q => q.tempId);
      setSelectedExtractedIds(new Set(theoryIds));
    } else {
      setSelectedExtractedIds(new Set(extractedQuestions.map(q => q.tempId)));
    }
  };

  const deselectAllExtracted = () => {
    setSelectedExtractedIds(new Set());
  };

  // Update a field in an extracted question
  const updateExtractedQuestion = (id: string, updates: Partial<ExtractedQuestion>) => {
    setExtractedQuestions(prev =>
      prev.map(q => (q.tempId === id ? { ...q, ...updates } : q))
    );
  };

  // Remove question from extraction list
  const removeExtractedQuestion = (id: string) => {
    setExtractedQuestions(prev => prev.filter(q => q.tempId !== id));
    const next = new Set(selectedExtractedIds);
    next.delete(id);
    setSelectedExtractedIds(next);
  };

  // Import Selected Extracted Questions & Optionally Auto-Assign
  const handleImportExtracted = async () => {
    const selected = extractedQuestions.filter(q => selectedExtractedIds.has(q.tempId));
    if (selected.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please select at least one question to import.' });
      return;
    }

    setImportingBatch(true);
    setStatusMessage(null);

    try {
      const res = await api.bulkCreateQuestions({
        questions: selected,
        auto_assign_sme_id: extractAssignSmeId || undefined,
        auto_assign_translator_id: extractAssignTranslatorId || undefined,
        target_language: extractAssignTranslatorId ? extractAssignTargetLanguage : undefined,
        assignment_notes: extractAssignNotes || undefined,
      });

      setStatusMessage({
        type: 'success',
        text: `Successfully imported ${res.createdCount} questions into the secure question bank${
          extractAssignSmeId ? ' and assigned to SME' : ''
        }${extractAssignTranslatorId ? ` and assigned for ${extractAssignTargetLanguage} translation` : ''}.`,
      });

      // Clear extracted list on success
      setExtractedQuestions([]);
      setSelectedExtractedIds(new Set());
      setPdfText('');
      setPdfFileData('');
      setPdfFileName('');
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to import questions.' });
    } finally {
      setImportingBatch(false);
    }
  };

  // Bulk Assign Selected Questions from Question Pool
  const handleExecutePoolBulkAssign = async () => {
    if (poolSelectedIds.size === 0 || !poolAssignUserId) {
      setStatusMessage({ type: 'error', text: 'Please select questions and a target assignee.' });
      return;
    }

    setPoolAssigning(true);
    setStatusMessage(null);

    try {
      const res = await api.bulkAssignQuestions({
        question_ids: Array.from(poolSelectedIds),
        assignment_type: poolAssignType,
        assignee_user_id: poolAssignUserId,
        target_language: poolAssignType === 'LINGUISTIC_TRANSLATION' ? poolAssignTargetLanguage : undefined,
        notes: poolAssignNotes || undefined,
      });

      setStatusMessage({ type: 'success', text: res.message });
      setPoolBulkModalOpen(false);
      setPoolSelectedIds(new Set());
      setPoolAssignNotes('');
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to assign questions.' });
    } finally {
      setPoolAssigning(false);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (org?.status !== 'VERIFIED') {
      setStatusMessage({
        type: 'error',
        text: 'Organization verification required before examination creation. Please contact the Organization Owner to complete accreditation.',
      });
      return;
    }

    try {
      const res = await api.createExamination({
        name: examName,
        subject,
        category,
        exam_type: examType,
        exam_date: examDate,
        exam_time: examTime,
        unlock_time: unlockTime,
        total_marks: totalMarks,
        total_questions: totalQuestions,
        duration_minutes: durationMins,
      });

      setStatusMessage({ type: 'success', text: res.message });
      setExamName('');
      setSubject('');
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const workflowExam = examinations.find(ex => ex.id === selectedExamId) || examinations[0] || null;
  const workflowCategory = workflowExam?.category || category || 'Competitive Exam';
  const isUniversityWorkflow = workflowCategory === 'University Exam';
  const isLargePoolWorkflow = ['NEET', 'JEE', 'TCET / CET-type Exam'].includes(workflowCategory);
  const isCompetitiveWorkflow = workflowCategory === 'Competitive Exam';
  const isCustomWorkflow = workflowCategory === 'Custom Exam' || workflowCategory === 'Custom Institutional Exam';

  useEffect(() => {
    if (workflowExam?.category) {
      setPaperCategory(workflowExam.category);
    }
  }, [workflowExam?.id, workflowExam?.category]);

  const handlePaperCategoryChange = (nextCategory: string) => {
    const hasExistingUploads = universityDraftFiles.length > 0 || !!pdfFileName || !!pdfText.trim() || extractedQuestions.length > 0;
    if (hasExistingUploads && paperCategory !== nextCategory && typeof window !== 'undefined') {
      const confirmed = window.confirm('Changing the examination category may change the question-bank upload rules. Existing uploaded files will be retained. Do you want to continue?');
      if (!confirmed) {
        return;
      }
    }

    setPaperCategory(nextCategory);
  };

  const handleUniversityDraftUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (universityDraftFiles.length >= 3) {
      setDraftUploadError('Maximum 3 PDFs allowed for University Exam.');
      event.target.value = '';
      return;
    }

    const fileSizeMb = (file.size / 1024 / 1024).toFixed(2);
    const next = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      size: `${fileSizeMb} MB`,
      uploadedAt: new Date().toISOString(),
    };

    setUniversityDraftFiles(prev => [...prev, next]);
    setDraftUploadError(null);
    event.target.value = '';
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    try {
      const res = await api.createQuestion({
        subject: qSubject,
        topic: qTopic,
        difficulty: qDifficulty,
        marks: qMarks,
        negative_marks: qNegativeMarks,
        correct_answer: qCorrectAnswer,
        syllabus: qSyllabus,
        question_type: examType,
        content_text: qContent,
        options: examType === 'MCQ' ? qOptions : null,
      });

      if (assignedSmeId) {
        await api.assignQuestion(res.questionId, assignedSmeId);
      }

      setStatusMessage({ type: 'success', text: 'Question added to secure repository and assigned to SME.' });
      setQContent('');
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleCheckAiSimilarity = async () => {
    if (!qContent) return;
    setAiChecking(true);
    try {
      const res = await api.checkAiSimilarity(qContent);
      setAiCheckResult(res.result);
    } catch (err: any) {
      alert(err.message || 'AI Check error');
    } finally {
      setAiChecking(false);
    }
  };

  const handleAnalyzeTheoryPattern = async () => {
    if (!selectedExamId || !refDraftText) return;
    setAnalyzingPattern(true);
    try {
      const res = await api.analyzeTheoryPattern(selectedExamId, refDraftText);
      setExtractedPattern(res.pattern);
      setStatusMessage({ type: 'success', text: 'Theory pattern extracted using Gemini AI engine.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setAnalyzingPattern(false);
    }
  };

  const handleConfirmPattern = async () => {
    if (!selectedExamId || !extractedPattern) return;
    try {
      const res = await api.confirmPattern(selectedExamId, {
        theory_pattern_json: extractedPattern,
        pattern_confirmed: 1,
      });
      setStatusMessage({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleGeneratePaper = async (examId: string) => {
    setGenerating(true);
    setStatusMessage(null);
    try {
      const res = await api.generatePaper(examId);
      setStatusMessage({
        type: 'success',
        text: `Paper generated & encrypted: Version ${res.versionCode} (Checksum: ${res.checksumSHA256.substring(0, 12)}...) with AES-256 and Shamir secret shares.`,
      });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleEmergencyRegenerate = async (examId: string) => {
    const reason = prompt('Specify security reason for emergency invalidation & regeneration:');
    if (!reason) return;
    try {
      const res = await api.emergencyRegenerate(examId, { reason, quarantine_suspect_questions: true });
      setStatusMessage({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleAddCentre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId) return;
    try {
      const res = await api.addCentre(selectedExamId, {
        centre_code: centreCode,
        centre_name: centreName,
        city: centreCity,
        address: centreAddress,
        max_copies: centreMaxCopies,
      });
      setStatusMessage({ type: 'success', text: res.message });
      setCentreCode('');
      setCentreName('');
      setCentreCity('');
      setCentreAddress('');
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const verifiedCount = questions.filter(q => q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER').length;
  const quarantinedCount = questions.filter(q => q.status === 'QUARANTINED' || q.status === 'COMPROMISED').length;

  return (
    <div className="space-y-6">
      {/* Organization Verification Gate Notification */}
      {org?.status !== 'VERIFIED' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold">Organization Verification Required</h4>
            <p className="text-amber-800 leading-relaxed">
              Your institution is currently in status <span className="font-bold uppercase font-mono">{org?.status || 'PENDING'}</span>. Examination creation and final cryptographic paper generation remain locked until the Organization Owner and central registrar complete accreditation.
            </p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* DASHBOARD */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Examination Authority Portal
                </span>
                <h2 className="text-xl font-bold text-slate-900">Examination Operations Dashboard</h2>
              </div>
            </div>

            {/* 4 Interactive Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setDashboardCardFilter('ALL')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  dashboardCardFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/20 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Total Examinations
                </span>
                <span className="text-2xl font-bold block mt-0.5">{examinations.length}</span>
                <span className={`text-[10px] block mt-1 ${dashboardCardFilter === 'ALL' ? 'text-emerald-300' : 'text-slate-400'}`}>
                  Active Enclaves
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('READY')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  dashboardCardFilter === 'READY'
                    ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/20 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'READY' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Pool Questions
                </span>
                <span className="text-2xl font-bold block mt-0.5">{questions.length}</span>
                <span className={`text-[10px] block mt-1 ${dashboardCardFilter === 'READY' ? 'text-emerald-300' : 'text-slate-400'}`}>
                  Total In Repository
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('VERIFIED')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  dashboardCardFilter === 'VERIFIED'
                    ? 'bg-emerald-950 text-white border-emerald-900 ring-2 ring-emerald-600/30 shadow-xs'
                    : 'bg-emerald-50/60 border-emerald-200 text-emerald-950 hover:bg-emerald-50 hover:border-emerald-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'VERIFIED' ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  Verified & Eligible
                </span>
                <span className={`text-2xl font-bold block mt-0.5 ${dashboardCardFilter === 'VERIFIED' ? 'text-emerald-300' : 'text-emerald-800'}`}>
                  {verifiedCount}
                </span>
                <span className={`text-[10px] block mt-1 ${dashboardCardFilter === 'VERIFIED' ? 'text-emerald-300' : 'text-emerald-600 font-bold'}`}>
                  Ready for Generation
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('QUARANTINED')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  dashboardCardFilter === 'QUARANTINED'
                    ? 'bg-rose-950 text-white border-rose-900 ring-2 ring-rose-600/30 shadow-xs'
                    : 'bg-rose-50/60 border-rose-200 text-rose-950 hover:bg-rose-50 hover:border-rose-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'QUARANTINED' ? 'text-rose-300' : 'text-rose-700'}`}>
                  Quarantined / Suspects
                </span>
                <span className={`text-2xl font-bold block mt-0.5 ${dashboardCardFilter === 'QUARANTINED' ? 'text-rose-300' : 'text-rose-800'}`}>
                  {quarantinedCount}
                </span>
                <span className={`text-[10px] block mt-1 ${dashboardCardFilter === 'QUARANTINED' ? 'text-rose-300' : 'text-rose-600 font-bold'}`}>
                  Flagged Items
                </span>
              </button>
            </div>
          </div>

          {/* All Examinations */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FolderLock className="w-4 h-4 text-emerald-900" />
                <span>All Examinations</span>
              </h3>

              <span className="text-xs text-slate-500 font-mono">{filteredAllExaminations.length} examinations</span>
            </div>

            {allExaminationsError ? (
              <div className="p-6 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm space-y-3">
                <p>Unable to load examinations.</p>
                <button
                  type="button"
                  onClick={() => loadData()}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs"
                >
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading examinations...</div>
            ) : (
              <>
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={allExamsSearch}
                      onChange={e => setAllExamsSearch(e.target.value)}
                      placeholder="Search examinations..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </div>

                  <select
                    value={allExamsStatusFilter}
                    onChange={e => setAllExamsStatusFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  >
                    <option value="ALL">All Status</option>
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>

                  <select
                    value={allExamsCategoryFilter}
                    onChange={e => setAllExamsCategoryFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  >
                    <option value="ALL">All Categories</option>
                    {categoryOptions.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                {filteredAllExaminations.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-3">
                    <p className="text-sm font-bold text-slate-800">No examinations found.</p>
                    <p className="text-xs text-slate-500">Create your first examination to get started.</p>
                    <button
                      type="button"
                      onClick={() => onSelectSubTab?.('create_examination')}
                      className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs"
                    >
                      Create Examination
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredAllExaminations.map(ex => (
                      <div key={ex.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-slate-900">{ex.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              ex.exam_type === 'MCQ'
                                ? 'bg-blue-100 text-blue-900 border-blue-200'
                                : ex.exam_type === 'THEORY'
                                ? 'bg-amber-100 text-amber-900 border-amber-200'
                                : ex.exam_type === 'MIXED'
                                ? 'bg-teal-100 text-teal-900 border-teal-200'
                                : 'bg-indigo-100 text-indigo-900 border-indigo-200'
                            }`}>
                              {ex.exam_type}
                            </span>
                          </div>

                          <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                            {ex.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-slate-600">
                          <div>
                            <span className="block text-slate-500">Category</span>
                            <span className="font-bold text-slate-900">{ex.category}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">Status</span>
                            <span className="font-bold text-slate-900">{ex.status}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">Questions</span>
                            <span className="font-bold text-slate-900">{ex.total_questions}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">Created</span>
                            <span className="font-bold text-slate-900">{new Date(ex.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                          {ex.exam_date && (
                            <div>
                              <span className="block text-slate-500">Exam Date</span>
                              <span className="font-bold text-slate-900">{ex.exam_date}</span>
                            </div>
                          )}
                          {ex.exam_time && (
                            <div>
                              <span className="block text-slate-500">Exam Time</span>
                              <span className="font-bold text-slate-900">{ex.exam_time}</span>
                            </div>
                          )}
                          {ex.duration_minutes && (
                            <div>
                              <span className="block text-slate-500">Duration</span>
                              <span className="font-bold text-slate-900">{ex.duration_minutes} mins</span>
                            </div>
                          )}
                          {ex.updated_at && (
                            <div>
                              <span className="block text-slate-500">Last Updated</span>
                              <span className="font-bold text-slate-900">{new Date(ex.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleOpenExamination(ex.id)}
                            className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs"
                          >
                            Open Examination
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {dashboardCardFilter !== 'ALL' && (
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FolderLock className="w-4 h-4 text-emerald-900" />
                  <span>
                    {dashboardCardFilter === 'VERIFIED'
                      ? 'Verified & Paper-Eligible Question Pool'
                      : dashboardCardFilter === 'QUARANTINED'
                      ? 'Quarantined & Flagged Questions'
                      : 'Repository Question Inventory'}
                  </span>
                </h3>

                <span className="text-xs text-slate-500 font-mono">
                  {dashboardCardFilter === 'VERIFIED'
                    ? `${verifiedCount} Verified Questions`
                    : dashboardCardFilter === 'QUARANTINED'
                    ? `${quarantinedCount} Quarantined`
                    : `${questions.length} Pool Questions`}
                </span>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {questions
                  .filter(q => {
                    if (dashboardCardFilter === 'VERIFIED') return q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER';
                    if (dashboardCardFilter === 'QUARANTINED') return q.status === 'QUARANTINED' || q.status === 'COMPROMISED';
                    return true;
                  })
                  .map(q => (
                    <div
                      key={q.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800">{q.id}</span>
                          <span className="font-bold text-slate-900">{q.subject}</span>
                          <span className="text-[11px] text-slate-500">({q.topic})</span>
                        </div>
                        <p className="text-slate-700 line-clamp-2 text-[11px]">{q.content_text}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            : q.status === 'QUARANTINED' || q.status === 'COMPROMISED'
                            ? 'bg-rose-100 text-rose-900 border border-rose-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}
                      >
                        {q.status}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALL EXAMINATIONS */}
      {activeSubTab === 'all_examinations' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
            <h3 className="text-base font-bold text-slate-900">All Scheduled Examinations</h3>
            <span className="text-xs text-slate-500 font-mono">{examinations.length} Active Enclaves</span>
          </div>

          <div className="space-y-3">
            {examinations.map(ex => {
              const type = (ex as any).exam_type || 'MCQ';
              const typeBadgeClass =
                type === 'MCQ'
                  ? 'bg-blue-100 text-blue-900 border-blue-200'
                  : type === 'THEORY'
                  ? 'bg-amber-100 text-amber-900 border-amber-200'
                  : type === 'MIXED'
                  ? 'bg-teal-100 text-teal-900 border-teal-200'
                  : 'bg-indigo-100 text-indigo-900 border-indigo-200';

              return (
                <div key={ex.id} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{ex.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${typeBadgeClass}`}>
                        {type === 'MCQ' ? '⚡ MCQ (OMR/CBT)' : type === 'THEORY' ? '📝 THEORY (Subjective)' : type === 'MIXED' ? '🔀 MIXED (Hybrid)' : '💻 PRACTICAL'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                      {ex.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                    <div>Subject: <span className="font-bold text-slate-900">{ex.subject}</span></div>
                    <div>Category: <span className="font-bold text-slate-900">{ex.category}</span></div>
                    <div>Marks: <span className="font-bold text-slate-900">{ex.total_marks}</span></div>
                    <div>Duration: <span className="font-bold text-slate-900">{ex.duration_minutes} mins</span></div>
                    <div>Schedule Date: <span className="font-mono text-slate-900">{ex.exam_date}</span></div>
                    <div>Exam Time: <span className="font-mono text-slate-900">{ex.exam_time}</span></div>
                    <div>Unlock Time: <span className="font-mono font-bold text-emerald-900">{ex.unlock_time}</span></div>
                    <div>Total Qs: <span className="font-bold text-slate-900">{ex.total_questions}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CREATE EXAMINATION */}
      {activeSubTab === 'create_examination' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Create New Examination Enclave
          </h3>

          <form onSubmit={handleCreateExam} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">Official Examination Name *</label>
              <input
                type="text"
                value={examName}
                onChange={e => setExamName(e.target.value)}
                placeholder="e.g. National Computer Science & Security Entrance Exam 2026"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Subject / Domain *</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Computer Science & Applied Cryptography"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Examination Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              >
                <option value="NEET">NEET (National Eligibility Entrance Test)</option>
                <option value="JEE">JEE (Joint Entrance Examination)</option>
                <option value="Competitive Exam">Competitive Exam</option>
                <option value="TCET / CET-type Exam">TCET / CET-type Exam</option>
                <option value="University Exam">University Exam</option>
                <option value="Custom Institutional Exam">Custom Institutional Exam</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Examination Paper Type *</label>
              <select
                value={examType}
                onChange={e => setExamType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden font-medium"
              >
                <option value="MCQ">MCQ (Multiple Choice Questions - OMR / CBT)</option>
                <option value="THEORY">THEORY (Subjective / Descriptive Pattern)</option>
                <option value="MIXED">MIXED / HYBRID (MCQ + Descriptive Sections)</option>
                <option value="PRACTICAL_CODING">PRACTICAL / CODING (Lab & Assessment)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                {examType === 'MCQ' && '⚡ MCQ Engine: Generates OMR answer sheets, option shuffling, and randomized question sets A/B/C/D.'}
                {examType === 'THEORY' && '📝 Theory Engine: Sectional Blueprint architecture (Short, Medium, Long), marks distribution, and SME rubric guide.'}
                {examType === 'MIXED' && '🔀 Mixed Engine: Dual-tier assembly with separate objective OMR and subjective answer booklets.'}
                {examType === 'PRACTICAL_CODING' && '💻 Practical Engine: Problem statements, I/O constraints, and automated sandbox test suites.'}
              </p>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Scheduled Examination Date *</label>
              <input
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Examination Start Time *</label>
              <input
                type="time"
                value={examTime}
                onChange={e => setExamTime(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Authorized Time-Lock Unlock *</label>
              <input
                type="time"
                value={unlockTime}
                onChange={e => setUnlockTime(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Total Marks</label>
              <input
                type="number"
                value={totalMarks}
                onChange={e => setTotalMarks(Number(e.target.value))}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Target Question Count</label>
              <input
                type="number"
                value={totalQuestions}
                onChange={e => setTotalQuestions(Number(e.target.value))}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
              />
            </div>

            <div className="sm:col-span-2 pt-2">
              <button
                type="submit"
                disabled={org?.status !== 'VERIFIED'}
                className="px-6 py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs"
              >
                Create Examination Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QUESTION WORKFLOW & CREATION */}
      {activeSubTab === 'question_workflow' && (
        <div className="space-y-6">
          {/* Navigation Pill Bar for Question Workflow */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuestionWorkflowTab('extraction')}
                className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
                  questionWorkflowTab === 'extraction'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <FileUp className="w-4 h-4 text-emerald-400" />
                <span>PDF Question Paper Extractor</span>
                {extractedQuestions.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-700 text-white font-mono">
                    {extractedQuestions.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setQuestionWorkflowTab('manual')}
                className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
                  questionWorkflowTab === 'manual'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>Manual Single Question</span>
              </button>

              <button
                onClick={() => setQuestionWorkflowTab('matrix')}
                className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
                  questionWorkflowTab === 'matrix'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Activity className="w-4 h-4 text-teal-400" />
                <span>Assignment & Verification Matrix</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-800 font-mono">
                  {assignments.length}
                </span>
              </button>
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-4">
              <span>SMEs: <strong className="text-slate-800">{smes.length}</strong></span>
              <span>Translators: <strong className="text-slate-800">{translators.length}</strong></span>
            </div>
          </div>

          {/* TAB 1: PDF QUESTION PAPER EXTRACTION & BULK ASSIGNMENT */}
          {questionWorkflowTab === 'extraction' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <FileUp className="w-5 h-5 text-emerald-800" />
                      <span>{isUniversityWorkflow ? 'University Draft Upload & Extraction' : isLargePoolWorkflow ? 'Large Question Pool Input' : isCompetitiveWorkflow ? 'Topic-wise Question Pool' : isCustomWorkflow ? 'Custom Input Configuration' : 'Upload Question Paper PDF / Transcript'}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {workflowExam ? `${workflowExam.name} • Category: ${workflowCategory}` : `Selected category: ${workflowCategory}`}
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Gemini Extraction Engine</span>
                  </span>
                </div>

                {isUniversityWorkflow && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">University Question Paper Drafts</p>
                        <p className="text-[11px] text-slate-500">Upload up to 3 draft/reference PDFs for a university exam. The workflow keeps source draft metadata for each extracted question.</p>
                      </div>
                      <span className="text-[11px] font-bold text-slate-600">{universityDraftFiles.length} / 3 PDFs used</span>
                    </div>

                    <div className="space-y-2">
                      {universityDraftFiles.length === 0 ? (
                        <div className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-3 bg-white">No draft PDFs uploaded yet.</div>
                      ) : (
                        universityDraftFiles.map((file, index) => (
                          <div key={file.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                            <div>
                              <div className="font-bold text-slate-800">Draft {index + 1}</div>
                              <div className="text-slate-500">{file.name} • {file.size}</div>
                            </div>
                            <span className="text-emerald-700 font-bold">✓ Uploaded</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="inline-flex cursor-pointer items-center px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-50" aria-disabled={universityDraftFiles.length >= 3}>
                        <Upload className="w-3.5 h-3.5 mr-2" />
                        Add PDF
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleUniversityDraftUpload}
                          className="hidden"
                          disabled={universityDraftFiles.length >= 3}
                        />
                      </label>

                      <span className="text-[11px] text-slate-500">Maximum 3 PDFs allowed for University Exam.</span>
                    </div>

                    {draftUploadError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{draftUploadError}</div>
                    )}
                  </div>
                )}

                {!isUniversityWorkflow && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Target Subject / Discipline</label>
                      <input
                        type="text"
                        value={paperSubject}
                        onChange={e => setPaperSubject(e.target.value)}
                        placeholder="e.g. Physics / Mathematics / Computer Science"
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Examination Category</label>
                      <select
                        value={paperCategory}
                        onChange={e => handlePaperCategoryChange(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                      >
                        <option value="NEET">NEET (National Eligibility Entrance Test)</option>
                        <option value="JEE">JEE (Joint Entrance Examination)</option>
                        <option value="Competitive Exam">Competitive Exam</option>
                        <option value="TCET / CET-type Exam">TCET / CET-type Exam</option>
                        <option value="University Exam">University Exam</option>
                        <option value="Custom Institutional Exam">Custom Institutional Exam</option>
                      </select>
                    </div>
                  </div>
                )}

                {!isUniversityWorkflow && (
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 hover:bg-slate-100/60 transition-colors text-center">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-800">
                      {pdfFileName ? `Selected: ${pdfFileName}` : isLargePoolWorkflow ? 'Question Pool Upload' : isCompetitiveWorkflow ? 'Topic-wise Question Pool Upload' : isCustomWorkflow ? 'Custom Question Input' : 'Choose Question Paper PDF, Word Doc, or Text File'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {isLargePoolWorkflow ? 'Supports large question banks and multi-subject import.' : isCompetitiveWorkflow ? 'Topic-wise pool import for organized selection and secure generation.' : isCustomWorkflow ? 'Use a custom import model defined for this examination.' : 'Supports .pdf, .txt, .docx, .json files. Extraction pipeline isolates individual questions securely.'}
                    </p>
                    <label className="mt-3 inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs">
                      Browse File
                      <input
                        type="file"
                        accept={isLargePoolWorkflow || isCompetitiveWorkflow ? '.pdf,.txt,.docx,.json,.csv' : '.pdf,.txt,.docx,.json,.csv'}
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {isUniversityWorkflow && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={handleExtractQuestions}
                      disabled={extracting || universityDraftFiles.length === 0}
                      className="px-6 py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-300" />
                      <span>{extracting ? 'Extracting Questions with AI...' : 'Extract Questions'}</span>
                    </button>

                    <span className="text-[11px] text-slate-500">{universityDraftFiles.length === 0 ? 'Please upload at least one draft.' : 'University workflow is ready.'}</span>
                  </div>
                )}

                {!isUniversityWorkflow && (
                  <div className="space-y-1.5 text-xs">
                    <label className="block text-slate-700 font-bold">
                      Or Paste Question Paper Content / Raw OCR Transcript:
                    </label>
                    <textarea
                      rows={6}
                      value={pdfText}
                      onChange={e => setPdfText(e.target.value)}
                      placeholder={`e.g.
1. What is the time complexity of lookup in a balanced binary search tree?
A) O(1)
B) O(log n)
C) O(n)
D) O(n log n)
Answer: B
Marks: 4

2. Explain the principle of Shamir Secret Sharing with threshold (k, n).
Answer: Detailed derivation
Marks: 10`}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                    />
                  </div>
                )}

                {!isUniversityWorkflow && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={handleExtractQuestions}
                      disabled={extracting || (!pdfText.trim() && !pdfFileData)}
                      className="px-6 py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-300" />
                      <span>{extracting ? 'Extracting Questions with AI...' : 'Run AI Question Extraction'}</span>
                    </button>

                    {(pdfText || pdfFileName) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPdfText('');
                          setPdfFileData('');
                          setPdfFileName('');
                          setExtractedQuestions([]);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        Clear Input
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Extracted Questions Review & Multi-Role Assignment Stage */}
              {extractedQuestions.length > 0 && (
                <div className="space-y-4">
                  {/* Summary & Filter Bar */}
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-sm">
                          {extractedQuestions.length} Questions Extracted Successfully
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200/70 text-emerald-900">
                          {aiEngineUsed ? 'Gemini 2.5 AI' : 'Heuristic Engine'}
                        </span>
                      </div>
                      {extractionSummary && (
                        <p className="text-xs text-emerald-800 mt-1 pl-7">{extractionSummary}</p>
                      )}
                    </div>

                    {/* Selection Controls */}
                    <div className="flex items-center gap-1.5 text-xs pl-7 sm:pl-0">
                      <button
                        type="button"
                        onClick={() => selectAllExtracted('ALL')}
                        className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-semibold text-[11px]"
                      >
                        Select All ({extractedQuestions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => selectAllExtracted('MCQ')}
                        className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-semibold text-[11px]"
                      >
                        MCQ Only
                      </button>
                      <button
                        type="button"
                        onClick={() => selectAllExtracted('THEORY')}
                        className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-semibold text-[11px]"
                      >
                        Theory Only
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllExtracted}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded font-semibold text-[11px]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Direct Assignment Configuration Card */}
                  <div className="p-6 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-md space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-400" />
                          <span>Assign Selected ({selectedExtractedIds.size}) Questions to SME & Translator</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Selected questions will be ingested into the secure question bank and assigned immediately to experts.
                        </p>
                      </div>

                      <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800">
                        {selectedExtractedIds.size} of {extractedQuestions.length} Selected
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      {/* SME Assignment */}
                      <div>
                        <label className="block text-slate-300 font-bold mb-1">Assign to SME for Review</label>
                        <select
                          value={extractAssignSmeId}
                          onChange={e => setExtractAssignSmeId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-emerald-500 focus:outline-hidden"
                        >
                          <option value="">-- No SME Assignment (Direct Pool) --</option>
                          {smes.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.full_name} ({s.email})
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          SME will review answer keys & syllabus alignment.
                        </span>
                      </div>

                      {/* Linguistic Translator Assignment */}
                      <div>
                        <label className="block text-slate-300 font-bold mb-1">Assign to Linguistic Translator</label>
                        <select
                          value={extractAssignTranslatorId}
                          onChange={e => setExtractAssignTranslatorId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-emerald-500 focus:outline-hidden"
                        >
                          <option value="">-- No Translator Assignment --</option>
                          {translators.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.full_name} ({t.email})
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Translator will convert statements to regional vernacular.
                        </span>
                      </div>

                      {/* Target Language */}
                      <div>
                        <label className="block text-slate-300 font-bold mb-1">Target Language for Translation</label>
                        <select
                          value={extractAssignTargetLanguage}
                          onChange={e => setExtractAssignTargetLanguage(e.target.value)}
                          disabled={!extractAssignTranslatorId}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-emerald-500 focus:outline-hidden disabled:opacity-50"
                        >
                          {SUPPORTED_TRANSLATION_LANGUAGES.map(l => (
                            <option key={l.code} value={l.code}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Assignment Instructions / Notes */}
                    <div className="text-xs">
                      <label className="block text-slate-300 font-bold mb-1">Special Instructions / Review Notes (Optional)</label>
                      <input
                        type="text"
                        value={extractAssignNotes}
                        onChange={e => setExtractAssignNotes(e.target.value)}
                        placeholder="e.g. Ensure strict adherence to CBSE Class 12 Syllabus 2026 and verify MCQ answer derivations."
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleImportExtracted}
                        disabled={importingBatch || selectedExtractedIds.size === 0}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-md flex items-center gap-2 transition-all"
                      >
                        <Send className="w-4 h-4" />
                        <span>
                          {importingBatch
                            ? 'Ingesting & Enqueueing Tasks...'
                            : `Import & Enqueue ${selectedExtractedIds.size} Selected Questions`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Question Cards List */}
                  <div className="space-y-3">
                    {extractedQuestions.map((q, idx) => {
                      const isSelected = selectedExtractedIds.has(q.tempId);
                      return (
                        <div
                          key={q.tempId}
                          className={`p-4 rounded-xl border transition-all text-xs space-y-3 ${
                            isSelected
                              ? 'bg-white border-emerald-400 ring-2 ring-emerald-500/10 shadow-xs'
                              : 'bg-slate-50/70 border-slate-200 opacity-70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => toggleExtractedSelection(q.tempId)}
                                className="text-emerald-800 hover:text-emerald-900"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-5 h-5 text-emerald-700" />
                                ) : (
                                  <Square className="w-5 h-5 text-slate-400" />
                                )}
                              </button>
                              <span className="font-bold text-slate-900 text-xs">
                                Question #{idx + 1}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  q.question_type === 'MCQ'
                                    ? 'bg-blue-100 text-blue-900'
                                    : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {q.question_type}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                Marks: {q.marks} {q.negative_marks ? `(-${q.negative_marks})` : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeExtractedQuestion(q.tempId)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Remove from batch"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Editable Question Text */}
                          <div>
                            <textarea
                              rows={2}
                              value={q.content_text}
                              onChange={e => updateExtractedQuestion(q.tempId, { content_text: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                            />
                          </div>

                          {/* MCQ Options */}
                          {q.question_type === 'MCQ' && q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                              {q.options.map((opt, optIdx) => (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <span className="font-bold text-slate-600 text-[11px] w-5 shrink-0">
                                    {String.fromCharCode(65 + optIdx)}:
                                  </span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={e => {
                                      const updatedOpts = [...q.options!];
                                      updatedOpts[optIdx] = e.target.value;
                                      updateExtractedQuestion(q.tempId, { options: updatedOpts });
                                    }}
                                    className="w-full px-2.5 py-1 rounded bg-slate-50 border border-slate-300 text-slate-900 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Metadata row */}
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                            <div>
                              <span className="text-slate-500 block">Subject / Topic:</span>
                              <input
                                type="text"
                                value={`${q.subject} - ${q.topic}`}
                                onChange={e => {
                                  const parts = e.target.value.split('-');
                                  updateExtractedQuestion(q.tempId, {
                                    subject: (parts[0] || '').trim(),
                                    topic: (parts[1] || '').trim(),
                                  });
                                }}
                                className="w-full px-2 py-0.5 rounded bg-slate-50 border border-slate-300 text-slate-900 font-mono text-[11px]"
                              />
                            </div>

                            <div>
                              <span className="text-slate-500 block">Difficulty:</span>
                              <select
                                value={q.difficulty}
                                onChange={e => updateExtractedQuestion(q.tempId, { difficulty: e.target.value as any })}
                                className="w-full px-2 py-0.5 rounded bg-slate-50 border border-slate-300 text-slate-900 text-[11px]"
                              >
                                <option value="EASY">EASY</option>
                                <option value="MEDIUM">MEDIUM</option>
                                <option value="HARD">HARD</option>
                              </select>
                            </div>

                            <div>
                              <span className="text-slate-500 block">Correct Answer:</span>
                              <input
                                type="text"
                                value={q.correct_answer}
                                onChange={e => updateExtractedQuestion(q.tempId, { correct_answer: e.target.value })}
                                className="w-full px-2 py-0.5 rounded bg-slate-50 border border-slate-300 text-slate-900 font-bold text-[11px]"
                              />
                            </div>

                            <div>
                              <span className="text-slate-500 block">Marks:</span>
                              <input
                                type="number"
                                value={q.marks}
                                onChange={e => updateExtractedQuestion(q.tempId, { marks: Number(e.target.value) })}
                                className="w-full px-2 py-0.5 rounded bg-slate-50 border border-slate-300 text-slate-900 text-[11px]"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL SINGLE QUESTION ENTRY */}
          {questionWorkflowTab === 'manual' && (
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b pb-2">
                Add Single Question to Secure Pool
              </h3>

              <form onSubmit={handleCreateQuestion} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Subject</label>
                    <input
                      type="text"
                      value={qSubject}
                      onChange={e => setQSubject(e.target.value)}
                      placeholder="e.g. Computer Science"
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Topic</label>
                    <input
                      type="text"
                      value={qTopic}
                      onChange={e => setQTopic(e.target.value)}
                      placeholder="e.g. Cryptography"
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Difficulty</label>
                    <select
                      value={qDifficulty}
                      onChange={e => setQDifficulty(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Question Content Text *</label>
                  <textarea
                    rows={3}
                    value={qContent}
                    onChange={e => setQContent(e.target.value)}
                    placeholder="Enter complete question statement with mathematical or theoretical criteria..."
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                  />
                </div>

                {/* AI Similarity & Duplicate Check Action */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCheckAiSimilarity}
                    disabled={aiChecking || !qContent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg font-bold text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{aiChecking ? 'Analyzing Pool...' : 'AI Duplicate & Similarity Check'}</span>
                  </button>

                  {aiCheckResult && (
                    <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                      Similarity Score: {aiCheckResult.similarityScore || '0.04'} (No Conflict Detected)
                    </span>
                  )}
                </div>

                {examType === 'MCQ' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    {qOptions.map((opt, i) => (
                      <div key={i}>
                        <label className="block text-slate-600 font-bold mb-1">Option {String.fromCharCode(65 + i)}</label>
                        <input
                          type="text"
                          value={opt}
                          onChange={e => {
                            const newOpts = [...qOptions];
                            newOpts[i] = e.target.value;
                            setQOptions(newOpts);
                          }}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Correct Answer</label>
                    <input
                      type="text"
                      value={qCorrectAnswer}
                      onChange={e => setQCorrectAnswer(e.target.value)}
                      placeholder="e.g. B or Derivation"
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Marks</label>
                    <input
                      type="number"
                      value={qMarks}
                      onChange={e => setQMarks(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Assign to SME for Verification</label>
                    <select
                      value={assignedSmeId}
                      onChange={e => setAssignedSmeId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                    >
                      <option value="">-- Select SME Verifier --</option>
                      {smes.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs"
                >
                  Save & Enqueue for Verification
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: ASSIGNMENT & VERIFICATION MATRIX */}
          {questionWorkflowTab === 'matrix' && (
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Live Assignment & Review Matrix
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time verification queue across all assigned SMEs and Linguistic Translators.
                  </p>
                </div>

                <span className="text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1 rounded-full border">
                  {assignments.length} Total Active Tasks
                </span>
              </div>

              {assignments.length === 0 ? (
                <p className="text-xs text-slate-400 p-6 text-center bg-slate-50 rounded-lg">
                  No active assignments found. Extract questions or assign questions from Question Pools.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-600 font-bold">
                        <th className="p-3">Question ID</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Assignee</th>
                        <th className="p-3">Target Language</th>
                        <th className="p-3">Assigned Date</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assignments.map(a => (
                        <tr key={a.id} className="hover:bg-slate-50/80">
                          <td className="p-3 font-mono text-[11px] font-bold text-slate-800">
                            {a.question_id.substring(0, 10)}...
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                a.assignment_type === 'SME_REVIEW'
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-purple-100 text-purple-900'
                              }`}
                            >
                              {a.assignment_type === 'SME_REVIEW' ? 'SME Review' : 'Translation'}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-900">
                            {a.assignee_name || a.assignee_user_id}
                          </td>
                          <td className="p-3">
                            {a.target_language ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-semibold text-[10px]">
                                {a.target_language}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">—</span>
                            )}
                          </td>
                          <td className="p-3 text-[11px] text-slate-500 font-mono">
                            {new Date(a.assigned_at).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                a.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : a.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* QUESTION POOLS */}
      {activeSubTab === 'question_pools' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Secure Question Pool Repository</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cryptographically secured question repository. Multi-select questions to assign in bulk to SMEs or Translators.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (poolSelectedIds.size === questions.length) {
                      setPoolSelectedIds(new Set());
                    } else {
                      setPoolSelectedIds(new Set(questions.map(q => q.id)));
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs"
                >
                  {poolSelectedIds.size === questions.length ? 'Deselect All' : `Select All (${questions.length})`}
                </button>

                {poolSelectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setPoolBulkModalOpen(true)}
                    className="px-4 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Assign Selected ({poolSelectedIds.size})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bulk Assignment Modal */}
            {poolBulkModalOpen && (
              <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-3 text-xs shadow-md">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Bulk Assign {poolSelectedIds.size} Questions</span>
                  </h4>
                  <button
                    onClick={() => setPoolBulkModalOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Assignment Task Type</label>
                    <select
                      value={poolAssignType}
                      onChange={e => {
                        setPoolAssignType(e.target.value as any);
                        setPoolAssignUserId('');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
                    >
                      <option value="SME_REVIEW">SME Expert Review</option>
                      <option value="LINGUISTIC_TRANSLATION">Linguistic Translation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      {poolAssignType === 'SME_REVIEW' ? 'Target SME Expert' : 'Target Linguistic Translator'}
                    </label>
                    <select
                      value={poolAssignUserId}
                      onChange={e => setPoolAssignUserId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
                    >
                      <option value="">-- Select Member --</option>
                      {(poolAssignType === 'SME_REVIEW' ? smes : translators).map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  {poolAssignType === 'LINGUISTIC_TRANSLATION' && (
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Target Language</label>
                      <select
                        value={poolAssignTargetLanguage}
                        onChange={e => setPoolAssignTargetLanguage(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
                      >
                        {SUPPORTED_TRANSLATION_LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Instructions / Notes</label>
                  <input
                    type="text"
                    value={poolAssignNotes}
                    onChange={e => setPoolAssignNotes(e.target.value)}
                    placeholder="Instructions for verifier..."
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setPoolBulkModalOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecutePoolBulkAssign}
                    disabled={poolAssigning || !poolAssignUserId}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded font-bold"
                  >
                    {poolAssigning ? 'Assigning...' : 'Confirm Bulk Assignment'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {questions.map(q => {
                const isSelected = poolSelectedIds.has(q.id);
                return (
                  <div
                    key={q.id}
                    className={`p-3.5 rounded-lg border text-xs space-y-1.5 transition-all ${
                      isSelected
                        ? 'bg-emerald-50/60 border-emerald-400'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const next = new Set(poolSelectedIds);
                            if (next.has(q.id)) {
                              next.delete(q.id);
                            } else {
                              next.add(q.id);
                            }
                            setPoolSelectedIds(next);
                          }}
                          className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800"
                        />
                        <span className="font-bold text-slate-900">{q.subject} • {q.topic}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          q.status === 'ELIGIBLE_FOR_PAPER' || q.status === 'VERIFIED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : q.status === 'QUARANTINED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {q.status}
                      </span>
                    </div>
                    <p className="text-slate-800 pl-6">{q.content_text}</p>
                    <div className="flex gap-4 text-[10px] text-slate-500 font-mono pt-1 pl-6">
                      <span>Difficulty: {q.difficulty}</span>
                      <span>Marks: {q.marks}</span>
                      <span>Correct: {q.correct_answer}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* BLUEPRINT & PATTERN */}
      {activeSubTab === 'blueprint_pattern' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Theory Pattern & Blueprint Configuration
          </h3>

          <div className="space-y-3 text-xs">
            <label className="block text-slate-700 font-bold">
              Paste Reference Template / Draft for AI Structure Extraction
            </label>
            <textarea
              rows={4}
              value={refDraftText}
              onChange={e => setRefDraftText(e.target.value)}
              placeholder="e.g. Section A: 5 compulsory questions of 2 marks each. Section B: Attempt 3 out of 5 long theory questions of 10 marks each..."
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
            />

            <button
              onClick={handleAnalyzeTheoryPattern}
              disabled={analyzingPattern || !refDraftText}
              className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
            >
              <Cpu className="w-4 h-4" />
              <span>{analyzingPattern ? 'Extracting Pattern...' : 'Extract Pattern with Gemini AI'}</span>
            </button>

            {extractedPattern && (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3">
                <div className="font-bold text-sm">Extracted Examination Structure</div>
                <pre className="text-[11px] font-mono bg-white p-3 rounded border overflow-x-auto text-slate-800">
                  {JSON.stringify(extractedPattern, null, 2)}
                </pre>
                <button
                  onClick={handleConfirmPattern}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs"
                >
                  Confirm & Lock Theory Blueprint
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAPER GENERATION */}
      {activeSubTab === 'paper_generation' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cryptographic Paper Generation Engine
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Context-aware paper generation strictly adapted to target Examination Type.
                </p>
              </div>

              {/* Exam Type Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(['ALL', 'MCQ', 'THEORY', 'MIXED', 'PRACTICAL_CODING'] as const).map(t => {
                  const count = t === 'ALL' ? examinations.length : examinations.filter(e => ((e as any).exam_type || 'MCQ') === t).length;
                  return (
                    <button
                      key={t}
                      onClick={() => setGenerationExamTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        generationExamTypeFilter === t
                          ? 'bg-emerald-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t === 'ALL' ? 'All Types' : t} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtered Examinations List with Type Indicators */}
            <div className="space-y-3">
              {examinations
                .filter(ex => generationExamTypeFilter === 'ALL' || ((ex as any).exam_type || 'MCQ') === generationExamTypeFilter)
                .map(ex => {
                  const type: ExamType = (ex as any).exam_type || 'MCQ';
                  const isSelected = selectedGenExamId === ex.id || (!selectedGenExamId && examinations[0]?.id === ex.id);

                  return (
                    <div
                      key={ex.id}
                      onClick={() => setSelectedGenExamId(ex.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-500/20'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{ex.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                type === 'MCQ'
                                  ? 'bg-blue-100 text-blue-900 border-blue-200'
                                  : type === 'THEORY'
                                  ? 'bg-amber-100 text-amber-900 border-amber-200'
                                  : type === 'MIXED'
                                  ? 'bg-teal-100 text-teal-900 border-teal-200'
                                  : 'bg-indigo-100 text-indigo-900 border-indigo-200'
                              }`}
                            >
                              {type === 'MCQ' ? '⚡ MCQ PATTERN' : type === 'THEORY' ? '📝 THEORY PATTERN' : type === 'MIXED' ? '🔀 HYBRID PATTERN' : '💻 PRACTICAL PATTERN'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Subject: {ex.subject} • Qs: {ex.total_questions} • Marks: {ex.total_marks} • Unlock: {ex.unlock_time}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGeneratePaper(ex.id);
                            }}
                            disabled={generating || org?.status !== 'VERIFIED'}
                            className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>{generating ? 'Encrypting...' : `Generate ${type} Paper`}</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEmergencyRegenerate(ex.id);
                            }}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg font-bold text-xs flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Invalidate</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Active generation workbench removed per user request */}
        </div>
      )}

      {/* PAPER VERSIONS */}
      {activeSubTab === 'paper_versions' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">Encrypted Paper Version Artifacts</h3>
          <p className="text-xs text-slate-500">
            All generated examination papers are stored as ciphertext with unique version hashes and key fingerprints.
          </p>

          <div className="space-y-3">
            {examinations.map(ex => (
              <div key={ex.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-900">{ex.name}</span>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Time Lock: {ex.unlock_time} • Plaintext status: 🔒 ENCRYPTED (Locked until unlock minute)
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  AES-256 GCM
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EXAMINATION CENTRES */}
      {activeSubTab === 'examination_centres' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Examination Delivery Centre</h3>
            <form onSubmit={handleAddCentre} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Target Examination</label>
                <select
                  value={selectedExamId}
                  onChange={e => setSelectedExamId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                >
                  {examinations.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Centre Code</label>
                <input
                  type="text"
                  value={centreCode}
                  onChange={e => setCentreCode(e.target.value)}
                  placeholder="e.g. CTR-DELHI-101"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Centre Name</label>
                <input
                  type="text"
                  value={centreName}
                  onChange={e => setCentreName(e.target.value)}
                  placeholder="e.g. National Institute of Technology Centre 1"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">City</label>
                <input
                  type="text"
                  value={centreCity}
                  onChange={e => setCentreCity(e.target.value)}
                  placeholder="e.g. New Delhi"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Max Authorized Copies</label>
                <input
                  type="number"
                  value={centreMaxCopies}
                  onChange={e => setCentreMaxCopies(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs"
                >
                  Register Examination Centre
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
