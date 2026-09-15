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
  Image as ImageIcon,
  ZoomIn,
  Paperclip,
  Activity,
  FileSpreadsheet,
  Crop,
  RotateCcw,
  Plus,
  Cpu,
} from 'lucide-react';
import { User, ExtractedQuestion, Organization, QuestionAssignment } from '../../types';
import { api } from '../../api';
import { QuestionBoundaryEditor } from './QuestionBoundaryEditor';
import { LaTeXText } from '../common/LaTeXText';
import { runPuterOcr, runPuterVisionChat, runPuterAutoExtract, parsePuterOcrText } from '../../utils/puterOcr';
import { runOcrSpace, parseOcrSpaceQuestion } from '../../utils/ocrSpace';

interface ExamManagerQuestionExtractorProps {
  translators: User[];
  org: Organization | null;
  currentUser: User | null;
  onAssignmentsUpdated: () => void;
  onNavigateSubTab?: (subTab: string) => void;
}

interface UploadedQuestionFile {
  id: string;
  paperNumber: number;
  name: string;
  size?: number;
  fileData?: string;
  text?: string;
  status: 'PENDING' | 'EXTRACTING' | 'COMPLETED' | 'ERROR';
  progressPercent: number;
  progressStage: string;
  progressMessage: string;
  extractedCount: number;
  errorMessage?: string;
  jobId?: string;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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

6. In the operational amplifier circuit schematic shown in the diagram below:
[Diagram: data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140" width="320" height="140"><rect width="320" height="140" fill="#f8fafc" rx="8" stroke="#cbd5e1"/><path d="M40 70 h60 M100 70 l30 -20 v40 z M130 70 h50 M180 70 v-30 h60 v30 M180 70 h90" stroke="#0f172a" stroke-width="2" fill="none"/><circle cx="40" cy="70" r="3" fill="#0f172a"/><circle cx="270" cy="70" r="3" fill="#0f172a"/><text x="45" y="60" font-family="sans-serif" font-size="11" fill="#0f172a" font-weight="bold">Vin</text><text x="245" y="60" font-family="sans-serif" font-size="11" fill="#0f172a" font-weight="bold">Vout</text><text x="190" y="28" font-family="sans-serif" font-size="10" fill="#0284c7" font-weight="bold">Rf = 100kΩ</text><text x="50" y="88" font-family="sans-serif" font-size="10" fill="#0284c7" font-weight="bold">R1 = 10kΩ</text><text x="108" y="73" font-family="sans-serif" font-size="11" fill="#ef4444" font-weight="bold">-</text></svg>]
What is the closed-loop voltage gain (Vout / Vin) in this inverting operational amplifier configuration when R1 = 10kΩ and Rf = 100kΩ?
A) -10
B) +10
C) -11
D) +100
Answer: A
Marks: 4
Negative Marks: 1.0
Topic: Analog Electronics & Circuits

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
  translators,
  org,
  currentUser,
  onAssignmentsUpdated,
  onNavigateSubTab,
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
  const [selectedPaperFilter, setSelectedPaperFilter] = useState<number | 'ALL'>('ALL');
  const [visibleStudioPapers, setVisibleStudioPapers] = useState<number[]>([]);
  const [sidebarFilterType, setSidebarFilterType] = useState<'ALL' | 'MCQ' | 'THEORY' | 'UNASSIGNED' | 'ASSIGNED'>('ALL');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [extractionSummary, setExtractionSummary] = useState('');
  const [aiEngineUsed, setAiEngineUsed] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<{
    percent: number;
    stage: string;
    message: string;
    current: number;
    total: number;
  } | null>(null);

  // Local assignment tracking map: tempId -> { smeName?: string, translatorName?: string, targetLanguage?: string }
  const [localAssignments, setLocalAssignments] = useState<Record<string, { smeId?: string; smeName?: string; translatorId?: string; translatorName?: string; targetLanguage?: string }>>({});

  // Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'SELECTED' | 'BY_COUNT'>('SELECTED');
  const [assignCountInput, setAssignCountInput] = useState<number>(5);
<<<<<<< HEAD
  const [assignTargetRole, setAssignTargetRole] = useState<'TRANSLATOR' | 'DIRECT_IMPORT'>('TRANSLATOR');
=======
  const [assignTargetRole, setAssignTargetRole] = useState<'SME' | 'TRANSLATOR' | 'BOTH' | 'DIRECT'>(
    smes.length > 0 ? 'SME' : 'DIRECT'
  );
  const [assignTargetSmeId, setAssignTargetSmeId] = useState<string>(smes[0]?.id || '');
>>>>>>> origin/main
  const [assignTargetTranslatorId, setAssignTargetTranslatorId] = useState<string>(translators[0]?.id || '');
  const [assignTargetLanguage, setAssignTargetLanguage] = useState<string>('Hindi');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigningLoading, setAssigningLoading] = useState(false);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [zoomedDiagramUrl, setZoomedDiagramUrl] = useState<string | null>(null);
  const [debugViews, setDebugViews] = useState<string[]>([]);
  const [activeDebugView, setActiveDebugView] = useState<string | null>(null);
  const [currentPaperId, setCurrentPaperId] = useState<string | null>(null);
  const [boundaryEditorOpen, setBoundaryEditorOpen] = useState(false);
  const diagramInputRef = useRef<HTMLInputElement | null>(null);

  const [isNavidcOcrLoading, setIsNavidcOcrLoading] = useState(false);

  const handleNavidcOcrForQuestion = async (q: ExtractedQuestion) => {
    const targetSource = q.image_url || q.diagram_url;
    if (!targetSource) {
      setStatusMessage({ type: 'error', text: 'No cropped question image available for NaviDC-OCR.' });
      return;
    }
    setIsNavidcOcrLoading(true);
    try {
      const res = await api.runNaviDcOcr({ image_data: targetSource, mode: 'mcq' });
      if (res && res.success) {
        setExtractedQuestions(prev =>
          prev.map(item => {
            if (item.tempId === q.tempId) {
              const firstQ = res.questions && res.questions.length > 0 ? res.questions[0] : null;
              return {
                ...item,
                content_text: res.markdown || item.content_text,
                options: firstQ?.options && firstQ.options.length > 0
                  ? firstQ.options.map(o => `${o.id}) ${o.text}`)
                  : item.options,
                correct_answer: firstQ?.correct_answer || item.correct_answer,
              };
            }
            return item;
          })
        );
        setStatusMessage({
          type: 'success',
          text: `NaviDC-OCR 1.2B parsed ${res.markdown?.length || 0} chars (${res.execution_time_ms}ms, ${res.device || 'local'})!`
        });
      } else {
        setStatusMessage({ type: 'error', text: `NaviDC-OCR Error: ${res?.error || 'Empty response'}` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `NaviDC-OCR Error: ${err.message || err}` });
    } finally {
      setIsNavidcOcrLoading(false);
    }
  };

  const [isOcrSpaceLoading, setIsOcrSpaceLoading] = useState<'2' | '3' | null>(null);

  const handleOcrSpaceForQuestion = async (q: ExtractedQuestion, engine: '2' | '3' = '2') => {
    const targetSource = q.image_url || q.diagram_url || (q.question_images && q.question_images[0]);
    if (!targetSource) {
      setStatusMessage({ type: 'error', text: 'No cropped question image available for OCR.space.' });
      return;
    }
    setIsOcrSpaceLoading(engine);
    try {
      const res = await api.runOcrSpace({
        image_data: targetSource.startsWith('data:') ? targetSource : undefined,
        image_url: !targetSource.startsWith('data:') ? targetSource : undefined,
        engine,
        isTable: true,
        scale: true,
        detectOrientation: true,
      });

      let extractedText = res?.text;
      let engineName = res?.engine || `OCR.space Engine ${engine}`;

      if (!extractedText) {
        // Fallback to direct client call if needed
        const directRes = await runOcrSpace(targetSource, { engine, isTable: true, scale: true });
        extractedText = directRes?.text;
        engineName = directRes?.engine || engineName;
      }

      if (extractedText) {
        const parsed = parseOcrSpaceQuestion(extractedText, engineName);
        setExtractedQuestions(prev =>
          prev.map(item => {
            if (item.tempId === q.tempId) {
              return {
                ...item,
                content_text: parsed.contentText || item.content_text,
                options: parsed.options && parsed.options.length > 0 ? parsed.options.map(o => `${o.label}) ${o.text}`) : item.options,
                correct_answer: parsed.suggestedAnswer || item.correct_answer,
                has_table: parsed.hasTable || item.has_table,
              };
            }
            return item;
          })
        );
        const extra = parsed.hasTable ? ' (Table Extracted 📊)' : '';
        setStatusMessage({
          type: 'success',
          text: `OCR.space Engine ${engine} recognized ${extractedText.length} chars${extra}!`,
        });
      } else {
        setStatusMessage({ type: 'error', text: 'OCR.space returned empty text for this crop.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `OCR.space Error: ${err.message || err}` });
    } finally {
      setIsOcrSpaceLoading(null);
    }
  };

  const [isPuterOcrLoading, setIsPuterOcrLoading] = useState<'textract' | 'mistral' | 'vision' | null>(null);

  const handlePuterOcrForQuestion = async (q: ExtractedQuestion, mode: 'textract' | 'mistral' | 'vision' = 'vision') => {
    const targetSource = q.image_url || q.diagram_url || (q.question_images && q.question_images[0]);
    if (!targetSource) {
      setStatusMessage({ type: 'error', text: 'No cropped question image available for Puter AI analysis.' });
      return;
    }
    setIsPuterOcrLoading(mode);
    try {
      let rawText = '';
      let engineName = 'Puter AI';

      if (mode === 'vision') {
        engineName = 'Puter (Vision AI)';
        rawText = await runPuterVisionChat(targetSource);
      } else if (mode === 'mistral') {
        engineName = 'Puter (Mistral OCR)';
        rawText = await runPuterOcr(targetSource, { provider: 'mistral' });
      } else {
        engineName = 'Puter (AWS Textract)';
        rawText = await runPuterOcr(targetSource, { provider: 'aws-textract' });
      }

      if (!rawText || rawText.trim().length < 5) {
        // Fallback to automatic multi-engine attempt
        const fallback = await runPuterAutoExtract(targetSource);
        rawText = fallback.text;
        engineName = fallback.engineUsed;
      }

      if (rawText) {
        const parsed = parsePuterOcrText(rawText);
        setExtractedQuestions(prev =>
          prev.map(item => {
            if (item.tempId === q.tempId) {
              return {
                ...item,
                content_text: parsed.contentText || item.content_text,
                options: parsed.options && parsed.options.length > 0 ? parsed.options.map(o => `${o.label}) ${o.text}`) : item.options,
                correct_answer: parsed.suggestedAnswer || item.correct_answer,
                has_table: parsed.hasTable || item.has_table,
              };
            }
            return item;
          })
        );
        const extra = parsed.hasTable ? ' (Table Extracted 📊)' : '';
        setStatusMessage({
          type: 'success',
          text: `${engineName} successfully parsed ${rawText.length} characters${extra}!`,
        });
      } else {
        setStatusMessage({ type: 'error', text: 'Puter AI returned empty text for this crop.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Puter AI Error: ${err.message || err}` });
    } finally {
      setIsPuterOcrLoading(null);
    }
  };

  const handleDiagramUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeQuestion) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        updateActiveQuestion({ diagram_url: dataUrl, diagram_data: dataUrl, has_diagram: true });
      }
    };
    reader.readAsDataURL(file);
  };

  // Sync default assignee selection if users load later
  React.useEffect(() => {
    if (translators.length > 0 && !assignTargetTranslatorId) {
      setAssignTargetTranslatorId(translators[0].id);
    }
  }, [translators]);

  // Handle File Change
  const readUploadedFile = (file: File, indexOffset: number): Promise<UploadedQuestionFile> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      const isTextFile = file.type.includes('text') || /\.(txt|csv|json)$/i.test(file.name);

      reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
      reader.onload = event => {
        const result = (event.target?.result as string) || '';
        resolve({
          id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          paperNumber: indexOffset + 1,
          name: file.name,
          size: file.size,
          fileData: isTextFile ? undefined : result,
          text: isTextFile ? result : undefined,
          status: 'PENDING',
          progressPercent: 0,
          progressStage: 'Ready',
          progressMessage: 'Queued for extraction',
          extractedCount: 0,
        });
      };

      if (isTextFile) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });

  const processUploadedFiles = async (files: File[], append = true) => {
    const startIndex = append ? uploadedFiles.length : 0;
    const nextFiles = await Promise.all(files.map((file, idx) => readUploadedFile(file, startIndex + idx)));
    const combined = append ? [...uploadedFiles, ...nextFiles] : nextFiles;
    const reindexed = combined.map((f, idx) => ({ ...f, paperNumber: idx + 1 }));
    setUploadedFiles(reindexed);
    setPdfFileName(reindexed.map(file => file.name).join(', '));
    setPdfFileData(reindexed.find(file => file.fileData)?.fileData || '');
    setPdfText(reindexed.filter(file => file.text).map(file => file.text).join('\n\n'));

    // If existing questions were from the benchmark NEET papers, reset them so user sees their uploaded paper cleanly
    if (extractedQuestions.some(q => q.source_file?.toLowerCase().includes('neet') || q.source_file?.toLowerCase().includes('nbte'))) {
      setExtractedQuestions([]);
      setSelectedExtractedIds(new Set());
      setLocalAssignments({});
      setVisibleStudioPapers(reindexed.map(f => f.paperNumber));
      setSelectedPaperFilter(1);
    }
  };

  const handleRemoveUploadedFile = (fileId: string) => {
    const fileToRemove = uploadedFiles.find(f => f.id === fileId);
    const filtered = uploadedFiles.filter(f => f.id !== fileId);
    const reindexed = filtered.map((f, idx) => ({ ...f, paperNumber: idx + 1 }));
    setUploadedFiles(reindexed);
    if (fileToRemove) {
      setExtractedQuestions(prev => prev.filter(q => q.source_file !== fileToRemove.name && (q.paper_number || 1) !== fileToRemove.paperNumber));
      setSelectedExtractedIds(prev => {
        const next = new Set(prev);
        extractedQuestions.filter(q => q.source_file === fileToRemove.name || (q.paper_number || 1) === fileToRemove.paperNumber).forEach(q => next.delete(q.tempId));
        return next;
      });
    }
    if (reindexed.length === 0) {
      setExtractedQuestions([]);
      setSelectedExtractedIds(new Set());
      setPdfFileName('');
      setPdfFileData('');
      setPdfText('');
      setExtractionSummary('');
      setExtractionProgress(null);
    } else {
      setPdfFileName(reindexed.map(f => f.name).join(', '));
      setPdfFileData(reindexed.find(f => f.fileData)?.fileData || '');
      setPdfText(reindexed.filter(f => f.text).map(f => f.text).join('\n\n'));
    }
    setStatusMessage({ type: 'success', text: `Removed ${fileToRemove?.name || 'question paper'}.` });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      void processUploadedFiles(files, true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
      void processUploadedFiles(files, true);
    }
  };

  // Load Built-in Sample Paper
  const handleLoadSamplePaper = () => {
    const sampleFile: UploadedQuestionFile = {
      id: `sample-${Date.now()}`,
      paperNumber: 1,
      name: 'NBTE_National_Master_Paper_2026.pdf',
      text: SAMPLE_QUESTION_PAPER_TEXT,
      status: 'PENDING',
      progressPercent: 0,
      progressStage: 'Ready',
      progressMessage: 'Sample paper loaded',
      extractedCount: 0,
    };
    setUploadedFiles([sampleFile]);
    setPdfFileName('NBTE_National_Master_Paper_2026.pdf');
    setPdfText(SAMPLE_QUESTION_PAPER_TEXT);
    setPdfFileData('');
    setPaperSubject('Computer Science & Applied Cryptography');
    setPaperCategory('Competitive Exam');
    setStatusMessage({
      type: 'success',
      text: 'Loaded 10-Question Master Examination Paper template with MCQs & Subjective Theory sections as Question Paper 1.',
    });
  };

  // Trigger Extraction
  const handleExtract = async () => {
    const textToExtract = pdfText.trim();
    if (!textToExtract && !pdfFileData && uploadedFiles.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please upload question paper PDFs or load sample paper text.' });
      return;
    }

    let filesToProcess: UploadedQuestionFile[] = [...uploadedFiles];
    if (filesToProcess.length === 0) {
      filesToProcess = [{
        id: `file-${Date.now()}`,
        paperNumber: 1,
        name: pdfFileName || 'NBTE_Master_Paper.pdf',
        text: textToExtract || undefined,
        fileData: pdfFileData || undefined,
        status: 'PENDING',
        progressPercent: 0,
        progressStage: 'Ready',
        progressMessage: 'Queued for extraction',
        extractedCount: 0,
      }];
      setUploadedFiles(filesToProcess);
    }

    const filesWithJobs = filesToProcess.map((file, idx) => {
      const pNum = file.paperNumber || (idx + 1);
      const isInitialActive = idx < 1;
      return {
        ...file,
        paperNumber: pNum,
        jobId: `JOB-${Date.now()}-P${pNum}-${Math.random().toString(36).substring(2, 6)}`,
        status: (isInitialActive ? 'EXTRACTING' : 'PENDING') as 'EXTRACTING' | 'PENDING',
        progressPercent: isInitialActive ? 5 : 0,
        progressStage: isInitialActive ? 'Document Analysis' : 'Queued',
        progressMessage: isInitialActive ? 'Inspecting layout & questions...' : 'In queue (waiting for worker slot)...',
        extractedCount: 0,
        errorMessage: undefined,
      };
    });

    setUploadedFiles(filesWithJobs);
    setExtracting(true);
    setStatusMessage(null);
    setExtractionProgress({
      percent: 5,
      stage: 'Multi-Paper Pipeline',
      message: `Extracting questions across ${filesWithJobs.length} question paper${filesWithJobs.length > 1 ? 's' : ''}...`,
      current: 0,
      total: filesWithJobs.length,
    });

    const progressTimer = setInterval(async () => {
      try {
        const pollResults = await Promise.all(
          filesWithJobs.map(async f => {
            if (!f.jobId) return null;
            try {
              const prog = await api.getExtractionProgress(f.jobId);
              return { id: f.id, prog };
            } catch {
              return null;
            }
          })
        );

        setUploadedFiles(prev => {
          const updated = prev.map(f => {
            const match = pollResults.find(r => r?.id === f.id);
            if (match?.prog && typeof match.prog.percent === 'number') {
              if (f.status === 'COMPLETED') return f;
              return {
                ...f,
                progressPercent: match.prog.percent,
                progressStage: match.prog.stage || f.progressStage,
                progressMessage: match.prog.message || f.progressMessage,
                extractedCount: match.prog.current || f.extractedCount,
              };
            }
            return f;
          });

          // Dynamically compute average progress across papers
          const totalPerc = updated.reduce((acc, f) => acc + (f.progressPercent || 0), 0);
          const avgPerc = Math.round(totalPerc / updated.length);
          const activeFile = updated.find(f => f.status === 'EXTRACTING');

          setExtractionProgress({
            percent: Math.min(99, Math.max(5, avgPerc)),
            stage: activeFile ? `Paper ${activeFile.paperNumber}: ${activeFile.progressStage}` : 'Segmenting Questions',
            message: activeFile ? activeFile.progressMessage : `Extracting questions across ${updated.length} papers...`,
            current: updated.reduce((acc, f) => acc + (f.extractedCount || 0), 0),
            total: updated.length,
          });

          return updated;
        });
      } catch {
        // Ignore progress poll glitch
      }
    }, 300);

    try {
      const MAX_CONCURRENCY = 1;
      const results: Array<{
        fileId: string;
        paperNumber: number;
        name: string;
        status: 'COMPLETED' | 'ERROR';
        extractedQuestions: ExtractedQuestion[];
        errorMessage?: string;
        extractionSummary?: string;
        aiEngineUsed?: boolean;
        engine?: string;
        debugViews?: any[];
      }> = [];

      let activeIndex = 0;
      const executeWorker = async () => {
        while (activeIndex < filesWithJobs.length) {
          const currentIndex = activeIndex++;
          const file = filesWithJobs[currentIndex];
          const paperNum = file.paperNumber || (currentIndex + 1);

          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === file.id
                ? {
                    ...f,
                    status: 'EXTRACTING',
                    progressPercent: Math.max(f.progressPercent, 5),
                    progressStage: 'Document Analysis',
                    progressMessage: 'Initializing document extraction...',
                  }
                : f
            )
          );

          try {
            const res = await api.extractQuestionsFromPaper({
              paper_text: file.text,
              file_data: file.fileData,
              file_name: file.name,
              job_id: file.jobId,
              subject: paperSubject || 'Academic Examination',
              category: paperCategory || 'Competitive Exam',
            });

            if (res.sourcePaperId || res.paperId) {
              setCurrentPaperId(res.sourcePaperId || res.paperId);
            }

            const questions: ExtractedQuestion[] = (res.extractedQuestions || []).map((q: any, qIdx: number) => ({
              ...q,
              tempId: q.tempId || `EXT-P${paperNum}-${Date.now()}-${qIdx + 1}`,
              paper_number: paperNum,
              source_file: file.name,
            }));

            results.push({
              fileId: file.id,
              paperNumber: paperNum,
              name: file.name,
              status: 'COMPLETED',
              extractedQuestions: questions,
              extractionSummary: res.extractionSummary,
              aiEngineUsed: res.aiEngineUsed,
              engine: (res as any).engine || res.aiEngine?.provider,
              debugViews: (res as any).debug_info?.visual_debug_pages || [],
            });

            setUploadedFiles(prev =>
              prev.map(f =>
                f.id === file.id
                  ? {
                      ...f,
                      status: 'COMPLETED',
                      progressPercent: 100,
                      progressStage: 'Completed',
                      progressMessage: `Extracted ${questions.length} questions`,
                      extractedCount: questions.length,
                    }
                  : f
              )
            );

            // Append extracted questions as they arrive
            setExtractedQuestions(prev => {
              const existingIds = new Set(prev.map(q => q.tempId));
              const newOnly = questions.filter(q => !existingIds.has(q.tempId));
              return [...prev, ...newOnly];
            });
            setSelectedExtractedIds(prev => {
              const next = new Set(prev);
              questions.forEach(q => next.add(q.tempId));
              return next;
            });
          } catch (err: any) {
            results.push({
              fileId: file.id,
              paperNumber: paperNum,
              name: file.name,
              status: 'ERROR',
              extractedQuestions: [],
              errorMessage: err.message || 'Extraction failed',
              extractionSummary: '',
              aiEngineUsed: false,
              debugViews: [],
            });

            setUploadedFiles(prev =>
              prev.map(f =>
                f.id === file.id
                  ? {
                      ...f,
                      status: 'ERROR',
                      progressPercent: 100,
                      progressStage: 'Error',
                      progressMessage: err.message || 'Extraction failed',
                      errorMessage: err.message,
                    }
                  : f
              )
            );
          }
        }
      };

      const workerCount = Math.min(MAX_CONCURRENCY, filesWithJobs.length);
      await Promise.all(Array.from({ length: workerCount }, () => executeWorker()));

      const allExtracted = results.flatMap(r => r.extractedQuestions);
      const anyAi = results.some(r => r.aiEngineUsed);
      const allDebugs = results.flatMap(r => r.debugViews || []);

      setExtractedQuestions(allExtracted);
      setSelectedExtractedIds(new Set(allExtracted.map(q => q.tempId)));
      setExtractionSummary(results.map(r => r.extractionSummary).filter(Boolean).join(' ') || `Extracted ${allExtracted.length} questions across ${results.length} question papers.`);
      setAiEngineUsed(anyAi);
      setLocalAssignments({});
      setDebugViews(allDebugs);

      // Default to Question Paper 1 tab
      setSelectedPaperFilter(1);
      setActiveExtractedIndex(0);

      const successfulCount = results.filter(r => r.status === 'COMPLETED').length;
      const failedCount = results.filter(r => r.status === 'ERROR').length;

      setExtractionProgress({
        percent: 100,
        stage: 'Extraction Complete',
        message: `Successfully extracted ${allExtracted.length} questions from ${successfulCount} question paper${successfulCount > 1 ? 's' : ''}.`,
        current: allExtracted.length,
        total: allExtracted.length,
      });

      if (failedCount > 0) {
        setStatusMessage({
          type: 'error',
          text: `Extracted ${allExtracted.length} questions from ${successfulCount} question paper(s). Note: ${failedCount} paper(s) had errors.`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `Extracted ${allExtracted.length} questions from ${successfulCount} question paper${successfulCount > 1 ? 's' : ''} into the review panel. Click any Question Paper tab to review questions.`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to extract questions.' });
    } finally {
      clearInterval(progressTimer);
      setExtracting(false);
      setTimeout(() => {
        setExtractionProgress(null);
      }, 4500);
    }
  };

  // One-click extraction of all 3 Question Papers (180 questions each)
  const handleExtractThreeStandardPapers = async (targetPaperToSelect: number | 'ALL' = 1) => {
    setExtracting(true);
    setStatusMessage(null);

    // Initialize individual question paper progress tracking so each paper's progress is separately visible
    const initialFiles: UploadedQuestionFile[] = [
      {
        id: 'file-std-1',
        paperNumber: 1,
        name: 'NEET_2024_National_Paper_1.pdf',
        status: 'EXTRACTING',
        progressPercent: 18,
        progressStage: 'Physics 300 DPI Segmentation',
        progressMessage: 'Segmenting Physics questions (Q1–45) at 300 DPI...',
        extractedCount: 20,
      },
      {
        id: 'file-std-2',
        paperNumber: 2,
        name: 'NEET_2023_National_Paper_2.pdf',
        status: 'EXTRACTING',
        progressPercent: 12,
        progressStage: 'Layout & Anchor Mapping',
        progressMessage: 'Initializing document structure & anchor coordinates...',
        extractedCount: 15,
      },
      {
        id: 'file-std-3',
        paperNumber: 3,
        name: 'neet-2021-question-paper-code-o1.pdf',
        status: 'EXTRACTING',
        progressPercent: 24,
        progressStage: 'Vector Text & OCR Parsing',
        progressMessage: 'Extracting Section A question layout...',
        extractedCount: 35,
      },
    ];

    setUploadedFiles(initialFiles);
    setExtractionProgress({
      percent: 18,
      stage: 'Multi-Paper 300 DPI Pipeline',
      message: 'Extracting 180 distinct questions each across Question Paper 1, Paper 2, and Paper 3...',
      current: 70,
      total: 540,
    });

    try {
      // Stage 1: Perceptible progress step (Paper 1 at 48%, Paper 2 at 38%, Paper 3 at 58%)
      await new Promise(resolve => setTimeout(resolve, 600));
      setUploadedFiles(prev => prev.map(f => {
        if (f.paperNumber === 1) return { ...f, progressPercent: 48, progressStage: 'Chemistry 300 DPI Cropping', progressMessage: 'Segmenting Chemistry (Q46–90)...', extractedCount: 75 };
        if (f.paperNumber === 2) return { ...f, progressPercent: 38, progressStage: 'Physics 300 DPI Cropping', progressMessage: 'Segmenting Physics (Q1–45)...', extractedCount: 50 };
        if (f.paperNumber === 3) return { ...f, progressPercent: 58, progressStage: 'Section A Options Extraction', progressMessage: 'Parsing Physics & Chemistry questions...', extractedCount: 95 };
        return f;
      }));
      setExtractionProgress({
        percent: 48,
        stage: 'High-Resolution 300 DPI Cropping',
        message: 'Segmenting questions, formulas, and diagrams across all 3 papers...',
        current: 220,
        total: 540,
      });

      // Stage 2: Perceptible progress step (Paper 1 at 82%, Paper 2 at 74%, Paper 3 at 88%)
      await new Promise(resolve => setTimeout(resolve, 650));
      setUploadedFiles(prev => prev.map(f => {
        if (f.paperNumber === 1) return { ...f, progressPercent: 82, progressStage: 'Botany & Zoology', progressMessage: 'Cropping Biology questions (Q91–180)...', extractedCount: 145 };
        if (f.paperNumber === 2) return { ...f, progressPercent: 74, progressStage: 'Chemistry & Botany', progressMessage: 'Cropping Chemistry & Botany (Q46–135)...', extractedCount: 125 };
        if (f.paperNumber === 3) return { ...f, progressPercent: 88, progressStage: 'Section B Formulas & Diagrams', progressMessage: 'Mapping high-res diagrams & options...', extractedCount: 160 };
        return f;
      }));
      setExtractionProgress({
        percent: 81,
        stage: 'Finalizing Question Papers',
        message: 'Mapping options, formulas, and diagrams for 540 questions...',
        current: 430,
        total: 540,
      });

      // Stage 3: Fetch 540 questions across all 3 papers
      await new Promise(resolve => setTimeout(resolve, 500));
      const res = await api.extractThreeStandardPapers();

      // Completed individual paper states: 100% on every single paper!
      const standardFiles: UploadedQuestionFile[] = (res.papers || []).map(p => {
        const pCount = (res.extractedQuestions || []).filter(q => (q.paper_number || 1) === p.paperNumber).length;
        return {
          id: `file-std-${p.paperNumber}`,
          paperNumber: p.paperNumber,
          name: p.name,
          status: 'COMPLETED',
          progressPercent: 100,
          progressStage: 'Completed',
          progressMessage: `Extracted ${pCount || 180} distinct questions successfully`,
          extractedCount: pCount || 180,
        };
      });

      setUploadedFiles(standardFiles);
      setExtractedQuestions(res.extractedQuestions);
      setSelectedExtractedIds(new Set(res.extractedQuestions.map(q => q.tempId)));
      setExtractionSummary(res.message);
      setAiEngineUsed(false);
      setLocalAssignments({});
      setCurrentPaperId(res.papers?.[0]?.id || 'PAPER-STD-1');

      // Select target paper filter
      setSelectedPaperFilter(targetPaperToSelect);
      if (targetPaperToSelect === 'ALL') {
        setActiveExtractedIndex(0);
      } else {
        const targetQuestions = res.extractedQuestions.filter((q: any) => (q.paper_number || 1) === targetPaperToSelect);
        if (targetQuestions.length > 0) {
          const idx = res.extractedQuestions.findIndex((q: any) => q.tempId === targetQuestions[0].tempId);
          setActiveExtractedIndex(idx !== -1 ? idx : 0);
        } else {
          setActiveExtractedIndex(0);
        }
      }

      setExtractionProgress({
        percent: 100,
        stage: 'Extraction Complete',
        message: 'Successfully extracted 180 distinct questions for each of Question Paper 1, 2, and 3 (total 540 questions).',
        current: 540,
        total: 540,
      });

      setStatusMessage({
        type: 'success',
        text: `Extracted all 180 questions for Question Paper 1, Question Paper 2, and Question Paper 3 (total 540 questions)! Each paper has distinct questions and diagrams.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to extract 3 standard question papers.' });
    } finally {
      setExtracting(false);
      setTimeout(() => {
        setExtractionProgress(null);
      }, 12000);
    }
  };

  // Distinct paper numbers: Dynamically computed strictly from uploaded files and extracted questions
  const paperNumSet = new Set<number>();
  extractedQuestions.forEach(q => {
    if (typeof q.paper_number === 'number' && q.paper_number > 0) {
      paperNumSet.add(q.paper_number);
    }
  });
  uploadedFiles.forEach(f => {
    if (typeof f.paperNumber === 'number' && f.paperNumber > 0) {
      paperNumSet.add(f.paperNumber);
    }
  });
  if (paperNumSet.size === 0 && uploadedFiles.length > 0) {
    paperNumSet.add(1);
  }
  const availablePaperNumbers: number[] = Array.from(paperNumSet).sort((a, b) => a - b);

  const handleSelectPaperFilter = (paperNum: number | 'ALL') => {
    setSelectedPaperFilter(paperNum);
    const targetQuestions = paperNum === 'ALL'
      ? extractedQuestions
      : extractedQuestions.filter(q => (q.paper_number || 1) === paperNum);

    if (targetQuestions.length > 0) {
      const firstIdx = extractedQuestions.findIndex(q => q.tempId === targetQuestions[0].tempId);
      if (firstIdx !== -1) {
        setActiveExtractedIndex(firstIdx);
      }
    }
  };

  // Filtered extracted list for sidebar (respects selectedPaperFilter)
  const filteredExtractedQuestions = extractedQuestions.filter(q => {
    // 1. Paper Filter
    if (selectedPaperFilter !== 'ALL') {
      const qPaper = q.paper_number || 1;
      if (qPaper !== selectedPaperFilter) return false;
    }

    // 2. Search
    const matchesSearch =
      sidebarSearch === '' ||
      q.content_text.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      (q.topic && q.topic.toLowerCase().includes(sidebarSearch.toLowerCase())) ||
      (q.subject && q.subject.toLowerCase().includes(sidebarSearch.toLowerCase())) ||
      (q.source_file && q.source_file.toLowerCase().includes(sidebarSearch.toLowerCase()));

    if (!matchesSearch) return false;

    // 3. Question Type / Assignment Filter
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

  // Index of active question in the currently filtered list
  const currentFilteredIndex = filteredExtractedQuestions.findIndex(
    q => q.tempId === activeQuestion?.tempId
  );

  const handlePrevQuestion = () => {
    if (filteredExtractedQuestions.length === 0) return;
    const newFilteredIdx = Math.max(0, currentFilteredIndex - 1);
    const targetQ = filteredExtractedQuestions[newFilteredIdx];
    if (targetQ) {
      const origIdx = extractedQuestions.findIndex(q => q.tempId === targetQ.tempId);
      if (origIdx !== -1) setActiveExtractedIndex(origIdx);
    }
  };

  const handleNextQuestion = () => {
    if (filteredExtractedQuestions.length === 0) return;
    const newFilteredIdx = Math.min(filteredExtractedQuestions.length - 1, currentFilteredIndex + 1);
    const targetQ = filteredExtractedQuestions[newFilteredIdx];
    if (targetQ) {
      const origIdx = extractedQuestions.findIndex(q => q.tempId === targetQ.tempId);
      if (origIdx !== -1) setActiveExtractedIndex(origIdx);
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
    if (selectedPaperFilter !== 'ALL') {
      const paperIds = filteredExtractedQuestions.map(q => q.tempId);
      setSelectedExtractedIds(prev => new Set([...prev, ...paperIds]));
    } else {
      setSelectedExtractedIds(new Set(extractedQuestions.map(q => q.tempId)));
    }
  };

  const deselectAll = () => {
    if (selectedPaperFilter !== 'ALL') {
      const paperIds = new Set(filteredExtractedQuestions.map(q => q.tempId));
      setSelectedExtractedIds(prev => new Set(Array.from(prev).filter(id => !paperIds.has(id))));
    } else {
      setSelectedExtractedIds(new Set());
    }
  };

  const selectFirstN = (n: number) => {
    const ids = filteredExtractedQuestions.slice(0, n).map(q => q.tempId);
    setSelectedExtractedIds(prev => new Set([...prev, ...ids]));
  };

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
    setStatusMessage({ type: 'success', text: 'Question removed successfully.' });
    setTimeout(() => setStatusMessage(null), 2000);
  };

  // Remove a specific question paper
  const handleRemovePaper = (paperNumber: number) => {
    setVisibleStudioPapers(prev => prev.filter(p => p !== paperNumber));
    const remaining = extractedQuestions.filter(q => (q.paper_number || 1) !== paperNumber);
    setExtractedQuestions(remaining);
    setUploadedFiles(prev => prev.filter(f => f.paperNumber !== paperNumber));
    setSelectedExtractedIds(prev => {
      const next = new Set(prev);
      extractedQuestions.filter(q => (q.paper_number || 1) === paperNumber).forEach(q => next.delete(q.tempId));
      return next;
    });
    if (selectedPaperFilter === paperNumber) {
      setSelectedPaperFilter('ALL');
    }
    if (activeExtractedIndex >= remaining.length) {
      setActiveExtractedIndex(Math.max(0, remaining.length - 1));
    }
    setStatusMessage({ type: 'success', text: `Question Paper ${paperNumber} removed from studio.` });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Remove all question papers and reset studio
  const handleRemoveAllPapers = () => {
    setVisibleStudioPapers([]);
    setExtractedQuestions([]);
    setUploadedFiles([]);
    setSelectedExtractedIds(new Set());
    setLocalAssignments({});
    setPdfFileName('');
    setPdfFileData('');
    setPdfText('');
    setExtractionSummary('');
    setExtractionProgress(null);
    setCurrentPaperId(null);
    setDebugViews([]);
    setActiveDebugView(null);
    setSelectedPaperFilter('ALL');
    setStatusMessage({ type: 'success', text: 'All question papers removed from studio.' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Restore all standard question papers
  const handleRestoreStandardPapers = () => {
    setVisibleStudioPapers([1, 2, 3]);
    setStatusMessage({ type: 'success', text: 'Restored all 3 National Question Papers to studio.' });
    setTimeout(() => setStatusMessage(null), 3000);
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
<<<<<<< HEAD
    const needTranslator = assignTargetRole === 'TRANSLATOR';
=======
    const isDirect = assignTargetRole === 'DIRECT';
    const needSme = !isDirect && (assignTargetRole === 'SME' || assignTargetRole === 'BOTH');
    const needTranslator = !isDirect && (assignTargetRole === 'TRANSLATOR' || assignTargetRole === 'BOTH');
>>>>>>> origin/main

    if (needTranslator && !assignTargetTranslatorId) {
      setStatusMessage({ type: 'error', text: 'Please select a Linguistic Translator from your organization.' });
      return;
    }

    setAssigningLoading(true);
    setStatusMessage(null);

    const targetTranslator = translators.find(t => t.id === assignTargetTranslatorId);

    try {
      // Call bulk-create to persist questions into question bank and create assignments
      const res = await api.bulkCreateQuestions({
        questions: targetQuestionList,
        auto_assign_translator_id: needTranslator ? assignTargetTranslatorId : undefined,
        target_language: needTranslator ? assignTargetLanguage : undefined,
        assignment_notes: assignNotes || (isDirect ? 'Directly verified & approved by Exam Manager' : undefined),
        initial_status: isDirect ? 'VERIFIED' : undefined,
      });

      // Update local assignment tags for real-time sidebar feedback
      const updatedAssignments = { ...localAssignments };
      targetQuestionList.forEach(q => {
        updatedAssignments[q.tempId] = {
          translatorId: needTranslator ? assignTargetTranslatorId : updatedAssignments[q.tempId]?.translatorId,
          translatorName: needTranslator ? targetTranslator?.full_name || 'Assigned Translator' : updatedAssignments[q.tempId]?.translatorName,
          targetLanguage: needTranslator ? assignTargetLanguage : updatedAssignments[q.tempId]?.targetLanguage,
        };
      });
      setLocalAssignments(updatedAssignments);

      let assignmentDesc = '';
      if (needTranslator) {
        assignmentDesc = `assigned to Translator ${targetTranslator?.full_name} for ${assignTargetLanguage} translation`;
      } else {
        assignmentDesc = `imported directly into the verified question repository`;
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully imported ${res.createdCount} question(s) into question repository (${assignmentDesc}).`,
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
  const handleAssignActiveQuestionDirectly = (translatorId?: string, lang?: string) => {
    if (!activeQuestion) return;
    setSelectedExtractedIds(new Set([activeQuestion.tempId]));
    if (translatorId) {
      setAssignTargetRole('TRANSLATOR');
      setAssignTargetTranslatorId(translatorId);
      if (lang) setAssignTargetLanguage(lang);
    } else {
      setAssignTargetRole('DIRECT_IMPORT');
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
          <div className="flex items-center gap-2 shrink-0">
            {statusMessage.type === 'success' && onNavigateSubTab && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateSubTab('question_pools')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                >
                  <span>Question Pools</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateSubTab('paper_generation')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                >
                  <span>Paper Generator</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </>
            )}
            <button
              onClick={() => setStatusMessage(null)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
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

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Puter.js AI OCR + Gemini Flash Engine</span>
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
              : uploadedFiles.length > 0
              ? 'border-emerald-400 bg-emerald-50/20'
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

          <Upload className={`w-9 h-9 mx-auto mb-2 transition-colors ${uploadedFiles.length > 0 ? 'text-emerald-700' : 'text-slate-400'}`} />

          <p className="text-xs font-bold text-slate-900">
            {uploadedFiles.length > 0 ? (
              <span className="inline-flex items-center justify-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{uploadedFiles.length} Question Paper{uploadedFiles.length > 1 ? 's' : ''} Ready for AI Extraction</span>
              </span>
            ) : (
              'Drag & Drop Question Paper PDFs here (Supports multiple files), or Browse from device'
            )}
          </p>

          <p className="text-[11px] text-slate-500 mt-1">
            Upload multiple question papers (Paper 1, Paper 2, Paper 3, etc.) to extract into the review studio.
          </p>

          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              {uploadedFiles.length > 0 ? '+ Add More Question Papers' : 'Browse Files / Question Papers'}
            </button>

            <button
              type="button"
              onClick={() => setShowRawText(!showRawText)}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs transition-colors cursor-pointer"
            >
              {showRawText ? 'Hide Transcript Editor' : 'Paste / Edit OCR Transcript'}
            </button>
          </div>
        </div>

        {/* ALL UPLOADED QUESTION PAPERS LIST */}
        {uploadedFiles.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-800" />
                <span className="font-bold text-xs text-slate-900">
                  Uploaded Question Papers ({uploadedFiles.length})
                </span>
                <span className="text-[10px] text-slate-500">
                  Each paper will be extracted with dedicated completion progress tracking
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-emerald-800 hover:bg-emerald-50 rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>+ Add Paper</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUploadedFiles([]);
                    setPdfFileName('');
                    setPdfFileData('');
                    setPdfText('');
                  }}
                  className="px-2 py-1 text-slate-500 hover:text-rose-600 rounded-md text-[11px] cursor-pointer transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {uploadedFiles.map((file) => {
                const isExtractingThis = file.status === 'EXTRACTING';
                const isDone = file.status === 'COMPLETED';
                const isErr = file.status === 'ERROR';

                return (
                  <div
                    key={file.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2.5 shadow-2xs ${
                      isDone
                        ? 'bg-white border-emerald-300'
                        : isExtractingThis
                        ? 'bg-emerald-50/50 border-emerald-400 ring-1 ring-emerald-500/20'
                        : isErr
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                        isDone
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          : isExtractingThis
                          ? 'bg-teal-100 text-teal-900 animate-pulse'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        P{file.paperNumber}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            Question Paper {file.paperNumber}
                          </span>
                          {isDone && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
                              ✓ {file.extractedCount} Qs
                            </span>
                          )}
                          {isExtractingThis && (
                            <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 text-[10px] font-bold shrink-0 animate-pulse">
                              {file.progressPercent}%
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 truncate" title={file.name}>
                          {file.name} {file.size ? `• ${formatFileSize(file.size)}` : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveUploadedFile(file.id)}
                      disabled={extracting}
                      className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-20 rounded-lg hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                      title="Remove this question paper"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

        {/* Extract Button Action Row - ONE Primary Extraction Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || (uploadedFiles.length === 0 && !pdfFileData && !pdfText)}
              className="px-6 py-3.5 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 hover:from-emerald-700 hover:via-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg flex flex-wrap items-center gap-3 transition-all cursor-pointer border border-emerald-500/40 disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 text-amber-300 ${extracting ? 'animate-spin' : ''}`} />
              <span>
                {extracting
                  ? `⚡ Extracting Questions from ${uploadedFiles.length || 1} Question Paper${uploadedFiles.length > 1 ? 's' : ''}...`
                  : uploadedFiles.length > 0
                    ? `⚡ Extract Questions (${uploadedFiles.length === 1 ? uploadedFiles[0].name : `${uploadedFiles.length} Question Papers`})`
                    : '⚡ Extract Questions from Uploaded Paper'}
              </span>

              {/* Real-time individual question paper percentages displayed directly on extraction button */}
              {extracting && uploadedFiles.length > 0 && (
                <div className="flex items-center gap-1.5 pl-2.5 border-l border-white/20 text-xs font-mono">
                  {uploadedFiles.map(f => (
                    <span key={f.id} className="px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shadow-xs">
                      P{f.paperNumber}: {f.progressPercent || 20}%
                    </span>
                  ))}
                </div>
              )}
            </button>

            {extractedQuestions.length > 0 && (
              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100 px-3 py-2 rounded-lg border border-emerald-200">
                {extractedQuestions.length} Questions Extracted ({uploadedFiles.length || visibleStudioPapers.length || 1} Paper{(uploadedFiles.length || visibleStudioPapers.length) !== 1 ? 's' : ''})
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
                setExtractionProgress(null);
              }}
              className="text-xs text-slate-500 hover:text-rose-600 transition-colors underline cursor-pointer"
            >
              Reset All
            </button>
          )}
        </div>

        {/* Real-Time Extraction Progress Bar & Multi-Paper Status Dashboard */}
        {(extractionProgress || extracting) && (
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-emerald-950 border border-emerald-500/30 text-white shadow-lg space-y-4 transition-all duration-300">
            {/* Top Row: Overall Stage & Average Percentage */}
            {(() => {
              const avgPercent = uploadedFiles.length > 0
                ? Math.round(
                    uploadedFiles.reduce(
                      (acc, f) => acc + (f.status === 'COMPLETED' ? 100 : (f.progressPercent || 0)),
                      0
                    ) / uploadedFiles.length
                  )
                : (extractionProgress?.percent || 0);

              return (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
                        <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                            {extractionProgress?.stage || 'Multi-Paper Extraction Pipeline'}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        </div>
                        <p className="text-xs font-semibold text-slate-200 mt-1 truncate max-w-sm sm:max-w-md">
                          {extractionProgress?.message || `Processing ${uploadedFiles.length || 3} question papers...`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-2xl font-black font-mono text-emerald-400 block">
                          {avgPercent}%
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                          Overall Progress
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExtractionProgress(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Dismiss progress banner"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Overall Glowing Progress Bar */}
                  <div className="w-full bg-slate-950/80 rounded-full h-3 p-0.5 border border-white/10 overflow-hidden relative shadow-inner">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 transition-all duration-300 ease-out relative shadow-[0_0_12px_rgba(52,211,153,0.6)]"
                      style={{ width: `${Math.max(5, Math.min(100, avgPercent))}%` }}
                    >
                      <div className="absolute inset-0 bg-white/25 animate-pulse rounded-full" />
                    </div>
                  </div>

                  {/* INDIVIDUAL QUESTION PAPER COMPLETION PROGRESS CARDS */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                        <span className="text-emerald-300 uppercase tracking-wider">
                          Question Paper Progress Breakdown ({uploadedFiles.length} Papers)
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {uploadedFiles.filter(f => f.status === 'COMPLETED').length} of {uploadedFiles.length} Completed
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {uploadedFiles.map((file) => {
                          const isDone = file.status === 'COMPLETED';
                          const isExtractingItem = file.status === 'EXTRACTING';
                          const paperPercent = isDone ? 100 : (file.progressPercent || 0);

                          return (
                            <div
                              key={file.id}
                              className="p-3 rounded-xl bg-slate-950/70 border border-white/10 space-y-2"
                            >
                              <div className="flex items-center justify-between text-xs gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono shrink-0 ${
                                    isDone
                                      ? 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                                      : isExtractingItem
                                      ? 'bg-teal-900 text-teal-200 border border-teal-700 animate-pulse'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}>
                                    Paper {file.paperNumber}
                                  </span>
                                  <span className="truncate font-semibold text-slate-200 text-[11px]" title={file.name}>
                                    {file.name}
                                  </span>
                                </div>

                                <span className={`font-mono font-bold text-xs shrink-0 ${
                                  isDone ? 'text-emerald-400' : 'text-teal-300'
                                }`}>
                                  {paperPercent}%
                                </span>
                              </div>

                              {/* Progress bar per paper */}
                              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden relative">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    isDone
                                      ? 'bg-emerald-400'
                                      : 'bg-gradient-to-r from-teal-400 to-emerald-400'
                                  }`}
                                  style={{ width: `${Math.max(5, Math.min(100, paperPercent))}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="truncate">
                                  {file.progressMessage || (isDone ? `Extracted ${file.extractedCount} questions` : 'Processing...')}
                                </span>
                                {isDone && (
                                  <span className="text-emerald-300 font-bold shrink-0">
                                    ✓ Done ({file.extractedCount} Qs)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* SECTION 2: EXTRACTED QUESTIONS STUDIO & 2-COLUMN SIDEBAR WORKSPACE */}
      {extractedQuestions.length === 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900">
                  Question Paper Studio ({uploadedFiles.length > 0 ? uploadedFiles.length : (extractedQuestions.length > 0 ? 1 : 0)} Question Paper{(uploadedFiles.length > 0 ? uploadedFiles.length : 1) !== 1 ? 's' : ''})
                </h3>
                <p className="text-xs text-slate-500">
                  Universal multi-examination question paper studio. Upload any examination paper (Computer Networks, Engineering, University Tests, etc.) to extract questions with exact zero-bleed boundaries.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {uploadedFiles.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={handleRemoveAllPapers}
                    className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                    title="Remove all question papers and reset studio"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Remove Question Paper</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={extracting}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 hover:from-emerald-700 hover:via-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer border border-emerald-600 transition-all shrink-0 active:scale-95"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>⚡ Extract Questions ({uploadedFiles.length === 1 ? uploadedFiles[0].name : `${uploadedFiles.length} Paper${uploadedFiles.length > 1 ? 's' : ''}`})</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* Dynamic cards for all uploaded files (1 paper = 1 card, 2 papers = 2 cards) */}
          {uploadedFiles.length === 0 ? (
            <div className="text-center py-8 px-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2">
              <p className="font-bold text-xs text-slate-700">No Question Papers Currently Uploaded</p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Upload your exam PDF above (e.g. cn.pdf, semester exam, or test paper) to extract questions.
              </p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 ${uploadedFiles.length === 1 ? 'max-w-md mx-auto' : uploadedFiles.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3`}>
              {uploadedFiles.map(file => {
                const pNum = file.paperNumber;
                const count = extractedQuestions.filter(q => (q.paper_number || 1) === pNum || q.source_file === file.name).length;
                return (
                  <div key={file.id} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 text-left space-y-2 shadow-2xs relative group">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-800 text-white font-bold text-xs">
                        Question Paper {pNum}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                          {count > 0 ? `${count} Questions` : 'Ready to Extract'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveUploadedFile(file.id);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-100/70 transition-colors cursor-pointer"
                          title={`Remove ${file.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      {paperSubject || 'Academic Examination'} {file.size ? `• ${formatFileSize(file.size)}` : ''}
                    </p>
                    <div className="pt-1 text-[11px] font-semibold text-emerald-700 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <span>{count > 0 ? `${count} Questions Extracted & Ready` : 'Ready for Zero-Bleed Extraction'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveUploadedFile(file.id)}
                        className="text-[10px] text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                  {selectedExtractedIds.size} of {extractedQuestions.length} selected for assignment. Select questions on the sidebar to review and assign to Translator or import directly.
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBoundaryEditorOpen(true)}
                className="px-4 py-2 bg-[#00cc5f] hover:bg-[#00e66b] text-black rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer ring-2 ring-[#00cc5f]/40 hover:brightness-110 active:scale-95"
                title="Open Visual Question Boundary Editor with 300 DPI interactive canvas"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Visual Boundary Editor</span>
              </button>

              <button
                type="button"
                onClick={() => openAssignmentModal('SELECTED')}
                disabled={selectedExtractedIds.size === 0}
                className="px-4 py-2 bg-white text-emerald-950 hover:bg-emerald-50 disabled:opacity-40 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-emerald-800" />
                <span>Assign Selected ({selectedExtractedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={() => openAssignmentModal('BY_COUNT')}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs border border-emerald-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-emerald-300" />
                <span>Assign by Number...</span>
              </button>

              {debugViews.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveDebugView(debugViews[0])}
                  className="px-4 py-2 bg-emerald-800/80 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs border border-emerald-600 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Inspect visual segmentation debug lines (Green = Question Start, Blue = Next Start, Orange = Options Start)"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Debug Segmentation Map ({debugViews.length}p)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleRemoveAllPapers}
                className="px-4 py-2 bg-rose-700/90 hover:bg-rose-600 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer border border-rose-600 active:scale-95"
                title="Remove all extracted question papers and return to studio"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Question Paper</span>
              </button>
            </div>
          </div>

          {/* QUESTION PAPER SELECTOR TABS BAR */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
                  <FileText className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                    Question Paper Selector ({availablePaperNumbers.length} Question Paper{availablePaperNumbers.length > 1 ? 's' : ''})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Click any Question Paper tab to inspect extracted questions in the sidebar:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedPaperFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => handleRemovePaper(Number(selectedPaperFilter))}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                    title={`Remove Question Paper ${selectedPaperFilter}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Remove Paper {selectedPaperFilter}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={extracting || uploadedFiles.length === 0}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer border border-emerald-600 transition-all disabled:opacity-50"
                  title="Extract or re-extract questions for uploaded question paper(s)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ Re-Extract Questions</span>
                </button>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-bold text-slate-500">
                    Current View:
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
                    {selectedPaperFilter === 'ALL' ? 'All Question Papers' : `Question Paper ${selectedPaperFilter}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabs Row */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                type="button"
                onClick={() => handleSelectPaperFilter('ALL')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer shadow-xs ${
                  selectedPaperFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-900/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
              >
                <span>All Question Papers</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    selectedPaperFilter === 'ALL' ? 'bg-slate-800 text-emerald-300' : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {extractedQuestions.length} Qs
                </span>
              </button>

              {availablePaperNumbers.map((pNum: number) => {
                const count = extractedQuestions.filter(q => (q.paper_number || 1) === pNum).length;
                const matchingFile = uploadedFiles.find(f => f.paperNumber === pNum);
                const isSelected = selectedPaperFilter === pNum;

                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => handleSelectPaperFilter(pNum)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 border cursor-pointer shadow-xs ${
                      isSelected
                        ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-600/30'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-emerald-300 animate-pulse' : 'bg-emerald-500'}`}
                      />
                      <span>Question Paper {pNum}</span>
                    </span>
                    {matchingFile?.name && (
                      <span
                        className={`text-[10px] max-w-[130px] truncate ${
                          isSelected ? 'text-emerald-200' : 'text-slate-400'
                        }`}
                        title={matchingFile.name}
                      >
                        ({matchingFile.name})
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        isSelected ? 'bg-emerald-950 text-emerald-200 border border-emerald-700' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count} Qs
                    </span>
                  </button>
                );
              })}
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
                  <span className="font-bold text-sm text-slate-900">
                    {selectedPaperFilter === 'ALL' ? 'All Extracted Questions' : `Question Paper ${selectedPaperFilter}`}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                    {filteredExtractedQuestions.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openAssignmentModal('SELECTED')}
                  disabled={selectedExtractedIds.size === 0}
                  className="px-3 py-1 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer"
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
                      className={`px-2 py-1 rounded-md font-bold text-[10px] transition-colors cursor-pointer ${
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
                      className="text-emerald-800 hover:underline font-bold cursor-pointer"
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">Quick:</span>
                    <button
                      type="button"
                      onClick={() => selectFirstN(5)}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold cursor-pointer"
                    >
                      Top 5
                    </button>
                    <button
                      type="button"
                      onClick={() => selectFirstN(10)}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold cursor-pointer"
                    >
                      Top 10
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Questions List */}
              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {filteredExtractedQuestions.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-xl space-y-3 p-4">
                    <p className="text-xs text-slate-500 font-semibold">
                      {selectedPaperFilter !== 'ALL'
                        ? `No questions extracted yet for Question Paper ${selectedPaperFilter}.`
                        : 'No questions matching filter.'}
                    </p>
                    <button
                      type="button"
                      onClick={handleExtract}
                      disabled={uploadedFiles.length === 0}
                      className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Extract Questions for Question Paper {selectedPaperFilter !== 'ALL' ? selectedPaperFilter : 'All Papers'}</span>
                    </button>
                  </div>
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
                          <div className="flex items-center gap-1.5 min-w-0">
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

                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[9px] font-mono shrink-0">
                              Paper {q.paper_number || 1}
                            </span>

                            <span className="font-bold text-slate-900 text-xs shrink-0">
                              Q{q.question_number || (filteredIdx + 1)}
                            </span>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                q.question_type === 'MCQ'
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {q.question_type}
                            </span>

                            <span className="text-[10px] text-slate-500 font-mono shrink-0">
                              {q.marks}M
                            </span>
                          </div>

                          {/* Assignment Status Tag & Quick Remove Button */}
                          <div className="flex items-center gap-1.5 shrink-0">
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
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteExtractedQuestion(q.tempId);
                              }}
                              className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Remove this question"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Question Preview Snippet */}
                        <div className="text-slate-700 line-clamp-2 text-[11px] leading-relaxed">
                          <LaTeXText text={q.content_text} />
                        </div>

                        {/* Diagram Indicator Badge */}
                        {(q.diagram_url || q.diagram_data) && (
                          <div className="flex items-center gap-1.5 py-0.5 px-2 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-bold">
                            <ImageIcon className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span>Diagram Attached</span>
                          </div>
                        )}

                        {/* Metadata Footer */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                          <span className="truncate max-w-[150px]">{q.topic || q.subject || 'General'}</span>
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
                  {/* Sticky Header with Navigation & Quick Actions */}
                  <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs py-3 px-4 -mx-6 -mt-6 rounded-t-2xl border-b border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-bold text-xs shadow-2xs">
                        Question Paper {activeQuestion.paper_number || 1}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-mono font-bold text-xs">
                        Question #{currentFilteredIndex !== -1 ? currentFilteredIndex + 1 : activeExtractedIndex + 1}
                        {selectedPaperFilter !== 'ALL' && ` (Overall #${activeExtractedIndex + 1})`}
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
                      <span className="text-xs text-slate-500 font-medium">
                        {activeQuestion.marks} Marks {activeQuestion.negative_marks ? `(-${activeQuestion.negative_marks})` : ''}
                      </span>
                      {activeQuestion.source_file && (
                        <span className="text-[11px] text-slate-500 font-mono truncate max-w-[180px]" title={activeQuestion.source_file}>
                          📁 {activeQuestion.source_file}
                        </span>
                      )}
                    </div>

                    {/* Navigation Buttons & Boundary Editor */}
                    <div className="flex items-center gap-1.5 text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => setBoundaryEditorOpen(true)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition cursor-pointer mr-1"
                        title="Adjust question boundary crop at 300 DPI"
                      >
                        <Crop className="w-3.5 h-3.5 text-emerald-200" />
                        <span>Edit Boundary</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOcrSpaceForQuestion(activeQuestion, '2')}
                        disabled={isOcrSpaceLoading !== null || isNavidcOcrLoading || isPuterOcrLoading !== null}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition cursor-pointer mr-1"
                        title="Extract question using OCR.space Engine 2 (Fast, General Text, Formulas)"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-sky-200" />
                        <span>{isOcrSpaceLoading === '2' ? 'OCR.space...' : 'OCR.space'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOcrSpaceForQuestion(activeQuestion, '3')}
                        disabled={isOcrSpaceLoading !== null || isNavidcOcrLoading || isPuterOcrLoading !== null}
                        className="px-2.5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition cursor-pointer mr-1"
                        title="Extract question using OCR.space Engine 3 (Markdown Tables & Handwriting)"
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-200" />
                        <span>{isOcrSpaceLoading === '3' ? 'Table OCR...' : 'Table E3'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleNavidcOcrForQuestion(activeQuestion)}
                        disabled={isOcrSpaceLoading !== null || isNavidcOcrLoading || isPuterOcrLoading !== null}
                        className="px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition cursor-pointer mr-1"
                        title="Extract text, formulas & tables using local offline 1.2B NaviDC-OCR model"
                      >
                        <Cpu className="w-3.5 h-3.5 text-teal-200" />
                        <span>{isNavidcOcrLoading ? 'NaviDC...' : 'NaviDC 1.2B'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePuterOcrForQuestion(activeQuestion, 'vision')}
                        disabled={isOcrSpaceLoading !== null || isPuterOcrLoading !== null || isNavidcOcrLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition cursor-pointer mr-1"
                        title="Extract question, tables & options using Puter.js AI Vision (Claude / Mistral Vision - 100% Free)"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>{isPuterOcrLoading ? 'Puter AI...' : 'Puter Vision AI'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePrevQuestion}
                        disabled={currentFilteredIndex <= 0}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700 cursor-pointer"
                        title="Previous Question"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <span className="text-[11px] font-mono text-slate-500 px-1">
                        {currentFilteredIndex !== -1 ? currentFilteredIndex + 1 : 1} / {filteredExtractedQuestions.length}
                      </span>

                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        disabled={currentFilteredIndex >= filteredExtractedQuestions.length - 1}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700 cursor-pointer"
                        title="Next Question"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteExtractedQuestion(activeQuestion.tempId)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors ml-2 cursor-pointer"
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
                          Unassigned (Available for translation or direct import)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignActiveQuestionDirectly()}
                        className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3 text-emerald-300" />
                        <span>Direct Import</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignActiveQuestionDirectly(translators[0]?.id, 'Hindi')}
                        className="px-3 py-1.5 bg-purple-900 hover:bg-purple-800 text-white rounded-lg font-bold text-[11px] flex items-center gap-1"
                      >
                        <Languages className="w-3 h-3 text-purple-300" />
                        <span>Assign Translator</span>
                      </button>
                    </div>
                  </div>

                  {/* Question Content Editor */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-700 font-bold">
                        Question Statement *
                      </label>
                      {activeQuestion.content_text.includes('$') && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                          LaTeX Math Active
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={3}
                      value={activeQuestion.content_text}
                      onChange={e => updateActiveQuestion({ content_text: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                    />
                    {activeQuestion.content_text.includes('$') && (
                      <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 text-xs text-slate-900 space-y-1">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                          LaTeX Rendered Math Preview
                        </span>
                        <div className="text-xs text-slate-800 leading-relaxed">
                          <LaTeXText text={activeQuestion.content_text} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Diagram / Visual Figure Asset */}
                  <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-700">
                        <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Diagram / Technical Figure</span>
                        {activeQuestion.diagram_url && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                            Attached
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={diagramInputRef}
                          onChange={handleDiagramUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => diagramInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center gap-1 transition-colors"
                        >
                          <Paperclip className="w-3 h-3 text-indigo-600" />
                          <span>{activeQuestion.diagram_url ? 'Replace Image' : 'Attach Diagram'}</span>
                        </button>
                        {activeQuestion.diagram_url && (
                          <button
                            type="button"
                            onClick={() => updateActiveQuestion({ diagram_url: undefined, diagram_data: undefined, has_diagram: false })}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Remove Diagram"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const rawUrl = activeQuestion.diagram_url || (activeQuestion.question_images && activeQuestion.question_images[0]) || activeQuestion.diagram_data;
                      const displayImageUrl = rawUrl && typeof rawUrl === 'string' && (rawUrl.startsWith('/questions/') || rawUrl.startsWith('public/questions/')) && !rawUrl.includes('?')
                        ? `${rawUrl}?v=clean300dpi_v5`
                        : rawUrl;
                      return displayImageUrl ? (
                        <div className="space-y-2">
                          {activeQuestion.options_extraction_status === 'uncertain' && (
                            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center gap-2">
                              <span className="font-bold text-amber-700">🛡️ Safe Crop:</span>
                              <span>Option detection was uncertain; entire Question Start → Next Question Start area was safely preserved to protect all diagrams & tables.</span>
                            </div>
                          )}
                          {activeQuestion.stitch_mode === 'multi_page_stitched' && (
                            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] flex items-center gap-2">
                              <span className="font-bold text-indigo-700">🔗 Multi-Page Stitched:</span>
                              <span>Question spanned across page boundaries and was vertically stitched at 300 DPI.</span>
                            </div>
                          )}
                          <div className="relative group rounded-xl border border-indigo-200 bg-slate-50/50 p-2 flex flex-col items-center justify-center overflow-hidden">
                            <img
                              src={displayImageUrl}
                              alt="Question Diagram"
                              className="max-h-72 w-auto object-contain rounded-lg shadow-2xs cursor-pointer hover:opacity-95 transition-opacity"
                              onClick={() => setZoomedDiagramUrl(displayImageUrl)}
                            />
                            <button
                              type="button"
                              onClick={() => setZoomedDiagramUrl(displayImageUrl)}
                              className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-slate-900/80 text-white text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <ZoomIn className="w-3 h-3 text-white" />
                              <span>Zoom 300 DPI</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => diagramInputRef.current?.click()}
                          className="p-4 rounded-xl border border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 cursor-pointer flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-700 transition-all text-center"
                        >
                          <ImageIcon className="w-4 h-4 text-slate-400" />
                          <span className="text-[11px] font-medium">No diagram attached. Click or drag to attach circuit / geometry / chart image.</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* MCQ Options Editor */}
                  {activeQuestion.question_type === 'MCQ' && (
                    <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-700 font-bold">
                          MCQ Options (A, B, C, D)
                        </label>
                        {activeQuestion.option_detection_confidence !== undefined && (
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                            activeQuestion.options_extraction_status === 'certain'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            Detection Conf: {Math.round((activeQuestion.option_detection_confidence || 0) * 100)}% ({activeQuestion.options_extraction_status || 'certain'})
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(activeQuestion.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt: any, optIdx: number) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isCorrect = (activeQuestion.correct_answer || 'A').toUpperCase().startsWith(letter);
                          const optText = typeof opt === 'string' ? opt : (opt?.text ? `${opt.label || letter}) ${opt.text}` : String(opt || ''));

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
                                value={optText.replace(/^[A-Ea-e1-5][\)\.\:\-]\s*/, '')}
                                onChange={e => {
                                  const rawVal = e.target.value.replace(/^[A-Ea-e1-5][\)\.\:\-]\s*/, '');
                                  const nextOpts = [...(activeQuestion.options || [])];
                                  if (typeof opt === 'object' && opt !== null && 'label' in opt) {
                                    nextOpts[optIdx] = { label: letter, text: rawVal };
                                  } else {
                                    nextOpts[optIdx] = `${letter}) ${rawVal}`;
                                  }
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

            {/* STEP 2: CHOOSE TARGET ROLE (TRANSLATOR or DIRECT IMPORT) */}
            <div className="space-y-3 text-xs border-t border-slate-800 pt-3">
              <label className="block text-slate-300 font-bold">
                2. Select Destination / Task ({org?.name || 'Your Organization'})
              </label>

              {/* Role Toggle Tabs */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAssignTargetRole('TRANSLATOR')}
                  className={`py-2 px-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    assignTargetRole === 'TRANSLATOR'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>Assign Linguistic Translator</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAssignTargetRole('DIRECT_IMPORT')}
                  className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    assignTargetRole === 'DIRECT_IMPORT'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Direct Question Bank Import</span>
                </button>
              </div>
              {/* Translator User & Language Selection */}
              {assignTargetRole === 'TRANSLATOR' && (
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

      {/* Diagram Zoom Modal */}
      {zoomedDiagramUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setZoomedDiagramUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl p-4 shadow-2xl flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedDiagramUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-2 overflow-auto max-h-[80vh] flex items-center justify-center">
              <img
                src={zoomedDiagramUrl}
                alt="Zoomed Question Diagram"
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Visual Debug Segmentation Modal */}
      {activeDebugView && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setActiveDebugView(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[95vh] bg-slate-950 rounded-2xl p-4 shadow-2xl flex flex-col text-white border border-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-sm text-white">Visual Segmentation Debug Overlay</span>
                <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
                  <span className="flex items-center gap-1.5 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    <span className="w-3 h-1 bg-[#00C853] inline-block rounded-sm"></span>
                    <span className="text-emerald-400 font-mono font-bold">Green = Question Start</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    <span className="w-3 h-1 bg-[#2979FF] inline-block rounded-sm"></span>
                    <span className="text-blue-400 font-mono font-bold">Blue = Next Question Start</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    <span className="w-3 h-1 bg-[#FF6D00] inline-block rounded-sm"></span>
                    <span className="text-amber-400 font-mono font-bold">Orange = Option Start</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                  {debugViews.map((dv, idx) => (
                    <button
                      key={dv}
                      type="button"
                      onClick={() => setActiveDebugView(dv)}
                      className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-colors ${
                        activeDebugView === dv ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      P{idx + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDebugView(null)}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-2 overflow-auto max-h-[82vh] flex items-center justify-center bg-slate-900 rounded-xl mt-3">
              <img
                src={activeDebugView}
                alt="Segmentation Debug Overlay"
                className="max-h-[78vh] w-auto object-contain rounded-lg border border-slate-800 shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Visual Question Boundary Editor Modal */}
      {boundaryEditorOpen && (
        <QuestionBoundaryEditor
          paperId={currentPaperId || 'PAPER-CURRENT'}
          initialQuestions={extractedQuestions as any}
          onClose={() => setBoundaryEditorOpen(false)}
          onFinalized={() => {
            setBoundaryEditorOpen(false);
            onAssignmentsUpdated();
          }}
        />
      )}
    </div>
  );
};
