import React, { useState, useEffect, useRef } from 'react';
import {
  Languages,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  History,
  FileText,
  HelpCircle,
  Clock,
  Layers,
  Edit3,
  MessageSquare,
  BadgeAlert,
  Info,
} from 'lucide-react';
import { User, Question, QuestionTranslation } from '../../types';
import { api } from '../../api';
import { NavSubTab } from '../Sidebar';
import { AuthorityProctorEnclave } from '../proctor/AuthorityProctorEnclave';

interface TranslatorWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'English', name: 'English', script: 'Latin' },
  { code: 'Hindi', name: 'Hindi (हिंदी)', script: 'Devanagari' },
  { code: 'Marathi', name: 'Marathi (मराठी)', script: 'Devanagari' },
  { code: 'Gujarati', name: 'Gujarati (ગુજરાતી)', script: 'Gujarati' },
  { code: 'Tamil', name: 'Tamil (தமிழ்)', script: 'Tamil' },
  { code: 'Telugu', name: 'Telugu (తెలుగు)', script: 'Telugu' },
  { code: 'Kannada', name: 'Kannada (ಕನ್ನಡ)', script: 'Kannada' },
  { code: 'Bengali', name: 'Bengali (বাংলা)', script: 'Bengali' },
  { code: 'Urdu', name: 'Urdu (اردو)', script: 'Nastaliq' },
  { code: 'Punjabi', name: 'Punjabi (ਪੰਜਾਬੀ)', script: 'Gurmukhi' },
  { code: 'Odia', name: 'Odia (ଓଡ଼ିଆ)', script: 'Odia' },
  { code: 'Assamese', name: 'Assamese (অসমীয়া)', script: 'Assamese' },
  { code: 'Spanish', name: 'Spanish', script: 'Latin' },
  { code: 'French', name: 'French', script: 'Latin' },
  { code: 'German', name: 'German', script: 'Latin' },
  { code: 'Arabic', name: 'Arabic (العربية)', script: 'Arabic' },
  { code: 'Chinese', name: 'Chinese (中文)', script: 'Han' },
  { code: 'Japanese', name: 'Japanese (日本語)', script: 'Japanese' },
  { code: 'Korean', name: 'Korean (한국어)', script: 'Hangul' },
];

const AI_DEFECT_REASONS = [
  'Technical Terminology Inaccuracy',
  'Regional Dialect & Phrasing Nuance',
  'Mathematical Formula / Symbol Formatting',
  'Grammatical / Linguistic Flow Issue',
  'Contextual Distortion / Ambiguous Meaning',
  'Option Solvability Shift',
  'Other Custom Translation Requirement',
];

export const TranslatorWorkspace: React.FC<TranslatorWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [translations, setTranslations] = useState<QuestionTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Translation Workbench State
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>('Hindi');
  const [translationMode, setTranslationMode] = useState<'AI_ASSISTED' | 'MANUAL_OVERRIDE'>('AI_ASSISTED');
  const [translatedContent, setTranslatedContent] = useState('');
  const [translatedOptions, setTranslatedOptions] = useState<string[]>([]);
  const [translatorNotes, setTranslatorNotes] = useState('');

  // AI Override & Feedback State
  const [selectedReasonChip, setSelectedReasonChip] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [aiGeneratedSnapshot, setAiGeneratedSnapshot] = useState<string | null>(null);

  // AI Translation Processing State & Timer
  const [aiTranslating, setAiTranslating] = useState(false);
  const [aiElapsedSeconds, setAiElapsedSeconds] = useState(0);
  const timerRef = useRef<any>(null);

  const [saving, setSaving] = useState(false);
  const [selectedLanguageFilter, setSelectedLanguageFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [metricFilter, setMetricFilter] = useState<'ALL' | 'APPROVED' | 'PENDING_REVIEW' | 'LANGUAGES'>('ALL');
  const [showLanguagePanel, setShowLanguagePanel] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Timer effect for AI translation
  useEffect(() => {
    if (aiTranslating) {
      setAiElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setAiElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [aiTranslating]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [qRes, tRes] = await Promise.all([
        api.getPendingTranslations(),
        api.getTranslations(),
      ]);
      setQuestions(qRes.questions || []);
      setTranslations(tRes.translations || []);

      if (qRes.questions && qRes.questions.length > 0 && !selectedQuestion) {
        handleSelectQuestion(qRes.questions[0], targetLanguage, tRes.translations || []);
      }
    } catch (err: any) {
      console.error('Translator load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = (
    q: Question,
    lang: string = targetLanguage,
    currentTrans: QuestionTranslation[] = translations
  ) => {
    setSelectedQuestion(q);
    const existing = currentTrans.find(t => t.question_id === q.id && t.language === lang);

    if (existing) {
      setTranslatedContent(existing.translated_content);
      if (existing.translated_options_json) {
        try {
          setTranslatedOptions(JSON.parse(existing.translated_options_json));
        } catch {
          setTranslatedOptions([]);
        }
      } else if (q.options_json) {
        try {
          setTranslatedOptions(JSON.parse(q.options_json));
        } catch {
          setTranslatedOptions([]);
        }
      } else {
        setTranslatedOptions([]);
      }
      setTranslatorNotes(existing.translator_notes || '');
      setOverrideReason(existing.translator_notes?.includes('Manual Override Reason:') ? existing.translator_notes.split('Manual Override Reason:')[1]?.trim() : '');
      setTranslationMode('MANUAL_OVERRIDE');
      setAiGeneratedSnapshot(null);
    } else {
      setTranslatedContent('');
      if (q.options_json) {
        try {
          const parsed = JSON.parse(q.options_json);
          setTranslatedOptions(parsed.map(() => ''));
        } catch {
          setTranslatedOptions([]);
        }
      } else {
        setTranslatedOptions([]);
      }
      setTranslatorNotes('');
      setOverrideReason('');
      setSelectedReasonChip('');
      setAiGeneratedSnapshot(null);
      setTranslationMode('AI_ASSISTED');
    }
  };

  const handleLanguageChange = (lang: string) => {
    setTargetLanguage(lang);
    if (selectedQuestion) {
      handleSelectQuestion(selectedQuestion, lang, translations);
    }
  };

  const handleAiTranslate = async () => {
    if (!selectedQuestion) return;
    setAiTranslating(true);
    setStatusMessage(null);

    let originalOpts: string[] | null = null;
    if (selectedQuestion.options_json) {
      try {
        originalOpts = JSON.parse(selectedQuestion.options_json);
      } catch {
        originalOpts = null;
      }
    }

    try {
      const res = await api.aiTranslate({
        content: selectedQuestion.content_text,
        options: originalOpts,
        targetLanguage,
        subject: selectedQuestion.subject,
      });

      if (res.result) {
        setTranslatedContent(res.result.translatedContent);
        setAiGeneratedSnapshot(res.result.translatedContent);
        if (res.result.translatedOptions) {
          setTranslatedOptions(res.result.translatedOptions);
        }
        setTranslatorNotes(res.result.linguisticNotes || `AI translation verified for ${targetLanguage}`);
        setTranslationMode('AI_ASSISTED');
        setStatusMessage({
          type: 'success',
          text: `AI Linguistic Engine generated accurate ${targetLanguage} translation in ${aiElapsedSeconds || 1}s.`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'AI Translation failed' });
    } finally {
      setAiTranslating(false);
    }
  };

  const handleSelectReasonChip = (chip: string) => {
    setSelectedReasonChip(chip);
    if (!overrideReason.includes(chip)) {
      setOverrideReason(prev => prev ? `${chip}; ${prev}` : chip);
    }
  };

  const isManualOverride = translationMode === 'MANUAL_OVERRIDE' || (aiGeneratedSnapshot !== null && translatedContent !== aiGeneratedSnapshot);

  const handleSaveTranslation = async (status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED') => {
    if (!selectedQuestion || !translatedContent.trim()) {
      setStatusMessage({ type: 'error', text: 'Please provide translated content before saving.' });
      return;
    }

    // If manual override is chosen or content was edited from AI snapshot, require explanation
    if (isManualOverride && !overrideReason.trim() && !selectedReasonChip) {
      setStatusMessage({
        type: 'error',
        text: 'Please specify the reason for providing your own translation / what needed improvement in the AI output.',
      });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    const compiledNotes = isManualOverride
      ? `Manual Override (${selectedReasonChip || 'Custom'}): ${overrideReason.trim()} ${translatorNotes.trim() ? `| Notes: ${translatorNotes.trim()}` : ''}`
      : (translatorNotes.trim() || `AI Linguistic Assistant verified for ${targetLanguage}`);

    try {
      await api.saveTranslation({
        question_id: selectedQuestion.id,
        language: targetLanguage,
        translated_content: translatedContent.trim(),
        translated_options: translatedOptions.length > 0 ? translatedOptions : undefined,
        status,
        translator_notes: compiledNotes,
      });

      setStatusMessage({
        type: 'success',
        text: `Translation for ${targetLanguage} successfully saved (${status}).`,
      });

      const updatedTrans = await api.getTranslations();
      setTranslations(updatedTrans.translations || []);
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save translation' });
    } finally {
      setSaving(false);
    }
  };

  const handleRejectAndRetranslate = async () => {
    if (!selectedQuestion) return;
    setAiTranslating(true);
    setStatusMessage(null);
    try {
      if (translatedContent.trim()) {
        await api.saveTranslation({
          question_id: selectedQuestion.id,
          language: targetLanguage,
          translated_content: translatedContent.trim(),
          translated_options: translatedOptions.length > 0 ? translatedOptions : undefined,
          status: 'REJECTED',
          translator_notes: overrideReason.trim() || 'Translation rejected for retranslation.',
        });
      }
      let originalOptions: string[] | null = null;
      if (selectedQuestion.options_json) originalOptions = JSON.parse(selectedQuestion.options_json);
      const result = await api.aiTranslate({
        content: selectedQuestion.content_text,
        options: originalOptions,
        targetLanguage,
        subject: selectedQuestion.subject,
      });
      setTranslatedContent(result.result.translatedContent);
      setTranslatedOptions(result.result.translatedOptions || []);
      setAiGeneratedSnapshot(result.result.translatedContent);
      setTranslationMode('AI_ASSISTED');
      setOverrideReason('');
      setSelectedReasonChip('');
      setStatusMessage({ type: 'success', text: 'Rejected translation recorded. A fresh translation was generated from the original question.' });
      const updatedTranslations = await api.getTranslations();
      setTranslations(updatedTranslations.translations || []);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to retranslate question.' });
    } finally {
      setAiTranslating(false);
    }
  };

  const handleQuickApprove = async (translationId: string) => {
    try {
      await api.verifyTranslation(translationId, {
        status: 'APPROVED',
        notes: 'Chief Linguistic Translator formal sign-off',
      });
      setStatusMessage({ type: 'success', text: 'Translation approved & verified.' });
      const updatedTrans = await api.getTranslations();
      setTranslations(updatedTrans.translations || []);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const approvedCount = translations.filter(t => t.status === 'APPROVED').length;
  const underReviewCount = translations.filter(t => t.status === 'UNDER_REVIEW' || t.status === 'DRAFT').length;

  const filteredQuestions = questions.filter(q => {
    // 1. Text Search Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matches = (
        q.content_text?.toLowerCase().includes(query) ||
        q.topic?.toLowerCase().includes(query) ||
        q.subject?.toLowerCase().includes(query) ||
        q.id?.toLowerCase().includes(query)
      );
      if (!matches) return false;
    }

    // 2. Metric Filter
    if (metricFilter === 'APPROVED') {
      // Questions that have at least one approved translation
      return translations.some(t => t.question_id === q.id && t.status === 'APPROVED');
    }

    if (metricFilter === 'PENDING_REVIEW') {
      // Questions that either have draft/under-review translation or are not yet translated in targetLanguage
      const hasApprovedInTarget = translations.some(t => t.question_id === q.id && t.language === targetLanguage && t.status === 'APPROVED');
      const hasPendingTrans = translations.some(t => t.question_id === q.id && (t.status === 'UNDER_REVIEW' || t.status === 'DRAFT'));
      return !hasApprovedInTarget || hasPendingTrans;
    }

    return true;
  });

  const filteredTranslations = translations.filter(t => {
    if (selectedLanguageFilter === 'ALL') return true;
    return t.language === selectedLanguageFilter;
  });

  const handleMetricCardClick = (filter: 'ALL' | 'APPROVED' | 'PENDING_REVIEW' | 'LANGUAGES') => {
    if (filter === 'LANGUAGES') {
      setShowLanguagePanel(prev => !prev);
      setMetricFilter(prev => prev === 'LANGUAGES' ? 'ALL' : 'LANGUAGES');
      return;
    }

    if (metricFilter === filter) {
      // Toggle off back to ALL
      setMetricFilter('ALL');
    } else {
      setMetricFilter(filter);
      setShowLanguagePanel(false);
    }
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* DASHBOARD & WORKBENCH TAB (Streamlined, No redundant Language Coverage grid) */}
      {activeSubTab !== 'verification_history' && (
        <AuthorityProctorEnclave
          currentUser={currentUser}
          workspaceType="TRANSLATOR_PORTAL"
          title="Translator Confidential Translation Enclave"
        >
          <div className="space-y-6">
          {/* Top Summary Banner */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  Linguistic Translation Portal
                </span>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Languages className="w-5 h-5 text-purple-600" />
                  <span>Multilingual Examination Translation Workbench</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Translate questions into official languages with AI linguistic assistance or custom translator authored override.
                </p>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Queue</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Card 1: Total Questions */}
              <button
                type="button"
                onClick={() => handleMetricCardClick('ALL')}
                className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  metricFilter === 'ALL'
                    ? 'bg-purple-100/90 border-purple-400 ring-2 ring-purple-500 shadow-xs'
                    : 'bg-purple-50/60 border-purple-200/80 hover:bg-purple-100/60 hover:shadow-xs hover:border-purple-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-purple-800 font-medium block">Total Questions</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    metricFilter === 'ALL' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {metricFilter === 'ALL' ? 'Active' : 'View All'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-purple-950 mt-1 block">{questions.length}</span>
                <span className="text-[10px] text-purple-700/80 mt-0.5 block font-medium">Click to show all questions</span>
              </button>

              {/* Card 2: Approved Translations */}
              <button
                type="button"
                onClick={() => handleMetricCardClick('APPROVED')}
                className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  metricFilter === 'APPROVED'
                    ? 'bg-emerald-100/90 border-emerald-400 ring-2 ring-emerald-500 shadow-xs'
                    : 'bg-emerald-50/60 border-emerald-200/80 hover:bg-emerald-100/60 hover:shadow-xs hover:border-emerald-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-emerald-800 font-medium block">Approved Translations</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    metricFilter === 'APPROVED' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {metricFilter === 'APPROVED' ? 'Filtering' : 'Filter'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-emerald-900 mt-1 block">{approvedCount}</span>
                <span className="text-[10px] text-emerald-700/80 mt-0.5 block font-medium">Click to show approved</span>
              </button>

              {/* Card 3: Under Review / Draft */}
              <button
                type="button"
                onClick={() => handleMetricCardClick('PENDING_REVIEW')}
                className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  metricFilter === 'PENDING_REVIEW'
                    ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-500 shadow-xs'
                    : 'bg-amber-50/60 border-amber-200/80 hover:bg-amber-100/60 hover:shadow-xs hover:border-amber-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-amber-800 font-medium block">Under Review / Draft</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    metricFilter === 'PENDING_REVIEW' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {metricFilter === 'PENDING_REVIEW' ? 'Filtering' : 'Filter'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-amber-700 mt-1 block">{underReviewCount}</span>
                <span className="text-[10px] text-amber-700/80 mt-0.5 block font-medium">Click to show pending</span>
              </button>

              {/* Card 4: Supported Languages */}
              <button
                type="button"
                onClick={() => handleMetricCardClick('LANGUAGES')}
                className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden group ${
                  showLanguagePanel || metricFilter === 'LANGUAGES'
                    ? 'bg-slate-200/90 border-slate-400 ring-2 ring-slate-600 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:shadow-xs hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-slate-600 font-medium block">Supported Languages</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    showLanguagePanel || metricFilter === 'LANGUAGES' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {showLanguagePanel ? 'Open' : 'Select'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-slate-900 mt-1 block">8 Official</span>
                <span className="text-[10px] text-slate-600 mt-0.5 block font-medium">Click to switch target language</span>
              </button>
            </div>

            {/* Interactive Expandable Supported Languages Matrix (Shown when clicking Card 4 or toggled) */}
            {showLanguagePanel && (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Languages className="w-4 h-4 text-purple-700" />
                    <span>Quick Select Target Translation Language:</span>
                  </span>
                  <span className="text-[10.5px] text-slate-500">Active: <strong>{targetLanguage}</strong></span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SUPPORTED_LANGUAGES.map(lang => {
                    const isTarget = targetLanguage === lang.code;
                    const approvedInLang = translations.filter(t => t.language === lang.code && t.status === 'APPROVED').length;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          handleLanguageChange(lang.code);
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isTarget
                            ? 'bg-purple-600 text-white border-purple-700 shadow-xs ring-1 ring-purple-400 font-bold'
                            : 'bg-white text-slate-800 border-slate-200 hover:bg-purple-50 hover:border-purple-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-xs">{lang.name}</span>
                          {isTarget && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                        </div>
                        <div className={`text-[10px] mt-1 ${isTarget ? 'text-purple-100' : 'text-slate-500'}`}>
                          {approvedInLang} approved
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Unified Two-Column Workbench */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Questions Queue */}
            <div className="lg:col-span-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Questions Queue</h3>
                  {metricFilter !== 'ALL' && metricFilter !== 'LANGUAGES' && (
                    <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold ${
                      metricFilter === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {metricFilter === 'APPROVED' ? 'Approved Only' : 'Pending Only'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {metricFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setMetricFilter('ALL')}
                      className="text-[10px] text-purple-700 hover:text-purple-900 font-semibold cursor-pointer underline"
                    >
                      Clear Filter
                    </button>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900">
                    {filteredQuestions.length} Items
                  </span>
                </div>
              </div>

              {/* Search Filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by subject, topic or text..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-purple-700"
                />
              </div>

              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {filteredQuestions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No questions match your filter.
                  </div>
                ) : (
                  filteredQuestions.map(q => {
                    const isSelected = selectedQuestion?.id === q.id;
                    const hasTrans = translations.some(t => t.question_id === q.id && t.language === targetLanguage && t.status === 'APPROVED');
                    return (
                      <div
                        key={q.id}
                        onClick={() => handleSelectQuestion(q, targetLanguage, translations)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-50/90 border-purple-500 ring-1 ring-purple-300 shadow-xs'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-slate-900 truncate max-w-[170px]">{q.topic || q.subject}</span>
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono bg-white border border-slate-200 text-slate-600">
                            {q.difficulty} • {q.marks}M
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{q.content_text}</p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-200/60 text-[10px]">
                          <span className="text-slate-500 font-medium">{q.subject}</span>
                          {hasTrans ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                              <Check className="w-3 h-3" />
                              <span>{targetLanguage} Ready</span>
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium">Pending {targetLanguage}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Side-by-Side Translation Studio */}
            <div className="lg:col-span-8 p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-5">
              {selectedQuestion ? (
                <>
                  {/* Header Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400">ID: {selectedQuestion.id} • {selectedQuestion.subject}</span>
                      <h3 className="text-base font-bold text-slate-900">{selectedQuestion.topic}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <Languages className="w-3.5 h-3.5 text-purple-700" />
                          <span>Target:</span>
                        </label>
                        <select
                          value={targetLanguage}
                          onChange={e => handleLanguageChange(e.target.value)}
                          className="bg-transparent text-slate-900 font-bold text-xs focus:outline-hidden cursor-pointer"
                        >
                          {SUPPORTED_LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>
                              {lang.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Translation Mode Selector */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setTranslationMode('AI_ASSISTED')}
                          className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                            translationMode === 'AI_ASSISTED'
                              ? 'bg-white text-purple-900 font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          <span>AI Assistant</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTranslationMode('MANUAL_OVERRIDE')}
                          className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                            translationMode === 'MANUAL_OVERRIDE'
                              ? 'bg-white text-purple-900 font-bold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Edit3 className="w-3 h-3 text-purple-600" />
                          <span>Custom / Own Translation</span>
                        </button>
                      </div>

                      {/* AI Translate Trigger Button with Active Timer Feedback */}
                      <button
                        type="button"
                        onClick={handleAiTranslate}
                        disabled={aiTranslating}
                        className="px-3.5 py-1.5 bg-purple-900 hover:bg-purple-800 disabled:opacity-60 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${aiTranslating ? 'animate-spin text-amber-300' : 'text-amber-300'}`} />
                        <span>{aiTranslating ? `Translating with AI (${aiElapsedSeconds}s)...` : 'Run AI Translate'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Side-by-Side Editor */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Left: Original English Source (CORRECT KEY REDACTED FOR BLIND EVALUATION) */}
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-slate-600" />
                          <span>Original Source (English)</span>
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-200 text-slate-700">
                          {selectedQuestion.question_type}
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-600 block mb-1">Question Statement:</span>
                        <p className="text-slate-900 text-xs leading-relaxed bg-white p-3 rounded border border-slate-200 font-medium">
                          {selectedQuestion.content_text}
                        </p>
                      </div>

                      {selectedQuestion.options_json && (
                        <div>
                          <span className="text-[11px] font-bold text-slate-600 block mb-1">Options:</span>
                          <div className="space-y-1.5">
                            {JSON.parse(selectedQuestion.options_json).map((opt: string, idx: number) => (
                              <div key={idx} className="p-2 rounded bg-white border border-slate-200 text-slate-800 text-[11px]">
                                {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Security Blind Translation Notice (Key Redacted) */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-[11px] text-slate-600">
                        <span>Marks: <strong className="text-slate-900">{selectedQuestion.marks}</strong> ({selectedQuestion.difficulty})</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-50 text-purple-800 px-2 py-0.5 rounded border border-purple-200">
                          <ShieldCheck className="w-3 h-3 text-purple-700" />
                          <span>Blind Translation • Key Redacted</span>
                        </span>
                      </div>
                    </div>

                    {/* Right: Translated Target Language Workbench */}
                    <div className="p-4 rounded-lg bg-purple-50/40 border border-purple-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-purple-200/80 pb-2">
                        <span className="font-bold text-purple-950 flex items-center gap-1.5">
                          <Languages className="w-3.5 h-3.5 text-purple-700" />
                          <span>{targetLanguage} Translation Workbench</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                          isManualOverride
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-purple-100 text-purple-900'
                        }`}>
                          {isManualOverride ? '✍️ Custom Override' : '✨ AI Assisted'}
                        </span>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Translated Statement ({targetLanguage}):
                        </label>
                        <textarea
                          rows={4}
                          value={translatedContent}
                          onChange={e => setTranslatedContent(e.target.value)}
                          placeholder={`Enter ${targetLanguage} translation here, or click 'Run AI Translate' to generate...`}
                          className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus:ring-1 focus:ring-purple-700 focus:outline-hidden font-sans leading-relaxed"
                        />
                      </div>

                      {selectedQuestion.options_json && (
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">
                            Translated Options ({targetLanguage}):
                          </label>
                          <div className="space-y-1.5">
                            {translatedOptions.map((opt, idx) => (
                              <input
                                key={idx}
                                type="text"
                                value={opt}
                                onChange={e => {
                                  const copy = [...translatedOptions];
                                  copy[idx] = e.target.value;
                                  setTranslatedOptions(copy);
                                }}
                                placeholder={`Option ${String.fromCharCode(65 + idx)} in ${targetLanguage}`}
                                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-slate-900 text-xs focus:ring-1 focus:ring-purple-700 focus:outline-hidden"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Linguistic Notes & Terminology Remarks:
                        </label>
                        <input
                          type="text"
                          value={translatorNotes}
                          onChange={e => setTranslatorNotes(e.target.value)}
                          placeholder="e.g. Standard technical glossary terms preserved"
                          className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-slate-900 text-xs focus:ring-1 focus:ring-purple-700 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {/* MANDATORY AI OVERRIDE REASON SECTION (Appears when translator uses custom translation / overrides AI) */}
                  {isManualOverride && (
                    <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/90 space-y-3">
                      <div className="flex items-center gap-2">
                        <BadgeAlert className="w-4 h-4 text-amber-700 shrink-0" />
                        <div>
                          <h4 className="text-xs font-bold text-amber-950">
                            Manual Translation Override • AI Assessment & Reasoning Required
                          </h4>
                          <p className="text-[11px] text-amber-800">
                            To maintain institutional translation quality, please state what was wrong or needed improvement in the AI Linguistic Assistant's output:
                          </p>
                        </div>
                      </div>

                      {/* Quick Select Reason Chips */}
                      <div>
                        <span className="text-[10.5px] font-bold text-amber-900 block mb-1.5">
                          Quick Select Primary Discrepancy:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {AI_DEFECT_REASONS.map(reason => {
                            const isChipActive = selectedReasonChip === reason;
                            return (
                              <button
                                key={reason}
                                type="button"
                                onClick={() => handleSelectReasonChip(reason)}
                                className={`px-2.5 py-1 rounded-md text-[10.5px] font-medium transition-all cursor-pointer ${
                                  isChipActive
                                    ? 'bg-amber-800 text-white font-bold shadow-xs'
                                    : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100/70'
                                }`}
                              >
                                {reason}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Detailed Explanation Textarea */}
                      <div>
                        <label className="text-[10.5px] font-bold text-amber-900 block mb-1">
                          Explain Linguistic Improvement / Reason for Manual Translation: <span className="text-rose-600">*</span>
                        </label>
                        <textarea
                          rows={2}
                          value={overrideReason}
                          onChange={e => setOverrideReason(e.target.value)}
                          placeholder="Provide specific details (e.g. 'AI translated technical acronym inappropriately, replaced with standard state board technical vocabulary')..."
                          className="w-full p-2.5 rounded-lg bg-white border border-amber-300 text-slate-900 text-xs focus:ring-1 focus:ring-amber-700 focus:outline-hidden leading-relaxed"
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions & Submit Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <ShieldCheck className="w-4 h-4 text-purple-700" />
                      <span>Translator sign-off stamps cryptographic audit record</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRejectAndRetranslate}
                        disabled={saving || aiTranslating}
                        className="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5 inline mr-1" />
                        Translation is Wrong / Retranslate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveTranslation('APPROVED')}
                        disabled={saving}
                        className="px-5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Approve & Finalize Translation</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Select a question from the queue to start translation.
                </div>
              )}
            </div>
          </div>
        </div>
      </AuthorityProctorEnclave>
    )}

      {/* COMPLETED TRANSLATIONS & AUDIT LEDGER TAB */}
      {activeSubTab === 'verification_history' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Multilingual Translation Verification Ledger</h3>
              <p className="text-xs text-slate-500">
                Verified repository of regional question translations with translator audit records and override reasoning.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">Filter Language:</label>
              <select
                value={selectedLanguageFilter}
                onChange={e => setSelectedLanguageFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs font-bold cursor-pointer"
              >
                <option value="ALL">All Languages</option>
                {SUPPORTED_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredTranslations.length === 0 ? (
              <p className="text-slate-400 p-8 text-center text-xs">No translations recorded for this filter.</p>
            ) : (
              filteredTranslations.map(t => (
                <div
                  key={t.id}
                  className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-2 text-slate-900">
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-bold text-[10px]">
                        {t.language}
                      </span>
                      <span>{t.subject || 'Academic Examination'} • {t.topic || 'General Topic'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {t.status}
                      </span>
                      {t.status !== 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => handleQuickApprove(t.id)}
                          className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-white rounded text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Approve</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 bg-white p-3 rounded border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Original (English):</span>
                      <p className="text-slate-700 text-[11px] leading-relaxed">{t.original_content || 'Source question'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-purple-700 font-bold block mb-0.5">Translated ({t.language}):</span>
                      <p className="text-slate-900 text-[11px] font-medium leading-relaxed">{t.translated_content}</p>
                    </div>
                  </div>

                  {t.translator_notes && (
                    <div className="text-[10.5px] text-slate-600 bg-white/70 p-2 rounded border border-slate-200/70">
                      <span className="font-semibold text-slate-700">Remarks & Audit Trail: </span>
                      <span>{t.translator_notes}</span>
                      {t.translator_name && <span className="text-slate-400 font-medium"> • Signed by {t.translator_name}</span>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
