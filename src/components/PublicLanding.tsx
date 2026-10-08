import React, { useEffect, useState } from 'react';
import { ArchiveX, Camera, Check, ClipboardCheck, FileKey2, FileText, KeyRound, LockKeyhole, Menu, Moon, Printer, ScrollText, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';

interface PublicLandingProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenPersonnelRegister?: (role?: 'TRANSLATOR' | 'CENTRE_OPERATOR') => void;
}

type Scenario = {
  title: string;
  protection: string;
  explanation: string;
  image: string;
  icon: React.ElementType;
  iconFill?: boolean;
};

const leftScenarios: Scenario[] = [
  {
    title: 'An insider copies the paper',
    protection: 'Access Control & Monitoring',
    explanation: 'Role-based access, activity tracking and real-time monitoring prevent insider leaks.',
    image: '/scenarios/insider-copying.png',
    icon: UserRound,
  },
  {
    title: 'A hacked server or stolen files',
    protection: 'AES-256-GCM Encryption',
    explanation: 'End-to-end encryption and secure storage protect data from cyberattacks and breaches.',
    image: '/scenarios/hacked-server.png',
    icon: LockKeyhole,
  },
  {
    title: 'A leak at the printing press',
    protection: 'Controlled Printing',
    explanation: 'Secure printing, watermarking and strict access controls stop press leaks.',
    image: '/scenarios/printing-press.png',
    icon: Printer,
  },
];

const rightScenarios: Scenario[] = [
  {
    title: 'A photo or screenshot of the screen',
    protection: 'Anti-Surfing Protection',
    explanation: 'Blocks screenshots, recording and unauthorized capture attempts.',
    image: '/scenarios/screen-photograph.png',
    icon: ShieldCheck,
    iconFill: true,
  },
  {
    title: 'An untraceable leaked copy',
    protection: 'Watermarking & Forensics',
    explanation: 'Invisible and forensic watermarks trace the source of any leak.',
    image: '/scenarios/leaked-copy.png',
    icon: ShieldCheck,
    iconFill: true,
  },
  {
    title: 'Tampered audit logs',
    protection: 'Secure Audit Trail',
    explanation: 'Immutable logs and tamper-proof records prevent log manipulation.',
    image: '/scenarios/tampered-logs.png',
    icon: FileText,
  },
];

const controls = [
  ['01', '3-Paper Synthesis', FileKey2], ['02', 'AES-256-GCM Encryption', LockKeyhole], ['03', 'Shamir Quorum (2-of-3)', KeyRound], ['04', 'Proctored Review', ClipboardCheck],
  ['05', 'Anti-Surfing Protection', Camera], ['06', 'Controlled Printing', Printer], ['07', 'Watermarking & Forensics', ArchiveX], ['08', 'Secure Audit Trail', ScrollText],
] as const;

const ScenarioCard: React.FC<{ scenario: Scenario }> = ({ scenario }) => {
  const ProtectionIcon = scenario.icon;
  return (
    <article className="rounded-xl border border-[#d8e3da] bg-white p-2.5 shadow-[0_2px_10px_rgba(20,50,35,0.04)] transition-all hover:shadow-[0_4px_16px_rgba(20,50,35,0.08)] dark:border-[#22483a] dark:bg-[#10241e] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
      {/* Upper prominent scenario image container */}
      <div className="relative aspect-[242/104] w-full overflow-hidden rounded-lg bg-[#e2ece4] dark:bg-[#18332b]">
        <img
          src={scenario.image}
          alt={scenario.title}
          className="h-full w-full object-cover select-none"
          loading="eager"
        />
        {/* Red X Overlay matching reference design */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg
            className="h-[52px] w-[52px] text-[#ed343b] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
            viewBox="0 0 52 52"
            fill="none"
            stroke="currentColor"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="10" y1="10" x2="42" y2="42" />
            <line x1="42" y1="10" x2="10" y2="42" />
          </svg>
        </div>
      </div>

      {/* Content area */}
      <div className="pt-3 pb-1">
        {/* Title */}
        <h2 className="font-serif text-[13.5px] font-bold leading-[1.25] text-[#133a2c] tracking-[-0.01em] dark:text-[#e4efe6]">
          {scenario.title}
        </h2>

        {/* Badge: LEAK BLOCKED */}
        <div className="mt-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#008058] px-2.5 py-[3px] text-[8.5px] font-black uppercase tracking-[0.06em] text-white shadow-xs">
            <ShieldCheck className="h-3 w-3 stroke-[2.5]" />
            <span>LEAK BLOCKED</span>
          </span>
        </div>

        {/* Protection icon & description */}
        <div className="mt-2.5 flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dcf0e4] text-[#008058] border border-[#c4e5d2] shadow-2xs dark:bg-[#1a382c] dark:border-[#2a5944] dark:text-[#3cd6a3]">
            {scenario.iconFill ? (
              <ProtectionIcon className="h-3.5 w-3.5 fill-[#008058] text-[#dcf0e4] stroke-[1.8] dark:fill-[#3cd6a3] dark:text-[#10241e]" />
            ) : (
              <ProtectionIcon className="h-3.5 w-3.5 stroke-[2.2]" />
            )}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[10px] font-bold leading-tight text-[#008058] tracking-tight dark:text-[#3cd6a3]">
              {scenario.protection}
            </p>
            <p className="mt-1 text-[9px] leading-[1.35] text-[#557566] dark:text-[#9bb7a6]">
              {scenario.explanation}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
};

export const PublicLanding: React.FC<PublicLandingProps> = ({ onOpenLogin, onOpenRegister, onOpenPersonnelRegister }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => typeof window !== 'undefined' && localStorage.getItem('zeroleak_theme') === 'dark' ? 'dark' : 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const isDark = theme === 'dark';
  useEffect(() => { document.documentElement.classList.toggle('dark', isDark); localStorage.setItem('zeroleak_theme', theme); }, [isDark, theme]);
  useEffect(() => { document.querySelector<HTMLElement>('#hero > div')?.classList.add('justify-center'); }, []);

  return (
    <div className={`min-h-screen overflow-x-hidden ${isDark ? 'dark bg-[#0a1713] text-[#f2f8f3]' : 'bg-white text-[#17352b]'} transition-colors duration-300`}>
      <header className={`sticky top-0 z-50 border-b ${isDark ? 'border-[#1c382e] bg-[#0e1f1a]/95' : 'border-[#d7e3d9]/80 bg-white'} backdrop-blur-md transition-colors duration-300`}>
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 lg:px-10">
          <a href="#hero" aria-label="ZeroLeak home">
            <ZeroLeakLogo variant="lockup" size="sm" imgHeightClass="h-9 sm:h-10" />
          </a>
          <nav className={`hidden items-center gap-9 text-[13px] font-semibold tracking-[0.04em] md:flex ${isDark ? 'text-[#a5c4b6]' : 'text-[#446357]'}`}>
            <a href="#hero" className={isDark ? 'text-[#2fe0a0]' : 'text-[#087b55]'}>Home</a>
            <a href="#controls" className={isDark ? 'hover:text-[#2fe0a0]' : 'hover:text-[#087b55]'}>Features</a>
            <a href="#about" className={isDark ? 'hover:text-[#2fe0a0]' : 'hover:text-[#087b55]'}>About</a>
            <a href="#contact" className={isDark ? 'hover:text-[#2fe0a0]' : 'hover:text-[#087b55]'}>Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`rounded-full border p-2 transition-colors ${isDark ? 'border-[#244b3c] bg-[#132c23] text-[#3cd6a3]' : 'border-[#c9d9cc] bg-white text-[#28705a]'}`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={onOpenLogin}
              className="hidden rounded-md bg-[#087b55] px-5 py-2.5 text-xs font-bold tracking-[0.05em] text-white hover:bg-[#076b4a] sm:block"
            >
              Sign In
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`rounded-md border p-2 md:hidden ${isDark ? 'border-[#244b3c] text-white' : 'border-[#c9d9cc] text-[#17352b]'}`}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className={`flex flex-col gap-4 border-t px-5 py-4 text-sm font-semibold md:hidden ${isDark ? 'border-[#1c382e] bg-[#0e1f1a]' : 'border-[#d7e3d9] bg-white'}`}>
            <a href="#hero">Home</a>
            <a href="#controls">Features</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
            <button onClick={onOpenLogin} className="w-fit rounded-md bg-[#087b55] px-4 py-2 text-white">Sign In</button>
          </nav>
        )}
      </header>

      <main id="hero" className="mx-auto max-w-[1440px] px-5 pb-16 pt-10 lg:px-10 lg:pt-14">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(220px,1fr)_minmax(480px,650px)_minmax(220px,1fr)] lg:gap-6 xl:grid-cols-[254px_minmax(520px,650px)_254px] xl:gap-[14px]">
          <div className="order-2 flex flex-col gap-3.5 sm:grid sm:grid-cols-2 lg:order-1 lg:flex lg:flex-col lg:gap-3.5">
            {leftScenarios.map((scenario) => <ScenarioCard key={scenario.title} scenario={scenario} />)}
          </div>

          <article className={`order-1 mx-auto min-h-[720px] w-full max-w-[650px] border px-7 py-7 sm:px-12 sm:py-10 lg:order-2 transition-colors duration-300 ${
            isDark
              ? 'border-[#22483a] bg-[#10241e] text-[#e6f3eb] shadow-[0_22px_50px_rgba(0,0,0,.5)]'
              : 'border-[#c7d9ca] bg-[#fffef9] text-[#17352b] shadow-[0_22px_50px_rgba(32,75,54,.16)]'
          }`}>
            <div className={`flex items-start justify-between border-b pb-4 text-[9px] font-bold uppercase tracking-[0.16em] ${isDark ? 'border-[#1f4235] text-[#86ab9a]' : 'border-[#d4e0d5] text-[#658473]'}`}>
              <span>Ref. No. ZL-NSP-03</span>
              <span>Classified / Secure</span>
              <span>v4.2 / 2026</span>
            </div>
            <div className="flex justify-center py-7">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${isDark ? 'border-[#2e624c] bg-[#142d25] text-[#3cd6a3]' : 'border-[#8ac5a4] text-[#087b55]'}`}>
                <ShieldCheck className="h-7 w-7" />
              </div>
            </div>
            <p className={`text-center text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-[#6bb594]' : 'text-[#4d7965]'}`}>
              National Examination Security Protocol
            </p>
            <h1 className={`mx-auto mt-5 max-w-[540px] text-center font-serif text-[clamp(2rem,4.5vw,3.45rem)] leading-[.99] ${isDark ? 'text-[#f0f7f3]' : 'text-[#133a2c]'}`}>
              The zero-trust defense protocol for <em className={`font-semibold ${isDark ? 'text-[#3cd6a3]' : 'text-[#087b55]'}`}>national question papers.</em>
            </h1>
            <p className={`mx-auto mt-6 max-w-[480px] text-center font-serif text-[15px] leading-7 ${isDark ? 'text-[#a5c7b7]' : 'text-[#557063]'}`}>
              Eliminate paper leaks with algorithmic 3-paper synthesis, secure encryption, controlled printing, proctored protection, and forensic watermarking.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button
                onClick={onOpenLogin}
                className="inline-flex items-center gap-2 rounded-md bg-[#087b55] hover:bg-[#076b4a] px-5 py-3 text-xs font-bold text-white transition-colors"
              >
                <KeyRound className="h-4 w-4" />Access Secure Enclave
              </button>
              <button
                onClick={onOpenRegister}
                className={`inline-flex items-center gap-2 rounded-md border px-5 py-3 text-xs font-bold transition-colors ${
                  isDark ? 'border-[#2d684e] text-[#3cd6a3] hover:bg-[#16382b]' : 'border-[#5da781] text-[#087b55] hover:bg-[#f0f8f4]'
                }`}
              >
                <UserRound className="h-4 w-4" />Register Authority
              </button>
            </div>
            {onOpenPersonnelRegister && (
              <button
                onClick={() => onOpenPersonnelRegister()}
                className={`mx-auto mt-5 block text-xs font-bold underline underline-offset-4 ${isDark ? 'text-[#5ce2ad]' : 'text-[#478067]'}`}
              >
                Personnel Gateway <span aria-hidden="true">→</span>
              </button>
            )}
            <div id="controls" className={`mt-7 border-t pt-6 ${isDark ? 'border-[#1f4235]' : 'border-[#d4e0d5]'}`}>
              <p className={`mb-5 text-center text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-[#6bb594]' : 'text-[#4d7965]'}`}>
                Security Controls
              </p>
              <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                {controls.map(([number, label, Icon]) => (
                  <div key={number} className="text-center">
                    <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border ${isDark ? 'border-[#265541] bg-[#132c23] text-[#3cd6a3]' : 'border-[#a9cdb3] text-[#087b55]'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className={`text-[10px] font-bold leading-4 ${isDark ? 'text-[#c2dfd1]' : 'text-[#345e4c]'}`}>
                      <span className={`mr-1 ${isDark ? 'text-[#6a9782]' : 'text-[#8aa798]'}`}>{number}</span>{label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className={`mt-8 flex items-center justify-between border-t pt-4 text-[9px] font-bold uppercase tracking-[0.12em] ${isDark ? 'border-[#1f4235] text-[#7eab97]' : 'border-[#d4e0d5] text-[#7a9786]'}`}>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className={`h-3.5 w-3.5 ${isDark ? 'text-[#3cd6a3]' : 'text-[#087b55]'}`} />ZeroLeak verified
              </span>
              <span>Page 1 of 1</span>
            </div>
          </article>

          <div className="order-3 flex flex-col gap-3.5 sm:grid sm:grid-cols-2 lg:order-3 lg:flex lg:flex-col lg:gap-3.5">
            {rightScenarios.map((scenario) => <ScenarioCard key={scenario.title} scenario={scenario} />)}
          </div>
        </div>
      </main>

      <section id="about" className={`border-t px-5 py-12 text-center transition-colors duration-300 ${isDark ? 'border-[#1a382c] bg-[#0d1e18]' : 'border-[#d7e3d9] bg-[#edf5ee]'}`}>
        <p className={`text-xs font-bold uppercase tracking-[0.22em] ${isDark ? 'text-[#3cd6a3]' : 'text-[#398063]'}`}>One chain of custody. Zero blind spots.</p>
        <p className={`mx-auto mt-3 max-w-2xl font-serif text-lg ${isDark ? 'text-[#b8d9c9]' : 'text-[#456b58]'}`}>Built for examination authorities who treat every question paper as a national responsibility.</p>
      </section>

      <footer id="contact" className={`flex flex-col items-center justify-between gap-3 px-5 py-6 text-xs transition-colors duration-300 sm:flex-row lg:px-10 ${isDark ? 'border-t border-[#1a382c] bg-[#0a1713] text-[#779e8c]' : 'text-[#718b7a]'}`}>
        <div className="flex items-center gap-2">
          <Check className={`h-4 w-4 ${isDark ? 'text-[#3cd6a3]' : 'text-[#087b55]'}`} />Secure Papers. Stronger Nation.
        </div>
        <span>ZeroLeak National Examination Security Infrastructure</span>
      </footer>
    </div>
  );
};
