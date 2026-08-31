import React from 'react';
import {
  ShieldCheck,
  Building2,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  BrainCircuit,
  FileX2,
  LockKeyhole,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';

interface PublicLandingProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export const PublicLanding: React.FC<PublicLandingProps> = ({
  onOpenLogin,
  onOpenRegister,
}) => {
  return (
    <div className="landing-page-shell min-h-screen text-[#0F172A] flex flex-col font-sans">
      <header className="sticky top-0 z-30 w-full border-b border-[#E2E8F0] bg-white/80 backdrop-blur-xl shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="landing-logo-wrap">
            <ZeroLeakLogo size="sm" imgHeightClass="h-10 sm:h-12 md:h-14" showWordmark variant="lockup" />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenRegister}
              className="landing-cta-secondary hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#047857]/25 text-[#047857] bg-white font-semibold text-xs transition-all duration-200 shadow-[0_4px_12px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:bg-[#ECFDF5]"
            >
              <Building2 className="w-3.5 h-3.5 text-[#047857]" />
              <span>Organization Registration</span>
            </button>

            <button
              onClick={onOpenLogin}
              className="landing-cta-primary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#047857] text-white font-semibold text-xs shadow-[0_8px_18px_rgba(4,120,87,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#059669]"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In to Portal</span>
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero relative overflow-hidden py-20 lg:py-28 flex-1 flex flex-col justify-center">
        <div className="hero-sheen" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-orb hero-orb-one" aria-hidden="true" />
        <div className="hero-orb hero-orb-two" aria-hidden="true" />
        <div className="hero-lock" aria-hidden="true">
          <ShieldCheck className="w-16 h-16 text-emerald-700/70" />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <div className="landing-badge inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-xs font-semibold shadow-[0_6px_18px_rgba(4,120,87,0.08)]">
            <ShieldCheck className="w-4 h-4 text-[#047857]" />
            <span>National Examination Security & Integrity Assurance Infrastructure</span>
          </div>

          {/* central branding removed - header logo retained per design */}

          <h1 className="landing-heading text-3xl sm:text-5xl lg:text-6xl font-black tracking-[-0.06em] leading-[0.94] text-[#0F172A]">
            <span className="landing-ai-badge inline-flex items-center gap-2 align-middle">
              <BrainCircuit className="w-7 h-7 text-[#0F766E]" />
            </span>
            AI Powered Secure Exam Paper Generation and Protection
          </h1>

          <p className="landing-subhead max-w-3xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed">
            ZeroLeak is a high-assurance educational platform engineered for central examination boards, autonomous universities, and national recruitment commissions to eliminate question paper leaks through mathematical cryptography, verified question pools, AI pattern validation, and time-locked delivery.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button
              onClick={onOpenRegister}
              className="landing-cta-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-700 text-white font-bold text-sm shadow-[0_18px_30px_rgba(6,78,59,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_36px_rgba(6,78,59,0.36)]"
            >
              <Building2 className="w-4 h-4" />
              <span>Register New Organization</span>
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </button>

            <button
              onClick={onOpenLogin}
              className="landing-cta-secondary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white text-[#047857] border border-[#A7F3D0] font-bold text-sm shadow-[0_6px_14px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#ECFDF5]"
            >
              <KeyRound className="w-4 h-4 text-[#047857]" />
              <span>Authorized Operator Sign In</span>
            </button>
          </div>

          <div className="trust-strip pt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600 font-medium">
            <div className="trust-card flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E8F0] shadow-[0_6px_16px_rgba(15,23,42,0.03)] backdrop-blur-sm">
              <LockKeyhole className="w-4 h-4 text-[#047857]" />
              <span>AES-256-GCM Military Encryption</span>
            </div>
            <div className="trust-card flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E8F0] shadow-[0_6px_16px_rgba(15,23,42,0.03)] backdrop-blur-sm">
              <CheckCircle2 className="w-4 h-4 text-[#0F766E]" />
              <span>Zero-Trust Role Separation</span>
            </div>
            <div className="trust-card flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E8F0] shadow-[0_6px_16px_rgba(15,23,42,0.03)] backdrop-blur-sm">
              <FileX2 className="w-4 h-4 text-[#DC2626]" />
              <span>Dynamic Watermark Forensics</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 lg:py-16 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)]">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-4">
          <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.04em] text-[#0F172A]">
            Establish Your Institution's Secure Examination Enclave
          </h3>
          <p className="text-xs text-slate-600 max-w-xl mx-auto leading-relaxed">
            Complete institutional identity validation, register authorized examination personnel, and safeguard national educational examinations.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={onOpenRegister}
              className="landing-cta-primary px-5 py-2.75 rounded-xl bg-[#047857] text-white font-bold text-xs shadow-[0_8px_18px_rgba(4,120,87,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#059669]"
            >
              Start Organization Accreditation
            </button>
            <button
              onClick={onOpenLogin}
              className="landing-cta-secondary px-5 py-2.75 rounded-xl bg-white hover:bg-[#ECFDF5] text-[#047857] font-bold text-xs border border-[#A7F3D0] shadow-[0_6px_14px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5"
            >
              Sign In Existing Account
            </button>
          </div>
        </div>
      </section>

      <footer className="mt-auto bg-[linear-gradient(180deg,#0F172A_0%,#0B1220_100%)] border-t border-[#0F172A]/90 text-slate-400 py-6 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#047857] to-[#0F766E] text-white shadow-[0_8px_18px_rgba(4,120,87,0.25)]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <img src="/assets/logo/logo-wordmark.png" alt="ZeroLeak" className="h-5 object-contain" />
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">AI Powered Secure Exam Paper Generation and Protection</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="footer-chip text-[10px] tracking-[0.14em] uppercase">FIPS 140-2</span>
            <span className="footer-chip text-[10px] tracking-[0.14em] uppercase">RSA-2048</span>
            <span className="footer-chip text-[10px] tracking-[0.14em] uppercase">Shamir</span>
            <span className="footer-chip text-[10px] tracking-[0.14em] uppercase">Immutable Audit Ledger</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

