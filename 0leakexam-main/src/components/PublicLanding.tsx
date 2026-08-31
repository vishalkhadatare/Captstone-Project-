import React from 'react';
import {
  ShieldCheck,
  Building2,
  KeyRound,
  ArrowRight,
  CheckCircle2,
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Academic Navigation */}
      <header className="sticky top-0 z-30 w-full bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <ZeroLeakLogo size="sm" imgHeightClass="h-10 sm:h-12 md:h-14" showWordmark />

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenRegister}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-semibold text-xs transition-colors shadow-xs"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-600" />
              <span>Organization Registration</span>
            </button>

            <button
              onClick={onOpenLogin}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold text-xs shadow-sm transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In to Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 lg:py-28 bg-gradient-to-b from-white to-stone-50 border-b border-stone-200 flex-1 flex flex-col justify-center">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>National Examination Security & Integrity Assurance Infrastructure</span>
          </div>

          {/* central branding removed - header logo retained per design */}

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-950 tracking-tight leading-tight">
            AI Powered Secure Exam Paper Generation and Protection
          </h1>

          <p className="max-w-3xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed">
            ZeroLeak is a high-assurance educational platform engineered for central examination boards, autonomous universities, and national recruitment commissions to eliminate question paper leaks through mathematical cryptography, verified question pools, AI pattern validation, and time-locked delivery.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button
              onClick={onOpenRegister}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-bold text-sm shadow-md transition-colors"
            >
              <Building2 className="w-4 h-4" />
              <span>Register New Organization</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenLogin}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-sm shadow-xs transition-colors"
            >
              <KeyRound className="w-4 h-4 text-emerald-900" />
              <span>Authorized Operator Sign In</span>
            </button>
          </div>

          <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              AES-256-GCM Military Encryption
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              Zero-Trust Role Separation
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              Dynamic Watermark Forensics
            </span>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="py-12 bg-white">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-4">
          <h3 className="text-xl font-bold text-slate-900">
            Establish Your Institution's Secure Examination Enclave
          </h3>
          <p className="text-xs text-slate-600 max-w-xl mx-auto">
            Complete institutional identity validation, register authorized examination personnel, and safeguard national educational examinations.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={onOpenRegister}
              className="px-5 py-2.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-colors"
            >
              Start Organization Accreditation
            </button>
            <button
              onClick={onOpenLogin}
              className="px-5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
            >
              Sign In Existing Account
            </button>
          </div>
        </div>
      </section>

      {/* Institutional Academic Footer */}
      <footer className="mt-auto bg-slate-900 border-t border-slate-800 text-slate-400 py-6 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1 rounded bg-emerald-800 text-white">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-bold text-white">ZeroLeak</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">AI Powered Secure Exam Paper Generation and Protection</span>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            FIPS 140-2 AES-256 • RSA-2048 • Shamir (k,n) • Immutable Audit Ledger
          </div>
        </div>
      </footer>
    </div>
  );
};

