import React from 'react';
import { Shield, ShieldCheck, Lock, Key, FileCheck, Eye } from 'lucide-react';

export const SecurityScore: React.FC = () => {
  const score = 98;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-xl bg-white border border-[#E4ECE9] p-5 shadow-[0_2px_10px_rgba(30,60,50,0.04)] flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6]">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#172A35]">
              ZEROLEAK SECURITY STATUS
            </h3>
            <p className="text-[11px] text-[#5F7074]">
              Real-time cryptographic assurance & compliance
            </p>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest text-[#52636B] bg-[#F5F8FA] border border-[#DCE5E8]">
          FIPS 140-2
        </span>
      </div>

      {/* Ring Score Gauge + Highlights */}
      <div className="flex items-center justify-between gap-6 px-2 py-1">
        {/* SVG Ring */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="text-[#E7F8F1]"
              strokeWidth="7"
              stroke="currentColor"
              fill="transparent"
            />
            {/* Progress Stroke */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="text-[#008A63] transition-all duration-1000 ease-out"
              strokeWidth="7"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-[#172A35] font-mono leading-none">
              {score}%
            </span>
            <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-[#6B7B78] mt-0.5">
              SCORE
            </span>
          </div>
        </div>

        {/* High-level status text */}
        <div className="flex-1 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#ECFBF5] text-[#008A63] text-[10px] font-mono font-bold border border-[#B8EBD6]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00B982] animate-pulse" />
            SECURITY STATUS: OPTIMAL
          </div>
          <p className="text-xs text-[#172A35] font-semibold leading-snug">
            All cryptographic and enclave protections operational
          </p>
          <p className="text-[11px] text-[#5F7074] leading-relaxed">
            Hardware enclave isolation, key derivation, and dual-custody verification pass zero-leak compliance checks.
          </p>
        </div>
      </div>

      {/* Metrics Breakdown Grid */}
      <div className="space-y-2 pt-2 border-t border-[#EEF3F1] text-xs">
        {/* Encryption */}
        <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0]">
          <div className="flex items-center gap-2 text-[#364845]">
            <Lock className="w-3.5 h-3.5 text-[#2474A6]" />
            <span className="text-[11px] font-medium">Hardware Encryption</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#879598]">AES-256-GCM</span>
            <span className="text-xs font-mono font-bold text-[#008A63]">100%</span>
          </div>
        </div>

        {/* Question Integrity */}
        <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0]">
          <div className="flex items-center gap-2 text-[#364845]">
            <FileCheck className="w-3.5 h-3.5 text-[#008A63]" />
            <span className="text-[11px] font-medium">Question Integrity</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#879598]">Zero-Leak Hash</span>
            <span className="text-xs font-mono font-bold text-[#008A63]">98%</span>
          </div>
        </div>

        {/* Access Control */}
        <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0]">
          <div className="flex items-center gap-2 text-[#364845]">
            <Key className="w-3.5 h-3.5 text-[#2474A6]" />
            <span className="text-[11px] font-medium">Access Control & Binding</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#879598]">ECDSA P-256</span>
            <span className="text-xs font-mono font-bold text-[#008A63]">100%</span>
          </div>
        </div>

        {/* Audit Coverage */}
        <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0]">
          <div className="flex items-center gap-2 text-[#364845]">
            <Shield className="w-3.5 h-3.5 text-[#2474A6]" />
            <span className="text-[11px] font-medium">Audit Ledger Coverage</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#879598]">Tamper-Proof</span>
            <span className="text-xs font-mono font-bold text-[#008A63]">97%</span>
          </div>
        </div>

        {/* Threat Detection */}
        <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0]">
          <div className="flex items-center gap-2 text-[#364845]">
            <Eye className="w-3.5 h-3.5 text-[#008A63]" />
            <span className="text-[11px] font-medium">Threat Detection AI</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#879598]">Continuous</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[#008A63]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00B982] animate-pulse" />
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
