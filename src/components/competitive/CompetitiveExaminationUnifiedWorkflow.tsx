import React, { useState, useEffect } from 'react';
import {
  Award,
  Plus,
} from 'lucide-react';
import { CompetitiveBlueprintForm, SubjectRule, ExamDetails } from './CompetitiveBlueprintForm';
import { api } from '../../api';
import { User, Organization } from '../../types';

interface WorkflowProps {
  currentUser: User | null;
  org?: Organization | null;
  onRefresh?: () => void;
}

const createEmptyExamDetails = (id?: string): ExamDetails => ({
  id,
  name: '',
  exam_type: '',
  duration_minutes: '',
  exam_date: '',
  exam_time: '',
  instructions: '',
});

export const CompetitiveExaminationUnifiedWorkflow: React.FC<WorkflowProps> = ({
  currentUser,
  org,
  onRefresh,
}) => {
  const [activeExamId, setActiveExamId] = useState<string>(() => `comp-${Date.now().toString(36)}`);
  const [existingExams, setExistingExams] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);

  // Exam Details (Step 1)
  const [examDetails, setExamDetails] = useState<ExamDetails>(() => createEmptyExamDetails(activeExamId));

  // Blueprint Subjects (Step 2)
  const [subjects, setSubjects] = useState<SubjectRule[]>([]);

  // Load existing competitive exams from database
  const loadExams = async () => {
    setLoadingExams(true);
    try {
      const resp = await api.competitive.getExams();
      if (resp && resp.success && resp.exams) {
        setExistingExams(resp.exams);
      }
    } catch (err) {
      console.warn('Notice loading competitive exams:', err);
    } finally {
      setLoadingExams(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

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

  // Save current Exam & Blueprint to Database
  const saveCurrentExamConfig = async () => {
    try {
      const totalQuestions = subjects.reduce((sum, s) => sum + s.numberOfQuestions, 0);
      const totalMarks = subjects.reduce((sum, s) => sum + s.numberOfQuestions * s.marksPerQuestion, 0);
      const totalPositiveMarks = totalMarks;
      const totalNegativeMarks = subjects.reduce((sum, s) => sum + s.numberOfQuestions * s.negativeMarks, 0);

      const blueprintPayload = {
        subjects,
        totalQuestions,
        totalMarks,
        totalPositiveMarks,
        totalNegativeMarks,
      };

      const durationVal =
        examDetails.duration_minutes !== '' && examDetails.duration_minutes !== undefined
          ? Number(examDetails.duration_minutes)
          : 180;

      const resp = await api.competitive.saveExam({
        id: activeExamId,
        name: examDetails.name,
        exam_type: examDetails.exam_type,
        duration_minutes: durationVal,
        exam_date: examDetails.exam_date,
        exam_time: examDetails.exam_time,
        instructions: examDetails.instructions,
        blueprint: blueprintPayload,
      });

      if (resp && resp.success && resp.exam) {
        setActiveExamId(resp.exam.id);
      }
    } catch (err) {
      console.error('Failed to auto-save exam config:', err);
    }
  };

  // Create a brand new exam
  const handleCreateNewExam = () => {
    const newId = `comp-${Date.now().toString(36)}`;
    setActiveExamId(newId);
    setExamDetails(createEmptyExamDetails(newId));
    setSubjects([]);
  };

  return (
    <div className="space-y-6">
      {/* Executive Header Banner — Bright Professional Academic Theme */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 text-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
              High-Assurance Examination Enclave
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
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Exam ID: <code className="text-slate-900 font-mono font-bold">{activeExamId}</code></span>
          </div>

          {existingExams.length > 0 && (
            <select
              value={activeExamId}
              onChange={e => {
                const selectedId = e.target.value;
                if (!selectedId) return;
                const found = existingExams.find(x => x.id === selectedId);
                if (found) {
                  setActiveExamId(found.id);
                  setExamDetails({
                    id: found.id,
                    name: found.name || '',
                    exam_type: found.exam_type || '',
                    duration_minutes: found.duration_minutes ?? '',
                    exam_date: found.exam_date || '',
                    exam_time: found.exam_time || '',
                    instructions: found.instructions || '',
                  });
                  if (found.blueprint?.subjects && found.blueprint.subjects.length > 0) {
                    setSubjects(found.blueprint.subjects.map((s: any) => ({ ...s, pdfs: s.pdfs || [] })));
                  } else {
                    setSubjects([]);
                  }
                }
              }}
              className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-hidden"
            >
              <option value="">Load Saved Exam...</option>
              {existingExams.map(ex => (
                <option key={ex.id} value={ex.id}>
                  {ex.name || 'Untitled Exam'} ({ex.exam_type || 'Unspecified'})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleCreateNewExam}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Exam</span>
          </button>
        </div>
      </div>

      {/* Direct Competitive Examination Blueprint, PDF Upload, Validation, and Paper Generation */}
      <CompetitiveBlueprintForm
        examId={activeExamId}
        examDetails={examDetails}
        onUpdateExamDetails={details => setExamDetails(prev => ({ ...prev, ...details }))}
        subjects={subjects}
        onUpdateSubjects={updated => {
          setSubjects(updated);
        }}
        onPaperGenerated={() => {
          saveCurrentExamConfig();
        }}
      />
    </div>
  );
};


