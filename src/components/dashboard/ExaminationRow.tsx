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
      case 'GENERATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#E7F8F1] text-[#008A63] border border-[#BFE9D7]">
            <Lock className="w-2.5 h-2.5" />
            GENERATED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#FFF7E5] text-[#A16A00] border border-[#F5E0B3]">
            DRAFT
          </span>
        );
      case 'VERIFIED':
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#E8F5FF] text-[#186FAF] border border-[#B8DEFF]">
            VERIFIED
          </span>
        );
      case 'QUARANTINED':
      case 'COMPROMISED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#FFF0F1] text-[#C93B47] border border-[#FAD1D5]">
            QUARANTINED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#F8FAFA] text-[#5F7074] border border-[#E5ECE9]">
            {status || 'CONFIGURED'}
          </span>
        );
    }
  };

  return (
    <tr className="border-b border-[#EEF3F1] hover:bg-[#F6FAF8] transition-colors group">
      {/* 1. Examination & Subject */}
      <td className="py-3.5 px-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6] shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-[#172A35] group-hover:text-[#008A63] transition-colors">
                {ex.name}
              </span>
              {ex.category && (
                <span className="text-[9px] font-mono text-[#5F7074] bg-[#F5F8FA] px-1.5 py-0.5 rounded border border-[#DCE5E8]">
                  {ex.category}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#5F7074] mt-0.5 flex items-center gap-2 font-medium">
              <span className="text-[#2474A6]">Subject: {ex.subject}</span>
            </div>
          </div>
        </div>
      </td>

      {/* 2. Schedule & Date */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#172A35]">
          <Calendar className="w-3.5 h-3.5 text-[#879598]" />
          <span>{ex.exam_date || 'TBD'}</span>
        </div>
        <div className="text-[10px] text-[#5F7074] font-mono mt-0.5">
          @{ex.exam_time || '00:00'}
        </div>
      </td>

      {/* 3. Status */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        {getStatusBadge(ex.status)}
      </td>

      {/* 4. Encryption */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-[#52636B] bg-[#F5F8FA] border border-[#DCE5E8]">
          <Lock className="w-3 h-3 text-[#2474A6]" />
          <span>AES-256-GCM</span>
        </div>
      </td>

      {/* 5. Unlock Window */}
      <td className="py-3.5 px-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#5F7074]">
          <Clock className="w-3 h-3 text-[#879598]" />
          <span>{ex.unlock_time || '00:00'}</span>
        </div>
      </td>

      {/* 6. Actions */}
      <td className="py-3.5 px-4 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2">
          {ex.simulation_status === 'COMPLETED' ? (
            <span
              className="px-2.5 py-1 bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6] rounded-lg font-mono font-bold text-[10px] flex items-center gap-1 shadow-2xs"
              title="Simulation completed."
            >
              <CheckCircle2 className="w-3 h-3 text-[#008A63]" />
              <span>Simulated ✓</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSimulate(ex)}
              className="px-2.5 py-1.5 bg-white hover:bg-[#F8FAFA] text-[#314440] rounded-lg font-semibold text-[11px] border border-[#D1DED9] hover:border-[#9AAEAA] flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              title="Start Proctored Final Paper Simulation"
            >
              <Camera className="w-3 h-3 text-[#008A63]" />
              <span>Simulate</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onGeneratePaper(ex.id)}
            disabled={isGenerating || !isOrgVerified}
            className="px-3 py-1.5 rounded-lg font-bold text-[11px] bg-[#087F5B] hover:bg-[#066c4d] text-white shadow-[0_1px_4px_rgba(8,127,91,0.2)] disabled:opacity-40 cursor-pointer transition-all"
          >
            Generate Paper
          </button>
        </div>
      </td>
    </tr>
  );
};
