import React, { useState } from 'react';
import { User } from '../types';
import {
  Cpu,
  BookOpen,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { SimpleMultiPaperSynthesizer } from './SimpleMultiPaperSynthesizer';
import { OpenAIPrismBrowserModal } from './OpenAIPrismBrowserModal';

interface PaperGenProps {
  currentUser: User | null;
  onRefresh: () => void;
}

export const PaperGenerationModule: React.FC<PaperGenProps> = ({ currentUser, onRefresh }) => {
  const [showPrismBrowser, setShowPrismBrowser] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefreshWorkspace = () => {
    setRefreshKey(prev => prev + 1);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Top Page Header */}
      <div className="space-y-3">
        {/* Breadcrumb / Context */}
        <div className="flex items-center gap-2 text-[11px] font-mono font-semibold tracking-wider text-[#647681] uppercase">
          <span className="hover:text-[#102A38] transition-colors cursor-pointer">ZEROLEAK</span>
          <span className="text-[#A0B0B9]">/</span>
          <span className="text-[#647681]">AI PAPER GENERATION</span>
          <span className="text-[#A0B0B9]">/</span>
          <span className="text-[#00A878] font-bold">MULTI-PAPER SYNTHESIS</span>
        </div>

        {/* Top Header Card */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 sm:p-7 rounded-[18px] border border-[#DCE5EA] shadow-[0_4px_16px_rgba(20,40,55,0.05)]">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-[#00A878]/15 to-[#635BFF]/15 border border-[#00A878]/30 text-[#00A878]">
                <Cpu className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-[30px] font-extrabold tracking-tight text-[#102A38] font-sans leading-tight">
                AI PAPER GENERATION & MULTI-PAPER SYNTHESIS
              </h1>
            </div>
            <p className="text-xs sm:text-[13px] text-[#647681] leading-relaxed">
              Generate secure examination papers from multiple source papers using AI-powered question fusion, difficulty balancing, topic coverage, and pattern enforcement.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* AI Synthesizer Ready Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ECFBF5] border border-[#B8EBD6] text-[#00A878] text-xs font-mono font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-[#00C98B] animate-pulse" />
              <span>AI SYNTHESIZER READY</span>
            </div>

            {/* Documentation Button */}
            <button
              type="button"
              onClick={() => setShowDocModal(true)}
              className="px-3.5 py-2 rounded-xl bg-[#F6F8FA] hover:bg-[#EEF2F5] text-[#102A38] border border-[#DCE5EA] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:-translate-y-0.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#635BFF]" />
              <span>Documentation</span>
            </button>

            {/* Refresh Workspace Button */}
            <button
              type="button"
              onClick={handleRefreshWorkspace}
              className="px-3.5 py-2 rounded-xl bg-[#F6F8FA] hover:bg-[#EEF2F5] text-[#102A38] border border-[#DCE5EA] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:-translate-y-0.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#00A878]" />
              <span>Refresh Workspace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Module Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE5EA] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-[#00A878] to-[#102C3A] text-white shadow-xs">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>✨ Multi-Paper AI Synthesizer Workspace</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPrismBrowser(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-[#00A878] to-[#00B8D9] hover:from-[#009166] hover:to-[#00a3c2] text-white shadow-md shadow-[#00A878]/25 border border-[#00C98B]/30 transition-all cursor-pointer shrink-0 hover:-translate-y-0.5"
          title="Open ZeroLeak AI Assistant"
        >
          <Sparkles className="w-4 h-4 text-emerald-100" />
          <span>ZeroLeak AI Assistant</span>
        </button>
      </div>

      {/* Primary Multi-Paper Synthesizer Workspace */}
      <SimpleMultiPaperSynthesizer
        key={`synth-${refreshKey}`}
        currentUser={currentUser}
        onRefresh={onRefresh}
      />

      {/* Documentation Modal */}
      {showDocModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowDocModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-[#DCE5EA] space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#DCE5EA] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#635BFF]/10 text-[#635BFF]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#102A38]">
                    ZeroLeak AI Multi-Paper Synthesis Documentation
                  </h3>
                  <p className="text-[11px] text-[#647681]">
                    Cryptographic examination synthesis and non-leakage assurance
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="w-7 h-7 rounded-lg text-[#647681] hover:text-[#102A38] hover:bg-[#F6F8FA] flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-[#647681] leading-relaxed">
              <div className="p-3 rounded-xl bg-[#F6F8FA] border border-[#DCE5EA]">
                <h4 className="font-bold text-[#102A38] text-xs mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00A878]" />
                  1. Multi-Paper Analysis & Pattern Authority
                </h4>
                <p>
                  ZeroLeak extracts question structures, marks schemes, section distributions, and syllabus coverage from multiple historical PDF exam papers. One paper is established as the primary structural authority whose blueprint the new paper adheres to strictly.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F8FA] border border-[#DCE5EA]">
                <h4 className="font-bold text-[#102A38] text-xs mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#635BFF]" />
                  2. AI Question Fusion & Zero Duplicate Leakage
                </h4>
                <p>
                  Neural question synthesis generates completely new question variations that test the exact same cognitive rigor and syllabus objectives without repeating any question verbatim from historical pools.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F8FA] border border-[#DCE5EA]">
                <h4 className="font-bold text-[#102A38] text-xs mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00B8D9]" />
                  3. Hardware Enclave & FIPS 140-2 AES-256 Encryption
                </h4>
                <p>
                  All generated papers are typeset via server-side LaTeX into high-assurance PDFs, watermarked with verifiable micro-signatures, and encrypted using AES-256-GCM. Decryption keys are held in hardware custody.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F8FA] border border-[#DCE5EA]">
                <h4 className="font-bold text-[#102A38] text-xs mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                  4. Shamir 3-of-5 Secret Sharing
                </h4>
                <p>
                  Decryption keys are partitioned into 5 independent cryptographic shares distributed among authorized stakeholders. A minimum quorum of 3 shares must be combined at the designated unlock window to reveal the paper.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#DCE5EA]">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="px-4 py-2 rounded-xl bg-[#102A38] hover:bg-[#172A52] text-white font-bold text-xs cursor-pointer"
              >
                Close Documentation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OpenAI Prism & LaTeX In-Project Browser Modal */}
      <OpenAIPrismBrowserModal
        isOpen={showPrismBrowser}
        onClose={() => setShowPrismBrowser(false)}
        initialUrl="https://prism.openai.com/"
      />
    </div>
  );
};
