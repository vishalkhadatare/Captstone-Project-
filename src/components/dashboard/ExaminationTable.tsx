import React, { useState } from 'react';
import { Examination, Question } from '../../types';
import { ExaminationRow } from './ExaminationRow';
import { FolderLock, Layers, Filter, Search, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ExaminationTableProps {
  examinations: Examination[];
  questions: Question[];
  activeFilter: 'ALL' | 'READY' | 'VERIFIED' | 'QUARANTINED';
  onFilterChange: (filter: 'ALL' | 'READY' | 'VERIFIED' | 'QUARANTINED') => void;
  onSimulate: (exam: Examination) => void;
  onGeneratePaper: (examId: string) => void;
  isGenerating: boolean;
  isOrgVerified: boolean;
}

export const ExaminationTable: React.FC<ExaminationTableProps> = ({
  examinations,
  questions,
  activeFilter,
  onFilterChange,
  onSimulate,
  onGeneratePaper,
  isGenerating,
  isOrgVerified,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [governanceFilter, setGovernanceFilter] = useState<'ALL' | 'UNIVERSITY' | 'COMPETITIVE'>('ALL');

  // Filter examinations by search and governance type
  const filteredExams = examinations.filter(ex => {
    const matchesSearch =
      ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.subject.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (governanceFilter === 'UNIVERSITY') {
      return ex.category?.toLowerCase().includes('university') || ex.category === 'University Exam';
    }
    if (governanceFilter === 'COMPETITIVE') {
      return ex.category?.toLowerCase().includes('competitive') || ex.category === 'Competitive Exam';
    }
    return true;
  });

  // Filter questions when KPI card is active
  const filteredQuestions = questions.filter(q => {
    if (activeFilter === 'VERIFIED') return q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER';
    if (activeFilter === 'QUARANTINED') return q.status === 'QUARANTINED' || q.status === 'COMPROMISED';
    return true;
  });

  return (
    <div className="rounded-xl bg-[#0D211E] border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-hidden">
      {/* Table Header & Controls Bar */}
      <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#081715]/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/20">
            {activeFilter === 'ALL' ? (
              <FolderLock className="w-4 h-4" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-[#F4F8F7] uppercase tracking-wider font-mono">
                {activeFilter === 'ALL'
                  ? 'ACTIVE EXAMINATION CONFIGURATIONS'
                  : activeFilter === 'VERIFIED'
                  ? 'VERIFIED QUESTION POOL INVENTORY'
                  : activeFilter === 'QUARANTINED'
                  ? 'QUARANTINED & FLAGGED QUESTIONS'
                  : 'VAULT QUESTION REPOSITORY'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.06] text-[#9AAEAA] border border-white/[0.08]">
                {activeFilter === 'ALL'
                  ? `${filteredExams.length} Configurations`
                  : `${filteredQuestions.length} Questions`}
              </span>
            </div>
            <p className="text-[11px] text-[#617773] mt-0.5">
              {activeFilter === 'ALL'
                ? 'Monitored cryptographic exam enclaves with hardware verification and time locks'
                : 'Isolated question items verified by AI semantic fusion and SME peer authority'}
            </p>
          </div>
        </div>

        {/* Search & Governance Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilter === 'ALL' && (
            <div className="flex items-center rounded-lg bg-[#06110F] border border-white/[0.08] p-0.5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setGovernanceFilter('ALL')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  governanceFilter === 'ALL' ? 'bg-[#00D68F] text-[#06110F] font-bold' : 'text-[#9AAEAA] hover:text-white'
                }`}
              >
                ALL
              </button>
              <button
                type="button"
                onClick={() => setGovernanceFilter('UNIVERSITY')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  governanceFilter === 'UNIVERSITY' ? 'bg-[#00D68F] text-[#06110F] font-bold' : 'text-[#9AAEAA] hover:text-white'
                }`}
              >
                UNIVERSITY
              </button>
              <button
                type="button"
                onClick={() => setGovernanceFilter('COMPETITIVE')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  governanceFilter === 'COMPETITIVE' ? 'bg-[#00D68F] text-[#06110F] font-bold' : 'text-[#9AAEAA] hover:text-white'
                }`}
              >
                COMPETITIVE
              </button>
            </div>
          )}

          {activeFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => onFilterChange('ALL')}
              className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/[0.06] hover:bg-white/[0.1] text-[#9AAEAA] hover:text-white border border-white/[0.08] transition-colors cursor-pointer"
            >
              ← Back to All Exams
            </button>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#617773] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1 rounded-lg bg-[#06110F] border border-white/[0.08] text-xs text-[#F4F8F7] placeholder-[#617773] focus:border-[#00D68F] outline-none w-36 sm:w-44 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Main View: Examination Configurations or Question Pool */}
      {activeFilter === 'ALL' ? (
        filteredExams.length === 0 ? (
          <div className="p-12 text-center text-[#9AAEAA] space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#617773] mx-auto opacity-50" />
            <p className="text-xs font-semibold">No active examination configurations found.</p>
            <p className="text-[11px] text-[#617773]">Create an examination enclave blueprint to begin paper operations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] font-mono uppercase tracking-wider text-[#617773] bg-[#06110F]/40">
                  <th className="py-2.5 px-4 font-semibold">EXAMINATION & SUBJECT</th>
                  <th className="py-2.5 px-4 font-semibold">SCHEDULE</th>
                  <th className="py-2.5 px-4 font-semibold">STATUS</th>
                  <th className="py-2.5 px-4 font-semibold">ENCRYPTION</th>
                  <th className="py-2.5 px-4 font-semibold">UNLOCK</th>
                  <th className="py-2.5 px-4 font-semibold text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredExams.map(ex => (
                  <ExaminationRow
                    key={ex.id}
                    examination={ex}
                    onSimulate={onSimulate}
                    onGeneratePaper={onGeneratePaper}
                    isGenerating={isGenerating}
                    isOrgVerified={isOrgVerified}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Questions Inventory Table */
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#081715] z-10">
              <tr className="border-b border-white/[0.06] text-[10px] font-mono uppercase tracking-wider text-[#617773]">
                <th className="py-2.5 px-4 font-semibold">QUESTION ID</th>
                <th className="py-2.5 px-4 font-semibold">SUBJECT / TOPIC</th>
                <th className="py-2.5 px-4 font-semibold">CONTENT PREVIEW</th>
                <th className="py-2.5 px-4 font-semibold text-right">INTEGRITY STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-[#9AAEAA]">
                    No questions matching filter.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map(q => (
                  <tr key={q.id} className="border-b border-white/[0.04] hover:bg-[#102723]/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-[#00D68F] font-bold whitespace-nowrap">
                      {q.id}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-xs font-semibold text-[#F4F8F7]">{q.subject}</div>
                      <div className="text-[10px] text-[#9AAEAA]">{q.topic || 'General'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-[#9AAEAA] line-clamp-2 max-w-xl leading-relaxed">
                        {q.content_text}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER'
                            ? 'bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/25'
                            : q.status === 'QUARANTINED' || q.status === 'COMPROMISED'
                            ? 'bg-[#FF5C6C]/10 text-[#FF5C6C] border border-[#FF5C6C]/25'
                            : 'bg-[#F5B942]/10 text-[#F5B942] border border-[#F5B942]/25'
                        }`}
                      >
                        {q.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
