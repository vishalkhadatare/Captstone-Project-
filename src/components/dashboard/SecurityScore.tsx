import React from 'react';
import { ShieldCheck, Lock, Key, FileCheck, Eye, Shield } from 'lucide-react';

export const SecurityScore: React.FC = () => {
  const score = 98;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-[18px] bg-white border border-[#DCE5E9] p-6 lg:p-7 shadow-[0_4px_20px_rgba(20,50,65,0.06)] flex flex-col justify-between space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E8F8F2] text-[#00A878] border border-[#B8EBD6] flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#102A38] uppercase tracking-wider font-mono">
              ZEROLEAK SECURITY STATUS
            </h3>
            <p className="text-xs sm:text-[13px] text-[#61747E]">
              Real-time cryptographic assurance & compliance
            </p>
          </div>
        </div>

        <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider text-[#2672B8] bg-[#EEF5FF] border border-[#C5DCFA]">
          FIPS 140-2 LEVEL 3
        </span>
      </div>

      {/* Main Content: Circular Score Ring (Left) + Overview (Right) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 px-1">
        {/* SVG Circular Progress Ring */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="text-slate-100"
              strokeWidth="7"
              stroke="currentColor"
              fill="transparent"
            />
            {/* Animated Progress Stroke */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="url(#secScoreGrad)"
              strokeWidth="7"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="secScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00A878" />
                <stop offset="100%" stopColor="#00B8D9" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-extrabold text-[#102A38] font-mono leading-none">
              {score}%
            </span>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00A878] mt-1">
              OPTIMAL
            </span>
          </div>
        </div>

        {/* High-level status text */}
        <div className="flex-1 space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F8F2] text-[#008A63] text-xs font-mono font-bold border border-[#B8EBD6]">
            <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
            SECURITY STATUS: OPTIMAL
          </div>
          <p className="text-sm font-semibold text-[#102A38] leading-snug">
            All cryptographic and hardware enclave protections active
          </p>
          <p className="text-xs text-[#61747E] leading-relaxed">
            Hardware enclave isolation, key derivation, and dual-custody verification pass Zero-Leak compliance audits.
          </p>
        </div>
      </div>

      {/* Metrics Breakdown Grid (Light surfaces with colorful accents) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#EEF3F1] text-xs">
        {/* Encryption */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8EC]">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-[#EEF5FF] text-[#2672B8]">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-[#102A38] block leading-tight">Encryption</span>
              <span className="text-[10px] font-mono text-[#61747E]">AES-256-GCM</span>
            </div>
          </div>
          <span className="text-xs font-mono font-extrabold text-[#2672B8]">100%</span>
        </div>

        {/* Question Integrity */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8EC]">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-[#E8F8F2] text-[#00A878]">
              <FileCheck className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-[#102A38] block leading-tight">Integrity</span>
              <span className="text-[10px] font-mono text-[#61747E]">Zero-Leak Hash</span>
            </div>
          </div>
          <span className="text-xs font-mono font-extrabold text-[#00A878]">98.4%</span>
        </div>

        {/* Access Control */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8EC]">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-[#EFFBFD] text-[#008AA3]">
              <Key className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-[#102A38] block leading-tight">Access Control</span>
              <span className="text-[10px] font-mono text-[#61747E]">ECDSA P-256</span>
            </div>
          </div>
          <span className="text-xs font-mono font-extrabold text-[#008AA3]">100%</span>
        </div>

        {/* Audit Coverage */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8EC]">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-[#F5F4FF] text-[#635BFF]">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-[#102A38] block leading-tight">Audit Coverage</span>
              <span className="text-[10px] font-mono text-[#61747E]">Tamper-Proof</span>
            </div>
          </div>
          <span className="text-xs font-mono font-extrabold text-[#635BFF]">97%</span>
        </div>
      </div>
    </div>
  );
};
