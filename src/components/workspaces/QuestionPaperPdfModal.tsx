import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Printer,
  X,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  Layers,
  ChevronDown,
  Download,
  KeyRound,
  AlertCircle,
  Zap,
  Wand2,
  Bot,
  Send,
  Copy,
  Check,
  Loader2,
  ChevronUp,
  Square,
  ListChecks,
  Paperclip
} from 'lucide-react';
import { api, ollamaChatStream } from '../../api';
import { Examination, PaperVersion } from '../../types';

interface QuestionPaperPdfModalProps {
  exam: Examination;
  initialVersionId?: string;
  onClose: () => void;
}

export const QuestionPaperPdfModal: React.FC<QuestionPaperPdfModalProps> = ({
  exam,
  initialVersionId,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paperData, setPaperData] = useState<{
    version: any;
    questions: any[];
    allVersions?: any[];
    exam: Examination;
  } | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(initialVersionId || '');
  const printRef = useRef<HTMLDivElement>(null);
  const fetchSequenceRef = useRef(0);

  const fetchPaper = async (versionId?: string) => {
    const fetchSequence = ++fetchSequenceRef.current;
    setLoading(true);
    setError(null);
    try {
      if (versionId) {
        const res = await api.getPaperVersionDetails(exam.id, versionId);
        if (fetchSequence !== fetchSequenceRef.current) return;
        if (res.success) {
          setPaperData({
            version: res.version,
            questions: res.questions,
            exam: res.exam || exam,
          });
          setSelectedVersionId(res.version.id);
        } else {
          setError('Failed to load selected version.');
        }
      } else {
        const res = await api.getCurrentPaper(exam.id);
        if (fetchSequence !== fetchSequenceRef.current) return;
        if (res.success) {
          setPaperData({
            version: res.version,
            questions: res.questions,
            allVersions: res.allVersions,
            exam: res.exam || exam,
          });
          setSelectedVersionId(res.version.id);
        } else {
          setError('No paper available for this examination.');
        }
      }
    } catch (err: any) {
      if (fetchSequence !== fetchSequenceRef.current) return;
      console.error('Failed to load paper for PDF modal', err);
      setError(err.message || 'Failed to load question paper.');
    } finally {
      if (fetchSequence === fetchSequenceRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaper(initialVersionId);
  }, [exam.id, initialVersionId]);

  const [compilingEngine, setCompilingEngine] = useState<'texapi' | 'latexonline' | 'formatex' | null>(null);

  // --- Local LaTeX assistant (Ollama) -------------------------------------
  // Injects the FULL structure of the active question paper (questions, marks,
  // sections, header details) so the model can reproduce the exact layout in LaTeX
  // rather than producing a generic skeleton.

  /**
   * Serialises the active paperData into a compact, token-efficient description
   * that tells the model exactly what questions exist, their marks, and structure.
   * This is the key to getting LaTeX output that matches the uploaded paper.
   */
  const buildPaperContext = (): string => {
    if (!paperData) return '';

    const exam_ = paperData.exam;
    const version = paperData.version;
    const questions: any[] = paperData.questions || [];

    const mcqs = questions.filter(
      (q: any) => q.question_type === 'MCQ' || (Array.isArray(q.options) && q.options.length >= 2)
    );
    const theories = questions.filter(
      (q: any) => q.question_type !== 'MCQ' && (!q.options || q.options.length < 2)
    );

    const lines: string[] = [];
    lines.push(`PAPER TITLE: ${exam_.name || 'Examination'}`);
    lines.push(`SUBJECT: ${exam_.subject || 'General'}`);
    lines.push(`PAPER CODE: ${version?.paper_code || 'N/A'}`);
    lines.push(`TOTAL QUESTIONS: ${questions.length} (${mcqs.length} MCQ, ${theories.length} Theory)`);

    if (mcqs.length > 0) {
      lines.push('');
      lines.push('=== SECTION 1: OBJECTIVE / MCQ ===');
      mcqs.forEach((q: any, i: number) => {
        const opts = Array.isArray(q.options)
          ? q.options
              .map((o: any, j: number) => {
                const label = String.fromCharCode(65 + j);
                const text = typeof o === 'string' ? o : o?.text ?? '';
                return `  ${label}) ${text}`;
              })
              .join('\n')
          : '';
        lines.push(`Q${i + 1}. [${q.marks || 1} mark] ${q.content_text || ''}`);
        if (opts) lines.push(opts);
        if (q.correct_answer) lines.push(`  Answer: ${q.correct_answer}`);
      });
    }

    if (theories.length > 0) {
      lines.push('');
      lines.push('=== SECTION 2: THEORY / DESCRIPTIVE ===');
      theories.forEach((q: any, i: number) => {
        const num = mcqs.length + i + 1;
        lines.push(`Q${num}. [${q.marks || 5} marks] ${q.content_text || ''}`);
        if (q.correct_answer) lines.push(`  Hint: ${q.correct_answer}`);
      });
    }

    return lines.join('\n');
  };

  const paperContextBlock = buildPaperContext();

  const CHAT_SYSTEM_PROMPT = [
    'You are a professional LaTeX exam-paper typesetter. Your output must compile on the FIRST try with zero errors.',
    `Subject: "${exam.subject || 'Examination'}"`,
    '',
    '=== STRICT COMPILATION RULES (violations cause errors) ===',
    'RULE A — NEVER write \\\\ immediately before [ on the same or next line.',
    '  BAD:  Some text \\\\ [Max. Marks : 30]',
    '  GOOD: Some text \\hfill [Max. Marks : 30] \\\\',
    '  WHY:  LaTeX reads \\\\[...] as a vertical-space command and crashes when it finds text instead of a length.',
    'RULE B — NEVER use \\textsc{} inside a tabularx X-column without wrapping in \\parbox.',
    'RULE C — NEVER leave a \\begin{} without a matching \\end{}.',
    'RULE D — Use \\hfill to push marks to the right margin — do NOT use \\\\ then [marks] on a new line.',
    'RULE E — In enumerate/itemize, marks go INSIDE the \\item text: \\item Question text \\hfill [5]',
    'RULE F — Always put \\setlength{\\parindent}{0pt} in the preamble.',
    'RULE G — Output ONLY the fenced code block ```latex ... ``` with NO prose before or after.',
    '',
    '=== PROVEN SAFE SKELETON TO FOLLOW ===',
    '```',
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[top=1.5cm,bottom=1.5cm,left=2cm,right=2cm]{geometry}',
    '\\usepackage{amsmath,amssymb,enumitem,fancyhdr,tabularx,xcolor,multicol,booktabs}',
    '\\setlength{\\parindent}{0pt}',
    '\\pagestyle{fancy}',
    '\\fancyhf{}',
    '\\renewcommand{\\headrulewidth}{0pt}',
    '\\begin{document}',
    '',
    '% --- Header table: Seat No left, Paper Code right ---',
    '\\begin{tabular*}{\\textwidth}{@{}l@{\\extracolsep{\\fill}}r@{}}',
    '  \\textbf{Seat No.:} \\underline{\\hspace{3cm}} & \\textbf{Paper Code: SLR-XX-000}',
    '\\end{tabular*}',
    '\\vspace{0.3cm}',
    '',
    '% --- Title block centred ---',
    '\\begin{center}',
    '  {\\large\\bfseries University Name} \\\\[2pt]',
    '  {\\normalsize S.Y.~(B.Tech.) Examination --- Month Year} \\\\[2pt]',
    '  {\\normalsize\\bfseries Subject Name} \\\\[2pt]',
    '  {\\small Time: 3 Hours \\hfill Max. Marks: 70}',
    '\\end{center}',
    '\\hrule',
    '\\vspace{0.3cm}',
    '',
    '% --- Instructions ---',
    '\\textbf{Instructions:}',
    '\\begin{enumerate}[label=\\arabic*.]',
    '  \\item Answer Q.1 or Q.2, Q.3 or Q.4, etc.',
    '  \\item Neat diagrams must be drawn wherever necessary.',
    '  \\item Figures to the right side indicate full marks.',
    '\\end{enumerate}',
    '\\vspace{0.3cm}',
    '',
    '% --- MCQ Section ---',
    '\\noindent\\textbf{Q.1} Choose the correct alternative. \\hfill [14]',
    '\\begin{multicols}{2}',
    '\\begin{enumerate}[label=\\alph*)]',
    '  \\item Question text here. \\hfill [1]',
    '\\end{enumerate}',
    '\\end{multicols}',
    '',
    '% --- Theory questions ---',
    '\\noindent\\textbf{Q.2} Question text. \\hfill [5] \\\\',
    '\\textbf{OR}\\\\',
    '\\noindent\\textbf{Q.2} Alternative question text. \\hfill [5]',
    '',
    '\\end{document}',
    '```',
    '',
    '=== MARKS FORMATTING — ALWAYS use \\hfill ===',
    '  \\item Some question text \\hfill [5]   <- CORRECT',
    '  \\\\ [5]                                <- WRONG - this crashes LaTeX',
    '',
    paperContextBlock
      ? `=== PAPER CONTENT TO REPRODUCE EXACTLY ===\n${paperContextBlock}`
      : '=== Reproduce this exam paper exactly as described. ===',
  ].join('\n');



  // Separate prompt for the "solve the paper" mode. It must not inherit the LaTeX-writing
  // instructions above, or the model tries to emit a whole document per question — slow
  // and useless when what you want is the answer. Bounded length matters: this machine
  // generates at roughly 3 tokens/sec, so ~120 words keeps each answer near a minute.
  const SOLVER_SYSTEM_PROMPT = [
    'You are an exam answer assistant for the subject',
    `"${exam.subject || 'the exam'}".`,
    'You will be given ONE examination question at a time. Answer only that question.',
    'Be direct and concise: at most 90 words.',
    'For a multiple-choice question, state the correct option letter first, then one',
    'sentence of justification.',
    'If the question is under-specified, or you are genuinely unsure of the answer, say so',
    'plainly rather than guessing — a wrong answer presented confidently is worse than an',
    'admission of uncertainty.',
    'Do not restate the question, do not write LaTeX documents, and do not use code fences.',
  ].join(' ');

  /**
   * Batched prompt for multiple-choice questions.
   *
   * Generation runs at ~10 tokens/sec here and every request costs ~1.7s of fixed
   * overhead, so answering six MCQs in one request measures ~9s against ~29s one at a
   * time. Terse output is what buys the rest: a 2-token answer takes 1.9s where a
   * 46-token explanation takes 4.8s.
   */
  const MCQ_BATCH_SYSTEM_PROMPT = [
    'You are an exam answer assistant.',
    'You will be given several numbered multiple-choice questions.',
    'Answer every single one. Reply with exactly one line per question, in the form',
    '"<number>: <option letter> - <reason of 12 words or fewer>".',
    'No preamble, no restating the questions, no skipped questions.',
    'If you are genuinely unsure, give your best option and end that line with " (unsure)".',
  ].join(' ');

  const MCQ_BATCH_SIZE = 6;

  const isMcqQuestion = (q: any) =>
    q?.question_type === 'MCQ' || (Array.isArray(q?.options) && q.options.length >= 2);

  /** One compact line for a batched MCQ request: the stem plus its options. */
  const formatMcqLine = (q: any, number: number) => {
    const opts = Array.isArray(q?.options)
      ? q.options
          .map((o: any, i: number) => {
            const label = typeof o === 'string' ? String.fromCharCode(97 + i) : o?.label || String.fromCharCode(97 + i);
            const text = typeof o === 'string' ? o : o?.text ?? o?.value ?? '';
            return `${label}) ${text}`;
          })
          .join('  ')
      : '';
    return `${number}. ${q?.content_text || ''}${opts ? `\n   ${opts}` : ''}`;
  };

  /** Flattens one stored question into a compact prompt for a single-answer request. */
  const buildQuestionPrompt = (q: any, index: number, total: number) => {
    const marks = q?.marks ? ` (${q.marks} marks)` : '';
    const type = q?.question_type ? ` [${q.question_type}]` : '';
    const optionLines = Array.isArray(q?.options) && q.options.length
      ? '\nOptions:\n' +
        q.options
          .map((opt: any, i: number) => {
            const label = typeof opt === 'string' ? String.fromCharCode(97 + i) : opt?.label || String.fromCharCode(97 + i);
            const text = typeof opt === 'string' ? opt : opt?.text ?? opt?.value ?? '';
            return `${label}) ${text}`;
          })
          .join('\n')
      : '';
    return `Question ${index + 1} of ${total}${marks}${type}:\n${q?.content_text || ''}${optionLines}`;
  };

  type ChatMsg = { role: 'user' | 'assistant'; content: string };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  /** Set while "Solve all questions" is iterating, so the status line can show progress. */
  const [solveProgress, setSolveProgress] = useState<{ done: number; total: number } | null>(null);

  // --- Uploaded PDFs ------------------------------------------------------
  // Text is extracted server-side by /api/pdf/extract-text (pdf-parse, every page) and
  // injected into each message, so several documents can be read at once. Ollama loads
  // with a 16,384-token window and silently discards anything past it, so what gets
  // injected is capped and the user is told when it had to be cut.
  type ChatDoc = { id: string; name: string; text: string; pages: number; chars: number };
  const [chatDocs, setChatDocs] = useState<ChatDoc[]>([]);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  /** ~6k tokens of the 16,384 window, leaving room for the prompt, history and the reply. */
  const DOC_CONTEXT_BUDGET_CHARS = 24000;
  const [chatInput, setChatInput] = useState('');
  const [chatCopied, setChatCopied] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content: paperData
        ? 'I can see this paper\'s questions. Say **"give me the LaTeX code"** and I will generate a complete, compilable LaTeX document matching this paper\'s structure. You can also attach a PDF above to include its text.'
        : 'Do you want LaTeX code for this paper? Say "yes, give me the LaTeX code" and I will write it. You can also attach a PDF above to help me match the exact format.',
    },
  ]);

  /** Lets the Stop button cancel an in-flight generation. */
  const chatAbortRef = useRef<AbortController | null>(null);

  // Prompt processing runs at roughly 24 tokens/sec on a CPU-only machine, so the whole
  // transcript is re-read on every turn. Capping it is what keeps later turns responsive;
  // the system prompt is re-sent regardless.
  const CHAT_HISTORY_LIMIT = 6;

  /** Patches the trailing assistant message — used by both chat and answer-all streaming. */
  const patchLastReply = (updater: (current: string) => string) =>
    setChatMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: updater(last.content) };
      return copy;
    });

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const next: ChatMsg[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(next);
    setChatInput('');
    setChatBusy(true);

    // Append the assistant bubble empty, then patch it as tokens arrive. This is what
    // makes the reply appear progressively instead of landing all at once at the end.
    setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const docs = buildDocsContext();

      // Build the combined system prompt. The paper-context block (from paperData)
      // is already embedded in CHAT_SYSTEM_PROMPT. Uploaded PDF text is appended
      // here — injected as part of the system role so small local models (qwen2.5:3b)
      // honour it rather than ignoring a separate "assistant" context bubble.
      let systemContent = CHAT_SYSTEM_PROMPT;
      if (docs.block) {
        systemContent +=
          '\n\nADDITIONAL UPLOADED DOCUMENT TEXT (use this verbatim for any missing question text):\n' +
          docs.block;
      }

      // plainText: LaTeX contains backslashes and newlines, which do not survive
      // being embedded in a JSON string by a small local model.
      await ollamaChatStream(
        {
          messages: [
            { role: 'system', content: systemContent },
            ...next.slice(-CHAT_HISTORY_LIMIT),
          ],
          plainText: true,
        },
        (delta) => patchLastReply((current) => current + delta),
        controller.signal
      );
    } catch (err: any) {
      if (controller.signal.aborted) {
        // A partial answer is still useful, so keep it rather than discarding the work.
        patchLastReply((current) => (current ? `${current}\n\n[stopped]` : '[stopped before any output]'));
      } else {
        patchLastReply((current) =>
          current
            ? `${current}\n\n[interrupted: ${err?.message || err}]`
            : `Could not reach the local model: ${err?.message || err}`
        );
      }
    } finally {
      chatAbortRef.current = null;
      setChatBusy(false);
    }
  };


  /**
   * Answers every question on the paper, one request per question.
   *
   * Deliberately NOT a single "answer the whole paper" prompt. This machine generates at
   * roughly 3 tokens/sec, so a combined reply would take 20-45 minutes and be cut off by
   * the output cap before it finished. One question per request keeps each answer near a
   * minute, keeps every prompt small enough to process quickly, and streams each answer
   * into the transcript the moment it is ready.
   */
  const solveAllQuestions = async () => {
    const questions = paperData?.questions ?? [];
    if (!questions.length || chatBusy) return;

    setChatBusy(true);
    const controller = new AbortController();
    chatAbortRef.current = controller;

    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: `Answer all ${questions.length} questions on this paper.` },
    ]);

    try {
      // Work in units rather than question-by-question: consecutive MCQs are answered in
      // batches (one request each), while theory questions get a request of their own.
      // At ~10 generated tokens/sec with ~1.7s of fixed cost per request, this is the
      // difference between roughly four minutes and well under two for a full paper.
      type Unit = { kind: 'mcq'; items: { q: any; index: number }[] } | { kind: 'theory'; q: any; index: number };
      const units: Unit[] = [];
      let pendingMcqs: { q: any; index: number }[] = [];

      const flushMcqs = () => {
        for (let i = 0; i < pendingMcqs.length; i += MCQ_BATCH_SIZE) {
          units.push({ kind: 'mcq', items: pendingMcqs.slice(i, i + MCQ_BATCH_SIZE) });
        }
        pendingMcqs = [];
      };

      questions.forEach((q: any, index: number) => {
        if (isMcqQuestion(q)) {
          pendingMcqs.push({ q, index });
        } else {
          flushMcqs();
          units.push({ kind: 'theory', q, index });
        }
      });
      flushMcqs();

      let answeredCount = 0;
      for (const unit of units) {
        if (controller.signal.aborted) break;

        if (unit.kind === 'mcq') {
          const numbers = unit.items.map((it) => it.index + 1);
          setSolveProgress({ done: answeredCount, total: questions.length });
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Q${numbers.join(', Q')}. ` },
          ]);
          await ollamaChatStream(
            {
              messages: [
                { role: 'system', content: MCQ_BATCH_SYSTEM_PROMPT },
                {
                  role: 'user',
                  content: unit.items.map((it) => formatMcqLine(it.q, it.index + 1)).join('\n\n'),
                },
              ],
              plainText: true,
            },
            (delta) => patchLastReply((current) => current + delta),
            controller.signal
          );
          answeredCount += unit.items.length;
        } else {
          setSolveProgress({ done: answeredCount, total: questions.length });
          setChatMessages((prev) => [...prev, { role: 'assistant', content: `Q${unit.index + 1}. ` }]);
          await ollamaChatStream(
            {
              messages: [
                { role: 'system', content: SOLVER_SYSTEM_PROMPT },
                { role: 'user', content: buildQuestionPrompt(unit.q, unit.index, questions.length) },
              ],
              plainText: true,
            },
            (delta) => patchLastReply((current) => current + delta),
            controller.signal
          );
          answeredCount += 1;
        }
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        patchLastReply((current) => `${current}\n\n[stopped: ${err?.message || err}]`);
      }
    } finally {
      chatAbortRef.current = null;
      setSolveProgress(null);
      setChatBusy(false);
    }
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('the file could not be read'));
      reader.readAsDataURL(file);
    });

  /**
   * Extracts the full text of every selected PDF and attaches it. Handles multiple files in
   * one go and reports per-file failures instead of failing the whole batch — one scanned
   * PDF should not stop the others from being read.
   */
  const handleDocUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setDocBusy(true);
    setDocError(null);

    const added: ChatDoc[] = [];
    const failures: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await api.extractPdfText({ file_data: dataUrl, file_name: file.name });
        const text = (res?.text || '').trim();
        if (!text) {
          // A PDF with no text layer is a scan; pdf-parse returns nothing for it.
          failures.push(`${file.name}: no selectable text (scanned PDF — needs OCR)`);
          continue;
        }
        added.push({
          id: `${file.name}-${added.length}-${Date.now()}`,
          name: file.name,
          text,
          pages: res.pageCount || 0,
          chars: text.length,
        });
      } catch (err: any) {
        failures.push(`${file.name}: ${err?.message || err}`);
      }
    }

    if (added.length) {
      setChatDocs((prev) => {
        const updated = [...prev, ...added];
        // Auto-trigger LaTeX generation as soon as the PDF text is ready.
        // The user uploads a paper expecting code — prompt on their behalf so
        // they do not have to type anything after attaching the document.
        if (!chatBusy) {
          // Fire after state settles (next tick) so buildDocsContext picks up the new docs.
          setTimeout(() => {
            setChatInput('Generate complete, well-structured LaTeX code for this uploaded question paper. Match the exact layout: seat-no box, paper code, title, instructions, and every question with marks exactly as printed.');
          }, 50);
        }
        return updated;
      });
    }
    if (failures.length) setDocError(failures.join(' · '));
    setDocBusy(false);
    if (docInputRef.current) docInputRef.current.value = '';
  };


  /** Concatenates attached documents for the prompt, capped so Ollama cannot silently truncate. */
  const buildDocsContext = () => {
    if (!chatDocs.length) return { block: '', truncated: false, included: 0 };
    let block = '';
    let truncated = false;
    for (const doc of chatDocs) {
      const header = `\n\n===== DOCUMENT: ${doc.name} (${doc.pages} page${doc.pages === 1 ? '' : 's'}) =====\n`;
      const remaining = DOC_CONTEXT_BUDGET_CHARS - block.length;
      if (remaining <= header.length + 1) {
        truncated = true;
        break;
      }
      const body = doc.text.slice(0, remaining - header.length);
      if (body.length < doc.text.length) truncated = true;
      block += header + body;
    }
    return { block, truncated, included: block.length };
  };

  // Distinguishes "the model is still reading the prompt" from "tokens are arriving", so
  // the status line tells the truth during a generation that can run for minutes.
  const lastChatMsg = chatMessages[chatMessages.length - 1];
  const replyIsStreaming = chatBusy && lastChatMsg?.role === 'assistant' && !!lastChatMsg.content;

  const copyBlock = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setChatCopied(idx);
      setTimeout(() => setChatCopied(null), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context) - ignore */
    }
  };

  /** Split a reply into prose and ```latex fenced blocks. */
  const renderChatContent = (content: string) => {
    const parts = content.split(/```(?:latex|tex)?\n?/i);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const code = part.replace(/```\s*$/, '').trim();
        return (
          <div key={i} className="my-1.5 rounded-lg overflow-hidden border border-slate-700">
            <div className="flex items-center justify-between px-2 py-1 bg-slate-800 text-[10px] font-bold text-slate-300">
              <span>LaTeX</span>
              <button
                type="button"
                onClick={() => copyBlock(code, i)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700 cursor-pointer"
              >
                {chatCopied === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{chatCopied === i ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-2 bg-slate-900 text-emerald-200 text-[10px] leading-relaxed overflow-x-auto max-h-64 whitespace-pre">
              {code}
            </pre>
          </div>
        );
      }
      const prose = part.replace(/```\s*$/, '').trim();
      return prose ? <p key={i} className="whitespace-pre-wrap">{prose}</p> : null;
    });
  };
  // ------------------------------------------------------------------------

  const handleDownloadLatex = async (preferEngine: 'texapi' | 'latexonline' | 'formatex' = 'latexonline') => {
    setCompilingEngine(preferEngine);
    try {
      const setLetter = paperData?.version?.version_code?.includes('SET-2')
        ? 'Q'
        : paperData?.version?.version_code?.includes('SET-3')
        ? 'R'
        : paperData?.version?.version_code?.includes('SET-4')
        ? 'S'
        : 'P';
      // The TexAPI action regenerates the paper first, so the PDF follows the
      // pattern of the uploaded question paper. Regeneration is kept as its own
      // endpoint because it re-encrypts and re-versions the paper (AES-GCM +
      // RSA + Shamir shares) - calling it keeps one source of truth for that
      // path instead of reimplementing the crypto here.
      if (preferEngine === 'texapi') {
        try {
          await api.generatePaper(exam.id, {});
        } catch (genErr: any) {
          // A 422 means the stored pattern could not be satisfied from the
          // question bank. Say so rather than rendering a paper that silently
          // ignores the pattern.
          const shortfalls = genErr?.validationErrors ?? genErr?.response?.validationErrors;
          alert(
            Array.isArray(shortfalls) && shortfalls.length
              ? `The uploaded paper's pattern could not be filled from the question bank:\n\n- ${shortfalls.join('\n- ')}`
              : `Could not regenerate the paper from the uploaded pattern: ${genErr?.message || genErr}`
          );
          return;
        }
      }

      const res = await api.compileFormatexPdf(exam.id, { setLetter, preferEngine });
      if (res.success && res.pdfUrl) {
        window.open(res.pdfUrl, '_blank');
      } else {
        alert(res.error || 'LaTeX compilation failed.');
      }
    } catch (err: any) {
      alert(`LaTeX Error: ${err.message}`);
    } finally {
      setCompilingEngine(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Container */}
      <div className="bg-white text-slate-900 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Control Bar (Hidden during window.print()) */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white">Official Question Paper PDF</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                  PDF READY
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ⚡ DUAL LATEX PDF
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-md">
                {paperData?.version?.version_code || exam.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Version Switcher */}
            {paperData?.allVersions && paperData.allVersions.length > 1 && (
              <select
                value={selectedVersionId}
                onChange={(e) => {
                  setSelectedVersionId(e.target.value);
                  fetchPaper(e.target.value);
                }}
                className="bg-slate-800 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
              >
                {paperData.allVersions.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.version_code} {v.is_current ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            )}

            {/* LaTeX.Online PDF Download Button */}
            <button
              type="button"
              onClick={() => handleDownloadLatex('latexonline')}
              disabled={compilingEngine === 'latexonline'}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              title="Compile and Download High-Fidelity LaTeX PDF via LaTeX.Online (latexonline.cc)"
            >
              <Zap className={`w-3.5 h-3.5 ${compilingEngine === 'latexonline' ? 'animate-spin' : ''}`} />
              <span>{compilingEngine === 'latexonline' ? 'Compiling...' : '⚡ LaTeX.Online PDF'}</span>
            </button>

            {/* FormaTeX Cloud PDF Download Button */}
            <button
              type="button"
              onClick={() => handleDownloadLatex('formatex')}
              disabled={compilingEngine === 'formatex'}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              title="Compile and Download High-Fidelity LaTeX PDF via FormaTeX Cloud Engine"
            >
              <Zap className={`w-3.5 h-3.5 ${compilingEngine === 'formatex' ? 'animate-spin' : ''}`} />
              <span>{compilingEngine === 'formatex' ? 'Compiling...' : '⚡ FormaTeX PDF'}</span>
            </button>

            {/* Answer Key Toggle */}
            <button
              type="button"
              onClick={() => setShowAnswerKey(!showAnswerKey)}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all ${
                showAnswerKey
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title="Toggle Answer Key display"
            >
              {showAnswerKey ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showAnswerKey ? 'Answer Key ON' : 'Answer Key OFF'}</span>
            </button>

            {/* Print / Save PDF Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TexAPI action - kept on its own row, separate from the two re-render
            buttons above, because it does more than re-render: it rebuilds the
            paper from the uploaded question paper's pattern first. */}
        <div className="px-3.5 sm:px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white shrink-0">
              <Wand2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-emerald-900">
                Generate from Uploaded Pattern
              </div>
              <div className="text-[11px] text-emerald-700 leading-snug">
                Rebuilds this paper to follow the pattern of your uploaded question paper, then
                compiles it via TexAPI Cloud.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadLatex('texapi')}
            disabled={compilingEngine === 'texapi'}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 shrink-0"
            title="Regenerate this paper from the uploaded question paper's pattern, then compile it via TexAPI Cloud"
          >
            <Zap className={`w-3.5 h-3.5 ${compilingEngine === 'texapi' ? 'animate-spin' : ''}`} />
            <span>{compilingEngine === 'texapi' ? 'Regenerating & compiling...' : '⚡ TexAPI PDF'}</span>
          </button>
        </div>

        {/* Local LaTeX assistant (Ollama). Runs against the local model - no
            quota, no cost. Collapsed by default so it stays out of the way. */}
        <div className="border-b border-slate-800 bg-slate-900 print:hidden shrink-0">
          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            className="w-full px-3.5 sm:px-4 py-2 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
                <Bot className="w-4 h-4" />
              </span>
              <span className="text-xs font-extrabold text-slate-200">LaTeX Assistant</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                local · Ollama
              </span>
            </span>
            <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${chatOpen ? '' : 'rotate-180'}`} />
          </button>

          {chatOpen && (
            <div className="px-3.5 sm:px-4 pb-3 space-y-2">
              {/* PDF attachments. Multiple files allowed; the full text of each is read
                  server-side and sent with every message. */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => handleDocUpload(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  disabled={docBusy || chatBusy}
                  title="Attach one or more PDFs — the full text of each is read and sent with your message"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-40"
                >
                  {docBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                  <span>{docBusy ? 'Reading PDFs…' : 'Attach PDFs'}</span>
                </button>

                {chatDocs.map((doc) => (
                  <span
                    key={doc.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-slate-300"
                    title={`${doc.chars.toLocaleString()} characters read`}
                  >
                    <FileText className="w-3 h-3 text-violet-300 shrink-0" />
                    <span className="max-w-[11rem] truncate">{doc.name}</span>
                    <span className="text-slate-500">
                      {doc.pages}p · {(doc.chars / 1000).toFixed(0)}k
                    </span>
                    <button
                      type="button"
                      onClick={() => setChatDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                      title="Remove this document"
                      className="hover:text-rose-400 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {docError && <p className="text-[10px] text-rose-400 leading-snug">{docError}</p>}
              {chatDocs.length > 0 && buildDocsContext().truncated && (
                <p className="text-[10px] text-amber-500/90 leading-snug">
                  Attached text is long, so only the first ~{DOC_CONTEXT_BUDGET_CHARS.toLocaleString()} characters
                  are sent. Remove a document, or ask about a narrower part of it.
                </p>
              )}

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`text-[11px] rounded-lg px-2.5 py-2 leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-violet-600 text-white ml-8'
                        : 'bg-slate-800 text-slate-200 mr-8 border border-slate-700'
                    }`}
                  >
                    {m.role === 'user' ? m.content : renderChatContent(m.content)}
                  </div>
                ))}
                {chatBusy && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mr-8">
                    {replyIsStreaming ? (
                      <span className="inline-block w-1.5 h-3 bg-violet-400 rounded-sm animate-pulse" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>
                      {solveProgress
                        ? `Answering question ${solveProgress.done + 1} of ${solveProgress.total}…`
                        : replyIsStreaming
                        ? 'Generating locally…'
                        : 'Reading the prompt…'}
                    </span>
                    <button
                      type="button"
                      onClick={() => chatAbortRef.current?.abort()}
                      title="Stop generating and keep what has been written so far"
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-600 hover:bg-slate-700 text-slate-300 cursor-pointer transition-colors"
                    >
                      <Square className="w-2.5 h-2.5" />
                      <span>Stop</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendChat();
                  }}
                  disabled={chatBusy}
                  placeholder='Try "yes, give me the LaTeX code"'
                  className="flex-1 bg-slate-800 text-slate-100 placeholder-slate-500 text-xs px-3 py-2 rounded-lg border border-slate-700 outline-none focus:border-violet-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={sendChat}
                  disabled={chatBusy || !chatInput.trim()}
                  className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
                <button
                  type="button"
                  onClick={solveAllQuestions}
                  disabled={chatBusy || !paperData?.questions?.length}
                  title="Answer every question on this paper, one at a time"
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-40 shrink-0"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>Answer all</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">
                Runs on your local Ollama model, one question per request — slower than a cloud
                model but private and free. <span className="text-amber-500/90 font-semibold">Answers
                are AI-generated and unverified</span>; check them against your answer key before
                relying on them.
              </p>
            </div>
          )}
        </div>

        {/* Modal Scroll Body */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-slate-100/70" id="printable-question-paper">
          {loading ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-600 font-semibold">
                Loading official cryptographic question paper...
              </p>
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-rose-50 text-rose-800 rounded-xl border border-rose-200 space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
              <p className="text-sm font-bold">{error}</p>
              <button
                type="button"
                onClick={() => fetchPaper()}
                className="px-4 py-1.5 bg-rose-700 text-white rounded-lg font-bold text-xs cursor-pointer"
              >
                Retry Loading
              </button>
            </div>
          ) : paperData ? (
            /* Printable A4 Paper Layout */
            <div
              ref={printRef}
              className="bg-white text-slate-900 p-6 sm:p-10 rounded-xl shadow-md border border-slate-300 max-w-3xl mx-auto space-y-6 relative print:shadow-none print:border-none print:p-0 print:m-0"
            >
              {/* Paper Watermark */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] select-none text-slate-950 font-black text-6xl rotate-[-30deg] uppercase">
                ZeroLeak Enclave Sealed
              </div>

              {/* Official University Header matching SLR-HL-475 */}
              <div className="space-y-3 border-b-2 border-slate-900 pb-4">
                {/* Top Row: Seat No. box on left, SLR-HL code and Set letter box on right */}
                <div className="flex items-center justify-between font-mono text-xs font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="border border-slate-900 px-2 py-1 text-xs font-black">Seat No.</span>
                    <div className="w-32 h-7 border border-slate-900 flex items-center px-2 text-[10px] text-slate-400">
                      [ Write Seat No ]
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black tracking-wider uppercase text-slate-900">
                      {paperData.version?.paper_code || 'SLR-HL-475'}
                    </span>
                    <div className="flex items-center border-2 border-slate-900 rounded overflow-hidden">
                      <span className="bg-slate-900 text-white text-xs font-black px-2 py-1">Set</span>
                      <span className="text-sm font-black px-2.5 py-0.5 text-slate-950 bg-slate-100">
                        {paperData.version?.version_code?.includes('SET-2') ? 'Q' : paperData.version?.version_code?.includes('SET-3') ? 'R' : 'P'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Main Examination Titles */}
                <div className="text-center space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    CONFIDENTIAL &bull; UNIVERSITY BOARD EXAMINATION &bull; PROTECTED UNDER OFFICIAL SECRECY ACT
                  </div>
                  <h1 className="text-base sm:text-lg font-black text-slate-950 tracking-tight uppercase leading-snug">
                    S.Y. (B.Tech.) (Sem - I) (New) (CBCS) Examination: Oct/Nov-2022
                  </h1>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 uppercase">
                    {paperData.exam.name || 'COMPUTER SCIENCE & ENGINEERING'}
                  </h2>
                  <div className="text-xs font-bold text-slate-800 uppercase">
                    Subject: {paperData.exam.subject || 'Computer Graphics'}
                  </div>

                  <div className="flex flex-wrap items-center justify-between pt-2 text-xs font-bold text-slate-900 border-t border-slate-300 mt-2 font-mono">
                    <span>Day & Date: <strong>Monday, 20-03-2023</strong></span>
                    <span>Time: <strong>02:00 PM To 05:00 PM</strong></span>
                    <span>Max. Marks: <strong>70</strong></span>
                  </div>
                </div>

                {/* University Instructions */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-300 text-xs text-slate-800 space-y-1">
                  <div className="font-extrabold text-slate-950 uppercase text-[11px]">
                    Instructions:
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px] leading-relaxed">
                    <li>Q. No. 1 is compulsory. It should be solved in the first 30 minutes in answer book. Page no 03 (Starting page of the Answer Book). Each question carries one mark.</li>
                    <li>Don’t forget to Mention question paper set (P/Q/R/S) on top of page.</li>
                    <li>Figures to the right indicate full marks.</li>
                    <li>Assume suitable data wherever needed and mention it clearly.</li>
                  </ol>
                </div>
              </div>

              {/* Section 1: MCQ / Objective Type Questions */}
              {(() => {
                const mcqs = paperData.questions.filter((q: any) => q.question_type === 'MCQ' || (Array.isArray(q.options) && q.options.length >= 2));
                const theory = paperData.questions.filter((q: any) => q.question_type !== 'MCQ' && (!q.options || q.options.length < 2));
                const theorySec1 = theory.slice(0, Math.ceil(theory.length / 2));
                const theorySec2 = theory.slice(Math.ceil(theory.length / 2));

                const activeMcqs = mcqs.length > 0 ? mcqs : paperData.questions.slice(0, 14);

                return (
                  <>
                    <div className="space-y-4 border-b border-slate-300 pb-6">
                      <div className="flex items-center justify-between font-bold text-xs border-b border-slate-400 pb-1 text-slate-900 font-mono">
                        <span className="uppercase text-sm font-black">MCQ/Objective Type Questions</span>
                        <span>Duration: 30 Minutes &nbsp;|&nbsp; Marks: {activeMcqs.length}</span>
                      </div>

                      <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                        <span>Q.1 Choose the correct alternatives from the options.</span>
                        <span className="font-mono text-sm font-black pr-2">{activeMcqs.length}</span>
                      </div>

                      <div className="space-y-3.5 pl-2">
                        {activeMcqs.map((q, idx) => (
                          <div key={q.id || idx} className="space-y-1.5 text-xs">
                            <div className="flex items-start gap-2 font-semibold text-slate-950">
                              <span className="font-bold shrink-0">{idx + 1})</span>
                              <div className="whitespace-pre-wrap leading-snug">{q.content_text}</div>
                            </div>

                            {/* MCQ Options a), b), c), d) */}
                            {Array.isArray(q.options) && q.options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-6 pt-0.5 text-slate-800">
                                {q.options.map((opt: any, optIdx: number) => {
                                  const optText = typeof opt === 'string' ? opt : (opt?.text ?? opt?.value ?? '');
                                  const optLabel = opt?.label || String.fromCharCode(97 + optIdx);
                                  const isCorrect = q.correct_answer === optLabel || q.correct_answer === String.fromCharCode(65 + optIdx);

                                  return (
                                    <div key={optIdx} className="flex items-center gap-1.5 text-xs">
                                      <span className="font-bold shrink-0">{optLabel})</span>
                                      <span>{optText}</span>
                                      {showAnswerKey && isCorrect && (
                                        <span className="ml-1 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">
                                          [CORRECT]
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Section – I Theory */}
                    <div className="space-y-4 border-b border-slate-300 pb-6">
                      <div className="flex items-center justify-between font-black text-sm border-b border-slate-400 pb-1 text-slate-950 uppercase font-mono">
                        <span>Section – I (Theory & Core Concepts)</span>
                        <span>Max. Marks: 28</span>
                      </div>

                      {theorySec1.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                              <span>Q.2 Answer the following questions. (Attempt Any Four)</span>
                              <span className="font-mono text-sm font-black pr-2">16</span>
                            </div>
                            <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                              {theorySec1.slice(0, 5).map((tQ, tIdx) => (
                                <div key={tQ.id || tIdx} className="flex items-start justify-between gap-2">
                                  <span>{String.fromCharCode(97 + tIdx)}) {tQ.content_text}</span>
                                  <span className="font-mono font-bold shrink-0">[{tQ.marks || 4}]</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {theorySec1.length > 5 && (
                            <div className="space-y-2 pt-2">
                              <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                                <span>Q.3 Answer the following questions in detail. (Attempt Any Two)</span>
                                <span className="font-mono text-sm font-black pr-2">12</span>
                              </div>
                              <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                                {theorySec1.slice(5).map((tQ, tIdx) => (
                                  <div key={tQ.id || tIdx} className="flex items-start justify-between gap-2">
                                    <span>{String.fromCharCode(97 + tIdx)}) {tQ.content_text}</span>
                                    <span className="font-mono font-bold shrink-0">[{tQ.marks || 6}]</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                          <div>a) Explain system architecture and fundamental mechanisms of {exam.subject || 'the course'}.</div>
                          <div>b) Compare the primary design techniques and evaluate their performance metrics.</div>
                        </div>
                      )}
                    </div>

                    {/* Section – II Theory */}
                    <div className="space-y-4 border-b border-slate-300 pb-6">
                      <div className="flex items-center justify-between font-black text-sm border-b border-slate-400 pb-1 text-slate-950 uppercase font-mono">
                        <span>Section – II (Analysis, Design & Applications)</span>
                        <span>Max. Marks: 28</span>
                      </div>

                      {theorySec2.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                              <span>Q.4 Answer the following questions. (Attempt Any Four)</span>
                              <span className="font-mono text-sm font-black pr-2">16</span>
                            </div>
                            <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                              {theorySec2.slice(0, 5).map((tQ, tIdx) => (
                                <div key={tQ.id || tIdx} className="flex items-start justify-between gap-2">
                                  <span>{String.fromCharCode(97 + tIdx)}) {tQ.content_text}</span>
                                  <span className="font-mono font-bold shrink-0">[{tQ.marks || 4}]</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {theorySec2.length > 5 && (
                            <div className="space-y-2 pt-2">
                              <div className="flex items-center justify-between font-bold text-sm text-slate-950">
                                <span>Q.5 Solve / Explain the following technical problems.</span>
                                <span className="font-mono text-sm font-black pr-2">12</span>
                              </div>
                              <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                                {theorySec2.slice(5).map((tQ, tIdx) => (
                                  <div key={tQ.id || tIdx} className="flex items-start justify-between gap-2">
                                    <span>{String.fromCharCode(97 + tIdx)}) {tQ.content_text}</span>
                                    <span className="font-mono font-bold shrink-0">[{tQ.marks || 6}]</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2 pl-4 text-xs font-medium text-slate-900">
                          <div>a) Analyze edge cases and describe failure recovery strategies.</div>
                          <div>b) Demonstrate mathematical proofs and algorithmic efficiency.</div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Official Paper Footer */}
              <div className="pt-4 flex flex-wrap items-center justify-between text-[11px] text-slate-600 font-mono border-t-2 border-slate-900">
                <div>
                  Generated: {new Date(paperData.version?.generated_at || Date.now()).toLocaleDateString()}
                </div>
                <div className="text-center font-extrabold text-slate-900">
                  *** END OF QUESTION PAPER ***
                </div>
                <div>
                  SHA-256: {paperData.version?.checksum_sha256 ? `${paperData.version.checksum_sha256.substring(0, 12)}...` : 'PROTECTED'}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

