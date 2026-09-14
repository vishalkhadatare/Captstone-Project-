import React, { useState, useEffect, useMemo } from 'react';
import {
  Shuffle,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Search,
  UserCheck,
  Users,
  Eye,
  Sliders,
  Fingerprint,
  Sparkles,
  Plus,
  Trash2,
  Database,
  Lock,
  Building2,
  X,
} from 'lucide-react';
import { api } from '../../api';
import {
  MultiPaperSourcePaper,
  PaperBlueprintConfig,
  BlueprintValidationResult,
  GeneratedPaper,
  GeneratedPaperQuestion,
  CandidateAssignmentItem,
  Examination,
} from '../../types';

interface DynamicMultiPaperGeneratorProps {
  examinations?: Examination[];
  selectedExamId?: string;
  onNavigateSubTab?: (subTab: string) => void;
}

export const DynamicMultiPaperGenerator: React.FC<DynamicMultiPaperGeneratorProps> = ({
  examinations = [],
  selectedExamId: initialExamId,
  onNavigateSubTab,
}) => {
  // Navigation & Sub-views
  const [activeView, setActiveView] = useState<'generate' | 'papers' | 'dispatch' | 'forensics'>('generate');

  // Exam Selection
  const [selectedExamId, setSelectedExamId] = useState<string>(initialExamId || '');

  // Source Papers
  const [sourcePapers, setSourcePapers] = useState<MultiPaperSourcePaper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  // Blueprint State
  const [paperTitle, setPaperTitle] = useState<string>('National Standard Mock Examination 2026');
  const [preset, setPreset] = useState<'adaptive' | 'neet' | 'jee' | 'balanced' | 'custom'>('adaptive');
  const [totalQuestions, setTotalQuestions] = useState<number>(30);
  const [maxContributionPercent, setMaxContributionPercent] = useState<number>(100);
  const [numSets, setNumSets] = useState<number>(4);

  // Subject Quotas
  const [subjectQuotas, setSubjectQuotas] = useState<{ subject: string; count: number }[]>([
    { subject: 'Physics', count: 45 },
    { subject: 'Chemistry', count: 45 },
    { subject: 'Botany', count: 45 },
    { subject: 'Zoology', count: 45 },
  ]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCount, setNewSubjectCount] = useState<number>(30);

  // Difficulty Distribution
  const [diffDistribution, setDiffDistribution] = useState<{ easy: number; medium: number; hard: number }>({
    easy: 30,
    medium: 50,
    hard: 20,
  });

  // Validation State
  const [validation, setValidation] = useState<BlueprintValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Generation State
  const [generating, setGenerating] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Generated Papers State
  const [generatedPapers, setGeneratedPapers] = useState<GeneratedPaper[]>([]);
  const [loadingGenerated, setLoadingGenerated] = useState(false);
  const [inspectingPaper, setInspectingPaper] = useState<{
    paper: GeneratedPaper;
    questions: GeneratedPaperQuestion[];
  } | null>(null);
  const [loadingInspection, setLoadingInspection] = useState(false);

  // Candidate Assignment State
  const [assignPaperId, setAssignPaperId] = useState<string>('');
  const [candidateListText, setCandidateListText] = useState<string>(
    '2601001, Aryan Sharma, Center-01, S-12\n2601002, Priya Patel, Center-01, S-13\n2601003, Rohan Verma, Center-02, S-04\n2601004, Ananya Iyer, Center-02, S-05'
  );
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{ count: number; message: string } | null>(null);
  const [paperAssignments, setPaperAssignments] = useState<CandidateAssignmentItem[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Forensics State
  const [traceQuery, setTraceQuery] = useState('');
  const [tracing, setTracing] = useState(false);
  const [traceResult, setTraceResult] = useState<{
    matched_paper?: GeneratedPaper | null;
    matched_assignments?: CandidateAssignmentItem[];
    matched_questions?: GeneratedPaperQuestion[];
  } | null>(null);

  // Copied alert helper
  const [copiedFingerprint, setCopiedFingerprint] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFingerprint(text);
    setTimeout(() => setCopiedFingerprint(null), 2000);
  };

  // Auto-fit quotas and rules directly from selected/available source papers
  const applyAutoFitPreset = (targetPapers?: MultiPaperSourcePaper[]) => {
    const papersToUse = targetPapers || sourcePapers.filter((p) => selectedPaperIds.includes(p.id));
    if (papersToUse.length === 0) return;

    const subjectMap: Record<string, number> = {};
    let totalQ = 0;

    papersToUse.forEach((p) => {
      if (Array.isArray(p.breakdown) && p.breakdown.length > 0) {
        p.breakdown.forEach((b: any) => {
          const sub = (b.subject || p.subject || 'General').trim();
          subjectMap[sub] = (subjectMap[sub] || 0) + Number(b.count || 0);
          totalQ += Number(b.count || 0);
        });
      } else {
        const sub = (p.subject || 'General').trim();
        const cnt = Number(p.actualQuestionCount || p.question_count || 0);
        subjectMap[sub] = (subjectMap[sub] || 0) + cnt;
        totalQ += cnt;
      }
    });

    const entries = Object.entries(subjectMap);
    const quotas = entries.length > 0
      ? entries.map(([subject, count]) => ({ subject, count: Math.max(1, count) }))
      : [{ subject: (papersToUse[0]?.subject || 'General').trim(), count: Math.max(1, totalQ || 20) }];

    const calcTotal = quotas.reduce((sum, q) => sum + q.count, 0);
    const primaryName = (papersToUse[0]?.original_filename || '').replace(/\.pdf$/i, '') || papersToUse[0]?.subject || 'Academic';

    setPreset('adaptive');
    setPaperTitle(`${primaryName} Multi-Set Examination 2026`);
    setTotalQuestions(calcTotal > 0 ? calcTotal : 30);
    setSubjectQuotas(quotas);
    setDiffDistribution({ easy: 30, medium: 50, hard: 20 });
    setNumSets(4);
    setMaxContributionPercent(papersToUse.length === 1 ? 100 : Math.min(100, Math.ceil(100 / papersToUse.length) + 15));
  };

  // Load Source Papers
  const fetchSourcePapers = async () => {
    setLoadingSources(true);
    try {
      const res = await api.multiPaper.getSourcePapers(selectedExamId || undefined);
      if (res.success && (res.papers || (res as any).sourcePapers)) {
        const papers = res.papers || (res as any).sourcePapers || [];
        setSourcePapers(papers);
        // By default select all papers that have questions
        const withQuestions = papers.filter((p: any) => (p.actualQuestionCount || p.question_count || 0) > 0);
        const toSelect = withQuestions.length > 0 ? withQuestions.map((p: any) => p.id) : papers.map((p: any) => p.id);
        setSelectedPaperIds(toSelect);

        // Auto-adapt blueprint if papers exist
        if (papers.length > 0) {
          const eligible = withQuestions.length > 0 ? withQuestions : papers;
          applyAutoFitPreset(eligible);
        }
      }
    } catch (err: any) {
      console.error('Failed to load source papers', err);
    } finally {
      setLoadingSources(false);
    }
  };

  const autoBalanceQuotas = () => {
    if (subjectQuotas.length === 0) return;
    const perSub = Math.floor(totalQuestions / subjectQuotas.length);
    const remainder = totalQuestions - perSub * subjectQuotas.length;
    setSubjectQuotas(
      subjectQuotas.map((sq, idx) => ({
        ...sq,
        count: idx === 0 ? perSub + remainder : perSub,
      }))
    );
  };

  // Load Generated Papers
  const fetchGeneratedPapers = async () => {
    setLoadingGenerated(true);
    try {
      const res = await api.multiPaper.getGeneratedPapers(selectedExamId || undefined);
      if (res.success && (res.papers || (res as any).generatedPapers)) {
        const list = res.papers || (res as any).generatedPapers || [];
        setGeneratedPapers(list);
        if (list.length > 0 && !assignPaperId) {
          setAssignPaperId(list[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load generated papers', err);
    } finally {
      setLoadingGenerated(false);
    }
  };

  useEffect(() => {
    fetchSourcePapers();
    fetchGeneratedPapers();
  }, [selectedExamId]);

  // Handle Preset Changes
  const applyPreset = (presetKey: 'adaptive' | 'neet' | 'jee' | 'balanced' | 'custom') => {
    setPreset(presetKey);
    if (presetKey === 'adaptive') {
      applyAutoFitPreset();
    } else if (presetKey === 'neet') {
      setPaperTitle('NEET UG National Medical Entrance Simulation 2026');
      setTotalQuestions(180);
      setSubjectQuotas([
        { subject: 'Physics', count: 45 },
        { subject: 'Chemistry', count: 45 },
        { subject: 'Botany', count: 45 },
        { subject: 'Zoology', count: 45 },
      ]);
      setDiffDistribution({ easy: 30, medium: 50, hard: 20 });
      setMaxContributionPercent(selectedPaperIds.length === 1 ? 100 : 40);
    } else if (presetKey === 'jee') {
      setPaperTitle('JEE Main Engineering Entrance Simulation 2026');
      setTotalQuestions(75);
      setSubjectQuotas([
        { subject: 'Physics', count: 25 },
        { subject: 'Chemistry', count: 25 },
        { subject: 'Mathematics', count: 25 },
      ]);
      setDiffDistribution({ easy: 25, medium: 50, hard: 25 });
      setMaxContributionPercent(selectedPaperIds.length === 1 ? 100 : 40);
    } else if (presetKey === 'balanced') {
      setPaperTitle('Balanced Multi-Disciplinary Assessment 2026');
      setTotalQuestions(60);
      const availSubjects = Array.from(new Set(sourcePapers.map((p) => p.subject).filter(Boolean)));
      const subjectsToUse = availSubjects.length > 0 ? availSubjects : ['Academic Assessment'];
      const perSub = Math.floor(60 / subjectsToUse.length);
      setSubjectQuotas(
        subjectsToUse.map((s, idx) => ({
          subject: s,
          count: idx === 0 ? 60 - perSub * (subjectsToUse.length - 1) : perSub,
        }))
      );
      setDiffDistribution({ easy: 33, medium: 34, hard: 33 });
      setMaxContributionPercent(selectedPaperIds.length === 1 ? 100 : 40);
    }
  };

  // Compile Current Blueprint Config
  const currentBlueprint: PaperBlueprintConfig = useMemo(() => {
    return {
      name: paperTitle,
      totalQuestions: totalQuestions,
      subjects: subjectQuotas,
      difficulty: diffDistribution,
      maxSourceContributionPercent: maxContributionPercent,
      antiDuplication: true,
    };
  }, [paperTitle, totalQuestions, subjectQuotas, diffDistribution, maxContributionPercent]);

  // Run Blueprint Validation
  const validateBlueprint = async () => {
    if (selectedPaperIds.length === 0) {
      setValidation({
        feasible: false,
        errors: ['Please select at least 1 source paper.'],
        stats: {
          availableCount: 0,
          requiredCount: totalQuestions,
          maxAllowedPerPaper: Math.ceil((totalQuestions * maxContributionPercent) / 100),
          minRequiredPapers: 1,
        },
      });
      return;
    }

    setValidating(true);
    try {
      const res = await api.multiPaper.validateBlueprint(currentBlueprint, selectedPaperIds);
      if (res.validation || (res as any).feasible !== undefined) {
        setValidation(res.validation || (res as any));
      }
    } catch (err: any) {
      console.error('Validation error', err);
    } finally {
      setValidating(false);
    }
  };

  // Debounced Auto-Validation
  useEffect(() => {
    const timer = setTimeout(() => {
      validateBlueprint();
    }, 400);
    return () => clearTimeout(timer);
  }, [currentBlueprint, selectedPaperIds]);

  // Handle Paper Generation
  const handleGenerate = async () => {
    setGenerating(true);
    setGenerationSuccess(null);
    setGenerationError(null);

    const versionNames = Array.from({ length: numSets }, (_, i) => `Set ${String.fromCharCode(65 + i)}`);

    try {
      const res = await api.multiPaper.generate({
        exam_id: selectedExamId || undefined,
        title: paperTitle,
        blueprint: currentBlueprint,
        versions: versionNames,
        source_paper_ids: selectedPaperIds,
      });

      if (res.success) {
        setGenerationSuccess(res.message || `Successfully generated ${numSets} cryptographic paper sets!`);
        fetchGeneratedPapers();
        setActiveView('papers');
      } else {
        setGenerationError(res.message || 'Paper generation failed.');
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Error occurred during cryptographic paper generation.');
    } finally {
      setGenerating(false);
    }
  };

  // Inspect Generated Paper
  const handleInspectPaper = async (paper: GeneratedPaper) => {
    setLoadingInspection(true);
    try {
      const res = await api.multiPaper.getGeneratedPaperDetails(paper.id);
      if (res.paper && res.questions) {
        setInspectingPaper({ paper: res.paper, questions: res.questions });
      }
    } catch (err: any) {
      console.error('Failed to load paper details', err);
    } finally {
      setLoadingInspection(false);
    }
  };

  // Load Assignments for Selected Paper
  const fetchPaperAssignments = async (paperId: string) => {
    if (!paperId) return;
    setLoadingAssignments(true);
    try {
      const res = await api.multiPaper.getAssignments(paperId);
      if (res.assignments) {
        setPaperAssignments(res.assignments);
      }
    } catch (err: any) {
      console.error('Failed to load assignments', err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => {
    if (assignPaperId) {
      fetchPaperAssignments(assignPaperId);
    }
  }, [assignPaperId]);

  // Handle Candidate Assignment Submit
  const handleAssignSubmit = async () => {
    if (!assignPaperId) return;
    setAssigning(true);
    setAssignResult(null);

    try {
      const lines = candidateListText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const candidates = lines.map((l) => {
        const parts = l.split(',').map((p) => p.trim());
        return {
          roll_number: parts[0],
          candidate_name: parts[1] || undefined,
          center_code: parts[2] || undefined,
          seat_number: parts[3] || undefined,
        };
      });

      const res = await api.multiPaper.assignCandidates({
        generated_paper_id: assignPaperId,
        candidates,
      });

      if (res.success) {
        setAssignResult({ count: res.assigned_count, message: res.message });
        fetchPaperAssignments(assignPaperId);
      }
    } catch (err: any) {
      setAssignResult({ count: 0, message: err.message || 'Failed to assign candidates' });
    } finally {
      setAssigning(false);
    }
  };

  // Handle Leak Tracing
  const handleTrace = async () => {
    if (!traceQuery.trim()) return;
    setTracing(true);
    setTraceResult(null);

    try {
      const query = traceQuery.trim();
      const res = await api.multiPaper.traceLeak({
        fingerprint: query.startsWith('ZL-') ? query : undefined,
        question_id: !query.startsWith('ZL-') && query.length > 10 ? query : undefined,
        candidate_roll: query,
      });

      if (res.success) {
        setTraceResult({
          matched_paper: res.matched_paper || (res as any).paper,
          matched_assignments: res.matched_assignments || (res as any).assignedCandidates,
          matched_questions: res.matched_questions,
        });
      }
    } catch (err: any) {
      console.error('Trace error', err);
    } finally {
      setTracing(false);
    }
  };

  // Aggregated Pool Metrics
  const poolStats = useMemo(() => {
    const selected = sourcePapers.filter((p) => selectedPaperIds.includes(p.id));
    const totalQ = selected.reduce((sum, p) => sum + (p.actualQuestionCount || p.question_count || 0), 0);
    const allSubs = new Set<string>();
    selected.forEach((p) => {
      if (p.subject) allSubs.add(p.subject);
      (p.breakdown || []).forEach((b) => allSubs.add(b.subject));
    });
    return {
      selectedCount: selected.length,
      totalCount: sourcePapers.length,
      totalQuestions: totalQ,
      subjectCount: allSubs.size,
    };
  }, [sourcePapers, selectedPaperIds]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white shadow-xl border border-emerald-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Shuffle className="w-3.5 h-3.5" /> Dynamic Multi-Paper Engine
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Permutative & Combinatorial Paper Generator
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Select questions across multiple master uploaded papers, balance subject quotas and difficulty,
              cryptographically shuffle questions & options, and trace leaks through tamper-evident fingerprints.
            </p>
          </div>

          {/* Action Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/60">
            <button
              onClick={() => setActiveView('generate')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'generate'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" /> Generator Studio
            </button>
            <button
              onClick={() => {
                setActiveView('papers');
                fetchGeneratedPapers();
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'papers'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Generated Sets ({generatedPapers.length})
            </button>
            <button
              onClick={() => setActiveView('dispatch')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'dispatch'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Candidate Dispatch
            </button>
            <button
              onClick={() => setActiveView('forensics')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'forensics'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Search className="w-3.5 h-3.5" /> Forensic Leak Tracer
            </button>
          </div>

          {onNavigateSubTab && (
            <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 md:border-l border-white/10 md:pl-3 pt-2 md:pt-0">
              <button
                type="button"
                onClick={() => onNavigateSubTab('paper_versions')}
                className="px-3 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                title="Open Paper Versions Studio to inspect cryptographic release sets & Shamir keys"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-300" />
                <span>Paper Versions</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateSubTab('examination_centres')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                title="Configure Delivery Centres & Copy Control quotas"
              >
                <Building2 className="w-3.5 h-3.5 text-slate-300" />
                <span>Centres</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* VIEW 1: GENERATOR STUDIO                                */}
      {/* ======================================================== */}
      {activeView === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Source Papers Pool & Blueprint Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Source Papers Selection */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                    1
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">Select Master Source Papers</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const validIds = sourcePapers
                        .filter((p) => (p.actualQuestionCount || p.question_count || 0) > 0)
                        .map((p) => p.id);
                      setSelectedPaperIds(validIds);
                    }}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200"
                  >
                    Select All Valid ({sourcePapers.filter((p) => (p.actualQuestionCount || p.question_count || 0) > 0).length})
                  </button>
                  <button
                    onClick={() => {
                      if (selectedPaperIds.length === sourcePapers.length) {
                        setSelectedPaperIds([]);
                      } else {
                        setSelectedPaperIds(sourcePapers.map((p) => p.id));
                      }
                    }}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
                  >
                    {selectedPaperIds.length === sourcePapers.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={fetchSourcePapers}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
                    title="Refresh source papers"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSources ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Pool Quick Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-xs text-slate-500 font-medium">Selected Papers</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    {poolStats.selectedCount} <span className="text-xs text-slate-400 font-normal">/ {poolStats.totalCount}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                  <div className="text-xs text-emerald-700 font-medium">Pooled Questions</div>
                  <div className="text-lg font-black text-emerald-900 mt-0.5">
                    {poolStats.totalQuestions} <span className="text-xs text-emerald-600 font-normal">Available</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80">
                  <div className="text-xs text-teal-700 font-medium">Subjects Detected</div>
                  <div className="text-lg font-black text-teal-900 mt-0.5">{poolStats.subjectCount} Subjects</div>
                </div>
              </div>

              {/* Source Papers List */}
              {loadingSources ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-xs">Loading verified source papers...</span>
                </div>
              ) : sourcePapers.length === 0 ? (
                <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <Database className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No extracted source papers found</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Upload and extract question papers via the <strong>Question Workflow</strong> tab to populate the
                    master question pool.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {sourcePapers.map((sp) => {
                    const isSelected = selectedPaperIds.includes(sp.id);
                    const qCount = sp.actualQuestionCount || sp.question_count || 0;
                    return (
                      <div
                        key={sp.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedPaperIds(selectedPaperIds.filter((id) => id !== sp.id));
                          } else {
                            setSelectedPaperIds([...selectedPaperIds, sp.id]);
                          }
                        }}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-emerald-50/60 border-emerald-300 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 opacity-75'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm truncate">
                                {sp.original_filename || `Source Paper ${sp.id.substring(0, 6)}`}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                {sp.examination_category || 'General'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              {qCount > 0 ? (
                                <span className="font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                                  ✓ {qCount} verified questions
                                </span>
                              ) : (
                                <span className="font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                  0 questions (Empty)
                                </span>
                              )}
                              <span>•</span>
                              <span className="text-slate-500 truncate">Subject: {sp.subject || 'Multi-disciplinary'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                            qCount > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {qCount > 0 ? 'READY' : 'NEEDS QUESTIONS'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2: Blueprint Presets & Structure */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                    2
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">Paper Blueprint & Combination Rules</h3>
                </div>

                {/* Preset Selector */}
                <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => applyAutoFitPreset()}
                    className={`px-2.5 py-1 rounded font-bold transition-all flex items-center gap-1 ${
                      preset === 'adaptive' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Auto-detect subjects and question quotas from selected papers"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Auto-Fit Papers
                  </button>
                  <button
                    onClick={() => applyPreset('neet')}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${
                      preset === 'neet' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    NEET UG (180Q)
                  </button>
                  <button
                    onClick={() => applyPreset('jee')}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${
                      preset === 'jee' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    JEE Main (75Q)
                  </button>
                  <button
                    onClick={() => applyPreset('balanced')}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${
                      preset === 'balanced'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Balanced
                  </button>
                  <button
                    onClick={() => setPreset('custom')}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${
                      preset === 'custom'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Title Input & Total Questions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Generated Examination Title</label>
                  <input
                    type="text"
                    value={paperTitle}
                    onChange={(e) => setPaperTitle(e.target.value)}
                    placeholder="Enter examination title..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Total Questions</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={totalQuestions}
                    onChange={(e) => setTotalQuestions(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-xs font-bold text-slate-900 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Max Contribution Cap Slider */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Max Source Contribution Cap
                  </span>
                  <span className="font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {selectedPaperIds.length === 1 ? 100 : maxContributionPercent}% per paper
                  </span>
                </div>
                <input
                  type="range"
                  min={selectedPaperIds.length === 1 ? 100 : 15}
                  max={100}
                  step={5}
                  disabled={selectedPaperIds.length === 1}
                  value={selectedPaperIds.length === 1 ? 100 : maxContributionPercent}
                  onChange={(e) => setMaxContributionPercent(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 disabled:opacity-60"
                />
                <p className="text-[11px] text-slate-500">
                  {selectedPaperIds.length === 1
                    ? 'Single master paper selected: 100% contribution enabled. The generator will create 4 distinct randomized paper sets (Sets A, B, C, D) with shuffled question orders and shuffled option keys.'
                    : `Enforces mathematical balance. At ${maxContributionPercent}% cap, no single uploaded source paper can dominate more than ${Math.ceil((totalQuestions * maxContributionPercent) / 100)} questions.`}
                </p>
              </div>

              {/* Subject Quotas Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Subject Distribution Quotas</label>
                  <span className="text-[11px] text-slate-500">
                    Allocated:{' '}
                    <strong
                      className={
                        subjectQuotas.reduce((a, b) => a + b.count, 0) === totalQuestions
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                      }
                    >
                      {subjectQuotas.reduce((a, b) => a + b.count, 0)}
                    </strong>{' '}
                    / {totalQuestions}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    {subjectQuotas.reduce((a, b) => a + b.count, 0) !== totalQuestions && (
                      <button
                        onClick={autoBalanceQuotas}
                        type="button"
                        className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded transition-colors"
                      >
                        Auto-Balance
                      </button>
                    )}
                    <span>
                      Allocated:{' '}
                      <strong
                        className={
                          subjectQuotas.reduce((a, b) => a + b.count, 0) === totalQuestions
                            ? 'text-emerald-600'
                            : 'text-amber-600'
                        }
                      >
                        {subjectQuotas.reduce((a, b) => a + b.count, 0)}
                      </strong>{' '}
                      / {totalQuestions}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {subjectQuotas.map((sq, idx) => (
                    <div
                      key={sq.subject}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white"
                    >
                      <span className="text-xs font-semibold text-slate-800">{sq.subject}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={sq.count}
                          onChange={(e) => {
                            const newCount = Math.max(0, parseInt(e.target.value) || 0);
                            const updated = [...subjectQuotas];
                            updated[idx].count = newCount;
                            setSubjectQuotas(updated);
                          }}
                          className="w-16 px-2 py-1 text-xs font-bold text-right rounded border border-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={() => setSubjectQuotas(subjectQuotas.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Subject Row */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Subject Name (e.g. Mathematics)"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="number"
                    placeholder="Count"
                    value={newSubjectCount}
                    onChange={(e) => setNewSubjectCount(parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => {
                      if (newSubjectName.trim()) {
                        setSubjectQuotas([
                          ...subjectQuotas,
                          { subject: newSubjectName.trim(), count: newSubjectCount },
                        ]);
                        setNewSubjectName('');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
              </div>

              {/* Difficulty Ratio Sliders */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-700">Difficulty Distribution (%)</label>
                  <span
                    className={`font-black text-xs px-2 py-0.5 rounded ${
                      diffDistribution.easy + diffDistribution.medium + diffDistribution.hard === 100
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    Total: {diffDistribution.easy + diffDistribution.medium + diffDistribution.hard}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-green-700">
                      <span>Easy</span>
                      <span>{diffDistribution.easy}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={diffDistribution.easy}
                      onChange={(e) =>
                        setDiffDistribution({ ...diffDistribution, easy: parseInt(e.target.value) || 0 })
                      }
                      className="w-full accent-green-600 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-amber-700">
                      <span>Medium</span>
                      <span>{diffDistribution.medium}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={diffDistribution.medium}
                      onChange={(e) =>
                        setDiffDistribution({ ...diffDistribution, medium: parseInt(e.target.value) || 0 })
                      }
                      className="w-full accent-amber-600 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-rose-700">
                      <span>Hard</span>
                      <span>{diffDistribution.hard}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={diffDistribution.hard}
                      onChange={(e) =>
                        setDiffDistribution({ ...diffDistribution, hard: parseInt(e.target.value) || 0 })
                      }
                      className="w-full accent-rose-600 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Number of Sets Selector */}
              <div className="space-y-2 pt-2 border-t">
                <label className="text-xs font-bold text-slate-700 block">Number of Permuted Sets to Generate</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumSets(n)}
                      className={`w-10 h-10 rounded-xl font-black text-xs transition-all ${
                        numSets === n
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="text-xs text-slate-500 ml-2">
                    (Set A to Set {String.fromCharCode(64 + numSets)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Pre-Flight Feasibility Check & Action (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 sticky top-6">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                    3
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">Pre-Flight Feasibility Audit</h3>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    validation?.feasible
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {validation?.feasible ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Feasible
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" /> Constraints Unmet
                    </>
                  )}
                </span>
              </div>

              {/* Validation Feedback & Alerts */}
              {validating ? (
                <div className="py-6 flex items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span className="text-xs">Auditing mathematical feasibility...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Errors */}
                  {validation?.errors && validation.errors.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-rose-800">
                        <AlertCircle className="w-4 h-4" /> Blueprint Violations:
                      </div>
                      <ul className="text-xs space-y-1 list-disc list-inside text-rose-700">
                        {validation.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Pool Feasibility Stats */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Available Pooled Questions:</span>
                      <strong className="text-slate-900">{validation?.stats?.availableCount || 0}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Blueprint Required:</span>
                      <strong className="text-slate-900">{validation?.stats?.requiredCount || totalQuestions}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Max Allowed Per Paper:</span>
                      <strong className="text-emerald-700">
                        {validation?.stats?.maxAllowedPerPaper || Math.ceil((totalQuestions * maxContributionPercent) / 100)} Q
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Min Source Papers Needed:</span>
                      <strong className="text-slate-900">{validation?.stats?.minRequiredPapers || 2} Papers</strong>
                    </div>
                  </div>

                  {/* Difficulty Breakdown Preview */}
                  <div className="pt-2 border-t space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">Target Questions by Difficulty</span>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-green-50 border border-green-200">
                        <div className="text-[10px] text-green-700 font-bold uppercase">Easy</div>
                        <div className="text-base font-black text-green-900 mt-0.5">
                          {Math.round((totalQuestions * diffDistribution.easy) / 100)} Q
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                        <div className="text-[10px] text-amber-700 font-bold uppercase">Medium</div>
                        <div className="text-base font-black text-amber-900 mt-0.5">
                          {Math.round((totalQuestions * diffDistribution.medium) / 100)} Q
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                        <div className="text-[10px] text-rose-700 font-bold uppercase">Hard</div>
                        <div className="text-base font-black text-rose-900 mt-0.5">
                          {Math.round((totalQuestions * diffDistribution.hard) / 100)} Q
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Generation Execution Banner / Action */}
              <div className="pt-4 border-t space-y-3">
                {generationError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {generationError}
                  </div>
                )}
                {generationSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    {generationSuccess}
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={generating || !validation?.feasible}
                  className={`w-full py-3.5 px-4 rounded-xl font-black text-sm text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
                    validation?.feasible && !generating
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 cursor-pointer shadow-emerald-900/20'
                      : 'bg-slate-300 cursor-not-allowed opacity-60'
                  }`}
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Executing Combinatorial Engine...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate {numSets} Unique Cryptographic Sets
                    </>
                  )}
                </button>
                <p className="text-[11px] text-center text-slate-500">
                  Each set is cryptographically signed, fingerprinted, and ready for randomized distribution.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: GENERATED SETS SHOWCASE & INSPECTOR             */}
      {/* ======================================================== */}
      {activeView === 'papers' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Generated Secure Paper Sets</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Each set is balanced with identical difficulty metrics while maintaining unique permutation fingerprints.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchGeneratedPapers}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingGenerated ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                onClick={() => setActiveView('generate')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> New Generation Run
              </button>
            </div>
          </div>

          {loadingGenerated ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="text-xs">Loading generated paper repository...</span>
            </div>
          ) : generatedPapers.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-6">
              <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-800">No Generated Papers Found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Head over to the <strong>Generator Studio</strong> to configure your blueprint and generate balanced paper sets.
              </p>
              <button
                onClick={() => setActiveView('generate')}
                className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
              >
                Launch Studio
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {generatedPapers.map((p) => {
                const breakdown = p.source_contribution || {};
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-emerald-900 text-white font-black text-xs uppercase tracking-wider">
                          {p.version_code || 'Set'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(p.generated_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 className="font-black text-slate-900 text-base mt-2.5 line-clamp-1">{p.title}</h4>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Total Questions: <strong className="text-slate-800">{p.total_questions}</strong>
                      </div>

                      {/* Fingerprint Card */}
                      <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Fingerprint className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] text-slate-400 font-bold uppercase">Cryptographic Fingerprint</div>
                            <div className="text-xs font-mono font-bold text-slate-800 truncate">{p.paper_fingerprint}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(p.paper_fingerprint)}
                          className="p-1.5 text-slate-400 hover:text-emerald-700 transition-colors rounded-lg hover:bg-slate-200/60"
                          title="Copy fingerprint"
                        >
                          {copiedFingerprint === p.paper_fingerprint ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Source Paper Contribution Breakdown */}
                      <div className="mt-3.5 space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-600">Source Paper Contribution</div>
                        <div className="space-y-1">
                          {Object.entries(breakdown).map(([paperId, item]) => {
                            const it = item as any;
                            const count = typeof it === 'object' && it ? (it.count ?? 0) : Number(it);
                            const pct = typeof it === 'object' && it ? (it.percent ?? 0) : Math.round((count / (p.total_questions || 1)) * 100);
                            const name = typeof it === 'object' && it?.filename ? it.filename : `Paper ${paperId.substring(0, 8)}`;
                            return (
                              <div key={paperId} className="text-xs space-y-0.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-slate-600 truncate max-w-[170px]">{name}</span>
                                  <span className="font-bold text-slate-800">
                                    {count}Q ({pct}%)
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="pt-3 border-t flex items-center gap-2">
                      <button
                        onClick={() => handleInspectPaper(p)}
                        className="flex-1 py-2 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Inspect Questions
                      </button>
                      <button
                        onClick={() => {
                          setAssignPaperId(p.id);
                          setActiveView('dispatch');
                        }}
                        className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1"
                        title="Assign to Candidates"
                      >
                        <Users className="w-3.5 h-3.5" /> Dispatch
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 3: CANDIDATE DISPATCH                              */}
      {/* ======================================================== */}
      {activeView === 'dispatch' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Assignment Form (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="border-b pb-3">
                <h3 className="font-bold text-slate-900 text-base">Assign Set to Candidate Batch</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Link candidate roll numbers to this specific paper version fingerprint for unforgeable audit trails.
                </p>
              </div>

              {/* Paper Version Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Target Generated Paper Set</label>
                <select
                  value={assignPaperId}
                  onChange={(e) => setAssignPaperId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                >
                  <option value="">-- Select Generated Paper Set --</option>
                  {generatedPapers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.version_code} ({p.paper_fingerprint}) - {p.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Candidate Bulk Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Candidate Data (CSV Format)</label>
                  <button
                    type="button"
                    onClick={() => {
                      const prefix = `NEET26_${Math.floor(1000 + Math.random() * 9000)}`;
                      setCandidateListText(
                        `${prefix}_01, Rahul Sharma, Center-A, S-01\n${prefix}_02, Sneha Rao, Center-A, S-02\n${prefix}_03, Vikram Singh, Center-B, S-11\n${prefix}_04, Kavita Menon, Center-B, S-12`
                      );
                    }}
                    className="text-[11px] text-emerald-700 font-bold hover:underline"
                  >
                    + Generate Sample Batch
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={candidateListText}
                  onChange={(e) => setCandidateListText(e.target.value)}
                  placeholder="RollNumber, CandidateName, CenterCode, SeatNumber"
                  className="w-full p-3 font-mono text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400">Format: RollNumber, CandidateName, CenterCode, SeatNumber</p>
              </div>

              {/* Result Notice */}
              {assignResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    assignResult.count > 0
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {assignResult.message}
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleAssignSubmit}
                disabled={assigning || !assignPaperId}
                className={`w-full py-3 px-4 rounded-xl font-bold text-xs text-white transition-all flex items-center justify-center gap-2 ${
                  assignPaperId && !assigning
                    ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-md'
                    : 'bg-slate-300 cursor-not-allowed opacity-60'
                }`}
              >
                {assigning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Assigning Candidates...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" /> Dispatch & Bind Candidate Batch
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Existing Assignments Table (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-bold text-slate-900 text-base">
                  Registered Assignments for Selected Version ({paperAssignments.length})
                </h3>
                <button
                  onClick={() => fetchPaperAssignments(assignPaperId)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAssignments ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingAssignments ? (
                <div className="py-12 text-center text-slate-400 text-xs">Loading candidate bindings...</div>
              ) : paperAssignments.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs">No candidates assigned to this paper set yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2.5 px-3">Roll Number</th>
                        <th className="py-2.5 px-3">Candidate Name</th>
                        <th className="py-2.5 px-3">Group / Center</th>
                        <th className="py-2.5 px-3">Assigned Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paperAssignments.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                            {a.candidate_roll_number || a.candidate_id}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{a.candidate_name || '—'}</td>
                          <td className="py-2.5 px-3 text-slate-600">{a.candidate_group || '—'}</td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                            {new Date(a.assigned_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 4: FORENSIC LEAK TRACER                             */}
      {/* ======================================================== */}
      {activeView === 'forensics' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-xs uppercase mb-2">
                <AlertTriangle className="w-3.5 h-3.5" /> ZeroLeak Forensic Incident Engine
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Trace Leaked Question or Paper</h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter any captured Cryptographic Paper Fingerprint (e.g. <code>ZL-NEET-2026-XXXX</code>), a specific Question ID,
                or a suspected Candidate Roll Number to pinpoint the exact origin paper and candidate cluster.
              </p>
            </div>

            {/* Search Box */}
            <div className="flex items-center gap-2 max-w-2xl pt-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={traceQuery}
                  onChange={(e) => setTraceQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTrace()}
                  placeholder="Enter Fingerprint (ZL-...), Question ID, or Roll Number..."
                  className="w-full pl-9 pr-3 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
              <button
                onClick={handleTrace}
                disabled={tracing || !traceQuery.trim()}
                className={`py-2.5 px-5 rounded-xl font-bold text-xs text-white transition-all flex items-center gap-1.5 ${
                  traceQuery.trim() && !tracing
                    ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer shadow-md'
                    : 'bg-slate-300 cursor-not-allowed opacity-60'
                }`}
              >
                {tracing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Trace Leak
              </button>
            </div>
          </div>

          {/* Trace Results Showcase */}
          {traceResult && (
            <div className="space-y-6">
              {traceResult.matched_paper ? (
                <div className="p-5 rounded-2xl bg-white border border-rose-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-xl bg-rose-100 text-rose-700 font-bold">
                        <Fingerprint className="w-5 h-5" />
                      </span>
                      <div>
                        <div className="text-xs text-rose-700 font-bold uppercase">Incident Match Identified</div>
                        <h4 className="font-black text-slate-900 text-base">
                          {traceResult.matched_paper.title} ({traceResult.matched_paper.version_code})
                        </h4>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold px-3 py-1 bg-slate-900 text-white rounded-lg">
                      {traceResult.matched_paper.paper_fingerprint}
                    </span>
                  </div>

                  {/* Candidates Attached */}
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 mb-2">
                      Candidates Assigned This Version ({traceResult.matched_assignments?.length || 0})
                    </h5>
                    {traceResult.matched_assignments && traceResult.matched_assignments.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {traceResult.matched_assignments.map((c) => (
                          <div
                            key={c.id}
                            className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                          >
                            <div className="font-bold text-slate-900 font-mono">
                              {c.candidate_roll_number || c.candidate_id}
                            </div>
                            <div className="text-slate-600">{c.candidate_name || 'Unnamed'}</div>
                            <div className="text-[11px] text-slate-400">
                              Batch: {c.candidate_group || 'General'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">No candidates assigned yet to this specific paper.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h4 className="font-bold text-slate-800 text-base">No Matching Paper or Question Found</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    The queried identifier does not match any generated paper fingerprint or candidate binding.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: INSPECT GENERATED PAPER QUESTIONS & ANSWER KEYS   */}
      {/* ======================================================== */}
      {inspectingPaper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-xs uppercase">
                    {inspectingPaper.paper.version_code}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    FP: {inspectingPaper.paper.paper_fingerprint}
                  </span>
                </div>
                <h3 className="font-black text-lg text-white mt-1">{inspectingPaper.paper.title}</h3>
              </div>
              <button
                onClick={() => setInspectingPaper(null)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Questions Scroll */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
              {inspectingPaper.questions.map((q) => {
                const options = q.shuffledOptions || [];
                return (
                  <div
                    key={q.id}
                    className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3"
                  >
                    {/* Top Question Meta */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-900 font-black text-xs flex items-center justify-center">
                          Q{q.display_order}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                          {q.subject || 'General'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            q.difficulty === 'EASY'
                              ? 'bg-green-100 text-green-800'
                              : q.difficulty === 'HARD'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      </div>

                      {/* Origin Source Paper Badge */}
                      <span className="text-[11px] text-slate-500 font-medium">
                        Origin:{' '}
                        <strong className="text-slate-800">{q.source_filename || 'Master Question Bank'}</strong>
                      </span>
                    </div>

                    {/* Question Text */}
                    <div className="text-xs text-slate-800 font-medium leading-relaxed">{q.content_text}</div>

                    {/* Preserved Question Image / Diagram */}
                    {q.diagram_url && (
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 inline-block max-w-md">
                        <img
                          src={q.diagram_url}
                          alt={`Question diagram ${q.display_order}`}
                          className="max-h-64 object-contain rounded"
                        />
                      </div>
                    )}

                    {/* Shuffled MCQ Options */}
                    {options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {options.map((opt, optIdx) => {
                          const optionLetter = String.fromCharCode(65 + optIdx);
                          const isCorrect = optionLetter === q.displayed_correct_answer || opt.id === q.correct_option_id;
                          return (
                            <div
                              key={opt.id || optIdx}
                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                                  : 'bg-slate-50/70 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                  isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {optionLetter}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="block truncate">{opt.text}</span>
                                {isCorrect && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-0.5">
                                    <Check className="w-3 h-3" /> Correct Answer (Permanent ID: {q.correct_option_id})
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setInspectingPaper(null)}
                className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
