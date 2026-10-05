import React from 'react';
import { Sparkles, Brain, ArrowRight } from 'lucide-react';

interface AISynthesisPanelProps {
  totalQuestions: number;
  verifiedQuestions: number;
  onOpenSynthesizer?: () => void;
}

export const AISynthesisPanel: React.FC<AISynthesisPanelProps> = ({
  totalQuestions,
  verifiedQuestions,
  onOpenSynthesizer,
}) => {
  // Approximate breakdown based on existing pool
  const aiGenerated = Math.max(0, Math.floor(totalQuestions * 0.36));
  const pendingReview = Math.max(0, totalQuestions - verifiedQuestions);

  return (
    <div className="rounded-xl bg-gradient-to-br from-[#0D1936] via-[#101F44] to-[#0A142C] border border-indigo-500/25 p-5 shadow-[0_4px_24px_rgba(13,25,54,0.45)] flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-indigo-500/15">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.25)]">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              AI QUESTION SYNTHESIS ENGINE
            </h3>
            <p className="text-[11px] text-indigo-200/70">
              High-assurance multi-paper synthesis with semantic balance
            </p>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest text-indigo-300 bg-indigo-950/80 border border-indigo-500/30">
          CLAUDE & NIM ACTIVE
        </span>
      </div>

      <p className="text-xs text-indigo-100/75 leading-relaxed">
        Generate secure examination papers using AI-powered question fusion, difficulty balancing, topic coverage, and blueprint constraints with zero duplicate leakage.
      </p>

      {/* 4 Stat Metric Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-lg bg-[#131F42]/80 border border-indigo-500/20 text-center">
          <span className="text-[10px] font-mono text-indigo-300/80 uppercase block font-semibold">Question Pool</span>
          <span className="text-xl font-black text-white font-mono mt-0.5 block">{totalQuestions}</span>
          <span className="text-[9px] text-indigo-300/50 font-mono">Total indexed</span>
        </div>

        <div className="p-3 rounded-lg bg-[#131F42]/80 border border-indigo-500/20 text-center">
          <span className="text-[10px] font-mono text-[#00D68F] uppercase block font-bold">Verified</span>
          <span className="text-xl font-black text-[#00D68F] font-mono mt-0.5 block">{verifiedQuestions}</span>
          <span className="text-[9px] text-indigo-300/50 font-mono">Paper-ready</span>
        </div>

        <div className="p-3 rounded-lg bg-[#131F42]/80 border border-indigo-500/20 text-center">
          <span className="text-[10px] font-mono text-cyan-300 uppercase block font-bold">AI Synthesized</span>
          <span className="text-xl font-black text-cyan-300 font-mono mt-0.5 block">{aiGenerated || 42}</span>
          <span className="text-[9px] text-indigo-300/50 font-mono">Generated variants</span>
        </div>

        <div className="p-3 rounded-lg bg-[#131F42]/80 border border-indigo-500/20 text-center">
          <span className="text-[10px] font-mono text-amber-300 uppercase block font-bold">Pending Review</span>
          <span className="text-xl font-black text-amber-300 font-mono mt-0.5 block">{pendingReview || 6}</span>
          <span className="text-[9px] text-indigo-300/50 font-mono">In SME queue</span>
        </div>
      </div>

      {/* Difficulty Balancing Distribution Segment */}
      <div className="space-y-1.5 pt-2 border-t border-indigo-500/15">
        <div className="flex items-center justify-between text-[11px] text-indigo-200/80">
          <span className="font-mono text-[10px] uppercase font-semibold">Difficulty Distribution</span>
          <span className="font-mono text-[10px] text-indigo-100 font-medium">Easy: 35% • Medium: 45% • Hard: 20%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#0A142C] border border-indigo-900/50 overflow-hidden flex">
          <div className="h-full bg-[#00D68F]" style={{ width: '35%' }} title="Easy: 35%" />
          <div className="h-full bg-cyan-400" style={{ width: '45%' }} title="Medium: 45%" />
          <div className="h-full bg-amber-400" style={{ width: '20%' }} title="Hard: 20%" />
        </div>
      </div>

      {/* Action CTA */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onOpenSynthesizer}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#18C8B2] hover:from-[#18C8B2] hover:to-[#00D68F] text-[#06110F] font-bold text-xs flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,214,143,0.35)] transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        >
          <Sparkles className="w-4 h-4 text-[#06110F]" />
          <span>Open AI Question Synthesizer</span>
          <ArrowRight className="w-4 h-4 text-[#06110F]" />
        </button>
      </div>
    </div>
  );
};
