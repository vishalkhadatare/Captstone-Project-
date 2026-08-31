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
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';
import { api, setStoredAuth, getDeviceFingerprint, getOrCreateBrowserDeviceIdentity, signDeviceChallenge, detectDeviceProfile } from '../api';
import { User, UserRole } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User, token: string) => void;
  onRegisterRedirect?: () => void;
  onNavigateRegister?: () => void;
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
    email: 'owner@nbte.edu.in',
    password: 'Password123!',
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
  onBackToLanding,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [copiedRole, setCopiedRole] = useState<string | null>(null);

  const [repairing, setRepairing] = useState(false);
  const [repairSuccess, setRepairSuccess] = useState<string | null>(null);

  const navigateRegister = onRegisterRedirect || onNavigateRegister;
  const deviceFp = getDeviceFingerprint();

  const handleResetAndRepair = async () => {
    setRepairing(true);
    setErrorMessage(null);
    setRepairSuccess(null);
    try {
      await api.resetDb();
      setRepairSuccess('Database reset and all role accounts re-seeded successfully. You can now login.');
    } catch (err: any) {
      setErrorMessage(`Repair failed: ${err.message}`);
    } finally {
      setRepairing(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent, customIdent?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setRepairSuccess(null);
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto w-full">
        <button
          onClick={onBackToLanding}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Login Form & Organization Link */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-6 sm:p-8 border border-slate-200 rounded-xl shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <ZeroLeakLogo size="sm" />
                <div>
                  <h1 className="text-xl font-extrabold text-slate-950 tracking-tight">
                    ZeroLeak Portal Sign In
                  </h1>
                  <p className="text-[11px] text-slate-500">
                    Cryptographic Examination & Paper Protection System
                  </p>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                  {(errorMessage.includes('malformed') || errorMessage.includes('database') || errorMessage.includes('failed') || errorMessage.includes('Account')) && (
                    <button
                      type="button"
                      onClick={handleResetAndRepair}
                      disabled={repairing}
                      className="text-[11px] font-bold text-rose-800 bg-rose-100 hover:bg-rose-200 px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{repairing ? 'Repairing Database...' : 'Auto-Repair Database & Restore Demo Accounts'}</span>
                    </button>
                  )}
                </div>
              )}

              {repairSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{repairSuccess}</span>
                </div>
              )}

              {/* Hardware Device Signature */}
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-[11px] flex items-center justify-between text-stone-600">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-emerald-900" />
                  <div>
                    <span className="font-semibold block text-slate-900">Physical Workstation Bound</span>
                    <span className="font-mono text-[10px] text-slate-500">{deviceFp}</span>
                  </div>
                </div>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                  TRUSTED
                </span>
              </div>

              {/* Primary Login Form */}
              <form onSubmit={e => handleLogin(e)} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Official Email / Authorized User ID
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="e.g. manager@nbte.edu.in"
                    required
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 focus:outline-hidden text-xs transition-all"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 font-bold">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-[11px] text-emerald-800 hover:text-emerald-950 font-semibold hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 focus:outline-hidden text-xs transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-xs transition-colors text-xs tracking-wide uppercase cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'Authenticating...' : 'LOGIN TO DASHBOARD'}</span>
                </button>
              </form>

              <div className="pt-3 border-t border-slate-100 text-center space-y-2">
                <p className="text-xs text-slate-500">
                  New Examination Authority or University?
                </p>
                <button
                  type="button"
                  onClick={navigateRegister}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-900 font-bold hover:underline cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Register New Educational Organization</span>
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-400">
              Protected by ZeroLeak Mathematical Zero-Trust Cryptographic Protocol
            </p>
          </div>

          {/* Right Column: All 6 Role Credentials & Quick-Login Cards */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                    <span>Instant Institutional Test Accounts</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click <strong>"Auto-Fill & Sign In"</strong> or copy any account to test the complete multi-role workflow.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wider">
                  6 Roles Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DEMO_ACCOUNTS.map(acc => {
                  const isCopied = copiedRole === acc.role;
                  return (
                    <div
                      key={acc.role}
                      className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between text-xs relative ${acc.accent}`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {acc.icon}
                            <span className="font-bold text-slate-900 text-xs">
                              {acc.title}
                            </span>
                          </div>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                            {acc.badge}
                          </span>
                        </div>

                        <p className="text-[10.5px] text-slate-600 leading-snug line-clamp-2">
                          {acc.description}
                        </p>

                        <div className="bg-white/80 p-2 rounded border border-slate-200/80 font-mono text-[10px] space-y-0.5 mt-2">
                          <div className="flex items-center justify-between text-slate-700">
                            <span>User:</span>
                            <span className="font-bold text-slate-900">{acc.email}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-700">
                            <span>Pass:</span>
                            <span className="font-bold text-emerald-800">{acc.password}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200/50">
                        <button
                          type="button"
                          onClick={() => handleQuickLogin(acc)}
                          disabled={loading}
                          className="flex-1 py-1.5 px-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3 text-emerald-400" />
                          <span>Auto-Fill & Sign In</span>
                        </button>
                        <button
                          type="button"
                          onClick={e => handleCopyCredentials(acc, e)}
                          title="Copy credentials"
                          className="p-1.5 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                        >
                          {isCopied ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-[11px] text-emerald-900 flex items-center justify-between">
                <span>All accounts are pre-seeded with sample questions, examinations, and multilingual translations.</span>
                <span className="font-bold underline ml-2 shrink-0">Universal Pass: Password123!</span>
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


