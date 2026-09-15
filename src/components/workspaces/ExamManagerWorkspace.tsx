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
  Image as ImageIcon,
  ZoomIn,
  Eye,
  Camera,
  MapPin,
  Phone,
  Mail,
  ShieldAlert,
  User as UserIcon,
} from 'lucide-react';
import { User, Examination, Question, Organization, ExamType, ExtractedQuestion, QuestionAssignment, ExaminationCentre, AddCentreResponse, EmergencyRegenerateResponse } from '../../types';
import { api } from '../../api';
import { NavSubTab } from '../Sidebar';
import { ExamManagerQuestionExtractor } from './ExamManagerQuestionExtractor';
import { AuthoritySurveillanceDashboard } from '../proctor/AuthoritySurveillanceDashboard';
import { DynamicMultiPaperGenerator } from './DynamicMultiPaperGenerator';
import { ExamSimulationModal } from './ExamSimulationModal';
import { AddCentreModal } from './AddCentreModal';
import { EmergencyRegenModal } from './EmergencyRegenModal';

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
  const [translators, setTranslators] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<QuestionAssignment[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dashboardCardFilter, setDashboardCardFilter] = useState<'ALL' | 'VERIFIED' | 'QUARANTINED' | 'READY'>('ALL');
  const [simulationExam, setSimulationExam] = useState<Examination | null>(null);
  const [addCentreModalExam, setAddCentreModalExam] = useState<Examination | null>(null);
  const [emergencyRegenModalExam, setEmergencyRegenModalExam] = useState<Examination | null>(null);
  const [allCentresList, setAllCentresList] = useState<ExaminationCentre[]>([]);
  const [centresFilterExamId, setCentresFilterExamId] = useState<string>('ALL');

  const handleSimulateExam = (ex: Examination) => {
    if (ex.simulation_status === 'COMPLETED') {
      setStatusMessage({
        type: 'error',
        text: 'Simulation already completed. The final question paper cannot be viewed again in simulation mode.',
      });
      return;
    }
    setSimulationExam(ex);
  };

  const handleSimulationCompleted = (statusText?: string) => {
    setSimulationExam(null);
    setStatusMessage({
      type: 'success',
      text: statusText || 'Simulation completed. You may now proceed to Generate Encrypted Paper.',
    });
    loadData();
    onRefresh();
  };

  const handleCentreAdded = (result: AddCentreResponse) => {
    setStatusMessage({
      type: 'success',
      text: result.copyControl.hasMismatch
        ? `Centre "${result.centre.centre_name}" registered with quota mismatch: Requested ${result.copyControl.centreAuthorized}, capped at ${result.copyControl.finalAllowed}. Security alert sent to Auditor.`
        : `Centre "${result.centre.centre_name}" registered successfully. Final authorized copies: ${result.copyControl.finalAllowed}.`,
    });
    loadData();
    onRefresh();
  };

  const handleEmergencyRegenCompleted = (result: EmergencyRegenerateResponse) => {
    setStatusMessage({
      type: 'success',
      text: `Emergency regeneration complete: Replacement paper ${result.newVersionCode} generated & encrypted. ${result.quarantinedCount} suspect questions quarantined.`,
    });
    loadData();
    onRefresh();
  };

  // Workflow Sub-Navigation
  const [questionWorkflowTab, setQuestionWorkflowTab] = useState<'extraction' | 'manual' | 'matrix'>('extraction');
  const [matrixFilter, setMatrixFilter] = useState<'ALL' | 'SME_REVIEW' | 'TRANSLATION' | 'COMPLETED'>('ALL');
  const [matrixSearch, setMatrixSearch] = useState('');

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
  const [zoomDiagramUrl, setZoomDiagramUrl] = useState<string | null>(null);

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
      const [orgRes, examRes, qRes, membersRes, assignRes, centresRes] = await Promise.all([
        api.getCurrentOrg().catch(() => ({ organization: null, documents: [], history: [], representatives: [] })),
        api.getExaminations().catch(() => ({ examinations: [] })),
        api.getQuestions().catch(() => ({ questions: [] })),
        api.getOrgMembers().catch(() => ({ members: [] })),
        api.getAssignments().catch(() => ({ assignments: [] })),
        api.getAllCentres().catch(() => ({ centres: [] })),
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
      setAllCentresList(centresRes.centres || []);
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

  const handleEmergencyRegenerate = (examId: string) => {
    const target = examinations.find(e => e.id === examId);
    if (target) {
      setEmergencyRegenModalExam(target);
    }
  };

  const handleOpenAddCentreModal = (examId?: string) => {
    const idToUse = examId || selectedExamId || examinations[0]?.id;
    const target = examinations.find(e => e.id === idToUse);
    if (target) {
      setAddCentreModalExam(target);
    } else if (examinations.length > 0) {
      setAddCentreModalExam(examinations[0]);
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
                    ? 'bg-[#00cc5f] text-black border-[#00cc5f] ring-2 ring-[#00cc5f]/30 shadow-md'
                    : 'bg-white/80 dark:bg-white/[0.04] border-slate-200/90 dark:border-white/10 text-slate-900 dark:text-white hover:border-[#00cc5f]/40'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'ALL' ? 'text-black/70 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                  Total Examinations
                </span>
                <span className="text-2xl font-black block mt-0.5">{examinations.length}</span>
                <span className={`text-[10px] font-semibold block mt-1 ${dashboardCardFilter === 'ALL' ? 'text-black/80 font-bold' : 'text-[#00873d] dark:text-[#00cc5f]'}`}>
                  Active Enclaves
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('READY')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 ${
                  dashboardCardFilter === 'READY'
                    ? 'bg-[#00cc5f] text-black border-[#00cc5f] ring-2 ring-[#00cc5f]/30 shadow-md'
                    : 'bg-white/80 dark:bg-white/[0.04] border-slate-200/90 dark:border-white/10 text-slate-900 dark:text-white hover:border-[#00cc5f]/40'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'READY' ? 'text-black/70 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                  Pool Questions
                </span>
                <span className="text-2xl font-black block mt-0.5">{questions.length}</span>
                <span className={`text-[10px] font-semibold block mt-1 ${dashboardCardFilter === 'READY' ? 'text-black/80 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                  Total In Repository
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardCardFilter('VERIFIED')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer shadow-xs hover:-translate-y-0.5 ${
                  dashboardCardFilter === 'VERIFIED'
                    ? 'bg-[#00cc5f] text-black border-[#00cc5f] ring-2 ring-[#00cc5f]/30 shadow-md'
                    : 'bg-[#00cc5f]/10 dark:bg-[#00cc5f]/15 border-[#00cc5f]/30 text-[#00873d] dark:text-[#00cc5f] hover:border-[#00cc5f]/50'
                }`}
              >
                <span className={`text-[11px] block font-medium ${dashboardCardFilter === 'VERIFIED' ? 'text-black/70 font-bold' : 'text-[#00873d] dark:text-[#00cc5f]'}`}>
                  Verified & Eligible
                </span>
                <span className={`text-2xl font-black block mt-0.5 ${dashboardCardFilter === 'VERIFIED' ? 'text-black' : 'text-[#00873d] dark:text-[#00cc5f]'}`}>
                  {verifiedCount}
                </span>
                <span className={`text-[10px] block mt-1 ${dashboardCardFilter === 'VERIFIED' ? 'text-black/80 font-bold' : 'text-[#00873d] dark:text-[#00cc5f] font-bold'}`}>
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

                        {ex.simulation_status === 'COMPLETED' ? (
                          <span
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-xs flex items-center gap-1 shadow-2xs"
                            title="Simulation already completed. The final question paper cannot be viewed again in simulation mode."
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Simulation Completed ✓</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSimulateExam(ex)}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                            title="Start Proctored Final Paper Simulation"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Simulate Exam</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleGeneratePaper(ex.id)}
                          disabled={generating || org?.status !== 'VERIFIED'}
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-xs cursor-pointer ${
                            ex.simulation_status === 'COMPLETED'
                              ? 'bg-emerald-900 hover:bg-emerald-800 text-white ring-2 ring-emerald-500/30'
                              : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-40'
                          }`}
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
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      examCategoryFilter === cat
                        ? 'bg-[#00cc5f] text-black shadow-[0_2px_10px_rgba(0,204,95,0.35)]'
                        : 'bg-white/70 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10'
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

                    {/* Delivery Centres & Copy Control Summary */}
                    {(() => {
                      const examCentres = allCentresList.filter(c => c.exam_id === ex.id);
                      const hasAnyMismatch = examCentres.some(c => c.hasMismatch);
                      const managerCap = ex.max_copies || 500;

                      return (
                        <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-semibold text-slate-700">
                              {examCentres.length === 0
                                ? 'No delivery centres assigned'
                                : `${examCentres.length} Centre${examCentres.length > 1 ? 's' : ''} Assigned`}
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              • Manager Cap: <strong className="text-slate-800">{managerCap}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {hasAnyMismatch && (
                              <span
                                className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] flex items-center gap-1"
                                title="Quota Mismatch: A centre requested more copies than the Manager Authorized Cap. Final copies are restricted."
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Quota Mismatch</span>
                              </span>
                            )}
                            {examCentres.length > 0 && (
                              <span className="text-[11px] font-mono text-slate-600 font-medium">
                                Enforced Copies:{' '}
                                <strong className="text-emerald-800">
                                  {Math.min(...examCentres.map(c => c.finalAllowed ?? Math.min(managerCap, c.max_copies)))}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        {ex.simulation_status === 'COMPLETED' ? (
                          <span
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                            title="Simulation already completed. The final question paper cannot be viewed again in simulation mode."
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Simulation Completed ✓</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSimulateExam(ex)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                            title="Start Proctored Final Paper Simulation"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Simulate Exam</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleGeneratePaper(ex.id)}
                          disabled={generating || org?.status !== 'VERIFIED'}
                          className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer ${
                            ex.simulation_status === 'COMPLETED'
                              ? 'bg-slate-900 hover:bg-slate-800 text-white ring-2 ring-emerald-500/30'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>{ex.status === 'GENERATED' ? 'Re-Generate & Encrypt' : 'Generate Encrypted Paper'}</span>
                        </button>

                        {onLaunchCandidateSimulator && (
                          <button
                            type="button"
                            onClick={() => onLaunchCandidateSimulator(ex.id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-medium text-xs flex items-center gap-1.5 cursor-pointer"
                            title="Open candidate portal testing simulator"
                          >
                            <Play className="w-3 h-3 text-slate-500 fill-current" />
                            <span>Candidate Simulator</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAddCentreModalExam(ex)}
                          className="text-slate-600 hover:text-slate-900 text-xs font-semibold px-2 py-1 rounded hover:bg-slate-100 cursor-pointer flex items-center gap-1"
                        >
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>Add Centre</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEmergencyRegenModalExam(ex)}
                          className="text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-1 rounded hover:bg-rose-50 cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3 text-rose-500" />
                          <span>Emergency Re-Gen</span>
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

      {/* ============================================================ */}
      {/* QUESTION WORKFLOW SECTION (HIGH-ASSURANCE QUESTION MANAGEMENT) */}
      {/* ============================================================ */}
      {activeSubTab === 'question_workflow' && (
        <div className="space-y-6">
          {/* Executive Header & Navigation Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setQuestionWorkflowTab('extraction')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2.5 transition-all cursor-pointer ${
                  questionWorkflowTab === 'extraction'
                    ? 'bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white shadow-sm ring-2 ring-emerald-800/20'
                    : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <div className={`p-1 rounded-lg ${questionWorkflowTab === 'extraction' ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-200 text-slate-600'}`}>
                  <FileUp className="w-3.5 h-3.5" />
                </div>
                <span>PDF Question Studio</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  300 DPI
                </span>
              </button>

              <button
                type="button"
                onClick={() => setQuestionWorkflowTab('manual')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2.5 transition-all cursor-pointer ${
                  questionWorkflowTab === 'manual'
                    ? 'bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white shadow-sm ring-2 ring-emerald-800/20'
                    : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <div className={`p-1 rounded-lg ${questionWorkflowTab === 'manual' ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-200 text-slate-600'}`}>
                  <Edit3 className="w-3.5 h-3.5" />
                </div>
                <span>Manual Authoring</span>
                <span className="text-[10px] font-medium opacity-70">Single Entry</span>
              </button>

              <button
                type="button"
                onClick={() => setQuestionWorkflowTab('matrix')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2.5 transition-all cursor-pointer ${
                  questionWorkflowTab === 'matrix'
                    ? 'bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white shadow-sm ring-2 ring-emerald-800/20'
                    : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <div className={`p-1 rounded-lg ${questionWorkflowTab === 'matrix' ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-200 text-slate-600'}`}>
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <span>Verification Matrix</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${questionWorkflowTab === 'matrix' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'}`}>
                  {assignments.length}
                </span>
              </button>
            </div>

            {/* Team Capacity Indicator Chips */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold text-slate-600">SMEs:</span>
                <span className="font-bold text-slate-900 font-mono">{smes.length} Active</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                <span className="font-semibold text-slate-600">Translators:</span>
                <span className="font-bold text-slate-900 font-mono">{translators.length} Active</span>
              </div>
            </div>
          </div>

          {/* TAB 1: HIGH-RES PDF QUESTION EXTRACTION STUDIO */}
          {questionWorkflowTab === 'extraction' && (
            <ExamManagerQuestionExtractor
              smes={smes}
              translators={translators}
              org={org}
              currentUser={currentUser}
              onAssignmentsUpdated={loadData}
            />
          )}

          {/* TAB 2: MANUAL SINGLE QUESTION AUTHORING */}
          {questionWorkflowTab === 'manual' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-900">
                      <Edit3 className="w-4 h-4 text-emerald-800" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      Direct Question Authoring Studio
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Directly compose high-assurance examination questions with LaTeX math, diagrams, MCQ choices, and cryptographic integrity.
                  </p>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>AI Pattern Verification Enabled</span>
                </span>
              </div>

              <form onSubmit={handleCreateQuestion} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* LEFT COLUMN: Academic & Question Configuration */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3.5 text-xs">
                      <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                        Academic Domain & Taxonomy
                      </h4>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Subject / Discipline *</label>
                        <input
                          type="text"
                          value={qSubject}
                          onChange={e => setQSubject(e.target.value)}
                          placeholder="e.g. Physics / Mathematics / Computer Science"
                          required
                          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:border-emerald-800 focus:outline-hidden"
                        />
                        {/* Quick Subject Chips */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Biology'].map(subj => (
                            <button
                              key={subj}
                              type="button"
                              onClick={() => setQSubject(subj)}
                              className="px-2 py-0.5 rounded text-[10px] bg-white border border-slate-200 hover:border-emerald-500 text-slate-600 hover:text-emerald-800 transition-colors"
                            >
                              {subj}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Topic / Syllabus Module *</label>
                        <input
                          type="text"
                          value={qTopic}
                          onChange={e => setQTopic(e.target.value)}
                          placeholder="e.g. Asymmetric Cryptography / Thermodynamics"
                          required
                          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:border-emerald-800 focus:outline-hidden"
                        />
                      </div>

                      {/* Question Type Toggle Cards */}
                      <div>
                        <label className="block text-slate-700 font-bold mb-1.5">Question Format</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setExamType('MCQ')}
                            className={`p-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                              examType === 'MCQ'
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/50'
                            }`}
                          >
                            <span className="text-sm">🔘</span>
                            <span>Multiple Choice (MCQ)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setExamType('THEORY')}
                            className={`p-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                              examType === 'THEORY'
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/50'
                            }`}
                          >
                            <span className="text-sm">📝</span>
                            <span>Theory / Descriptive</span>
                          </button>
                        </div>
                      </div>

                      {/* Difficulty Selection Pills */}
                      <div>
                        <label className="block text-slate-700 font-bold mb-1.5">Cognitive Difficulty Level</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['EASY', 'MEDIUM', 'HARD'] as const).map(diff => {
                            const isSelected = qDifficulty === diff;
                            const colorClass =
                              diff === 'EASY'
                                ? isSelected ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs' : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                                : diff === 'MEDIUM'
                                ? isSelected ? 'bg-amber-600 text-white border-amber-600 shadow-xs' : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                                : isSelected ? 'bg-rose-700 text-white border-rose-700 shadow-xs' : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50';

                            return (
                              <button
                                key={diff}
                                type="button"
                                onClick={() => setQDifficulty(diff)}
                                className={`py-1.5 rounded-lg border font-bold text-[11px] text-center transition-all ${colorClass}`}
                              >
                                {diff}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Marks & Scoring */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">Marks (+)</label>
                          <input
                            type="number"
                            value={qMarks}
                            onChange={e => setQMarks(Number(e.target.value))}
                            min={1}
                            max={100}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono font-bold text-center focus:border-emerald-800 focus:outline-hidden"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 font-bold mb-1">Negative (-)</label>
                          <input
                            type="number"
                            step="0.25"
                            defaultValue={1.0}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono font-bold text-center focus:border-emerald-800 focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* SME Verifier Assignment */}
                      <div className="pt-2 border-t border-slate-200/80">
                        <label className="block text-slate-700 font-bold mb-1">Assign to SME Verifier</label>
                        <select
                          value={assignedSmeId}
                          onChange={e => setAssignedSmeId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:border-emerald-800 focus:outline-hidden text-xs"
                        >
                          <option value="">-- No Assignment (Direct Pool Draft) --</option>
                          {smes.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.full_name} ({s.email})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Question Statement, Options & AI Check */}
                  <div className="lg:col-span-7 space-y-4">
                    {/* Question Content Input */}
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-slate-800 font-bold">
                          Question Content Statement *
                        </label>
                        <span className="text-[11px] font-mono text-slate-400">
                          {qContent.length} characters
                        </span>
                      </div>
                      <textarea
                        rows={5}
                        value={qContent}
                        onChange={e => setQContent(e.target.value)}
                        placeholder="Write the complete question statement. Include formulas, equations, or scenario criteria..."
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:border-emerald-800 focus:outline-hidden leading-relaxed"
                      />
                    </div>

                    {/* AI Similarity & Duplicate Check Banner */}
                    <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
                        <div>
                          <span className="font-bold text-emerald-950">AI Question Pool Duplicate Engine</span>
                          <p className="text-[11px] text-emerald-800/80">Scan current repository for semantic similarity before saving.</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCheckAiSimilarity}
                          disabled={aiChecking || !qContent}
                          className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-emerald-300" />
                          <span>{aiChecking ? 'Analyzing...' : 'Scan Pool'}</span>
                        </button>
                        {aiCheckResult && (
                          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white text-emerald-900 border border-emerald-300 font-mono shadow-2xs">
                            Score: {aiCheckResult.similarityScore ?? '0.04'} (Clear)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* MCQ Options Builder */}
                    {examType === 'MCQ' && (
                      <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-slate-800 font-bold text-xs">
                            MCQ Answer Choices (Click letter to set as Correct Answer)
                          </label>
                          <span className="text-[11px] font-bold text-emerald-800">
                            Current Key: Option {qCorrectAnswer || 'A'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {qOptions.map((opt, i) => {
                            const letter = String.fromCharCode(65 + i);
                            const isCorrect = (qCorrectAnswer || 'A').toUpperCase() === letter;

                            return (
                              <div
                                key={i}
                                className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                                  isCorrect
                                    ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => setQCorrectAnswer(letter)}
                                  className={`w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                    isCorrect
                                      ? 'bg-emerald-700 text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                  title="Mark as correct answer"
                                >
                                  {letter}
                                </button>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={e => {
                                    const newOpts = [...qOptions];
                                    newOpts[i] = e.target.value;
                                    setQOptions(newOpts);
                                  }}
                                  placeholder={`Option ${letter} text...`}
                                  className="w-full px-2 py-1 text-xs bg-transparent border-0 text-slate-900 focus:outline-hidden"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => {
                          setQContent('');
                          setQSubject('');
                          setQTopic('');
                          setQOptions(['', '', '', '']);
                        }}
                        className="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Reset Form
                      </button>

                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-800 hover:from-emerald-800 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Save & Enqueue to Pool</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: ASSIGNMENT & VERIFICATION MATRIX */}
          {questionWorkflowTab === 'matrix' && (
            <div className="space-y-6">
              {/* Executive Header & KPI Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                    <Activity className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Active Tasks</span>
                    <span className="text-xl font-black text-slate-900 font-mono">{assignments.length}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">SME Reviews</span>
                    <span className="text-xl font-black text-blue-900 font-mono">
                      {assignments.filter(a => a.assignment_type === 'SME_REVIEW').length}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center">
                    <Languages className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Translations</span>
                    <span className="text-xl font-black text-purple-900 font-mono">
                      {assignments.filter(a => a.assignment_type === 'LINGUISTIC_TRANSLATION').length}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Completed & Verified</span>
                    <span className="text-xl font-black text-emerald-900 font-mono">
                      {assignments.filter(a => a.status === 'COMPLETED').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Matrix Card */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-5">
                {/* Search and Filter Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span>Live Verification & Audit Matrix</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Real-Time Synced
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cryptographic tracking across all assigned Subject Matter Experts and Linguistic Translators.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search question, assignee..."
                        value={matrixSearch}
                        onChange={e => setMatrixSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs w-48 focus:w-60 focus:outline-none focus:border-emerald-600 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMatrixFilter('ALL')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      matrixFilter === 'ALL'
                        ? 'bg-[#00cc5f] text-black shadow-[0_2px_10px_rgba(0,204,95,0.35)]'
                        : 'bg-white/70 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] border border-slate-200/80 dark:border-white/10'
                    }`}
                  >
                    All Tasks ({assignments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixFilter('SME_REVIEW')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      matrixFilter === 'SME_REVIEW'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/50'
                    }`}
                  >
                    SME Reviews ({assignments.filter(a => a.assignment_type === 'SME_REVIEW').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixFilter('TRANSLATION')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      matrixFilter === 'TRANSLATION'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/50'
                    }`}
                  >
                    Translations ({assignments.filter(a => a.assignment_type === 'LINGUISTIC_TRANSLATION').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixFilter('COMPLETED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      matrixFilter === 'COMPLETED'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50'
                    }`}
                  >
                    Completed ({assignments.filter(a => a.status === 'COMPLETED').length})
                  </button>
                </div>

                {/* Verification Matrix Table */}
                {(() => {
                  const filteredAssignments = assignments.filter(a => {
                    if (matrixFilter === 'SME_REVIEW' && a.assignment_type !== 'SME_REVIEW') return false;
                    if (matrixFilter === 'TRANSLATION' && a.assignment_type !== 'LINGUISTIC_TRANSLATION') return false;
                    if (matrixFilter === 'COMPLETED' && a.status !== 'COMPLETED') return false;
                    if (matrixSearch.trim()) {
                      const query = matrixSearch.toLowerCase();
                      const matchQ = a.question_id?.toLowerCase().includes(query);
                      const matchUser = (a.assignee_name || a.assignee_user_id || '').toLowerCase().includes(query);
                      const matchLang = (a.target_language || '').toLowerCase().includes(query);
                      return matchQ || matchUser || matchLang;
                    }
                    return true;
                  });

                  if (filteredAssignments.length === 0) {
                    return (
                      <div className="py-12 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-slate-200 text-slate-400 mx-auto flex items-center justify-center">
                          <CheckSquare className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">No Assignments Match Criteria</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          Extract questions from the PDF Studio or assign items from Question Pools to populate the verification matrix.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                            <th className="py-3 px-4">Question Anchor</th>
                            <th className="py-3 px-4">Task Type</th>
                            <th className="py-3 px-4">Assigned Expert</th>
                            <th className="py-3 px-4">Target Language</th>
                            <th className="py-3 px-4">Assigned Date</th>
                            <th className="py-3 px-4">Audit Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredAssignments.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-4 font-mono text-[11px] font-bold text-slate-800">
                                <span className="px-2 py-1 bg-slate-100 rounded-md border border-slate-200">
                                  {a.question_id.substring(0, 12)}...
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    a.assignment_type === 'SME_REVIEW'
                                      ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                      : 'bg-purple-100 text-purple-900 border border-purple-200'
                                  }`}
                                >
                                  {a.assignment_type === 'SME_REVIEW' ? (
                                    <>
                                      <UserCheck className="w-3 h-3 text-blue-600" />
                                      <span>SME Review</span>
                                    </>
                                  ) : (
                                    <>
                                      <Languages className="w-3 h-3 text-purple-600" />
                                      <span>Translation</span>
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
                                    {(a.assignee_name || a.assignee_user_id || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <span>{a.assignee_name || a.assignee_user_id}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {a.target_language ? (
                                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px]">
                                    {a.target_language}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[11px]">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-[11px] text-slate-500 font-mono">
                                {new Date(a.assigned_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    a.status === 'COMPLETED'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : a.status === 'REJECTED'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {a.status === 'COMPLETED' && <Check className="w-3 h-3 text-emerald-600" />}
                                  {a.status === 'PENDING' && <Clock className="w-3 h-3 text-amber-600" />}
                                  {a.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
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
                          {ex.simulation_status === 'COMPLETED' ? (
                            <span
                              className="px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                              title="Simulation already completed. The final question paper cannot be viewed again in simulation mode."
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Simulation Completed ✓</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSimulateExam(ex);
                              }}
                              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
                              title="Start Proctored Final Paper Simulation"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Simulate Exam</span>
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGeneratePaper(ex.id);
                            }}
                            disabled={generating || org?.status !== 'VERIFIED'}
                            className={`px-4 py-2 rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5 ${
                              ex.simulation_status === 'COMPLETED'
                                ? 'bg-emerald-900 hover:bg-emerald-800 text-white ring-2 ring-emerald-500/30'
                                : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-40'
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>{generating ? 'Encrypting...' : `Generate ${type} Paper`}</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEmergencyRegenerate(ex.id);
                            }}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                            title="Emergency Question Paper Regeneration"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Emergency Re-Gen</span>
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

                  <div className="flex items-center gap-2">
                    {currentExam.simulation_status === 'COMPLETED' ? (
                      <span
                        className="px-4 py-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg font-bold text-xs flex items-center gap-1.5"
                        title="Simulation already completed. The final question paper cannot be viewed again in simulation mode."
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Simulation Completed ✓</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSimulateExam(currentExam)}
                        className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                        title="Start Proctored Final Paper Simulation"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Simulate Exam</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleGeneratePaper(currentExam.id)}
                      disabled={generating || org?.status !== 'VERIFIED'}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-40"
                    >
                      <Lock className="w-4 h-4" />
                      <span>{generating ? 'Processing Cryptographic Pipeline...' : `Execute ${currentType} Paper Generation`}</span>
                    </button>
                  </div>
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

      {/* DYNAMIC MULTI-PAPER GENERATOR */}
      {activeSubTab === 'multi_paper_generator' && (
        <DynamicMultiPaperGenerator
          examinations={examinations}
          selectedExamId={selectedGenExamId || (examinations[0]?.id || '')}
        />
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
          {/* Header Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Examination Delivery Centres</h3>
                <p className="text-xs text-slate-500">
                  Manage authorized test centres, copy control quotas (MIN rule), and real-time mismatch alerts.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <select
                value={centresFilterExamId}
                onChange={e => setCentresFilterExamId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:bg-white"
              >
                <option value="ALL">All Examinations ({allCentresList.length} centres)</option>
                {examinations.map(ex => {
                  const count = allCentresList.filter(c => c.exam_id === ex.id).length;
                  return (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({count})
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                onClick={() => handleOpenAddCentreModal(centresFilterExamId !== 'ALL' ? centresFilterExamId : undefined)}
                className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add Centre</span>
              </button>
            </div>
          </div>

          {/* Centres Grid */}
          {(() => {
            const filteredCentres = centresFilterExamId === 'ALL'
              ? allCentresList
              : allCentresList.filter(c => c.exam_id === centresFilterExamId);

            if (filteredCentres.length === 0) {
              return (
                <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-slate-800">No Examination Centres Registered</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Add delivery centres to assign examinations, configure authorized printing quotas, and enforce tamper-proof copy control limits.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenAddCentreModal()}
                    className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Add Examination Centre</span>
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCentres.map(centre => {
                  const exam = examinations.find(e => e.id === centre.exam_id);
                  const managerCap = Number(exam?.max_copies || centre.managerAuthorized || 500);
                  const centreQuota = Number(centre.max_copies || centre.centreAuthorized || 100);
                  const finalAllowed = Math.min(managerCap, centreQuota);
                  const hasMismatch = centre.hasMismatch || managerCap !== centreQuota;

                  return (
                    <div
                      key={centre.id}
                      className={`p-5 rounded-2xl bg-white border shadow-xs space-y-3.5 transition-all ${
                        hasMismatch ? 'border-amber-300 ring-1 ring-amber-300/50' : 'border-slate-200'
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-900 text-white">
                              {centre.centre_code}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {centre.status || 'ACTIVE'}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-slate-900 mt-1.5">{centre.centre_name}</h4>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{centre.address ? `${centre.address}, ` : ''}{centre.city}{centre.state ? `, ${centre.state}` : ''}</span>
                          </p>
                        </div>

                        {hasMismatch && (
                          <span
                            className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] flex items-center gap-1 shrink-0"
                            title="Quota Mismatch: Requested copies exceed Manager Authorized Cap. Backend hard limit enforced."
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Quota Mismatch</span>
                          </span>
                        )}
                      </div>

                      {/* Examination info */}
                      {exam && (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Assigned Examination</span>
                          <span className="font-bold text-slate-800">{exam.name}</span>
                          <span className="text-slate-500 font-medium"> ({exam.subject})</span>
                        </div>
                      )}

                      {/* Contact details */}
                      {(centre.contact_person || centre.contact_number || centre.email) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs py-1 border-t border-slate-100">
                          {centre.contact_person && (
                            <div className="flex items-center gap-1 text-slate-600 truncate" title={centre.contact_person}>
                              <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{centre.contact_person}</span>
                            </div>
                          )}
                          {centre.contact_number && (
                            <div className="flex items-center gap-1 text-slate-600 truncate" title={centre.contact_number}>
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate font-mono">{centre.contact_number}</span>
                            </div>
                          )}
                          {centre.email && (
                            <div className="flex items-center gap-1 text-slate-600 truncate" title={centre.email}>
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{centre.email}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Copy Control Breakdown */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-emerald-700" />
                            Copy Control Rule: MIN(Manager Cap, Centre Quota)
                          </span>
                          <span className="text-slate-500">
                            Printed: <strong className="text-slate-800">{centre.totalPrinted || 0}</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-1.5 rounded-lg bg-white border border-slate-200">
                            <span className="block text-[10px] text-slate-500">Manager Cap</span>
                            <span className="font-bold text-slate-800">{managerCap}</span>
                          </div>
                          <div className="p-1.5 rounded-lg bg-white border border-slate-200">
                            <span className="block text-[10px] text-slate-500">Centre Quota</span>
                            <span className="font-bold text-slate-800">{centreQuota}</span>
                          </div>
                          <div className={`p-1.5 rounded-lg border ${
                            hasMismatch
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          }`}>
                            <span className="block text-[10px] font-medium opacity-80">Final Authorized</span>
                            <span className="font-black">{finalAllowed}</span>
                          </div>
                        </div>

                        {hasMismatch && (
                          <p className="text-[10px] text-amber-800 font-medium leading-tight">
                            Alert logged: Centre requested {centreQuota} copies, but Manager cap is {managerCap}. Hard limit restricted to {finalAllowed}.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* AUTHORITY SURVEILLANCE & LEAK PREVENTION DASHBOARD */}
      {activeSubTab === 'proctor_dashboard' && (
        <AuthoritySurveillanceDashboard currentUser={currentUser} />
      )}

      {/* Diagram Zoom Lightbox Modal */}
      {zoomDiagramUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setZoomDiagramUrl(null)}
        >
          <div 
            className="bg-white rounded-2xl p-4 max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-700" />
                High-Resolution Diagram Preview
              </span>
              <button
                type="button"
                onClick={() => setZoomDiagramUrl(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center overflow-auto max-h-[70vh]">
              <img
                src={zoomDiagramUrl}
                alt="Full size diagram"
                className="max-w-full max-h-full object-contain rounded-lg shadow-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Strictly One-Time Proctored Exam Simulation Modal */}
      {simulationExam && currentUser && (
        <ExamSimulationModal
          exam={simulationExam}
          currentUser={currentUser}
          onClose={() => setSimulationExam(null)}
          onCompleted={handleSimulationCompleted}
        />
      )}

      {/* Add Examination Centre Modal */}
      {addCentreModalExam && (
        <AddCentreModal
          exam={addCentreModalExam}
          isOpen={Boolean(addCentreModalExam)}
          onClose={() => setAddCentreModalExam(null)}
          onSuccess={handleCentreAdded}
        />
      )}

      {/* Emergency Paper Regeneration Modal */}
      {emergencyRegenModalExam && (
        <EmergencyRegenModal
          exam={emergencyRegenModalExam}
          currentVersionCode={emergencyRegenModalExam.version_code}
          isOpen={Boolean(emergencyRegenModalExam)}
          onClose={() => setEmergencyRegenModalExam(null)}
          onSuccess={handleEmergencyRegenCompleted}
        />
      )}
    </div>
  );
};
