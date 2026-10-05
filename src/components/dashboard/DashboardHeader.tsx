import React from 'react';
import { Plus, Sparkles, Shield, Cpu, Lock, CheckCircle2 } from 'lucide-react';

interface DashboardHeaderProps {
  onCreateExam?: () => void;
  onOpenSynthesizer?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onCreateExam,
  onOpenSynthesizer,
}) => {
  // Determine dynamic time-of-day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'GOOD MORNING, CONTROLLER';
    if (hour < 17) return 'GOOD AFTERNOON, CONTROLLER';
    return 'GOOD EVENING, CONTROLLER';
  };

  return (
    <div
      className="relative overflow-hidden rounded-[18px] border border-[#DCE6EA] p-7 lg:p-8 shadow-[0_8px_30px_rgba(20,50,65,0.07)] min-h-[195px] flex flex-col justify-between"
      style={{
        background: 'linear-gradient(90deg, #FFFFFF 0%, #F1FAF7 50%, #F1F8FC 100%)',
      }}
    >
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Titles, Badge & Action Buttons */}
        <div className="space-y-4 max-w-[700px]">
          {/* Top Operational Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-[#E8F8F2] text-[#008A63] border border-[#B8EBD6]">
              <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
              {getGreeting()}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold text-[#2672B8] bg-[#EEF5FF] border border-[#C5DCFA]">
              <Shield className="w-3.5 h-3.5 text-[#2672B8]" />
              FIPS 140-2 ENCLAVE
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold text-[#61747E] bg-white border border-[#DCE5EA]">
              <Cpu className="w-3.5 h-3.5 text-[#00B8D9]" />
              COMMAND CENTER v4.2
            </span>
          </div>

          <div>
            <h1 className="text-3xl sm:text-[38px] font-extrabold tracking-tight text-[#102A38] leading-[1.1]">
              Exam Operations & Security Center
            </h1>
            <p className="text-[15px] text-[#61747E] mt-2 leading-relaxed max-w-[650px]">
              Real-time control over examination blueprints, AI question synthesis, encrypted paper generation, and verification pipelines with zero-leak cryptographic assurance.
            </p>
          </div>

          {/* Action Buttons (Height 46-48px) */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {onCreateExam && (
              <button
                type="button"
                onClick={onCreateExam}
                className="h-[46px] px-5 rounded-[9px] bg-[#008F68] hover:bg-[#00A878] text-white font-bold text-sm flex items-center gap-2 shadow-[0_4px_14px_rgba(0,143,104,0.25)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-white stroke-[2.5]" />
                <span>+ New Examination</span>
              </button>
            )}

            {onOpenSynthesizer && (
              <button
                type="button"
                onClick={onOpenSynthesizer}
                className="h-[46px] px-5 rounded-[9px] bg-white hover:bg-[#F8FAFC] text-[#183845] font-bold text-sm border border-[#BFD5DC] hover:border-[#98BAC3] flex items-center gap-2 shadow-xs hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#635BFF]" />
                <span>AI Paper Synthesizer</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Circular Security Core Visualization (Specification 9) */}
        <div className="hidden sm:flex items-center justify-center shrink-0 pr-2 lg:pr-4">
          <div className="relative p-6 rounded-2xl bg-white/80 border border-[#DCE6EA] backdrop-blur-md shadow-xs flex flex-col items-center justify-center">
            {/* Circular Progress Ring */}
            <div className="relative flex items-center justify-center">
              <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="text-slate-100"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="url(#heroEmeraldCyanGrad)"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - 0.98)}
                  strokeLinecap="round"
                  fill="transparent"
                />
                <defs>
                  <linearGradient id="heroEmeraldCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00A878" />
                    <stop offset="100%" stopColor="#00B8D9" />
                  </linearGradient>
                </defs>
              </svg>

              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold text-[#102A38] font-mono leading-none">
                  98%
                </span>
                <span className="text-[10px] font-mono font-bold tracking-wider text-[#00A878] mt-1">
                  SECURE
                </span>
              </div>
            </div>

            {/* Orbiting Security Pills */}
            <div className="flex items-center gap-1.5 mt-3">
              <span className="px-2 py-0.5 rounded-full bg-[#EFFBFD] text-[#008AA3] border border-[#BEE7F0] text-[9.5px] font-mono font-bold">
                AES-256
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#E8F8F2] text-[#008A63] border border-[#B8EBD6] text-[9.5px] font-mono font-bold">
                ENCLAVE
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#EEF5FF] text-[#2672B8] border border-[#C5DCFA] text-[9.5px] font-mono font-bold">
                VERIFIED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
