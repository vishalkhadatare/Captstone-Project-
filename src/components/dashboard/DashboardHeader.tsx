import React from 'react';
import { Plus, Sparkles, Shield, Cpu } from 'lucide-react';

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
      className="relative overflow-hidden rounded-2xl border border-white/[0.12] p-6 lg:p-7 shadow-[0_6px_28px_rgba(9,23,36,0.35)] text-white"
      style={{
        background: 'linear-gradient(135deg, #091724 0%, #0D2238 50%, #091724 100%)',
      }}
    >
      {/* Subtle background tech ambient spotlight */}
      <div className="absolute -right-12 -top-12 w-80 h-80 bg-[#00D68F]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-10 -bottom-10 w-72 h-72 bg-[#18C8B2]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          {/* Top Operational Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-[#00D68F]/15 text-[#00D68F] border border-[#00D68F]/30 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F] animate-pulse" />
              {getGreeting()}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold text-[#18C8B2] bg-[#18C8B2]/15 border border-[#18C8B2]/30 backdrop-blur-md">
              <Shield className="w-3 h-3 text-[#18C8B2]" />
              SECURITY CORE 98% ACTIVE
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono text-slate-300 bg-white/[0.06] border border-white/[0.1]">
              <Cpu className="w-3 h-3 text-cyan-400" />
              COMMAND CENTER • ENCLAVE v4.2
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Exam Operations & Security Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Real-time control over examination blueprints, AI question synthesis, encrypted paper generation, and verification pipelines with zero-leak cryptographic assurance.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onOpenSynthesizer && (
            <button
              type="button"
              onClick={onOpenSynthesizer}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/20 hover:border-white/30 flex items-center gap-2 backdrop-blur-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-[#00D68F]" />
              <span>AI Paper Synthesizer</span>
            </button>
          )}

          {onCreateExam && (
            <button
              type="button"
              onClick={onCreateExam}
              className="px-4.5 py-2.5 rounded-xl bg-[#00D68F] hover:bg-[#18C8B2] text-[#06110F] font-bold text-xs flex items-center gap-2 shadow-[0_2px_14px_rgba(0,214,143,0.3)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#06110F] stroke-[2.5]" />
              <span>+ New Examination</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
