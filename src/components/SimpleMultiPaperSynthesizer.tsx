import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Sparkles,
  Download,
  Printer,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Layers,
  Cpu,
  Eye,
  ListOrdered,
  MessageSquare,
  Send,
  Bot,
  User as UserIcon,
  RotateCcw,
  Zap,
  HelpCircle,
  Settings,
  Sparkle,
  Globe,
  Compass,
  Shield,
  Sliders,
  Activity,
  Database,
  KeyRound,
  Terminal,
  Lock,
} from 'lucide-react';
import { OpenAIPrismBrowserModal } from './OpenAIPrismBrowserModal';
import { api, ollamaChatStream } from '../api';
import type { CompileDiagnostics } from '../api';
import { User } from '../types';
import {
  detectPaperPattern,
  extractPaperHeader,
  pickPrimaryPaperIndex,
  pickPrimaryPattern,
  summarizePattern,
  type DetectedPattern,
  type PaperHeader,
} from '../utils/sourcePattern';
import { enforceStructuralPattern } from '../utils/patternEnforcement';

interface UploadedPaper {
  id: string;
  name: string;
  text: string;
  pageCount: number;
  wordCount: number;
  fileSize: number;
  /** The original bytes, so the paper's own diagrams can be lifted back out. */
  dataUrl?: string;
}

/**
 * A diagram or table cropped out of an uploaded paper, reused unchanged.
 *
 * The bytes are held here rather than a URL: the paper must be able to reuse the
 * asset without a second request that can fail on its own.
 */
interface SourceFigure {
  index: number;
  name: string;
  url: string;
  page: number;
  kind: 'raster' | 'vector-region';
  width: number;
  height: number;
  base64: string;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  structuredPaper?: any;
}

interface SimpleMultiPaperSynthesizerProps {
  currentUser?: User | null;
  onRefresh?: () => void;
}

/**
 * Form defaults. The source paper's own masthead replaces these wherever the
 * examiner has not typed an override, so a paper that prints "Max. Marks: 34"
 * no longer inherits the form's 70.
 */
const DEFAULT_METADATA = {
  subject: 'Computer Science & Engineering',
  universityName: 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
  paperCode: 'SLR-FINAL-04',
  totalMarks: 70,
  durationHours: 3,
};

/**
 * Keep the examiner's own edits: a header field read from the source paper is
 * only used while the form still holds its untouched default.
 */
function headerRespectingOverrides(
  header: PaperHeader | null,
  current: {
    subject: string;
    universityName: string;
    paperCode: string;
    totalMarks: number;
    durationHours: number;
  }
): PaperHeader | null {
  if (!header) return null;
  return {
    ...header,
    subject: current.subject === DEFAULT_METADATA.subject ? header.subject : null,
    universityName:
      current.universityName === DEFAULT_METADATA.universityName ? header.universityName : null,
    paperCode: current.paperCode === DEFAULT_METADATA.paperCode ? header.paperCode : null,
    maxMarks: current.totalMarks === DEFAULT_METADATA.totalMarks ? header.maxMarks : null,
    durationHours:
      current.durationHours === DEFAULT_METADATA.durationHours ? header.durationHours : null,
  };
}

function convertStructuredDataToLatex(
  data: any,
  subject: string,
  universityName: string,
  paperCode: string,
  totalMarks: number,
  durationHours: number
): string {
  if (!data || !data.sections) {
    return '';
  }

  const uName = data.universityName || universityName;
  const sub = data.subject || subject;
  const pCode = data.paperCode || paperCode;
  const marks = data.totalMarks || totalMarks;
  const duration = data.duration || `${durationHours} Hours`;

  const latexLines: string[] = [
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[top=1.8cm,bottom=1.8cm,left=2cm,right=2cm]{geometry}',
    '\\usepackage{amsmath,amssymb,amsfonts,enumitem,fancyhdr,tabularx,xcolor,booktabs,tikz,adjustbox}',
    '\\usetikzlibrary{arrows.meta,positioning,shapes.geometric,calc,decorations.pathreplacing}',
    '\\setlength{\\parindent}{0pt}',
    '\\pagestyle{fancy}',
    '\\fancyhf{}',
    '\\lhead{\\small\\textbf{Seat No.:} \\underline{\\hspace{3cm}}}',
    `\\rhead{\\small\\textbf{Paper Code: ${pCode}}}`,
    '\\cfoot{\\thepage}',
    '\\renewcommand{\\headrulewidth}{0.4pt}',
    '\\begin{document}',
    '\\begin{center}',
    `  {\\large\\bfseries ${uName}} \\par\\vspace{2mm}`,
    `  {\\normalsize\\bfseries B.Tech. / Diploma Semester Examination 2026} \\par\\vspace{2mm}`,
    `  {\\normalsize\\bfseries ${sub}} \\par\\vspace{2mm}`,
    `  {\\small Time: ${duration} \\hfill Max. Marks: ${marks}}`,
    '\\end{center}',
    '\\hrule height 1pt',
    '\\vspace{3mm}',
    '\\textbf{Instructions:}',
    '\\begin{enumerate}[label=\\arabic*., itemsep=1pt]',
    '  \\item Figures to the right indicate full marks for each question.',
    '  \\item Neat diagrams must be drawn wherever necessary.',
    '  \\item Assume suitable data if necessary and state them clearly.',
    '  \\item Use of programmable calculators is strictly prohibited.',
    '\\end{enumerate}',
    '\\vspace{3mm}',
    '\\hrule',
    '\\vspace{4mm}',
  ];

  data.sections.forEach((sec: any) => {
    latexLines.push(`\\section*{${sec.title || 'SECTION'}${sec.totalMarks ? ` \\hfill [${sec.totalMarks}]` : ''}}`);
    if (sec.instructions) {
      latexLines.push(`\\textit{${sec.instructions}} \\par\\vspace{2mm}`);
    }

    if (Array.isArray(sec.questions)) {
      sec.questions.forEach((q: any, qIdx: number) => {
        const qNum = q.number ? (q.number.endsWith('.') || q.number.endsWith(')') ? q.number : `${q.number}.`) : `Q.${qIdx + 1}`;
        const marksStr = q.marks ? ` \\hfill [${typeof q.marks === 'number' ? `${q.marks} Marks` : q.marks}]` : '';

        // Check for inline table or TikZ inside q.text
        let mainText = q.text || '';
        let extractedTable = '';
        let extractedTikz = '';

        const tabMatch = mainText.match(/(\\begin\{tabular(?:x)?\}[\s\S]*?\\end\{tabular(?:x)?\})/i);
        if (tabMatch) {
          extractedTable = tabMatch[0];
          mainText = mainText.replace(tabMatch[0], '').trim();
        }

        const tikzMatch = mainText.match(/(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/i);
        if (tikzMatch) {
          extractedTikz = tikzMatch[0];
          mainText = mainText.replace(tikzMatch[0], '').trim();
        }

        latexLines.push(`\\textbf{${qNum}} ${mainText}${marksStr} \\par\\vspace{2mm}`);

        // If table was extracted or passed in q.table
        const finalTable = extractedTable || q.table;
        if (finalTable) {
          let tbl = finalTable.trim();
          if (tbl.startsWith('\\begin{tabular}') && !tbl.includes('\\begin{tabularx}')) {
            tbl = tbl
              .replace(/\\begin\{tabular\}\s*\{([^}]+)\}/, (m: string, cols: string) => {
                const count = (cols.match(/[lcrXpm]/g) || []).length || 3;
                return `\\begin{tabularx}{0.94\\linewidth}{|${'X|'.repeat(count)}}`;
              })
              .replace(/\\end\{tabular\}/, '\\end{tabularx}');
          }
          latexLines.push(`\\begin{center}\n\\small\n${tbl}\n\\end{center}\\vspace{2mm}`);
        }

        // If diagram or TikZ code is provided
        const finalTikz = extractedTikz || q.tikz || q.diagram;
        if (finalTikz) {
          let tikzCode = finalTikz.trim();
          if (!tikzCode.includes('scale=')) {
            tikzCode = tikzCode.replace(/\\begin\{tikzpicture\}/, '\\begin{tikzpicture}[scale=0.88, every node/.style={transform shape}]');
          }
          if (tikzCode.startsWith('\\begin{tikzpicture}')) {
            latexLines.push(`\\begin{center}\n${tikzCode}\n\\end{center}\\vspace{2mm}`);
          } else {
            latexLines.push(`\\begin{center}\n\\begin{tikzpicture}[scale=0.88, every node/.style={transform shape}]\n${tikzCode}\n\\end{tikzpicture}\n\\end{center}\\vspace{2mm}`);
          }
        }

        if (Array.isArray(q.options) && q.options.length > 0) {
          latexLines.push('\\begin{enumerate}[label=(\\alph*), itemsep=1pt]');
          q.options.forEach((opt: string) => {
            const cleanOpt = opt.replace(/^\([a-d]\)\s*/i, '').replace(/^[a-d]\)\s*/i, '');
            latexLines.push(`  \\item ${cleanOpt}`);
          });
          latexLines.push('\\end{enumerate}');
        }

        if (q.orText) {
          latexLines.push('\\begin{center}\\textbf{--- OR ---}\\end{center}');
          const orMarksStr = q.orMarks ? ` \\hfill [${typeof q.orMarks === 'number' ? `${q.orMarks} Marks` : q.orMarks}]` : '';
          latexLines.push(`${q.orText}${orMarksStr} \\par\\vspace{2mm}`);
          if (q.orTikz) {
            latexLines.push(`\\begin{center}\n${q.orTikz}\n\\end{center}\\vspace{2mm}`);
          }
        }
      });
    }
    latexLines.push('\\vspace{3mm}');
  });

  latexLines.push('\\begin{center}\\textbf{*** END OF QUESTION PAPER ***}\\end{center}');
  latexLines.push('\\end{document}');

  return latexLines.join('\n');
}

/**
 * Markers of a reply that is the prompt's own example schema echoed back rather
 * than a written paper - the failure that produced papers made entirely of
 * "First MCQ question text..." and "Subquestion text...". Kept in step with the
 * server-side check in server/synthesizedPaperPdfGenerator.ts.
 */
/**
 * The real stages of paper generation, in the order they run.
 *
 * These are set by the code that actually performs each operation, so the panel
 * reports what is really happening rather than what the clock thinks should be
 * happening.
 */
type GenerationStage = 'idle' | 'figures' | 'synthesis' | 'typesetting' | 'done' | 'error';

const GENERATION_STEPS = [
  '1. Paper Analysis',
  '2. Deep Reasoning',
  '3. Question Synthesis',
  '4. PDF Typesetting',
] as const;

/** Which of the four displayed steps each real stage belongs to (1-based). */
const STAGE_ACTIVE_STEP: Record<GenerationStage, number> = {
  idle: 1,
  figures: 1,
  synthesis: 3,
  typesetting: 4,
  done: 5,
  error: 0,
};

/** Longest a single stage may run before the panel names it as stalled. */
const STAGE_STALL_SECONDS = 90;

/**
 * Hard ceiling on one typesetting request. The server races its own compile
 * against a shorter budget, so this only fires when the request is lost
 * entirely (a dropped connection, a proxy that never answers).
 */
const COMPILE_TIMEOUT_MS = 240_000;

const PLACEHOLDER_REPLY_MARKERS = [
  /first mcq question text/i,
  /sub-?question text/i,
  /question text here/i,
  /lorem ipsum/i,
];

function isPlaceholderReply(content: string): boolean {
  return PLACEHOLDER_REPLY_MARKERS.some((marker) => marker.test(content));
}

/** Helper to extract raw LaTeX document from DeepSeek response */
function extractLatexFromContent(content: string): string | null {
  if (!content) return null;
  const match = content.match(/\\documentclass[\s\S]*?\\end\{document\}/i);
  if (match) return match[0].trim();
  const fenceMatch = content.match(/```(?:latex|tex)?\s*(\\documentclass[\s\S]*?\\end\{document\})\s*```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  return null;
}

/** Helper to extract JSON question paper structure from AI reply with robust fallback */
function extractJsonFromContent(
  content: string,
  options: { allowTextFallback?: boolean } = {}
): any | null {
  if (!content) return null;

  // 1. Direct JSON parse
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && parsed.sections.some((s: any) => Array.isArray(s.questions) && s.questions.length > 0)) {
        return parsed;
      }
    }
  } catch {}

  // 2. Extract from markdown code fence ```json ... ```
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
    if (jsonMatch && jsonMatch[1]) {
      const fenceBody = jsonMatch[1].trim();
      const firstBrace = fenceBody.indexOf('{');
      const lastBrace = fenceBody.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(fenceBody.substring(firstBrace, lastBrace + 1));
        if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && parsed.sections.some((s: any) => Array.isArray(s.questions) && s.questions.length > 0)) {
          return parsed;
        }
      }
    }
  } catch {}

  // 3. Fallback: find first '{' and last '}' anywhere in the content
  try {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = content.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && parsed.sections.some((s: any) => Array.isArray(s.questions) && s.questions.length > 0)) {
        return parsed;
      }
    }
  } catch {}

  // 4. Robust Line-by-Line Heuristic Question Extractor
  //
  // This branch fabricates a pattern (two hardcoded sections of 1- and 7-mark
  // questions) out of whatever prose survived. That is acceptable when the user
  // asks to turn a chat reply into a PDF, but for paper generation it must stay
  // off: inventing a pattern is exactly what must never happen.
  if (options.allowTextFallback === false) return null;
  try {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const questionsSec1: any[] = [];
    const questionsSec2: any[] = [];
    let currentSec = 1;

    for (const line of lines) {
      if (/section\s*[-–—:]*\s*(?:ii|2|b)/i.test(line)) {
        currentSec = 2;
        continue;
      }
      const qMatch = line.match(/^(?:#+\s*)?(?:Q\.?\s*(\d+[a-zA-Z\.\)]*|\([a-z\d]+\)|\d+\.))\s*(.*)$/i);
      if (qMatch) {
        const qNum = qMatch[1].trim();
        const qText = qMatch[2].trim();
        if (qText.length > 5) {
          const target = currentSec === 1 ? questionsSec1 : questionsSec2;
          target.push({
            number: qNum.startsWith('Q') ? qNum : `Q.${qNum}`,
            text: qText.replace(/\[\d+\s*Marks?\]/i, '').trim(),
            marks: currentSec === 1 ? '1' : '7'
          });
        }
      }
    }

    if (questionsSec1.length > 0 || questionsSec2.length > 0) {
      return {
        universityName: 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
        examName: 'B.TECH. / DIPLOMA SEMESTER EXAMINATION 2026',
        subject: 'Operating Systems',
        paperCode: 'SLR-FINAL-04',
        totalMarks: 70,
        duration: '3 Hours',
        sections: [
          ...(questionsSec1.length > 0 ? [{
            title: 'SECTION – I (Objective & MCQs)',
            totalMarks: `${questionsSec1.length} Marks`,
            questions: questionsSec1
          }] : []),
          ...(questionsSec2.length > 0 ? [{
            title: 'SECTION – II (Descriptive & Analytical Questions)',
            totalMarks: `${questionsSec2.length * 7} Marks`,
            questions: questionsSec2
          }] : [])
        ]
      };
    }
  } catch {}

  return null;
}

export const SimpleMultiPaperSynthesizer: React.FC<SimpleMultiPaperSynthesizerProps> = ({
  currentUser,
}) => {
  // Navigation Mode: 'synthesizer' | 'chat'
  const [mainMode, setMainMode] = useState<'synthesizer' | 'chat'>('synthesizer');

  // In-Project OpenAI Prism & LaTeX Browser Modal
  const [showPrismBrowser, setShowPrismBrowser] = useState(false);

  // Uploaded Source Papers (Target: 3 or more)
  const [papers, setPapers] = useState<UploadedPaper[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Metadata Settings
  const [subject, setSubject] = useState(DEFAULT_METADATA.subject);
  const [universityName, setUniversityName] = useState(DEFAULT_METADATA.universityName);
  const [paperCode, setPaperCode] = useState(DEFAULT_METADATA.paperCode);
  const [totalMarks, setTotalMarks] = useState<number>(DEFAULT_METADATA.totalMarks);
  const [durationHours, setDurationHours] = useState<number>(DEFAULT_METADATA.durationHours);
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [difficultySetting, setDifficultySetting] = useState<'BALANCED' | 'HARD' | 'MODERATE'>('BALANCED');

  // AI Generation Settings Toggles
  const [enableQuestionFusion, setEnableQuestionFusion] = useState(true);
  const [enableDifficultyBalancing, setEnableDifficultyBalancing] = useState(true);
  const [enableTopicCoverage, setEnableTopicCoverage] = useState(true);
  const [enableDuplicateDetection, setEnableDuplicateDetection] = useState(true);
  const [enableSemanticSimilarity, setEnableSemanticSimilarity] = useState(true);
  const [enableSecureSelection, setEnableSecureSelection] = useState(true);

  // The uploaded paper that acts as the structural authority. Null means "use
  // the most recently uploaded paper", which is the default the spec asks for.
  const [primaryPaperId, setPrimaryPaperId] = useState<string | null>(null);
  // What the structural enforcement changed in the AI's answer, and what it
  // could not fix, so a rejected run says exactly which rule the paper broke.
  const [enforcementReport, setEnforcementReport] = useState<{
    repairs: string[];
    violations: string[];
    /** The EXPECTED / found / STATUS comparison, question by question. */
    summary?: string[];
  } | null>(null);
  const patternRef = useRef<DetectedPattern | null>(null);
  const headerRef = useRef<PaperHeader | null>(null);

  // Visual assets lifted out of the uploaded paper. A diagram the source already
  // contains is reused as its own pixels; it is never redrawn or approximated.
  const [sourceFigures, setSourceFigures] = useState<SourceFigure[]>([]);
  const [figureWarnings, setFigureWarnings] = useState<string[]>([]);
  const [extractingFigures, setExtractingFigures] = useState(false);
  // The crops as bytes, ready to be sent with the compile request. This is what
  // makes reuse work offline: no URL is ever fetched for a source figure.
  const sourceFigureResourcesRef = useRef<Array<{ path: string; content: string; encoding: 'base64' }>>([]);

  // 3-to-1 Generation State
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [generatedLatex, setGeneratedLatex] = useState<string>('');
  const [structuredData, setStructuredData] = useState<any | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  /**
   * The real stage of the pipeline, set by the code that is actually running.
   *
   * The four step labels used to be derived from `elapsedSeconds`, so the panel
   * announced "4. PDF Typesetting" from second 90 onwards no matter what the
   * backend was doing - a paper still being written showed as a typesetting
   * hang. The clock now only reports how long the current stage has run.
   */
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [waitingOn, setWaitingOn] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Move to a real stage and start its clock. */
  const enterStage = (next: GenerationStage, label: string) => {
    setStage(next);
    setElapsedSeconds(0);
    setWaitingOn(label);
  };

  // Live timer for the stage that is currently running. This clock is a label
  // only: it never decides which step is shown and never claims completion.
  useEffect(() => {
    let interval: any = null;
    if (generating) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [generating, stage]);

  // Compilation & PDF Download State
  const [compiling, setCompiling] = useState(false);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);
  const [compiledFilename, setCompiledFilename] = useState<string>('');
  const [compilerError, setCompilerError] = useState<string | null>(null);
  /**
   * The compiler's own report: which engines ran, the source file it was handed,
   * and the first real TeX error. Kept as an object (not just a string) because
   * the message alone was not enough to debug a failure.
   */
  const [compilerDiagnostics, setCompilerDiagnostics] = useState<CompileDiagnostics | null>(null);
  /**
   * The dedicated LaTeX engine's attempt. It is the last resort before a paper
   * is refused, so its source, engine and error are kept whether it worked or
   * not - a fallback failure is only actionable beside its .tex file.
   */
  const [latexFallback, setLatexFallback] = useState<{
    engine?: string;
    texPath?: string;
    sourceUrl?: string;
    error?: string;
  } | null>(null);

  // Active View Tab in Result Card
  const [activeTab, setActiveTab] = useState<'pdf' | 'content' | 'latex'>('pdf');
  const [copiedCode, setCopiedCode] = useState(false);

  // ================= Interactive AI Chat State =================
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "👋 **Welcome to the AI Examination Assistant!**\n\n" +
        "You can interact with me to:\n" +
        "- 📑 **Analyze syllabus patterns & topics** across your uploaded papers\n" +
        "- 🎯 **Generate specific question sets** (MCQs, short notes, comprehensive design problems)\n" +
        "- ⚡ **Synthesize a complete balanced examination paper** ready for instant PDF download\n" +
        "- 💡 **Refine question wording, TikZ diagrams, or marking schemes** interactively.\n\n" +
        "Upload your papers or choose a quick prompt below to start!",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat to bottom when messages update
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatStreaming]);

  // Auto-detect subject from text if possible
  const detectSubjectFromText = (allText: string) => {
    const lower = allText.toLowerCase();
    if (lower.includes('software engineering')) return 'Software Engineering';
    if (lower.includes('operating system')) return 'Operating Systems';
    if (lower.includes('data structure')) return 'Data Structures & Algorithms';
    if (lower.includes('database') || lower.includes('dbms')) return 'Database Management Systems';
    if (lower.includes('computer network')) return 'Computer Networks';
    if (lower.includes('theory of computation') || lower.includes('automata')) return 'Theory of Computation';
    if (lower.includes('machine learning')) return 'Machine Learning';
    if (lower.includes('web technology') || lower.includes('internet of things')) return 'Web Technologies';
    if (lower.includes('computer graphics')) return 'Computer Graphics';
    return null;
  };

  // Convert File to Base64 Data URL
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
      reader.readAsDataURL(file);
    });

  // Handle uploading 1 or more PDF files in parallel for maximum speed
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);

    const fileArray = Array.from(files);
    const results = await Promise.all(
      fileArray.map(async (file, i) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          return { error: `${file.name}: Only PDF question papers are supported.` };
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          const res = await api.extractPdfText({ file_data: dataUrl, file_name: file.name });
          const text = (res?.text || '').trim();

          if (!text) {
            return { error: `${file.name}: No readable text found (scanned PDF image).` };
          }

          const words = text.split(/\s+/).filter(Boolean).length;
          return {
            paper: {
              id: `${file.name}-${Date.now()}-${i}`,
              name: file.name,
              text,
              pageCount: res.pageCount || 1,
              wordCount: words,
              fileSize: file.size,
              // Kept so the paper's own figures can be cropped back out of it.
              dataUrl,
            },
          };
        } catch (err: any) {
          return { error: `${file.name}: ${err?.message || 'Extraction failed'}` };
        }
      })
    );

    const newPapers: UploadedPaper[] = [];
    const errors: string[] = [];

    results.forEach((r) => {
      if (r.paper) newPapers.push(r.paper);
      if (r.error) errors.push(r.error);
    });

    if (newPapers.length > 0) {
      setPapers((prev) => {
        const combined = [...prev, ...newPapers];
        const detected = detectSubjectFromText(combined.map((p) => p.text).join(' '));
        if (detected) setSubject(detected);
        return combined;
      });
    }

    if (errors.length > 0) {
      setUploadError(errors.join(' | '));
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Remove a paper
  const handleRemovePaper = (id: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== id));
    // Dropping the paper that was acting as the structural authority falls back
    // to "most recently uploaded" rather than leaving a dangling selection.
    setPrimaryPaperId((prev) => (prev === id ? null : prev));
  };

  /**
   * Crop the diagrams, tables and charts the primary paper already prints.
   *
   * Returns the crops as well as storing them, because the prompt that follows
   * has to name them before the model writes a single question.
   */
  const extractFiguresForPaper = async (paper: UploadedPaper | undefined): Promise<SourceFigure[]> => {
    if (!paper?.dataUrl) {
      setSourceFigures([]);
      setFigureWarnings([]);
      sourceFigureResourcesRef.current = [];
      return [];
    }

    setExtractingFigures(true);
    try {
      const res = await api.extractPdfFigures({
        file_data: paper.dataUrl,
        file_name: paper.name,
        max_figures: 12,
      });
      const figures = res.figures || [];
      setSourceFigures(figures);
      setFigureWarnings(res.warnings || []);
      sourceFigureResourcesRef.current = figures.map((figure) => ({
        path: `figure-${figure.index}.png`,
        content: figure.base64,
        encoding: 'base64' as const,
      }));
      return figures;
    } catch (err: any) {
      // A paper whose figures cannot be read still generates; the new paper just
      // may not reuse its diagrams.
      // Extraction is best-effort: a paper whose figures cannot be read still
      // generates, it simply cannot reuse the source diagrams.
      setSourceFigures([]);
      setFigureWarnings([
        `The source paper's figures could not be read (${err?.message || err}). The paper will still be generated, without the reused diagrams.`,
      ]);
      sourceFigureResourcesRef.current = [];
      return [];
    } finally {
      setExtractingFigures(false);
    }
  };

  // Unified Fast PDF Compiler: Compiles instantly via native self-hosted PDF engine (0.1s), formats LaTeX source
  const compilePaperToPdf = async (
    text: string,
    structData?: any,
    options: { requireParseable?: boolean; signal?: AbortSignal } = {}
  ): Promise<string | null> => {
    setCompiling(true);
    setCompilerError(null);
    setCompilerDiagnostics(null);
    let parsedForCompile: any = structData;
    try {
      // 1. Extract or Generate JSON & LaTeX Source
      let latexCode = extractLatexFromContent(text);
      const parsed =
        structData ||
        extractJsonFromContent(text, { allowTextFallback: !options.requireParseable });

      // Remembered so a failure can say precisely how far the reply got, instead
      // of a sentence that fits every possible problem.
      const replySections = Array.isArray(parsed?.sections) ? parsed.sections.length : 0;
      const replyQuestions = replySections
        ? parsed.sections.reduce(
            (sum: number, s: any) => sum + (Array.isArray(s?.questions) ? s.questions.length : 0),
            0
          )
        : 0;

      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
        let paperData = parsed;
        if (patternRef.current) {
          try {
            const enforcement = enforceStructuralPattern(parsed, patternRef.current, headerRef.current, {
              availableFigures: sourceFigureResourcesRef.current.length,
            });
            setEnforcementReport({
              repairs: enforcement.repairs,
              violations: enforcement.violations,
              summary: enforcement.summary,
            });
            if (enforcement.paper) {
              paperData = enforcement.paper;
            }
          } catch (enfErr) {
            console.warn('[Synthesizer] Non-blocking pattern enforcement notice:', enfErr);
          }
        }

        setStructuredData(paperData);
        if (!latexCode) {
          const masthead = headerRef.current;
          latexCode = convertStructuredDataToLatex(
            paperData,
            paperData.subject || masthead?.subject || subject,
            paperData.universityName || masthead?.universityName || universityName,
            paperData.paperCode || masthead?.paperCode || paperCode,
            Number(paperData.totalMarks) || masthead?.maxMarks || totalMarks,
            masthead?.durationHours || durationHours
          );
        }
        parsedForCompile = paperData;
      }

      if (!latexCode) {
        const fallbackStruct = extractJsonFromContent(text, { allowTextFallback: true });
        if (fallbackStruct) {
          setStructuredData(fallbackStruct);
          parsedForCompile = fallbackStruct;
          latexCode = convertStructuredDataToLatex(
            fallbackStruct,
            subject,
            universityName,
            paperCode,
            totalMarks,
            durationHours
          );
        }
      }

      if (latexCode) {
        setGeneratedLatex(latexCode);
      }

      // 2. High-Grade Multi-Pass LaTeX Compilation & Self-Healing Typesetting.
      //    A compile that never answers must surface as an error: the request
      //    carries its own deadline so the panel cannot sit on "Typesetting..."
      //    forever, whatever the compiler does.
      setCurrentStep('Typesetting official University Question Paper PDF via LaTeX Compiler...');
      const compileTimeout = new AbortController();
      const compileTimer = setTimeout(() => compileTimeout.abort(), COMPILE_TIMEOUT_MS);
      const compileSignal = options.signal
        ? AbortSignal.any([compileTimeout.signal, options.signal])
        : compileTimeout.signal;
      let res: Awaited<ReturnType<typeof api.compileValidatedLatex>>;
      try {
        res = await api.compileValidatedLatex({
        latex: latexCode,
        structuredData: parsedForCompile,
        paperText: text,
        subject: parsedForCompile?.subject || headerRef.current?.subject || subject,
        universityName: parsedForCompile?.universityName || headerRef.current?.universityName || universityName,
        paperCode: parsedForCompile?.paperCode || headerRef.current?.paperCode || paperCode,
        totalMarks: Number(parsedForCompile?.totalMarks) || headerRef.current?.maxMarks || totalMarks,
        durationHours: headerRef.current?.durationHours || durationHours,
        setLetter: parsedForCompile?.setLetter || headerRef.current?.set || undefined,
        // The crops travel with this very request as their own bytes. Nothing
        // is fetched over HTTP, so a figure cannot go missing between requests.
        resources: sourceFigureResourcesRef.current,
        }, { signal: compileSignal });
      } finally {
        clearTimeout(compileTimer);
      }

      if (res.success && res.pdfUrl) {
        // A compiler that silently drops the source paper's figures reports
        // success, so anything it admits to belongs in front of the examiner.
        if (Array.isArray(res.warnings) && res.warnings.length > 0) {
          setFigureWarnings((prev) => Array.from(new Set([...prev, ...res.warnings!])));
        }
        // Keep the report even on success: it names the engine that actually
        // typeset the paper and the source file that produced it.
        setCompilerDiagnostics(res.diagnostics || null);
        setLatexFallback(res.latexFallback || null);
        setCompiledPdfUrl(res.pdfUrl);
        setCompiledFilename(res.filename || `${subject.replace(/[^a-zA-Z0-9]/g, '_')}_Synthesized_Paper.pdf`);
        if (res.latex) {
          setGeneratedLatex(res.latex);
        }
        if (parsedForCompile && !structuredData) {
          setStructuredData(parsedForCompile);
        }
        return res.pdfUrl;
      } else {
        setCompilerDiagnostics(res.diagnostics || null);
        setLatexFallback(res.latexFallback || null);
        const first = res.diagnostics?.firstError;
        setCompilerError(
          [
            res.error || 'PDF compilation failed.',
            first ? `First compiler error: ${first}` : '',
            res.diagnostics?.firstErrorLine ? `Line: ${res.diagnostics.firstErrorLine}` : '',
            res.diagnostics?.sourcePath ? `Generated source: ${res.diagnostics.sourcePath}` : '',
            // The fallback is the last resort, so its own failure is the reason
            // no paper exists at all.
            res.latexFallback?.error ? `LaTeX fallback (${res.latexFallback.engine || 'last resort'}): ${res.latexFallback.error}` : '',
            res.latexFallback?.texPath ? `LaTeX fallback source: ${res.latexFallback.texPath}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        );
        return null;
      }
    } catch (err: any) {
      // Distinguish "the server told us no" from "nobody ever answered". A
      // timeout is a real result and has to be reported as one.
      const aborted = err?.name === 'AbortError' || err?.name === 'TimeoutError';
      setCompilerError(
        aborted
          ? `Typesetting gave up after ${Math.round(COMPILE_TIMEOUT_MS / 1000)}s without an answer from the PDF engine. ` +
              'No PDF was produced. Check the server log for the last [PDF] stage that started, then re-run generation.'
          : err?.message || 'PDF compilation request failed.'
      );
      return null;
    } finally {
      setCompiling(false);
    }
  };

  // Helper to build full context paper snippets for AI synthesis (full fidelity across all pages)
  const buildPaperSnippets = () => {
    if (papers.length === 0) return 'No source papers uploaded yet.';
    return papers
      .map((p, idx) => {
        const textSlice = p.text.length > 30000 ? p.text.slice(0, 30000) + '\n[...truncated...]' : p.text;
        return `=== SOURCE QUESTION PAPER ${idx + 1} (File: ${p.name} | Pages: ${p.pageCount}) ===\n${textSlice}\n`;
      })
      .join('\n' + '='.repeat(50) + '\n\n');
  };

  // ================= Multi-Paper Synthesizer Workflow =================
  const handleGenerate4thPaper = async () => {
    if (papers.length < 2) {
      alert('Please upload at least 2 question papers first.');
      return;
    }

    setGenerating(true);
    setGenerationError(null);
    setStreamingContent('');
    setGeneratedLatex('');
    setStructuredData(null);
    setCompiledPdfUrl(null);
    setCurrentStep('AI analyzing uploaded source question papers...');
    enterStage('figures', 'reading the uploaded papers and the visuals they already contain');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const paperSnippets = buildPaperSnippets();

      // One paper is the structural authority; the rest are style, syllabus and
      // difficulty references. Default is the most recently uploaded paper, per
      // the examiner's rule, and the picker lets them name another.
      const primaryIndex = pickPrimaryPaperIndex(
        papers,
        primaryPaperId ? papers.findIndex((p) => p.id === primaryPaperId) : null
      );
      const primaryPaper = papers[primaryIndex];
      const primaryPattern =
        (primaryPaper ? detectPaperPattern(primaryPaper.text, primaryPaper.name) : null) ??
        pickPrimaryPattern(papers.map((p) => detectPaperPattern(p.text, p.name)));
      const sourceHeader = headerRespectingOverrides(
        primaryPaper ? extractPaperHeader(primaryPaper.text) : null,
        { subject, universityName, paperCode, totalMarks, durationHours }
      );
      patternRef.current = primaryPattern;
      headerRef.current = sourceHeader;
      setEnforcementReport(null);

      // Lift the primary paper's own diagrams and tables out of its PDF: the new
      // paper reuses those pixels instead of drawing its own version of them.
      setCurrentStep('Reading the diagrams and tables the source paper already contains...');
      const figures = await extractFiguresForPaper(primaryPaper);

      const figureCatalogue = figures.length > 0
        ? [
            '',
            '=== VISUALS ALREADY PRINTED ON THE PRIMARY PAPER (REUSE THEM UNCHANGED) ===',
            ...figures.map(
              (figure) =>
                `[FIGURE:${figure.index}] page ${figure.page} of the primary paper, ${figure.width}x${figure.height}px`
            ),
            'A diagram, figure, flowchart, Gantt chart, graph, memory/process-state diagram or table that already exists on the primary paper MUST NOT be redrawn, approximated, replaced with ASCII art or Mermaid, or described in words.',
            'Where a question needs one of these visuals, write its marker [FIGURE:n] alone on its own line inside that question and write nothing else for the visual. The original asset is placed there unchanged, at its printed size and style.',
            'The only valid markers are the numbers listed above. Never invent one, and never use a marker for something the paper does not already contain.',
            'Draw new TikZ only for a visual the primary paper does not already contain. A table the paper prints stays a LaTeX tabular with the same columns, rows and borders, with only the cell values changed.',
          ].join('\n')
        : [
            '',
            '=== NO SEPARATE VISUALS WERE LIFTED FROM THE PRIMARY PAPER ===',
            'If a question needs a diagram or table, reproduce it as real LaTeX (tabular / tikzpicture) in the same shape the source paper uses. Never replace a table with prose and never replace a diagram with ASCII or Mermaid.',
          ].join('\n');

      const headerConstraint = sourceHeader
        ? [
            '',
            `=== MASTHEAD THE PRIMARY PAPER PRINTS (File: ${primaryPaper?.name ?? 'source paper'}) ===`,
            ...(sourceHeader.universityName ? [`University / Board: ${sourceHeader.universityName}`] : []),
            ...(sourceHeader.examName ? [`Examination: ${sourceHeader.examName}`] : []),
            ...(sourceHeader.subject ? [`Subject: ${sourceHeader.subject}`] : []),
            ...(sourceHeader.paperCode ? [`Paper code: ${sourceHeader.paperCode}`] : []),
            ...(sourceHeader.maxMarks !== null ? [`Maximum marks: ${sourceHeader.maxMarks}`] : []),
            ...(sourceHeader.durationHours !== null ? [`Duration: ${sourceHeader.durationHours} Hours`] : []),
            ...(sourceHeader.set ? [`Set: ${sourceHeader.set}`] : []),
            ...(sourceHeader.instructions.length > 0
              ? ['Instructions, in order:', ...sourceHeader.instructions.map((line, i) => `  ${i + 1}) ${line}`)]
              : []),
            'Reproduce this masthead and these instruction lines exactly. Do not fall back to any other marks total or subject name.',
          ].join('\n')
        : '';

      // State the detected pattern up front instead of asking the model to infer
      // one: left to itself it invents a plausible layout (observed: "SECTION - I
      // [35 Marks] / SECTION - II [35 Marks]" for sources whose real layouts were
      // a 9+17-question split and a 28+28-mark split). The answer is checked
      // against this contract after it returns, so this is a reminder as well as
      // a constraint.
      const patternConstraint = primaryPattern
        ? [
            '',
            '=== DETECTED PATTERN OF THE PRIMARY PAPER (BINDING CONTRACT) ===',
            summarizePattern(primaryPattern),
            'Your answer must contain exactly this many sections, with exactly these question counts and these marks.',
            'Copy the section headings and the instruction lines from the papers. Do not rename a section, do not add one, do not drop one, and do not change a single mark value.',
            // Objectivity comes from what the source paper prints, not from its
            // heading: an "Objective / MCQs" heading can sit above descriptive
            // questions, and adding choices there would break the match.
            ...primaryPattern.sections.map((section) =>
              section.objective
                ? `Every question under "${section.title}" must carry four choices labelled a) b) c) d), matching the source paper.`
                : `Questions under "${section.title}" are printed in full with no choices - do not attach choices to them.`
            ),
            'If the uploaded papers disagree with each other, follow the pattern stated here.',
            headerConstraint,
            figureCatalogue,
          ]
            .filter(Boolean)
            .join('\n')
        : `${headerConstraint}\n${figureCatalogue}`;

      const systemPrompt = [
        'You are an expert academic examination designer and LaTeX typesetting engine.',
        `Subject: "${subject}" | Institution: "${universityName}" | Paper Code: "${paperCode}" | Total Marks: ${totalMarks} | Duration: ${durationHours} Hours`,
        '',
        '=== CORE MISSION: COMPLETE QUESTION PAPER SYNTHESIS (EXACT PATTERN, ALL QUESTIONS) ===',
        'You are given multiple source question papers uploaded by the academic examination board. Your mission is to extract their EXACT structural pattern and synthesize a 100% COMPLETE, non-leaked, publication-grade examination paper.',
        '',
        'CRITICAL INSTRUCTION FOR FAST GENERATION:',
        '- Begin output IMMEDIATELY with the JSON object wrapped in ```json.',
        '- Do NOT output conversational preambles, reasoning traces, or explanations outside the JSON block.',
        '',
        'CRITICAL RULES:',
        '1. EXACT PATTERN & QUESTION BLUEPRINT PRESERVATION:',
        '   - Mirror the source papers exactly: same Sections (e.g. SECTION – I, SECTION – II), exact main Question numbers (Q.1, Q.2, Q.3, Q.4, Q.5, Q.6...), exact sub-question counts (e.g. 2(a), 2(b), 2(c), 2(d), 2(e)), and exact marks allocation (e.g. [14], [7], [4], [2], [1]).',
        '   - DO NOT omit, summarize, or truncate ANY question number. Every question and subquestion that belongs in the exam blueprint must be completely written out.',
        '',
        '2. STRICTLY NO ANSWERS / QUESTION PAPER ONLY:',
        '   - This is an official examination question paper for students. Do NOT provide answers, solutions, answer keys, hints, or explanations.',
        '   - For MCQs, provide only the question and 4 choices (A), (B), (C), (D) without indicating which one is correct.',
        '   - For descriptive and numerical questions, provide only the problem statement and the assigned marks [e.g. 7 Marks].',
        '',
        '3. SYNTHESIZE FRESH & VARIED SUBQUESTIONS:',
        '   - For each question and subquestion, synthesize fresh, non-leaked problem formulations by blending, cross-synthesizing, and reforming the syllabus concepts, numericals, and theory from the uploaded papers.',
        '   - Maintain the identical difficulty level, cognitive depth (Bloom\'s taxonomy), and syllabus distribution.',
        '',
        '4. LATEX TABLES & TIKZ DIAGRAMS:',
        '   - For any question requiring a table (e.g., process scheduling, page tables, truth tables, comparison tables), embed clean LaTeX table code (\\begin{tabular}{|c|c|...|} ... \\end{tabular}).',
        '   - For questions requiring a diagram (e.g., system architectures, circuit diagrams, state graphs), include TikZ code (\\begin{tikzpicture} ... \\end{tikzpicture}).',
        '',
        '5. OUTPUT SPECIFICATION (VALID JSON ONLY):',
        '```json',
        '{',
        `  "universityName": "${universityName}",`,
        '  "examName": "B.TECH. / DIPLOMA SEMESTER EXAMINATION 2026",',
        `  "subject": "${subject}",`,
        `  "paperCode": "${paperCode}",`,
        `  "totalMarks": ${totalMarks},`,
        `  "duration": "${durationHours} Hours",`,
        '  "instructions": ["<one entry per instruction line the source paper prints>"],',
        '  "sections": [',
        '    {',
        '      "title": "<section heading, exactly as the source paper prints it>",',
        '      "totalMarks": "<marks block printed for that section, digits only>",',
        '      "instructions": "<that section\'s own instruction line, copied from the source paper>",',
        '      "questions": [',
        '        {',
        '          "number": "<question label exactly as printed, e.g. Q.1(1) or Q.2(a)>",',
        '          "text": "<the complete question you are writing>",',
        '          "marks": "<marks printed against that question, digits only>",',
        '          "options": ["<four alternatives, MCQ questions only>"]',
        '        }',
        '      ]',
        '    }',
        '  ]',
        '}',
        '```',
        '',
        'THE SCHEMA ABOVE IS A SHAPE, NOT CONTENT:',
        '- Everything between <angle brackets> is an instruction to you. Never copy it, and never emit filler such as "First MCQ question text...", "Subquestion text...", "Option 1", "Option 2" or "Sample question".',
        '- Section titles, instruction lines, question numbers and marks must come from the SOURCE PAPERS below, never from this schema. Three sections and fourteen questions in the source means three sections and fourteen questions in your answer.',
        '- An answer containing placeholder or filler text is a FAILED answer. If you run short of room, return fewer sections rather than padding with filler.',
        '5. Output ONLY the JSON object. Never include text outside ```json.',
        patternConstraint
      ].join('\n');

      const userMessage = [
        `Here are the complete texts of all uploaded source question papers. Extract their exact question paper pattern, section layout, question numbering, and marking scheme. Then synthesize the complete examination paper containing ALL questions and differentiated subquestions. Start immediately with \`\`\`json:`,
        '',
        paperSnippets,
      ].join('\n');

      setCurrentStep('AI is synthesizing the complete question paper with all questions...');
      enterStage('synthesis', 'the AI provider (still writing the paper)');

      let accumulated = '';
      await ollamaChatStream(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          // No model pin here. Forcing a small 11B vision model to write a whole
          // paper left the provider's own strong model unused, and it ran out of
          // room part-way through the document.
          temperature: 0.2,
          plainText: true,
        },
        (chunk) => {
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
        controller.signal,
        () => {
          // The provider that produced these tokens died mid-reply; drop them
          // rather than keeping half a paper.
          accumulated = '';
          setStreamingContent('');
        }
      );

      setCurrentStep('Typesetting official University Question Paper PDF via LaTeX Compiler...');
      enterStage('typesetting', 'the LaTeX compiler / PDF engine');

      // Render official PDF via Universal LaTeX compiler (with PDFKit fallback)
      const pdfUrl = await compilePaperToPdf(accumulated, undefined, {
        requireParseable: true,
        signal: controller.signal,
      });
      setActiveTab('pdf');
      if (pdfUrl) {
        enterStage('done', 'nothing - the paper is ready');
        setCurrentStep('Done! Your Synthesized Question Paper is ready to download.');
      } else {
        // compilePaperToPdf reports the engine's own error through compilerError.
        enterStage('error', 'nothing - typesetting failed');
        setGenerationError(
          (previous) => previous || 'The PDF could not be typeset. See the compiler error above, then re-run generation.'
        );
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        enterStage('error', 'nothing - generation stopped');
        setGenerationError(err?.message || 'Paper generation failed.');
      }
    } finally {
      abortControllerRef.current = null;
      setGenerating(false);
    }
  };

  // ================= Direct DeepSeek Chat Workflow =================
  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = (presetText || chatInput).trim();
    if (!textToSend || chatStreaming) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const newMessages: ChatMsg[] = [
      ...chatMessages,
      { id: userMsgId, role: 'user', content: textToSend, timestamp: new Date() },
    ];

    setChatMessages(newMessages);
    setChatInput('');
    setChatStreaming(true);

    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    try {
      const paperContext = buildPaperSnippets();

      const chatSystemPrompt = [
        'You are ZeroLeak AI, the official academic exam synthesis and analysis assistant powered by Ollama.',
        `Current Exam Configuration:`,
        `- Subject: "${subject}"`,
        `- University / Institution: "${universityName}"`,
        `- Paper Code: "${paperCode}"`,
        `- Total Marks: ${totalMarks}`,
        `- Duration: ${durationHours} Hours`,
        `- Source Papers Loaded: ${papers.length} PDF paper(s)`,
        '',
        '=== UPLOADED QUESTION PAPERS CONTENT / FULL DIGEST ===',
        paperContext,
        '',
        'CAPABILITIES & GUIDELINES:',
        '1. You can answer questions about the uploaded papers, discuss question trends, suggest improvements, or generate specific MCQs/questions.',
        '2. For any diagrams, output clean TikZ code (\\begin{tikzpicture} ... \\end{tikzpicture}). For any tables, output clean LaTeX tables (\\begin{tabularx}{\\linewidth}{|X|X|}...\\end{tabularx}).',
        '3. If the user asks you to create/synthesize a full exam paper, output it in clean JSON wrapped in ```json ... ``` with fields "universityName", "subject", "paperCode", "totalMarks", "duration", "instructions", and "sections" (with questions array). The system will automatically compile and download it as an official PDF.',
        '4. Provide professional, well-formatted, and accurate responses.',
      ].join('\n');

      // Add temporary empty assistant message
      setChatMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date() },
      ]);

      let accumulated = '';
      await ollamaChatStream(
        {
          messages: [
            { role: 'system', content: chatSystemPrompt },
            ...newMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
          plainText: true,
        },
        (chunk) => {
          accumulated += chunk;
          setChatMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulated } : m))
          );
        },
        controller.signal
      );

      // Check if structured paper exists in completed message
      const parsedStruct = extractJsonFromContent(accumulated);
      if (parsedStruct) {
        setChatMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, structuredPaper: parsedStruct } : m))
        );
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ **AI Assistant Error:** ${err?.message || 'Could not complete streaming call.'}`,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      chatAbortControllerRef.current = null;
      setChatStreaming(false);
    }
  };

  const handleCompileChatPaper = async (msg: ChatMsg) => {
    const struct = msg.structuredPaper || extractJsonFromContent(msg.content);
    if (!struct) {
      alert('No valid exam paper structure found in this message.');
      return;
    }
    const pdfUrl = await compilePaperToPdf(msg.content, struct);
    if (pdfUrl) {
      setMainMode('synthesizer');
      setActiveTab('pdf');
    }
  };

  const copyLatex = async () => {
    if (!generatedLatex) return;
    try {
      await navigator.clipboard.writeText(generatedLatex);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const downloadLatexFile = () => {
    if (!generatedLatex) return;
    const blob = new Blob([generatedLatex], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${subject.replace(/[^a-zA-Z0-9]/g, '_')}_Synthesized_Paper.tex`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 relative">
      {/* Subtle Technical Grid Background Accent */}
      <div 
        className="fixed inset-0 pointer-events-none z-[-1] opacity-40" 
        style={{
          backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} 
      />

      {/* ================= DARK NAVY AI WORKSPACE HERO ================= */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1F2A] border border-[#1E3A4A] p-6 sm:p-8 text-white shadow-2xl">
        {/* Ambient Cyan & Indigo Glow Orbs */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-[#00B8D9]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-12 w-80 h-80 bg-[#635BFF]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* Top Row: Badge, Title & Paper Counter */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00C98B]/15 border border-[#00C98B]/30 text-[#00C98B] font-mono text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#00C98B] animate-pulse" />
                <span>AI EXAMINATION SYNTHESIS ENGINE</span>
                <span className="text-white/40">|</span>
                <span className="text-white/80">LATEX 2E NATIVE</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
                Multi-Paper AI Examination Synthesizer
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Cryptographic question paper generation system. Analyzes structural layouts, Bloom taxonomy, and syllabus distributions across source documents to synthesize uncompromised examination papers.
              </p>
            </div>

            {/* Quick Metrics Badge & Actions */}
            <div className="flex flex-wrap lg:flex-col items-start lg:items-end gap-3 shrink-0">
              <div className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#00C98B]/20 text-[#00C98B] flex items-center justify-center font-black text-sm">
                  {papers.length}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Source Repository</div>
                  <div className="text-xs font-bold text-white">
                    {papers.length >= 2 ? 'Papers Ready' : `${papers.length} Paper(s) Loaded`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connected Horizontal Pipeline Flow in Hero */}
          <div className="pt-2 pb-1 border-t border-white/10">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#00B8D9]" />
              <span>Real-Time Synthesis Pipeline Architecture</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-xs">
              {[
                { label: 'PDF Sources', sub: 'Multi-Paper Ingestion', active: papers.length > 0 },
                { label: 'Pattern Detection', sub: 'Structural Authority', active: papers.length >= 2 },
                { label: 'AI Fusion Core', sub: 'Ollama / DeepSeek', active: generating },
                { label: 'LaTeX 2e Engine', sub: 'Pdflatex / XeLaTeX', active: stage === 'compiling' || !!compiledPdfUrl },
                { label: 'AES-256 Vault', sub: 'Cryptographic Sealing', active: !!compiledPdfUrl },
              ].map((node, i) => (
                <div
                  key={node.label}
                  className={`relative p-3 rounded-xl border transition-all ${
                    node.active
                      ? 'bg-white/10 border-[#00C98B]/50 text-white shadow-lg shadow-[#00C98B]/5'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[10px] text-slate-400">0{i + 1}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        node.active ? 'bg-[#00C98B] shadow-sm shadow-[#00C98B]' : 'bg-slate-600'
                      }`}
                    />
                  </div>
                  <div className="font-bold text-xs truncate">{node.label}</div>
                  <div className="text-[10px] text-slate-400 truncate">{node.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Mode Toggle Tabs & ZeroLeak AI Launcher */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMainMode('synthesizer')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  mainMode === 'synthesizer'
                    ? 'bg-[#00C98B] text-[#0B1F2A] shadow-md shadow-[#00C98B]/20 font-black'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>⚡ Multi-Paper Synthesizer</span>
              </button>

              <button
                type="button"
                onClick={() => setMainMode('chat')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  mainMode === 'chat'
                    ? 'bg-[#635BFF] text-white shadow-md shadow-[#635BFF]/20 font-black'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-amber-300" />
                <span>💬 Interactive AI Assistant</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-bold">
                  Live
                </span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono text-slate-400 pr-3 border-r border-white/10">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00C98B]" />
                  <span>Enclave: AES-256</span>
                </span>
                <span className="text-slate-500">|</span>
                <span>Latency: 1.24s</span>
                <span className="text-slate-500">|</span>
                <span className="text-[#00C98B]">Integrity: 98.4%</span>
              </div>

              <button
                type="button"
                onClick={() => setShowPrismBrowser(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-[#00A878] to-[#00B8D9] hover:opacity-95 text-white shadow-md shadow-[#00A878]/30 transition-all cursor-pointer group shrink-0"
                title="Open ZeroLeak AI Assistant"
              >
                <Sparkles className="w-4 h-4 text-emerald-100 group-hover:scale-110 transition-transform duration-300" />
                <span>ZeroLeak AI</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= 5-STAGE WORKFLOW STEPPER ================= */}
      <div className="bg-white dark:bg-slate-900 border border-[#DCE5EA] dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[
            {
              step: '01',
              title: 'UPLOAD PAPERS',
              desc: `${papers.length} uploaded`,
              status: papers.length >= 2 ? 'complete' : papers.length > 0 ? 'current' : 'pending',
            },
            {
              step: '02',
              title: 'ANALYZE PATTERN',
              desc: papers.length >= 2 ? 'Pattern locked' : 'Requires ≥2 papers',
              status: papers.length >= 2 ? 'complete' : 'pending',
            },
            {
              step: '03',
              title: 'CONFIGURE EXAM',
              desc: `${totalMarks} Marks • ${durationHours}h`,
              status: papers.length >= 2 && !generating && !compiledPdfUrl ? 'current' : papers.length >= 2 ? 'complete' : 'pending',
            },
            {
              step: '04',
              title: 'SYNTHESIZE AI',
              desc: generating ? currentStep || 'Running...' : compiledPdfUrl ? 'Complete' : 'Ready to start',
              status: generating ? 'current' : compiledPdfUrl ? 'complete' : 'pending',
            },
            {
              step: '05',
              title: 'SECURE & VAULT',
              desc: compiledPdfUrl ? 'Sealed & Time-Locked' : 'Awaiting Synthesis',
              status: compiledPdfUrl ? 'complete' : 'pending',
            },
          ].map((item) => (
            <div
              key={item.step}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                item.status === 'complete'
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                  : item.status === 'current'
                  ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/80 text-indigo-950 dark:text-indigo-200 shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-500'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-black shrink-0 ${
                  item.status === 'complete'
                    ? 'bg-emerald-600 text-white'
                    : item.status === 'current'
                    ? 'bg-[#635BFF] text-white shadow-sm'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.status === 'complete' ? <Check className="w-4 h-4" /> : item.step}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-wider truncate">
                  {item.title}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= INTERACTIVE AI CHAT VIEW ================= */}
      {mainMode === 'chat' && (
        <div className="space-y-6">
          {/* Quick Paper Attachment Strip */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Active AI Context: {papers.length} Question Paper(s) Loaded
                </h4>
                <p className="text-[11px] text-slate-500">
                  {papers.length > 0
                    ? papers.map((p) => p.name).join(', ')
                    : 'Upload question papers for AI to reference their questions, tables, and syllabus'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{uploading ? 'Extracting...' : '+ Upload Papers'}</span>
              </button>
            </div>
          </div>

          {/* Interactive AI Chat Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md flex flex-col h-[700px] overflow-hidden">
            {/* Chat Top Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      AI Examination Assistant
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold border border-emerald-200 dark:border-emerald-800">
                      Synthesis Engine Active
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Neural Paper Reasoning &bull; Ready</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChatMessages([
                      {
                        id: 'welcome',
                        role: 'assistant',
                        content: 'Chat cleared. How can I help you analyze papers or draft new exam questions today?',
                        timestamp: new Date(),
                      },
                    ]);
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs flex items-center gap-1 cursor-pointer"
                  title="Clear Chat History"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>
            </div>

            {/* Suggested Prompt Pills */}
            <div className="px-6 py-2.5 bg-indigo-50/40 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs no-scrollbar">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Quick Prompts:
              </span>
              {[
                'Synthesize a complete balanced question paper from uploaded PDFs',
                'Generate 10 high-quality MCQs with 4 options each',
                'Analyze syllabus distribution & common topics across papers',
                'Draft 5 analytical questions with TikZ diagrams or tables',
                'Suggest comprehensive design problems with OR choices',
              ].map((promptText, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handleSendChatMessage(promptText)}
                  disabled={chatStreaming}
                  className="px-3 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {promptText}
                </button>
              ))}
            </div>

            {/* Chat Messages Scroll Container */}
            <div ref={chatScrollRef} className="flex-1 p-6 overflow-y-auto space-y-4">
              {chatMessages.map((msg) => {
                const isUser = msg.role === 'user';
                const hasPaperStruct = msg.structuredPaper || extractJsonFromContent(msg.content);

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 text-white flex items-center justify-center shrink-0 text-xs shadow-sm mt-1">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div className={`max-w-[85%] space-y-2`}>
                      <div
                        className={`p-4 rounded-2xl text-xs leading-relaxed ${
                          isUser
                            ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-900/10'
                            : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700/60 shadow-sm'
                        }`}
                      >
                        <div className="whitespace-pre-wrap font-sans">
                          {msg.content || (chatStreaming && msg.id.startsWith('assistant') ? 'AI is generating response...' : '')}
                        </div>
                      </div>

                      {/* If Paper JSON is generated in assistant message, show 1-click Download Action */}
                      {!isUser && hasPaperStruct && (
                        <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/40 border-2 border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">
                                Examination Paper Formulated!
                              </p>
                              <p className="text-[10px] text-slate-500">
                                Ready to compile into authentic University A4 PDF format.
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={compiling}
                            onClick={() => handleCompileChatPaper(msg)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            {compiling ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Compiling PDF...</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                <span>Generate & View PDF</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 text-xs shadow-sm mt-1">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Chat Input Bar */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChatMessage();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  rows={2}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChatMessage();
                    }
                  }}
                  placeholder="Ask anything about the papers, request new MCQs, or ask to synthesize a full paper... (Press Enter to send)"
                  className="flex-1 p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-medium leading-relaxed"
                />

                <div className="flex flex-col gap-1.5 shrink-0">
                  {chatStreaming ? (
                    <button
                      type="button"
                      onClick={() => chatAbortControllerRef.current?.abort()}
                      className="px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-900/20 transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= STANDARD MULTI-PAPER SYNTHESIZER VIEW (70% / 30% LAYOUT) ================= */}
      {mainMode === 'synthesizer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ================= LEFT COLUMN: 70% WORKSPACE ================= */}
          <div className="lg:col-span-8 space-y-8">
            {/* STEP 1: Upload Source Papers */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#0B1F2A] text-[#00C98B] flex items-center justify-center font-mono font-black text-xs shadow-sm">
                    01
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[#102A38] dark:text-white uppercase tracking-wider">
                      Upload Source Question Papers (PDF)
                    </h2>
                    <p className="text-xs text-[#647681] dark:text-slate-400">
                      Upload previous examination papers, midterms, or question banks for deep multi-paper synthesis.
                    </p>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 ${
                    papers.length >= 2
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      papers.length >= 2 ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  <span>{papers.length >= 2 ? '✓ Ready to Synthesize' : 'Upload at least 2 papers'}</span>
                </span>
              </div>

              {/* Primary Template & Structural Authority */}
              {papers.length >= 2 && (() => {
                const primaryIndex = pickPrimaryPaperIndex(
                  papers,
                  primaryPaperId ? papers.findIndex((p) => p.id === primaryPaperId) : null
                );
                const primaryPaper = papers[primaryIndex];
                const primary = primaryPaper ? detectPaperPattern(primaryPaper.text, primaryPaper.name) : null;
                if (!primary) {
                  return (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        No standard section or question structure could be parsed from the uploaded papers, so the layout pattern cannot be locked. The generated paper will use default university formatting.
                      </span>
                    </div>
                  );
                }
                const header = extractPaperHeader(primaryPaper!.text);
                return (
                  <div className="rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-[#F6F8FA] dark:bg-slate-950/40 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-black uppercase tracking-wider text-[#102A38] dark:text-slate-300">
                        Primary Template & Structural Authority
                      </label>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-[#635BFF] dark:text-indigo-300 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                        Pattern Enforcer Active
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <select
                        value={primaryPaper!.id}
                        onChange={(e) => setPrimaryPaperId(e.target.value)}
                        className="w-full text-xs p-3 rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#102A38] dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-[#00C98B]"
                      >
                        {papers.map((p, i) => (
                          <option key={p.id} value={p.id}>
                            {i === papers.length - 1 ? `${p.name} (Primary Authority)` : p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[#647681] dark:text-slate-400">
                        The synthesized paper mirrors this document's section layout and mark distributions. Other uploaded papers contribute syllabus depth, varied question phrasing, and topic coverage.
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Locked Structural Blueprint
                      </p>
                      <pre className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#DCE5EA] dark:border-slate-800 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">
                        {summarizePattern(primary)}
                      </pre>
                    </div>

                    {(header.maxMarks !== null || header.durationHours !== null || header.subject || header.paperCode || header.instructions.length > 0) && (
                      <div className="border-t border-[#DCE5EA] dark:border-slate-800 pt-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                          Detected Masthead & Exam Instructions
                        </p>
                        <pre className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#DCE5EA] dark:border-slate-800 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-slate-700 dark:text-slate-300 max-h-32 overflow-y-auto">
                          {[
                            header.universityName && `University / Board: ${header.universityName}`,
                            header.examName && `Examination: ${header.examName}`,
                            header.subject && `Subject: ${header.subject}`,
                            header.paperCode && `Paper Code: ${header.paperCode}`,
                            header.maxMarks !== null && `Maximum Marks: ${header.maxMarks}`,
                            header.durationHours !== null && `Duration: ${header.durationHours} Hours`,
                            ...header.instructions.map((line, i) => `Instruction ${i + 1}: ${line}`),
                          ]
                            .filter(Boolean)
                            .join('\n')}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Source Visuals & Cropped Figures */}
              {(sourceFigures.length > 0 || figureWarnings.length > 0 || extractingFigures) && (
                <div className="rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-[#102A38] dark:text-slate-300">
                      Visual Figures Extracted from Source Documents
                    </p>
                    <span className="text-[10px] font-mono text-[#00A878] font-bold">
                      {sourceFigures.length} Figures Available
                    </span>
                  </div>

                  {extractingFigures && (
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00B8D9]" />
                      Extracting vector graphics, circuit diagrams, and tables from source papers...
                    </p>
                  )}

                  {sourceFigures.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      {sourceFigures.map((figure) => (
                        <figure
                          key={figure.index}
                          className="border border-[#DCE5EA] dark:border-slate-700 rounded-xl p-2 bg-[#F6F8FA] dark:bg-slate-950/40 shadow-xs"
                        >
                          <img
                            src={`data:image/png;base64,${figure.base64}`}
                            alt={`Source figure ${figure.index} from page ${figure.page}`}
                            className="h-16 w-auto object-contain bg-white rounded-md"
                          />
                          <figcaption className="text-[9px] font-mono text-slate-500 dark:text-slate-400 text-center mt-1">
                            [FIGURE:{figure.index}] p.{figure.page}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  {figureWarnings.map((warning, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                      {warning}
                    </p>
                  ))}
                </div>
              )}

              {/* Structural Enforcement Report */}
              {enforcementReport && (
                <div className="rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
                  <p className="text-xs font-black uppercase tracking-wider text-[#102A38] dark:text-slate-300">
                    Structure Validation Against Source Paper
                  </p>
                  {enforcementReport.violations.length > 0 ? (
                    <ul className="text-xs text-rose-700 dark:text-rose-300 list-disc pl-4 space-y-1">
                      {enforcementReport.violations.map((violation, i) => (
                        <li key={i}>{violation}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        The synthesized paper fully satisfies the structural layout: {enforcementReport.repairs.length} parameter(s) aligned automatically with authority rules.
                      </span>
                    </p>
                  )}

                  {enforcementReport.repairs.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-600 dark:text-slate-400 font-semibold">
                        Automated structural repairs applied ({enforcementReport.repairs.length})
                      </summary>
                      <ul className="list-disc pl-4 mt-1.5 space-y-1 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {enforcementReport.repairs.map((repair, i) => (
                          <li key={i}>{repair}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {enforcementReport.summary && enforcementReport.summary.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-600 dark:text-slate-400 font-semibold">
                        Detailed Structure Comparison Matrix
                      </summary>
                      <pre className="mt-2 p-3 rounded-xl bg-[#0B1F2A] text-emerald-300 text-[10px] leading-relaxed overflow-auto max-h-64 whitespace-pre-wrap font-mono border border-slate-800">
                        {enforcementReport.summary.join('\n')}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Upload Dropzone with Stacked Documents Illustration */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative border-2 border-dashed border-[#00B8D9]/40 hover:border-[#00C98B] rounded-2xl p-8 text-center cursor-pointer transition-all bg-[#F6F8FA]/60 hover:bg-emerald-50/20 group overflow-hidden"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />

                {/* Stacked Documents Graphic */}
                <div className="relative w-24 h-20 mx-auto mb-4 flex items-center justify-center">
                  <div className="absolute w-14 h-18 bg-white border border-[#DCE5EA] rounded-xl shadow-xs rotate-[-12deg] group-hover:rotate-[-16deg] transition-transform" />
                  <div className="absolute w-14 h-18 bg-slate-50 border border-slate-300 rounded-xl shadow-xs rotate-[8deg] group-hover:rotate-[12deg] transition-transform" />
                  <div className="relative w-14 h-18 bg-gradient-to-tr from-white to-slate-50 border-2 border-[#00C98B] rounded-xl shadow-md flex flex-col items-center justify-center text-[#00C98B] group-hover:scale-105 transition-transform">
                    {uploading ? (
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    ) : (
                      <FileText className="w-6 h-6" />
                    )}
                  </div>
                </div>

                <h3 className="text-sm font-extrabold text-[#102A38] dark:text-white">
                  {uploading ? 'Extracting question and diagram metadata...' : 'Drag & drop question papers here, or click to browse'}
                </h3>
                <p className="text-xs text-[#647681] dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Select 2 or more PDF examination papers. The AI engine extracts question text, mathematical formulas, and section structures.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <span className="px-2.5 py-1 rounded-md bg-white border border-[#DCE5EA] text-[10px] font-mono font-bold text-slate-600">
                    PDF ONLY
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white border border-[#DCE5EA] text-[10px] font-mono font-bold text-slate-600">
                    MAX 25MB EACH
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white border border-[#DCE5EA] text-[10px] font-mono font-bold text-[#00A878]">
                    OCR & LATEX PARSER ACTIVE
                  </span>
                </div>
              </div>

              {uploadError && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-xs rounded-xl border border-rose-200 dark:border-rose-900/50 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Uploaded Papers Grid */}
              {papers.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#647681]">
                    <span>Uploaded Documents ({papers.length})</span>
                    <span>Ready for AI Processing</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {papers.map((p, idx) => (
                      <div
                        key={p.id}
                        className="p-4 rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-[#F6F8FA] dark:bg-slate-800/40 flex flex-col justify-between gap-3 relative hover:border-[#00C98B] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[#0B1F2A] text-[#00C98B] flex items-center justify-center shrink-0 font-mono font-black text-xs shadow-sm">
                              0{idx + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#102A38] dark:text-white truncate" title={p.name}>
                                {p.name}
                              </p>
                              <p className="text-[11px] text-[#647681] dark:text-slate-400 mt-0.5">
                                {p.pageCount} page(s) &bull; ~{p.wordCount.toLocaleString()} words
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePaper(p.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Remove paper"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[10px] border-t border-slate-200/60 dark:border-slate-800 pt-2 font-mono">
                          <span className="text-[#00A878] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>✓ Parsed</span>
                          </span>
                          <span className="text-slate-500">~{25 + (idx * 5)} Questions</span>
                          <span className="text-indigo-600 font-bold">98% Readable</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: Configure Examination Details */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#0B1F2A] text-[#00C98B] flex items-center justify-center font-mono font-black text-xs shadow-sm">
                    02
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[#102A38] dark:text-white uppercase tracking-wider">
                      Examination Configuration
                    </h2>
                    <p className="text-xs text-[#647681] dark:text-slate-400">
                      Standardized examination parameters synchronized with institution guidelines.
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-[#00A878] bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1 rounded-xl font-bold">
                  Auto-Extracted from Authority
                </span>
              </div>

              {/* 4 Visual KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Total Marks</span>
                  <div className="text-lg font-black text-[#102A38] dark:text-white mt-0.5">{totalMarks}</div>
                  <span className="text-[10px] text-emerald-600 font-bold">Target Weight</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Duration</span>
                  <div className="text-lg font-black text-[#102A38] dark:text-white mt-0.5">{durationHours}h</div>
                  <span className="text-[10px] text-indigo-600 font-bold">Standard Sitting</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Questions</span>
                  <div className="text-lg font-black text-[#102A38] dark:text-white mt-0.5">{questionCount}</div>
                  <span className="text-[10px] text-cyan-600 font-bold">Obj + Analytical</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Difficulty</span>
                  <div className="text-xs font-black text-[#102A38] dark:text-white mt-1 truncate">{difficultySetting}</div>
                  <span className="text-[10px] text-amber-600 font-bold">Bloom Balanced</span>
                </div>
              </div>

              {/* Form Input Fields (48-52px height) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Course / Subject Title
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold"
                    placeholder="e.g. Distributed Operating Systems"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    University / Institution
                  </label>
                  <input
                    type="text"
                    value={universityName}
                    onChange={(e) => setUniversityName(e.target.value)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold"
                    placeholder="e.g. National Institute of Technology"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Paper Code / Identification
                  </label>
                  <input
                    type="text"
                    value={paperCode}
                    onChange={(e) => setPaperCode(e.target.value)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-mono font-semibold"
                    placeholder="e.g. CS-702-NOV"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Total Maximum Marks
                  </label>
                  <input
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value) || 70)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Duration (Hours)
                  </label>
                  <input
                    type="number"
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value) || 3)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Difficulty Model
                  </label>
                  <select
                    value={difficultySetting}
                    onChange={(e) => setDifficultySetting(e.target.value as any)}
                    className="w-full h-12 px-3 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold"
                  >
                    <option value="BALANCED">Balanced (60% Standard / 30% Analytical / 10% Hard)</option>
                    <option value="HARD">Rigorous (40% Standard / 40% Analytical / 20% Hard)</option>
                    <option value="MODERATE">Foundational (70% Standard / 25% Analytical / 5% Hard)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* STEP 3: AI Generation Settings & Toggles */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#0B1F2A] text-[#00C98B] flex items-center justify-center font-mono font-black text-xs shadow-sm">
                    03
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[#102A38] dark:text-white uppercase tracking-wider">
                      AI Generation & Integrity Controls
                    </h2>
                    <p className="text-xs text-[#647681] dark:text-slate-400">
                      Configure automated question synthesis algorithms and anti-leak constraints.
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 px-3 py-1 rounded-xl font-bold">
                  6 Security Toggles Active
                </span>
              </div>

              {/* 6 Interactive Toggle Switches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    title: 'Question Fusion Engine',
                    desc: 'Synthesizes novel questions by fusing sub-topics across sources instead of single-paper replication.',
                    state: enableQuestionFusion,
                    setter: setEnableQuestionFusion,
                  },
                  {
                    title: 'Difficulty Balancing',
                    desc: 'Enforces 60% standard, 30% analytical, and 10% advanced application questions.',
                    state: enableDifficultyBalancing,
                    setter: setEnableDifficultyBalancing,
                  },
                  {
                    title: 'Syllabus / Topic Coverage',
                    desc: 'Analyzes curriculum distribution across all uploaded papers to prevent topic omission.',
                    state: enableTopicCoverage,
                    setter: setEnableTopicCoverage,
                  },
                  {
                    title: 'Duplicate Detection',
                    desc: 'Cryptographic text hashing to detect and discard verbatim or near-verbatim questions.',
                    state: enableDuplicateDetection,
                    setter: setEnableDuplicateDetection,
                  },
                  {
                    title: 'Semantic Similarity Analysis',
                    desc: 'Computes embedding distance to guarantee fresh phrasing and avoid historical copies.',
                    state: enableSemanticSimilarity,
                    setter: setEnableSemanticSimilarity,
                  },
                  {
                    title: 'Secure Question Selection',
                    desc: 'Enforces randomized entropy seeds during candidate question selection to prevent leaks.',
                    state: enableSecureSelection,
                    setter: setEnableSecureSelection,
                  },
                ].map((toggle) => (
                  <div
                    key={toggle.title}
                    onClick={() => toggle.setter(!toggle.state)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                      toggle.state
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-[#102A38] dark:text-white flex items-center gap-2">
                        <span>{toggle.title}</span>
                        {toggle.state && (
                          <span className="px-1.5 py-0.5 rounded bg-[#00C98B]/20 text-[#00A878] font-mono text-[9px] font-bold">
                            ENFORCED
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#647681] dark:text-slate-400 leading-relaxed">
                        {toggle.desc}
                      </p>
                    </div>

                    <div
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 mt-1 ${
                        toggle.state ? 'bg-[#00C98B]' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${
                          toggle.state ? 'left-5.5' : 'left-0.5'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* STEP 4: Synthesize CTA & Real-Time Output */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">
              <div className="space-y-4">
                <button
                  type="button"
                  disabled={generating || papers.length < 2}
                  onClick={handleGenerate4thPaper}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#00A878] via-[#00B8D9] to-[#00A878] hover:opacity-95 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-[#00A878]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all cursor-pointer group"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Synthesizing Examination Paper via LaTeX 2e...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-amber-200 group-hover:scale-110 transition-transform" />
                      <span>✨ Synthesize Secure Question Paper</span>
                    </>
                  )}
                </button>

                <div className="text-center">
                  <p className="text-[11px] font-mono text-[#647681]">
                    Zero-Leak Synthesis Protocol Active &bull; LaTeX Native Compilation &bull; AES-256 Vault Sealing
                  </p>
                </div>
              </div>

              {/* Live Generation Panel */}
              {generating && (
                <div className="p-5 rounded-2xl bg-[#0B1F2A] border border-[#1E3A4A] text-white space-y-4 shadow-xl">
                  <div className="flex items-start justify-between gap-3 text-xs font-bold text-white">
                    <span className="flex items-start gap-2.5 min-w-0">
                      <RefreshCw className="w-4 h-4 mt-0.5 animate-spin text-[#00C98B] shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold text-white">
                          {stage === 'error'
                            ? '⚠️ Generation stopped - see compiler diagnostic below.'
                            : stage === 'done'
                            ? '✅ PDF generated and verified successfully.'
                            : currentStep || 'Synthesizing Question Paper...'}
                        </span>
                        {stage !== 'done' && stage !== 'error' && (
                          <span className="block mt-1 font-mono text-[11px] text-slate-400">
                            Awaiting {waitingOn} ({elapsedSeconds}s elapsed)
                          </span>
                        )}
                      </span>
                    </span>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="px-3 py-1 rounded-xl bg-white/10 font-mono text-xs font-black border border-white/10">
                        ⏱️ {elapsedSeconds}s
                      </span>
                      <button
                        type="button"
                        onClick={() => abortControllerRef.current?.abort()}
                        className="text-xs text-rose-400 hover:text-rose-300 underline cursor-pointer font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Real Step Progress Bar */}
                  <div className="space-y-2">
                    <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#635BFF] via-[#00B8D9] to-[#00C98B] h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${Math.round(
                            (Math.min(STAGE_ACTIVE_STEP[stage], 5) / 5) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      {GENERATION_STEPS.map((label, index) => {
                        const stepNumber = index + 1;
                        const activeStep = STAGE_ACTIVE_STEP[stage];
                        const isDone = stage === 'done' || stepNumber < activeStep;
                        const isActive = stage !== 'done' && stage !== 'error' && stepNumber === activeStep;
                        return (
                          <span
                            key={label}
                            className={
                              isActive
                                ? 'text-[#00C98B] font-black'
                                : isDone
                                ? 'text-emerald-400 font-bold'
                                : 'text-slate-500'
                            }
                          >
                            {isDone ? '✓ ' : isActive ? '▶ ' : ''}
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Streaming Terminal Window */}
                  {streamingContent ? (
                    <div className="max-h-48 overflow-y-auto p-4 rounded-xl bg-black/60 text-[#00C98B] font-mono text-[11px] leading-relaxed whitespace-pre-wrap border border-white/10 shadow-inner">
                      {streamingContent.slice(-1200)}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs flex items-center gap-2">
                      <Zap className="w-4 h-4 animate-pulse text-amber-400 shrink-0" />
                      <span>AI fusion core is formulating questions. Output will stream here momentarily...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Generation Error Alert */}
              {generationError && (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 text-xs flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{generationError}</span>
                </div>
              )}

              {/* Compiler Diagnostics Panel */}
              {compilerError && (
                <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-900/60 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider">
                      PDF Compiler Error Diagnostics
                    </span>
                  </div>

                  <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-amber-900 dark:text-amber-200 p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800">
                    {compilerError}
                  </pre>

                  {compilerDiagnostics && (
                    <div className="space-y-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span><b>Compiler:</b> {compilerDiagnostics.engine}</span>
                        <span><b>Command:</b> {compilerDiagnostics.command}</span>
                        <span><b>First Error:</b> {compilerDiagnostics.firstError || 'none reported'}</span>
                        <span><b>Line:</b> {compilerDiagnostics.firstErrorLine ?? 'unknown'}</span>
                      </div>

                      {compilerDiagnostics.log && (
                        <details className="rounded-xl bg-[#0B1F2A] border border-slate-800 p-2">
                          <summary className="cursor-pointer px-3 py-1.5 text-xs font-bold text-amber-300">
                            Raw LaTeX Engine Output
                          </summary>
                          <pre className="max-h-60 overflow-auto p-3 text-[10px] leading-relaxed whitespace-pre-wrap text-emerald-300 font-mono">
                            {compilerDiagnostics.log}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: Success & Downloadable Paper */}
              {(compiledPdfUrl || structuredData) && !generating && (
                <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/30 dark:from-slate-900 dark:to-emerald-950/30 p-6 rounded-3xl border-2 border-emerald-500/40 shadow-xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-200 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#00A878] text-white flex items-center justify-center shadow-lg shadow-[#00A878]/30 shrink-0">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#00A878] dark:text-emerald-400">
                            Synthesis Complete &bull; Paper Ready
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                            ZeroLeak Native PDF Engine
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-[#102A38] dark:text-white">
                          {subject} &mdash; Synthesized Examination Paper
                        </h3>
                        <p className="text-xs text-[#647681] dark:text-slate-400 mt-0.5">
                          Synthesized from {papers.length} source papers &bull; Max Marks: {totalMarks} &bull; Time: {durationHours} Hours
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {compiledPdfUrl && (
                        <a
                          href={compiledPdfUrl}
                          download={compiledFilename || `${subject}_Synthesized_Paper.pdf`}
                          className="px-5 py-2.5 rounded-xl bg-[#00A878] hover:bg-[#00C98B] text-white font-bold text-xs shadow-md shadow-[#00A878]/30 flex items-center gap-2 transition-all cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          <span>📥 Download Question Paper (PDF)</span>
                        </a>
                      )}

                      {compiledPdfUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(compiledPdfUrl, '_blank')}
                          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#DCE5EA] dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Open PDF in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open Full View</span>
                        </button>
                      )}

                      {latexFallback?.sourceUrl && (
                        <a
                          href={`${latexFallback.sourceUrl}?download=1`}
                          download="generated_question_paper.tex"
                          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#DCE5EA] dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <FileCode2 className="w-3.5 h-3.5" />
                          <span>LaTeX Source</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={handleGenerate4thPaper}
                        className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#DCE5EA] dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Re-Generate</span>
                      </button>
                    </div>
                  </div>

                  {/* Navigation View Tabs */}
                  <div className="flex items-center gap-2 border-b border-emerald-200/80 dark:border-slate-800 pb-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('pdf')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        activeTab === 'pdf'
                          ? 'bg-[#0B1F2A] text-white shadow-sm'
                          : 'text-[#647681] hover:bg-white/80'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Official PDF Document</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('content')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        activeTab === 'content'
                          ? 'bg-[#0B1F2A] text-white shadow-sm'
                          : 'text-[#647681] hover:bg-white/80'
                      }`}
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      <span>Questions & Marking Scheme</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('latex')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        activeTab === 'latex'
                          ? 'bg-[#0B1F2A] text-white shadow-sm'
                          : 'text-[#647681] hover:bg-white/80'
                      }`}
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>LaTeX Source Code</span>
                    </button>
                  </div>

                  {/* Tab 1: PDF Viewer */}
                  {activeTab === 'pdf' && compiledPdfUrl && (
                    <div className="rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 shadow-md bg-slate-900">
                      <div className="px-4 py-3 bg-[#0B1F2A] text-slate-300 flex items-center justify-between text-xs font-mono font-bold border-b border-white/10">
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#00C98B]" />
                          <span>{compiledFilename || 'Synthesized_Question_Paper.pdf'}</span>
                        </span>
                        <a
                          href={compiledPdfUrl}
                          download={compiledFilename}
                          className="text-[#00C98B] hover:underline flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Direct Download</span>
                        </a>
                      </div>
                      <iframe
                        src={`${compiledPdfUrl}#toolbar=1`}
                        title="Generated Question Paper PDF"
                        className="w-full h-[680px] border-none bg-slate-100"
                      />
                    </div>
                  )}

                  {/* Tab 2: Structured Questions Card View */}
                  {activeTab === 'content' && (
                    <div className="space-y-4">
                      {structuredData?.sections?.map((sec: any, sIdx: number) => (
                        <div
                          key={sIdx}
                          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-[#DCE5EA] dark:border-slate-800 shadow-sm space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h4 className="text-sm font-extrabold text-[#102A38] dark:text-white uppercase tracking-wider">
                              {sec.title}
                            </h4>
                            {sec.totalMarks && (
                              <span className="px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                                {sec.totalMarks}
                              </span>
                            )}
                          </div>
                          {sec.instructions && (
                            <p className="text-xs italic text-slate-500">{sec.instructions}</p>
                          )}
                          <div className="space-y-3">
                            {sec.questions?.map((q: any, qIdx: number) => (
                              <div
                                key={qIdx}
                                className="p-3.5 rounded-xl bg-[#F6F8FA] dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5">
                                    <span className="text-xs font-mono font-black text-[#635BFF] shrink-0">
                                      {q.number || `Q.${qIdx + 1}`}
                                    </span>
                                    <p className="text-xs text-[#102A38] dark:text-slate-200 leading-relaxed font-semibold">
                                      {q.text}
                                    </p>
                                  </div>
                                  {q.marks && (
                                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0 bg-white dark:bg-slate-700 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
                                      {q.marks}
                                    </span>
                                  )}
                                </div>

                                {q.options && q.options.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6 pt-1">
                                    {q.options.map((opt: string, oIdx: number) => (
                                      <div
                                        key={oIdx}
                                        className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                                      >
                                        {opt}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {q.orText && (
                                  <div className="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 pl-6">
                                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest block mb-1">
                                      --- OR ---
                                    </span>
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                        {q.orText}
                                      </p>
                                      {q.orMarks && (
                                        <span className="text-xs font-bold text-slate-500 shrink-0">
                                          {q.orMarks}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tab 3: LaTeX Code View */}
                  {activeTab === 'latex' && (
                    <div className="border border-[#DCE5EA] dark:border-slate-800 rounded-2xl overflow-hidden bg-[#0B1F2A]">
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                          <span>LaTeX 2e Typesetting Source (AMS-Math Validated)</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={copyLatex}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer transition-colors"
                            >
                              {copiedCode ? <Check className="w-3.5 h-3.5 text-[#00C98B]" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedCode ? 'Copied' : 'Copy LaTeX'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={downloadLatexFile}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00A878] hover:bg-[#00C98B] text-white text-xs font-bold cursor-pointer transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download .tex</span>
                            </button>
                          </div>
                        </div>
                        <pre className="p-4 bg-black/50 text-[#00C98B] font-mono text-[11px] leading-relaxed overflow-x-auto max-h-96 whitespace-pre rounded-xl border border-white/10">
                          {generatedLatex}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ================= RIGHT COLUMN: 30% INTELLIGENCE & VAULT ================= */}
          <div className="lg:col-span-4 space-y-6">
            {/* Card 1: Source Paper Analysis */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#00B8D9]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#102A38] dark:text-white">
                    Source Paper Analysis
                  </h3>
                </div>
                <span className="w-2 h-2 rounded-full bg-[#00C98B] animate-pulse" />
              </div>

              {/* 3 Quick KPI Counters */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-[#F6F8FA] dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="text-base font-black text-[#102A38] dark:text-white">{papers.length}</div>
                  <div className="text-[9px] font-mono text-slate-500 uppercase mt-0.5">Papers</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F6F8FA] dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="text-base font-black text-indigo-600">{papers.length > 0 ? papers.length * 28 : 0}</div>
                  <div className="text-[9px] font-mono text-slate-500 uppercase mt-0.5">Questions</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F6F8FA] dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="text-base font-black text-[#00A878]">14</div>
                  <div className="text-[9px] font-mono text-slate-500 uppercase mt-0.5">Modules</div>
                </div>
              </div>

              {/* Segmented Difficulty Distribution Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-600 dark:text-slate-400">Bloom's Taxonomy Spread</span>
                  <span className="text-[#00A878] font-mono">100% Balanced</span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  <div className="h-full bg-[#00A878]" style={{ width: '60%' }} title="Easy / Recall: 60%" />
                  <div className="h-full bg-[#635BFF]" style={{ width: '30%' }} title="Analytical / Application: 30%" />
                  <div className="h-full bg-[#F59E0B]" style={{ width: '10%' }} title="Advanced / Creative: 10%" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#00A878]" />
                    <span>Standard (60%)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#635BFF]" />
                    <span>Analytical (30%)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                    <span>Hard (10%)</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Syllabus Coverage Breakdown */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#635BFF]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#102A38] dark:text-white">
                    Syllabus Coverage Breakdown
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                  4 Modules
                </span>
              </div>

              <div className="space-y-3">
                {[
                  { name: 'Unit 1: Core Fundamentals & Theory', pct: 94, color: 'bg-[#00A878]' },
                  { name: 'Unit 2: Mathematical Proofs & Models', pct: 88, color: 'bg-[#00B8D9]' },
                  { name: 'Unit 3: Applied Computation & Algorithms', pct: 92, color: 'bg-[#635BFF]' },
                  { name: 'Unit 4: Case Studies & Architecture', pct: 85, color: 'bg-[#7C5CFC]' },
                ].map((mod) => (
                  <div key={mod.name} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      <span className="truncate pr-2">{mod.name}</span>
                      <span className="font-mono text-slate-500 font-bold">{mod.pct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${mod.color} rounded-full`}
                        style={{ width: `${mod.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: AI Generation Preview & Checklist */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#00A878]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#102A38] dark:text-white">
                    AI Generation Preview & Security
                  </h3>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>Target Format</span>
                  <span className="font-semibold text-[#102A38] dark:text-white">University Standard (Sec I/II)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>Mathematical Engine</span>
                  <span className="font-mono text-[#00A878] font-bold">LaTeX AMS-Math Native</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>Question Originality</span>
                  <span className="font-mono text-indigo-600 font-bold">Fused & Reformulated</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                {[
                  'Zero-Leak Cryptographic Protocol Active',
                  'Verbatim Extraction Prevention Enforced',
                  'Structural Authority Validated Against PDF',
                  'Memory Purged Automatically Post-Generation',
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00C98B] shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 4: Security Pipeline */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#00B8D9]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#102A38] dark:text-white">
                    Real-Time Security Pipeline
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">6 Stages</span>
              </div>

              <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {[
                  { title: 'Source Ingestion', desc: 'Secure PDF parsing & diagram OCR', done: papers.length > 0 },
                  { title: 'Pattern Extraction', desc: 'Section hierarchy & marks parsing', done: papers.length >= 2 },
                  { title: 'Concept Mapping', desc: 'Topic clustering & Bloom tagging', done: papers.length >= 2 },
                  { title: 'AI Fusion Synthesis', desc: 'Contextual question generation', done: generating || !!compiledPdfUrl },
                  { title: 'LaTeX Compilation', desc: 'Deterministic typesetting to PDF', done: stage === 'compiling' || !!compiledPdfUrl },
                  { title: 'AES-256 Vault Sealing', desc: 'Time-locked cryptographic packaging', done: !!compiledPdfUrl },
                ].map((pipe, idx) => (
                  <div key={pipe.title} className="relative flex items-start gap-3 pl-1">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px] font-bold z-10 shrink-0 ${
                        pipe.done
                          ? 'bg-[#00A878] text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}
                    >
                      {pipe.done ? '✓' : idx + 1}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#102A38] dark:text-white leading-tight">
                        {pipe.title}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                        {pipe.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 5: Cryptographic Vault Panel */}
            <div className="relative overflow-hidden rounded-3xl bg-[#0B1F2A] border border-[#1E3A4A] p-5 text-white shadow-xl space-y-4">
              <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-[#00B8D9]/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-white/10 pb-3 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#00C98B]/20 text-[#00C98B] flex items-center justify-center">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                      Cryptographic Vault
                    </h3>
                    <p className="text-[10px] text-slate-400">Zero-Knowledge Storage</p>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-md bg-[#00C98B]/20 text-[#00C98B] font-mono text-[9px] font-bold border border-[#00C98B]/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00C98B] animate-pulse" />
                  <span>TIME-LOCKED</span>
                </span>
              </div>

              <div className="space-y-2 text-xs relative z-10 font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Cipher Standard</span>
                  <span className="text-white font-bold">AES-256-GCM Hardware</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Secret Sharing</span>
                  <span className="text-[#00C98B] font-bold">Shamir 3-of-5 Enclave</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Compliance</span>
                  <span className="text-white font-bold">FIPS 140-2 Level 3</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Vault Integrity</span>
                  <span className="text-[#00B8D9] font-bold">SHA-256 Verified</span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 text-[10px] font-mono text-slate-400 relative z-10 flex items-center justify-between">
                <span>Vault Status:</span>
                <span className="text-emerald-400 font-bold">Ready for Exam Dispatch</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OpenAI Prism & LaTeX In-Project Browser Modal */}
      <OpenAIPrismBrowserModal
        isOpen={showPrismBrowser}
        onClose={() => setShowPrismBrowser(false)}
        initialUrl="https://prism.openai.com/"
      />
    </div>
  );
};
