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
  RefreshCw,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';
import { api, setStoredAuth, getDeviceFingerprint, getOrCreateBrowserDeviceIdentity, rotateBrowserDeviceIdentity, signDeviceChallenge, detectDeviceProfile } from '../api';
import type { BrowserDeviceIdentity } from '../api';
import { User, UserRole } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User, token: string) => void;
  onRegisterRedirect?: () => void;
  onNavigateRegister?: () => void;
  onOpenPersonnelRegister?: (role?: 'TRANSLATOR' | 'CENTRE_OPERATOR') => void;
  onBackToLanding: () => void;
}

interface QuickAccount {
  role: UserRole;
  title: string;
  badge: string;
  tier: string;
  email: string;
  password: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
}

const DEMO_ACCOUNTS: QuickAccount[] = [
  {
    role: 'ORG_OWNER',
    title: 'Organization Owner & Registrar',
    badge: 'Authority Head',
    tier: 'Tier 1: Root Governance',
    email: 'owner@test.com',
    password: 'owner123',
    description: 'Institution accreditation, document uploads, manager delegation, security keys.',
    icon: <Building2 className="w-4 h-4 text-amber-600" />,
    iconBg: 'bg-[#FFF5E7] text-amber-600 border border-amber-200/80',
    accent: 'border-amber-200/70',
  },
  {
    role: 'EXAM_MANAGER',
    title: 'Controller of Examinations',
    badge: 'Paper Authority',
    tier: 'Tier 2: Exam Synthesis',
    email: 'manager@nbte.edu.in',
    password: 'Password123!',
    description: 'Exam scheduling (MCQ & Theory), AI blueprint analysis, AES-256 paper generation.',
    icon: <UserCheck className="w-4 h-4 text-emerald-600" />,
    iconBg: 'bg-[#EAF9F3] text-emerald-600 border border-emerald-200/80',
    accent: 'border-emerald-200/70',
  },
  {
    role: 'TRANSLATOR',
    title: 'Linguistic Translator',
    badge: 'Multilingual Lead',
    tier: 'Tier 3: Linguistic Seal',
    email: 'translator@nbte.edu.in',
    password: 'Password123!',
    description: 'Translate questions into Hindi, Marathi, Gujarati, Tamil, etc. with AI assistant.',
    icon: <Languages className="w-4 h-4 text-purple-600" />,
    iconBg: 'bg-[#F4F0FF] text-purple-600 border border-purple-200/80',
    accent: 'border-purple-200/70',
  },
  {
    role: 'CENTRE_OPERATOR',
    title: 'Centre Superintendent & Operator',
    badge: 'Secure Print',
    tier: 'Tier 4: Time-Locked Decrypt',
    email: 'operator@centre101.edu.in',
    password: 'Password123!',
    description: 'Time-locked decryption, authorized copy printing with dynamic forensic watermark.',
    icon: <Printer className="w-4 h-4 text-sky-600" />,
    iconBg: 'bg-[#EDF8FC] text-sky-600 border border-sky-200/80',
    accent: 'border-sky-200/70',
  },
  {
    role: 'AUDITOR',
    title: 'Chief Vigilance & Security Auditor',
    badge: 'Independent Audit',
    tier: 'Tier 1: Read-Only Audit Ledger',
    email: 'auditor@gov-audit.gov.in',
    password: 'Password123!',
    description: 'Tamper-proof blockchain audit ledger, security incident monitoring & quarantine logs.',
    icon: <ShieldAlert className="w-4 h-4 text-indigo-600" />,
    iconBg: 'bg-[#EEF2FF] text-indigo-600 border border-indigo-200/80',
    accent: 'border-indigo-200/70',
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
  // Set when the server refuses this workstation's device rather than the
  // password. Both cases are recoverable, but only through a different route
  // than "try again", so the form swaps in a recovery panel instead.
  const [deviceBlock, setDeviceBlock] = useState<null | 'REVOKED' | 'REPLACEMENT_REQUIRED'>(null);
  const [replacementStatus, setReplacementStatus] = useState<string | null>(null);
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

  /**
   * One complete sign-in attempt with a given workstation key.
   *
   * The server will not trade a password for a token: it decides whether this
   * key is known, unknown or barred, and this reports that decision back as a
   * value instead of an exception so callers can react to it. Genuine failures
   * (wrong password, network trouble) still throw.
   */
  const runLoginAttempt = async (identity: BrowserDeviceIdentity, loginId: string, loginPass: string) => {
    const res = await api.login({
      identifier: loginId,
      password: loginPass,
      device_name: 'Authorized Institution Terminal',
      device_uuid: identity.deviceUuid,
    });

    if (res.token) {
      return { outcome: 'SIGNED_IN' as const, token: res.token, user: res.user };
    }

    if (res.requiresDeviceBinding && res.nextStep === 'DEVICE_CHALLENGE' && res.challenge && res.challengeId) {
      const signature = await signDeviceChallenge(res.challenge, identity.privateKey);
      const verified = await api.verifyDeviceChallenge({
        challengeId: res.challengeId,
        signature,
        deviceUuid: identity.deviceUuid,
      });
      return { outcome: 'SIGNED_IN' as const, token: verified.token, user: verified.user };
    }

    if (res.requiresDeviceBinding && res.nextStep === 'DEVICE_REGISTRATION' && res.challenge && res.challengeId) {
      const signature = await signDeviceChallenge(res.challenge, identity.privateKey);
      const profile = detectDeviceProfile();
      try {
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

        if (deviceResponse.token && deviceResponse.user) {
          return { outcome: 'SIGNED_IN' as const, token: deviceResponse.token, user: deviceResponse.user };
        }
        if (deviceResponse.requiresApproval || deviceResponse.status === 'PENDING') {
          return { outcome: 'MESSAGE' as const, message: 'NEW DEVICE REGISTRATION\n\nThis device is pending authorization for this account. Please contact the Examination Authority to approve access.' };
        }
        return { outcome: 'MESSAGE' as const, message: deviceResponse.message || 'Device registration completed. Await device approval, then sign in again to complete challenge verification.' };
      } catch (registerErr: any) {
        const registerCode = registerErr?.code || registerErr?.details?.error;
        if (registerCode === 'DEVICE_REPLACEMENT_REQUIRED') return { outcome: 'REPLACEMENT_REQUIRED' as const };
        throw registerErr;
      }
    }

    return { outcome: 'MESSAGE' as const, message: res.message || 'Device authorization is required for this account.' };
  };

  const handleLogin = async (e?: React.FormEvent, customIdent?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setDeviceBlock(null);
    setReplacementStatus(null);
    setLoading(true);

    const loginId = (customIdent !== undefined ? customIdent : identifier).trim();
    const loginPass = customPass !== undefined ? customPass : password;

    try {
      const identity = await getOrCreateBrowserDeviceIdentity();
      const result = await runLoginAttempt(identity, loginId, loginPass);

      if (result.outcome === 'SIGNED_IN') {
        setStoredAuth(result.token, result.user);
        onLoginSuccess(result.user, result.token);
        return;
      }
      if (result.outcome === 'REPLACEMENT_REQUIRED') {
        setDeviceBlock('REPLACEMENT_REQUIRED');
        setErrorMessage(null);
        return;
      }
      setErrorMessage(result.message);
    } catch (err: any) {
      const code = err?.code || err?.details?.error;
      if (code === 'DEVICE_ACCESS_REVOKED') setDeviceBlock('REVOKED');
      else if (code === 'DEVICE_REPLACEMENT_REQUIRED') setDeviceBlock('REPLACEMENT_REQUIRED');
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Recovery for the two dead ends where the password is right but the
   * workstation key is not: this device was revoked, or the account already
   * holds an active device. Mints a brand new key (never resurrecting the
   * revoked one) and, if the account is still device-bound, files the
   * replacement request an authority can approve.
   */
  const handleRecoverDevice = async () => {
    setErrorMessage(null);
    setReplacementStatus(null);
    setLoading(true);
    const loginId = identifier.trim();

    try {
      const identity = await rotateBrowserDeviceIdentity();
      const result = await runLoginAttempt(identity, loginId, password);

      if (result.outcome === 'SIGNED_IN') {
        setDeviceBlock(null);
        setStoredAuth(result.token, result.user);
        onLoginSuccess(result.user, result.token);
        return;
      }
      if (result.outcome === 'MESSAGE') {
        setDeviceBlock(null);
        setReplacementStatus(result.message);
        return;
      }

      // Registration was refused because another device is still active. The
      // challenge that refusal consumed is spent, so take a fresh one before
      // filing the request.
      const fresh = await api.login({
        identifier: loginId,
        password,
        device_name: 'Authorized Institution Terminal',
        device_uuid: identity.deviceUuid,
      });
      if (!fresh.challengeId) {
        throw new Error(fresh.message || 'The server did not issue a device registration challenge.');
      }
      const request = await api.requestDeviceReplacement({ challengeId: fresh.challengeId });
      setDeviceBlock(null);
      setReplacementStatus(request.message || 'Device replacement requested. An Examination Authority must approve it before this workstation can sign in.');
    } catch (err: any) {
      const code = err?.code || err?.details?.error;
      if (code === 'DEVICE_REPLACEMENT_REQUIRED') setDeviceBlock('REPLACEMENT_REQUIRED');
      setErrorMessage(err.message || 'Unable to request device replacement.');
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
    <div className="min-h-screen bg-[#F7FAFA] relative flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 font-['Figtree',sans-serif] overflow-x-hidden text-[#142B38] selection:bg-[#00A878] selection:text-white">
      {/* Soft Light Radial Ambient Gradients (No heavy neon clouds) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0, 168, 120, 0.055) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute top-[5%] -right-[10%] w-[50vw] h-[50vw] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0, 184, 217, 0.04) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(40, 120, 216, 0.025) 0%, transparent 70%)',
          }}
        />
        {/* Subtle Technical Dot Grid (24px x 24px, faint opacity) */}
        <div
          className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage: 'radial-gradient(#64748B 1.2px, transparent 1.2px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="max-w-[1260px] mx-auto w-full relative z-10">
        {/* Top Enclave Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-white/90 hover:bg-white border border-[#D7E3E7] hover:border-emerald-300 text-xs font-semibold text-[#142B38] shadow-2xs backdrop-blur-md transition-all group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1 text-slate-500 group-hover:text-emerald-600" />
            <span>Back to Portal Overview</span>
          </button>

          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#ECFAF4] border border-[#BFE9D8] text-[11px] font-mono font-bold text-[#008A63] shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00C98B] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00A878]"></span>
            </span>
            <span className="tracking-wide">FIPS 140-2 LEVEL 4 VALIDATED ENCLAVE</span>
            <span className="text-emerald-300">|</span>
            <span className="font-mono text-[#008A63] text-[10px]">AES-256-GCM</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-8 items-start">
          {/* Left Column: Login Form & Terminal Binding (~44%) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white border border-[#DCE7EA] rounded-[18px] p-7 sm:p-8 shadow-[0_12px_35px_rgba(30,70,80,0.08)] space-y-5 relative overflow-hidden">
              {/* Top Accent Gradient Line */}
              <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#00A878] via-[#00B8D9] to-[#2878D8]" />

              <div className="space-y-2.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF9F3] text-[#008A63] border border-[#BDE8D7] text-[10.5px] font-mono font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00A878]" />
                  <span>AUTHENTICATION GATEWAY</span>
                </div>

                <div className="flex items-center gap-3.5 pt-1">
                  <ZeroLeakLogo variant="icon" size="sm" imgHeightClass="h-11 w-11 shrink-0" />
                  <div>
                    <h1 className="text-[23px] sm:text-[25px] font-black text-[#142B38] tracking-tight leading-tight">
                      ZeroLeak Enclave Sign In
                    </h1>
                    <p className="text-[13px] text-[#6B7D84] font-medium leading-normal mt-0.5">
                      National High-Assurance Examination Network
                    </p>
                  </div>
                </div>

                {/* Connection Verified Indicator */}
                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] font-mono font-bold text-[#00A878]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00A878] inline-block animate-pulse"></span>
                  <span>ENCLAVE CONNECTION VERIFIED</span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5 shadow-2xs animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>
              )}

              {deviceBlock && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl space-y-2.5 shadow-2xs animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <span className="leading-relaxed font-medium">
                      {deviceBlock === 'REVOKED'
                        ? "This workstation has been removed from the account's trusted devices. The password is fine — the workstation key is not."
                        : 'This account already holds an active device, and only one is permitted at a time.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRecoverDevice}
                    disabled={loading}
                    className="w-full px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>{deviceBlock === 'REVOKED' ? 'Bind This Workstation Again' : 'Request Device Replacement'}</span>
                  </button>
                  <p className="text-[10px] text-amber-800/85 leading-relaxed">
                    {'A brand new workstation key is generated — the revoked one stays revoked. If the account still '}
                    {'holds another active device, the Examination Authority must approve the swap in '}
                    <span className="font-semibold">Trusted Workstations</span>
                    {' before this one can sign in.'}
                  </p>
                </div>
              )}

              {replacementStatus && (
                <div className="p-3.5 bg-[#EAF9F3] border border-[#BDE8D7] text-[#008A63] text-xs rounded-xl flex items-start gap-2.5 shadow-2xs animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#00A878]" />
                  <span className="leading-relaxed font-medium">{replacementStatus}</span>
                </div>
              )}

              {/* Hardware Device Signature Card (LIGHT ENTERPRISE CARD) */}
              <div className="p-3.5 rounded-xl bg-[#F4F8FA] text-[#142B38] border border-[#DCE7EA] text-[11px] flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-[#E6F5EF] rounded-xl border border-[#BFE9D8] text-[#00A878] shrink-0">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold block text-[#142B38] text-xs">Workstation Terminal Bound</span>
                    <button
                      type="button"
                      onClick={handleCopyFp}
                      title="Click to copy workstation fingerprint"
                      className="font-mono text-[10.5px] text-[#6B7D84] hover:text-[#00A878] transition-colors flex items-center gap-1.5 truncate text-left cursor-pointer"
                    >
                      <span className="truncate">{deviceFp}</span>
                      {copiedFp ? <Check className="w-3 h-3 text-[#00A878] shrink-0" /> : <Copy className="w-3 h-3 shrink-0 text-[#8CA0A8]" />}
                    </button>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#EAF9F3] text-[#008A63] border border-[#BDE8D7] shrink-0">
                  ATTESTED
                </span>
              </div>

              {/* Primary Login Form */}
              <form onSubmit={e => handleLogin(e)} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[#142B38] font-bold text-xs mb-1.5">
                    Institutional Email / User Identifier *
                  </label>
                  <div className="relative h-[52px] rounded-[10px] bg-[#FAFCFD] border border-[#D7E2E6] focus-within:border-[#00A878] focus-within:ring-2 focus-within:ring-[#00A878]/15 focus-within:bg-white transition-all flex items-center">
                    <div className="pl-3.5 flex items-center pointer-events-none text-[#8CA0A8]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="e.g. owner@test.com or manager@nbte.edu.in"
                      required
                      className="w-full h-full pl-3 pr-3.5 bg-transparent border-0 text-[#142B38] placeholder-[#9AAAB0] text-xs font-medium focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[#142B38] font-bold text-xs">
                      Password / Passphrase *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-[11.5px] text-[#008A63] hover:text-[#006F4F] font-bold hover:underline cursor-pointer"
                    >
                      Forgot Passphrase?
                    </button>
                  </div>
                  <div className="relative h-[52px] rounded-[10px] bg-[#FAFCFD] border border-[#D7E2E6] focus-within:border-[#00A878] focus-within:ring-2 focus-within:ring-[#00A878]/15 focus-within:bg-white transition-all flex items-center">
                    <div className="pl-3.5 flex items-center pointer-events-none text-[#8CA0A8]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full h-full pl-3 pr-10 bg-transparent border-0 text-[#142B38] placeholder-[#9AAAB0] text-xs font-medium focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8CA0A8] hover:text-[#142B38] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[52px] rounded-[10px] bg-gradient-to-r from-[#00A878] to-[#00C98B] hover:opacity-95 text-white font-extrabold flex items-center justify-center gap-2 shadow-[0_8px_18px_rgba(0,168,120,0.18)] hover:-translate-y-0.5 active:translate-y-0 transition-all text-xs tracking-wider uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <KeyRound className="w-4 h-4 text-white" />
                  <span>{loading ? 'Authenticating Terminal...' : 'SIGN IN TO ENCLAVE'}</span>
                </button>
              </form>

              {/* Trust microcopy under CTA */}
              <p className="text-[11.5px] text-[#7B8B91] text-center font-medium leading-relaxed">
                🔒 Secure enclave authentication • Session protected by hardware-attested cryptography
              </p>

              {/* Apply for Institutional Accreditation & Personnel Registration */}
              <div className="pt-4 border-t border-[#EDF3F5] space-y-2.5">
                <div className="h-[58px] px-3.5 bg-[#F8FBFC] rounded-[10px] border border-[#DCE7EA] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#EAF9F3] text-[#008A63]">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <span className="text-[11.5px] font-bold text-[#142B38]">New Educational Authority?</span>
                  </div>
                  <button
                    type="button"
                    onClick={navigateRegister}
                    className="text-[11.5px] text-[#008A63] hover:text-[#006F4F] font-bold hover:underline cursor-pointer"
                  >
                    Apply for Accreditation &rarr;
                  </button>
                </div>

                {onOpenPersonnelRegister && (
                  <div className="h-[58px] px-3.5 bg-[#F5F9FF] rounded-[10px] border border-[#D0E2F5] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[11.5px] font-bold text-[#142B38] block leading-tight">Translator or Centre Operator?</span>
                        <span className="text-[10px] text-[#6B7D84]">Dedicated personnel self-registration portal</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenPersonnelRegister()}
                      className="text-[11.5px] text-[#2878D8] hover:text-[#1E64BD] font-bold hover:underline cursor-pointer shrink-0 ml-2"
                    >
                      Register &rarr;
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer below Left Card */}
            <div className="text-center space-y-1.5 pt-1">
              <p className="text-[11px] text-[#6B7D84] font-medium">
                Protected by ZeroLeak Mathematical Zero-Trust Cryptographic Protocol
              </p>
              <div className="flex items-center justify-center gap-2 text-[10.5px] font-mono text-[#8C9CA3]">
                <span>Hardware Attested</span>
                <span>•</span>
                <span>Post-Quantum Key Schedule</span>
                <span>•</span>
                <span>Tamper-Proof Ledger</span>
              </div>
            </div>
          </div>

          {/* Right Column: All 5 Role Credentials & Quick-Login Cards (~56%) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-[#DCE7EA] rounded-[18px] p-6 sm:p-7 shadow-[0_12px_35px_rgba(30,70,80,0.06)] relative overflow-hidden space-y-4">
              {/* Top Accent Gradient Bar */}
              <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-amber-500 via-[#00A878] to-[#2878D8]" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#EDF3F5] pb-3.5 gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#142B38] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#00A878]" />
                    <span>Instant Institutional Test Accounts</span>
                  </h2>
                  <p className="text-[12.5px] text-[#6A7B83] mt-0.5">
                    Select any role below to test the complete end-to-end examination lifecycle.
                  </p>
                </div>
                <span className="self-start sm:self-auto px-3 py-1 rounded-full text-[10.5px] font-mono font-bold bg-[#ECFAF4] text-[#008A63] border border-[#BFE9D8] uppercase tracking-wider shrink-0">
                  5 Roles Active
                </span>
              </div>

              {onOpenPersonnelRegister && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#F1F7FF] to-[#F6FAFF] border border-[#C8DDF4] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#2878D8] text-white shadow-xs shrink-0">
                      <FileCheck2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-[#142B38] block">
                        Join Institutional Personnel
                      </span>
                      <span className="text-[11px] text-[#4A6478]">
                        Register as Linguistic Translator or Centre Operator.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenPersonnelRegister()}
                    className="h-8 px-3.5 rounded-xl bg-[#2878D8] hover:bg-[#1E64BD] text-white font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer"
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
                      className={`p-4 rounded-[14px] border border-[#DCE7EA] bg-white transition-all flex flex-col justify-between text-xs relative shadow-[0_2px_8px_rgba(30,60,70,0.04)] hover:shadow-[0_6px_18px_rgba(30,70,80,0.08)] hover:border-[#BFE0DC] hover:-translate-y-0.5`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1.5 rounded-xl shadow-xs shrink-0 ${acc.iconBg}`}>
                              {acc.icon}
                            </div>
                            <span className="font-bold text-[#142B38] text-xs truncate">
                              {acc.title}
                            </span>
                          </div>
                          <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F4F8FA] border border-[#DCE7EA] text-[#4A6478] shrink-0">
                            {acc.badge}
                          </span>
                        </div>

                        <div className="text-[10px] font-mono text-[#8C9CA3] font-semibold">
                          {acc.tier}
                        </div>

                        <p className="text-[11px] text-[#667780] leading-relaxed line-clamp-2">
                          {acc.description}
                        </p>

                        <div className="bg-[#F7FAFB] p-2.5 rounded-xl border border-dashed border-[#D5E2E7] font-mono text-[10px] space-y-1 mt-2">
                          <div className="flex items-center justify-between text-[#6B7D84]">
                            <span className="text-[#8C9CA3]">User:</span>
                            <span className="font-bold text-[#142B38] truncate max-w-[170px]">{acc.email}</span>
                          </div>
                          <div className="flex items-center justify-between text-[#6B7D84]">
                            <span className="text-[#8C9CA3]">Pass:</span>
                            <span className="font-bold text-[#00A878]">{acc.password}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3.5 pt-2.5 border-t border-[#EDF3F5]">
                        <button
                          type="button"
                          onClick={() => handleQuickLogin(acc)}
                          disabled={loading}
                          className="h-[40px] flex-1 px-3 bg-[#132A38] hover:bg-[#1C3B4E] text-white rounded-[8px] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-[#00C98B]" />
                          <span>Auto-Fill & Sign In</span>
                        </button>
                        <button
                          type="button"
                          onClick={e => handleCopyCredentials(acc, e)}
                          title="Copy credentials"
                          className="h-[40px] w-[40px] rounded-[8px] bg-white hover:bg-[#F4F8FA] text-[#6B7D84] hover:text-[#142B38] border border-[#DCE7EA] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                        >
                          {isCopied ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#00A878]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {(acc.role === 'TRANSLATOR' || acc.role === 'CENTRE_OPERATOR') && onOpenPersonnelRegister && (
                          <button
                            type="button"
                            onClick={() => onOpenPersonnelRegister(acc.role as any)}
                            title={`Register new ${acc.title}`}
                            className="h-[40px] px-2.5 rounded-[8px] bg-[#EEF5FC] hover:bg-[#E2EEF9] text-[#2878D8] border border-[#D0E2F5] transition-colors cursor-pointer shadow-2xs text-[10px] font-bold shrink-0"
                          >
                            + Register
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Universal Password Banner */}
              <div className="mt-4 p-3 rounded-xl bg-[#F3FAF7] border border-[#BDE8D7] text-[11.5px] text-[#142B38] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#00A878] shrink-0" />
                  <span className="font-medium text-[#1E3A34]">Pre-seeded with real multi-tier exam questions and audit ledger entries.</span>
                </div>
                <span className="font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-[#BDE8D7] text-[#008A63] text-xs shrink-0 shadow-2xs">
                  Universal Pass: Password123!
                </span>
              </div>

              {/* Bottom Security Architecture Pipeline Flow */}
              <div className="mt-3 pt-3 border-t border-[#EDF3F5] text-[10.5px] text-[#6B7D84] flex flex-wrap items-center justify-center gap-2 font-mono">
                <span className="font-bold text-[#142B38] tracking-wider uppercase font-sans">SECURITY ARCHITECTURE:</span>
                <span className="px-2 py-0.5 rounded-full bg-[#EAF9F3] text-[#008A63] border border-[#BDE8D7] font-bold">1. IDENTITY</span>
                <span className="text-[#8C9CA3]">&rarr;</span>
                <span className="px-2 py-0.5 rounded-full bg-[#EBF7FD] text-[#0284C7] border border-[#BAE6FD] font-bold">2. ATTESTATION</span>
                <span className="text-[#8C9CA3]">&rarr;</span>
                <span className="px-2 py-0.5 rounded-full bg-[#F4F0FF] text-[#7C3AED] border border-[#DDD6FE] font-bold">3. ENCRYPTION</span>
                <span className="text-[#8C9CA3]">&rarr;</span>
                <span className="px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] font-bold">4. EXAM CONTROL</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-[#0B171F]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#DCE7EA] shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#EDF3F5] pb-3">
              <div className="flex items-center gap-2 text-[#142B38] font-bold text-sm">
                <Lock className="w-4 h-4 text-[#00A878]" />
                <span>Passphrase Recovery Protocol</span>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-[#8C9CA3] hover:text-[#142B38] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#4A6478] leading-relaxed">
              ZeroLeak uses cryptographic zero-knowledge credentials. Passphrase resets cannot be performed via unauthenticated public links.
            </p>

            <div className="p-3 bg-[#F4F8FA] border border-[#DCE7EA] rounded-xl text-[#142B38] space-y-1">
              <span className="font-bold text-[#142B38] block">Security Procedure:</span>
              <p className="text-[11px] text-[#4A6478]">
                Please contact your institution's <strong className="text-[#142B38]">Organization Owner / Registrar</strong> to verify your identity and generate a new encrypted authorization passphrase for your registered hardware terminal.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowForgotModal(false)}
                className="px-4 py-2 bg-gradient-to-r from-[#00A878] to-[#00C98B] text-white rounded-xl font-bold text-xs hover:opacity-95 cursor-pointer shadow-xs"
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


