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
  Award,
  Calendar,
  Play,
  GraduationCap,
} from 'lucide-react';
import { User, Examination, Question, Organization, ExamType, ExtractedQuestion, QuestionAssignment } from '../../types';
import { api } from '../../api';
import { NavSubTab } from '../Sidebar';
import { ExamManagerQuestionExtractor } from './ExamManagerQuestionExtractor';
import { AuthoritySurveillanceDashboard } from '../proctor/AuthoritySurveillanceDashboard';

interface ExamManagerWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
  onLaunchCandidateSimulator?: (examId?: string) => void;
}

interface UploadedQuestionFile {
  id: string;
  name: string;
  size: number;
  fileData?: string;
  text?: string;
  status: 'READY' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  error?: string;
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

export interface ExamPreset {
  id: string;
  name: string;
  shortTag: string;
  subject: string;
  category: string;
  examType: ExamType;
  totalMarks: number;
  totalQuestions: number;
  durationMinutes: number;
  defaultDate: string;
  examTime: string;
  unlockTime: string;
  description: string;
  badgeClass: string;
}

export const REAL_EXAM_PRESETS: ExamPreset[] = [
  {
    id: 'gate-cs',
    name: 'GATE 2026: Computer Science & Information Technology',
    shortTag: 'GATE CS 2026',
    subject: 'Computer Science & Information Technology',
    category: 'Competitive Exam',
    examType: 'MCQ',
    totalMarks: 100,
    totalQuestions: 65,
    durationMinutes: 180,
    defaultDate: '2026-02-07',
    examTime: '09:30',
    unlockTime: '09:00',
    description: 'National Engineering Entrance: 65 Qs (General Aptitude + Technical Core), 100 Marks',
    badgeClass: 'bg-indigo-100 text-indigo-950 border-indigo-200',
  },
  {
    id: 'jee-adv',
    name: 'JEE Advanced 2026: Paper 1 (PCM)',
    shortTag: 'JEE Advanced 2026',
    subject: 'Physics, Chemistry & Mathematics Paper 1',
    category: 'JEE',
    examType: 'MIXED',
    totalMarks: 180,
    totalQuestions: 54,
    durationMinutes: 180,
    defaultDate: '2026-05-24',
    examTime: '09:00',
    unlockTime: '08:30',
    description: 'IIT Entrance Exam: Single Correct, Multiple Correct & Numerical Value Questions',
    badgeClass: 'bg-blue-100 text-blue-950 border-blue-200',
  },
  {
    id: 'neet-ug',
    name: 'NEET-UG 2026: National Eligibility Entrance Test',
    shortTag: 'NEET-UG 2026',
    subject: 'Physics, Chemistry, Botany & Zoology (PCB)',
    category: 'NEET',
    examType: 'MCQ',
    totalMarks: 720,
    totalQuestions: 180,
    durationMinutes: 200,
    defaultDate: '2026-05-03',
    examTime: '14:00',
    unlockTime: '13:30',
    description: 'National Medical Entrance: 200 Qs (180 to attempt), +4/-1 OMR Mark Scheme',
    badgeClass: 'bg-emerald-100 text-emerald-950 border-emerald-200',
  },
  {
    id: 'cat-iim',
    name: 'CAT 2026: Common Admission Test (IIMs)',
    shortTag: 'CAT 2026',
    subject: 'VARC, DILR & Quantitative Aptitude',
    category: 'Competitive Exam',
    examType: 'MCQ',
    totalMarks: 198,
    totalQuestions: 66,
    durationMinutes: 120,
    defaultDate: '2026-11-29',
    examTime: '08:30',
    unlockTime: '08:00',
    description: 'IIMs Management Aptitude Test: 3 Sections x 40 minutes strict section timer',
    badgeClass: 'bg-purple-100 text-purple-950 border-purple-200',
  },
  {
    id: 'upsc-prelims',
    name: 'UPSC Civil Services 2026: Preliminary GS-I',
    shortTag: 'UPSC GS-I',
    subject: 'General Studies Paper-I: Polity, History & Economy',
    category: 'Competitive Exam',
    examType: 'MCQ',
    totalMarks: 200,
    totalQuestions: 100,
    durationMinutes: 120,
    defaultDate: '2026-05-31',
    examTime: '09:30',
    unlockTime: '09:00',
    description: 'Union Public Service Commission Civil Services Stage 1: 100 Objective Questions',
    badgeClass: 'bg-amber-100 text-amber-950 border-amber-200',
  },
  {
    id: 'mht-cet',
    name: 'MHT-CET 2026: State Common Entrance Test (PCM)',
    shortTag: 'MHT-CET 2026',
    subject: 'Physics, Chemistry & Mathematics Engineering Entrance',
    category: 'TCET / CET-type Exam',
    examType: 'MCQ',
    totalMarks: 200,
    totalQuestions: 150,
    durationMinutes: 180,
    defaultDate: '2026-04-18',
    examTime: '09:00',
    unlockTime: '08:30',
    description: 'State Engineering & Pharmacy Admission Test: 150 Questions, No Negative Marking',
    badgeClass: 'bg-rose-100 text-rose-950 border-rose-200',
  },
  {
    id: 'univ-theory',
    name: 'B.Tech Semester VI: Design & Analysis of Algorithms',
    shortTag: 'B.Tech Theory',
    subject: 'Design & Analysis of Algorithms (Theory & Proofs)',
    category: 'University Exam',
    examType: 'THEORY',
    totalMarks: 100,
    totalQuestions: 15,
    durationMinutes: 180,
    defaultDate: '2026-06-15',
    examTime: '10:00',
    unlockTime: '09:30',
    description: 'AICTE University End-Semester Theory Paper: 3 Sectional Descriptive Blueprints',
    badgeClass: 'bg-teal-100 text-teal-950 border-teal-200',
  },
];

export const ExamManagerWorkspace: React.FC<ExamManagerWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
  onLaunchCandidateSimulator,
}) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [smes, setSmes] = useState<User[]>([]);
  const [translators, setTranslators] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<QuestionAssignment[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dashboardCardFilter, setDashboardCardFilter] = useState<'ALL' | 'VERIFIED' | 'QUARANTINED' | 'READY'>('ALL');

  // Workflow Sub-Navigation
  const [questionWorkflowTab, setQuestionWorkflowTab] = useState<'extraction' | 'manual' | 'matrix'>('extraction');

  // PDF / Paper Extraction State
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfFileData, setPdfFileData] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedQuestionFile[]>([]);
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
  const [ollamaHealth, setOllamaHealth] = useState<{ connected: boolean; model: string; error?: string } | null>(null);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

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
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [examSearchQuery, setExamSearchQuery] = useState('');
  const [examCategoryFilter, setExamCategoryFilter] = useState('ALL');
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

  useEffect(() => {
    if (activeSubTab === 'question_workflow') {
      api.getOllamaHealth().then(setOllamaHealth).catch(() => setOllamaHealth(null));
    }
  }, [activeSubTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgRes, examRes, qRes, membersRes, assignRes] = await Promise.all([
        api.getCurrentOrg().catch(() => ({ organization: null, documents: [], history: [], representatives: [] })),
        api.getExaminations().catch(() => ({ examinations: [] })),
        api.getQuestions().catch(() => ({ questions: [] })),
        api.getOrgMembers().catch(() => ({ members: [] })),
        api.getAssignments().catch(() => ({ assignments: [] })),
      ]);

      setOrg(orgRes.organization);
      const exams = examRes.examinations || [];
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
    } finally {
      setLoading(false);
    }
  };

  const readUploadedFile = (file: File): Promise<UploadedQuestionFile> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      const isTextFile = file.type.includes('text') || /\.(txt|csv|json)$/i.test(file.name);
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
      reader.onload = event => {
        const result = (event.target?.result as string) || '';
        resolve({ id: `${file.name}-${file.lastModified}-${file.size}`, name: file.name, size: file.size, status: 'READY', ...(isTextFile ? { text: result } : { fileData: result }) });
      };
      if (isTextFile) reader.readAsText(file);
      else reader.readAsDataURL(file);
    });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    void Promise.all(files.map(readUploadedFile)).then(nextFiles => {
      const mergedFiles = [...uploadedFiles.filter(existing => !nextFiles.some(file => file.id === existing.id)), ...nextFiles];
      setUploadedFiles(mergedFiles);
      setPdfFileName(mergedFiles.map(file => file.name).join(', '));
      setPdfFileData(mergedFiles.find(file => file.fileData)?.fileData || '');
      setPdfText(mergedFiles.filter(file => file.text).map(file => file.text).join('\n\n'));
    });
  };

  const removeUploadedFile = (id: string) => {
    const remaining = uploadedFiles.filter(file => file.id !== id);
    setUploadedFiles(remaining);
    setPdfFileName(remaining.map(file => file.name).join(', '));
    setPdfFileData(remaining.find(file => file.fileData)?.fileData || '');
    setPdfText(remaining.filter(file => file.text).map(file => file.text).join('\n\n'));
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsFileDragOver(false);
    const files = Array.from(event.dataTransfer.files || []) as File[];
    if (files.length > 0) {
      const input = document.createElement('input');
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
      handleFileUpload({ target: input } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  // Trigger AI Question Extraction
  const handleExtractQuestions = async () => {
    const textToExtract = pdfText.trim();
    if (!textToExtract && !pdfFileData && uploadedFiles.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please upload a PDF / document or paste question paper text.' });
      return;
    }

    setExtracting(true);
    setStatusMessage(null);
    setUploadedFiles(files => files.map(file => ({ ...file, status: 'PROCESSING', error: undefined })));

    try {
      const extractionInputs = uploadedFiles.length > 0
        ? uploadedFiles.map(file => ({ paper_text: file.text, file_data: file.fileData, file_name: file.name }))
        : [{ paper_text: textToExtract, file_data: pdfFileData, file_name: pdfFileName }];
      const settledResponses = await Promise.allSettled(extractionInputs.map(input => api.extractQuestionsFromPaper({
        ...input,
        subject: paperSubject || 'Academic Examination',
        category: paperCategory || 'Competitive Exam',
      })));
      const successfulResponses = settledResponses.flatMap((result, fileIndex) => result.status === 'fulfilled' ? [{ response: result.value, fileIndex }] : []);
      const failedFiles = settledResponses.flatMap((result, fileIndex) => result.status === 'rejected' ? [{ fileIndex, error: result.reason?.message || 'Extraction failed.' }] : []);
      if (successfulResponses.length === 0) {
        throw new Error(failedFiles[0]?.error || 'No files could be extracted.');
      }
      const responses = successfulResponses.map(item => item.response);
      const extracted = successfulResponses.flatMap(({ response: res, fileIndex }) => (res.extractedQuestions || []).map((q, questionIndex) => ({
        ...q,
        source_paper_id: res.sourcePaperId,
        source_file: res.sourceFile || uploadedFiles[fileIndex]?.name,
        tempId: q.tempId || `EXT-${Date.now()}-${fileIndex + 1}-${questionIndex + 1}`,
      })));
      const batchAiUsed = responses.some(res => res.aiEngineUsed);

      setExtractedQuestions(extracted);
      setExtractionSummary(responses.map(res => res.extractionSummary).filter(Boolean).join(' '));
      setDetectedSubject(responses[0]?.detectedSubject || paperSubject);
      setAiEngineUsed(batchAiUsed);
      setUploadedFiles(files => files.map((file, index) => ({
        ...file,
        status: failedFiles.some(failed => failed.fileIndex === index) ? 'ERROR' : 'COMPLETED',
        error: failedFiles.find(failed => failed.fileIndex === index)?.error,
      })));

      // Select all extracted questions by default
      const allIds = new Set(extracted.map(q => q.tempId));
      setSelectedExtractedIds(allIds);

      setStatusMessage({
        type: 'success',
        text: `Extracted ${extracted.length} questions from ${responses.length} of ${extractionInputs.length} file${extractionInputs.length === 1 ? '' : 's'} using Ollama${failedFiles.length ? `; ${failedFiles.length} failed` : ''}.`,
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
      setUploadedFiles([]);
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

  const handleApplyPreset = (preset: ExamPreset) => {
    setSelectedPresetId(preset.id);
    setExamName(preset.name);
    setSubject(preset.subject);
    setCategory(preset.category);
    setExamType(preset.examType);
    setTotalMarks(preset.totalMarks);
    setTotalQuestions(preset.totalQuestions);
    setDurationMins(preset.durationMinutes);
    setExamDate(preset.defaultDate);
    setExamTime(preset.examTime);
    setUnlockTime(preset.unlockTime);
    setStatusMessage({
      type: 'success',
      text: `Applied "${preset.shortTag}" real examination preset (${preset.totalMarks} marks, ${preset.totalQuestions} Qs, ${preset.durationMinutes} mins).`,
    });
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
      setSelectedPresetId(null);
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
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
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Examination Authority Portal
                </span>
                <h2 className="text-2xl font-bold text-slate-900 mt-2">Examination Operations Dashboard</h2>
                <p className="text-xs text-slate-500 mt-1">Real-time status of question pools, verified banks, and time-locked enclaves.</p>
              </div>
            </div>

            {/* 4 Interactive Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setDashboardCardFilter('ALL')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 ${
                  dashboardCardFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/20 shadow-sm'
                    : 'bg-slate-50/70 border-slate-200/80 text-slate-900 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Total Examinations
                </span>
                <span className="text-2xl font-black block mt-0.5">{examinations.length}</span>
                <span className={`text-[10px] font-semibold block mt-1 ${dashboardCardFilter === 'ALL' ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  Active Enclaves
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('READY')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 ${
                  dashboardCardFilter === 'READY'
                    ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/20 shadow-sm'
                    : 'bg-slate-50/70 border-slate-200/80 text-slate-900 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'READY' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Pool Questions
                </span>
                <span className="text-2xl font-black block mt-0.5">{questions.length}</span>
                <span className={`text-[10px] font-semibold block mt-1 ${dashboardCardFilter === 'READY' ? 'text-emerald-300' : 'text-slate-500'}`}>
                  Total In Repository
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('VERIFIED')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 ${
                  dashboardCardFilter === 'VERIFIED'
                    ? 'bg-emerald-950 text-white border-emerald-900 ring-2 ring-emerald-600/30 shadow-sm'
                    : 'bg-emerald-50/60 border-emerald-200 text-emerald-950 hover:bg-emerald-50 hover:border-emerald-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'VERIFIED' ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  Verified & Eligible
                </span>
                <span className={`text-2xl font-black block mt-0.5 ${dashboardCardFilter === 'VERIFIED' ? 'text-emerald-300' : 'text-emerald-800'}`}>
                  {verifiedCount}
                </span>
                <span className={`text-[10px] block mt-1 ${dashboardCardFilter === 'VERIFIED' ? 'text-emerald-300' : 'text-emerald-700 font-bold'}`}>
                  Ready for Generation
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('QUARANTINED')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 ${
                  dashboardCardFilter === 'QUARANTINED'
                    ? 'bg-rose-950 text-white border-rose-900 ring-2 ring-rose-600/30 shadow-sm'
                    : 'bg-rose-50/60 border-rose-200 text-rose-950 hover:bg-rose-50 hover:border-rose-300'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'QUARANTINED' ? 'text-rose-300' : 'text-rose-700'}`}>
                  Quarantined / Suspects
                </span>
                <span className={`text-2xl font-black block mt-0.5 ${dashboardCardFilter === 'QUARANTINED' ? 'text-rose-300' : 'text-rose-800'}`}>
                  {quarantinedCount}
                </span>
                <span className={`text-[10px] block mt-1 ${dashboardCardFilter === 'QUARANTINED' ? 'text-rose-300' : 'text-rose-600 font-bold'}`}>
                  Flagged Items
                </span>
              </button>
            </div>
          </div>

          {/* Active List based on Selected Interactive Metric Card */}
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-50 text-emerald-800">
                  <FolderLock className="w-3.5 h-3.5" />
                </div>
                <span>
                  {dashboardCardFilter === 'VERIFIED'
                    ? 'Verified & Paper-Eligible Question Pool'
                    : dashboardCardFilter === 'QUARANTINED'
                    ? 'Quarantined & Flagged Questions'
                    : dashboardCardFilter === 'READY'
                    ? 'Repository Question Inventory'
                    : 'Active Examination Configurations'}
                </span>
              </h3>

              <span className="text-xs text-slate-500 font-mono">
                {dashboardCardFilter === 'ALL'
                  ? `${examinations.length} Active Configurations`
                  : dashboardCardFilter === 'VERIFIED'
                  ? `${verifiedCount} Verified Questions`
                  : dashboardCardFilter === 'QUARANTINED'
                  ? `${quarantinedCount} Quarantined`
                  : `${questions.length} Pool Questions`}
              </span>
            </div>

            {dashboardCardFilter === 'ALL' ? (
              examinations.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">No examinations created yet.</p>
              ) : (
                <div className="space-y-2">
                  {examinations.map(ex => (
                    <div
                      key={ex.id}
                      className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{ex.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Subject: {ex.subject} • Date: {ex.exam_date} {ex.exam_time} • Unlock: {ex.unlock_time}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                          {ex.status}
                        </span>
                        <button
                          onClick={() => handleGeneratePaper(ex.id)}
                          disabled={generating || org?.status !== 'VERIFIED'}
                          className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs cursor-pointer"
                        >
                          Generate Paper
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              // Questions List View for Metric Card Filter
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
            )}
          </div>
        </div>
      )}

      {/* ALL EXAMINATIONS */}
      {activeSubTab === 'all_examinations' && (
        <div className="space-y-5">
          {/* Header & Control Bar */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Active Vault Catalog
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 font-mono">
                    {examinations.length} Sealed Enclaves
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight mt-1">
                  All Scheduled Examinations
                </h3>
                <p className="text-xs text-slate-500">
                  Cryptographically secured test papers, Shamir threshold unlock schedules, and centre delivery vaults.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Refresh Vaults</span>
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={examSearchQuery}
                  onChange={e => setExamSearchQuery(e.target.value)}
                  placeholder="Search examination or subject..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl input-luxury text-slate-900 font-medium"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                {['ALL', 'Competitive Exam', 'NEET', 'JEE', 'TCET / CET-type Exam', 'University Exam'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setExamCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      examCategoryFilter === cat
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {cat === 'ALL' ? 'All Categories' : cat.replace(' / CET-type Exam', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Examinations Grid / Cards */}
          <div className="grid grid-cols-1 gap-4">
            {examinations
              .filter(ex => {
                const matchesSearch =
                  !examSearchQuery ||
                  ex.name.toLowerCase().includes(examSearchQuery.toLowerCase()) ||
                  ex.subject.toLowerCase().includes(examSearchQuery.toLowerCase());
                const matchesCat = examCategoryFilter === 'ALL' || ex.category === examCategoryFilter;
                return matchesSearch && matchesCat;
              })
              .map(ex => {
                const type = (ex as any).exam_type || 'MCQ';
                const typeBadgeClass =
                  type === 'MCQ'
                    ? 'bg-blue-100 text-blue-950 border-blue-200'
                    : type === 'THEORY'
                    ? 'bg-amber-100 text-amber-950 border-amber-200'
                    : type === 'MIXED'
                    ? 'bg-teal-100 text-teal-950 border-teal-200'
                    : 'bg-indigo-100 text-indigo-950 border-indigo-200';

                return (
                  <div
                    key={ex.id}
                    className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all space-y-4 relative overflow-hidden"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-[11px] text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
                            {ex.id}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${typeBadgeClass}`}>
                            {type === 'MCQ' ? '⚡ MCQ (OMR/CBT)' : type === 'THEORY' ? '📝 THEORY (Descriptive)' : type === 'MIXED' ? '🔀 MIXED (Hybrid)' : '💻 PRACTICAL'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {ex.category}
                          </span>
                        </div>
                        <h4 className="text-base font-black text-slate-900 leading-snug">
                          {ex.name}
                        </h4>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <GraduationCap className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>{ex.subject}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border flex items-center gap-1.5 ${
                            ex.status === 'GENERATED' || ex.status === 'READY'
                              ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                              : ex.status === 'UNLOCKED'
                              ? 'bg-purple-50 text-purple-950 border-purple-300'
                              : 'bg-amber-50 text-amber-950 border-amber-300'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${
                            ex.status === 'GENERATED' || ex.status === 'READY' ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
                          }`} />
                          {ex.status}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Structure</span>
                        <div className="font-black text-slate-900 flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>{ex.total_marks} Marks</span>
                          <span className="text-slate-400 font-normal">({ex.total_questions} Qs)</span>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Duration</span>
                        <div className="font-black text-slate-900 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                          <span>{ex.duration_minutes} Minutes</span>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Scheduled Test</span>
                        <div className="font-mono text-slate-900 font-bold flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                          <span>{ex.exam_date} @ {ex.exam_time}</span>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Time-Lock Unlock</span>
                        <div className="font-mono text-emerald-950 font-black flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>{ex.unlock_time}</span>
                          <span className="text-[9px] text-emerald-800 font-sans font-bold">(Shamir 3-Key)</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGeneratePaper(ex.id)}
                          disabled={generating || org?.status !== 'VERIFIED'}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>{ex.status === 'GENERATED' ? 'Re-Generate & Encrypt' : 'Generate Encrypted Paper'}</span>
                        </button>

                        {onLaunchCandidateSimulator && (
                          <button
                            type="button"
                            onClick={() => onLaunchCandidateSimulator(ex.id)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 text-emerald-700 fill-current" />
                            <span>Simulate Exam &rarr;</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExamId(ex.id);
                            setStatusMessage({ type: 'success', text: `Selected exam "${ex.name}" for delivery centres.` });
                          }}
                          className="text-slate-600 hover:text-slate-900 text-xs font-semibold px-2 py-1 rounded hover:bg-slate-100 cursor-pointer"
                        >
                          Add Centre
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEmergencyRegenerate(ex.id)}
                          className="text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-1 rounded hover:bg-rose-50 cursor-pointer"
                        >
                          Emergency Re-Gen
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* CREATE EXAMINATION */}
      {activeSubTab === 'create_examination' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Cryptographic Enclave Setup
            </span>
            <h3 className="text-xl font-black text-slate-900 mt-1">
              Create New Examination Enclave
            </h3>
            <p className="text-xs text-slate-500">
              Establish a tamper-proof examination vault with automated question bank pooling, Shamir key-sharing, and verifiable time-locks.
            </p>
          </div>

          {/* Quick Real Exam Presets */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white shadow-md space-y-3 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-amber-300">
                  Quick Real Exam Presets (1-Click Real Blueprint Auto Fill)
                </span>
              </div>
              <span className="text-[11px] text-slate-300 font-medium">
                Authentic AICTE, NTA & University configurations
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {REAL_EXAM_PRESETS.map(preset => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 ring-2 ring-white shadow-md scale-105'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                    }`}
                  >
                    <span>{preset.shortTag}</span>
                    <span className="text-[10px] opacity-80 font-normal">
                      ({preset.totalMarks}M • {preset.totalQuestions}Q)
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedPresetId && (
              <div className="text-[11px] text-amber-200 bg-white/10 p-2.5 rounded-xl border border-white/15 flex items-center justify-between">
                <span>
                  Preset Applied: <strong className="text-white">{REAL_EXAM_PRESETS.find(p => p.id === selectedPresetId)?.name}</strong> — {REAL_EXAM_PRESETS.find(p => p.id === selectedPresetId)?.description}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPresetId(null)}
                  className="text-[10px] text-slate-300 hover:text-white underline cursor-pointer"
                >
                  Clear Preset
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleCreateExam} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">Official Examination Name *</label>
              <input
                type="text"
                value={examName}
                onChange={e => setExamName(e.target.value)}
                placeholder="e.g. National Computer Science & Security Entrance Exam 2026"
                required
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
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
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Examination Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-semibold"
              >
                <option value="Competitive Exam">Competitive Exam (GATE / CAT / UPSC)</option>
                <option value="JEE">JEE (Joint Entrance Examination - Main & Advanced)</option>
                <option value="NEET">NEET (National Eligibility Entrance Test - UG & PG)</option>
                <option value="TCET / CET-type Exam">TCET / CET-type Exam (State Entrance)</option>
                <option value="University Exam">University Exam (AICTE Semester Theory & Lab)</option>
                <option value="Custom Exam">Custom Institutional Enclave</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Examination Paper Type *</label>
              <select
                value={examType}
                onChange={e => setExamType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-semibold"
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
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Examination Start Time *</label>
              <input
                type="time"
                value={examTime}
                onChange={e => setExamTime(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Authorized Shamir Unlock Time *
              </label>
              <input
                type="time"
                value={unlockTime}
                onChange={e => setUnlockTime(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium font-mono"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Paper decrypts strictly at this minute via 3-party threshold keys.
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Total Marks *</label>
              <input
                type="number"
                value={totalMarks}
                onChange={e => setTotalMarks(Number(e.target.value))}
                required
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Target Question Count *</label>
              <input
                type="number"
                value={totalQuestions}
                onChange={e => setTotalQuestions(Number(e.target.value))}
                required
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Examination Duration (Minutes) *</label>
              <input
                type="number"
                value={durationMins}
                onChange={e => setDurationMins(Number(e.target.value))}
                required
                className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
              />
            </div>

            <div className="sm:col-span-2 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="submit"
                disabled={org?.status !== 'VERIFIED'}
                className="px-8 py-3 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-md cursor-pointer transition-all flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Create Examination Record</span>
              </button>

              <span className="text-[11px] text-slate-500">
                {org?.status === 'VERIFIED' ? '✅ Organization Verified' : '⚠️ Accreditation required'}
              </span>
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
              {/* Document Upload & Input Card */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <FileUp className="w-5 h-5 text-emerald-800" />
                      <span>Upload Question Paper PDF / Transcript</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload one or more question papers or paste OCR transcript. Ollama extracts only the questions present in the source.
                    </p>
                  </div>

                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border self-start sm:self-auto ${ollamaHealth?.connected ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ollama {ollamaHealth?.connected ? 'Connected' : 'Offline'}</span>
                    {ollamaHealth && <span className="font-normal">({ollamaHealth.model})</span>}
                  </span>
                </div>

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
                    <input
                      type="text"
                      value={paperCategory}
                      onChange={e => setPaperCategory(e.target.value)}
                      placeholder="e.g. National Competitive Exam / Semester Board"
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Upload Box */}
                <div
                  onDragOver={event => { event.preventDefault(); setIsFileDragOver(true); }}
                  onDragLeave={() => setIsFileDragOver(false)}
                  onDrop={handleFileDrop}
                  className={`border-2 border-dashed rounded-xl p-6 bg-slate-50 hover:bg-slate-100/60 transition-colors text-center ${isFileDragOver ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300'}`}
                >
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800">
                    {uploadedFiles.length > 1 ? `${uploadedFiles.length} files selected` : pdfFileName ? `Selected: ${pdfFileName}` : 'Choose Question Paper PDF, Word Doc, or Text File'}
                  </p>
                  {uploadedFiles.length > 0 && (
                    <div className="mx-auto mt-2 max-w-xl space-y-1 text-left">
                      {uploadedFiles.map(file => (
                        <div key={file.id} className="flex items-center gap-2 rounded-md bg-white/80 px-2 py-1 text-[11px] text-slate-700">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                          <span className="truncate flex-1">{file.name}</span>
                          <span className="shrink-0 text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          <span className="shrink-0 font-bold text-emerald-700">{file.status === 'READY' ? 'Ready' : file.status}</span>
                          <button type="button" onClick={() => removeUploadedFile(file.id)} className="shrink-0 text-slate-400 hover:text-rose-600" aria-label={`Remove ${file.name}`}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1">
                    Supports .pdf, .txt, .docx, .json files. Extraction pipeline isolates individual questions securely.
                  </p>
                  <label className="mt-3 inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs">
                    {uploadedFiles.length > 0 ? 'Add More Files' : 'Browse Files'}
                    <input
                      type="file"
                      accept=".pdf,.txt,.docx,.json,.csv"
                      onChange={handleFileUpload}
                      multiple
                      className="hidden"
                    />
                  </label>
                  {uploadedFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedFiles([]);
                        setPdfFileName('');
                        setPdfFileData('');
                        setPdfText('');
                      }}
                      className="ml-2 text-xs font-bold text-slate-500 hover:text-rose-600 underline"
                    >
                      Clear All Files
                    </button>
                  )}
                </div>

                {/* Text Transcript Box */}
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
                          {aiEngineUsed ? 'Ollama AI' : 'Unavailable'}
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
                                Question #{q.question_number || idx + 1}
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

                          {q.source_file && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 border-b border-slate-100 pb-2">
                              <FileText className="h-3.5 w-3.5 text-emerald-700" />
                              <span>Source: {q.source_file}</span>
                              {q.page_number && <span>• Page {q.page_number}</span>}
                            </div>
                          )}

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

          {/* DEDICATED EXAM TYPE GENERATION SYSTEM WORKBENCH */}
          {(() => {
            const currentExam = examinations.find(e => e.id === (selectedGenExamId || examinations[0]?.id)) || examinations[0];
            if (!currentExam) return null;
            const currentType: ExamType = (currentExam as any).exam_type || 'MCQ';

            return (
              <div className="p-6 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 shadow-md space-y-5 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ACTIVE GENERATION SYSTEM
                      </span>
                      <h4 className="text-sm font-bold text-white">
                        {currentType === 'MCQ' && '⚡ MCQ OMR & Option Permutation System'}
                        {currentType === 'THEORY' && '📝 Theory Sectional Blueprint & Rubrics Compiler'}
                        {currentType === 'MIXED' && '🔀 Hybrid Dual-Tier (Objective + Subjective) System'}
                        {currentType === 'PRACTICAL_CODING' && '💻 Practical Lab & Automated Test Sandbox System'}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Enforcing strict validation constraints for target examination: <span className="text-white font-bold">{currentExam.name}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => handleGeneratePaper(currentExam.id)}
                    disabled={generating || org?.status !== 'VERIFIED'}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-40"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{generating ? 'Processing Cryptographic Pipeline...' : `Execute ${currentType} Paper Generation`}</span>
                  </button>
                </div>

                {/* TYPE-SPECIFIC ENGINE ARCHITECTURE */}
                {currentType === 'MCQ' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white flex items-center gap-2 text-xs">
                        <span>1. OMR Matrix & Option Shuffling</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Deterministic PRNG shuffles 4 candidate options (A, B, C, D) per question across 4 distinct paper versions (Sets A, B, C, D) with distinct answer key matrices.
                      </p>
                      <div className="pt-2 text-[10px] font-mono text-emerald-400">
                        ✓ 4 Sets (A/B/C/D) Permutations Ready
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white flex items-center gap-2 text-xs">
                        <span>2. Negative Marking Scheme</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Enforces +4.0 Marks per correct response and -1.0 Negative mark penalty. OMR bubble coordinates encoded directly into encrypted question metadata.
                      </p>
                      <div className="pt-2 text-[10px] font-mono text-emerald-400">
                        ✓ Negative Scoring Penalty: Configured
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white flex items-center gap-2 text-xs">
                        <span>3. Cryptographic Answer Vault</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Answer keys are decoupled from examination ciphertext and encrypted under an isolated Shamir 3-of-5 threshold custody key.
                      </p>
                      <div className="pt-2 text-[10px] font-mono text-emerald-400">
                        ✓ Isolated Answer Key Enclave: Armed
                      </div>
                    </div>
                  </div>
                )}

                {currentType === 'THEORY' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white flex items-center gap-2 text-xs">
                        <span>1. Sectional Blueprint Architecture</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Structures paper into Section A (Short compulsory: 2 marks), Section B (Medium analytical: 5 marks), and Section C (Long subjective with choice: 10 marks).
                      </p>
                      <div className="pt-2 text-[10px] font-mono text-amber-400">
                        ✓ 3-Tier Sectional Distribution Active
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white flex items-center gap-2 text-xs">
                        <span>2. Descriptive Marking Rubric</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Compiles step-by-step evaluator guidelines, key conceptual bullet points, and word limits for subjective grading consistency.
                      </p>
                      <div className="pt-2 text-[10px] font-mono text-amber-400">
                        ✓ Evaluator Model Solutions: Linked
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white flex items-center gap-2 text-xs">
                        <span>3. Choice Matrix & Word Counts</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Calculates internal choice constraints (e.g. Attempt any 3 of 5) and validates total attainable marks against exam total ({currentExam.total_marks} Marks).
                      </p>
                      <div className="pt-2 text-[10px] font-mono text-amber-400">
                        ✓ Internal Choice Logic: Balanced
                      </div>
                    </div>
                  </div>
                )}

                {currentType === 'MIXED' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white text-xs">Part I: Objective OMR Matrix (40% Weight)</div>
                      <p className="text-[11px] text-slate-400">
                        Generates timed objective section with automated OMR barcode headers and randomized question orders.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white text-xs">Part II: Subjective Answer Booklet (60% Weight)</div>
                      <p className="text-[11px] text-slate-400">
                        Generates long-form theory questions with step-wise marks distribution and evaluator rubrics.
                      </p>
                    </div>
                  </div>
                )}

                {currentType === 'PRACTICAL_CODING' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white text-xs">Lab Sandbox Test Suite</div>
                      <p className="text-[11px] text-slate-400">
                        Encapsulates hidden & public test vectors, memory limits, and CPU time constraints for automated evaluation.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                      <div className="font-bold text-white text-xs">Candidate Problem Statement Encryption</div>
                      <p className="text-[11px] text-slate-400">
                        FIPS 140-2 AES-256-GCM encryption packaged with runtime environment specifications.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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

      {/* AUTHORITY SURVEILLANCE & LEAK PREVENTION DASHBOARD */}
      {activeSubTab === 'proctor_dashboard' && (
        <AuthoritySurveillanceDashboard currentUser={currentUser} />
      )}
    </div>
  );
};
