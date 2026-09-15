import React, { useState } from 'react';
import {
  Sparkles,
  Upload,
  FileText,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  Plus,
  Trash2,
  Edit3,
  Check,
  Eye,
  BookOpen,
  Atom,
  Cpu,
  Layers,
  HelpCircle,
  Share2,
  Hash,
  Download,
  Printer,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../api';
import { User, Examination, Question } from '../types';
import { QuestionPaperPdfModal } from './workspaces/QuestionPaperPdfModal';
import {
  generatePaperFromPdfText,
  FREE_AI_MODELS,
  AiGenerationMode,
  GeneratedAiPaper,
  GeneratedAiQuestion,
} from '../utils/aiPaperGenerator';

interface AiPdfPaperGeneratorProps {
  currentUser: User | null;
  onPaperCreated?: (newExamId: string) => void;
  onRefresh?: () => void;
  existingExams?: Examination[];
}

export const AiPdfPaperGenerator: React.FC<AiPdfPaperGeneratorProps> = ({
  currentUser,
  onPaperCreated,
  onRefresh,
  existingExams = [],
}) => {
  const [pdfPreviewExam, setPdfPreviewExam] = useState<Examination | null>(null);
  const [pdfPreviewVersionId, setPdfPreviewVersionId] = useState<string | undefined>(undefined);
  // Source selection state
  const [sourceMode, setSourceMode] = useState<'upload' | 'text' | 'existing'>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [extractedPdfData, setExtractedPdfData] = useState<{
    text: string;
    pageCount: number;
    fileName: string;
    wordCount: number;
  } | null>(null);
  const [manualText, setManualText] = useState('');
  const [selectedExistingExamId, setSelectedExistingExamId] = useState('');

  // AI Configuration state
  const [generationMode, setGenerationMode] = useState<AiGenerationMode>('CONCEPT_VARIANTS');
  const [selectedModel, setSelectedModel] = useState<string>('groq-gpt-oss-120b');
  const [examTitle, setExamTitle] = useState('National Standard Examination 2026 (AI Generated)');
  const [subject, setSubject] = useState('Computer Science & Engineering');
  const [category, setCategory] = useState('Competitive Exam');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [marksPerQuestion, setMarksPerQuestion] = useState<number>(4);
  const [negativeMarks, setNegativeMarks] = useState<number>(1);
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(true);
  const [customPromptNotes, setCustomPromptNotes] = useState('');

  // Generation execution state
  const [generating, setGenerating] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Generated Paper Studio state
  const [generatedPaper, setGeneratedPaper] = useState<GeneratedAiPaper | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});

  // Compilation state (saving into ZeroLeak Vault)
  const [compilingToVault, setCompilingToVault] = useState(false);
  const [vaultCompiledResult, setVaultCompiledResult] = useState<{
    examId: string;
    versionCode: string;
    checksumSHA256: string;
    keyFingerprint: string;
  } | null>(null);

  // Handle PDF file upload & server text extraction
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setErrorMsg(null);
    setExtractingPdf(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await api.extractPdfText({
            file_data: base64Data,
            file_name: file.name,
          });

          setExtractedPdfData({
            text: res.text,
            pageCount: res.pageCount,
            fileName: res.fileName,
            wordCount: res.wordCount,
          });

          // Auto-detect exam title and subject heuristics from file name
          const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          if (!examTitle || examTitle.includes('AI Generated')) {
            setExamTitle(`${baseName.toUpperCase()} - Variant Set 2026`);
          }
          if (baseName.toLowerCase().includes('physics')) setSubject('Physics');
          else if (baseName.toLowerCase().includes('chem')) setSubject('Chemistry');
          else if (baseName.toLowerCase().includes('math')) setSubject('Mathematics');
          else if (baseName.toLowerCase().includes('bio') || baseName.toLowerCase().includes('neet')) setSubject('Biology');
          else if (baseName.toLowerCase().includes('cs') || baseName.toLowerCase().includes('gate')) setSubject('Computer Science');

          setSuccessMsg(`Extracted ${res.pageCount} pages (${res.wordCount} words) from "${file.name}" successfully.`);
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to extract text from PDF document.');
        } finally {
          setExtractingPdf(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error reading file.');
      setExtractingPdf(false);
    }
  };

  // Get active source text
  const getActiveSourceText = (): string => {
    if (sourceMode === 'upload' && extractedPdfData?.text) {
      return extractedPdfData.text;
    }
    if (sourceMode === 'text') {
      return manualText;
    }
    if (sourceMode === 'existing' && selectedExistingExamId) {
      const ex = existingExams.find(e => e.id === selectedExistingExamId);
      return ex ? `Existing Exam: ${ex.name}\nSubject: ${ex.subject}\nCategory: ${ex.category}` : '';
    }
    return '';
  };

  // Trigger AI Paper Generation
  const handleGeneratePaper = async () => {
    const sourceText = getActiveSourceText();
    if (!sourceText || sourceText.trim().length < 20) {
      setErrorMsg('Please upload a PDF or enter source document text before generating.');
      return;
    }

    setGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setVaultCompiledResult(null);

    try {
      const paper = await generatePaperFromPdfText(
        {
          sourceText,
          sourceFileName: uploadedFile?.name,
          examTitle,
          subject,
          category,
          mode: generationMode,
          questionCount,
          marksPerQuestion,
          negativeMarksPerQuestion: negativeMarks,
          includeExplanations: includeSolutions,
          model: selectedModel,
          customInstructions: customPromptNotes,
        },
        status => {
          setProgressStatus(status);
        }
      );

      setGeneratedPaper(paper);
      setSuccessMsg(`Generated ${paper.questions.length} authentic questions via ${paper.modelUsed}!`);
    } catch (err: any) {
      console.error('Paper generation error:', err);
      setErrorMsg(err.message || 'Failed to generate paper. Please try a different model or adjust the prompt.');
    } finally {
      setGenerating(false);
      setProgressStatus('');
    }
  };

  // Update a generated question field
  const updateQuestion = (qId: string, updates: Partial<GeneratedAiQuestion>) => {
    if (!generatedPaper) return;
    setGeneratedPaper({
      ...generatedPaper,
      questions: generatedPaper.questions.map(q => (q.id === qId ? { ...q, ...updates } : q)),
    });
  };

  // Update question option text
  const updateOptionText = (qId: string, optIndex: number, newText: string) => {
    if (!generatedPaper) return;
    setGeneratedPaper({
      ...generatedPaper,
      questions: generatedPaper.questions.map(q => {
        if (q.id !== qId) return q;
        const newOptions = [...q.options];
        if (newOptions[optIndex]) {
          newOptions[optIndex] = { ...newOptions[optIndex], text: newText };
        }
        return { ...q, options: newOptions };
      }),
    });
  };

  // Remove a question
  const handleDeleteQuestion = (qId: string) => {
    if (!generatedPaper) return;
    const filtered = generatedPaper.questions.filter(q => q.id !== qId);
    setGeneratedPaper({
      ...generatedPaper,
      totalQuestions: filtered.length,
      questions: filtered.map((q, idx) => ({ ...q, questionNumber: idx + 1 })),
    });
  };

  // Add a new blank question
  const handleAddBlankQuestion = () => {
    if (!generatedPaper) return;
    const newQ: GeneratedAiQuestion = {
      id: `ai_q_${Date.now()}_manual`,
      questionNumber: generatedPaper.questions.length + 1,
      questionType: 'MCQ',
      subject: generatedPaper.subject,
      topic: 'Additional Topic',
      difficulty: 'MEDIUM',
      marks: marksPerQuestion,
      negativeMarks: negativeMarks,
      contentText: 'New question statement text here...',
      options: [
        { label: 'A', text: 'Option A' },
        { label: 'B', text: 'Option B' },
        { label: 'C', text: 'Option C' },
        { label: 'D', text: 'Option D' },
      ],
      correctAnswer: 'A',
      explanation: 'Explanation for correct answer.',
    };
    setGeneratedPaper({
      ...generatedPaper,
      totalQuestions: generatedPaper.questions.length + 1,
      questions: [...generatedPaper.questions, newQ],
    });
    setEditingQuestionId(newQ.id);
  };

  // Compile and Save into ZeroLeak Cryptographic Vault
  const handleCompileToCryptographicVault = async () => {
    if (!generatedPaper || generatedPaper.questions.length === 0) return;

    setCompilingToVault(true);
    setErrorMsg(null);

    try {
      // 1. Create official Examination in DB
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 7); // 1 week ahead by default
      const dateStr = targetDate.toISOString().split('T')[0];
      const unlockTime = new Date(Date.now() + 86400000 * 7).toISOString();

      const examRes = await api.createExamination({
        name: generatedPaper.title,
        subject: generatedPaper.subject,
        category: generatedPaper.category,
        exam_type: 'MCQ',
        total_marks: generatedPaper.totalMarks,
        total_questions: generatedPaper.questions.length,
        duration_minutes: generatedPaper.durationMinutes,
        exam_date: dateStr,
        unlock_time: unlockTime,
      });

      const newExamId = examRes.examId;

      // 2. Bulk insert all generated questions
      const questionsPayload = generatedPaper.questions.map((q, idx) => ({
        subject: q.subject || generatedPaper.subject,
        topic: q.topic || 'Core Concept',
        difficulty: q.difficulty,
        marks: q.marks,
        negative_marks: q.negativeMarks,
        correct_answer: q.correctAnswer,
        language: 'English',
        question_type: q.questionType,
        content_text: q.contentText,
        options_json: JSON.stringify(q.options),
        status: 'VERIFIED', // Directly verified for cryptographic generation
        initial_status: 'VERIFIED',
      }));

      await api.bulkCreateQuestions({
        questions: questionsPayload,
        initial_status: 'VERIFIED',
      });

      // 3. Trigger cryptographic encryption and Shamir 3-of-5 vault packaging
      const genRes = await api.generatePaper(newExamId, {
        exam_mode: 'STANDARD',
      });

      setVaultCompiledResult({
        examId: newExamId,
        versionCode: genRes.versionCode,
        checksumSHA256: genRes.checksumSHA256,
        keyFingerprint: genRes.keyFingerprint,
      });

      setSuccessMsg(
        `Successfully compiled into Cryptographic Vault! Examination ID: ${newExamId}, Version: ${genRes.versionCode}`
      );

      if (onPaperCreated) {
        onPaperCreated(newExamId);
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Error compiling to cryptographic vault:', err);
      setErrorMsg(err.message || 'Failed to compile into cryptographic vault.');
    } finally {
      setCompilingToVault(false);
    }
  };

  // Trigger Print View
  const handlePrintPaper = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Action Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-xs font-bold px-1.5 hover:opacity-75">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs font-bold px-1.5 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Top Banner: Free AI Engine Info */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-900/30 via-slate-900 to-purple-900/30 border border-indigo-500/20 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold uppercase tracking-wider mb-2 border border-indigo-500/30">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            100% Free AI Engine (Puter.js + Claude 3.5 / DeepSeek / Mistral)
          </div>
          <h2 className="text-lg font-bold text-white font-serif">
            Generate Brand-New Examination Papers from Uploaded PDFs
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Upload any existing question paper PDF or syllabus document. The AI analyzes underlying concepts, equations, and topics to synthesize completely original questions, 4-option distractors, and step-by-step solutions without verbatim copying.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400">
            <span className="text-emerald-400 font-bold">✓ Zero API Keys</span>
            <span className="mx-2">•</span>
            <span className="text-indigo-400 font-bold">✓ AES-256-GCM Vault</span>
          </div>
        </div>
      </div>

      {/* Step 1 & 2: Grid Layout for Source Ingestion & AI Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Source PDF Ingestion (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                Step 1: Source Document Ingestion
              </h3>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px]">
                <button
                  type="button"
                  onClick={() => setSourceMode('upload')}
                  className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                    sourceMode === 'upload' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Upload PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('text')}
                  className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                    sourceMode === 'text' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Paste Text
                </button>
                {existingExams.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSourceMode('existing')}
                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                      sourceMode === 'existing' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Select Exam
                  </button>
                )}
              </div>
            </div>

            {sourceMode === 'upload' && (
              <div className="space-y-3">
                <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50 dark:bg-slate-950/50">
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="w-8 h-8 text-indigo-500 mb-2" />
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {uploadedFile ? uploadedFile.name : 'Click to Upload PDF or Drag & Drop'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Supports .PDF, .TXT, .MD (Automatic multi-page text extraction)
                  </div>
                </label>

                {extractingPdf && (
                  <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800 text-indigo-300 text-xs flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Extracting text and page layout from PDF...</span>
                  </div>
                )}

                {extractedPdfData && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Text Extracted
                      </span>
                      <span className="text-slate-400 font-mono">
                        {extractedPdfData.pageCount} Pages • {extractedPdfData.wordCount} Words
                      </span>
                    </div>
                    <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 font-mono text-[10px] text-slate-400 max-h-24 overflow-y-auto">
                      {extractedPdfData.text.substring(0, 300)}...
                    </div>
                  </div>
                )}
              </div>
            )}

            {sourceMode === 'text' && (
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Paste Source Paper Text / Syllabus Content:
                </label>
                <textarea
                  rows={8}
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  placeholder="Paste question paper text, syllabus outline, or sample questions here..."
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono placeholder:text-slate-500"
                />
                <div className="text-[10px] text-slate-400 text-right">
                  {manualText.trim().split(/\s+/).filter(Boolean).length} words
                </div>
              </div>
            )}

            {sourceMode === 'existing' && (
              <div className="space-y-3">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Select Existing Examination as Blueprint:
                </label>
                <select
                  value={selectedExistingExamId}
                  onChange={e => setSelectedExistingExamId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium"
                >
                  <option value="">-- Choose an examination --</option>
                  {existingExams.map(ex => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.subject} - {ex.total_questions} Qs)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Model Selector Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-500" />
              Free AI LLM Engine
            </h3>

            <div className="space-y-2">
              {FREE_AI_MODELS.map(model => {
                const isSelected = selectedModel === model.id;
                return (
                  <label
                    key={model.id}
                    className={`p-3 rounded-xl border flex items-start justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200 shadow-sm ring-1 ring-indigo-500/30'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="ai_model"
                        value={model.id}
                        checked={isSelected}
                        onChange={() => setSelectedModel(model.id)}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{model.name}</span>
                          {model.recommended && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500 text-black">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{model.description}</div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: AI Generation Config & Mode (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Step 2: Generation Mode & Blueprint Controls
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Customize how the AI should transform concepts from the uploaded PDF into a fresh paper set.
              </p>
            </div>

            {/* Mode Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  id: 'EXACT_UPLOADED_PAPER' as AiGenerationMode,
                  title: '🎯 Exact Extracted Paper',
                  desc: 'Generate paper using the exact questions, formulas & options from uploaded document.',
                },
                {
                  id: 'CONCEPT_VARIANTS' as AiGenerationMode,
                  title: '⚡ Concept-Parallel Variants',
                  desc: 'Isomorphic questions: same concepts, new numbers, equations & scenarios.',
                },
                {
                  id: 'SYLLABUS_MIRROR' as AiGenerationMode,
                  title: '📑 Syllabus Mirror Paper',
                  desc: 'Full examination set matching exact topic weights & difficulty mix.',
                },
                {
                  id: 'ANALYTICAL_HOTS' as AiGenerationMode,
                  title: '🧠 Higher-Order Analytical',
                  desc: 'Advanced problem solving, assertion-reasoning & deep synthesis.',
                },
                {
                  id: 'THEORY_SETS' as AiGenerationMode,
                  title: '📝 University Theory Sets',
                  desc: 'Section A/B/C descriptive questions with step-by-step rubrics.',
                },
              ].map(m => {
                const isActive = generationMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setGenerationMode(m.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-400/20'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold text-xs">{m.title}</div>
                    <div className={`text-[10px] mt-1 ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {m.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Configuration Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Generated Exam Title</label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={e => setExamTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Target Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium"
                >
                  <option value="Competitive Exam">Competitive Exam (GATE / JEE / NEET)</option>
                  <option value="University Semester">University Autonomous Semester</option>
                  <option value="National Recruitment">National Recruitment / UPSC</option>
                  <option value="Certification">Professional Certification</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Number of Questions</label>
                <div className="flex items-center gap-1.5">
                  {[5, 10, 15, 20, 30].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setQuestionCount(cnt)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        questionCount === cnt
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {cnt} Qs
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Marks Scheme</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-emerald-400 font-bold">+</span>
                    <input
                      type="number"
                      value={marksPerQuestion}
                      onChange={e => setMarksPerQuestion(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-rose-400 font-bold">-</span>
                    <input
                      type="number"
                      value={negativeMarks}
                      onChange={e => setNegativeMarks(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Step-by-Step Solutions</span>
                <input
                  type="checkbox"
                  checked={includeSolutions}
                  onChange={e => setIncludeSolutions(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </div>
            </div>

            {/* Custom Prompt Notes */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1 text-xs">
                Custom Instructions / Focus Topics (Optional)
              </label>
              <input
                type="text"
                value={customPromptNotes}
                onChange={e => setCustomPromptNotes(e.target.value)}
                placeholder="e.g. Focus on Dynamic Programming, Graph Algorithms, and omit Compiler Design."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-500"
              />
            </div>

            {/* Generate Action Button */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={generating || (!extractedPdfData?.text && !manualText && !selectedExistingExamId)}
                onClick={handleGeneratePaper}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 transition-all text-xs cursor-pointer"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{progressStatus || 'AI Synthesizing Question Paper...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Brand-New Examination Paper from PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: Generated Paper Studio & Question Review */}
      {generatedPaper && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          {/* Header & Meta */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-black flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  GENERATED VIA {generatedPaper.modelUsed.toUpperCase()}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(generatedPaper.generatedAt).toLocaleTimeString()}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white font-serif mt-1">
                {generatedPaper.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                <span>Subject: <strong className="text-indigo-400">{generatedPaper.subject}</strong></span>
                <span>•</span>
                <span>Category: <strong className="text-slate-300">{generatedPaper.category}</strong></span>
                <span>•</span>
                <span>Questions: <strong className="text-white">{generatedPaper.totalQuestions}</strong></span>
                <span>•</span>
                <span>Total Marks: <strong className="text-emerald-400">{generatedPaper.totalMarks}</strong></span>
                <span>•</span>
                <span>Duration: <strong className="text-amber-400">{generatedPaper.durationMinutes} Mins</strong></span>
              </div>
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddBlankQuestion}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>

              <button
                type="button"
                onClick={handlePrintPaper}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Print clean paper"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print PDF</span>
              </button>

              <button
                type="button"
                disabled={compilingToVault}
                onClick={handleCompileToCryptographicVault}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-900/30 text-xs transition-all cursor-pointer"
              >
                {compilingToVault ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>Compile into Cryptographic Vault</span>
              </button>
            </div>
          </div>

          {/* Cryptographic Vault Compilation Success Banner */}
          {vaultCompiledResult && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-700 text-emerald-200 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Encrypted Examination Vault Sealed & Ready
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-900 text-emerald-300">
                  AES-256-GCM + SHAMIR 3-of-5
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-2 border-t border-emerald-900 items-center">
                <div>
                  <span className="text-slate-400">Exam ID:</span>
                  <div className="font-bold text-white truncate">{vaultCompiledResult.examId}</div>
                </div>
                <div>
                  <span className="text-slate-400">Version Code:</span>
                  <div className="font-bold text-amber-300">{vaultCompiledResult.versionCode}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-slate-400">Checksum:</span>
                    <div className="text-emerald-300 truncate">{vaultCompiledResult.checksumSHA256.substring(0, 10)}...</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const dummyExam: Examination = {
                        id: vaultCompiledResult.examId,
                        org_id: currentUser?.org_id || '',
                        name: generatedPaper?.title || 'Examination',
                        subject: generatedPaper?.subject || '',
                        category: (generatedPaper?.category as any) || 'University Exam',
                        exam_type: 'THEORY',
                        exam_time: '10:00 AM',
                        created_by: currentUser?.id || 'admin',
                        total_marks: generatedPaper?.totalMarks || 100,
                        total_questions: generatedPaper?.totalQuestions || 10,
                        duration_minutes: generatedPaper?.durationMinutes || 180,
                        exam_date: new Date().toISOString().split('T')[0],
                        unlock_time: new Date().toISOString(),
                        version_code: vaultCompiledResult.versionCode,
                        status: 'GENERATED_ENCRYPTED',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      };
                      setPdfPreviewExam(dummyExam);
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View PDF</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Question List Review & Live Editor */}
          <div className="space-y-4">
            {generatedPaper.questions.map((q, idx) => {
              const isEditing = editingQuestionId === q.id;
              const isSolutionOpen = expandedSolutions[q.id];

              return (
                <div
                  key={q.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 transition-all"
                >
                  {/* Question Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                        {q.questionNumber}
                      </span>
                      <span className="font-semibold text-xs text-slate-700 dark:text-slate-300">
                        {q.topic}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        q.difficulty === 'EASY'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : q.difficulty === 'HARD'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {q.difficulty}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-emerald-400">
                        +{q.marks} / -{q.negativeMarks} Marks
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingQuestionId(isEditing ? null : q.id)}
                        className="p-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-400 transition-colors"
                        title="Edit question text"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-400 transition-colors"
                        title="Delete question"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Question Problem Statement */}
                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={q.contentText}
                      onChange={e => updateQuestion(q.id, { contentText: e.target.value })}
                      className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-500 text-xs text-slate-900 dark:text-white font-mono"
                    />
                  ) : (
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                      {q.contentText}
                    </div>
                  )}

                  {/* 4-Option Matrix */}
                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt, optIdx) => {
                        const isCorrect = q.correctAnswer === opt.label;
                        return (
                          <div
                            key={opt.label}
                            onClick={() => updateQuestion(q.id, { correctAnswer: opt.label })}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                              isCorrect
                                ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/30 font-semibold'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1 mr-2">
                              <span className={`w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center ${
                                isCorrect ? 'bg-emerald-500 text-black' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                              }`}>
                                {opt.label}
                              </span>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={opt.text}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => updateOptionText(q.id, optIdx, e.target.value)}
                                  className="w-full px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                                />
                              ) : (
                                <span className="truncate">{opt.text}</span>
                              )}
                            </div>
                            {isCorrect && (
                              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Correct Key
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Step-by-Step Explanation Accordion */}
                  {q.explanation && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSolutions({
                            ...expandedSolutions,
                            [q.id]: !isSolutionOpen,
                          })
                        }
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                      >
                        {isSolutionOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <span>Step-by-Step Mathematical Solution / Rationale</span>
                      </button>

                      {isSolutionOpen && (
                        <div className="mt-2 p-3 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Official Generated Question Paper PDF Modal */}
      {pdfPreviewExam && (
        <QuestionPaperPdfModal
          exam={pdfPreviewExam}
          initialVersionId={pdfPreviewVersionId}
          onClose={() => {
            setPdfPreviewExam(null);
            setPdfPreviewVersionId(undefined);
          }}
        />
      )}
    </div>
  );
};

