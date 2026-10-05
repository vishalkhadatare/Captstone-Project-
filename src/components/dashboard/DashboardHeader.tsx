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
    <div className="relative overflow-hidden rounded-2xl bg-white border border-[#E4ECE9] p-6 lg:p-7 shadow-[0_2px_10px_rgba(30,60,50,0.04)]">
      {/* Subtle background tech ambient spotlight */}
      <div className="absolute -right-12 -top-12 w-64 h-64 bg-[#00D68F]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          {/* Top Operational Pill */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00B982] animate-pulse" />
              {getGreeting()}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono text-[#52636B] bg-[#F5F8FA] border border-[#DCE5E8]">
              <Cpu className="w-3 h-3 text-[#2474A6]" />
              EXAMINATION CONTROLLER COMMAND CENTER • v4.2
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#172A35]">
            Exam Operations & Security Center
          </h1>
          <p className="text-xs sm:text-sm text-[#66777A] max-w-2xl leading-relaxed">
            Real-time control over examination blueprints, AI question synthesis, encrypted paper generation, and verification pipelines with zero-leak cryptographic assurance.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onOpenSynthesizer && (
            <button
              type="button"
              onClick={onOpenSynthesizer}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFA] text-[#172A35] font-semibold text-xs border border-[#CBD8D5] hover:border-[#9AAEAA] flex items-center gap-2 shadow-2xs hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#008A63]" />
              <span>AI Paper Synthesizer</span>
            </button>
          )}

          {onCreateExam && (
            <button
              type="button"
              onClick={onCreateExam}
              className="px-4.5 py-2.5 rounded-xl bg-[#087F5B] hover:bg-[#066c4d] text-white font-bold text-xs flex items-center gap-2 shadow-[0_2px_10px_rgba(8,127,91,0.25)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white stroke-[2.5]" />
              <span>+ New Examination</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
