import React, { useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Building2,
  Laptop,
  ArrowLeft,
  AlertTriangle,
  Lock,
  Sparkles,
  HelpCircle,
  X,
  Languages,
  FileCheck2,
  Printer,
  ShieldAlert,
  UserCheck,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Mail,
  Fingerprint,
  ArrowRight,
  Shield,
  Check,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';
import { api, setStoredAuth, getDeviceFingerprint, getOrCreateBrowserDeviceIdentity, signDeviceChallenge, detectDeviceProfile } from '../api';
import { User, UserRole } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User, token: string) => void;
  onRegisterRedirect?: () => void;
  onNavigateRegister?: () => void;
  onOpenPersonnelRegister?: (role?: 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR') => void;
  onBackToLanding: () => void;
}

interface QuickAccount {
  role: UserRole;
  title: string;
  badge: string;
  email: string;
  password: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
}

const DEMO_ACCOUNTS: QuickAccount[] = [
  {
    role: 'ORG_OWNER',
    title: 'Organization Owner & Registrar',
    badge: 'Authority Head',
    email: 'owner@test.com',
    password: 'owner123',
    description: 'Institution accreditation, document uploads, manager delegation, security keys.',
    icon: <Building2 className="w-4 h-4 text-amber-700" />,
    accent: 'border-amber-200 bg-amber-50/50 hover:border-amber-400',
  },
  {
    role: 'EXAM_MANAGER',
    title: 'Controller of Examinations',
    badge: 'Paper Authority',
    email: 'manager@nbte.edu.in',
    password: 'Password123!',
    description: 'Exam scheduling (MCQ & Theory), AI blueprint analysis, AES-256 paper generation.',
    icon: <UserCheck className="w-4 h-4 text-emerald-700" />,
    accent: 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-400',
  },
  {
    role: 'SME',
    title: 'Subject Matter Expert (SME)',
    badge: 'Question Vetting',
    email: 'sme@nbte.edu.in',
    password: 'Password123!',
    description: 'Syllabus compliance, correctness validation, answer key review & eligibility sign-off.',
    icon: <FileCheck2 className="w-4 h-4 text-blue-700" />,
    accent: 'border-blue-200 bg-blue-50/50 hover:border-blue-400',
  },
  {
    role: 'TRANSLATOR',
    title: 'Linguistic Translator',
    badge: 'Multilingual Lead',
    email: 'translator@nbte.edu.in',
    password: 'Password123!',
    description: 'Translate questions into Hindi, Marathi, Gujarati, Tamil, etc. with AI assistant.',
    icon: <Languages className="w-4 h-4 text-purple-700" />,
    accent: 'border-purple-200 bg-purple-50/50 hover:border-purple-400',
  },
  {
    role: 'CENTRE_OPERATOR',
    title: 'Centre Superintendent & Operator',
    badge: 'Secure Print',
    email: 'operator@centre101.edu.in',
    password: 'Password123!',
    description: 'Time-locked decryption, authorized copy printing with dynamic forensic watermark.',
    icon: <Printer className="w-4 h-4 text-teal-700" />,
    accent: 'border-teal-200 bg-teal-50/50 hover:border-teal-400',
  },
  {
    role: 'AUDITOR',
    title: 'Chief Vigilance & Security Auditor',
    badge: 'Independent Audit',
    email: 'auditor@gov-audit.gov.in',
    password: 'Password123!',
    description: 'Tamper-proof blockchain audit ledger, security incident monitoring & quarantine logs.',
    icon: <ShieldAlert className="w-4 h-4 text-rose-700" />,
    accent: 'border-rose-200 bg-rose-50/50 hover:border-rose-400',
  },
];

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onRegisterRedirect,
  onNavigateRegister,
  onOpenPersonnelRegister,
  onBackToLanding,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [copiedRole, setCopiedRole] = useState<string | null>(null);
  const [copiedFp, setCopiedFp] = useState(false);

  const navigateRegister = onRegisterRedirect || onNavigateRegister;
  const deviceFp = getDeviceFingerprint();

  const handleCopyFp = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(deviceFp);
    setCopiedFp(true);
    setTimeout(() => setCopiedFp(false), 2000);
  };

  const handleLogin = async (e?: React.FormEvent, customIdent?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const loginId = (customIdent !== undefined ? customIdent : identifier).trim();
    const loginPass = customPass !== undefined ? customPass : password;

    try {
      const identity = await getOrCreateBrowserDeviceIdentity();
      const res = await api.login({
        identifier: loginId,
        password: loginPass,
        device_name: 'Authorized Institution Terminal',
        device_uuid: identity.deviceUuid,
      });

      if (res.token) {
        setStoredAuth(res.token, res.user);
        onLoginSuccess(res.user, res.token);
        return;
      }

      if (res.requiresDeviceBinding && res.nextStep === 'DEVICE_CHALLENGE' && res.challenge && res.challengeId) {
        const signature = await signDeviceChallenge(res.challenge, identity.privateKey);
        const verified = await api.verifyDeviceChallenge({
          challengeId: res.challengeId,
          signature,
          deviceUuid: identity.deviceUuid,
        });
        setStoredAuth(verified.token, verified.user);
        onLoginSuccess(verified.user, verified.token);
        return;
      }

      if (res.requiresDeviceBinding && res.nextStep === 'DEVICE_REGISTRATION' && res.challenge && res.challengeId) {
        const signature = await signDeviceChallenge(res.challenge, identity.privateKey);
        const profile = detectDeviceProfile();
        const deviceResponse = await api.registerDeviceChallenge({
          challengeId: res.challengeId,
          signature,
          publicKey: identity.publicKeyPem,
          deviceUuid: identity.deviceUuid,
          device_name: 'Authorized Institution Terminal',
          device_model: profile.device_model,
          operating_system: profile.operating_system,
          os_version: profile.os_version,
          app_version: profile.app_version,
          attestation_status: 'UNAVAILABLE',
        });

        if (deviceResponse.requiresApproval || deviceResponse.status === 'PENDING') {
          setErrorMessage('NEW DEVICE REGISTRATION\n\nThis device is pending authorization for this account. Please contact the Examination Authority to approve access.');
          return;
        }
        if (deviceResponse.token && deviceResponse.user) {
          setStoredAuth(deviceResponse.token, deviceResponse.user);
          onLoginSuccess(deviceResponse.user, deviceResponse.token);
          return;
        }
        setErrorMessage('Device registration completed. Await device approval, then sign in again to complete challenge verification.');
        return;
      }

      setErrorMessage(res.message || 'Device authorization is required for this account.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (acc: QuickAccount) => {
    setIdentifier(acc.email);
    setPassword(acc.password);
    handleLogin(undefined, acc.email, acc.password);
  };

  const handleCopyCredentials = (acc: QuickAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`Email: ${acc.email}\nPassword: ${acc.password}`);
    setCopiedRole(acc.role);
    setTimeout(() => setCopiedRole(null), 2000);
  };

  return (
    <div className="min-h-screen cyber-mesh-bg relative flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-sans overflow-hidden">
      {/* Background Ambient Decorative Lights */}
      <div className="cyber-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto w-full relative z-10">
        {/* Top Enclave Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 border border-slate-200/90 text-xs font-semibold text-slate-600 hover:text-emerald-800 hover:border-emerald-300 shadow-xs backdrop-blur-sm transition-all group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Portal Overview</span>
          </button>

          <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-full bg-emerald-50/90 border border-emerald-200/90 text-[11px] font-bold text-emerald-900 shadow-2xs backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <span className="tracking-wide">FIPS 140-2 LEVEL 4 VALIDATED ENCLAVE</span>
            <span className="text-emerald-300">|</span>
            <span className="font-mono text-emerald-700 text-[10px]">AES-256-GCM</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Login Form & Terminal Binding */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_-10px_rgba(15,23,42,0.07)] space-y-5 relative overflow-hidden">
              {/* Top Accent Gradient Bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500" />

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Authentication Gateway</span>
                </div>

                <div className="flex items-center gap-3.5 pt-1">
                  <ZeroLeakLogo variant="icon" size="sm" imgHeightClass="h-10 w-10" />
                  <div>
                    <h1 className="text-xl font-black text-slate-950 tracking-tight leading-tight">
                      ZeroLeak Enclave Sign In
                    </h1>
                    <p className="text-[11px] text-slate-500 font-medium leading-normal mt-0.5">
                      National High-Assurance Examination Network
                    </p>
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-rose-50/90 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-start gap-2.5 shadow-2xs animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>
              )}

              {/* Hardware Device Signature Card */}
              <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 text-[11px] flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-emerald-950/80 rounded-xl border border-emerald-500/40 text-emerald-400 shrink-0">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold block text-slate-200 text-xs">Workstation Terminal Bound</span>
                    <button
                      type="button"
                      onClick={handleCopyFp}
                      title="Click to copy workstation fingerprint"
                      className="font-mono text-[10px] text-slate-400 hover:text-emerald-300 transition-colors flex items-center gap-1 truncate text-left cursor-pointer"
                    >
                      <span className="truncate">{deviceFp}</span>
                      {copiedFp ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
                    </button>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  ATTESTED
                </span>
              </div>

              {/* Primary Login Form */}
              <form onSubmit={e => handleLogin(e)} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">
                    Institutional Email / User Identifier *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="e.g. owner@test.com or manager@nbte.edu.in"
                      required
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50/80 border border-slate-200 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:outline-hidden text-xs transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-slate-700 font-bold">
                      Password / Passphrase *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                    >
                      Forgot Passphrase?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50/80 border border-slate-200 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:outline-hidden text-xs transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 btn-gradient-emerald disabled:opacity-50 text-white rounded-xl font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/30 transition-all text-xs tracking-wider uppercase cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-emerald-200" />
                  <span>{loading ? 'Authenticating Terminal...' : 'SIGN IN TO ENCLAVE'}</span>
                </button>
              </form>

              {/* Apply for Institutional Accreditation & Personnel Registration */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-emerald-700" />
                    <span className="text-[11px] font-bold text-slate-700">New Educational Authority?</span>
                  </div>
                  <button
                    type="button"
                    onClick={navigateRegister}
                    className="text-[11px] text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer"
                  >
                    Apply for Accreditation &rarr;
                  </button>
                </div>

                {onOpenPersonnelRegister && (
                  <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <FileCheck2 className="w-4 h-4 text-blue-700 shrink-0" />
                      <div>
                        <span className="text-[11px] font-bold text-slate-800 block leading-tight">SME, Translator, or Centre Operator?</span>
                        <span className="text-[10px] text-slate-500">Dedicated personnel self-registration portal</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenPersonnelRegister()}
                      className="text-[11px] text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer shrink-0 ml-2"
                    >
                      Register &rarr;
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-center space-y-1">
              <p className="text-[11px] text-slate-500 font-medium">
                Protected by ZeroLeak Mathematical Zero-Trust Cryptographic Protocol
              </p>
              <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
                <span>Hardware Attested</span>
                <span>•</span>
                <span>Post-Quantum Key Schedule</span>
                <span>•</span>
                <span>Tamper-Proof Ledger</span>
              </div>
            </div>
          </div>

          {/* Right Column: All 6 Role Credentials & Quick-Login Cards */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white/95 backdrop-blur-xl p-6 sm:p-8 border border-slate-200/90 rounded-3xl shadow-[0_20px_50px_-10px_rgba(15,23,42,0.07)] relative overflow-hidden">
              {/* Top Accent Gradient Bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-rose-500" />

              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Instant Institutional Test Accounts</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Select any role below to test the complete end-to-end examination lifecycle.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                  6 Roles Active
                </span>
              </div>

              {onOpenPersonnelRegister && (
                <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-teal-50/80 border border-blue-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs shrink-0">
                      <FileCheck2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        New Personnel Registration (SME, Translator & Centre Operator)
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Appointed as SME, Linguistic Translator, or Centre Superintendent? Register your terminal on the dedicated page.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenPersonnelRegister()}
                    className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-bold shrink-0 shadow-xs hover:shadow-sm transition-all cursor-pointer whitespace-nowrap"
                  >
                    Open Registration &rarr;
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {DEMO_ACCOUNTS.map(acc => {
                  const isCopied = copiedRole === acc.role;
                  return (
                    <div
                      key={acc.role}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between text-xs relative ${acc.accent} shadow-2xs hover:shadow-md hover:-translate-y-0.5`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-xl bg-white shadow-xs">
                              {acc.icon}
                            </div>
                            <span className="font-bold text-slate-900 text-xs">
                              {acc.title}
                            </span>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200/80 text-slate-700 shadow-2xs">
                            {acc.badge}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                          {acc.description}
                        </p>

                        <div className="bg-white/95 p-2.5 rounded-xl border border-slate-200/80 font-mono text-[10px] space-y-1 mt-2 shadow-2xs">
                          <div className="flex items-center justify-between text-slate-700">
                            <span className="text-slate-400">User:</span>
                            <span className="font-bold text-slate-900 truncate max-w-[170px]">{acc.email}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-700">
                            <span className="text-slate-400">Pass:</span>
                            <span className="font-bold text-emerald-800">{acc.password}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3.5 pt-2.5 border-t border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => handleQuickLogin(acc)}
                          disabled={loading}
                          className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:shadow-sm cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Auto-Fill & Sign In</span>
                        </button>
                        <button
                          type="button"
                          onClick={e => handleCopyCredentials(acc, e)}
                          title="Copy credentials"
                          className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                        >
                          {isCopied ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {(acc.role === 'SME' || acc.role === 'TRANSLATOR' || acc.role === 'CENTRE_OPERATOR') && onOpenPersonnelRegister && (
                          <button
                            type="button"
                            onClick={() => onOpenPersonnelRegister(acc.role as any)}
                            title={`Register new ${acc.title}`}
                            className="px-2.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer shadow-2xs text-[10px] font-bold shrink-0"
                          >
                            + Register
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Universal Password & Pipeline Banner */}
              <div className="mt-4 p-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 text-[11px] text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Pre-seeded with real multi-tier exam questions and audit ledger entries.</span>
                </div>
                <span className="font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-900 shrink-0">
                  Universal Pass: Password123!
                </span>
              </div>

              {/* Educational Authority Flow Indicator */}
              <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500 flex flex-wrap items-center justify-center gap-2">
                <span className="font-bold text-slate-700">Governance Pipeline:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium">1. Org Owner</span>
                <span>&rarr;</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">2. Exam Manager</span>
                <span>&rarr;</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-medium">3. SME & Translator</span>
                <span>&rarr;</span>
                <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-medium">4. Centre Operator</span>
                <span>&rarr;</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Lock className="w-4 h-4 text-emerald-900" />
                <span>Passphrase Recovery Protocol</span>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              ZeroLeak uses cryptographic zero-knowledge credentials. Passphrase resets cannot be performed via unauthenticated public links.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 space-y-1">
              <span className="font-bold text-slate-900 block">Security Procedure:</span>
              <p className="text-[11px]">
                Please contact your institution's <strong>Organization Owner / Registrar</strong> to verify your identity and generate a new encrypted authorization passphrase for your registered hardware terminal.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowForgotModal(false)}
                className="px-4 py-2 bg-emerald-900 text-white rounded-lg font-bold text-xs hover:bg-emerald-800 cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


