import React from 'react';
import { ShieldCheck, Lock, Activity, CheckCircle, Radio, Server } from 'lucide-react';

export const SecurityStatusBar: React.FC = () => {
  return (
    <div className="rounded-xl bg-white border border-[#DCE6EA] px-5 sm:px-6 min-h-[64px] flex items-center justify-between flex-wrap gap-4 text-xs shadow-[0_2px_8px_rgba(20,40,50,0.04)]">
      {/* 1. System Status */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#E8F8F2] text-[#00A878] flex items-center justify-center shrink-0">
          <Server className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#61747E] font-bold block leading-none">
            SYSTEM STATUS
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#008A63] mt-1">
            <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
            Operational
          </span>
        </div>
      </div>

      <div className="hidden sm:block w-px h-6 bg-[#E2E8EC]" />

      {/* 2. Enclave */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#EFFBFD] text-[#008AA3] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#61747E] font-bold block leading-none">
            ENCLAVE
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#008AA3] mt-1">
            <span className="w-2 h-2 rounded-full bg-[#00B8D9]" />
            Active
          </span>
        </div>
      </div>

      <div className="hidden sm:block w-px h-6 bg-[#E2E8EC]" />

      {/* 3. Encryption */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#EEF5FF] text-[#2672B8] flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#61747E] font-bold block leading-none">
            ENCRYPTION
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-[#2672B8] mt-1">
            AES-256-GCM
          </span>
        </div>
      </div>

      <div className="hidden sm:block w-px h-6 bg-[#E2E8EC]" />

      {/* 4. Question Engine */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#F5F4FF] text-[#635BFF] flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#61747E] font-bold block leading-none">
            QUESTION ENGINE
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#635BFF] mt-1">
            <span className="w-2 h-2 rounded-full bg-[#635BFF]" />
            Online
          </span>
        </div>
      </div>

      <div className="hidden sm:block w-px h-6 bg-[#E2E8EC]" />

      {/* 5. Threat Monitor */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#E8F8F2] text-[#00A878] flex items-center justify-center shrink-0">
          <CheckCircle className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#61747E] font-bold block leading-none">
            THREAT MONITOR
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#008A63] mt-1">
            <span className="w-2 h-2 rounded-full bg-[#00A878]" />
            Clear
          </span>
        </div>
      </div>
    </div>
  );
};
