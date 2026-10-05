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
    <div className="rounded-[18px] bg-white border border-[#DCE5E9] shadow-[0_4px_18px_rgba(20,50,65,0.05)] overflow-hidden">
      {/* Table Header & Controls Bar */}
      <div className="p-5 sm:p-6 border-b border-[#E5ECE9] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E8F8F2] text-[#00A878] border border-[#B8EBD6] flex items-center justify-center shrink-0">
            {activeFilter === 'ALL' ? (
              <FolderLock className="w-5 h-5 stroke-[2]" />
            ) : (
              <FileText className="w-5 h-5 stroke-[2]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-[#102A38] uppercase tracking-wider font-mono">
                {activeFilter === 'ALL'
                  ? 'ACTIVE EXAMINATION CONFIGURATIONS'
                  : activeFilter === 'VERIFIED'
                  ? 'VERIFIED QUESTION POOL INVENTORY'
                  : activeFilter === 'QUARANTINED'
                  ? 'QUARANTINED & FLAGGED QUESTIONS'
                  : 'VAULT QUESTION REPOSITORY'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#E8F8F2] text-[#008A63] border border-[#B8EBD6]">
                {activeFilter === 'ALL'
                  ? `${filteredExams.length} ACTIVE CONFIGURATIONS`
                  : `${filteredQuestions.length} QUESTIONS`}
              </span>
            </div>
            <p className="text-xs text-[#61747E] mt-0.5">
              {activeFilter === 'ALL'
                ? 'Monitored cryptographic exam enclaves with hardware verification and time locks'
                : 'Isolated question items verified by AI semantic fusion and SME peer authority'}
            </p>
          </div>
        </div>

        {/* Search, Filter & Sort Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {activeFilter === 'ALL' && (
            <div className="flex items-center rounded-xl bg-[#F5F8FA] border border-[#CBD8D5] p-1 text-[11px] font-mono shadow-2xs">
              <button
                type="button"
                onClick={() => setGovernanceFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  governanceFilter === 'ALL' ? 'bg-[#008F68] text-white font-bold' : 'text-[#61747E] hover:text-[#102A38]'
                }`}
              >
                ALL
              </button>
              <button
                type="button"
                onClick={() => setGovernanceFilter('UNIVERSITY')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  governanceFilter === 'UNIVERSITY' ? 'bg-[#008F68] text-white font-bold' : 'text-[#61747E] hover:text-[#102A38]'
                }`}
              >
                UNIVERSITY
              </button>
              <button
                type="button"
                onClick={() => setGovernanceFilter('COMPETITIVE')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  governanceFilter === 'COMPETITIVE' ? 'bg-[#008F68] text-white font-bold' : 'text-[#61747E] hover:text-[#102A38]'
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
              className="px-3 py-1.5 rounded-xl text-xs font-mono bg-[#F5F8FA] hover:bg-white text-[#61747E] hover:text-[#102A38] border border-[#CBD8D5] transition-colors cursor-pointer shadow-2xs"
            >
              ← Back to All Exams
            </button>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#879598] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search examinations..."
              className="pl-9 pr-3 py-1.5 rounded-xl bg-[#F5F8FA] border border-[#CBD8D5] text-xs text-[#102A38] placeholder-[#879598] focus:border-[#008A63] focus:bg-white outline-none w-44 sm:w-52 transition-all shadow-2xs"
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
