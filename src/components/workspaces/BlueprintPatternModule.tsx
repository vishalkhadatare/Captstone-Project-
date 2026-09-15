import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Filter, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { api } from '../../api';
import { BlueprintSection, ExamBlueprint, Examination, ExamType } from '../../types';

interface BlueprintPatternModuleProps {
  examinations: Examination[];
  onRefresh: () => void;
}

type FormBlueprint = Omit<ExamBlueprint, 'id' | 'createdAt' | 'updatedAt' | 'examType'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  examType: string;
};

const getExamTypeSelection = (category?: string): string => {
  const normalized = (category || '').toLowerCase();
  if (normalized.includes('university') || normalized.includes('autonomous')) return 'University';
  return 'Competitive Exam';
};

const newSection = (questionType: ExamType = 'MCQ'): BlueprintSection => ({
  id: `SECTION-${Date.now()}`,
  name: '',
  subject: '',
  questionType,
  questionNumber: '',
  totalQuestions: 0,
  subQuestions: 0,
  questionsToAttempt: 0,
  marksPerQuestion: 0,
  marksPerSubQuestion: 0,
  mainQuestionMarks: 0,
  negativeMarks: 0,
  difficulty: 'ANY',
  totalMarks: 0,
});

const emptyBlueprint = (exam?: Examination): FormBlueprint => ({
  examId: exam?.id || '',
  examName: exam?.name || '',
  examType: getExamTypeSelection(exam?.category),
  conductingBody: exam?.category || '',
  examYear: Number((exam?.exam_date || new Date().toISOString()).slice(0, 4)),
  paperName: exam?.name || '',
  paperNumber: 1,
  durationMinutes: exam?.duration_minutes || 180,
  totalMarks: 0,
  status: 'DRAFT',
  version: 'v1.0',
  sections: [newSection(exam?.exam_type || 'MCQ')],
});

const numberValue = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const BlueprintPatternModule: React.FC<BlueprintPatternModuleProps> = ({ examinations, onRefresh }) => {
  const [blueprints, setBlueprints] = useState<ExamBlueprint[]>([]);
  const [form, setForm] = useState<FormBlueprint | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const loadBlueprints = async () => {
    setLoading(true);
    try {
      const response = await api.getBlueprints();
      setBlueprints(response.blueprints || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Unable to load blueprints.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBlueprints(); }, []);

  const totalQuestions = form?.sections.reduce((sum, section) => sum + numberValue(String(section.subQuestions ?? section.totalQuestions)), 0) || 0;
  const questionsToAttempt = form?.sections.reduce((sum, section) => sum + numberValue(String(section.questionsToAttempt || section.subQuestions || section.totalQuestions)), 0) || 0;
  const totalMarks = form?.sections.reduce((sum, section) => {
    const attemptCount = numberValue(String(section.questionsToAttempt || section.subQuestions || section.totalQuestions), 0);
    const marksPerQuestion = numberValue(String(section.marksPerSubQuestion ?? section.marksPerQuestion), 0);
    return sum + (attemptCount * marksPerQuestion);
  }, 0) || 0;

  const updateForm = (changes: Partial<FormBlueprint>) => setForm(current => current ? { ...current, ...changes } : current);

  const selectExam = (examId: string) => {
    const exam = examinations.find(item => item.id === examId);
    if (!exam || readOnly) return;
    updateForm({
      examId: exam.id,
      examName: exam.name,
      examType: getExamTypeSelection(exam.category),
      conductingBody: exam.category,
      examYear: Number((exam.exam_date || '').slice(0, 4)) || new Date().getFullYear(),
      paperName: exam.name,
      durationMinutes: exam.duration_minutes,
    });
  };

  const updateSection = (sectionId: string, changes: Partial<BlueprintSection>) => {
    if (readOnly) return;
    updateForm({ sections: (form?.sections || []).map(section => section.id === sectionId ? { ...section, ...changes } : section) });
  };

  const validate = () => {
    if (!form) return ['Blueprint form is not ready.'];
    const nextErrors: string[] = [];
    if (!form.examId) nextErrors.push('Select an exam.');
    if (!form.examName.trim()) nextErrors.push('Exam name is required.');
    if (!form.conductingBody.trim()) nextErrors.push('Conducting body is required.');
    if (!form.paperName.trim()) nextErrors.push('Paper name is required.');
    if (!form.version.trim()) nextErrors.push('Blueprint version is required.');
    if (form.sections.length === 0) nextErrors.push('Add at least one section.');
    form.sections.forEach((section, index) => {
      const label = `Question ${section.questionNumber || index + 1}`;
      const subQuestionCount = numberValue(String(section.subQuestions ?? section.totalQuestions), 0);
      const marksPerSubQuestion = numberValue(String(section.marksPerSubQuestion ?? section.marksPerQuestion), 0);
      const attempts = numberValue(String(section.questionsToAttempt || subQuestionCount), 0);
      if (!section.name.trim()) nextErrors.push(`${label}: name is required.`);
      if (!section.subject.trim()) nextErrors.push(`${label}: subject is required.`);
      if (subQuestionCount <= 0) nextErrors.push(`${label}: total questions must be a valid positive number.`);
      if (attempts <= 0) nextErrors.push(`${label}: questions to attempt must be greater than 0.`);
      if (marksPerSubQuestion <= 0) nextErrors.push(`${label}: marks per question must be greater than 0.`);
      if (section.questionsToAttempt < 0 || section.negativeMarks < 0) nextErrors.push(`${label}: questions and marks cannot be negative.`);
      if (attempts > subQuestionCount) nextErrors.push(`${label}: questions to attempt cannot exceed total questions.`);
      if (section.mainQuestionMarks && Number(section.mainQuestionMarks) > 0) nextErrors.push(`${label}: main question cannot have separate marks; only sub-questions carry marks.`);
      if (attempts * marksPerSubQuestion !== (section.totalMarks ?? (attempts * marksPerSubQuestion))) {
        nextErrors.push(`${label}: calculated total marks must equal questions to attempt × marks per sub-question (${attempts * marksPerSubQuestion}).`);
      }
    });
    setErrors(nextErrors);
    return nextErrors;
  };

  const save = async (saveAsDraft: boolean) => {
    if (!form) return;
    const validationErrors = validate();
    if (!saveAsDraft && validationErrors.length > 0) return;
    if (!form.examId) return;
    setSaving(true);
    try {
      const response = await api.saveBlueprint(form.examId, { ...form, totalMarks }, saveAsDraft);
      setMessage({ type: 'success', text: response.message });
      setForm(null);
      await loadBlueprints();
      onRefresh();
    } catch (error: any) {
      const serverErrors = error.validationErrors || [];
      setErrors(serverErrors.length ? serverErrors : [error.message || 'Unable to save blueprint.']);
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setErrors([]);
    setMessage(null);
    setReadOnly(false);
    setForm(emptyBlueprint(examinations[0]));
  };

  const openExisting = async (blueprint: ExamBlueprint, viewOnly: boolean) => {
    setErrors([]);
    setMessage(null);
    setReadOnly(viewOnly);
    setForm({ ...blueprint, sections: blueprint.sections.map(section => ({ ...section })) });
  };

  const deactivate = async (blueprint: ExamBlueprint) => {
    try {
      await api.deactivateBlueprint(blueprint.examId, blueprint.id);
      setMessage({ type: 'success', text: 'Blueprint deactivated.' });
      await loadBlueprints();
      onRefresh();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Unable to deactivate blueprint.' });
    }
  };

  const visibleBlueprints = blueprints.filter(blueprint => {
    const haystack = `${blueprint.examName} ${blueprint.paperName} ${blueprint.conductingBody}`.toLowerCase();
    return haystack.includes(search.toLowerCase())
      && (typeFilter === 'ALL' || blueprint.examType === typeFilter)
      && (statusFilter === 'ALL' || blueprint.status === statusFilter);
  });

  if (form) {
    const isUniversityExam = form.examType === 'University';
    const examNameLabel = isUniversityExam ? 'University Name' : 'Competitive Exam Name';

    return (
      <div className="blueprint-form space-y-5 pb-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{readOnly ? 'View Paper Pattern' : form.id ? 'Edit Paper Pattern' : 'Add Paper Pattern'}</h2>
            <p className="text-xs text-slate-500 mt-1">Configure the exact structure used by paper generation.</p>
          </div>
          <button onClick={() => setForm(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Close"><X className="w-4 h-4" /></button>
        </div>

        {message && <div className={`p-3 rounded-lg border text-xs ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{message.text}</div>}
        {errors.length > 0 && <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1"><div className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Fix these items before saving</div>{errors.map(error => <div key={error}>• {error}</div>)}</div>}

        <section className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Basic Exam Information</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
            <label className="field-stack"><span className="field-label">Exam Type</span><select disabled={readOnly} value={form.examType} onChange={event => updateForm({ examType: event.target.value })} className="field"><option value="University">University</option><option value="Competitive Exam">Competitive Exam</option></select></label>
            <label className="field-stack"><span className="field-label">{examNameLabel}</span><input disabled={readOnly} value={form.examName} onChange={event => updateForm({ examName: event.target.value })} className="field" /></label>
            <label className="field-stack"><span className="field-label">Exam Year</span><input disabled={readOnly} type="number" value={form.examYear} onChange={event => updateForm({ examYear: numberValue(event.target.value) })} className="field" /></label>
            <label className="field-stack"><span className="field-label">Paper Name</span><input disabled={readOnly} value={form.paperName} onChange={event => updateForm({ paperName: event.target.value })} className="field" /></label>
            <label className="field-stack"><span className="field-label">Duration (minutes)</span><input disabled={readOnly} type="number" min="0" value={form.durationMinutes} onChange={event => updateForm({ durationMinutes: numberValue(event.target.value) })} className="field" /></label>
          </div>
        </section>

        <section className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3"><div className="text-sm font-bold text-slate-900">Paper Pattern Sections</div>{!readOnly && <button onClick={() => updateForm({ sections: [...(form.sections || []), newSection(form.examType === 'University' ? 'MCQ' : 'MCQ')] })} className="button-primary"><Plus className="w-4 h-4" /> Add Section</button>}</div>
          <div className="space-y-4">
            {form.sections.map((section, index) => {
              const subQuestionCount = numberValue(String(section.subQuestions ?? section.totalQuestions), 0);
              const marksPerSubQuestion = numberValue(String(section.marksPerSubQuestion ?? section.marksPerQuestion), 0);
              const attempts = numberValue(String(section.questionsToAttempt || subQuestionCount), 0);
              const sectionMarks = attempts * marksPerSubQuestion;
              return <div key={section.id} className="section-card">
                <div className="section-header"><div className="text-xs font-bold text-slate-800">Question {section.questionNumber || index + 1}</div>{!readOnly && form.sections.length > 1 && <button onClick={() => updateForm({ sections: form.sections.filter(item => item.id !== section.id) })} className="section-remove" title="Remove question"><Trash2 className="w-4 h-4" /></button>}</div>
                <div className="section-grid">
                  <label className="field-stack"><span className="field-label">Question Number</span><input disabled={readOnly} value={section.questionNumber || index + 1} onChange={event => updateSection(section.id, { questionNumber: event.target.value })} className="field" placeholder="1" /></label>
                  <label className="field-stack"><span className="field-label">Section Name</span><input disabled={readOnly} value={section.name} onChange={event => updateSection(section.id, { name: event.target.value })} className="field" placeholder="Section A" /></label>
                  <label className="field-stack"><span className="field-label">Subject</span><input disabled={readOnly} value={section.subject} onChange={event => updateSection(section.id, { subject: event.target.value })} className="field" placeholder="Mathematics" /></label>
                  <label className="field-stack"><span className="field-label">Question Type</span><select disabled={readOnly} value={section.questionType} onChange={event => updateSection(section.id, { questionType: event.target.value as ExamType })} className="field"><option>MCQ</option><option>THEORY</option><option>MIXED</option><option>PRACTICAL_CODING</option></select></label>
                  <label className="field-stack"><span className="field-label">Difficulty Level</span><select disabled={readOnly} value={section.difficulty || 'ANY'} onChange={event => updateSection(section.id, { difficulty: event.target.value as BlueprintSection['difficulty'] })} className="field"><option>ANY</option><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></label>
                  <label className="field-stack"><span className="field-label">Number of Sub-Questions</span><input disabled={readOnly} type="number" min="1" value={subQuestionCount} onChange={event => {
                    const nextValue = numberValue(event.target.value, 0);
                    const nextAttempts = numberValue(String(section.questionsToAttempt || nextValue), 0);
                    updateSection(section.id, {
                      subQuestions: nextValue,
                      totalQuestions: nextValue,
                      totalMarks: nextAttempts * marksPerSubQuestion,
                      marksPerQuestion: marksPerSubQuestion,
                      marksPerSubQuestion: marksPerSubQuestion,
                    });
                  }} className="field" /></label>
                  <label className="field-stack"><span className="field-label">Questions to Attempt</span><input disabled={readOnly} type="number" min="1" value={section.questionsToAttempt} onChange={event => {
                    const nextValue = numberValue(event.target.value, 0);
                    updateSection(section.id, { questionsToAttempt: nextValue, totalMarks: nextValue * marksPerSubQuestion });
                  }} className="field" /></label>
                  <label className="field-stack"><span className="field-label">Marks per Sub-Question</span><input disabled={readOnly} type="number" min="1" step="0.25" value={marksPerSubQuestion} onChange={event => {
                    const nextValue = numberValue(event.target.value, 0);
                    const nextAttempts = numberValue(String(section.questionsToAttempt || subQuestionCount), 0);
                    updateSection(section.id, {
                      marksPerSubQuestion: nextValue,
                      marksPerQuestion: nextValue,
                      totalMarks: nextAttempts * nextValue,
                      mainQuestionMarks: 0,
                    });
                  }} className="field" /></label>
                  <label className="field-stack"><span className="field-label">Calculated Total Marks</span><input disabled value={sectionMarks} className="field" /></label>
                  <label className="field-stack"><span className="field-label">Negative Marking</span><input disabled={readOnly} type="number" min="0" step="0.25" value={section.negativeMarks} onChange={event => updateSection(section.id, { negativeMarks: numberValue(event.target.value) })} className="field" /></label>
                </div>
                <div className="section-summary"><span className="field-label">Question Total</span><span className="section-summary-value">{sectionMarks} marks</span></div>
              </div>;
            })}
          </div>
        </section>

        <section className="p-5 rounded-xl bg-emerald-950 text-white shadow-xs"><div className="text-xs uppercase tracking-wider text-emerald-200 font-bold mb-3">Pattern Summary</div><div className="grid grid-cols-3 gap-4 text-center items-end"><div className="summary-stat"><div className="summary-value">{totalQuestions}</div><div className="summary-label">Total Questions</div></div><div className="summary-stat"><div className="summary-value">{totalMarks}</div><div className="summary-label">Total Marks</div></div><div className="summary-stat"><div className="summary-value">{form.durationMinutes}</div><div className="summary-label">Duration (min)</div></div></div></section>

        {!readOnly && <div className="action-row"><button onClick={() => setForm(null)} className="button-secondary">Cancel</button><button disabled={saving} onClick={() => save(true)} className="button-secondary"><Save className="w-4 h-4" /> Save as Draft</button><button disabled={saving} onClick={() => save(false)} className="button-primary"><CheckCircle2 className="w-4 h-4" /> Save Paper Pattern</button></div>}
        {readOnly && <div className="action-row justify-end"><button onClick={() => setForm(null)} className="button-secondary">Close</button></div>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Blueprint &amp; Pattern</h2><p className="text-xs text-slate-500 mt-1">Create and manage examination paper patterns</p></div><button onClick={openCreate} className="button-primary"><Plus className="w-4 h-4" /> Add Paper Pattern</button></div>
      {message && <div className={`p-3 rounded-lg border text-xs ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{message.text}</div>}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3"><div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} className="field pl-9" placeholder="Search exam, paper, or conducting body" /></div><div className="flex gap-2"><div className="relative"><Filter className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" /><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="field pl-8"><option value="ALL">All types</option><option value="MCQ">MCQ</option><option value="THEORY">Theory</option><option value="MIXED">Mixed</option><option value="PRACTICAL_CODING">Practical</option></select></div><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="field"><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="INACTIVE">Inactive</option></select></div></div>
      <div className="overflow-x-auto rounded-xl bg-white border border-slate-200 shadow-xs"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600 uppercase tracking-wider"><tr><th className="px-4 py-3">Exam / Pattern</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Year</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading blueprints...</td></tr> : visibleBlueprints.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No paper patterns saved yet.</td></tr> : visibleBlueprints.map(blueprint => <tr key={`${blueprint.examId}-${blueprint.id}`} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-bold text-slate-900">{blueprint.examName}</div><div className="text-slate-500">{blueprint.paperName} · {blueprint.version}</div></td><td className="px-4 py-3 text-slate-700">{blueprint.examType}</td><td className="px-4 py-3 text-slate-700">{blueprint.examYear}</td><td className="px-4 py-3 text-slate-700">{blueprint.totalMarks}</td><td className="px-4 py-3 text-slate-700">{blueprint.durationMinutes} min</td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full font-bold ${blueprint.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : blueprint.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{blueprint.status}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => openExisting(blueprint, true)} className="icon-button" title="View"><Eye className="w-4 h-4" /></button><button onClick={() => openExisting(blueprint, false)} className="icon-button" title="Edit"><Pencil className="w-4 h-4" /></button><button onClick={() => deactivate(blueprint)} className="icon-button text-rose-600" title="Deactivate"><Trash2 className="w-4 h-4" /></button></div></td></tr>)}</tbody></table></div>
      <style>{`.field-stack{display:flex;flex-direction:column;gap:.35rem;min-width:0}.field-label{display:block;font-size:11px;font-weight:700;color:#334155;line-height:1.4}.field{width:100%;min-height:2.5rem;padding:.6rem .75rem;border:1px solid #cbd5e1;border-radius:.6rem;background:#f8fafc;color:#0f172a;outline:none;line-height:1.4}.field:focus{border-color:#047857;box-shadow:0 0 0 2px rgba(5,150,105,.12)}.field:disabled{opacity:.7}.button-primary,.button-secondary{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:.7rem 1rem;border-radius:.6rem;font-size:.75rem;font-weight:700;line-height:1;white-space:nowrap}.button-primary{background:#064e3b;color:#fff;border:1px solid #064e3b}.button-primary:hover{background:#065f46}.button-secondary{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1}.button-secondary:hover{background:#e2e8f0}.icon-button{padding:.4rem;border-radius:.4rem;color:#475569}.icon-button:hover{background:#e2e8f0;color:#0f172a}.section-card{padding:1rem;border:1px solid #e2e8f0;border-radius:.9rem;background:#f8fafc;display:flex;flex-direction:column;gap:1rem}.section-header{display:flex;align-items:center;justify-content:space-between}.section-grid{display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:1rem}.section-remove{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:.5rem;color:#dc2626;background:transparent}.section-remove:hover{background:#fee2e2}.section-summary{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding-top:.5rem;border-top:1px solid #e2e8f0;font-size:12px;color:#475569}.section-summary-value{font-weight:700;color:#0f172a}.summary-stat{display:flex;flex-direction:column;align-items:center;gap:.35rem}.summary-value{font-size:1.5rem;font-weight:800;line-height:1}.summary-label{font-size:11px;color:#bbf7d0}.action-row{display:flex;align-items:center;justify-content:flex-end;gap:.75rem;padding-top:.5rem;padding-bottom:.5rem;flex-wrap:wrap}.@media (min-width: 768px){.section-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.action-row{padding-bottom:.75rem}}@media (min-width: 1280px){.section-grid{grid-template-columns:repeat(4,minmax(0,1fr));}}`}</style>
    </div>
  );
};
