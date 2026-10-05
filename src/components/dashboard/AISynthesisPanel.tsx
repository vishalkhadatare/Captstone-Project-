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
  const aiGenerated = Math.max(0, Math.floor(totalQuestions * 0.36)) || 41;
  const pendingReview = Math.max(0, totalQuestions - verifiedQuestions) || 6;

  return (
    <div className="relative rounded-[18px] bg-white border border-[#DCDFF5] p-6 lg:p-7 shadow-[0_4px_20px_rgba(99,102,241,0.06)] flex flex-col justify-between space-y-5 overflow-hidden">
      {/* Top Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#635BFF] via-[#00B8D9] to-[#00A878]" />

      {/* Header with Title and Neural Network Visual */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F5F4FF] text-[#635BFF] border border-[#DCDFF5] flex items-center justify-center shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#102A38] uppercase tracking-wider font-mono">
              AI QUESTION SYNTHESIS ENGINE
            </h3>
            <p className="text-xs sm:text-[13px] text-[#61747E]">
              High-assurance multi-paper synthesis with semantic balance
            </p>
          </div>
        </div>

        {/* Small AI Neural Network Fusion Visual (Specification 17) */}
        <div className="hidden sm:flex items-center shrink-0 pr-1">
          <svg className="w-20 h-9" viewBox="0 0 80 36" fill="none">
            {/* Connecting Lines */}
            <line x1="12" y1="8" x2="40" y2="8" stroke="#DCDFF5" strokeWidth="1.5" />
            <line x1="40" y1="8" x2="68" y2="8" stroke="#DCDFF5" strokeWidth="1.5" />
            <line x1="12" y1="8" x2="26" y2="28" stroke="#DCDFF5" strokeWidth="1.5" />
            <line x1="40" y1="8" x2="40" y2="28" stroke="#DCDFF5" strokeWidth="1.5" />
            <line x1="68" y1="8" x2="54" y2="28" stroke="#DCDFF5" strokeWidth="1.5" />
            <line x1="26" y1="28" x2="40" y2="28" stroke="#DCDFF5" strokeWidth="1.5" />
            <line x1="40" y1="28" x2="54" y2="28" stroke="#DCDFF5" strokeWidth="1.5" />

            {/* Top Row Nodes */}
            <circle cx="12" cy="8" r="4" fill="#635BFF" />
            <circle cx="40" cy="8" r="4" fill="#00B8D9" />
            <circle cx="68" cy="8" r="4" fill="#00A878" />

            {/* Bottom Row Nodes */}
            <circle cx="26" cy="28" r="4" fill="#635BFF" />
            <circle cx="40" cy="28" r="4.5" fill="#00A878" className="animate-pulse" />
            <circle cx="54" cy="28" r="4" fill="#00B8D9" />
          </svg>
        </div>
      </div>

      <p className="text-xs sm:text-[13px] text-[#61747E] leading-relaxed">
        Generate secure examination papers using AI-powered question fusion, difficulty balancing, topic coverage, and blueprint constraints with zero duplicate leakage.
      </p>

      {/* 4 Mini Cards with Light AI Background */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Question Pool */}
        <div className="p-3.5 rounded-xl bg-[#F5F4FF] border border-[#E2E4FA] text-center">
          <span className="text-[10px] font-mono text-[#2672B8] uppercase block font-bold">
            QUESTION POOL
          </span>
          <span className="text-2xl font-black text-[#102A38] font-mono mt-1 block">
            {totalQuestions || 116}
          </span>
          <span className="text-[10px] text-[#61747E] font-mono">Indexed total</span>
        </div>

        {/* Verified */}
        <div className="p-3.5 rounded-xl bg-[#F5F4FF] border border-[#E2E4FA] text-center">
          <span className="text-[10px] font-mono text-[#00A878] uppercase block font-bold">
            VERIFIED
          </span>
          <span className="text-2xl font-black text-[#008A63] font-mono mt-1 block">
            {verifiedQuestions || 68}
          </span>
          <span className="text-[10px] text-[#61747E] font-mono">Enclave sealed</span>
        </div>

        {/* AI Synthesized */}
        <div className="p-3.5 rounded-xl bg-[#F5F4FF] border border-[#E2E4FA] text-center">
          <span className="text-[10px] font-mono text-[#635BFF] uppercase block font-bold">
            AI SYNTHESIZED
          </span>
          <span className="text-2xl font-black text-[#635BFF] font-mono mt-1 block">
            {aiGenerated}
          </span>
          <span className="text-[10px] text-[#61747E] font-mono">Fused variants</span>
        </div>

        {/* Pending Review */}
        <div className="p-3.5 rounded-xl bg-[#F5F4FF] border border-[#E2E4FA] text-center">
          <span className="text-[10px] font-mono text-[#F59E0B] uppercase block font-bold">
            PENDING REVIEW
          </span>
          <span className="text-2xl font-black text-[#D97706] font-mono mt-1 block">
            {pendingReview}
          </span>
          <span className="text-[10px] text-[#61747E] font-mono">In SME queue</span>
        </div>
      </div>

      {/* Difficulty Balancing Distribution Segment */}
      <div className="space-y-1.5 pt-2 border-t border-[#EEF3F1]">
        <div className="flex items-center justify-between text-xs text-[#61747E]">
          <span className="font-mono text-[11px] uppercase font-bold text-[#102A38]">
            Difficulty Spread
          </span>
          <span className="font-mono text-[10px] text-[#61747E]">
            Standard: 60% &bull; Analytical: 30% &bull; Advanced: 10%
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
          <div className="h-full bg-[#00A878]" style={{ width: '60%' }} title="Standard: 60%" />
          <div className="h-full bg-[#635BFF]" style={{ width: '30%' }} title="Analytical: 30%" />
          <div className="h-full bg-[#F59E0B]" style={{ width: '10%' }} title="Advanced: 10%" />
        </div>
      </div>

      {/* Action CTA */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onOpenSynthesizer}
          className="w-full h-11 px-5 rounded-xl bg-[#635BFF] hover:bg-[#5249E0] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(99,91,255,0.25)] transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        >
          <Sparkles className="w-4 h-4 text-white" />
          <span>Open AI Question Synthesizer</span>
          <ArrowRight className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
};
