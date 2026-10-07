import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Layers,
  Award,
  Clock,
  Calendar,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Upload,
  RefreshCw,
  X,
  FileCheck,
  Globe,
  Sparkles,
  Lock,
  ShieldCheck,
  Download,
  Printer,
} from 'lucide-react';
import { api } from '../../api';
import { CompetitivePrintExaminationPaper } from './CompetitivePrintExaminationPaper';

export interface UploadedSubjectPdf {
  id: string;
  fileId?: string;
  name: string;
  size: number;
  status: 'PENDING' | 'EXTRACTING' | 'COMPLETED' | 'ERROR';
  extractedCount?: number;
  errorMessage?: string;
  poolId?: string;
  subjectId?: string;
  uploadedAt?: string;
}

export interface SubjectRule {
  id: string;
  subjectName: string;
  numberOfQuestions: number;
  questionType: 'MCQ' | 'Descriptive' | 'Mixed';
  marksPerQuestion: number;
  negativeMarks: number;
  translationRequired: boolean;
  translationLanguage?: string;
  subjectOrder: number;
  pdfs: UploadedSubjectPdf[];
}

export interface ExamDetails {
  id?: string;
  name: string;
  exam_type: string;
  duration_minutes?: number | string;
  exam_date?: string;
  exam_time?: string;
  instructions?: string;
}

export const getSuggestedSubjectsForExamType = (examType: string): SubjectRule[] => {
  switch (examType) {
    case 'JEE':
      return [
        {
          id: `subj-jee-phys-${Date.now()}-1`,
          subjectName: 'Physics',
          numberOfQuestions: 10,
          questionType: 'MCQ',
          marksPerQuestion: 4,
          negativeMarks: 1,
          translationRequired: false,
          subjectOrder: 1,
          pdfs: [],
        },
        {
          id: `subj-jee-chem-${Date.now()}-2`,
          subjectName: 'Chemistry',
          numberOfQuestions: 10,
          questionType: 'MCQ',
          marksPerQuestion: 4,
          negativeMarks: 1,
          translationRequired: false,
          subjectOrder: 2,
          pdfs: [],
        },
        {
          id: `subj-jee-math-${Date.now()}-3`,
          subjectName: 'Mathematics',
          numberOfQuestions: 10,
          questionType: 'MCQ',
          marksPerQuestion: 4,
          negativeMarks: 1,
          translationRequired: false,
          subjectOrder: 3,
          pdfs: [],
        },
      ];

    case 'NEET':
      return [
        {
          id: `subj-neet-phys-${Date.now()}-1`,
          subjectName: 'Physics',
          numberOfQuestions: 10,
          questionType: 'MCQ',
          marksPerQuestion: 4,
          negativeMarks: 1,
          translationRequired: false,
          subjectOrder: 1,
          pdfs: [],
        },
        {
          id: `subj-neet-chem-${Date.now()}-2`,
          subjectName: 'Chemistry',
          numberOfQuestions: 10,
          questionType: 'MCQ',
          marksPerQuestion: 4,
          negativeMarks: 1,
          translationRequired: false,
          subjectOrder: 2,
          pdfs: [],
        },
        {
          id: `subj-neet-bio-${Date.now()}-3`,
          subjectName: 'Biology',
          numberOfQuestions: 10,
          questionType: 'MCQ',
          marksPerQuestion: 4,
          negativeMarks: 1,
          translationRequired: false,
          subjectOrder: 3,
          pdfs: [],
        },
      ];

    case 'CET':
    case 'Entrance Examination':
    case 'Recruitment Examination':
    case 'Competitive Examination':
    case 'Other':
    default:
      return [];
  }
};

export interface BlueprintFormProps {
  examId: string;
  examDetails: ExamDetails;
  onUpdateExamDetails: (details: Partial<ExamDetails>) => void;
  subjects: SubjectRule[];
  onUpdateSubjects: (subjects: SubjectRule[]) => void;
  onSaveExamConfig?: (overrideDetails?: ExamDetails, overrideSubjects?: SubjectRule[]) => Promise<any>;
  onPaperGenerated?: (paper: any) => void;
}

const SUPPORTED_TRANSLATION_LANGUAGES = [
  'Marathi',
  'Hindi',
  'Gujarati',
  'Tamil',
  'Telugu',
  'Kannada',
  'Bengali',
  'Urdu',
  'Odia',
  'Punjabi',
];

const TRANSLATION_WORKFLOW_STAGES = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'IN_TRANSLATION', label: 'In Translation' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'FINAL_GENERATED', label: 'Final Generated' },
];

export const CompetitiveBlueprintForm: React.FC<BlueprintFormProps> = ({
  examId,
  examDetails,
  onUpdateExamDetails,
  subjects,
  onUpdateSubjects,
  onSaveExamConfig,
  onPaperGenerated,
}) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    subjectResults: Array<{
      subject: string;
      required: number;
      available: number;
      sourceCount: number;
      passed: boolean;
      message: string;
    }>;
    overallMessage: string;
  } | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedPaper, setGeneratedPaper] = useState<any | null>(null);
  const [showProvenanceDrawer, setShowProvenanceDrawer] = useState(false);
  const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});
  const [isValidated, setIsValidated] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<string[]>([]);
  const [generatedSuccessMsg, setGeneratedSuccessMsg] = useState(false);

  // Paper-level Translation Approval Workflow state (Competitive Exam ONLY)
  const [enableTranslation, setEnableTranslation] = useState<boolean>(() =>
    subjects.some(s => Boolean(s.translationRequired))
  );
  const [translationLanguage, setTranslationLanguage] = useState<string>(() => {
    const subWithLang = subjects.find(s => s.translationRequired && s.translationLanguage);
    return subWithLang?.translationLanguage || 'Marathi';
  });
  const [isRefreshingPaperStatus, setIsRefreshingPaperStatus] = useState(false);
  const [isGeneratingFinalBilingual, setIsGeneratingFinalBilingual] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isPrintingPaper, setIsPrintingPaper] = useState(false);

  // Finalize & Encrypt Paper (Centre Delivery & Server Time-Lock) state
  const getTodayLocalYMD = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [showFinalizePanel, setShowFinalizePanel] = useState(false);
  const [scheduleExamDate, setScheduleExamDate] = useState<string>(
    examDetails.exam_date || getTodayLocalYMD()
  );
  const [encryptionTimeInput, setEncryptionTimeInput] = useState<string>('09:00');
  const [decryptionTimeInput, setDecryptionTimeInput] = useState<string>('10:00');
  const [scheduleTimezone, setScheduleTimezone] = useState<string>('Asia/Kolkata (IST, UTC+05:30)');
  const [availableOperators, setAvailableOperators] = useState<
    Array<{ id: string; fullName: string; email: string; centreId: string; centreLabel: string }>
  >([]);
  const [assignedOperatorId, setAssignedOperatorId] = useState<string>('usr-operator-01');
  const [isFinalizingEncrypt, setIsFinalizingEncrypt] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetReason, setResetReason] = useState('Authorized schedule adjustment by Examination Manager');
  const [isResettingSchedule, setIsResettingSchedule] = useState(false);

  const formatTime24To12 = (time24: string): string => {
    if (!time24) return '';
    const m = time24.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return time24;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 === 0 ? 12 : h % 12;
    return `${h}:${min} ${ampm}`;
  };

  const display12To24 = (displayStr?: string | null, fallback = '09:00'): string => {
    if (!displayStr) return fallback;
    const ampm = displayStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = ampm[2];
      const p = ampm[3].toUpperCase();
      if (p === 'PM' && h < 12) h += 12;
      if (p === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${m}`;
    }
    const h24 = displayStr.trim().match(/^(\d{1,2}):(\d{2})/);
    if (h24) return `${String(parseInt(h24[1], 10)).padStart(2, '0')}:${h24[2]}`;
    return fallback;
  };

  // Fetch Centre Superintendents & Operators
  const fetchOperators = async () => {
    try {
      const resp = await api.competitive.getOperators();
      if (resp && resp.success && Array.isArray(resp.operators)) {
        setAvailableOperators(resp.operators);
        if (resp.operators.length > 0 && !assignedOperatorId) {
          setAssignedOperatorId(resp.operators[0].id);
        }
      }
    } catch {}
  };

  // Fetch real verified question pool counts and reconcile subject PDF status from database
  const fetchAvailablePoolCounts = async (overrideSubjects?: SubjectRule[]) => {
    if (!examId) return;
    const targetSubjects = overrideSubjects || subjects;
    try {
      // 1. Reconcile pool files for this exam (auto-healing any file that finished extracting in SQLite)
      const poolsResp = await api.competitive.getQuestionPools(examId);
      const poolFiles = poolsResp?.success && Array.isArray(poolsResp.pools) ? poolsResp.pools : [];

      let reconciledSubjects = targetSubjects;
      if (poolFiles.length > 0 && targetSubjects.length > 0) {
        let changed = false;
        reconciledSubjects = targetSubjects.map(sub => {
          const matchedFiles = poolFiles.filter((f: any) => {
            if (f.subject_id && sub.id && f.subject_id === sub.id) return true;
            if (sub.subjectName && sub.subjectName.trim()) {
              return (f.subject_name || '').trim().toLowerCase() === sub.subjectName.trim().toLowerCase();
            }
            return false;
          });
          if (matchedFiles.length === 0) return sub;

          const currentPdfs = [...(sub.pdfs || [])];
          for (const mf of matchedFiles) {
            const countVal = Number(mf.question_count || 0);
            const statusVal = countVal > 0 ? 'COMPLETED' : mf.status || 'COMPLETED';
            const idx = currentPdfs.findIndex(
              p => p.id === mf.id || p.fileId === mf.id || p.name === mf.file_name
            );
            if (idx !== -1) {
              if (
                currentPdfs[idx].status !== statusVal ||
                Number(currentPdfs[idx].extractedCount || 0) !== countVal
              ) {
                currentPdfs[idx] = {
                  ...currentPdfs[idx],
                  id: mf.id,
                  fileId: mf.id,
                  status: statusVal,
                  extractedCount: countVal,
                  errorMessage: undefined,
                };
                changed = true;
              }
            } else {
              currentPdfs.push({
                id: mf.id,
                fileId: mf.id,
                name: mf.file_name,
                size: mf.file_size || 0,
                status: statusVal,
                extractedCount: countVal,
                subjectId: sub.id,
                uploadedAt: mf.uploaded_at,
              });
              changed = true;
            }
          }
          return changed ? { ...sub, pdfs: currentPdfs } : sub;
        });

        if (changed) {
          onUpdateSubjects(reconciledSubjects);
        }
      }

      // 2. Validate blueprint against current subjects if any exist
      if (reconciledSubjects.length > 0) {
        const resp = await api.competitive.validateBlueprint(examId, { subjects: reconciledSubjects });
        if (resp && resp.success && Array.isArray(resp.subjectResults)) {
          const counts: Record<string, number> = {};
          resp.subjectResults.forEach((r: any) => {
            if (r.subjectId) counts[r.subjectId] = r.available;
            if (r.subject) counts[r.subject.trim().toLowerCase()] = r.available;
          });
          setAvailableCounts(counts);
          setValidationResult({
            valid: Boolean(resp.valid),
            subjectResults: resp.subjectResults,
            overallMessage: resp.overallMessage || '',
          });
          setIsValidated(Boolean(resp.valid));
        }
      }
    } catch (err) {
      console.warn('Notice fetching available question pool counts:', err);
    }
  };

  // Load latest generated paper (and live translation approval status) for this exam
  const fetchLatestPaperForExam = async (silent = false) => {
    if (!examId) return;
    if (!silent) setIsRefreshingPaperStatus(true);
    try {
      const resp = await api.competitive.getPapersByExam(examId);
      if (resp && resp.success && resp.latestPaper) {
        const lp = resp.latestPaper;
        setGeneratedPaper(lp);
        setIsValidated(true);
        if (!examDetails.name && lp.title) {
          onUpdateExamDetails({
            name: lp.title,
            exam_type: lp.examType || examDetails.exam_type || 'Competitive Examination',
            duration_minutes: lp.durationMinutes || examDetails.duration_minutes || 180,
            exam_date: lp.examDate || examDetails.exam_date || '',
            exam_time: lp.examTime || examDetails.exam_time || '',
            instructions: lp.instructions || examDetails.instructions || '',
          });
        }
        if (subjects.length === 0 && Array.isArray(lp.blueprint?.subjects) && lp.blueprint.subjects.length > 0) {
          onUpdateSubjects(lp.blueprint.subjects.map((s: any) => ({ ...s, pdfs: s.pdfs || [] })));
        }
        if (lp.enableTranslation) {
          setEnableTranslation(true);
          if (lp.translationLanguage) {
            setTranslationLanguage(lp.translationLanguage);
          }
        }
        if (lp.scheduleExamDate) setScheduleExamDate(lp.scheduleExamDate);
        if (lp.encryptionTimeDisplay) {
          setEncryptionTimeInput(display12To24(lp.encryptionTimeDisplay, '09:00'));
        }
        if (lp.decryptionTimeDisplay) {
          setDecryptionTimeInput(display12To24(lp.decryptionTimeDisplay, '10:00'));
        }
        if (lp.scheduleTimezone) setScheduleTimezone(lp.scheduleTimezone);
        if (lp.assignedOperatorId) setAssignedOperatorId(lp.assignedOperatorId);
      }
    } catch (err) {
      console.warn('Notice fetching latest competitive paper for exam:', err);
    } finally {
      if (!silent) setIsRefreshingPaperStatus(false);
    }
  };

  useEffect(() => {
    setValidationResult(null);
    setGeneratedPaper(null);
    setIsValidated(false);
    setGenerationError(null);
    setGeneratedSuccessMsg(false);
    setGenerationSteps([]);
    setFinalizeMsg(null);
    setShowFinalizePanel(false);
    setAvailableCounts({});
    setEnableTranslation(subjects.some(s => Boolean(s.translationRequired)));
    const subWithLang = subjects.find(s => s.translationRequired && s.translationLanguage);
    setTranslationLanguage(subWithLang?.translationLanguage || 'Marathi');
    setEncryptionTimeInput('09:00');
    setDecryptionTimeInput('10:00');
    setScheduleExamDate(examDetails.exam_date || getTodayLocalYMD());
    fetchOperators();
    fetchAvailablePoolCounts();
    fetchLatestPaperForExam(true);
  }, [examId]);

  const subjectSignature = subjects.map(s => `${s.id}:${s.subjectName}:${(s.pdfs || []).length}`).join('|');
  useEffect(() => {
    if (!examId || subjects.length === 0) return;
    fetchAvailablePoolCounts(subjects);
  }, [examId, subjectSignature]);

  // Poll live translation & encryption status without regenerating paper
  useEffect(() => {
    if (!generatedPaper?.id) return;
    const timer = setInterval(() => {
      fetchLatestPaperForExam(true);
    }, 6000);
    return () => clearInterval(timer);
  }, [generatedPaper?.id, examId]);

  const handleFinalizeAndEncryptPaper = async () => {
    if (!generatedPaper?.id) return;
    setIsFinalizingEncrypt(true);
    setFinalizeMsg(null);
    try {
      const effectiveDate = scheduleExamDate || examDetails.exam_date || getTodayLocalYMD();
      const tzOffset = scheduleTimezone.includes('UTC+00:00') ? '+00:00' : '+05:30';
      const encIso = `${effectiveDate}T${encryptionTimeInput}:00${tzOffset}`;
      const decIso = `${effectiveDate}T${decryptionTimeInput}:00${tzOffset}`;

      const selectedOp = availableOperators.find(o => o.id === assignedOperatorId);

      const resp = await api.competitive.finalizeAndEncryptPaper(generatedPaper.id, {
        exam_date: effectiveDate,
        encryption_time: formatTime24To12(encryptionTimeInput),
        decryption_time: formatTime24To12(decryptionTimeInput),
        encryption_time_iso: encIso,
        decryption_time_iso: decIso,
        timezone: scheduleTimezone,
        timezone_offset: tzOffset,
        assigned_operator_id: assignedOperatorId,
        assigned_centre_code: selectedOp?.centreLabel || 'CTR-101 — Manoj Kumar (Centre Superintendent)',
      });

      if (resp && resp.success && resp.paper) {
        setGeneratedPaper(resp.paper);
        setFinalizeMsg({
          type: 'success',
          text: resp.message,
        });
        if (onPaperGenerated) onPaperGenerated(resp.paper);
      }
    } catch (err: any) {
      setFinalizeMsg({
        type: 'error',
        text: err.message || 'Failed to finalize and encrypt competitive paper.',
      });
    } finally {
      setIsFinalizingEncrypt(false);
    }
  };

  const handleResetFinalizationSchedule = async () => {
    if (!generatedPaper?.id) return;
    setIsResettingSchedule(true);
    setFinalizeMsg(null);
    try {
      const resp = await api.competitive.resetFinalization(generatedPaper.id, resetReason);
      if (resp && resp.success && resp.paper) {
        setGeneratedPaper(resp.paper);
        setShowResetModal(false);
        setFinalizeMsg({
          type: 'success',
          text: resp.message,
        });
      }
    } catch (err: any) {
      setFinalizeMsg({
        type: 'error',
        text: err.message || 'Failed to reset encryption schedule.',
      });
    } finally {
      setIsResettingSchedule(false);
    }
  };

  const handleDownloadPaperPdf = async () => {
    if (!generatedPaper?.id) return;
    setIsDownloadingPdf(true);
    setFinalizeMsg(null);
    try {
      const mode =
        generatedPaper.enableTranslation &&
        (generatedPaper.translationStatus === 'FINAL_GENERATED' ||
          generatedPaper.translationProgress?.allApproved)
          ? 'bilingual'
          : 'original';
      const blob = await api.competitive.downloadPaperPdf(generatedPaper.id, mode);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (generatedPaper.title || examDetails.name || 'Competitive_Exam_Paper')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 60);
      a.href = url;
      a.download = `${safeName}_${generatedPaper.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setFinalizeMsg({
        type: 'success',
        text: `Downloaded "${safeName}_${generatedPaper.id}.pdf" from the single generated paper.`,
      });
    } catch (err: any) {
      setFinalizeMsg({
        type: 'error',
        text: err.message || 'Failed to download Competitive Exam PDF.',
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrintSinglePaper = async () => {
    if (!generatedPaper?.id) return;
    setIsPrintingPaper(true);
    setFinalizeMsg(null);
    try {
      if (generatedPaper.isFinalized && !generatedPaper.isTimeLocked) {
        try {
          const resp = await api.competitive.printPaper(generatedPaper.id, 1);
          if (resp?.paper) {
            setGeneratedPaper(resp.paper);
          }
        } catch {}
      }
      const printEl = document.getElementById('competitive-single-paper-document');
      if (printEl) {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map(node => node.outerHTML)
          .join('\n');

        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${generatedPaper.title || examDetails.name || 'Competitive Examination Paper'}</title>
    ${styles}
    <style>
      @page { size: A4; margin: 12mm; }
      body { background: #ffffff !important; color: #000000 !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
  </head>
  <body>
    ${printEl.innerHTML}
  </body>
</html>`);
          doc.close();
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 2000);
          }, 350);
        }
      } else {
        window.print();
      }
    } catch (err: any) {
      setFinalizeMsg({
        type: 'error',
        text: err.message || 'Failed to print Competitive Exam paper.',
      });
    } finally {
      setIsPrintingPaper(false);
    }
  };

  // Toggle Paper-Level "Enable Translation?" and sync with subject cards
  const handleTogglePaperTranslation = (enabled: boolean, lang?: string) => {
    const targetLang = lang || translationLanguage || 'Marathi';
    setEnableTranslation(enabled);
    if (lang) setTranslationLanguage(lang);
    const updated = subjects.map(s => ({
      ...s,
      translationRequired: enabled,
      translationLanguage: enabled ? targetLang : s.translationLanguage || 'Marathi',
    }));
    onUpdateSubjects(updated);
  };

  // Helper to format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Add a new independent subject (Requirement 7 & 8)
  const handleAddSubject = () => {
    const nextOrder = subjects.length + 1;
    const newSubject: SubjectRule = {
      id: `subj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      subjectName: '',
      numberOfQuestions: 10,
      questionType: 'MCQ',
      marksPerQuestion: 4,
      negativeMarks: 1,
      translationRequired: enableTranslation,
      translationLanguage: translationLanguage || 'Marathi',
      subjectOrder: nextOrder,
      pdfs: [], // Independent empty PDF list
    };
    onUpdateSubjects([...subjects, newSubject]);
  };

  // Remove a subject
  const handleRemoveSubject = (id: string) => {
    const filtered = subjects.filter(s => s.id !== id);
    const reordered = filtered.map((s, idx) => ({ ...s, subjectOrder: idx + 1 }));
    onUpdateSubjects(reordered);
    setValidationResult(null);
  };

  // Update a single subject field (Requirement 7: ensures independent card state)
  const handleUpdateSubjectField = (id: string, field: keyof SubjectRule, value: any) => {
    const updated = subjects.map(s => {
      if (s.id !== id) return s;
      return { ...s, [field]: value };
    });
    if (field === 'translationRequired' && value === true) {
      setEnableTranslation(true);
    } else if (field === 'translationRequired' && value === false) {
      const anyStillEnabled = updated.some(s => s.translationRequired);
      setEnableTranslation(anyStillEnabled);
    }
    if (field === 'translationLanguage' && value) {
      setTranslationLanguage(String(value));
    }
    onUpdateSubjects(updated);
    setValidationResult(null);
  };

  // Upload PDFs directly to a specific subject (Requirement 4 & 5)
  const handleUploadPdfsForSubject = async (sub: SubjectRule, files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!sub.subjectName.trim()) {
      alert('Please enter a Subject Name before uploading PDFs for this subject.');
      return;
    }

    const newPdfItems: UploadedSubjectPdf[] = Array.from(files).map(f => ({
      id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      size: f.size,
      status: 'EXTRACTING',
      subjectId: sub.id,
    }));

    // Maintain running subject list to prevent stale closure wipes across async iterations
    let activeSubjects = subjects.map(s => {
      if (s.id !== sub.id) return s;
      return { ...s, pdfs: [...(s.pdfs || []), ...newPdfItems] };
    });
    onUpdateSubjects(activeSubjects);
    setValidationResult(null);

    // Extract each file via backend API
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pdfItem = newPdfItems[i];

      try {
        const base64Data = await fileToBase64(file);
        const resp = await api.competitive.uploadSubjectPdf({
          exam_id: examId,
          subject_id: sub.id,
          subject_name: sub.subjectName,
          subject: sub.subjectName,
          file_name: file.name,
          file_data: base64Data,
          marks_per_question: sub.marksPerQuestion,
          negative_marks: sub.negativeMarks,
        });

        if (resp && resp.success) {
          activeSubjects = activeSubjects.map(s => {
            if (s.id !== sub.id) return s;
            const currentPdfs = [...(s.pdfs || [])];
            const targetIdx = currentPdfs.findIndex(p => p.id === pdfItem.id || p.name === file.name);
            const completedPdf: UploadedSubjectPdf = {
              id: resp.fileId || pdfItem.id,
              fileId: resp.fileId || pdfItem.id,
              name: file.name,
              size: file.size,
              status: 'COMPLETED',
              extractedCount: resp.extractedCount || resp.questions?.length || 0,
              poolId: resp.poolId || resp.fileId,
              subjectId: sub.id,
              uploadedAt: new Date().toISOString(),
            };

            if (targetIdx !== -1) {
              currentPdfs[targetIdx] = completedPdf;
            } else {
              currentPdfs.push(completedPdf);
            }
            return { ...s, pdfs: currentPdfs };
          });
          onUpdateSubjects(activeSubjects);
        } else {
          throw new Error((resp as any)?.error || 'Extraction failed.');
        }
      } catch (err: any) {
        activeSubjects = activeSubjects.map(s => {
          if (s.id !== sub.id) return s;
          const currentPdfs = [...(s.pdfs || [])];
          const targetIdx = currentPdfs.findIndex(p => p.id === pdfItem.id || p.name === file.name);
          if (targetIdx !== -1) {
            currentPdfs[targetIdx] = {
              ...currentPdfs[targetIdx],
              status: 'ERROR',
              errorMessage: err.message || 'Extraction error',
            };
          }
          return { ...s, pdfs: currentPdfs };
        });
        onUpdateSubjects(activeSubjects);
      }
    }
    // Refresh real-time available counts & validation state from database after extraction
    if (examDetails.name && examDetails.name.trim() && onSaveExamConfig) {
      await onSaveExamConfig(examDetails, activeSubjects);
    }
    await fetchAvailablePoolCounts(activeSubjects);
  };

  // Remove a PDF from a subject card
  const handleRemovePdf = async (subId: string, pdfItem: UploadedSubjectPdf) => {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;

    try {
      await api.competitive.deletePoolFile({
        exam_id: examId,
        subject_id: sub.id,
        file_id: pdfItem.fileId || pdfItem.id,
        source_pdf: pdfItem.name,
        subject: sub.subjectName,
      });
    } catch (err) {
      console.warn('Notice removing pool file from backend:', err);
    }

    const updated = subjects.map(s => {
      if (s.id !== subId) return s;
      return {
        ...s,
        pdfs: (s.pdfs || []).filter(
          p => p.id !== pdfItem.id && p.fileId !== pdfItem.fileId && p.name !== pdfItem.name
        ),
      };
    });
    onUpdateSubjects(updated);
    setValidationResult(null);
    setIsValidated(false);
    setGeneratedSuccessMsg(false);
    await fetchAvailablePoolCounts(updated);
  };

  // Validate Blueprint Action (Requirement 4)
  const handleValidateBlueprint = async () => {
    setIsValidating(true);
    setGenerationError(null);
    setGeneratedSuccessMsg(false);
    try {
      const effectiveDetails: ExamDetails = {
        ...examDetails,
        name:
          (examDetails.name || '').trim() ||
          (subjects[0]?.subjectName?.trim()
            ? `${subjects[0].subjectName.trim()} Competitive Examination`
            : 'Competitive Examination 2026'),
        exam_type: (examDetails.exam_type || '').trim() || 'Competitive Examination',
      };
      if (effectiveDetails.name !== examDetails.name || effectiveDetails.exam_type !== examDetails.exam_type) {
        onUpdateExamDetails({
          name: effectiveDetails.name,
          exam_type: effectiveDetails.exam_type,
        });
      }
      if (onSaveExamConfig) {
        await onSaveExamConfig(effectiveDetails, subjects);
      }
      const resp = await api.competitive.validateBlueprint(examId, { subjects });
      if (resp && resp.success) {
        setValidationResult({
          valid: resp.valid,
          subjectResults: resp.subjectResults || [],
          overallMessage: resp.overallMessage || '',
        });
        setIsValidated(resp.valid);

        // Update real available counts from database
        const counts: Record<string, number> = {};
        (resp.subjectResults || []).forEach((r: any) => {
          if (r.subjectId) counts[r.subjectId] = r.available;
          if (r.subject) counts[r.subject.trim().toLowerCase()] = r.available;
        });
        setAvailableCounts(counts);
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to validate blueprint.');
      setIsValidated(false);
    } finally {
      setIsValidating(false);
    }
  };

  // Generate Final Paper Action (Single-instance preview workflow — never duplicates)
  const handleGenerateFinalPaper = async () => {
    if (generatedPaper?.id && Number(generatedPaper.totalQuestions) === Number(totalQuestions)) {
      document.getElementById('competitive-single-paper-preview')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedSuccessMsg(false);
    setGenerationSteps(['Initializing Competitive Examination Generation Engine...']);

    try {
      const effectiveDetails: ExamDetails = {
        ...examDetails,
        name:
          (examDetails.name || '').trim() ||
          (subjects[0]?.subjectName?.trim()
            ? `${subjects[0].subjectName.trim()} Competitive Examination`
            : 'Competitive Examination 2026'),
        exam_type: (examDetails.exam_type || '').trim() || 'Competitive Examination',
      };
      if (effectiveDetails.name !== examDetails.name || effectiveDetails.exam_type !== examDetails.exam_type) {
        onUpdateExamDetails({
          name: effectiveDetails.name,
          exam_type: effectiveDetails.exam_type,
        });
      }
      if (onSaveExamConfig) {
        await onSaveExamConfig(effectiveDetails, subjects);
      }

      // 1. Re-validate against current backend database state
      const valResp = await api.competitive.validateBlueprint(examId, { subjects });
      if (!valResp?.valid) {
        setValidationResult(valResp);
        setIsValidated(false);
        const failing = valResp?.subjectResults?.find((r: any) => !r.passed);
        throw new Error(
          failing?.message ||
            'One or more subjects have insufficient verified questions. Please upload additional PDF pools.'
        );
      }
      setValidationResult(valResp);
      setIsValidated(true);

      // 2. Progression feedback (Requirement 11)
      for (const sub of subjects) {
        setGenerationSteps(prev => [...prev, `Preparing ${sub.subjectName || 'Subject'} questions...`]);
        await new Promise(r => setTimeout(r, 200));
      }

      const isTranslationEnabled = enableTranslation || subjects.some(s => s.translationRequired);
      const selectedLanguage =
        translationLanguage ||
        subjects.find(s => s.translationRequired && s.translationLanguage)?.translationLanguage ||
        'Marathi';

      if (isTranslationEnabled) {
        setGenerationSteps(prev => [
          ...prev,
          `Preserving Original English Paper & assigning all questions to ${selectedLanguage} Translator...`,
        ]);
        await new Promise(r => setTimeout(r, 200));
      }

      setGenerationSteps(prev => [...prev, 'Assembling sequential sections and applying ZeroLeak watermark...']);

      // 3. Generate Final Paper (and assign to Translator if translation is enabled)
      const resp = await api.competitive.generateFinalPaper(
        examId,
        {
          subjects,
          enableTranslation: isTranslationEnabled,
          translationLanguage: isTranslationEnabled ? selectedLanguage : undefined,
        },
        {
          enable_translation: isTranslationEnabled,
          translation_language: isTranslationEnabled ? selectedLanguage : undefined,
          exam_details: effectiveDetails,
        }
      );
      if (resp && resp.success && resp.paper) {
        setGenerationSteps(prev => [
          ...prev,
          isTranslationEnabled
            ? `✓ Original English paper generated and all ${resp.paper.totalQuestions} questions assigned to ${selectedLanguage} Translator.`
            : '✓ Final paper generated successfully.',
        ]);
        setGeneratedPaper(resp.paper);
        setGeneratedSuccessMsg(true);
        if (onPaperGenerated) onPaperGenerated(resp.paper);
        setTimeout(() => {
          document.getElementById('competitive-single-paper-preview')?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      } else {
        throw new Error((resp as any)?.error || 'Generation failed.');
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to generate final competitive examination paper.');
      setGeneratedSuccessMsg(false);
    } finally {
      setIsGenerating(false);
    }
  };

  // Apply Approved Translations to the single generated paper in-place (without duplicating paper)
  const handleGenerateFinalBilingualPaper = async () => {
    if (!generatedPaper?.id) return;
    setIsGeneratingFinalBilingual(true);
    setGenerationError(null);
    try {
      const resp = await api.competitive.generateFinalBilingualPaper(generatedPaper.id);
      if (resp && resp.success && resp.paper) {
        setGeneratedPaper(resp.paper);
        setFinalizeMsg({
          type: 'success',
          text: resp.message || 'Approved translations applied to the single paper preview.',
        });
        if (onPaperGenerated) onPaperGenerated(resp.paper);
      } else {
        throw new Error((resp as any)?.error || 'Failed to apply approved translations.');
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to apply approved translations to competitive paper.');
    } finally {
      setIsGeneratingFinalBilingual(false);
    }
  };

  // Automatic Blueprint Calculations (Requirement 6 & 10)
  const totalQuestions = subjects.reduce((sum, s) => sum + (Number(s.numberOfQuestions) || 0), 0);
  const totalAvailableQuestions = subjects.reduce((sum, s) => {
    const norm = (s.subjectName || '').trim().toLowerCase();
    const dbCount = availableCounts[s.id] ?? availableCounts[norm];
    const pdfSum = (s.pdfs || []).reduce((acc, p) => acc + (p.extractedCount || 0), 0);
    const count = dbCount !== undefined ? Math.max(dbCount, pdfSum) : pdfSum;
    return sum + count;
  }, 0);
  const totalMarks = subjects.reduce(
    (sum, s) => sum + (Number(s.numberOfQuestions) || 0) * (Number(s.marksPerQuestion) || 0),
    0
  );
  const totalPositiveMarks = totalMarks;
  const totalNegativeMarks = subjects.reduce(
    (sum, s) => sum + (Number(s.numberOfQuestions) || 0) * (Number(s.negativeMarks) || 0),
    0
  );
  const totalPdfsUploaded = subjects.reduce((sum, s) => sum + (s.pdfs?.length || 0), 0);

  const handleExamTypeChange = (newType: string) => {
    onUpdateExamDetails({ exam_type: newType });
    const suggested = getSuggestedSubjectsForExamType(newType).map(s => ({
      ...s,
      translationRequired: enableTranslation,
      translationLanguage: translationLanguage || 'Marathi',
    }));
    // Never overwrite existing configured subjects or uploaded PDFs when switching exam type
    const hasUploadedPdfsOrCustomSubjects =
      subjects.length > 0 && subjects.some(s => (s.pdfs || []).length > 0 || s.subjectName.trim().length > 0);
    if (suggested.length > 0 && !hasUploadedPdfsOrCustomSubjects) {
      onUpdateSubjects(suggested);
    }
  };

  // Client-side Validation Checks
  const validationErrors: string[] = [];
  if (subjects.length === 0) validationErrors.push('Please add at least one subject to the blueprint.');

  const subjectNamesSeen = new Set<string>();
  subjects.forEach((s, idx) => {
    if (!s.subjectName.trim()) {
      validationErrors.push(`Subject #${idx + 1} Name cannot be empty.`);
    } else {
      const lower = s.subjectName.trim().toLowerCase();
      if (subjectNamesSeen.has(lower)) {
        validationErrors.push(`Duplicate subject name: "${s.subjectName}". Each subject must be unique.`);
      }
      subjectNamesSeen.add(lower);
    }
    if ((Number(s.numberOfQuestions) || 0) <= 0) {
      validationErrors.push(`Subject "${s.subjectName || `#${idx + 1}`}" requires at least 1 question.`);
    }
    if ((Number(s.marksPerQuestion) || 0) <= 0) {
      validationErrors.push(`Subject "${s.subjectName || `#${idx + 1}`}" marks must be greater than 0.`);
    }
    if (s.translationRequired && (!s.translationLanguage || !s.translationLanguage.trim())) {
      validationErrors.push(`Subject "${s.subjectName || `#${idx + 1}`}" requires translation, but language is missing.`);
    }
  });

  const isFormValid = validationErrors.length === 0;

  // Check if all configured subjects have sufficient extracted questions ready in the pool
  const areAllSubjectsReady =
    isFormValid &&
    subjects.length > 0 &&
    subjects.every(s => {
      const reqCount = Number(s.numberOfQuestions) || 0;
      const norm = (s.subjectName || '').trim().toLowerCase();
      const dbCount = availableCounts[s.id] ?? availableCounts[norm];
      const pdfSum = (s.pdfs || []).reduce((acc, p) => acc + (p.extractedCount || 0), 0);
      const avail = dbCount !== undefined ? Math.max(dbCount, pdfSum) : pdfSum;
      return reqCount > 0 && avail >= reqCount;
    });

  const canGeneratePaper = Boolean(
    generatedPaper || areAllSubjectsReady || (isValidated && validationResult?.valid)
  );

  const STANDARD_EXAM_TYPES = [
    'NEET',
    'JEE',
    'CET',
    'Entrance Examination',
    'Recruitment Examination',
    'Competitive Examination',
    'Other',
  ];

  const watermarkString = `ZeroLeak Security Enclave • ${examDetails.name || 'Competitive Examination'} • ${new Date().toISOString()} • Fingerprint: ${
    generatedPaper?.paperFingerprint?.slice(0, 16) || 'AUTH-VERIFIED'
  }`;

  return (
    <div className="space-y-8">
      {/* ========================================================================= */}
      {/* 1. EXAM DETAILS FORM (Requirement 4)                                      */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Examination Details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Specify the examination name, category, timing, candidate instructions, and regional translation workflow.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="md:col-span-2 space-y-1">
            <label className="block text-slate-700 font-bold">
              Exam Name *
            </label>
            <input
              type="text"
              value={examDetails.name || ''}
              onChange={e => onUpdateExamDetails({ name: e.target.value })}
              placeholder="Enter Examination Name (e.g. Joint Entrance Examination 2026)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-bold">
              Exam Type *
            </label>
            <select
              value={examDetails.exam_type || 'Competitive Examination'}
              onChange={e => handleExamTypeChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
            >
              <option value="">Select Exam Type</option>
              {examDetails.exam_type &&
                !STANDARD_EXAM_TYPES.includes(examDetails.exam_type) && (
                  <option value={examDetails.exam_type}>{examDetails.exam_type}</option>
                )}
              <option value="NEET">NEET</option>
              <option value="JEE">JEE</option>
              <option value="CET">CET</option>
              <option value="Entrance Examination">Entrance Examination</option>
              <option value="Recruitment Examination">Recruitment Examination</option>
              <option value="Competitive Examination">Competitive Examination</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Exam Duration (Minutes)</span>
            </label>
            <input
              type="number"
              min={15}
              max={600}
              value={examDetails.duration_minutes ?? ''}
              onChange={e => onUpdateExamDetails({ duration_minutes: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="e.g. 180"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Exam Date</span>
            </label>
            <input
              type="date"
              value={examDetails.exam_date || ''}
              onChange={e => onUpdateExamDetails({ exam_date: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-slate-700 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Exam Time / Session</span>
            </label>
            <input
              type="text"
              value={examDetails.exam_time || ''}
              onChange={e => onUpdateExamDetails({ exam_time: e.target.value })}
              placeholder="e.g. 09:00 AM - 12:00 PM IST or Morning Session"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
            />
          </div>

          <div className="md:col-span-3 space-y-1">
            <label className="block text-slate-700 font-bold flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Instructions</span>
            </label>
            <textarea
              rows={2}
              value={examDetails.instructions || ''}
              onChange={e => onUpdateExamDetails({ instructions: e.target.value })}
              placeholder="Enter examination instructions for candidates..."
              className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden resize-none"
            />
          </div>

          {/* Competitive Exam Translator Approval Workflow Toggle (Steps 1, 2, 3) */}
          <div className="md:col-span-3 pt-2">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-white border border-slate-200 text-slate-800 shrink-0 mt-0.5">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Enable Translation? (Competitive Exam Translator Approval Workflow)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800 uppercase">
                      Competitive Only
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    When enabled, generating the paper preserves the Original English Paper and automatically assigns all paper questions to the regional Translator (e.g., Marathi Translator) for approval before generating the Final Bilingual (English + Marathi) Paper.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">Enable Translation?</label>
                  <select
                    value={enableTranslation ? 'YES' : 'NO'}
                    onChange={e => handleTogglePaperTranslation(e.target.value === 'YES')}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold text-xs shadow-2xs"
                  >
                    <option value="NO">No (English Only)</option>
                    <option value="YES">Yes (Send to Translator)</option>
                  </select>
                </div>

                {enableTranslation && (
                  <div className="flex items-center gap-2 animate-fadeIn">
                    <label className="text-xs font-bold text-slate-700">Target Language:</label>
                    <select
                      value={translationLanguage || 'Marathi'}
                      onChange={e => handleTogglePaperTranslation(true, e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white border border-slate-900 font-bold text-xs shadow-2xs"
                    >
                      {SUPPORTED_TRANSLATION_LANGUAGES.map(lang => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DYNAMIC SUBJECT CARDS WITH EMBEDDED PDF UPLOAD (Requirements 1, 2, 3, 4, 5, 6, 7, 8, 9) */}
      {/* ========================================================================= */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Blueprint & Subject Configuration
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure subjects, question types, marks, translation policies, and upload source PDFs directly inside each subject card.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddSubject}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Subject</span>
          </button>
        </div>

        {/* Dynamic Subject Cards List (Each Card Has Independent State - Requirement 7) */}
        {subjects.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-3">
            <Layers className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-sm font-bold text-slate-800">No subjects configured yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Select an <strong>Exam Type</strong> above (such as JEE or NEET) to load standard subject suggestions, or click below to manually add subjects.
            </p>
            <button
              type="button"
              onClick={handleAddSubject}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Subject</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {subjects.map((sub, index) => {
              const subjectTotalMarks = (Number(sub.numberOfQuestions) || 0) * (Number(sub.marksPerQuestion) || 0);
              const pdfList = sub.pdfs || [];
              const normSub = (sub.subjectName || '').trim().toLowerCase();
              const pdfSum = pdfList.reduce((acc, p) => acc + (p.extractedCount || 0), 0);
              const extractedQuestionCount = Math.max(
                pdfSum,
                availableCounts[sub.id] ?? availableCounts[normSub] ?? 0
              );

              return (
                <div
                  key={sub.id}
                  className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6 transition-all"
                >
                  {/* Subject Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-mono font-bold uppercase tracking-wider border border-slate-200">
                        Subject {sub.subjectOrder || index + 1}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">
                        {sub.subjectName ? `Subject ${sub.subjectOrder || index + 1} — ${sub.subjectName}` : `Subject #${index + 1}`}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-50 text-slate-700 font-mono font-bold text-xs border border-slate-200">
                        {subjectTotalMarks} Marks Total
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveSubject(sub.id)}
                      className="text-xs font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
                      title="Remove this subject card"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Remove Subject</span>
                    </button>
                  </div>

                {/* Subject Configuration Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                  {/* Subject Name */}
                  <div className="lg:col-span-2 space-y-1">
                    <label className="block text-slate-700 font-bold">
                      Subject Name *
                    </label>
                    <input
                      type="text"
                      value={sub.subjectName}
                      onChange={e => handleUpdateSubjectField(sub.id, 'subjectName', e.target.value)}
                      placeholder="e.g. Physics, Chemistry, Biology"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
                    />
                  </div>

                  {/* Questions Required */}
                  <div className="space-y-1">
                    <label className="block text-slate-700 font-bold">
                      Questions *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={sub.numberOfQuestions}
                      onChange={e => handleUpdateSubjectField(sub.id, 'numberOfQuestions', Number(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono font-bold focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
                    />
                  </div>

                  {/* Question Type */}
                  <div className="space-y-1">
                    <label className="block text-slate-700 font-bold">
                      Type *
                    </label>
                    <select
                      value={sub.questionType}
                      onChange={e => handleUpdateSubjectField(sub.id, 'questionType', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
                    >
                      <option value="MCQ">MCQ</option>
                      <option value="Descriptive">Descriptive</option>
                      <option value="Mixed">Mixed</option>
                    </select>
                  </div>

                  {/* Marks Per Question */}
                  <div className="space-y-1">
                    <label className="block text-slate-700 font-bold">
                      Marks / Q *
                    </label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={sub.marksPerQuestion}
                      onChange={e => handleUpdateSubjectField(sub.id, 'marksPerQuestion', Number(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono font-bold focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
                    />
                  </div>

                  {/* Negative Marks */}
                  <div className="space-y-1">
                    <label className="block text-slate-700 font-bold">
                      Negative
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={sub.negativeMarks}
                      onChange={e => handleUpdateSubjectField(sub.id, 'negativeMarks', Number(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono font-bold focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Translation Configuration Row */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <label className="text-slate-700 font-bold">
                      Translation Required:
                    </label>
                    <select
                      value={sub.translationRequired ? 'YES' : 'NO'}
                      onChange={e => handleUpdateSubjectField(sub.id, 'translationRequired', e.target.value === 'YES')}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-900 font-bold"
                    >
                      <option value="NO">No</option>
                      <option value="YES">Yes</option>
                    </select>
                  </div>

                  {sub.translationRequired && (
                    <div className="flex items-center gap-2 animate-fadeIn">
                      <label className="text-slate-700 font-bold">
                        Translation Language:
                      </label>
                      <select
                        value={sub.translationLanguage || 'Hindi'}
                        onChange={e => handleUpdateSubjectField(sub.id, 'translationLanguage', e.target.value)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-900 font-bold"
                      >
                        {SUPPORTED_TRANSLATION_LANGUAGES.map(lang => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-slate-600 font-medium">
                        (Bilingual translation displayed immediately below each question)
                      </span>
                    </div>
                  )}
                </div>

                {/* ========================================================================= */}
                {/* QUESTION POOL PDFs SECTION (EMBEDDED INSIDE THE SAME CARD - Req 1, 2, 3, 4, 9, 13) */}
                {/* ========================================================================= */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5 text-slate-700" />
                        <span>Question Pool PDFs ({sub.subjectName ? sub.subjectName.toUpperCase() : `SUBJECT ${index + 1}`})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Upload source question PDFs. Each PDF contributes questions into this subject's pool.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {pdfList.length > 0 && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
                          {extractedQuestionCount} / {sub.numberOfQuestions} Questions Extracted
                        </span>
                      )}

                      {/* Hidden File Input & Upload Button */}
                      <input
                        type="file"
                        accept=".pdf"
                        multiple
                        id={`pdf-upload-${sub.id}`}
                        className="hidden"
                        onChange={e => {
                          handleUploadPdfsForSubject(sub, e.target.files);
                          e.target.value = '';
                        }}
                      />
                      <label
                        htmlFor={`pdf-upload-${sub.id}`}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Upload PDF</span>
                      </label>
                    </div>
                  </div>

                  {/* List of Uploaded PDFs for THIS Subject Card */}
                  {pdfList.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500">
                      No PDFs uploaded yet for {sub.subjectName || 'this subject'}. Click <strong>+ Upload PDF</strong> to attach source question pool papers.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                      {pdfList.map((pdf, pIdx) => (
                        <div
                          key={pdf.id || pIdx}
                          className="p-3 bg-white flex items-center justify-between text-xs gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-slate-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{pdf.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{formatSize(pdf.size)}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {pdf.status === 'COMPLETED' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>{pdf.extractedCount || 0} Questions Extracted</span>
                              </span>
                            )}

                            {pdf.status === 'EXTRACTING' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300 flex items-center gap-1 animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Extracting...</span>
                              </span>
                            )}

                            {pdf.status === 'ERROR' && (
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200"
                                title={pdf.errorMessage}
                              >
                                Extraction Error
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemovePdf(sub.id, pdf)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title={`Remove ${pdf.name} from ${sub.subjectName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add Subject Button */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleAddSubject}
              className="px-5 py-2.5 rounded-xl border border-dashed border-slate-400 text-slate-800 hover:bg-slate-50 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Another Subject</span>
            </button>
          </div>
        </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. BLUEPRINT VALIDATION & GENERATION ACTIONS (Requirements 2, 3, 4, 5)     */}
      {/* ========================================================================= */}
      {subjects.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          {/* Section Header */}
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-slate-800" />
              <span>BLUEPRINT VALIDATION & GENERATION ACTIONS</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Verify question pool quotas and generate the final competitive paper directly from this page.
            </p>
          </div>

          {/* Subject Quota & Question Pool Table (Requirement 3) */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4 text-center">Required</th>
                  <th className="py-3 px-4 text-center">Available</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {subjects.map(s => {
                  const norm = (s.subjectName || '').trim().toLowerCase();
                  const dbAvail = availableCounts[s.id] ?? availableCounts[norm];
                  const pdfSum = (s.pdfs || []).reduce((acc, p) => acc + (p.extractedCount || 0), 0);
                  const available = dbAvail !== undefined ? Math.max(dbAvail, pdfSum) : pdfSum;
                  const required = Number(s.numberOfQuestions) || 0;
                  const isReady = available >= required && required > 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {s.subjectName || '<Unnamed Subject>'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                        {required}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        <span className={isReady ? 'text-emerald-700' : 'text-rose-600'}>
                          {available}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isReady ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>✓ Ready</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span>✗ Insufficient</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Blueprint Totals Summary Matrix (Requirement 3) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-4 font-medium text-slate-700">
              <div>
                Total Required Questions: <strong className="text-slate-900 font-mono text-sm font-bold ml-1">{totalQuestions}</strong>
              </div>
              <div>
                Total Available Verified Questions: <strong className="text-slate-900 font-mono text-sm font-bold ml-1">{totalAvailableQuestions}</strong>
              </div>
              <div>
                Total Marks: <strong className="text-emerald-700 font-mono text-sm font-bold ml-1">{totalMarks}</strong>
              </div>
            </div>
          </div>

          {/* Validation Result Feedback (Requirement 4) */}
          {validationResult && validationResult.valid && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>✓ Blueprint validated successfully.</span>
              </div>
              <p className="text-slate-700 pl-6 leading-relaxed">
                All configured subject quotas can be satisfied.
              </p>
            </div>
          )}

          {validationResult && !validationResult.valid && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-950 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>✗ Blueprint validation failed.</span>
              </div>
              <div className="pl-6 space-y-1 text-rose-800 font-medium">
                {validationResult.subjectResults
                  .filter(r => !r.passed)
                  .map((r, idx) => (
                    <p key={idx}>
                      {r.subject} requires {r.required} verified questions, but only {r.available} are available.
                    </p>
                  ))}
              </div>
              <p className="pl-6 text-[11px] text-slate-600">
                Generation remains disabled. Please upload additional source PDF papers for the insufficient subject(s).
              </p>
            </div>
          )}

          {/* Generation Processing Stages Feedback (Requirement 11) */}
          {isGenerating && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                <span>Generating Competitive Examination Paper...</span>
              </div>
              <div className="pl-6 space-y-1 text-slate-600 font-mono text-[11px]">
                {generationSteps.map((stepMsg, sIdx) => (
                  <p key={sIdx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    <span>{stepMsg}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Real Backend Error Feedback (Requirement 12) */}
          {generationError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{generationError}</span>
            </div>
          )}

          {/* Generation Success Feedback (Requirement 11) */}
          {generatedSuccessMsg && !isGenerating && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {generatedPaper?.enableTranslation
                  ? `✓ Original English paper generated and all ${generatedPaper?.totalQuestions || totalQuestions} questions assigned to the ${generatedPaper?.translationLanguage || translationLanguage || 'Marathi'} Translator for approval.`
                  : '✓ Final paper generated successfully.'}
              </span>
            </div>
          )}

          {/* Client-side Validation Hints if any subject field is incomplete */}
          {!isFormValid && validationErrors.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              {validationErrors.map((err, eIdx) => (
                <p key={eIdx} className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{err}</span>
                </p>
              ))}
            </div>
          )}

          {/* Action Buttons (Requirement 3, 4, 5) */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleValidateBlueprint}
              disabled={!isFormValid || isValidating || isGenerating}
              className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
              <span>Validate Blueprint</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateFinalPaper}
              disabled={!canGeneratePaper || isGenerating}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer ${
                canGeneratePaper && !isGenerating
                  ? 'bg-slate-900 hover:bg-black text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>
                {isGenerating
                  ? 'Generating Paper...'
                  : generatedPaper?.id && Number(generatedPaper.totalQuestions) === Number(totalQuestions)
                    ? 'View Generated Paper Preview'
                    : enableTranslation || subjects.some(s => s.translationRequired)
                      ? `Generate Paper & Assign to ${translationLanguage || 'Marathi'} Translator`
                      : 'Generate Final Paper'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SINGLE UNIFIED COMPETITIVE PAPER PREVIEW & WORKFLOW ACTIONS            */}
      {/* ========================================================================= */}
      {generatedPaper && (
        <div
          id="competitive-single-paper-preview"
          className="space-y-4 select-none relative pt-2"
          onContextMenu={e => e.preventDefault()}
        >
          {/* Unified Single-Preview Action & Control Header */}
          <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-slate-900 text-white shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Generated Competitive Examination Paper Preview
                    </h3>
                    {generatedPaper.isFinalized ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                        FINALIZED • {generatedPaper.encryptionStatus || 'ENCRYPTED_LOCKED'}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300">
                        READY FOR FINALIZATION & ENCRYPTION
                      </span>
                    )}
                    {generatedPaper.enableTranslation && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
                        {generatedPaper.translationLanguage || 'Marathi'}: {generatedPaper.translationStatus || 'ASSIGNED'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Paper ID: {generatedPaper.id} • SHA-256: {generatedPaper.paperFingerprint?.slice(0, 24)}...
                  </p>
                </div>
              </div>

              {/* Primary Workflow Actions on the Single Paper Preview */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFinalizePanel(prev => !prev)}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    {generatedPaper.isFinalized
                      ? showFinalizePanel
                        ? 'Hide Encryption Schedule'
                        : 'Encryption Schedule & Audit'
                      : showFinalizePanel
                        ? 'Hide Finalize & Encrypt'
                        : 'Finalize & Encrypt'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPaperPdf}
                  disabled={isDownloadingPdf}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Download className={`w-3.5 h-3.5 ${isDownloadingPdf ? 'animate-bounce' : ''}`} />
                  <span>{isDownloadingPdf ? 'Downloading PDF...' : 'Download PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintSinglePaper}
                  disabled={isPrintingPaper}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isPrintingPaper ? 'Preparing Print...' : 'Print Paper'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowProvenanceDrawer(prev => !prev)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{showProvenanceDrawer ? 'Hide Traceability' : 'Source Traceability'}</span>
                </button>
              </div>
            </div>

            {/* Action Feedback Message */}
            {finalizeMsg && (
              <div
                className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 border ${
                  finalizeMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {finalizeMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{finalizeMsg.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFinalizeMsg(null)}
                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Compact Translation Status Bar (Only when translation is enabled — updates the same single paper in place) */}
            {generatedPaper.enableTranslation && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                    <Globe className="w-4 h-4 text-slate-700" />
                    <span>
                      {generatedPaper.translationLanguage || 'Marathi'} Translator Approval:{' '}
                      <span className="font-mono text-emerald-700">
                        {generatedPaper.translationProgress?.approvedCount || 0} /{' '}
                        {generatedPaper.translationProgress?.totalQuestions || generatedPaper.totalQuestions}{' '}
                        Approved
                      </span>
                    </span>
                    <span className="text-[11px] font-normal text-slate-500">
                      (Translator: {generatedPaper.assignedTranslatorName || `${generatedPaper.translationLanguage || 'Marathi'} Translator`})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {generatedPaper.translationProgress?.allApproved
                      ? `All ${generatedPaper.translationLanguage || 'Marathi'} translations are approved and merged into this single paper preview.`
                      : `Waiting for ${generatedPaper.translationLanguage || 'Marathi'} Translator approval before final Centre encryption.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => fetchLatestPaperForExam(false)}
                    disabled={isRefreshingPaperStatus}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPaperStatus ? 'animate-spin' : ''}`} />
                    <span>Sync Status</span>
                  </button>

                  {generatedPaper.translationProgress?.allApproved &&
                    generatedPaper.translationStatus !== 'FINAL_GENERATED' && (
                      <button
                        type="button"
                        onClick={handleGenerateFinalBilingualPaper}
                        disabled={isGeneratingFinalBilingual}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isGeneratingFinalBilingual ? 'animate-spin' : ''}`} />
                        <span>
                          {isGeneratingFinalBilingual
                            ? 'Applying Translations...'
                            : `Apply Approved ${generatedPaper.translationLanguage || 'Marathi'} Translations`}
                        </span>
                      </button>
                    )}
                </div>
              </div>
            )}

            {/* Inline Finalize & Encrypt Configuration Drawer (Operates on this single paper instance) */}
            {showFinalizePanel && (
              <div
                id="competitive-finalize-encrypt-section"
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-slate-800" />
                      <span>Finalize & Encrypt Schedule (Centre Delivery & Server Time-Lock)</span>
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Configure <strong>Encryption Time</strong> and <strong>Decryption / Unlock Time</strong>. Enforced via Server Clock (`current server time &lt; unlock time → LOCKED`).
                    </p>
                  </div>
                  {generatedPaper.isFinalized && (
                    <button
                      type="button"
                      onClick={() => setShowResetModal(true)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reset / Re-Finalize Schedule</span>
                    </button>
                  )}
                </div>

                {generatedPaper.enableTranslation && !generatedPaper.translationProgress?.allApproved && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Translation workflow is enabled ({generatedPaper.translationLanguage}). Please wait for all questions to be approved ({generatedPaper.translationProgress?.approvedCount || 0}/{generatedPaper.translationProgress?.totalQuestions || 0}) before finalizing & encrypting for Centre delivery.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* 1. Exam Date */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-white border border-slate-200">
                    <label className="block font-bold text-slate-800 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-600" />
                      <span>Exam Date *</span>
                    </label>
                    <input
                      type="date"
                      disabled={Boolean(generatedPaper.isFinalized)}
                      value={scheduleExamDate}
                      onChange={e => setScheduleExamDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono font-bold disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* 2. Encryption Time */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-white border border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-700" />
                        <span>1. Encryption Time *</span>
                      </label>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-[10px]">
                        {formatTime24To12(encryptionTimeInput)}
                      </span>
                    </div>
                    <input
                      type="time"
                      disabled={Boolean(generatedPaper.isFinalized)}
                      value={encryptionTimeInput}
                      onChange={e => setEncryptionTimeInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono font-bold disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    {!generatedPaper.isFinalized && (
                      <div className="flex items-center justify-end gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setEncryptionTimeInput('09:00')}
                          className="px-1.5 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[9px] cursor-pointer"
                        >
                          9:00 AM
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            setScheduleExamDate(getTodayLocalYMD());
                            setEncryptionTimeInput(
                              `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                            );
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[9px] cursor-pointer"
                        >
                          Now
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3. Decryption / Unlock Time */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-white border border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-700" />
                        <span>2. Unlock Time *</span>
                      </label>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-800 text-white font-mono font-bold text-[10px]">
                        {formatTime24To12(decryptionTimeInput)}
                      </span>
                    </div>
                    <input
                      type="time"
                      disabled={Boolean(generatedPaper.isFinalized)}
                      value={decryptionTimeInput}
                      onChange={e => setDecryptionTimeInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono font-bold disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    {!generatedPaper.isFinalized && (
                      <div className="flex items-center justify-end gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setDecryptionTimeInput('10:00')}
                          className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[9px] cursor-pointer"
                        >
                          10:00 AM
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            const plus2 = new Date(now.getTime() + 2 * 60 * 1000);
                            setScheduleExamDate(getTodayLocalYMD());
                            setEncryptionTimeInput(
                              `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                            );
                            setDecryptionTimeInput(
                              `${String(plus2.getHours()).padStart(2, '0')}:${String(plus2.getMinutes()).padStart(2, '0')}`
                            );
                          }}
                          className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[9px] cursor-pointer"
                        >
                          +2m Test
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 4. Timezone & Assigned Centre Operator */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-white border border-slate-200">
                    <label className="block font-bold text-slate-800">Assigned Centre Operator *</label>
                    <select
                      disabled={Boolean(generatedPaper.isFinalized)}
                      value={assignedOperatorId}
                      onChange={e => setAssignedOperatorId(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-bold text-[11px] disabled:bg-slate-100"
                    >
                      {availableOperators.length > 0 ? (
                        availableOperators.map(op => (
                          <option key={op.id} value={op.id}>
                            {op.centreLabel} ({op.email})
                          </option>
                        ))
                      ) : (
                        <option value="usr-operator-01">
                          CTR-101 — Manoj Kumar (Centre Superintendent)
                        </option>
                      )}
                    </select>
                    <select
                      disabled={Boolean(generatedPaper.isFinalized)}
                      value={scheduleTimezone}
                      onChange={e => setScheduleTimezone(e.target.value)}
                      className="w-full px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium text-[10px] disabled:bg-slate-100"
                    >
                      <option value="Asia/Kolkata (IST, UTC+05:30)">Asia/Kolkata (IST, UTC+05:30)</option>
                      <option value="UTC (Coordinated Universal Time, UTC+00:00)">UTC (UTC+00:00)</option>
                    </select>
                  </div>
                </div>

                {!generatedPaper.isFinalized ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                    <div className="text-xs text-slate-600">
                      Lock at <strong className="text-slate-900">{formatTime24To12(encryptionTimeInput)}</strong> → Unlock for Centre printing at{' '}
                      <strong className="text-emerald-800">{formatTime24To12(decryptionTimeInput)}</strong> on{' '}
                      <strong className="font-mono">{scheduleExamDate}</strong>.
                    </div>
                    <button
                      type="button"
                      onClick={handleFinalizeAndEncryptPaper}
                      disabled={
                        isFinalizingEncrypt ||
                        (generatedPaper.enableTranslation && !generatedPaper.translationProgress?.allApproved)
                      }
                      className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      <Lock className={`w-3.5 h-3.5 ${isFinalizingEncrypt ? 'animate-pulse' : ''}`} />
                      <span>
                        {isFinalizingEncrypt
                          ? 'Finalizing & Encrypting (AES-256-GCM)...'
                          : `Confirm Finalize & Encrypt (${formatTime24To12(encryptionTimeInput)} → ${formatTime24To12(decryptionTimeInput)})`}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        <strong>AES-256-GCM Encrypted:</strong> Lock {generatedPaper.encryptionTimeDisplay} • Unlock{' '}
                        {generatedPaper.decryptionTimeDisplay} ({generatedPaper.scheduleExamDate}) • Assigned to{' '}
                        {generatedPaper.assignedOperatorName}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                      {generatedPaper.statusBanner || `Locked – Available at ${generatedPaper.decryptionTimeDisplay}`}
                    </span>
                  </div>
                )}

                {showResetModal && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-bold text-amber-950">
                      <span>Authorized Exam Manager: Reset Encryption Schedule</span>
                      <button
                        type="button"
                        onClick={() => setShowResetModal(false)}
                        className="text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={resetReason}
                        onChange={e => setResetReason(e.target.value)}
                        placeholder="Enter authorization reason for schedule reset..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={handleResetFinalizationSchedule}
                        disabled={isResettingSchedule}
                        className="px-4 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white font-bold cursor-pointer shrink-0"
                      >
                        {isResettingSchedule ? 'Resetting...' : 'Confirm Reset'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Source Traceability Drawer */}
            {showProvenanceDrawer && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-700" />
                  <span>Question Origin & Multi-PDF Contribution Audit Matrix:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                  {generatedPaper.sourceProvenance?.map((item: any, pIdx: number) => (
                    <div
                      key={pIdx}
                      className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-0.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>{item.questionNumber}</span>
                        <span className="text-slate-600 font-mono text-[10px]">{item.subject}</span>
                      </div>
                      <p className="text-slate-600 font-mono text-[10px] truncate" title={item.sourcePdf}>
                        {item.sourcePdf}
                      </p>
                      <div className="flex items-center justify-between text-slate-400 text-[9px]">
                        <span>
                          Page {item.sourcePage} • Orig Q#{item.sourceQuestionNumber}
                        </span>
                        {item.hasVisual && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold">
                            Visual Bound
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SINGLE UNIQUE INSTITUTIONAL PAPER PREVIEW INSTANCE */}
          <div id="competitive-single-paper-document">
            <CompetitivePrintExaminationPaper paper={generatedPaper} />
          </div>
        </div>
      )}
    </div>
  );
};
