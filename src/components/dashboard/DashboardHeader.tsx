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
    <div className="relative overflow-hidden rounded-2xl bg-[#0D211E] border border-white/[0.08] p-6 lg:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
      {/* Subtle background tech ambient spotlight */}
      <div className="absolute -right-10 -top-10 w-72 h-72 bg-[#00D68F]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute right-1/3 -bottom-16 w-80 h-32 bg-[#18C8B2]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          {/* Top Operational Pill */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/25 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F] animate-pulse" />
              {getGreeting()}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono text-[#9AAEAA] bg-[#102723] border border-white/[0.06]">
              <Cpu className="w-3 h-3 text-[#18C8B2]" />
              COMMAND CENTER • ENCLAVE v4.2
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#F4F8F7]">
            Exam Operations Center
          </h1>
          <p className="text-xs sm:text-sm text-[#9AAEAA] max-w-2xl leading-relaxed">
            Securely manage examination blueprints, AI question synthesis, encrypted paper generation, and examination infrastructure with zero-leak cryptographic assurance.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onCreateExam && (
            <button
              type="button"
              onClick={onCreateExam}
              className="px-4 py-2.5 rounded-xl bg-[#00D68F] hover:bg-[#18C8B2] text-[#06110F] font-bold text-xs flex items-center gap-2 shadow-[0_2px_14px_rgba(0,214,143,0.3)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#06110F] stroke-[2.5]" />
              <span>+ Create Examination</span>
            </button>
          )}

          {onOpenSynthesizer && (
            <button
              type="button"
              onClick={onOpenSynthesizer}
              className="px-4 py-2.5 rounded-xl bg-[#102723] hover:bg-[#132D29] text-[#F4F8F7] font-semibold text-xs border border-white/[0.12] hover:border-[#00D68F]/40 flex items-center gap-2 backdrop-blur-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#00D68F]" />
              <span>AI Paper Synthesizer</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
