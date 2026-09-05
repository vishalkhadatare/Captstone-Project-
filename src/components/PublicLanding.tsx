import React from 'react';
import {
  ShieldCheck,
  Building2,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  BrainCircuit,
  LockKeyhole,
  Camera,
  Layers,
  Database,
  EyeOff,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';

interface PublicLandingProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenPersonnelRegister?: (role?: 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR') => void;
}

export const PublicLanding: React.FC<PublicLandingProps> = ({
  onOpenLogin,
  onOpenRegister,
  onOpenPersonnelRegister,
}) => {
  return (
    <div className="landing-page-shell min-h-screen text-slate-900 flex flex-col font-sans selection:bg-emerald-800 selection:text-white">
      {/* Sticky Frosted Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/85 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="landing-logo-wrap">
            <ZeroLeakLogo size="sm" imgHeightClass="h-9 sm:h-11 md:h-12" showWordmark variant="lockup" />
          </div>

          <div className="flex items-center gap-3">
            {onOpenPersonnelRegister && (
              <button
                onClick={() => onOpenPersonnelRegister()}
                className="landing-cta-secondary hidden md:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-blue-600/30 text-blue-800 bg-white/90 font-bold text-xs transition-all duration-200 shadow-2xs hover:border-blue-500 hover:bg-blue-50/70 hover:-translate-y-0.5 cursor-pointer"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-blue-700" />
                <span>Personnel Registration</span>
              </button>
            )}

            <button
              onClick={onOpenRegister}
              className="landing-cta-secondary hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-600/30 text-emerald-800 bg-white/90 font-bold text-xs transition-all duration-200 shadow-2xs hover:border-emerald-500 hover:bg-emerald-50/60 hover:-translate-y-0.5 cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Register Authority</span>
            </button>

            <button
              onClick={onOpenLogin}
              className="btn-gradient-emerald inline-flex items-center gap-2 px-5 py-2 rounded-xl text-white font-bold text-xs shadow-md shadow-emerald-900/15 hover:shadow-emerald-900/25 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-200" />
              <span>Sign In to Enclave</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero relative overflow-hidden py-16 sm:py-20 lg:py-24 flex-1 flex flex-col justify-center">
        <div className="hero-sheen" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-orb hero-orb-one" aria-hidden="true" />
        <div className="hero-orb hero-orb-two" aria-hidden="true" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          {/* Official Pill Badge */}
          <div className="landing-badge inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-xs font-semibold shadow-xs">
            <ShieldCheck className="w-4 h-4 text-[#047857]" />
            <span>National Examination Security & Integrity Assurance Infrastructure</span>
          </div>

          {/* Hero Main Heading */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#0F172A] leading-tight sm:leading-none">
            AI-Powered Secure Exam Paper{' '}
            <span className="bg-gradient-to-r from-[#047857] via-[#0D9488] to-[#0284C7] bg-clip-text text-transparent">
              Generation & Protection
            </span>
          </h1>

          {/* Subheading */}
          <p className="landing-subhead max-w-3xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
            ZeroLeak is a military-grade examination enclave designed for central examination boards, universities, and national testing agencies. It eliminates question paper leakage through live camera proctoring, multi-party cryptographic sharding, and real-time screen surveillance.
          </p>

          {/* Call-to-actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button
              onClick={onOpenLogin}
              className="landing-cta-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-emerald-800 via-teal-700 to-emerald-900 text-white font-bold text-sm shadow-lg shadow-emerald-950/20 hover:shadow-xl hover:shadow-emerald-950/30 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-emerald-300" />
              <span>Enter Authority Proctor Enclave</span>
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </button>

            <button
              onClick={onOpenRegister}
              className="landing-cta-secondary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white text-[#047857] border border-[#A7F3D0] font-bold text-sm shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#ECFDF5] hover:border-[#047857]/40 cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>Register Educational Authority</span>
            </button>
          </div>

          {/* Dedicated Personnel Registration Strip */}
          {onOpenPersonnelRegister && (
            <div className="pt-1 flex justify-center">
              <button
                onClick={() => onOpenPersonnelRegister()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/90 border border-blue-200 shadow-xs hover:border-blue-400 hover:bg-blue-50/70 hover:shadow-md transition-all text-xs font-semibold text-slate-800 group cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-slate-600">Appointed as</span>
                <span className="font-bold text-blue-700 underline underline-offset-2">SME, Linguistic Translator, or Centre Operator?</span>
                <span className="text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform">&rarr; Register Here</span>
              </button>
            </div>
          )}

          {/* Quick Trust Highlights */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600 font-medium">
            <div className="trust-card flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 border border-slate-200/80 shadow-xs backdrop-blur-sm">
              <Camera className="w-4 h-4 text-[#047857]" />
              <span className="font-semibold text-slate-700">Live Authority Camera Proctor</span>
            </div>
            <div className="trust-card flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 border border-slate-200/80 shadow-xs backdrop-blur-sm">
              <LockKeyhole className="w-4 h-4 text-[#047857]" />
              <span className="font-semibold text-slate-700">AES-256-GCM Cryptographic Vault</span>
            </div>
            <div className="trust-card flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 border border-slate-200/80 shadow-xs backdrop-blur-sm">
              <EyeOff className="w-4 h-4 text-[#0F766E]" />
              <span className="font-semibold text-slate-700">Anti-Shoulder Surfing Masking</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Pillar Security Architecture Grid */}
      <section className="py-14 lg:py-16 bg-white border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Zero-Trust Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              End-to-End Leak Prevention for Authorities
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              ZeroLeak enforces continuous compliance from the moment exam managers assemble question banks until final delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="modern-card p-6 rounded-2xl flex flex-col justify-between hover:border-emerald-300 transition-all duration-200 group">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 group-hover:scale-105 transition-transform">
                  <Camera className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Authority Camera Surveillance</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Real-time webcam verification with floating live preview for authorities. Detects tab shifts, unauthorized devices, and shoulder surfers.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Continuous Proctoring
              </div>
            </div>

            {/* Feature 2 */}
            <div className="modern-card p-6 rounded-2xl flex flex-col justify-between hover:border-teal-300 transition-all duration-200 group">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 group-hover:scale-105 transition-transform">
                  <LockKeyhole className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Strict Role Delegation</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Organization Owner directly creates and authorizes Examination Managers & Auditors with custom credential vaults.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-[11px] font-semibold text-teal-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Owner Access Control
              </div>
            </div>

            {/* Feature 3 */}
            <div className="modern-card p-6 rounded-2xl flex flex-col justify-between hover:border-sky-300 transition-all duration-200 group">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Cryptographic Key Sharding</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Multi-custodian Shamir secret sharing prevents single-point compromise. Exam papers cannot be decrypted without quorum consensus.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-[11px] font-semibold text-sky-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Shamir Multi-Party Key
              </div>
            </div>

            {/* Feature 4 */}
            <div className="modern-card p-6 rounded-2xl flex flex-col justify-between hover:border-amber-300 transition-all duration-200 group">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 group-hover:scale-105 transition-transform">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Immutable SHA-256 Ledger</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Every decrypt attempt, question view, and authority sign-in is cryptographically signed and stored in a tamper-evident audit trail.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-[11px] font-semibold text-amber-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Audit Trail Persistence
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Conversion Banner */}
      <section className="py-12 bg-gradient-to-b from-slate-50 to-emerald-50/40 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-4">
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0F172A]">
            Establish Your Institution's Secure Examination Enclave
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
            Complete institutional identity validation, grant role access to verified examination managers, and safeguard national educational assessments.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenRegister}
              className="landing-cta-primary px-6 py-3 rounded-xl bg-[#047857] text-white font-bold text-xs shadow-md shadow-emerald-900/15 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#059669] cursor-pointer"
            >
              Start Organization Accreditation
            </button>
            {onOpenPersonnelRegister && (
              <button
                onClick={() => onOpenPersonnelRegister()}
                className="landing-cta-secondary px-6 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs border border-blue-300 shadow-sm transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
              >
                Register Personnel (SME / Translator / Operator)
              </button>
            )}
            <button
              onClick={onOpenLogin}
              className="landing-cta-secondary px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-[#047857] font-bold text-xs border border-slate-300 shadow-sm transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
            >
              Sign In Existing Account
            </button>
          </div>
        </div>
      </section>

      {/* Modern Footer */}
      <footer className="mt-auto bg-slate-900 border-t border-slate-800 text-slate-400 py-6 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#047857] to-[#0F766E] text-white shadow-md">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <img src="/assets/logo/logo-wordmark.png" alt="ZeroLeak" className="h-5 object-contain brightness-125" />
            <span className="text-slate-600 hidden md:inline">|</span>
            <span className="text-slate-400 hidden md:inline">National Examination Security Infrastructure</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="footer-chip text-[10px] tracking-wider uppercase bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">FIPS 140-2</span>
            <span className="footer-chip text-[10px] tracking-wider uppercase bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">RSA-2048</span>
            <span className="footer-chip text-[10px] tracking-wider uppercase bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">Shamir Secret Sharing</span>
            <span className="footer-chip text-[10px] tracking-wider uppercase bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">Immutable Audit Ledger</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

