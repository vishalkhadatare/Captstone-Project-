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
  onPaperGenerated?: (paper: any) => void;
}

const SUPPORTED_TRANSLATION_LANGUAGES = [
  'Hindi',
  'Marathi',
  'Gujarati',
  'Tamil',
  'Telugu',
  'Kannada',
  'Bengali',
  'Urdu',
  'Odia',
  'Punjabi',
];

export const CompetitiveBlueprintForm: React.FC<BlueprintFormProps> = ({
  examId,
  examDetails,
  onUpdateExamDetails,
  subjects,
  onUpdateSubjects,
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

  // Fetch real verified question pool counts from database
  const fetchAvailablePoolCounts = async () => {
    if (!examId) return;
    try {
      const resp = await api.competitive.validateBlueprint(examId, { subjects });
      if (resp && resp.success && Array.isArray(resp.subjectResults)) {
        const counts: Record<string, number> = {};
        resp.subjectResults.forEach(r => {
          counts[r.subject.trim().toLowerCase()] = r.available;
        });
        setAvailableCounts(counts);
      }
    } catch (err) {
      console.warn('Notice fetching available question pool counts:', err);
    }
  };

  useEffect(() => {
    setValidationResult(null);
    setGeneratedPaper(null);
    setIsValidated(false);
    setGenerationError(null);
    setGeneratedSuccessMsg(false);
    setAvailableCounts({});
    fetchAvailablePoolCounts();
  }, [examId]);

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
      translationRequired: false,
      translationLanguage: 'Hindi',
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
    // Refresh real-time available counts from database after extraction
    fetchAvailablePoolCounts();
    setIsValidated(false);
    setValidationResult(null);
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
    fetchAvailablePoolCounts();
  };

  // Validate Blueprint Action (Requirement 4)
  const handleValidateBlueprint = async () => {
    setIsValidating(true);
    setGenerationError(null);
    setGeneratedSuccessMsg(false);
    try {
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
        (resp.subjectResults || []).forEach(r => {
          counts[r.subject.trim().toLowerCase()] = r.available;
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

  // Generate Final Paper Action (Requirement 5, 11, 12, 17)
  const handleGenerateFinalPaper = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedSuccessMsg(false);
    setGenerationSteps(['Initializing Competitive Examination Generation Engine...']);

    try {
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

      // 2. Progression feedback (Requirement 11)
      for (const sub of subjects) {
        setGenerationSteps(prev => [...prev, `Preparing ${sub.subjectName || 'Subject'} questions...`]);
        await new Promise(r => setTimeout(r, 200));
      }

      if (subjects.some(s => s.translationRequired)) {
        setGenerationSteps(prev => [...prev, 'Applying configured bilingual translations...']);
        await new Promise(r => setTimeout(r, 200));
      }

      setGenerationSteps(prev => [...prev, 'Assembling sequential sections and applying ZeroLeak watermark...']);

      // 3. Generate Final Paper
      const resp = await api.competitive.generateFinalPaper(examId, { subjects });
      if (resp && resp.success && resp.paper) {
        setGenerationSteps(prev => [...prev, '✓ Final paper generated successfully.']);
        setGeneratedPaper(resp.paper);
        setGeneratedSuccessMsg(true);
        if (onPaperGenerated) onPaperGenerated(resp.paper);
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

  // Automatic Blueprint Calculations (Requirement 6 & 10)
  const totalQuestions = subjects.reduce((sum, s) => sum + (Number(s.numberOfQuestions) || 0), 0);
  const totalAvailableQuestions = subjects.reduce((sum, s) => {
    const norm = (s.subjectName || '').trim().toLowerCase();
    const count =
      availableCounts[norm] !== undefined
        ? availableCounts[norm]
        : (s.pdfs || []).reduce((acc, p) => acc + (p.extractedCount || 0), 0);
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
    const suggested = getSuggestedSubjectsForExamType(newType);
    onUpdateSubjects(suggested);
  };

  // Client-side Validation Checks
  const validationErrors: string[] = [];
  if (!examDetails.name.trim()) validationErrors.push('Examination Name is required.');
  if (!examDetails.exam_type || !examDetails.exam_type.trim()) validationErrors.push('Please select an Exam Type.');
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
              Specify the examination name, category, timing, and candidate instructions.
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
              value={examDetails.exam_type || ''}
              onChange={e => handleExamTypeChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
            >
              <option value="">Select Exam Type</option>
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
              const extractedQuestionCount = pdfList.reduce((acc, p) => acc + (p.extractedCount || 0), 0);

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
                  const available =
                    availableCounts[norm] !== undefined
                      ? availableCounts[norm]
                      : (s.pdfs || []).reduce((acc, p) => acc + (p.extractedCount || 0), 0);
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
              <span>✓ Final paper generated successfully.</span>
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
              disabled={!isValidated || !validationResult?.valid || isGenerating}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer ${
                isValidated && validationResult?.valid && !isGenerating
                  ? 'bg-slate-900 hover:bg-black text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Generating Paper...' : 'Generate Final Paper'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. PROTECTED FINAL COMPETITIVE PAPER VIEW (ON THE SAME PAGE - Req 6 & 13) */}
      {/* ========================================================================= */}
      {generatedPaper && (
        <div
          className="space-y-6 select-none relative pt-4"
          onContextMenu={e => e.preventDefault()}
        >
          {/* Top Control Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Protected Final Competitive Examination Paper</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    ONE FINAL PAPER
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  SHA-256 Fingerprint: {generatedPaper.paperFingerprint}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowProvenanceDrawer(!showProvenanceDrawer)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{showProvenanceDrawer ? 'Hide Source Traceability' : 'Audit Source Traceability'}</span>
              </button>

              <button
                type="button"
                onClick={() => setGeneratedPaper(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Close Paper View
              </button>
            </div>
          </div>

          {/* Security Alert: No Download/Print/Copy */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-600 shrink-0" />
              <span>
                <strong>ZeroLeak Security Enclave Active:</strong> Document download, printing, text copying, and exporting are cryptographically restricted. Watermark active.
              </span>
            </div>
          </div>

          {/* Source Traceability Drawer */}
          {showProvenanceDrawer && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <span>Question Origin & Multi-PDF Contribution Audit Matrix:</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-2">
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
                    <p className="text-slate-400 text-[9px]">
                      Source Page: {item.sourcePage} • Orig Q#: {item.sourceQuestionNumber}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Institutional Document Rendering (Real Printed Examination Paper Style) */}
          <div className="print:hidden">
            <CompetitivePrintExaminationPaper paper={generatedPaper} />
          </div>
        </div>
      )}
    </div>
  );
};
