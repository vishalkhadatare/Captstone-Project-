import React from 'react';
import { ShieldCheck, Lock, Activity, CheckCircle, Radio } from 'lucide-react';

export const SecurityStatusBar: React.FC = () => {
  return (
    <div className="rounded-xl bg-white border border-[#E4ECE9] px-4 sm:px-5 py-3 flex items-center justify-between flex-wrap gap-3 text-xs shadow-2xs">
      {/* 1. System Status */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#879598] font-bold">
          SYSTEM STATUS
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#008A63] bg-[#ECFBF5] border border-[#B8EBD6]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B982] animate-pulse" />
          Operational
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-[#E5ECE9]" />

      {/* 2. Enclave */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#879598] font-bold">
          ENCLAVE
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#008A63] bg-[#ECFBF5] border border-[#B8EBD6]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#008A63]" />
          Active
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-[#E5ECE9]" />

      {/* 3. Encryption */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#879598] font-bold">
          ENCRYPTION
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold text-[#52636B] bg-[#F5F8FA] border border-[#DCE5E8]">
          <Lock className="w-3 h-3 text-[#2474A6]" />
          AES-256-GCM
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-[#E5ECE9]" />

      {/* 4. Question Engine */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#879598] font-bold">
          QUESTION ENGINE
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#008A63] bg-[#ECFBF5] border border-[#B8EBD6]">
          <Activity className="w-3 h-3 text-[#008A63]" />
          Operational
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-[#E5ECE9]" />

      {/* 5. Threat Monitor */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#879598] font-bold">
          THREAT MONITOR
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#008A63] bg-[#ECFBF5] border border-[#B8EBD6]">
          <CheckCircle className="w-3 h-3 text-[#008A63]" />
          Clear
        </span>
      </div>
    </div>
  );
};
