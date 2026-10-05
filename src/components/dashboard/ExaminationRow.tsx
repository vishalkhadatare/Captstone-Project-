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
  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'GENERATED_ENCRYPTED':
      case 'ENCRYPTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/30">
            <Lock className="w-2.5 h-2.5" />
            GENERATED • ENCRYPTED
          </span>
        );
      case 'GENERATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#18C8B2]/10 text-[#18C8B2] border border-[#18C8B2]/30">
            GENERATED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#F5B942]/10 text-[#F5B942] border border-[#F5B942]/30">
            DRAFT
          </span>
        );
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#4DA3FF]/10 text-[#4DA3FF] border border-[#4DA3FF]/30">
            READY
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-white/[0.06] text-[#9AAEAA] border border-white/[0.1]">
            {status || 'CONFIGURED'}
          </span>
        );
    }
  };

  return (
    <tr className="border-b border-white/[0.04] hover:bg-[#102723]/60 transition-colors group">
      {/* 1. Examination & Subject */}
      <td className="py-3.5 px-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/20 shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-[#F4F8F7] group-hover:text-[#00D68F] transition-colors">
                {ex.name}
              </span>
              {ex.category && (
                <span className="text-[9px] font-mono text-[#617773] bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.04]">
                  {ex.category}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#9AAEAA] mt-0.5 flex items-center gap-2">
              <span className="text-[#18C8B2]">Subject: {ex.subject}</span>
            </div>
          </div>
        </div>
      </td>

      {/* 2. Schedule & Date */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-xs text-[#F4F8F7]">
          <Calendar className="w-3.5 h-3.5 text-[#617773]" />
          <span>{ex.exam_date || 'TBD'}</span>
        </div>
        <div className="text-[10px] text-[#9AAEAA] font-mono mt-0.5">
          @{ex.exam_time || '00:00'}
        </div>
      </td>

      {/* 3. Status */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        {getStatusBadge(ex.status)}
      </td>

      {/* 4. Encryption */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-[#9AAEAA] bg-[#06110F] border border-white/[0.06]">
          <Lock className="w-3 h-3 text-[#18C8B2]" />
          <span>AES-256-GCM</span>
        </div>
      </td>

      {/* 5. Unlock Window */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#9AAEAA]">
          <Clock className="w-3 h-3 text-[#617773]" />
          <span>{ex.unlock_time || '00:00'}</span>
        </div>
      </td>

      {/* 6. Actions */}
      <td className="py-3.5 px-4 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2">
          {ex.simulation_status === 'COMPLETED' ? (
            <span
              className="px-2.5 py-1 bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/25 rounded-lg font-mono font-bold text-[10px] flex items-center gap-1"
              title="Simulation completed."
            >
              <CheckCircle2 className="w-3 h-3 text-[#00D68F]" />
              <span>Simulated ✓</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSimulate(ex)}
              className="px-2.5 py-1.5 bg-[#102723] hover:bg-[#132D29] text-[#9AAEAA] hover:text-white rounded-lg font-semibold text-[11px] border border-white/[0.08] hover:border-white/[0.15] flex items-center gap-1.5 cursor-pointer transition-all"
              title="Start Proctored Final Paper Simulation"
            >
              <Camera className="w-3 h-3 text-[#00D68F]" />
              <span>Simulate</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onGeneratePaper(ex.id)}
            disabled={isGenerating || !isOrgVerified}
            className={`px-3 py-1.5 rounded-lg font-bold text-[11px] shadow-xs cursor-pointer transition-all ${
              ex.simulation_status === 'COMPLETED'
                ? 'bg-[#00D68F] hover:bg-[#18C8B2] text-[#06110F] shadow-[0_2px_10px_rgba(0,214,143,0.25)]'
                : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#F4F8F7] border border-white/[0.1] disabled:opacity-40'
            }`}
          >
            Generate Paper
          </button>
        </div>
      </td>
    </tr>
  );
};
