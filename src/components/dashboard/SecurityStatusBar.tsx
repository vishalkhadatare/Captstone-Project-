import React from 'react';
import { ShieldCheck, Lock, Activity, CheckCircle, Radio } from 'lucide-react';

export const SecurityStatusBar: React.FC = () => {
  return (
    <div className="rounded-xl bg-[#081715] border border-white/[0.08] px-4 py-3 flex items-center justify-between flex-wrap gap-3 text-xs shadow-inner">
      {/* 1. System Status */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#617773] font-bold">
          SYSTEM STATUS
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#00D68F] bg-[#00D68F]/10 border border-[#00D68F]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F] animate-pulse" />
          Operational
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />

      {/* 2. Enclave */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#617773] font-bold">
          ENCLAVE
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#00D68F] bg-[#00D68F]/10 border border-[#00D68F]/20">
          <ShieldCheck className="w-3.5 h-3.5 text-[#00D68F]" />
          Active
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />

      {/* 3. Encryption */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#617773] font-bold">
          ENCRYPTION
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold text-[#18C8B2] bg-[#18C8B2]/10 border border-[#18C8B2]/20">
          <Lock className="w-3 h-3 text-[#18C8B2]" />
          AES-256-GCM
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />

      {/* 4. Question Engine */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#617773] font-bold">
          QUESTION ENGINE
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#00D68F] bg-[#00D68F]/10 border border-[#00D68F]/20">
          <Activity className="w-3 h-3 text-[#00D68F]" />
          Online
        </span>
      </div>

      <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />

      {/* 5. Threat Monitor */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#617773] font-bold">
          THREAT MONITOR
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#00D68F] bg-[#00D68F]/10 border border-[#00D68F]/20">
          <CheckCircle className="w-3 h-3 text-[#00D68F]" />
          No Active Threats
        </span>
      </div>
    </div>
  );
};
