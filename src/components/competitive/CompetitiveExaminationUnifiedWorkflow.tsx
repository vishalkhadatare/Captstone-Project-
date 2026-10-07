import React, { useState, useEffect, useRef } from 'react';
import {
  Award,
  Plus,
  Save,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { CompetitiveBlueprintForm, SubjectRule, ExamDetails } from './CompetitiveBlueprintForm';
import { api } from '../../api';
import { User, Organization } from '../../types';

interface WorkflowProps {
  currentUser: User | null;
  org?: Organization | null;
  onRefresh?: () => void;
  selectedExamId?: string;
  onSelectExamId?: (examId: string) => void;
}

const generateUniqueCompetitiveExamId = (): string => {
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 7);
  return `comp-${timestampPart}-${randomPart}`;
};

const createEmptyExamDetails = (id?: string): ExamDetails => ({
  id,
  name: '',
  exam_type: 'Competitive Examination',
  duration_minutes: 180,
  exam_date: '',
  exam_time: '',
  instructions: '',
});

export const ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY = 'zeroleak_active_competitive_exam_id';

export const CompetitiveExaminationUnifiedWorkflow: React.FC<WorkflowProps> = ({
  currentUser,
  org,
  onRefresh,
  selectedExamId,
  onSelectExamId,
}) => {
  // Track newly created (unsaved) exam IDs so loadExams() NEVER overwrites a new exam with an existing exam
  const unsavedNewExamIdsRef = useRef<Set<string>>(new Set());

  const [activeExamId, setActiveExamId] = useState<string>(() => {
    if (selectedExamId && selectedExamId.trim()) {
      try {
        localStorage.setItem(ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY, selectedExamId.trim());
      } catch {}
      return selectedExamId.trim();
    }
    try {
      const savedId = localStorage.getItem(ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY);
      if (savedId && savedId.trim()) return savedId.trim();
    } catch {}
    const freshId = generateUniqueCompetitiveExamId();
    unsavedNewExamIdsRef.current.add(freshId);
    try {
      localStorage.setItem(ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY, freshId);
    } catch {}
    return freshId;
  });

  const [existingExams, setExistingExams] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [saveBannerMessage, setSaveBannerMessage] = useState<string | null>(null);

  // Exam Details (Step 1)
  const [examDetails, setExamDetails] = useState<ExamDetails>(() => createEmptyExamDetails(activeExamId));

  // Blueprint Subjects (Step 2)
  const [subjects, setSubjects] = useState<SubjectRule[]>([]);

  const applyExamRecordToState = (found: any) => {
    if (!found || !found.id) return;
    unsavedNewExamIdsRef.current.delete(found.id);
    setActiveExamId(found.id);
    try {
      localStorage.setItem(ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY, found.id);
    } catch {}
    if (onSelectExamId) onSelectExamId(found.id);
    setExamDetails({
      id: found.id,
      name: found.name || '',
      exam_type: found.exam_type || 'Competitive Examination',
      duration_minutes: found.duration_minutes ?? 180,
      exam_date: found.exam_date || '',
      exam_time: found.exam_time || '',
      instructions: found.instructions || '',
    });
    if (found.blueprint?.subjects && found.blueprint.subjects.length > 0) {
      setSubjects(found.blueprint.subjects.map((s: any) => ({ ...s, pdfs: s.pdfs || [] })));
    } else {
      setSubjects([]);
    }
  };

  // Load existing competitive exams from database and restore active exam ONLY if it matches targetId
  const loadExams = async (preferredExamId?: string) => {
    setLoadingExams(true);
    try {
      const resp = await api.competitive.getExams();
      if (resp && resp.success && Array.isArray(resp.exams)) {
        setExistingExams(resp.exams);
        const targetId = preferredExamId || activeExamId;
        const matched = resp.exams.find((x: any) => x.id === targetId);
        if (matched) {
          applyExamRecordToState(matched);
        } else if (!unsavedNewExamIdsRef.current.has(targetId)) {
          // Only if targetId was NOT created as a new blank exam, check if localStorage has a saved match
          let storedId = '';
          try {
            storedId = localStorage.getItem(ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY) || '';
          } catch {}
          const storedMatch = storedId ? resp.exams.find((x: any) => x.id === storedId) : null;
          if (storedMatch && !unsavedNewExamIdsRef.current.has(storedId)) {
            applyExamRecordToState(storedMatch);
          } else {
            // Treat current targetId as a clean new exam rather than overwriting with resp.exams[0]
            unsavedNewExamIdsRef.current.add(targetId);
          }
        }
      }
    } catch (err) {
      console.warn('Notice loading competitive exams:', err);
    } finally {
      setLoadingExams(false);
    }
  };

  useEffect(() => {
    loadExams(selectedExamId || activeExamId);
  }, []);

  // If parent explicitly changes selectedExamId (e.g. "Open in Exam Workflow" from All Examinations / Dashboard)
  useEffect(() => {
    if (!selectedExamId || !selectedExamId.trim() || selectedExamId === activeExamId) return;
    const targetId = selectedExamId.trim();
    const matched = existingExams.find(x => x.id === targetId);
    if (matched) {
      applyExamRecordToState(matched);
    } else {
      loadExams(targetId);
    }
  }, [selectedExamId]);

  // Synchronize PDFs strictly by exam_id from the database
  useEffect(() => {
    let isCancelled = false;
    const syncExamPoolFiles = async () => {
      if (!activeExamId) return;
      try {
        const resp = await api.competitive.getQuestionPools(activeExamId);
        if (isCancelled) return;
        const poolFiles = (resp && resp.success && Array.isArray(resp.pools)) ? resp.pools : [];

        setSubjects(prevSubjects =>
          prevSubjects.map(sub => {
            const matchedFiles = poolFiles.filter((f: any) => {
              if (f.subject_id && sub.id) {
                return f.subject_id === sub.id;
              }
              if (sub.subjectName && sub.subjectName.trim()) {
                return (f.subject_name || '').trim().toLowerCase() === sub.subjectName.trim().toLowerCase();
              }
              return false;
            });

            const activePdfs = matchedFiles.map((f: any) => ({
              id: f.id,
              fileId: f.id,
              name: f.file_name,
              size: f.file_size || 0,
              status: f.status || 'COMPLETED',
              extractedCount: f.question_count || 0,
              subjectId: sub.id,
              uploadedAt: f.uploaded_at,
            }));

            return {
              ...sub,
              pdfs: activePdfs,
            };
          })
        );
      } catch (err) {
        console.warn('Notice syncing exam pool files:', err);
      }
    };

    syncExamPoolFiles();
    return () => {
      isCancelled = true;
    };
  }, [activeExamId]);

  // Save current Exam & Blueprint to Database (scoped strictly to activeExamId)
  const saveCurrentExamConfig = async (overrideDetails?: ExamDetails, overrideSubjects?: SubjectRule[]) => {
    const detailsToSave = overrideDetails || examDetails;
    const subjectsToSave = overrideSubjects || subjects;
    if (!detailsToSave.name || !detailsToSave.name.trim()) return null;

    setIsSavingExam(true);
    try {
      const totalQuestions = subjectsToSave.reduce((sum, s) => sum + (Number(s.numberOfQuestions) || 0), 0);
      const totalMarks = subjectsToSave.reduce(
        (sum, s) => sum + (Number(s.numberOfQuestions) || 0) * (Number(s.marksPerQuestion) || 0),
        0
      );
      const totalPositiveMarks = totalMarks;
      const totalNegativeMarks = subjectsToSave.reduce(
        (sum, s) => sum + (Number(s.numberOfQuestions) || 0) * (Number(s.negativeMarks) || 0),
        0
      );

      const blueprintPayload = {
        subjects: subjectsToSave,
        totalQuestions,
        totalMarks,
        totalPositiveMarks,
        totalNegativeMarks,
      };

      const durationVal =
        detailsToSave.duration_minutes !== '' && detailsToSave.duration_minutes !== undefined
          ? Number(detailsToSave.duration_minutes)
          : 180;

      const isNewExam = unsavedNewExamIdsRef.current.has(activeExamId);

      const resp = await api.competitive.saveExam({
        id: activeExamId,
        is_new: isNewExam,
        name: detailsToSave.name.trim(),
        exam_type: detailsToSave.exam_type || 'Competitive Examination',
        duration_minutes: durationVal,
        exam_date: detailsToSave.exam_date,
        exam_time: detailsToSave.exam_time,
        instructions: detailsToSave.instructions,
        blueprint: blueprintPayload,
      });

      if (resp && resp.success && resp.exam) {
        const savedId = resp.exam.id;
        unsavedNewExamIdsRef.current.delete(activeExamId);
        unsavedNewExamIdsRef.current.delete(savedId);
        setActiveExamId(savedId);
        try {
          localStorage.setItem(ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY, savedId);
        } catch {}
        if (onSelectExamId) onSelectExamId(savedId);

        const refreshed = await api.competitive.getExams();
        if (refreshed && refreshed.success && Array.isArray(refreshed.exams)) {
          setExistingExams(refreshed.exams);
        }
        if (onRefresh) onRefresh();
        setSaveBannerMessage(`Saved exam "${resp.exam.name}" (ID: ${savedId})`);
        setTimeout(() => setSaveBannerMessage(null), 4000);
        return resp.exam;
      }
    } catch (err) {
      console.error('Failed to save exam config:', err);
    } finally {
      setIsSavingExam(false);
    }
    return null;
  };

  // Create a brand new exam with a guaranteed unique examId and completely reset form state
  const handleCreateNewExam = () => {
    const newId = generateUniqueCompetitiveExamId();
    unsavedNewExamIdsRef.current.add(newId);
    setActiveExamId(newId);
    try {
      localStorage.setItem(ACTIVE_COMPETITIVE_EXAM_STORAGE_KEY, newId);
    } catch {}
    if (onSelectExamId) onSelectExamId(newId);
    setExamDetails(createEmptyExamDetails(newId));
    setSubjects([]);
    setSaveBannerMessage(`Started new Competitive Exam record (ID: ${newId}). All previous form data cleared.`);
    setTimeout(() => setSaveBannerMessage(null), 4000);
  };

  const isCurrentExamSaved = existingExams.some(ex => ex.id === activeExamId);

  return (
    <div className="space-y-6">
      {/* Executive Header Banner — Bright Professional Academic Theme */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 text-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
              High-Assurance Examination Enclave
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isCurrentExamSaved
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {isCurrentExamSaved ? 'Editing Existing Exam' : 'New Exam Record'}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black font-serif tracking-tight text-slate-900 flex items-center gap-2.5">
            <Award className="w-6 h-6 text-slate-700" />
            <span>COMPETITIVE EXAMINATION</span>
          </h1>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            Configure national-grade competitive exam blueprints, ingest multi-PDF subject question pools, validate quota feasibility, and generate printed-style examination papers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
            <span className={`w-2 h-2 rounded-full ${isCurrentExamSaved ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></span>
            <span>Exam ID: <code className="text-slate-900 font-mono font-bold">{activeExamId}</code></span>
          </div>

          {existingExams.length > 0 && (
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-slate-500 hidden sm:inline" />
              <select
                value={isCurrentExamSaved ? activeExamId : ''}
                onChange={e => {
                  const selectedId = e.target.value;
                  if (!selectedId) return;
                  const found = existingExams.find(x => x.id === selectedId);
                  if (found) {
                    applyExamRecordToState(found);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-hidden"
              >
                <option value="">
                  {isCurrentExamSaved ? 'Switch Existing Exam...' : `Editing New Exam (${activeExamId}) — Switch Exam...`}
                </option>
                {existingExams.map(ex => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name || 'Untitled Exam'} ({ex.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {examDetails.name.trim().length > 0 && (
            <button
              type="button"
              disabled={isSavingExam}
              onClick={() => saveCurrentExamConfig()}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingExam ? 'Saving...' : isCurrentExamSaved ? 'Update Exam' : 'Save New Exam'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCreateNewExam}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Exam</span>
          </button>
        </div>
      </div>

      {saveBannerMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveBannerMessage}</span>
        </div>
      )}

      {/* Direct Competitive Examination Blueprint, PDF Upload, Validation, and Paper Generation */}
      {/* Keyed by activeExamId so starting a new exam or switching exams resets all internal form/paper states */}
      <CompetitiveBlueprintForm
        key={activeExamId}
        examId={activeExamId}
        examDetails={examDetails}
        onUpdateExamDetails={details => setExamDetails(prev => ({ ...prev, ...details }))}
        subjects={subjects}
        onUpdateSubjects={updated => {
          setSubjects(updated);
        }}
        onSaveExamConfig={saveCurrentExamConfig}
        onPaperGenerated={() => {
          saveCurrentExamConfig();
        }}
      />
    </div>
  );
};



