import React from 'react';
import { ShieldCheck, Shield, Clock, Calendar, Camera, CheckCircle2, FileText, Lock } from 'lucide-react';
import { Examination } from '../../types';

interface ExaminationRowProps {
  examination: Examination;
  onSimulate: (exam: Examination) => void;
  onGeneratePaper: (examId: string) => void;
  isGenerating: boolean;
  isOrgVerified: boolean;
}

export const ExaminationRow: React.FC<ExaminationRowProps> = ({
  examination: ex,
  onSimulate,
  onGeneratePaper,
  isGenerating,
  isOrgVerified,
}) => {
  // Light status badges (Specification 19)
  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'GENERATED_ENCRYPTED':
      case 'ENCRYPTED':
      case 'GENERATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono font-bold uppercase tracking-wider bg-[#E7F8F2] text-[#008A63] border border-[#BFE9D7]">
            <Lock className="w-3 h-3 text-[#008A63]" />
            GENERATED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono font-bold uppercase tracking-wider bg-[#FFF7E5] text-[#A66A00] border border-[#F5E0B3]">
            DRAFT
          </span>
        );
      case 'VERIFIED':
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono font-bold uppercase tracking-wider bg-[#EAF4FF] text-[#2572B5] border border-[#B8DEFF]">
            VERIFIED
          </span>
        );
      case 'TIME_LOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono font-bold uppercase tracking-wider bg-[#EEF1FF] text-[#5159B8] border border-[#D0D7FA]">
            TIME LOCKED
          </span>
        );
      case 'QUARANTINED':
      case 'COMPROMISED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono font-bold uppercase tracking-wider bg-[#FFF0F2] text-[#D03D50] border border-[#FAD1D5]">
            QUARANTINED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono font-bold uppercase tracking-wider bg-[#F2F5F7] text-[#243B47] border border-[#D5DFE4]">
            {status || 'CONFIGURED'}
          </span>
        );
    }
  };

  return (
    <tr className="border-b border-[#EEF3F1] hover:bg-[#F8FBFA] transition-colors group min-h-[82px]">
      {/* 1. Examination & Subject (15px / 600 Title, 13px Subject) */}
      <td className="py-4 px-5">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#E8F8F2] text-[#00A878] border border-[#B8EBD6] flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px] text-[#102A38] group-hover:text-[#008A63] transition-colors">
                {ex.name}
              </span>
              {ex.category && (
                <span className="text-[10px] font-mono font-bold text-[#61747E] bg-[#F5F8FA] px-2 py-0.5 rounded-md border border-[#DCE5E8]">
                  {ex.category}
                </span>
              )}
            </div>
            <div className="text-[13px] text-[#61747E] mt-1 flex items-center gap-2 font-medium">
              <span className="text-[#2572B5]">Subject: {ex.subject}</span>
              <span className="text-slate-300">&bull;</span>
              <span>Code: {ex.subject_code || 'CS-701'}</span>
            </div>
          </div>
        </div>
      </td>

      {/* 2. Schedule & Date (13px Date) */}
      <td className="py-4 px-5 whitespace-nowrap">
        <div className="flex items-center gap-2 text-[13px] font-bold text-[#102A38]">
          <Calendar className="w-4 h-4 text-[#879598]" />
          <span>{ex.exam_date || 'TBD'}</span>
        </div>
        <div className="text-[11px] text-[#61747E] font-mono mt-0.5 pl-6">
          @{ex.exam_time || '10:00 AM'}
        </div>
      </td>

      {/* 3. Status Badge (12px) */}
      <td className="py-4 px-5 whitespace-nowrap">
        {getStatusBadge(ex.status)}
      </td>

      {/* 4. Encryption Standard */}
      <td className="py-4 px-5 whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold text-[#008AA3] bg-[#EFFBFD] border border-[#BEE7F0]">
          <Lock className="w-3.5 h-3.5 text-[#008AA3]" />
          <span>AES-256-GCM</span>
        </div>
      </td>

      {/* 5. Unlock Window */}
      <td className="py-4 px-5 whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-[12px] font-mono text-[#61747E]">
          <Clock className="w-3.5 h-3.5 text-[#879598]" />
          <span>{ex.unlock_time || '09:30 AM'}</span>
        </div>
      </td>

      {/* 6. Actions (Buttons 44px Height) */}
      <td className="py-4 px-5 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2.5">
          {ex.simulation_status === 'COMPLETED' ? (
            <span
              className="h-11 px-4 bg-[#E8F8F2] text-[#008A63] border border-[#B8EBD6] rounded-xl font-mono font-bold text-xs flex items-center gap-1.5 shadow-2xs"
              title="Simulation completed."
            >
              <CheckCircle2 className="w-4 h-4 text-[#008A63]" />
              <span>Simulated ✓</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSimulate(ex)}
              className="h-11 px-4 bg-white hover:bg-[#F8FAFA] text-[#102A38] hover:text-[#008A63] rounded-xl font-bold text-xs border border-[#D1DED9] hover:border-[#00A878] flex items-center gap-2 cursor-pointer transition-all shadow-2xs hover:-translate-y-0.5"
              title="Start Proctored Final Paper Simulation"
            >
              <Camera className="w-4 h-4 text-[#008A63]" />
              <span>Simulate</span>
            </button>
          )}

          {onGeneratePaper && (
            <button
              type="button"
              disabled={isGenerating || !isOrgVerified}
              onClick={() => onGeneratePaper(ex.id)}
              className="h-11 px-4 bg-[#008F68] hover:bg-[#00A878] text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
            >
              <FileText className="w-4 h-4" />
              <span>Generate Paper</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
