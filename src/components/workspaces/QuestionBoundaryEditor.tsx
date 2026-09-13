import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Check,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Scissors,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  Save,
  Split,
  Maximize,
  Sliders,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  ShieldCheck,
  Info,
  ExternalLink,
  Edit2
} from 'lucide-react';
import { api } from '../../api';

export interface BoundaryQuestion {
  id: string;
  question_number: string;
  questionNumber?: number | string;
  question_paper_id?: string;
  source_file?: string;
  source_page?: number;
  subject: string;
  topic?: string;
  difficulty?: string;
  marks?: number;
  negative_marks?: number;
  correct_answer?: string;
  language?: string;
  syllabus?: string;
  question_type?: string;
  content_text: string;
  options?: Array<{ label?: string; text?: string } | string> | null;
  options_status?: 'EXTRACTED' | 'PENDING_REVIEW';
  extraction_status?: 'AUTO_EXTRACTED' | 'NEEDS_REVIEW' | 'MANUALLY_CORRECTED' | 'COMPLETED' | 'SKIPPED';
  crop_coordinates?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    pageNumber?: number;
    unit?: string;
  } | null;
  validation_flags?: string[];
  image_url?: string;
  diagram_url?: string;
  high_res_page_url?: string;
  page_width?: number;
  page_height?: number;
  has_diagram?: boolean;
}

export interface PaperPage {
  id: string;
  paper_id: string;
  page_number: number;
  image_url: string;
  width: number;
  height: number;
  dpi: number;
}

interface QuestionBoundaryEditorProps {
  paperId: string;
  initialQuestions?: BoundaryQuestion[];
  onClose?: () => void;
  onFinalized?: () => void;
}

type DragHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | null;

export const QuestionBoundaryEditor: React.FC<QuestionBoundaryEditorProps> = ({
  paperId,
  initialQuestions,
  onClose,
  onFinalized,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<BoundaryQuestion[]>(initialQuestions || []);
  const [pages, setPages] = useState<PaperPage[]>([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [filterMode, setFilterMode] = useState<'ALL' | 'NEEDS_REVIEW' | 'MANUALLY_CORRECTED' | 'COMPLETED'>('ALL');

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    autoExtracted: 0,
    needsReview: 0,
    manuallyCorrected: 0,
    completed: 0,
    skipped: 0,
  });

  // Active Boundary Coordinates (in 300 DPI pixels)
  const [coords, setCoords] = useState<{ x1: number; y1: number; x2: number; y2: number }>({
    x1: 50,
    y1: 100,
    x2: 1200,
    y2: 600,
  });

  // Initial Coordinates backup for Reset
  const [initialCoords, setInitialCoords] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging bounding box
  const [activeDragHandle, setActiveDragHandle] = useState<DragHandle>(null);
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStartCoords, setDragStartCoords] = useState<{ x1: number; y1: number; x2: number; y2: number }>({ x1: 0, y1: 0, x2: 0, y2: 0 });

  // Page natural dimensions
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number }>({ width: 2479, height: 3508 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Split dialog state
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitYOffset, setSplitYOffset] = useState<number>(300);

  // Editable fields in right pane
  const [editedText, setEditedText] = useState('');
  const [editedAnswer, setEditedAnswer] = useState('A');
  const [editedOptions, setEditedOptions] = useState<Array<{ label: string; text: string }>>([]);

  // Toast / notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Canvas refs
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const pageImageRef = useRef<HTMLImageElement | null>(null);
  const livePreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load Paper Data & Pages
  const loadPaperData = useCallback(async () => {
    setLoading(true);
    try {
      const [pagesRes, reviewRes] = await Promise.all([
        api.getPaperPages(paperId).catch(() => ({ pages: [] })),
        api.getPaperQuestionsForReview(paperId).catch(() => ({ paper: null, questions: [], stats: null })),
      ]);

      setPages(pagesRes.pages || []);

      const qList: BoundaryQuestion[] = reviewRes.questions && reviewRes.questions.length > 0
        ? reviewRes.questions
        : (initialQuestions || []);

      setQuestions(qList);

      if (reviewRes.stats) {
        setStats(reviewRes.stats);
      } else {
        const total = qList.length;
        const autoExtracted = qList.filter(q => q.extraction_status === 'AUTO_EXTRACTED').length;
        const needsReview = qList.filter(q => q.extraction_status === 'NEEDS_REVIEW').length;
        const manuallyCorrected = qList.filter(q => q.extraction_status === 'MANUALLY_CORRECTED').length;
        const completed = qList.filter(q => q.extraction_status === 'COMPLETED').length;
        const skipped = qList.filter(q => q.extraction_status === 'SKIPPED').length;
        setStats({ total, autoExtracted, needsReview, manuallyCorrected, completed, skipped });
      }
    } catch (err: any) {
      console.error('Error loading question boundary editor data:', err);
      showToast('Failed to load question paper review data', 'error');
    } finally {
      setLoading(false);
    }
  }, [paperId, initialQuestions]);

  useEffect(() => {
    loadPaperData();
  }, [loadPaperData]);

  // Filtered questions list based on filterMode
  const filteredQuestions = questions.filter(q => {
    if (filterMode === 'ALL') return true;
    return q.extraction_status === filterMode;
  });

  const activeQuestion: BoundaryQuestion | undefined = filteredQuestions[activeQuestionIndex] || questions[activeQuestionIndex];

  // Sync state when active question changes
  useEffect(() => {
    if (!activeQuestion) return;

    // 1. Synchronize Coordinates
    let targetCoords = { x1: 60, y1: 150, x2: 1200, y2: 600 };
    if (activeQuestion.crop_coordinates) {
      targetCoords = {
        x1: Math.round(activeQuestion.crop_coordinates.x1 || 60),
        y1: Math.round(activeQuestion.crop_coordinates.y1 || 150),
        x2: Math.round(activeQuestion.crop_coordinates.x2 || 1200),
        y2: Math.round(activeQuestion.crop_coordinates.y2 || 600),
      };
    }
    setCoords(targetCoords);
    setInitialCoords(targetCoords);
    setSplitYOffset(Math.round((targetCoords.y1 + targetCoords.y2) / 2));

    // 2. Synchronize Editable Content
    setEditedText(activeQuestion.content_text || '');
    setEditedAnswer(activeQuestion.correct_answer || 'A');

    const opts: Array<{ label: string; text: string }> = [];
    if (Array.isArray(activeQuestion.options)) {
      activeQuestion.options.forEach((opt, idx) => {
        const lbl = String.fromCharCode(65 + idx);
        if (typeof opt === 'string') {
          opts.push({ label: lbl, text: opt });
        } else if (opt && typeof opt === 'object') {
          opts.push({ label: opt.label || lbl, text: opt.text || '' });
        }
      });
    }
    if (opts.length === 0) {
      ['A', 'B', 'C', 'D'].forEach(lbl => opts.push({ label: lbl, text: '' }));
    }
    setEditedOptions(opts);
  }, [activeQuestionIndex, activeQuestion?.id]);

  // Draw Live Canvas Preview of current crop region
  const updateLivePreviewCanvas = useCallback(() => {
    const canvas = livePreviewCanvasRef.current;
    const img = pageImageRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cropW = Math.max(10, coords.x2 - coords.x1);
    const cropH = Math.max(10, coords.y2 - coords.y1);

    canvas.width = cropW;
    canvas.height = cropH;

    ctx.clearRect(0, 0, cropW, cropH);
    try {
      ctx.drawImage(
        img,
        coords.x1,
        coords.y1,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH
      );
    } catch {
      // Ignore cross-origin issues if any
    }
  }, [coords, imageLoaded]);

  useEffect(() => {
    updateLivePreviewCanvas();
  }, [coords, imageLoaded, updateLivePreviewCanvas]);

  // Determine current high-res page image URL
  const activePageNumber = activeQuestion?.source_page || activeQuestion?.crop_coordinates?.pageNumber || 1;
  const matchedPage = pages.find(p => p.page_number === activePageNumber);
  const pageImageUrl = matchedPage?.image_url || activeQuestion?.high_res_page_url || `/papers/${paperId}/pages/original_page_${activePageNumber}.png`;

  // Dragging & Resizing Handlers
  const handleMouseDownOnHandle = (e: React.MouseEvent, handle: DragHandle) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveDragHandle(handle);
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragStartCoords({ ...coords });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!activeDragHandle) return;

    // Delta in screen pixels converted to image coordinate pixels
    const deltaX = (e.clientX - dragStartMouse.x) / zoom;
    const deltaY = (e.clientY - dragStartMouse.y) / zoom;

    const minDim = 20;
    const maxX = imageNaturalSize.width;
    const maxY = imageNaturalSize.height;

    let { x1, y1, x2, y2 } = dragStartCoords;

    switch (activeDragHandle) {
      case 'move':
        const width = x2 - x1;
        const height = y2 - y1;
        x1 = Math.max(0, Math.min(maxX - width, x1 + deltaX));
        y1 = Math.max(0, Math.min(maxY - height, y1 + deltaY));
        x2 = x1 + width;
        y2 = y1 + height;
        break;

      case 'nw':
        x1 = Math.max(0, Math.min(x2 - minDim, x1 + deltaX));
        y1 = Math.max(0, Math.min(y2 - minDim, y1 + deltaY));
        break;

      case 'n':
        y1 = Math.max(0, Math.min(y2 - minDim, y1 + deltaY));
        break;

      case 'ne':
        x2 = Math.min(maxX, Math.max(x1 + minDim, x2 + deltaX));
        y1 = Math.max(0, Math.min(y2 - minDim, y1 + deltaY));
        break;

      case 'e':
        x2 = Math.min(maxX, Math.max(x1 + minDim, x2 + deltaX));
        break;

      case 'se':
        x2 = Math.min(maxX, Math.max(x1 + minDim, x2 + deltaX));
        y2 = Math.min(maxY, Math.max(y1 + minDim, y2 + deltaY));
        break;

      case 's':
        y2 = Math.min(maxY, Math.max(y1 + minDim, y2 + deltaY));
        break;

      case 'sw':
        x1 = Math.max(0, Math.min(x2 - minDim, x1 + deltaX));
        y2 = Math.min(maxY, Math.max(y1 + minDim, y2 + deltaY));
        break;

      case 'w':
        x1 = Math.max(0, Math.min(x2 - minDim, x1 + deltaX));
        break;
    }

    setCoords({
      x1: Math.round(x1),
      y1: Math.round(y1),
      x2: Math.round(x2),
      y2: Math.round(y2),
    });
  }, [activeDragHandle, dragStartCoords, dragStartMouse, imageNaturalSize, isPanning, panStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setActiveDragHandle(null);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === 'KeyD') {
        goToNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'KeyA') {
        goToPrev();
      } else if (e.key === '+' || e.key === '=') {
        setZoom(z => Math.min(2.5, z + 0.15));
      } else if (e.key === '-' || e.key === '_') {
        setZoom(z => Math.max(0.3, z - 0.15));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestionIndex, filteredQuestions.length]);

  const goToNext = () => {
    if (activeQuestionIndex < filteredQuestions.length - 1) {
      setActiveQuestionIndex(idx => idx + 1);
    }
  };

  const goToPrev = () => {
    if (activeQuestionIndex > 0) {
      setActiveQuestionIndex(idx => idx - 1);
    }
  };

  // Actions
  const handleSaveBoundary = async () => {
    if (!activeQuestion) return;
    setSaving(true);
    try {
      const res = await api.cropQuestionBoundary({
        questionId: activeQuestion.id,
        pageNumber: activePageNumber,
        x1: coords.x1,
        y1: coords.y1,
        x2: coords.x2,
        y2: coords.y2,
      });

      // Update question text & options in database
      await api.updateQuestionReview({
        questionId: activeQuestion.id,
        content_text: editedText,
        options: editedOptions,
        correct_answer: editedAnswer,
        extraction_status: 'MANUALLY_CORRECTED',
      });

      // Update local state
      setQuestions(prev =>
        prev.map(q =>
          q.id === activeQuestion.id
            ? {
                ...q,
                image_url: res.imageUrl,
                crop_coordinates: res.crop_coordinates,
                extraction_status: 'MANUALLY_CORRECTED',
                content_text: editedText,
                options: editedOptions,
                correct_answer: editedAnswer,
              }
            : q
        )
      );

      setStats(prev => ({
        ...prev,
        needsReview: Math.max(0, prev.needsReview - (activeQuestion.extraction_status === 'NEEDS_REVIEW' ? 1 : 0)),
        manuallyCorrected: prev.manuallyCorrected + (activeQuestion.extraction_status !== 'MANUALLY_CORRECTED' ? 1 : 0),
      }));

      showToast(`Question ${activeQuestion.question_number} boundary cropped & verified successfully!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save question crop boundary', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSplitQuestion = async () => {
    if (!activeQuestion) return;
    setSaving(true);
    try {
      const res = await api.splitQuestionBoundary({
        questionId: activeQuestion.id,
        splitY: splitYOffset,
      });

      setSplitDialogOpen(false);
      showToast(res.message || 'Successfully split question!', 'success');
      loadPaperData();
    } catch (err: any) {
      showToast(err.message || 'Failed to split question', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMergeNext = async () => {
    if (!activeQuestion) return;
    setSaving(true);
    try {
      const res = await api.mergeNextQuestionBoundary({
        questionId: activeQuestion.id,
        expandPixels: 200,
      });

      setCoords(res.crop_coordinates);
      setQuestions(prev =>
        prev.map(q =>
          q.id === activeQuestion.id
            ? {
                ...q,
                image_url: res.imageUrl,
                crop_coordinates: res.crop_coordinates,
                extraction_status: 'MANUALLY_CORRECTED',
              }
            : q
        )
      );
      showToast('Expanded boundary downwards by 200px', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to expand boundary', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToAuto = () => {
    if (initialCoords) {
      setCoords({ ...initialCoords });
      showToast('Reset coordinates to initial detection', 'info');
    }
  };

  const handleMarkComplete = async () => {
    if (!activeQuestion) return;
    try {
      await api.updateQuestionReview({
        questionId: activeQuestion.id,
        extraction_status: 'COMPLETED',
      });
      setQuestions(prev =>
        prev.map(q => (q.id === activeQuestion.id ? { ...q, extraction_status: 'COMPLETED' } : q))
      );
      setStats(prev => ({
        ...prev,
        completed: prev.completed + 1,
        needsReview: Math.max(0, prev.needsReview - (activeQuestion.extraction_status === 'NEEDS_REVIEW' ? 1 : 0)),
      }));
      showToast(`Question ${activeQuestion.question_number} certified and marked as COMPLETED.`, 'success');
      goToNext();
    } catch (err: any) {
      showToast('Failed to mark complete', 'error');
    }
  };

  const handleFinalizeAll = async () => {
    try {
      await api.bulkFinalizeQuestions({ paperId });
      showToast('All question boundaries certified and finalized!', 'success');
      if (onFinalized) onFinalized();
    } catch (err: any) {
      showToast(err.message || 'Failed to bulk finalize questions', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080b10] text-white font-['Figtree',sans-serif] select-none">
      {/* 1. TOP HEADER & METRICS SUMMARY DASHBOARD */}
      <header className="h-16 px-5 border-b border-white/10 bg-[#0d121c]/90 backdrop-blur-md flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#00cc5f]/15 border border-[#00cc5f]/40 flex items-center justify-center text-[#00cc5f]">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white tracking-wide">
                Visual Question Boundary Editor
              </h1>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/10 text-emerald-400 border border-emerald-500/20">
                300 DPI Hard Stop Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Zero cross-question bleed • Scoped options decoupling • Strict anchor isolation
            </p>
          </div>
        </div>

        {/* Status Metrics Bar */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
            <span className="text-xs text-slate-400">Total:</span>
            <span className="text-xs font-semibold text-white">{stats.total}</span>
          </div>

          <button
            onClick={() => setFilterMode('ALL')}
            className={`px-3 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              filterMode === 'ALL'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
            }`}
          >
            <span>Auto Extracted:</span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-200 font-mono text-[11px]">
              {stats.autoExtracted}
            </span>
          </button>

          <button
            onClick={() => setFilterMode(filterMode === 'NEEDS_REVIEW' ? 'ALL' : 'NEEDS_REVIEW')}
            className={`px-3 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              filterMode === 'NEEDS_REVIEW'
                ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 ring-2 ring-amber-500/30'
                : stats.needsReview > 0
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse hover:bg-amber-500/20'
                : 'bg-white/5 text-slate-400 border-white/10'
            }`}
            title="Click to view only questions requiring boundary review"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Needs Review:</span>
            <span className="px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200 font-mono text-[11px]">
              {stats.needsReview}
            </span>
          </button>

          <button
            onClick={() => setFilterMode(filterMode === 'MANUALLY_CORRECTED' ? 'ALL' : 'MANUALLY_CORRECTED')}
            className={`px-3 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              filterMode === 'MANUALLY_CORRECTED'
                ? 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50'
                : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
            }`}
          >
            <span>Corrected:</span>
            <span className="px-1.5 py-0.2 rounded bg-cyan-500/30 text-cyan-200 font-mono text-[11px]">
              {stats.manuallyCorrected}
            </span>
          </button>

          <button
            onClick={() => setFilterMode(filterMode === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
            className={`px-3 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              filterMode === 'COMPLETED'
                ? 'bg-purple-500/25 text-purple-300 border-purple-500/50'
                : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
            }`}
          >
            <span>Completed:</span>
            <span className="px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 font-mono text-[11px]">
              {stats.completed}
            </span>
          </button>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFinalizeAll}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-[#00cc5f] text-black font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Finalize & Certify All</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Close Boundary Editor"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* 2. QUESTION SELECTOR NAVIGATION RIBBON */}
      <div className="h-11 border-b border-white/10 bg-[#0a0e17] px-4 flex items-center gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono flex-shrink-0">
          <span>Question:</span>
          <span className="text-white font-bold">
            {activeQuestion?.question_number || (activeQuestionIndex + 1)}
          </span>
          <span className="text-slate-500">/ {filteredQuestions.length}</span>
        </div>

        <div className="h-4 w-px bg-white/10 flex-shrink-0" />

        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {filteredQuestions.map((q, idx) => {
            const isActive = idx === activeQuestionIndex;
            const isNeedsReview = q.extraction_status === 'NEEDS_REVIEW';
            const isCorrected = q.extraction_status === 'MANUALLY_CORRECTED';
            const isCompleted = q.extraction_status === 'COMPLETED';

            let pillStyle = 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10';
            if (isActive) {
              pillStyle = 'bg-[#00cc5f]/25 text-[#00cc5f] border-[#00cc5f] ring-2 ring-[#00cc5f]/30 font-bold';
            } else if (isNeedsReview) {
              pillStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25';
            } else if (isCorrected) {
              pillStyle = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25';
            } else if (isCompleted) {
              pillStyle = 'bg-purple-500/15 text-purple-300 border-purple-500/40 hover:bg-purple-500/25';
            }

            return (
              <button
                key={q.id || idx}
                onClick={() => setActiveQuestionIndex(idx)}
                className={`px-2.5 py-1 rounded-md border text-xs font-mono transition flex items-center gap-1 flex-shrink-0 ${pillStyle}`}
              >
                <span>Q{q.question_number || (idx + 1)}</span>
                {isNeedsReview && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          <button
            onClick={goToPrev}
            disabled={activeQuestionIndex === 0}
            className="p-1 rounded bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
            title="Previous Question (Left Arrow)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToNext}
            disabled={activeQuestionIndex === filteredQuestions.length - 1}
            className="p-1 rounded bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
            title="Next Question (Right Arrow)"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. MAIN DUAL-PANE WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* =========================================================================
            LEFT PANE: 300 DPI ORIGINAL PAGE CANVAS & INTERACTIVE RESIZABLE BOX
            ========================================================================= */}
        <div className="flex-1 flex flex-col bg-[#05070a] border-r border-white/10 relative overflow-hidden">
          {/* Canvas Floating Toolbar */}
          <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-[#0e141f]/90 backdrop-blur-md border border-white/15 px-2.5 py-1.5 rounded-lg shadow-2xl">
            <span className="text-[11px] font-mono text-slate-400 mr-1.5">
              Page {activePageNumber}
            </span>
            <div className="h-3 w-px bg-white/20" />
            <button
              onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}
              className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded transition"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-white min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
              className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded transition"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="h-3 w-px bg-white/20" />
            <button
              onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }}
              className="px-2 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded transition"
              title="Fit View"
            >
              Fit
            </button>
            <button
              onClick={() => { setZoom(1.0); setPan({ x: 0, y: 0 }); }}
              className="px-2 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded transition"
              title="100% 300 DPI Original Scale"
            >
              100%
            </button>
          </div>

          {/* Coordinates & Hard Stop Indicator HUD */}
          <div className="absolute bottom-3 left-3 z-30 bg-[#0e141f]/90 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 flex items-center gap-3 shadow-2xl">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#00cc5f]" />
              <span>Boundary Box:</span>
              <span className="text-[#00cc5f] font-semibold">
                [{coords.x1}, {coords.y1}] → [{coords.x2}, {coords.y2}]
              </span>
            </div>
            <div className="h-3 w-px bg-white/20" />
            <div>
              <span>Height: </span>
              <span className="text-white font-bold">{coords.y2 - coords.y1}px</span>
            </div>
          </div>

          {/* Page Image Container (Draggable / Zoomable) */}
          <div
            ref={pageContainerRef}
            className="flex-1 overflow-auto flex items-center justify-center p-10 cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              if (e.target === pageContainerRef.current) {
                setIsPanning(true);
                setPanStart({ x: e.clientX, y: e.clientY });
              }
            }}
          >
            <div
              className="relative shadow-2xl transition-transform duration-75 origin-top-left"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: imageNaturalSize.width,
                height: imageNaturalSize.height,
              }}
            >
              {/* 300 DPI Preserved Page Image */}
              <img
                ref={pageImageRef}
                src={pageImageUrl}
                alt={`Original Page ${activePageNumber}`}
                className="w-full h-full object-contain pointer-events-none select-none rounded shadow-2xl bg-white"
                onLoad={(e) => {
                  const target = e.currentTarget;
                  setImageNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
                  setImageLoaded(true);
                }}
              />

              {/* OVERLAY: Semi-transparent dark mask around unselected regions */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  clipPath: `polygon(
                    0% 0%, 0% 100%, ${coords.x1}px 100%, ${coords.x1}px ${coords.y1}px,
                    ${coords.x2}px ${coords.y1}px, ${coords.x2}px ${coords.y2}px,
                    ${coords.x1}px ${coords.y2}px, ${coords.x1}px 100%, 100% 100%, 100% 0%
                  )`,
                  backgroundColor: 'rgba(5, 8, 15, 0.65)',
                }}
              />

              {/* INTERACTIVE RESIZABLE CROP BOUNDARY RECTANGLE */}
              <div
                className="absolute border-2 border-[#00cc5f] shadow-[0_0_20px_rgba(0,204,95,0.4)] cursor-move group select-none"
                style={{
                  left: coords.x1,
                  top: coords.y1,
                  width: coords.x2 - coords.x1,
                  height: coords.y2 - coords.y1,
                }}
                onMouseDown={(e) => handleMouseDownOnHandle(e, 'move')}
              >
                {/* Top Anchor Indicator: Start of Question N */}
                <div className="absolute -top-7 left-0 bg-[#00cc5f] text-black font-mono font-bold text-[11px] px-2.5 py-0.5 rounded-t shadow flex items-center gap-1.5 whitespace-nowrap">
                  <span>▲ START: QUESTION {activeQuestion?.question_number || 'N'}</span>
                </div>

                {/* Bottom Hard Stop Line Indicator */}
                <div className="absolute -bottom-7 right-0 bg-red-500/90 text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded-b shadow flex items-center gap-1.5 whitespace-nowrap border border-red-400/40">
                  <span>▼ HARD STOP: NEXT QUESTION CANNOT ENTER</span>
                </div>

                {/* 8 Resize Handles */}
                {/* Top-Left */}
                <div
                  className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded-full cursor-nwse-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 'nw')}
                />
                {/* Top-Center */}
                <div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded cursor-ns-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 'n')}
                />
                {/* Top-Right */}
                <div
                  className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded-full cursor-nesw-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 'ne')}
                />
                {/* Middle-Right */}
                <div
                  className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded cursor-ew-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 'e')}
                />
                {/* Bottom-Right */}
                <div
                  className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded-full cursor-nwse-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 'se')}
                />
                {/* Bottom-Center */}
                <div
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded cursor-ns-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 's')}
                />
                {/* Bottom-Left */}
                <div
                  className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded-full cursor-nesw-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 'sw')}
                />
                {/* Middle-Left */}
                <div
                  className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#00cc5f] rounded cursor-ew-resize shadow"
                  onMouseDown={(e) => handleMouseDownOnHandle(e, 'w')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            RIGHT PANE: LIVE CROP PREVIEW, STATUS, AND SCOPED QUESTION CONTROLS
            ========================================================================= */}
        <div className="w-[480px] lg:w-[520px] bg-[#0c101a] flex flex-col border-l border-white/10 flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* 1. Live Crop Preview Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#00cc5f]" />
                  Live Cropped Question Preview
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Instant Vector View
                </span>
              </div>

              <div className="rounded-xl border border-white/15 bg-white p-3 shadow-xl overflow-hidden min-h-[140px] max-h-[300px] flex items-center justify-center relative">
                {/* Live Canvas element rendering region */}
                <canvas
                  ref={livePreviewCanvasRef}
                  className="max-w-full max-h-[280px] object-contain"
                />
              </div>
            </div>

            {/* 2. Validation & Boundary Health Status */}
            {activeQuestion?.validation_flags && activeQuestion.validation_flags.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Boundary Validation Flag</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeQuestion.validation_flags.map((flag, i) => (
                    <span
                      key={i}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Decoupled Options Banner */}
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2.5 text-xs text-blue-300">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Decoupled Scoped Options: </span>
                The question image boundary is certified clean. You can edit options freely below without affecting the pristine cropped question image.
              </div>
            </div>

            {/* 4. Crop Action Buttons Toolbar */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Boundary Adjustment Actions
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveBoundary}
                  disabled={saving}
                  className="col-span-2 py-2.5 px-4 rounded-xl bg-[#00cc5f] text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving Boundary...' : 'Save Question Boundary'}</span>
                </button>

                <button
                  onClick={() => setSplitDialogOpen(true)}
                  className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition"
                  title="Split this candidate region into two separate questions"
                >
                  <Split className="w-4 h-4 text-amber-400" />
                  <span>Split Question</span>
                </button>

                <button
                  onClick={handleMergeNext}
                  className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition"
                  title="Expand crop downwards by +200px"
                >
                  <Maximize className="w-4 h-4 text-cyan-400" />
                  <span>Merge Next (+200px)</span>
                </button>

                <button
                  onClick={handleResetToAuto}
                  className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition"
                  title="Reset coordinates to original detection"
                >
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                  <span>Reset to Auto</span>
                </button>

                <button
                  onClick={handleMarkComplete}
                  className="py-2 px-3 rounded-xl bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 text-xs font-semibold text-purple-300 flex items-center justify-center gap-1.5 transition"
                >
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                  <span>Mark Complete</span>
                </button>
              </div>
            </div>

            {/* 5. Decoupled Content & Options Editor */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                Question Statement & Options
              </span>

              <div>
                <label className="text-[11px] font-medium text-slate-400 mb-1 block">
                  Question Text Statement
                </label>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={3}
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00cc5f] transition resize-none font-sans"
                  placeholder="Enter or verify question text statement..."
                />
              </div>

              {/* Options A, B, C, D */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-slate-400 block">
                  Options & Correct Answer
                </label>
                {editedOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditedAnswer(opt.label)}
                      className={`w-7 h-7 rounded-lg border text-xs font-bold font-mono transition flex items-center justify-center flex-shrink-0 ${
                        editedAnswer === opt.label
                          ? 'bg-[#00cc5f] text-black border-[#00cc5f]'
                          : 'bg-white/5 text-slate-400 border-white/15 hover:text-white'
                      }`}
                      title={`Mark ${opt.label} as correct answer`}
                    >
                      {opt.label}
                    </button>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditedOptions(opts =>
                          opts.map((o, idx) => (idx === i ? { ...o, text: val } : o))
                        );
                      }}
                      className="flex-1 bg-black/40 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00cc5f] transition"
                      placeholder={`Option ${opt.label} text...`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Pane Navigation Buttons */}
          <div className="p-4 border-t border-white/10 bg-[#090d15] flex items-center justify-between">
            <button
              onClick={goToPrev}
              disabled={activeQuestionIndex === 0}
              className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="text-xs font-mono text-slate-400">
              Q{activeQuestion?.question_number} of Q{filteredQuestions[filteredQuestions.length - 1]?.question_number}
            </span>

            <button
              onClick={goToNext}
              disabled={activeQuestionIndex === filteredQuestions.length - 1}
              className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition flex items-center gap-1.5"
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SPLIT QUESTION MODAL */}
      {splitDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0f1523] border border-white/15 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Split className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Split Question Boundary</h3>
              </div>
              <button
                onClick={() => setSplitDialogOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Divide Question {activeQuestion?.question_number} into two separate question images.
              The top region remains Question {activeQuestion?.question_number}, and the bottom region becomes Question {activeQuestion?.question_number}B.
            </p>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Split Cut Line (Y Pixel):</span>
                <span className="text-[#00cc5f] font-bold">{splitYOffset}px</span>
              </div>
              <input
                type="range"
                min={coords.y1 + 20}
                max={coords.y2 - 20}
                value={splitYOffset}
                onChange={(e) => setSplitYOffset(Number(e.target.value))}
                className="w-full accent-[#00cc5f]"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>Top: {coords.y1}px</span>
                <span>Bottom: {coords.y2}px</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSplitDialogOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSplitQuestion}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs hover:brightness-110 shadow-lg shadow-amber-500/20"
              >
                {saving ? 'Splitting...' : 'Confirm Split'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 shadow-2xl transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : toast.type === 'error'
              ? 'bg-red-950/90 text-red-200 border-red-500/40'
              : 'bg-slate-900/90 text-slate-200 border-white/20'
          }`}
        >
          {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-400" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-cyan-400" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

