import React, { useState, useRef } from 'react';
import {
  FileUp,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Users,
  Search,
  Filter,
  CheckSquare,
  Square,
  Trash2,
  Send,
  Eye,
  Edit3,
  Languages,
  BookOpen,
  ArrowRight,
  HelpCircle,
  Clock,
  Layers,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  FileText,
  UserCheck,
} from 'lucide-react';
import { User, ExtractedQuestion, Organization, QuestionAssignment } from '../../types';
import { api } from '../../api';

interface ExamManagerQuestionExtractorProps {
  smes: User[];
  translators: User[];
  org: Organization | null;
  currentUser: User | null;
  onAssignmentsUpdated: () => void;
}

interface UploadedQuestionFile {
  name: string;
  fileData?: string;
  text?: string;
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

const SAMPLE_QUESTION_PAPER_TEXT = `NATIONAL BOARD OF TECHNICAL EXAMINATIONS (NBTE 2026)
SECTION A: ADVANCED CRYPTOGRAPHY & DISTRIBUTED SYSTEMS (MCQ - 4 MARKS EACH)

1. In AES-GCM (Galois/Counter Mode), what primary security guarantee is provided compared to AES-CBC mode?
A) Faster public key factorization on asymmetric coprocessors
B) Authenticated Encryption with Associated Data (AEAD) ensuring integrity and confidentiality
C) Quantum key resistance without requiring initialization vectors
D) Elimination of nonce repetition security consequences
Answer: B
Marks: 4
Negative Marks: 1.0
Topic: Applied Cryptography

2. In Shamir's (k, n) Secret Sharing scheme over a finite prime field GF(p), what is the minimum degree of the polynomial required to reconstruct the secret?
A) n - 1
B) k
C) k - 1
D) 2k + 1
Answer: C
Marks: 4
Negative Marks: 1.0
Topic: Key Management & Secret Sharing

3. In Raft consensus protocol, what happens when a Follower node receives a Heartbeat RPC from a candidate with a lower term index?
A) The follower immediately updates its term and yields leadership
B) The follower rejects the RPC and retains its current election timer
C) The follower commits all uncommitted log entries immediately
D) The cluster transitions to Byzantine fallback state
Answer: B
Marks: 4
Negative Marks: 1.0
Topic: Distributed Systems Consensus

4. In post-quantum cryptography, NIST FIPS 203 (ML-KEM) key encapsulation is rooted in the computational hardness of which mathematical lattice problem?
A) Discrete Logarithm over Hyperelliptic Curves
B) Module Learning With Errors (M-LWE)
C) Integer Factorization under RSA-4096
D) Shortest Vector Problem over Ideals (SVP-Ideal)
Answer: B
Marks: 4
Negative Marks: 1.0
Topic: Post-Quantum Cryptography

5. In Zero-Knowledge Proofs (zk-SNARKs), what does the 'Non-Interactive' property guarantee?
A) Prover and verifier require synchronous multi-round socket communication
B) The proof consists of a single message that can be verified by any third party without back-and-forth challenges
C) The proof only works when trusted setup parameters are regenerated per transaction
D) The computational complexity of verification scales quadratically with witness size
Answer: B
Marks: 4
Negative Marks: 1.0
Topic: Zero-Knowledge Verification

SECTION B: PHYSICS & QUANTUM COMPUTATION

6. A superconducting loop of radius r is placed in a perpendicular magnetic field B. If the external magnetic field is doubled, what is the induced persistent current in the loop?
A) Zero because superconducting flux cannot penetrate the lattice
B) -B * pi * r^2 / L where L is the self-inductance of the superconducting ring
C) 2 * B * pi * r^2 / R where R is non-zero resistance
D) Infinite current with instantaneous thermal breakdown
Answer: B
Marks: 4
Negative Marks: 1.0
Topic: Electrodynamics & Superconductivity

7. In Young's Double Slit Experiment, if a thin mica sheet of refractive index mu and thickness t is placed across one slit, what is the optical path displacement of the central fringe?
A) (mu - 1) * t
B) mu * t
C) t / (mu - 1)
D) (mu + 1) * t
Answer: A
Marks: 4
Negative Marks: 1.0
Topic: Wave Optics

SECTION C: SUBJECTIVE & DESCRIPTIVE ARCHITECTURE (THEORY - 10 MARKS EACH)

8. Explain the cryptographic construction of Dynamic Watermarking and Micro-perforation for physical examination papers. Describe how unique serialized transaction hashes prevent unauthorized mass duplication.
Answer: Detailed structural derivation covering steganographic coordinate shift, tamper-evident anti-scan patterns, and immutable ledger verification.
Marks: 10
Negative Marks: 0
Topic: Secure Physical Delivery

9. Describe the threat model of Question Paper Leaks during pre-press transport and explain how Shamir (k, n) Quorum Time-Locks isolate unreleased exam versions from malicious insider access.
Answer: Comprehensive security proof detailing hardware security modules (HSM), threshold key re-assembly, and verifiable audit logging.
Marks: 10
Negative Marks: 0
Topic: Threat Modeling & Security Governance

10. Formulate the mathematical proof demonstrating why any coalition of fewer than k participants in Shamir Secret Sharing has zero information regarding the secret in GF(p).
Answer: Proof using Lagrange Interpolation Polynomial uniqueness and uniform probability distribution over GF(p).
Marks: 10
Negative Marks: 0
Topic: Finite Field Cryptography`;

export const ExamManagerQuestionExtractor: React.FC<ExamManagerQuestionExtractorProps> = ({
  smes,
  translators,
  org,
  currentUser,
  onAssignmentsUpdated,
}) => {
  // Upload & Extraction Input State
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfFileData, setPdfFileData] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedQuestionFile[]>([]);
  const [pdfText, setPdfText] = useState('');
  const [paperSubject, setPaperSubject] = useState('Computer Science & Cryptography');
  const [paperCategory, setPaperCategory] = useState('Competitive Exam');
  const [extracting, setExtracting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Extracted Questions & Sidebar State
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [activeExtractedIndex, setActiveExtractedIndex] = useState<number>(0);
  const [selectedExtractedIds, setSelectedExtractedIds] = useState<Set<string>>(new Set());
  const [sidebarFilterType, setSidebarFilterType] = useState<'ALL' | 'MCQ' | 'THEORY' | 'UNASSIGNED' | 'ASSIGNED'>('ALL');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [extractionSummary, setExtractionSummary] = useState('');
  const [aiEngineUsed, setAiEngineUsed] = useState(false);

  // Local assignment tracking map: tempId -> { smeName?: string, translatorName?: string, targetLanguage?: string }
  const [localAssignments, setLocalAssignments] = useState<Record<string, { smeId?: string; smeName?: string; translatorId?: string; translatorName?: string; targetLanguage?: string }>>({});

  // Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'SELECTED' | 'BY_COUNT'>('SELECTED');
  const [assignCountInput, setAssignCountInput] = useState<number>(5);
  const [assignTargetRole, setAssignTargetRole] = useState<'SME' | 'TRANSLATOR' | 'BOTH'>('SME');
  const [assignTargetSmeId, setAssignTargetSmeId] = useState<string>(smes[0]?.id || '');
  const [assignTargetTranslatorId, setAssignTargetTranslatorId] = useState<string>(translators[0]?.id || '');
  const [assignTargetLanguage, setAssignTargetLanguage] = useState<string>('Hindi');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigningLoading, setAssigningLoading] = useState(false);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync default assignee selection if users load later
  React.useEffect(() => {
    if (smes.length > 0 && !assignTargetSmeId) {
      setAssignTargetSmeId(smes[0].id);
    }
    if (translators.length > 0 && !assignTargetTranslatorId) {
      setAssignTargetTranslatorId(translators[0].id);
    }
  }, [smes, translators]);

  // Handle File Change
  const readUploadedFile = (file: File): Promise<UploadedQuestionFile> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      const isTextFile = file.type.includes('text') || /\.(txt|csv|json)$/i.test(file.name);

      reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
      reader.onload = event => {
        const result = (event.target?.result as string) || '';
        resolve(isTextFile ? { name: file.name, text: result } : { name: file.name, fileData: result });
      };

      if (isTextFile) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });

  const processUploadedFiles = async (files: File[]) => {
    const nextFiles = await Promise.all(files.map(readUploadedFile));
    setUploadedFiles(nextFiles);
    setPdfFileName(nextFiles.map(file => file.name).join(', '));
    setPdfFileData(nextFiles.find(file => file.fileData)?.fileData || '');
    setPdfText(nextFiles.filter(file => file.text).map(file => file.text).join('\n\n'));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      void processUploadedFiles(files);
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    if (files.length > 0) {
      void processUploadedFiles(files);
    }
  };

  // Load Built-in Sample Paper
  const handleLoadSamplePaper = () => {
    setUploadedFiles([]);
    setPdfFileName('NBTE_National_Master_Paper_2026.pdf');
    setPdfText(SAMPLE_QUESTION_PAPER_TEXT);
    setPdfFileData('');
    setPaperSubject('Computer Science & Applied Cryptography');
    setPaperCategory('Competitive Exam');
    setStatusMessage({
      type: 'success',
      text: 'Loaded 10-Question Master Examination Paper template with MCQs & Subjective Theory sections.',
    });
  };

  // Trigger Extraction
  const handleExtract = async () => {
    const textToExtract = pdfText.trim();
    if (!textToExtract && !pdfFileData && uploadedFiles.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please upload a question paper PDF or load sample paper text.' });
      return;
    }

    setExtracting(true);
    setStatusMessage(null);

    try {
      const extractionInputs = uploadedFiles.length > 0
        ? uploadedFiles.map(file => ({
            paper_text: file.text,
            file_data: file.fileData,
            file_name: file.name,
          }))
        : [{
            paper_text: textToExtract,
            file_data: pdfFileData || undefined,
            file_name: pdfFileName || 'uploaded_paper.pdf',
          }];
      const responses = await Promise.all(extractionInputs.map(input => api.extractQuestionsFromPaper({
        ...input,
        subject: paperSubject || 'Academic Examination',
        category: paperCategory || 'Competitive Exam',
      })));

      const extracted: ExtractedQuestion[] = responses.flatMap((res, fileIndex) =>
        (res.extractedQuestions || []).map((q, questionIndex) => ({
          ...q,
          tempId: q.tempId || `EXT-${Date.now()}-${fileIndex + 1}-${questionIndex + 1}`,
        }))
      );
      const aiEngineUsedForBatch = responses.some(res => res.aiEngineUsed);

      setExtractedQuestions(extracted);
      setActiveExtractedIndex(0);
      setSelectedExtractedIds(new Set(extracted.map(q => q.tempId)));
      setExtractionSummary(responses.map(res => res.extractionSummary).filter(Boolean).join(' ') || `Extracted ${extracted.length} questions.`);
      setAiEngineUsed(aiEngineUsedForBatch);
      setLocalAssignments({});

      setStatusMessage({
        type: 'success',
        text: `Extracted ${extracted.length} questions from ${responses.length} file${responses.length === 1 ? '' : 's'} into the sidebar (${aiEngineUsedForBatch ? 'Gemini 3.7 Flash Engine' : 'Heuristic Parser'}).`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to extract questions.' });
    } finally {
      setExtracting(false);
    }
  };

  // Selection helpers
  const toggleSelection = (tempId: string) => {
    const next = new Set(selectedExtractedIds);
    if (next.has(tempId)) {
      next.delete(tempId);
    } else {
      next.add(tempId);
    }
    setSelectedExtractedIds(next);
  };

  const selectAll = () => {
    setSelectedExtractedIds(new Set(extractedQuestions.map(q => q.tempId)));
  };

  const deselectAll = () => {
    setSelectedExtractedIds(new Set());
  };

  const selectFirstN = (n: number) => {
    const ids = extractedQuestions.slice(0, n).map(q => q.tempId);
    setSelectedExtractedIds(new Set(ids));
  };

  // Filtered extracted list for sidebar
  const filteredExtractedQuestions = extractedQuestions.filter(q => {
    const matchesSearch =
      sidebarSearch === '' ||
      q.content_text.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      (q.topic && q.topic.toLowerCase().includes(sidebarSearch.toLowerCase())) ||
      (q.subject && q.subject.toLowerCase().includes(sidebarSearch.toLowerCase()));

    if (!matchesSearch) return false;

    const assignment = localAssignments[q.tempId];
    const isAssigned = !!(assignment?.smeId || assignment?.translatorId);

    if (sidebarFilterType === 'MCQ') return q.question_type === 'MCQ';
    if (sidebarFilterType === 'THEORY') return q.question_type === 'THEORY';
    if (sidebarFilterType === 'UNASSIGNED') return !isAssigned;
    if (sidebarFilterType === 'ASSIGNED') return isAssigned;
    return true;
  });

  // Active question in right detail panel
  const activeQuestion = extractedQuestions[activeExtractedIndex] || null;

  // Update field of active extracted question
  const updateActiveQuestion = (updates: Partial<ExtractedQuestion>) => {
    if (!activeQuestion) return;
    setExtractedQuestions(prev =>
      prev.map((q, idx) => (idx === activeExtractedIndex ? { ...q, ...updates } : q))
    );
  };

  // Delete active extracted question
  const deleteExtractedQuestion = (tempId: string) => {
    const nextList = extractedQuestions.filter(q => q.tempId !== tempId);
    setExtractedQuestions(nextList);
    const nextSelected = new Set(selectedExtractedIds);
    nextSelected.delete(tempId);
    setSelectedExtractedIds(nextSelected);

    if (activeExtractedIndex >= nextList.length) {
      setActiveExtractedIndex(Math.max(0, nextList.length - 1));
    }
  };

  // Open Assignment Modal
  const openAssignmentModal = (mode: 'SELECTED' | 'BY_COUNT' = 'SELECTED') => {
    setAssignMode(mode);
    if (mode === 'BY_COUNT') {
      const unassigned = extractedQuestions.filter(q => !localAssignments[q.tempId]);
      setAssignCountInput(Math.min(5, Math.max(1, unassigned.length)));
    }
    setAssignModalOpen(true);
  };

  // Execute Question Assignment
  const handleExecuteAssignment = async () => {
    let targetQuestionList: ExtractedQuestion[] = [];

    if (assignMode === 'SELECTED') {
      targetQuestionList = extractedQuestions.filter(q => selectedExtractedIds.has(q.tempId));
      if (targetQuestionList.length === 0) {
        setStatusMessage({ type: 'error', text: 'Please select at least one question to assign.' });
        return;
      }
    } else {
      // By Count
      const count = Math.max(1, Math.min(extractedQuestions.length, assignCountInput));
      const unassigned = extractedQuestions.filter(q => !localAssignments[q.tempId]);
      targetQuestionList = unassigned.slice(0, count);
      if (targetQuestionList.length === 0) {
        targetQuestionList = extractedQuestions.slice(0, count);
      }
    }

    if (targetQuestionList.length === 0) {
      setStatusMessage({ type: 'error', text: 'No questions available for assignment.' });
      return;
    }

    // Role validation
    const needSme = assignTargetRole === 'SME' || assignTargetRole === 'BOTH';
    const needTranslator = assignTargetRole === 'TRANSLATOR' || assignTargetRole === 'BOTH';

    if (needSme && !assignTargetSmeId) {
      setStatusMessage({ type: 'error', text: 'Please select an SME from your organization.' });
      return;
    }
    if (needTranslator && !assignTargetTranslatorId) {
      setStatusMessage({ type: 'error', text: 'Please select a Linguistic Translator from your organization.' });
      return;
    }

    setAssigningLoading(true);
    setStatusMessage(null);

    const targetSme = smes.find(s => s.id === assignTargetSmeId);
    const targetTranslator = translators.find(t => t.id === assignTargetTranslatorId);

    try {
      // Call bulk-create to persist questions into question bank and create assignments
      const res = await api.bulkCreateQuestions({
        questions: targetQuestionList,
        auto_assign_sme_id: needSme ? assignTargetSmeId : undefined,
        auto_assign_translator_id: needTranslator ? assignTargetTranslatorId : undefined,
        target_language: needTranslator ? assignTargetLanguage : undefined,
        assignment_notes: assignNotes || undefined,
      });

      // Update local assignment tags for real-time sidebar feedback
      const updatedAssignments = { ...localAssignments };
      targetQuestionList.forEach(q => {
        updatedAssignments[q.tempId] = {
          smeId: needSme ? assignTargetSmeId : updatedAssignments[q.tempId]?.smeId,
          smeName: needSme ? targetSme?.full_name || 'Assigned SME' : updatedAssignments[q.tempId]?.smeName,
          translatorId: needTranslator ? assignTargetTranslatorId : updatedAssignments[q.tempId]?.translatorId,
          translatorName: needTranslator ? targetTranslator?.full_name || 'Assigned Translator' : updatedAssignments[q.tempId]?.translatorName,
          targetLanguage: needTranslator ? assignTargetLanguage : updatedAssignments[q.tempId]?.targetLanguage,
        };
      });
      setLocalAssignments(updatedAssignments);

      let assignmentDesc = '';
      if (needSme && needTranslator) {
        assignmentDesc = `assigned to SME ${targetSme?.full_name} and Translator ${targetTranslator?.full_name} (${assignTargetLanguage})`;
      } else if (needSme) {
        assignmentDesc = `assigned to SME ${targetSme?.full_name}`;
      } else {
        assignmentDesc = `assigned to Translator ${targetTranslator?.full_name} for ${assignTargetLanguage} translation`;
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully created ${res.createdCount} questions in secure question repository and ${assignmentDesc}.`,
      });

      setAssignModalOpen(false);
      onAssignmentsUpdated();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to complete question assignment.' });
    } finally {
      setAssigningLoading(false);
    }
  };

  // Direct assign for single active question
  const handleAssignActiveQuestionDirectly = (smeId?: string, translatorId?: string, lang?: string) => {
    if (!activeQuestion) return;
    setSelectedExtractedIds(new Set([activeQuestion.tempId]));
    if (smeId) {
      setAssignTargetRole('SME');
      setAssignTargetSmeId(smeId);
    } else if (translatorId) {
      setAssignTargetRole('TRANSLATOR');
      setAssignTargetTranslatorId(translatorId);
      if (lang) setAssignTargetLanguage(lang);
    }
    setAssignMode('SELECTED');
    setAssignModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Alert / Status Bar */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 shadow-xs transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION 1: PDF QUESTION PAPER UPLOAD & EXTRACTION ZONE */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-900">
                <FileUp className="w-4 h-4 text-emerald-800" />
              </span>
              <h3 className="text-base font-bold text-slate-900">
                Question Paper PDF Upload & AI Extraction Studio
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Upload master examination paper PDF or transcript. Gemini AI parses questions, MCQ options (A/B/C/D), marks, and rubric keys directly into the sidebar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSamplePaper}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-600" />
              <span>Load Sample 10-Q Master PDF</span>
            </button>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gemini 3.7 Flash Engine</span>
            </span>
          </div>
        </div>

        {/* Paper Subject & Category Metadata Input */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">Target Subject / Domain</label>
            <input
              type="text"
              value={paperSubject}
              onChange={e => setPaperSubject(e.target.value)}
              placeholder="e.g. Computer Science & Cryptography / Physics / Chemistry"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Examination Category</label>
            <select
              value={paperCategory}
              onChange={e => setPaperCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
            >
              <option value="Competitive Exam">Competitive Entrance Examination (JEE / NEET / GATE)</option>
              <option value="NEET">NEET (National Eligibility Entrance Test - PCB)</option>
              <option value="JEE">JEE (Joint Entrance Examination - PCM)</option>
              <option value="University Exam">University Semester Board Examination</option>
              <option value="TCET / CET-type Exam">State Technical Common Entrance Test</option>
              <option value="Custom Exam">Institutional Enclave Assessment</option>
            </select>
          </div>
        </div>

        {/* Drag and Drop Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
            isDragOver
              ? 'border-emerald-600 bg-emerald-50/80 scale-[1.005]'
              : pdfFileName
              ? 'border-emerald-400 bg-emerald-50/30'
              : 'border-slate-300 bg-slate-50/70 hover:bg-slate-100/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx,.json,.csv"
            onChange={handleFileInputChange}
            multiple
            className="hidden"
          />

          <Upload className={`w-8 h-8 mx-auto mb-2 transition-colors ${pdfFileName ? 'text-emerald-700' : 'text-slate-400'}`} />

          <p className="text-xs font-bold text-slate-900">
            {pdfFileName ? (
              <span className="flex items-center justify-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{uploadedFiles.length > 1 ? `${uploadedFiles.length} files selected` : `Selected File: ${pdfFileName}`}</span>
              </span>
            ) : (
              'Drag & Drop Question Paper PDF here, or Browse from device'
            )}
          </p>

          {uploadedFiles.length > 0 && (
            <div className="mx-auto mt-2 max-w-xl space-y-1 text-left">
              {uploadedFiles.map(file => (
                <div key={file.name} className="flex items-center gap-2 rounded-md bg-white/80 px-2 py-1 text-[11px] text-slate-700">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  <span className="truncate">{file.name}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-500 mt-1">
            Supports .pdf, .docx, .txt, .json formats. ZeroLeak isolates text without exposing unreleased master papers.
          </p>

          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
            >
              Browse Files / Documents
            </button>

            <button
              type="button"
              onClick={() => setShowRawText(!showRawText)}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs transition-colors"
            >
              {showRawText ? 'Hide Transcript Editor' : 'Paste / Edit OCR Transcript'}
            </button>
          </div>
        </div>

        {/* Collapsible Transcript Editor */}
        {showRawText && (
          <div className="space-y-1.5 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 font-bold">
                Raw Paper Content / OCR Text Transcript:
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {pdfText.length} characters
              </span>
            </div>
            <textarea
              rows={6}
              value={pdfText}
              onChange={e => setPdfText(e.target.value)}
              placeholder="Paste question paper text or transcripts here..."
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono text-xs focus:border-emerald-800 focus:outline-hidden"
            />
          </div>
        )}

        {/* Extract Button Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || (!pdfText.trim() && !pdfFileData)}
              className="px-6 py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Sparkles className={`w-4 h-4 text-emerald-300 ${extracting ? 'animate-spin' : ''}`} />
              <span>{extracting ? 'Extracting Questions with AI...' : 'Extract Questions to Sidebar'}</span>
            </button>

            {extractedQuestions.length > 0 && (
              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-lg">
                {extractedQuestions.length} Questions in Sidebar
              </span>
            )}
          </div>

          {(pdfText || pdfFileName || uploadedFiles.length > 0 || extractedQuestions.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setPdfText('');
                setPdfFileData('');
                setPdfFileName('');
                setUploadedFiles([]);
                setExtractedQuestions([]);
                setSelectedExtractedIds(new Set());
                setLocalAssignments({});
                setStatusMessage(null);
              }}
              className="text-xs text-slate-500 hover:text-rose-600 transition-colors underline"
            >
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* SECTION 2: EXTRACTED QUESTIONS STUDIO & 2-COLUMN SIDEBAR WORKSPACE */}
      {extractedQuestions.length > 0 && (
        <div className="space-y-4">
          {/* Top Overview & Bulk Assignment Action Bar */}
          <div className="p-4 rounded-2xl bg-emerald-900 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-800/80 border border-emerald-700">
                <CheckCircle2 className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">
                    {extractedQuestions.length} Questions Extracted
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-700/80 text-emerald-100 border border-emerald-600">
                    {aiEngineUsed ? 'Gemini 3.7 Flash AI' : 'Heuristic Engine'}
                  </span>
                </div>
                <p className="text-xs text-emerald-200 mt-0.5">
                  {selectedExtractedIds.size} of {extractedQuestions.length} selected for assignment. Select questions on the sidebar to review and assign to SME or Translator.
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openAssignmentModal('SELECTED')}
                disabled={selectedExtractedIds.size === 0}
                className="px-4 py-2 bg-white text-emerald-950 hover:bg-emerald-50 disabled:opacity-40 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all"
              >
                <Users className="w-3.5 h-3.5 text-emerald-800" />
                <span>Assign Selected ({selectedExtractedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={() => openAssignmentModal('BY_COUNT')}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs border border-emerald-700 flex items-center gap-1.5 transition-all"
              >
                <Send className="w-3.5 h-3.5 text-emerald-300" />
                <span>Assign by Number...</span>
              </button>
            </div>
          </div>

          {/* 2-COLUMN STUDIO LAYOUT: Extracted Questions Sidebar (Left) + Question Detail/Editor (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Extracted Questions Sidebar */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              {/* Sidebar Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-800" />
                  <span className="font-bold text-sm text-slate-900">Extracted Questions</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                    {filteredExtractedQuestions.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openAssignmentModal('SELECTED')}
                  disabled={selectedExtractedIds.size === 0}
                  className="px-3 py-1 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg font-bold text-[11px] flex items-center gap-1"
                >
                  <Users className="w-3 h-3 text-emerald-300" />
                  <span>Assign ({selectedExtractedIds.size})</span>
                </button>
              </div>

              {/* Sidebar Search & Filter Bar */}
              <div className="space-y-2 text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={e => setSidebarSearch(e.target.value)}
                    placeholder="Search question text or topic..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                  {sidebarSearch && (
                    <button
                      type="button"
                      onClick={() => setSidebarSearch('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-1">
                  {(['ALL', 'MCQ', 'THEORY', 'UNASSIGNED', 'ASSIGNED'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSidebarFilterType(tab)}
                      className={`px-2 py-1 rounded-md font-bold text-[10px] transition-colors ${
                        sidebarFilterType === tab
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Bulk Select Control Strip */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-emerald-800 hover:underline font-bold"
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">Quick:</span>
                    <button
                      type="button"
                      onClick={() => selectFirstN(5)}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold"
                    >
                      Top 5
                    </button>
                    <button
                      type="button"
                      onClick={() => selectFirstN(10)}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold"
                    >
                      Top 10
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Questions List */}
              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {filteredExtractedQuestions.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8 bg-slate-50 rounded-xl">
                    No questions matching filter.
                  </p>
                ) : (
                  filteredExtractedQuestions.map((q, filteredIdx) => {
                    const originalIdx = extractedQuestions.findIndex(item => item.tempId === q.tempId);
                    const isSelected = selectedExtractedIds.has(q.tempId);
                    const isActive = originalIdx === activeExtractedIndex;
                    const assignment = localAssignments[q.tempId];

                    return (
                      <div
                        key={q.tempId}
                        onClick={() => setActiveExtractedIndex(originalIdx)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-1.5 ${
                          isActive
                            ? 'bg-emerald-50/50 border-emerald-600 ring-2 ring-emerald-600/10 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        {/* Top Badges & Checkbox */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelection(q.tempId);
                              }}
                              className="text-emerald-800 hover:text-emerald-900"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-700" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>

                            <span className="font-bold text-slate-900 text-xs">
                              Q{originalIdx + 1}
                            </span>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                q.question_type === 'MCQ'
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {q.question_type}
                            </span>

                            <span className="text-[10px] text-slate-500 font-mono">
                              {q.marks}M
                            </span>
                          </div>

                          {/* Assignment Status Tag */}
                          <div>
                            {assignment?.smeName && assignment?.translatorName ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 flex items-center gap-1">
                                <Check className="w-2.5 h-2.5 text-emerald-700" />
                                <span>Both Assigned</span>
                              </span>
                            ) : assignment?.smeName ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1">
                                <UserCheck className="w-2.5 h-2.5 text-blue-700" />
                                <span>SME: {assignment.smeName.split(' ')[0]}</span>
                              </span>
                            ) : assignment?.translatorName ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                                <Languages className="w-2.5 h-2.5 text-purple-700" />
                                <span>{assignment.targetLanguage || 'Trans'}</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-500">
                                Unassigned
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Question Preview Snippet */}
                        <p className="text-slate-700 line-clamp-2 text-[11px] leading-relaxed">
                          {q.content_text}
                        </p>

                        {/* Metadata Footer */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                          <span>{q.topic || q.subject || 'General'}</span>
                          <span className="font-bold text-slate-500">{q.difficulty}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Selected Question Full Detail & In-Place Editor */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              {activeQuestion ? (
                <>
                  {/* Header with Navigation & Quick Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-mono font-bold text-xs">
                        Question #{activeExtractedIndex + 1}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          activeQuestion.question_type === 'MCQ'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {activeQuestion.question_type}
                      </span>
                      <span className="text-xs text-slate-500">
                        {activeQuestion.marks} Marks {activeQuestion.negative_marks ? `(-${activeQuestion.negative_marks})` : ''}
                      </span>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveExtractedIndex(prev => Math.max(0, prev - 1))}
                        disabled={activeExtractedIndex === 0}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700"
                        title="Previous Question"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <span className="text-[11px] font-mono text-slate-500 px-1">
                        {activeExtractedIndex + 1} / {extractedQuestions.length}
                      </span>

                      <button
                        type="button"
                        onClick={() => setActiveExtractedIndex(prev => Math.min(extractedQuestions.length - 1, prev + 1))}
                        disabled={activeExtractedIndex === extractedQuestions.length - 1}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700"
                        title="Next Question"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteExtractedQuestion(activeQuestion.tempId)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors ml-2"
                        title="Remove Question from Batch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Assignment Status Card for this specific question */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Assignment Status
                      </span>
                      {localAssignments[activeQuestion.tempId]?.smeName || localAssignments[activeQuestion.tempId]?.translatorName ? (
                        <div className="space-y-0.5 mt-0.5">
                          {localAssignments[activeQuestion.tempId]?.smeName && (
                            <div className="text-blue-900 font-bold flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-blue-700" />
                              <span>SME: {localAssignments[activeQuestion.tempId]?.smeName}</span>
                            </div>
                          )}
                          {localAssignments[activeQuestion.tempId]?.translatorName && (
                            <div className="text-purple-900 font-bold flex items-center gap-1.5">
                              <Languages className="w-3.5 h-3.5 text-purple-700" />
                              <span>Translator: {localAssignments[activeQuestion.tempId]?.translatorName} ({localAssignments[activeQuestion.tempId]?.targetLanguage})</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 font-medium mt-0.5 block">
                          Unassigned (Waiting for SME / Translator assignment)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignActiveQuestionDirectly(smes[0]?.id)}
                        className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg font-bold text-[11px] flex items-center gap-1"
                      >
                        <UserCheck className="w-3 h-3 text-blue-300" />
                        <span>Assign SME</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignActiveQuestionDirectly(undefined, translators[0]?.id, 'Hindi')}
                        className="px-3 py-1.5 bg-purple-900 hover:bg-purple-800 text-white rounded-lg font-bold text-[11px] flex items-center gap-1"
                      >
                        <Languages className="w-3 h-3 text-purple-300" />
                        <span>Assign Translator</span>
                      </button>
                    </div>
                  </div>

                  {/* Question Content Editor */}
                  <div className="space-y-1.5 text-xs">
                    <label className="block text-slate-700 font-bold">
                      Question Statement *
                    </label>
                    <textarea
                      rows={3}
                      value={activeQuestion.content_text}
                      onChange={e => updateActiveQuestion({ content_text: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                    />
                  </div>

                  {/* MCQ Options Editor */}
                  {activeQuestion.question_type === 'MCQ' && (
                    <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                      <label className="block text-slate-700 font-bold">
                        MCQ Options (A, B, C, D)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(activeQuestion.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isCorrect = (activeQuestion.correct_answer || 'A').toUpperCase().startsWith(letter);

                          return (
                            <div
                              key={optIdx}
                              className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                isCorrect
                                  ? 'bg-emerald-50/70 border-emerald-400'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => updateActiveQuestion({ correct_answer: letter })}
                                className={`w-6 h-6 rounded-full font-bold text-[11px] flex items-center justify-center shrink-0 transition-colors ${
                                  isCorrect
                                    ? 'bg-emerald-700 text-white'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                }`}
                                title="Mark as Correct Answer"
                              >
                                {letter}
                              </button>

                              <input
                                type="text"
                                value={opt}
                                onChange={e => {
                                  const nextOpts = [...(activeQuestion.options || [])];
                                  nextOpts[optIdx] = e.target.value;
                                  updateActiveQuestion({ options: nextOpts });
                                }}
                                className="w-full px-2 py-1 rounded bg-transparent border-0 text-slate-900 text-xs focus:bg-white focus:ring-1 focus:ring-emerald-800 focus:outline-hidden"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Correct Answer & Rubric Criteria */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs border-t border-slate-100 pt-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Correct Answer / Model Key
                      </label>
                      <input
                        type="text"
                        value={activeQuestion.correct_answer || ''}
                        onChange={e => updateActiveQuestion({ correct_answer: e.target.value })}
                        placeholder="e.g. B or Derivation criteria"
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-bold focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Topic / Discipline Area
                      </label>
                      <input
                        type="text"
                        value={activeQuestion.topic || ''}
                        onChange={e => updateActiveQuestion({ topic: e.target.value })}
                        placeholder="e.g. Cryptography / Electrodynamics"
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Difficulty, Marks, Negative Marks, Type row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-100 pt-3">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Type</label>
                      <select
                        value={activeQuestion.question_type}
                        onChange={e => updateActiveQuestion({ question_type: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                      >
                        <option value="MCQ">MCQ</option>
                        <option value="THEORY">THEORY</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Difficulty</label>
                      <select
                        value={activeQuestion.difficulty}
                        onChange={e => updateActiveQuestion({ difficulty: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                      >
                        <option value="EASY">EASY</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HARD">HARD</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Marks</label>
                      <input
                        type="number"
                        value={activeQuestion.marks}
                        onChange={e => updateActiveQuestion({ marks: Number(e.target.value) })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Negative Marks</label>
                      <input
                        type="number"
                        step="0.5"
                        value={activeQuestion.negative_marks}
                        onChange={e => updateActiveQuestion({ negative_marks: Number(e.target.value) })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-700">No question selected</p>
                  <p className="text-xs text-slate-500">Select any extracted question from the sidebar to inspect and configure.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: QUESTION ASSIGNMENT MODAL (Select SME / Translator & Number/Specific Qs) */}
      {/* ========================================================================= */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">
                  Assign Extracted Questions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: CHOOSE ASSIGNMENT MODE (Specific Questions vs. Number of Questions) */}
            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-bold">
                1. How do you want to choose questions to assign?
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAssignMode('SELECTED')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    assignMode === 'SELECTED'
                      ? 'bg-emerald-950/70 border-emerald-500 ring-1 ring-emerald-500 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold text-white flex items-center justify-between">
                    <span>Selected Questions</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-800 font-mono">
                      {selectedExtractedIds.size} Selected
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Assign the specific questions checked in the sidebar.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAssignMode('BY_COUNT')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    assignMode === 'BY_COUNT'
                      ? 'bg-emerald-950/70 border-emerald-500 ring-1 ring-emerald-500 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold text-white flex items-center justify-between">
                    <span>Enter Number (Count)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-700 font-mono">
                      e.g. 5 / 10 Qs
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Assign a specific number of unassigned questions in order.
                  </p>
                </button>
              </div>

              {/* If by count, show number input & presets */}
              {assignMode === 'BY_COUNT' && (
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-medium text-[11px]">
                      Enter Number of Questions to Assign:
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Max: {extractedQuestions.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={extractedQuestions.length}
                      value={assignCountInput}
                      onChange={e => setAssignCountInput(Math.max(1, Math.min(extractedQuestions.length, Number(e.target.value))))}
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold text-xs"
                    />

                    <div className="flex items-center gap-1 text-[11px]">
                      {[5, 10, 15, 20].filter(n => n <= extractedQuestions.length).map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAssignCountInput(n)}
                          className={`px-2 py-1 rounded font-mono font-bold ${
                            assignCountInput === n
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAssignCountInput(extractedQuestions.length)}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 font-bold"
                      >
                        All ({extractedQuestions.length})
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: CHOOSE TARGET ROLE (SME, TRANSLATOR, BOTH) */}
            <div className="space-y-3 text-xs border-t border-slate-800 pt-3">
              <label className="block text-slate-300 font-bold">
                2. Select Assignee Role & Member ({org?.name || 'Your Organization'})
              </label>

              {/* Role Toggle Tabs */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAssignTargetRole('SME')}
                  className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    assignTargetRole === 'SME'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>SME Review</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAssignTargetRole('TRANSLATOR')}
                  className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    assignTargetRole === 'TRANSLATOR'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>Translator</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAssignTargetRole('BOTH')}
                  className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    assignTargetRole === 'BOTH'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Both (SME + Trans)</span>
                </button>
              </div>

              {/* SME User Selection */}
              {(assignTargetRole === 'SME' || assignTargetRole === 'BOTH') && (
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Select Subject Matter Expert (SME) *
                  </label>
                  {smes.length === 0 ? (
                    <p className="text-amber-400 bg-amber-950/40 p-2 rounded border border-amber-800 text-[11px]">
                      No SME users found in your organization. Please authorize an SME user in the Organization module first.
                    </p>
                  ) : (
                    <select
                      value={assignTargetSmeId}
                      onChange={e => setAssignTargetSmeId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-emerald-500 focus:outline-hidden"
                    >
                      {smes.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.email}) — Role: {s.role}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Questions will become visible strictly in this SME's verification queue.
                  </span>
                </div>
              )}

              {/* Translator User & Language Selection */}
              {(assignTargetRole === 'TRANSLATOR' || assignTargetRole === 'BOTH') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Select Linguistic Translator *
                    </label>
                    {translators.length === 0 ? (
                      <p className="text-amber-400 bg-amber-950/40 p-2 rounded border border-amber-800 text-[11px]">
                        No Translator users found.
                      </p>
                    ) : (
                      <select
                        value={assignTargetTranslatorId}
                        onChange={e => setAssignTargetTranslatorId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-emerald-500 focus:outline-hidden"
                      >
                        {translators.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.full_name} ({t.email})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Target Language for Translation *
                    </label>
                    <select
                      value={assignTargetLanguage}
                      onChange={e => setAssignTargetLanguage(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-emerald-500 focus:outline-hidden"
                    >
                      {SUPPORTED_TRANSLATION_LANGUAGES.map(l => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Special Instructions / Notes */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Assignment Notes / Review Guidelines (Optional)
                </label>
                <input
                  type="text"
                  value={assignNotes}
                  onChange={e => setAssignNotes(e.target.value)}
                  placeholder="e.g. Verify formula formatting and syllabus alignment for 2026 examination."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden text-xs"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteAssignment}
                disabled={assigningLoading}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>
                  {assigningLoading
                    ? 'Creating & Assigning...'
                    : `Confirm & Assign ${assignMode === 'SELECTED' ? selectedExtractedIds.size : assignCountInput} Questions`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
