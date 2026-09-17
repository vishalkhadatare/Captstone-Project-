import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  KeyRound,
  Sun,
  Moon,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Terminal,
} from 'lucide-react';

interface PublicLandingProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenPersonnelRegister?: (role?: 'TRANSLATOR' | 'CENTRE_OPERATOR') => void;
}

export const PublicLanding: React.FC<PublicLandingProps> = ({
  onOpenLogin,
  onOpenRegister,
  onOpenPersonnelRegister,
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zeroleak_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark';
    }
    return 'dark';
  });

  const [installCopied, setInstallCopied] = useState<string | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('zeroleak_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('zeroleak_theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const copyInstall = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setInstallCopied(id);
      setTimeout(() => setInstallCopied(null), 2000);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col font-['Figtree',sans-serif] transition-colors duration-300 selection:bg-[#00cc5f] selection:text-black relative overflow-x-hidden ${
        isDark ? 'bg-[#080B11] text-[#F3F4F6]' : 'bg-[#F8FAFC] text-[#0E0E0E]'
      }`}
    >
      {/* ========================================================================= */}
      {/* AMBIENT RADIAL LIGHTING & GLOW AURA (Flows smoothly through glass UI)     */}
      {/* ========================================================================= */}
      {isDark ? (
        <>
          {/* Top luminous radial green aurora */}
          <div
            className="fixed top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] pointer-events-none z-0 opacity-45 blur-[120px]"
            style={{
              background: 'radial-gradient(circle, rgba(0, 204, 95, 0.3) 0%, rgba(14, 165, 233, 0.15) 50%, transparent 75%)',
            }}
          />
          {/* Mid ambient glow */}
          <div
            className="fixed top-[45%] left-1/4 w-[700px] h-[500px] pointer-events-none z-0 opacity-25 blur-[140px]"
            style={{
              background: 'radial-gradient(circle, rgba(0, 204, 95, 0.22) 0%, rgba(56, 189, 248, 0.12) 60%, transparent 80%)',
            }}
          />
          {/* Bottom subtle ambient light */}
          <div
            className="fixed -bottom-40 right-10 w-[650px] h-[450px] pointer-events-none z-0 opacity-25 blur-[150px]"
            style={{
              background: 'radial-gradient(circle, rgba(0, 204, 95, 0.25) 0%, transparent 70%)',
            }}
          />
        </>
      ) : (
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] pointer-events-none z-0 opacity-30 blur-[130px]"
          style={{
            background: 'radial-gradient(circle, rgba(0, 204, 95, 0.2) 0%, rgba(14, 165, 233, 0.1) 60%, transparent 75%)',
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* REPEATING WAVE CURVES BACKGROUND (Visible throughout transparent UI)      */}
      {/* ========================================================================= */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden z-0"
        style={{
          top: '56px',
          filter: isDark
            ? 'blur(10px) drop-shadow(0 0 30px rgba(0,255,119,0.35))'
            : 'blur(18px)',
          opacity: isDark ? 0.38 : 0.25,
        }}
      >
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundImage: 'url(/curve-secondary.svg)',
            backgroundRepeat: 'repeat',
            backgroundPosition: '0 0',
          }}
        />
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundImage: 'url(/curve-primary.svg)',
            backgroundRepeat: 'repeat',
            backgroundPosition: '0 0',
          }}
        />
      </div>

      {/* ========================================================================= */}
      {/* 1. DUAL HEADER: TRANSPARENT FROSTED GLASS                                 */}
      {/* ========================================================================= */}
      <header
        className={`sticky top-0 z-50 w-full border-b backdrop-blur-2xl transition-all ${
          isDark
            ? 'bg-[#080B11]/40 border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.4)]'
            : 'bg-white/60 border-black/[0.06] shadow-xs'
        }`}
      >
        {/* ROW 1: Logo + Actions + Theme */}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* ZeroLeak Brand Mark */}
          <div className="flex items-center gap-3 shrink-0">
            <a href="/" className="flex items-center gap-2.5 cursor-pointer group">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-105 backdrop-blur-md ${
                  isDark
                    ? 'bg-[#00cc5f]/15 border border-[#00cc5f]/40 shadow-[0_0_15px_rgba(0,204,95,0.3)]'
                    : 'bg-[#00cc5f]/15 border border-[#00cc5f]/30'
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-[#00cc5f]" />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[1.2rem] font-extrabold tracking-tight uppercase font-['Figtree'] ${
                    isDark ? 'text-white' : 'text-[#0e0e0e]'
                  }`}
                >
                  Zero<span className="text-[#00cc5f]">Leak</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold tracking-wider backdrop-blur-md ${
                    isDark
                      ? 'border-[#00cc5f]/40 bg-[#00cc5f]/10 text-[#00cc5f]'
                      : 'border-slate-300 bg-white/60 text-slate-700'
                  }`}
                >
                  ENCLAVE
                </span>
              </div>
            </a>
          </div>

          {/* Right Controls: Theme + Direct Login */}
          <div className="flex items-center gap-3 text-xs shrink-0">
            {/* Dark / Light Toggle */}
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium cursor-pointer transition-all backdrop-blur-md ${
                isDark
                  ? 'bg-white/[0.05] border-white/10 text-slate-200 hover:border-[#00cc5f]/40 hover:text-white'
                  : 'bg-black/[0.04] border-black/10 text-slate-700 hover:text-black hover:border-black/20'
              }`}
              title="Toggle Theme"
            >
              {isDark ? (
                <Moon className="w-3.5 h-3.5 text-[#00cc5f]" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span>{isDark ? 'Dark' : 'Light'}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {/* Quick Action Button */}
            <button
              onClick={onOpenLogin}
              className="px-3.5 py-1.5 rounded-lg bg-[#00cc5f] hover:bg-[#00dd68] text-black font-semibold text-xs cursor-pointer shadow-[0_0_15px_rgba(0,204,95,0.35)] hover:shadow-[0_0_22px_rgba(0,204,95,0.55)] transition-all"
            >
              Sign In
            </button>
          </div>
        </div>

        {/* ROW 2: Sub-nav links */}
        <div
          className={`border-t backdrop-blur-xl ${
            isDark ? 'border-white/[0.06] bg-black/[0.15]' : 'border-black/[0.05] bg-white/40'
          }`}
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-10 flex items-center justify-end text-xs font-medium">
            <div
              className={`hidden sm:flex items-center gap-5 text-xs ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-[#00cc5f] shadow-[0_0_8px_#00cc5f] animate-pulse" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  Enclave: <strong className="text-[#00cc5f]">Airgap Active</strong>
                </span>
              </span>
              <span
                onClick={onOpenLogin}
                className={`flex items-center gap-1 cursor-pointer font-medium transition-colors ${
                  isDark ? 'text-slate-300 hover:text-white' : 'text-slate-700 hover:text-black'
                }`}
              >
                <span>Audit Portal</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. HERO SECTION: CLEAN STRANDS STYLE WITH ZEROLEAK DEFENSE CONTENT       */}
      {/* ========================================================================= */}
      <section
        id="hero"
        className="relative z-10 flex-1 flex items-center justify-center py-12 lg:py-20 px-4 sm:px-6 lg:px-8"
      >
        <div className="w-full max-w-[1240px] flex items-center">
          {/* TITLE + CTAs + INITIALIZATION CHIPS + TRUST RECORD */}
          <div className="text-left space-y-6 max-w-3xl">
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-mono font-medium backdrop-blur-xl ${
                isDark
                  ? 'bg-white/[0.04] border-white/10 text-emerald-400'
                  : 'bg-white/70 border-black/10 text-emerald-700 shadow-2xs font-semibold'
              }`}
            >
              <span className="flex h-2 w-2 rounded-full bg-[#00cc5f] animate-ping" />
              <span>Next-Gen National Exam Security Standard</span>
            </div>

            <h1
              className={`text-[2.35rem] sm:text-[3.25rem] lg:text-[3.75rem] font-bold leading-[1.08] tracking-[-0.03em] ${
                isDark ? 'text-white' : 'text-[#0E0E0E]'
              }`}
            >
              The zero-trust defense protocol for{' '}
              <span className="block mt-1 bg-gradient-to-r from-[#00FF77] via-[#00E5FF] to-[#00FF77] bg-clip-text text-transparent font-extrabold drop-shadow-[0_0_20px_rgba(0,204,95,0.3)]">
                national question papers.
              </span>
            </h1>

            <p className={`text-[0.95rem] leading-relaxed max-w-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Eliminate paper leaks with algorithmic 3-paper synthesis (180 questions each), timed (3, 5) Shamir quorum decryption, continuous 30 FPS anti-surfing facial attestation, and L7 forensic steganography.
            </p>

            {/* Core ZeroLeak CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onOpenLogin}
                className="px-7 py-3 rounded-lg bg-[#00cc5f] hover:bg-[#00dd68] text-[#0e0e0e] font-semibold text-[0.95rem] transition-all hover:-translate-y-0.5 shadow-[0_4px_25px_rgba(0,204,95,0.35)] hover:shadow-[0_6px_30px_rgba(0,204,95,0.5)] cursor-pointer flex items-center gap-2"
              >
                <KeyRound className="w-4 h-4 text-black" />
                <span>Access Secure Enclave</span>
              </button>

              <button
                onClick={onOpenRegister}
                className={`px-7 py-3 rounded-lg border font-semibold text-[0.95rem] transition-all cursor-pointer flex items-center gap-2 backdrop-blur-xl ${
                  isDark
                    ? 'border-white/20 bg-white/[0.04] text-white hover:border-[#00cc5f] hover:text-[#00cc5f] hover:bg-[#00cc5f]/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
                    : 'border-black/20 bg-white/80 text-[#0e0e0e] hover:border-[#00cc5f] hover:text-[#00cc5f] shadow-xs'
                }`}
              >
                <Building2 className="w-4 h-4 text-[#00cc5f]" />
                <span>Register Authority</span>
              </button>

              {onOpenPersonnelRegister && (
                <button
                  onClick={() => onOpenPersonnelRegister()}
                  className={`px-4 py-3 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                  }`}
                >
                  <span>Personnel Gateway</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* ZeroLeak CLI Quickstart Commands: Transparent Glass Pills */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <div
                onClick={() => copyInstall('cli1', 'npx zeroleak extract --papers 3 --q 180')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono cursor-pointer transition-all backdrop-blur-xl ${
                  isDark
                    ? 'bg-white/[0.04] border-white/10 text-slate-200 hover:border-[#00cc5f]/50 hover:bg-white/[0.08] shadow-sm'
                    : 'bg-white/70 border-black/10 text-slate-700 hover:border-black/20 shadow-2xs'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-[#00cc5f]" />
                <code className="text-[0.8rem] font-medium">npx zeroleak extract --papers 3 --q 180</code>
                <button className="text-slate-400 hover:text-white transition-colors ml-1">
                  {installCopied === 'cli1' ? (
                    <Check className="w-3.5 h-3.5 text-[#00cc5f]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div
                onClick={() => copyInstall('cli2', 'npx zeroleak quorum --threshold 3-of-5')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono cursor-pointer transition-all backdrop-blur-xl ${
                  isDark
                    ? 'bg-white/[0.04] border-[#00cc5f]/70 text-slate-100 shadow-[0_0_18px_rgba(0,204,95,0.25)] hover:border-[#00cc5f]'
                    : 'bg-emerald-50/70 border-emerald-400 text-emerald-900 shadow-2xs'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#00cc5f] shadow-[0_0_6px_#00cc5f] animate-pulse" />
                <code className="text-[0.8rem] font-medium">npx zeroleak quorum --threshold 3-of-5</code>
                <button className="text-slate-400 hover:text-white transition-colors ml-1">
                  {installCopied === 'cli2' ? (
                    <Check className="w-3.5 h-3.5 text-[#00cc5f]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Social Proof & Defense Metrics */}
            <div className={`flex items-center gap-2 text-xs font-medium pt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <Sparkles className="w-4 h-4 text-[#00cc5f]" />
              <span>0 Leak Incidents Across National Assessments &bull; FIPS 140-2 Level 4 Enclave</span>
            </div>
          </div>

        </div>
      </section>

      {/* Footer: Transparent Glass */}
      <footer
        className={`relative z-10 py-8 border-t text-xs transition-colors backdrop-blur-md ${
          isDark
            ? 'border-white/10 bg-black/[0.2] text-slate-400'
            : 'border-black/10 bg-white/40 text-slate-500'
        }`}
      >
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>
              ZeroLeak Enclave
            </span>
            <span>&bull;</span>
            <span>National Examination Security Infrastructure</span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 backdrop-blur-md">AES-256-GCM</span>
            <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 backdrop-blur-md">SHAMIR (3, 5)</span>
            <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 backdrop-blur-md">FIPS 140-2</span>
            <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 backdrop-blur-md">SHA-256 MERKLE</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
