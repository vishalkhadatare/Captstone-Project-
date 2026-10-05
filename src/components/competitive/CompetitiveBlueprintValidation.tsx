import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, ArrowLeft, RefreshCw, ShieldCheck, FileCheck, Layers } from 'lucide-react';
import { SubjectRule } from './CompetitiveBlueprintForm';
import { api } from '../../api';

interface SubjectValidationResult {
  subject: string;
  required: number;
  available: number;
  sourceCount: number;
  passed: boolean;
  message: string;
}

interface BlueprintValidationProps {
  examId: string;
  subjects: SubjectRule[];
  onBack: () => void;
  onProceed: () => void;
}

export const CompetitiveBlueprintValidation: React.FC<BlueprintValidationProps> = ({
  examId,
  subjects,
  onBack,
  onProceed,
}) => {
  const [loading, setLoading] = useState(true);
  const [allValid, setAllValid] = useState(false);
  const [subjectResults, setSubjectResults] = useState<SubjectValidationResult[]>([]);
  const [overallMessage, setOverallMessage] = useState('');

  // Run validation via backend API
  const runValidation = async () => {
    setLoading(true);
    try {
      const resp = await api.competitive.validateBlueprint(examId, { subjects });
      if (resp && resp.success) {
        setAllValid(resp.valid);
        setSubjectResults(resp.subjectResults || []);
        setOverallMessage(resp.overallMessage || '');
      }
    } catch (err: any) {
      console.error('Validation API error:', err);
      setAllValid(false);
      setOverallMessage(err.message || 'Validation request failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runValidation();
  }, [examId, subjects]);

  const failedSubjects = subjectResults.filter(s => !s.passed);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-slate-900" />
            <span>Step 5: Independent Subject-by-Subject Blueprint Validation</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Strict verification ensures verified pools contain sufficient genuine questions before paper generation can be unlocked.
          </p>
        </div>

        <button
          type="button"
          onClick={runValidation}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto border border-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Re-validate Pools</span>
        </button>
      </div>

      {/* Validation Status Verdict Box */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-600" />
          <p>Auditing verified question pools against blueprint quotas...</p>
        </div>
      ) : allValid ? (
        <div className="p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-xs text-emerald-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Blueprint Fully Validated — Paper Generation Authorized</span>
          </div>
          <p className="text-slate-700 pl-7 leading-relaxed">
            All <strong>{subjects.length} configured subjects</strong> satisfy or exceed their blueprint question counts. No mock or static questions will be used; the final paper will be dynamically selected from your verified PDF question pools.
          </p>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Generation Blocked — Insufficient Verified Questions in Pools</span>
          </div>
          <p className="text-slate-700 pl-7 leading-relaxed">
            The following subject{failedSubjects.length > 1 ? 's do' : ' does'} not contain enough verified questions to satisfy the blueprint:
          </p>
          <ul className="list-disc list-inside pl-9 space-y-1 font-bold text-rose-800">
            {failedSubjects.map((s, idx) => (
              <li key={idx}>
                {s.subject} requires {s.required} verified questions, but only {s.available} are available.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Subject-Wise Validation Table (Requirement 12) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Subject Quota Audit Table
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4 text-center">Required Count</th>
                <th className="py-3 px-4 text-center">Available in Pool</th>
                <th className="py-3 px-4 text-center">Source PDFs</th>
                <th className="py-3 px-4 text-center">Audit Status</th>
                <th className="py-3 px-4">Audit Details & Advisory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjectResults.map((res, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-slate-50/50 ${
                    !res.passed ? 'bg-rose-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {res.subject}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                    {res.required}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    <span
                      className={
                        res.passed
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }
                    >
                      {res.available}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-500">
                    {res.sourceCount} PDF{res.sourceCount !== 1 ? 's' : ''}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {res.passed ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>PASSED</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        <span>INSUFFICIENT</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-[11px] leading-relaxed">
                    {res.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strict Policy Reminder */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
        <p className="font-bold text-slate-800">
          ZeroLeak Security Policy:
        </p>
        <p>
          Final competitive papers can only be generated from real, verified uploaded questions. The system will never silently substitute questions from another subject, truncate blueprint requirements, or introduce static mock questions.
        </p>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Question Pools</span>
        </button>

        <button
          type="button"
          onClick={onProceed}
          disabled={!allValid || loading}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            allValid && !loading
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <span>Proceed to Step 6: Generate Final Paper</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

