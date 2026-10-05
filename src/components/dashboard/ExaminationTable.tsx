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
    <div className="rounded-xl bg-white border border-[#E4ECE9] shadow-[0_2px_10px_rgba(30,60,50,0.04)] overflow-hidden">
      {/* Table Header & Controls Bar */}
      <div className="p-4 sm:p-5 border-b border-[#E5ECE9] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8FAFA]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6]">
            {activeFilter === 'ALL' ? (
              <FolderLock className="w-4 h-4" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-[#172A35] uppercase tracking-wider font-mono">
                {activeFilter === 'ALL'
                  ? 'ACTIVE EXAMINATION CONFIGURATIONS'
                  : activeFilter === 'VERIFIED'
                  ? 'VERIFIED QUESTION POOL INVENTORY'
                  : activeFilter === 'QUARANTINED'
                  ? 'QUARANTINED & FLAGGED QUESTIONS'
                  : 'VAULT QUESTION REPOSITORY'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-[#5F7074] border border-[#CBD8D5]">
                {activeFilter === 'ALL'
                  ? `${filteredExams.length} Configurations`
                  : `${filteredQuestions.length} Questions`}
              </span>
            </div>
            <p className="text-[11px] text-[#5F7074] mt-0.5">
              {activeFilter === 'ALL'
                ? 'Monitored cryptographic exam enclaves with hardware verification and time locks'
                : 'Isolated question items verified by AI semantic fusion and SME peer authority'}
            </p>
          </div>
        </div>

        {/* Search & Governance Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilter === 'ALL' && (
            <div className="flex items-center rounded-lg bg-white border border-[#CBD8D5] p-0.5 text-[10px] font-mono shadow-2xs">
              <button
                type="button"
                onClick={() => setGovernanceFilter('ALL')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  governanceFilter === 'ALL' ? 'bg-[#087F5B] text-white font-bold' : 'text-[#5F7074] hover:text-[#172A35]'
                }`}
              >
                ALL
              </button>
              <button
                type="button"
                onClick={() => setGovernanceFilter('UNIVERSITY')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  governanceFilter === 'UNIVERSITY' ? 'bg-[#087F5B] text-white font-bold' : 'text-[#5F7074] hover:text-[#172A35]'
                }`}
              >
                UNIVERSITY
              </button>
              <button
                type="button"
                onClick={() => setGovernanceFilter('COMPETITIVE')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  governanceFilter === 'COMPETITIVE' ? 'bg-[#087F5B] text-white font-bold' : 'text-[#5F7074] hover:text-[#172A35]'
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
              className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white hover:bg-[#F8FAFA] text-[#5F7074] hover:text-[#172A35] border border-[#CBD8D5] transition-colors cursor-pointer shadow-2xs"
            >
              ← Back to All Exams
            </button>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#879598] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1 rounded-lg bg-white border border-[#CBD8D5] text-xs text-[#172A35] placeholder-[#879598] focus:border-[#008A63] outline-none w-36 sm:w-44 transition-all shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Main View: Examination Configurations or Question Pool */}
      {activeFilter === 'ALL' ? (
        filteredExams.length === 0 ? (
          <div className="p-12 text-center text-[#5F7074] space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#879598] mx-auto opacity-50" />
            <p className="text-xs font-semibold text-[#172A35]">No active examination configurations found.</p>
            <p className="text-[11px] text-[#5F7074]">Create an examination enclave blueprint to begin paper operations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5ECE9] text-[10px] font-mono uppercase tracking-wider text-[#687976] bg-[#F8FAFA]">
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
            <thead className="sticky top-0 bg-[#F8FAFA] z-10">
              <tr className="border-b border-[#E5ECE9] text-[10px] font-mono uppercase tracking-wider text-[#687976]">
                <th className="py-2.5 px-4 font-semibold">QUESTION ID</th>
                <th className="py-2.5 px-4 font-semibold">SUBJECT / TOPIC</th>
                <th className="py-2.5 px-4 font-semibold">CONTENT PREVIEW</th>
                <th className="py-2.5 px-4 font-semibold text-right">INTEGRITY STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-[#5F7074]">
                    No questions matching filter.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map(q => (
                  <tr key={q.id} className="border-b border-[#EEF3F1] hover:bg-[#F6FAF8] transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-[#008A63] font-bold whitespace-nowrap">
                      {q.id}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-xs font-semibold text-[#172A35]">{q.subject}</div>
                      <div className="text-[10px] text-[#5F7074]">{q.topic || 'General'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-[#5F7074] line-clamp-2 max-w-xl leading-relaxed font-normal">
                        {q.content_text}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          q.status === 'VERIFIED' || q.status === 'ELIGIBLE_FOR_PAPER'
                            ? 'bg-[#E8F5FF] text-[#186FAF] border border-[#B8DEFF]'
                            : q.status === 'QUARANTINED' || q.status === 'COMPROMISED'
                            ? 'bg-[#FFF0F1] text-[#C93B47] border border-[#FAD1D5]'
                            : 'bg-[#FFF7E5] text-[#A16A00] border border-[#F5E0B3]'
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
