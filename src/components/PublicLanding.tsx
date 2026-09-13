import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  KeyRound,
  CheckCircle2,
  Shuffle,
  Layers,
  Fingerprint,
  ScanFace,
  Sun,
  Moon,
  Search,
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
  onOpenPersonnelRegister?: (role?: 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR') => void;
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

  const [activeAudience, setActiveAudience] = useState<'authorities' | 'personnel'>('authorities');
  const [activeLang, setActiveLang] = useState<'Python' | 'TypeScript'>('TypeScript');
  const [selectedPaper, setSelectedPaper] = useState<1 | 2 | 3>(1);
  const [codeCopied, setCodeCopied] = useState(false);
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

  const copyCode = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const copyInstall = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setInstallCopied(id);
      setTimeout(() => setInstallCopied(null), 2000);
    }
  };

  const codeSnippets = {
    authorities: `import {
  MultiPaperEngine,
  ShamirThresholdVault,
  EnclaveAirgap
} from '@zeroleak/defense-sdk'
import z from 'zod'

// 1. Synthesize 3 parallel non-correlated 180Q papers
const generatePapers = tool({
  name: 'extract_national_papers',
  description: 'Extract 180 questions each for Paper 1, 2, and 3.',
  inputSchema: z.object({
    examId: z.string(),
    totalQuestions: z.literal(180),
    subjects: z.array(z.string()),
  }),
  callback: async ({ examId }) => {
    return await MultiPaperEngine.buildBalancedSets({
      sets: ['PAPER_01', 'PAPER_02', 'PAPER_03'],
      subjects: { Physics: 45, Chemistry: 45, Botany: 45, Zoology: 45 },
      maxOverlap: 0.40, // Strict 40% cap
      optionShuffle: 'FISHER_YATES_BALANCED'
    })
  },
})

// 2. Lock under (3, 5) Shamir Quorum until T - 15m
const enclave = new EnclaveAirgap({
  thresholdK: 3,
  totalSharesN: 5,
  decryptionGate: 'T_MINUS_15_MINUTES'
})`,
    personnel: `import {
  CustodianToken,
  BiometricAttestation,
  ForensicCanary
} from '@zeroleak/personnel-sdk'
import z from 'zod'

// Timed custodian shard release with iris verification
const authorizeDecryption = tool({
  name: 'present_custodian_shard',
  description: 'Submit hardware token at T-15m with live biometric proof.',
  inputSchema: z.object({
    custodianRole: z.enum(['SUPERINTENDENT', 'CONTROLLER', 'AUDITOR']),
    tokenSerial: z.string(),
  }),
  callback: async ({ custodianRole, tokenSerial }) => {
    return await CustodianToken.verifyAndPresent({
      role: custodianRole,
      serial: tokenSerial,
      biometricLiveness: 1.0
    })
  },
})

// Embed invisible L7 forensic steganography on student papers
const watermark = new ForensicCanary({
  tracingMethod: 'CANARY_MICRODOT_MATRIX',
  survivesCameraPhoto: true
})`
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
        {/* ROW 1: Logo + Search + Language Switcher + Actions + Theme */}
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

          {/* Centered Search Button: Transparent Frosted Capsule */}
          <div className="flex-1 max-w-md mx-auto hidden md:block">
            <div
              className={`flex items-center justify-between px-3.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all backdrop-blur-xl ${
                isDark
                  ? 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-[#00cc5f]/50 hover:bg-white/[0.08]'
                  : 'bg-black/[0.03] border-black/[0.08] text-slate-600 hover:border-black/20 hover:bg-black/[0.05]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Search className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>Search question pools, blueprints, quorum keys...</span>
              </div>
              <kbd
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border backdrop-blur-md ${
                  isDark
                    ? 'bg-white/[0.08] border-white/15 text-slate-300'
                    : 'bg-white/80 border-black/10 text-slate-600 shadow-2xs'
                }`}
              >
                Ctrl K
              </kbd>
            </div>
          </div>

          {/* Right Controls: Python / TypeScript + Theme + Direct Login */}
          <div className="flex items-center gap-3 text-xs shrink-0">
            {/* Language Switcher */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveLang('Python')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  activeLang === 'Python'
                    ? isDark
                      ? 'text-white font-semibold'
                      : 'text-black font-semibold'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-500 hover:text-black'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969c0 6.18 3.403 5.96 3.403 5.96h2.03v-2.867s-.109-3.42 3.35-3.42h5.766s3.24.052 3.24-3.148V3.202S18.28 0 11.914 0zM8.708 1.85a1.06 1.06 0 110 2.12 1.06 1.06 0 010-2.12zM12.086 24c6.094 0 5.714-2.656 5.714-2.656l-.007-2.752H11.98v-.826h8.121S24 18.211 24 12.031c0-6.18-3.403-5.96-3.403-5.96h-2.03v2.867s.109 3.42-3.35 3.42H9.451s-3.24-.052-3.24 3.148v5.292S5.72 24 12.086 24zm3.206-1.85a1.06 1.06 0 110-2.12 1.06 1.06 0 010 2.12z" />
                </svg>
                <span>Python</span>
              </button>

              <button
                onClick={() => setActiveLang('TypeScript')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer border-b-2 ${
                  activeLang === 'TypeScript'
                    ? `border-[#00cc5f] ${isDark ? 'text-white' : 'text-black'} font-semibold`
                    : isDark
                    ? 'border-transparent text-slate-400 hover:text-white'
                    : 'border-transparent text-slate-500 hover:text-black'
                }`}
              >
                <span className="px-1 py-0.2 bg-[#00cc5f] text-black text-[9px] font-mono font-bold rounded">
                  TS
                </span>
                <span>TypeScript</span>
              </button>
            </div>

            <div className={`h-4 w-px ${isDark ? 'bg-white/15' : 'bg-black/10'}`} />

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
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-10 flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-6 sm:gap-7 overflow-x-auto scrollbar-none">
              <a
                href="#hero"
                className={`font-semibold transition-colors ${isDark ? 'text-white' : 'text-black'}`}
              >
                Overview
              </a>
              <a
                href="#papers"
                className={`transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                }`}
              >
                3-Paper Permutations
              </a>
              <a
                href="#quorum"
                className={`transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                }`}
              >
                (3, 5) Quorum Vault
              </a>
              <a
                href="#proctor"
                className={`transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                }`}
              >
                Optical Proctoring
              </a>
              <a
                href="#gateways"
                className={`transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                }`}
              >
                Clearance Portals
              </a>
            </div>

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
        <div className="w-full max-w-[1240px] grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-14 items-center">
          {/* LEFT COLUMN: TITLE + CTAs + INITIALIZATION CHIPS + TRUST RECORD */}
          <div className="text-left space-y-6">
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

          {/* RIGHT COLUMN: [For Authorities | For Personnel] + macOS Code Window */}
          <div className="flex flex-col items-start lg:items-end">
            {/* Audience Toggle (Frosted Glass Pill Switch) */}
            <div
              className={`inline-flex items-center rounded-full p-1 border mb-3 transition-all backdrop-blur-xl ${
                isDark
                  ? 'bg-white/[0.04] border-white/10 shadow-inner'
                  : 'bg-black/[0.04] border-black/10'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveAudience('authorities')}
                className={`px-4 py-1.5 rounded-full text-[0.8125rem] font-medium transition-all cursor-pointer ${
                  activeAudience === 'authorities'
                    ? 'bg-[#00cc5f] text-[#0e0e0e] font-semibold shadow-[0_2px_12px_rgba(0,204,95,0.35)]'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-black'
                }`}
              >
                For Authorities
              </button>
              <button
                type="button"
                onClick={() => setActiveAudience('personnel')}
                className={`px-4 py-1.5 rounded-full text-[0.8125rem] font-medium transition-all cursor-pointer ${
                  activeAudience === 'personnel'
                    ? 'bg-[#00cc5f] text-[#0e0e0e] font-semibold shadow-[0_2px_12px_rgba(0,204,95,0.35)]'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-black'
                }`}
              >
                For Personnel
              </button>
            </div>

            {/* Code Box: Frosted Smoked Glass Container */}
            <div
              className={`w-full max-w-xl rounded-xl border text-left overflow-hidden transition-all backdrop-blur-2xl shadow-2xl ${
                isDark
                  ? 'bg-[#0B0F17]/65 border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_25px_rgba(0,204,95,0.12)]'
                  : 'bg-white/75 border-black/10 shadow-xl'
              }`}
            >
              {/* Header: macOS traffic dots + filename + copy icon */}
              <div
                className={`px-4 py-2.5 border-b flex items-center justify-between select-none backdrop-blur-md ${
                  isDark ? 'border-white/10 bg-white/[0.04]' : 'border-black/[0.06] bg-black/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] inline-block shadow-2xs" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] inline-block shadow-2xs" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] inline-block shadow-2xs" />
                  </div>
                  <span className={`text-xs font-mono font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {activeAudience === 'authorities' ? 'multi_paper_engine.ts' : 'custodian_token.ts'}
                  </span>
                </div>

                <button
                  onClick={() => copyCode(codeSnippets[activeAudience])}
                  className={`transition-colors p-1 cursor-pointer ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'
                  }`}
                  title="Copy code"
                >
                  {codeCopied ? <Check className="w-4 h-4 text-[#00cc5f]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Exact Syntax Highlighting on Smoked Glass */}
              <div className="p-5 font-mono text-[0.875rem] leading-[1.65] overflow-x-auto">
                <pre className={isDark ? 'text-slate-100' : 'text-[#24292E]'}>
                  <code>
                    {codeSnippets[activeAudience].split('\n').map((line, i) => (
                      <div key={i}>
                        {line.startsWith('//') ? (
                          <span className={isDark ? 'text-slate-400 italic' : 'text-slate-500 italic'}>
                            {line}
                          </span>
                        ) : line.startsWith('import ') || line.includes('} from ') ? (
                          <span>
                            {line.split(/(\bimport\b|\bfrom\b|'[^']*')/g).map((part, pI) => {
                              if (part === 'import' || part === 'from') {
                                return (
                                  <span key={pI} className={isDark ? 'text-[#FF7B72]' : 'text-[#D73A49]'}>
                                    {part}
                                  </span>
                                );
                              }
                              if (part.startsWith("'")) {
                                return (
                                  <span key={pI} className={isDark ? 'text-[#A5D6FF]' : 'text-[#032F62]'}>
                                    {part}
                                  </span>
                                );
                              }
                              return <span key={pI}>{part}</span>;
                            })}
                          </span>
                        ) : line.includes('const ') || line.includes('new ') ? (
                          <span>
                            {line.split(/(\bconst\b|\btool\b|\bnew \w+\b)/g).map((part, pI) => {
                              if (part === 'const' || part.startsWith('new ')) {
                                return (
                                  <span key={pI} className={isDark ? 'text-[#FF7B72]' : 'text-[#D73A49]'}>
                                    {part}
                                  </span>
                                );
                              }
                              if (part === 'tool') {
                                return (
                                  <span key={pI} className={isDark ? 'text-[#D2A8FF]' : 'text-[#6F42C1]'}>
                                    {part}
                                  </span>
                                );
                              }
                              return <span key={pI}>{part}</span>;
                            })}
                          </span>
                        ) : line.includes(':') || line.includes('=>') ? (
                          <span>
                            {line.split(/('[\w\-\.\/]+'|`[^`]+`|\bz\.\w+\b|\b\d+\b)/g).map((part, pI) => {
                              if (part.startsWith("'") || part.startsWith('`')) {
                                return (
                                  <span key={pI} className={isDark ? 'text-[#A5D6FF]' : 'text-[#032F62]'}>
                                    {part}
                                  </span>
                                );
                              }
                              if (part.startsWith('z.')) {
                                return (
                                  <span key={pI} className={isDark ? 'text-[#79C0FF]' : 'text-[#005CC5]'}>
                                    {part}
                                  </span>
                                );
                              }
                              if (/^\d+$/.test(part)) {
                                return (
                                  <span key={pI} className={isDark ? 'text-[#FFA657]' : 'text-[#005CC5]'}>
                                    {part}
                                  </span>
                                );
                              }
                              return <span key={pI}>{part}</span>;
                            })}
                          </span>
                        ) : (
                          <span>{line}</span>
                        )}
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. ZEROLEAK PROJECT FEATURES SECTION (100% TRANSPARENT GLASS ARCHITECTURE)*/}
      {/* ========================================================================= */}
      <section
        id="papers"
        className={`relative z-10 py-20 border-t transition-colors ${
          isDark ? 'border-white/[0.08]' : 'border-black/[0.08]'
        }`}
      >
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-16">
          {/* 3-Paper Permutation Engine Section */}
          <div className="space-y-8 text-left">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#00cc5f] flex items-center gap-1.5">
                <Shuffle className="w-3.5 h-3.5" />
                <span>Combinatorial Synthesis</span>
              </span>
              <h2 className={`text-3xl sm:text-4xl font-bold tracking-[-0.03em] ${isDark ? 'text-white' : 'text-[#0E0E0E]'}`}>
                3 Distinct Question Papers &bull; 180 Questions Each
              </h2>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Extracts complete 180-question banks across 3 non-correlated sets. Every set contains balanced subject quotas (45 Physics, 45 Chemistry, 45 Botany, 45 Zoology) with Fisher-Yates shuffled option permutations and auto-calculated answer keys.
              </p>
            </div>

            {/* 3 Interactive Translucent Glass Paper Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Paper 1: Set A */}
              <div
                onClick={() => setSelectedPaper(1)}
                className={`p-6 rounded-2xl border transition-all cursor-pointer backdrop-blur-2xl ${
                  selectedPaper === 1
                    ? isDark
                      ? 'border-[#00cc5f] shadow-[0_0_35px_rgba(0,204,95,0.25)] bg-[#00cc5f]/[0.08] ring-1 ring-[#00cc5f]/50'
                      : 'border-[#00cc5f] shadow-[0_0_25px_rgba(0,204,95,0.18)] bg-white/80 ring-1 ring-[#00cc5f]/40'
                    : isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-white/25 hover:bg-white/[0.06] shadow-lg'
                    : 'bg-white/60 border-black/10 hover:border-slate-400 hover:bg-white/80 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#00cc5f]/15 text-[#00cc5f] backdrop-blur-md">
                    PAPER 01 &bull; PRIMARY (SET A)
                  </span>
                  <span className="text-xs font-bold text-[#00cc5f]">100% Extracted</span>
                </div>
                <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-black'}`}>
                  National Paper 1
                </h3>
                <p className={`text-xs mt-1 mb-4 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  180 verified questions with balanced difficulty distribution.
                </p>

                {/* Progress bar */}
                <div className={`w-full rounded-full h-1.5 mb-4 ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                  <div className="bg-[#00cc5f] h-1.5 rounded-full w-full shadow-[0_0_8px_#00cc5f]" />
                </div>

                {/* Subject chips */}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Physics:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Chemistry:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Botany:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Zoology:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                </div>

                <div
                  className={`mt-4 pt-3 border-t flex justify-between text-[11px] font-mono ${
                    isDark ? 'border-white/10 text-slate-400' : 'border-black/10 text-slate-500'
                  }`}
                >
                  <span>180 / 180 Questions</span>
                  <span className="text-[#00cc5f] font-bold">READY</span>
                </div>
              </div>

              {/* Paper 2: Set B */}
              <div
                onClick={() => setSelectedPaper(2)}
                className={`p-6 rounded-2xl border transition-all cursor-pointer backdrop-blur-2xl ${
                  selectedPaper === 2
                    ? isDark
                      ? 'border-teal-400 shadow-[0_0_35px_rgba(45,212,191,0.25)] bg-teal-400/[0.08] ring-1 ring-teal-400/50'
                      : 'border-teal-500 shadow-[0_0_25px_rgba(45,212,191,0.18)] bg-white/80 ring-1 ring-teal-500/40'
                    : isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-white/25 hover:bg-white/[0.06] shadow-lg'
                    : 'bg-white/60 border-black/10 hover:border-slate-400 hover:bg-white/80 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 backdrop-blur-md">
                    PAPER 02 &bull; PARALLEL (SET B)
                  </span>
                  <span className="text-xs font-bold text-teal-400">100% Extracted</span>
                </div>
                <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-black'}`}>
                  National Paper 2
                </h3>
                <p className={`text-xs mt-1 mb-4 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  180 questions permuted with randomized option sequences.
                </p>

                <div className={`w-full rounded-full h-1.5 mb-4 ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                  <div className="bg-teal-400 h-1.5 rounded-full w-full shadow-[0_0_8px_#2dd4bf]" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Physics:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Chemistry:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Botany:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Zoology:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                </div>

                <div
                  className={`mt-4 pt-3 border-t flex justify-between text-[11px] font-mono ${
                    isDark ? 'border-white/10 text-slate-400' : 'border-black/10 text-slate-500'
                  }`}
                >
                  <span>180 / 180 Questions</span>
                  <span className="text-teal-400 font-bold">PERMUTED</span>
                </div>
              </div>

              {/* Paper 3: Set C */}
              <div
                onClick={() => setSelectedPaper(3)}
                className={`p-6 rounded-2xl border transition-all cursor-pointer backdrop-blur-2xl ${
                  selectedPaper === 3
                    ? isDark
                      ? 'border-sky-400 shadow-[0_0_35px_rgba(56,189,248,0.25)] bg-sky-400/[0.08] ring-1 ring-sky-400/50'
                      : 'border-sky-500 shadow-[0_0_25px_rgba(56,189,248,0.18)] bg-white/80 ring-1 ring-sky-500/40'
                    : isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-white/25 hover:bg-white/[0.06] shadow-lg'
                    : 'bg-white/60 border-black/10 hover:border-slate-400 hover:bg-white/80 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 backdrop-blur-md">
                    PAPER 03 &bull; RESERVE (SET C)
                  </span>
                  <span className="text-xs font-bold text-sky-400">100% Extracted</span>
                </div>
                <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-black'}`}>
                  National Paper 3
                </h3>
                <p className={`text-xs mt-1 mb-4 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  180 emergency reserve questions locked under Shamir quorum.
                </p>

                <div className={`w-full rounded-full h-1.5 mb-4 ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                  <div className="bg-sky-400 h-1.5 rounded-full w-full shadow-[0_0_8px_#38bdf8]" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Physics:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Chemistry:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Botany:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                  <div
                    className={`p-2 rounded-lg border flex justify-between backdrop-blur-md ${
                      isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white/70'
                    }`}
                  >
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Zoology:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>45Q</span>
                  </div>
                </div>

                <div
                  className={`mt-4 pt-3 border-t flex justify-between text-[11px] font-mono ${
                    isDark ? 'border-white/10 text-slate-400' : 'border-black/10 text-slate-500'
                  }`}
                >
                  <span>180 / 180 Questions</span>
                  <span className="text-sky-400 font-bold">AIRGAP LOCKED</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Architectural Defense Pillars: Frosted Glass */}
          <div id="quorum" className="space-y-8 text-left">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#00cc5f] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Cryptographic Immunity</span>
              </span>
              <h2 className={`text-3xl sm:text-4xl font-bold tracking-[-0.03em] ${isDark ? 'text-white' : 'text-[#0E0E0E]'}`}>
                Eliminating Single Points of Failure
              </h2>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                ZeroLeak replaces vulnerable paper logistics with multi-party cryptography, automated biometric consensus, and live hardware attestation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
              {/* Pillar 1 */}
              <div
                className={`p-6 rounded-2xl border transition-all backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-[#00cc5f]/70 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(0,204,95,0.2)] hover:-translate-y-1'
                    : 'bg-white/60 border-black/10 hover:border-[#00cc5f] hover:bg-white/90 shadow-sm hover:-translate-y-1'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-[#00cc5f] flex items-center justify-center mb-4 backdrop-blur-md">
                  <Shuffle className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-base mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  Combinatorial Synthesis
                </h3>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Source pools are permuted with maximum 40% overlap per source, balancing difficulty and subject quota mathematically.
                </p>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 text-xs font-semibold text-[#00cc5f]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Zero Single-Source Dependence</span>
                </div>
              </div>

              {/* Pillar 2 */}
              <div
                className={`p-6 rounded-2xl border transition-all backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-teal-400/70 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(45,212,191,0.2)] hover:-translate-y-1'
                    : 'bg-white/60 border-black/10 hover:border-teal-500 hover:bg-white/90 shadow-sm hover:-translate-y-1'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center mb-4 backdrop-blur-md">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-base mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  (3, 5) Shamir Quorum
                </h3>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Master AES-256 key is split across 5 custodians. Decryption gate opens strictly 15 minutes before the exam upon biometric consensus.
                </p>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 text-xs font-semibold text-teal-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Timed Multi-Signatory Release</span>
                </div>
              </div>

              {/* Pillar 3 */}
              <div
                id="proctor"
                className={`p-6 rounded-2xl border transition-all backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-sky-400/70 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(56,189,248,0.2)] hover:-translate-y-1'
                    : 'bg-white/60 border-black/10 hover:border-sky-500 hover:bg-white/90 shadow-sm hover:-translate-y-1'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center mb-4 backdrop-blur-md">
                  <ScanFace className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-base mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  Optical Anti-Surfing Guard
                </h3>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Continuous 30 FPS WebRTC face detection ensures strictly single-operator presence and blurs screens on shoulder surfing.
                </p>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 text-xs font-semibold text-sky-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Instant Face Redaction</span>
                </div>
              </div>

              {/* Pillar 4 */}
              <div
                className={`p-6 rounded-2xl border transition-all backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-amber-400/70 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(251,191,36,0.2)] hover:-translate-y-1'
                    : 'bg-white/60 border-black/10 hover:border-amber-500 hover:bg-white/90 shadow-sm hover:-translate-y-1'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center mb-4 backdrop-blur-md">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-base mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  Forensic Steganography
                </h3>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Invisible cryptographic canaries in question margins trace leaked camera photos to candidate and test center in under 2 seconds.
                </p>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Sub-Second Traceback</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Clearance Gateways: Translucent Panels */}
          <div id="gateways" className="space-y-6 text-left">
            <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-black'}`}>
              Institutional Clearance Gateways
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
              {/* Operator */}
              <div
                onClick={onOpenLogin}
                className={`p-5 rounded-2xl border transition-all cursor-pointer backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-[#00cc5f] hover:bg-white/[0.07] hover:shadow-[0_0_25px_rgba(0,204,95,0.18)]'
                    : 'bg-white/60 border-black/10 hover:border-[#00cc5f] hover:bg-white/90 shadow-xs'
                }`}
              >
                <span className="text-[10px] font-mono text-[#00cc5f] font-bold tracking-wider">
                  LEVEL 2 &bull; OPERATOR
                </span>
                <div className={`font-bold text-base mt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  Centre Superintendent
                </div>
                <div className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  Station Hardware Binding &bull; Decryption Quorum
                </div>
                <div className="mt-4 text-xs font-semibold text-[#00cc5f] flex items-center gap-1">
                  <span>Sign In to Terminal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Controller */}
              <div
                onClick={onOpenLogin}
                className={`p-5 rounded-2xl border transition-all cursor-pointer backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-teal-400 hover:bg-white/[0.07] hover:shadow-[0_0_25px_rgba(45,212,191,0.18)]'
                    : 'bg-white/60 border-black/10 hover:border-teal-500 hover:bg-white/90 shadow-xs'
                }`}
              >
                <span className="text-[10px] font-mono text-teal-400 font-bold tracking-wider">
                  LEVEL 3 &bull; COMPILER
                </span>
                <div className={`font-bold text-base mt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  Exam Controller
                </div>
                <div className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  3-Paper Blueprint Synthesis &bull; Key Authorization
                </div>
                <div className="mt-4 text-xs font-semibold text-teal-400 flex items-center gap-1">
                  <span>Manager Enclave</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Verifier */}
              <div
                onClick={onOpenLogin}
                className={`p-5 rounded-2xl border transition-all cursor-pointer backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-sky-400 hover:bg-white/[0.07] hover:shadow-[0_0_25px_rgba(56,189,248,0.18)]'
                    : 'bg-white/60 border-black/10 hover:border-sky-500 hover:bg-white/90 shadow-xs'
                }`}
              >
                <span className="text-[10px] font-mono text-sky-400 font-bold tracking-wider">
                  LEVEL 3 &bull; VERIFIER
                </span>
                <div className={`font-bold text-base mt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  Verification Officer
                </div>
                <div className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  Biometric Liveness Audit &bull; Token Binding
                </div>
                <div className="mt-4 text-xs font-semibold text-sky-400 flex items-center gap-1">
                  <span>Officer Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Auditor */}
              <div
                onClick={onOpenLogin}
                className={`p-5 rounded-2xl border transition-all cursor-pointer backdrop-blur-2xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 hover:border-amber-400 hover:bg-white/[0.07] hover:shadow-[0_0_25px_rgba(251,191,36,0.18)]'
                    : 'bg-white/60 border-black/10 hover:border-amber-500 hover:bg-white/90 shadow-xs'
                }`}
              >
                <span className="text-[10px] font-mono text-amber-400 font-bold tracking-wider">
                  LEVEL 1 &bull; AUDITOR
                </span>
                <div className={`font-bold text-base mt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                  Independent Observer
                </div>
                <div className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  Immutable SHA-256 Ledger &bull; Forensic Leak Trace
                </div>
                <div className="mt-4 text-xs font-semibold text-amber-400 flex items-center gap-1">
                  <span>Auditor Access</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
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
