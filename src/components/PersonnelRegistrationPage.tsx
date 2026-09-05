import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  Languages,
  Printer,
  ShieldCheck,
  Building2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  UserCheck,
  Sparkles,
  Copy,
  Check,
  KeyRound,
  ArrowRight,
  GraduationCap,
  Briefcase,
  MapPin,
  Laptop,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';
import {
  api,
  setStoredAuth,
  getOrCreateBrowserDeviceIdentity,
  signDeviceChallenge,
  detectDeviceProfile,
  getDeviceFingerprint,
} from '../api';
import { User, UserRole } from '../types';

interface PersonnelRegistrationPageProps {
  onRegistrationSuccess?: (user: User, token: string) => void;
  onLoginRedirect?: () => void;
  onNavigateLogin?: () => void;
  onBackToLanding: () => void;
  preSelectedRole?: 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR';
}

type PersonnelRole = 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR';

interface RoleMeta {
  role: PersonnelRole;
  title: string;
  badge: string;
  icon: React.ReactNode;
  tagline: string;
  description: string;
  accentBorder: string;
  accentBg: string;
  badgeColor: string;
}

const ROLES: RoleMeta[] = [
  {
    role: 'SME',
    title: 'Subject Matter Expert (SME)',
    badge: 'Question Vetting & Audit',
    icon: <FileCheck2 className="w-5 h-5 text-blue-700" />,
    tagline: 'Syllabus compliance, correctness validation, answer key review & eligibility sign-off.',
    description: 'Accredited academic experts who independently review question pools, verify answer keys, calculate difficulty indexes, and sign cryptographic eligibility certificates.',
    accentBorder: 'border-blue-300 hover:border-blue-500',
    accentBg: 'bg-blue-50/60',
    badgeColor: 'bg-blue-100 text-blue-900 border-blue-200',
  },
  {
    role: 'TRANSLATOR',
    title: 'Linguistic Translator',
    badge: 'Multilingual Lead',
    icon: <Languages className="w-5 h-5 text-purple-700" />,
    tagline: 'Translate question banks into vernacular languages with AI assistance.',
    description: 'Certified translators responsible for converting master examination questions into Hindi, Marathi, Gujarati, Tamil, and other regional languages while preserving technical accuracy.',
    accentBorder: 'border-purple-300 hover:border-purple-500',
    accentBg: 'bg-purple-50/60',
    badgeColor: 'bg-purple-100 text-purple-900 border-purple-200',
  },
  {
    role: 'CENTRE_OPERATOR',
    title: 'Centre Superintendent & Operator',
    badge: 'Secure Print & Delivery',
    icon: <Printer className="w-5 h-5 text-teal-700" />,
    tagline: 'Time-locked paper decryption, authorized copy printing with dynamic forensic watermark.',
    description: 'Authorized on-site examination centre superintendents who decrypt examination papers inside the time window and oversee tamper-evident biometric printing.',
    accentBorder: 'border-teal-300 hover:border-teal-500',
    accentBg: 'bg-teal-50/60',
    badgeColor: 'bg-teal-100 text-teal-900 border-teal-200',
  },
];

const POPULAR_LANGUAGES = ['Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Urdu'];

export const PersonnelRegistrationPage: React.FC<PersonnelRegistrationPageProps> = ({
  onRegistrationSuccess,
  onLoginRedirect,
  onNavigateLogin,
  onBackToLanding,
  preSelectedRole = 'SME',
}) => {
  const [selectedRole, setSelectedRole] = useState<PersonnelRole>(preSelectedRole);
  const [organizations, setOrganizations] = useState<{ id: string; name: string; type: string; reg_number: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [customOrgName, setCustomOrgName] = useState<string>('');

  // Common Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [designation, setDesignation] = useState('');

  // SME Specific Fields
  const [subjectDomain, setSubjectDomain] = useState('Engineering & Technology');
  const [specialization, setSpecialization] = useState('');
  const [academicDegree, setAcademicDegree] = useState('Ph.D. / Doctorate');
  const [experienceYears, setExperienceYears] = useState('5+ Years');

  // Translator Specific Fields
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['Hindi']);
  const [translationCredential, setTranslationCredential] = useState('University Board Certified');

  // Centre Operator Specific Fields
  const [centreName, setCentreName] = useState('');
  const [centreCode, setCentreCode] = useState('');
  const [centreAddress, setCentreAddress] = useState('');
  const [terminalId, setTerminalId] = useState('');

  // Agreement & Status
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success State
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const navigateLogin = onLoginRedirect || onNavigateLogin;
  const deviceFp = getDeviceFingerprint();

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const res = await api.getPublicOrganizations();
      if (res.organizations && res.organizations.length > 0) {
        setOrganizations(res.organizations);
        setSelectedOrgId(res.organizations[0].id);
      }
    } catch {
      // ignore
    }
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleCopyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your passphrase.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (!ndaAccepted) {
      setErrorMessage('You must acknowledge and accept the Examination Confidentiality & Security Agreement.');
      return;
    }

    if (selectedRole === 'TRANSLATOR' && selectedLanguages.length === 0) {
      setErrorMessage('Please select at least one target translation language.');
      return;
    }

    setLoading(true);

    try {
      const identity = await getOrCreateBrowserDeviceIdentity();
      const selectedOrg = organizations.find(o => o.id === selectedOrgId);
      const payload: any = {
        email: email.trim().toLowerCase(),
        username: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
        role: selectedRole,
        org_id: selectedOrgId || undefined,
        org_name: selectedOrg ? selectedOrg.name : (customOrgName || undefined),
        contact_number: contactNumber.trim(),
        designation: designation.trim() || undefined,
        device_name: `${fullName}'s Institutional Workstation`,
      };

      if (selectedRole === 'SME') {
        payload.specialization = `${subjectDomain}: ${specialization || 'General'}`.trim();
        payload.academic_degree = academicDegree;
        payload.experience_years = experienceYears;
      } else if (selectedRole === 'TRANSLATOR') {
        payload.languages = selectedLanguages.join(', ');
        payload.translation_credential = translationCredential;
      } else if (selectedRole === 'CENTRE_OPERATOR') {
        payload.centre_name = centreName.trim() || undefined;
        payload.centre_code = centreCode.trim() || undefined;
        payload.centre_address = centreAddress.trim() || undefined;
        payload.terminal_id = terminalId.trim() || undefined;
      }

      // 1. Submit Registration
      const regRes = await api.registerPersonnel(payload);

      // 2. Complete Device Challenge if requested
      let authToken: string | undefined = regRes.token;
      let authUser: User | undefined = regRes.user;

      if (!authToken && regRes.challengeId && regRes.challenge) {
        const signature = await signDeviceChallenge(regRes.challenge, identity.privateKey);
        const profile = detectDeviceProfile();
        const deviceResponse = await api.registerDeviceChallenge({
          challengeId: regRes.challengeId,
          signature,
          publicKey: identity.publicKeyPem,
          deviceUuid: identity.deviceUuid,
          device_name: `${fullName}'s Institutional Terminal`,
          device_model: profile.device_model,
          operating_system: profile.operating_system,
          os_version: profile.os_version,
          app_version: profile.app_version,
          attestation_status: 'UNAVAILABLE',
        });

        authToken = deviceResponse.token;
        authUser = deviceResponse.user;
      }

      if (authToken && authUser) {
        setStoredAuth(authToken, authUser);
        setCreatedUser(authUser);
        setCreatedToken(authToken);
      } else if (regRes.user) {
        setCreatedUser(regRes.user);
      }

      setRegistrationComplete(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Personnel registration failed. Please check your institutional details.');
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToWorkspace = () => {
    if (createdUser && createdToken && onRegistrationSuccess) {
      onRegistrationSuccess(createdUser, createdToken);
    } else if (navigateLogin) {
      navigateLogin();
    } else {
      onBackToLanding();
    }
  };

  const currentRoleMeta = ROLES.find(r => r.role === selectedRole)!;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080B11] relative flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-['Figtree',sans-serif] overflow-hidden selection:bg-[#00cc5f] selection:text-white transition-colors duration-300">
      {/* Ambient Glowing Wave Curves Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        <img
          src="/curve-primary.svg"
          alt=""
          className="absolute -top-32 -left-20 w-[950px] max-w-none opacity-40 dark:opacity-30 mix-blend-screen filter blur-[8px] animate-pulse"
          style={{ animationDuration: '9s' }}
        />
        <img
          src="/curve-secondary.svg"
          alt=""
          className="absolute -bottom-40 -right-20 w-[900px] max-w-none opacity-40 dark:opacity-25 mix-blend-screen filter blur-[10px]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,204,95,0.06),transparent_65%)]" />
      </div>

      <div className="max-w-4xl mx-auto w-full relative z-10">
        {/* Top Enclave Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-[#0B0F17]/65 border border-slate-200/90 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-800 dark:hover:text-[#00cc5f] hover:border-emerald-300 dark:hover:border-[#00cc5f]/30 shadow-xs backdrop-blur-xl transition-all group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Portal Overview</span>
          </button>

          <div className="inline-flex items-center gap-2.5 px-3.5 py-1 rounded-full bg-emerald-50/90 dark:bg-[#00cc5f]/10 border border-emerald-200 dark:border-[#00cc5f]/20 text-[11px] font-bold text-emerald-900 dark:text-[#00cc5f] shadow-2xs backdrop-blur-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600 dark:bg-[#00cc5f]"></span>
            </span>
            <span className="tracking-wide">OPERATIONAL PERSONNEL ACCREDITATION PORTAL</span>
          </div>
        </div>

        {/* Success Modal / Card */}
        {registrationComplete ? (
          <div className="stat-card-luxury p-8 sm:p-10 rounded-3xl bg-white/80 dark:bg-[#0B0F17]/65 backdrop-blur-2xl border border-slate-200/90 dark:border-white/15 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500" />

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Accreditation Confirmed
                </span>
                <h1 className="text-2xl font-black text-slate-950 mt-1 tracking-tight">
                  Personnel Registration Successful!
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your cryptographic workstation identity has been enrolled in the institutional enclave registry.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500">Assigned Operational Role:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${currentRoleMeta.badgeColor}`}>
                  {currentRoleMeta.title}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-500">Institutional Login Identifier:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{email}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(email, 'email')}
                    className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-emerald-700 cursor-pointer"
                    title="Copy email"
                  >
                    {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-500">Registered Workstation Fingerprint:</span>
                <span className="font-mono text-[11px] text-slate-600">{deviceFp}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Immediate Workspace Access Granted</p>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  You can proceed directly to your role-specific dashboard to review question pools, manage translation tasks, or operate secure delivery.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleProceedToWorkspace}
                className="w-full sm:flex-1 py-3.5 btn-gradient-emerald text-white rounded-xl font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/30 cursor-pointer"
              >
                <span>ENTER {selectedRole.replace(/_/g, ' ')} WORKSPACE &rarr;</span>
              </button>

              <button
                type="button"
                onClick={navigateLogin}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Go to Sign In Page
              </button>
            </div>
          </div>
        ) : (
          /* Registration Form Shell */
          <div className="stat-card-luxury p-6 sm:p-9 rounded-3xl bg-white/80 dark:bg-[#0B0F17]/65 backdrop-blur-2xl border border-slate-200/90 dark:border-white/15 shadow-2xl space-y-7 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-600 via-purple-600 to-teal-600" />

            {/* Header Lockup */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-white/10 pb-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <ZeroLeakLogo variant="icon" size="sm" imgHeightClass="h-10 w-10" />
                  <div>
                    <h1 className="text-2xl font-black text-slate-950 dark:text-white tracking-tight leading-tight">
                      Examination Personnel Registration
                    </h1>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Accreditation for Subject Matter Experts, Linguistic Translators & Centre Superintendents
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right hidden sm:block">
                <span className="text-[10px] font-bold text-slate-400 block">Already Registered?</span>
                <button
                  type="button"
                  onClick={navigateLogin}
                  className="text-xs text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer"
                >
                  Sign In to Enclave &rarr;
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-start gap-2.5 shadow-2xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span className="leading-relaxed font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Step 1: 3-Role Interactive Selector Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-slate-800 font-black text-xs tracking-tight">
                  STEP 1: SELECT YOUR APPOINTED EXAMINATION ROLE *
                </label>
                <span className="text-[10px] font-bold text-slate-400">Choose 1 of 3 Roles</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {ROLES.map(r => {
                  const isSelected = selectedRole === r.role;
                  return (
                    <div
                      key={r.role}
                      onClick={() => setSelectedRole(r.role)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between text-xs relative ${
                        isSelected
                          ? `${r.accentBorder} ${r.accentBg} ring-2 ring-slate-900/10 shadow-md -translate-y-1`
                          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="p-2 rounded-xl bg-white shadow-2xs">
                            {r.icon}
                          </div>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-900 text-white uppercase tracking-wider">
                              SELECTED
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="font-black text-slate-900 text-xs">{r.title}</h3>
                          <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-md border mt-1 ${r.badgeColor}`}>
                            {r.badge}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {r.tagline}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-6 text-xs">
              {/* Step 2: Personal & Identification Information */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-slate-900 text-white font-bold text-[11px] flex items-center justify-center">
                    2
                  </div>
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    PERSONAL & CONTACT INFORMATION
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Full Legal Name *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="e.g. Prof. Rajesh Sharma"
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Institutional / Official Email *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="e.g. rsharma@nbte.edu.in"
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Mobile / Contact Number *
                    </label>
                    <input
                      type="text"
                      value={contactNumber}
                      onChange={e => setContactNumber(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Official Designation / Title *
                    </label>
                    <input
                      type="text"
                      value={designation}
                      onChange={e => setDesignation(e.target.value)}
                      placeholder={
                        selectedRole === 'SME'
                          ? 'e.g. Senior Professor / Subject Lead'
                          : selectedRole === 'TRANSLATOR'
                          ? 'e.g. Senior Linguistic Officer'
                          : 'e.g. Centre Superintendent'
                      }
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                    />
                  </div>
                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Enclave Passphrase / Password *
                    </label>
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
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
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

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      Confirm Passphrase *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Institution Affiliation */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-slate-900 text-white font-bold text-[11px] flex items-center justify-center">
                    3
                  </div>
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    INSTITUTIONAL AFFILIATION & ACCREDITED BOARD
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={selectedOrgId ? 'sm:col-span-2' : ''}>
                    <label className="block text-slate-700 font-bold mb-1.5 flex items-center justify-between">
                      <span>Accredited Examination Authority / University *</span>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        AICTE & NIRF Accredited
                      </span>
                    </label>
                    <select
                      value={selectedOrgId}
                      onChange={e => setSelectedOrgId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-semibold"
                    >
                      {organizations.map(org => (
                        <option key={org.id} value={org.id}>
                          {org.name} ({org.type || 'Examination Authority'})
                        </option>
                      ))}
                      <option value="">➕ Other / Enter New Institutional Enclave</option>
                    </select>
                  </div>

                  {!selectedOrgId && (
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Organization / Authority Name *
                      </label>
                      <input
                        type="text"
                        value={customOrgName}
                        onChange={e => setCustomOrgName(e.target.value)}
                        placeholder="e.g. National Board of Technical Examinations"
                        required={!selectedOrgId}
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                      />
                    </div>
                  )}
                </div>

                {/* Selected Organization Badge/Info */}
                {selectedOrgId && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-white border border-slate-200 text-emerald-800 shadow-2xs">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">
                          {organizations.find(o => o.id === selectedOrgId)?.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Accreditation Reference: {organizations.find(o => o.id === selectedOrgId)?.reg_number || 'ENCLAVE-AUTH'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-200 uppercase tracking-wide shrink-0">
                      Verified Enclave
                    </span>
                  </div>
                )}
              </div>

              {/* Step 4: Role-Specific Operational Details */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-slate-900 text-white font-bold text-[11px] flex items-center justify-center">
                      4
                    </div>
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      {selectedRole === 'SME'
                        ? 'SUBJECT MATTER EXPERT CREDENTIALS'
                        : selectedRole === 'TRANSLATOR'
                        ? 'LINGUISTIC TRANSLATOR SPECIALIZATION'
                        : 'EXAMINATION CENTRE CONFIGURATION'}
                    </h2>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${currentRoleMeta.badgeColor}`}>
                    {currentRoleMeta.badge}
                  </span>
                </div>

                {/* SME Specific Controls */}
                {selectedRole === 'SME' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Subject Academic Domain *
                      </label>
                      <select
                        value={subjectDomain}
                        onChange={e => setSubjectDomain(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-semibold"
                      >
                        <option value="Engineering & Technology">Engineering & Technology</option>
                        <option value="Pure & Natural Sciences">Pure & Natural Sciences (Physics, Chem, Math)</option>
                        <option value="Medical & Allied Health">Medical & Allied Health Sciences</option>
                        <option value="Law & Jurisprudence">Law & Judicial Examinations</option>
                        <option value="Humanities & Social Sciences">Humanities & Social Sciences</option>
                        <option value="Commerce, Finance & Banking">Commerce, Finance & Banking</option>
                        <option value="Civil & Public Services">Civil & Public Services General Studies</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Specific Vetting Subject Expertise *
                      </label>
                      <input
                        type="text"
                        value={specialization}
                        onChange={e => setSpecialization(e.target.value)}
                        placeholder="e.g. Advanced Calculus, Quantum Mechanics, Criminal Law"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Highest Academic Qualification *
                      </label>
                      <select
                        value={academicDegree}
                        onChange={e => setAcademicDegree(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-semibold"
                      >
                        <option value="Ph.D. / Doctorate">Ph.D. / Doctorate Degree</option>
                        <option value="Master of Technology / M.E.">M.Tech / M.E. / M.S.</option>
                        <option value="Post Graduate / Master's">Post Graduate / Master of Science / Arts</option>
                        <option value="M.D. / M.S. / Medical PG">M.D. / M.S. / Medical Specialist</option>
                        <option value="LL.M. / Judicial Fellow">LL.M. / Judicial Fellow</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Question Paper Vetting Experience *
                      </label>
                      <select
                        value={experienceYears}
                        onChange={e => setExperienceYears(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-semibold"
                      >
                        <option value="3-5 Years">3 - 5 Years Examination Experience</option>
                        <option value="5-10 Years">5 - 10 Years Examination Experience</option>
                        <option value="10+ Years">10+ Years Senior Examiner Experience</option>
                        <option value="15+ Years">15+ Years Chief Moderator / Paper Setter</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Translator Specific Controls */}
                {selectedRole === 'TRANSLATOR' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Target Translation Languages (Select all applicable) *
                      </label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {POPULAR_LANGUAGES.map(lang => {
                          const isChecked = selectedLanguages.includes(lang);
                          return (
                            <button
                              type="button"
                              key={lang}
                              onClick={() => toggleLanguage(lang)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                isChecked
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {lang} {isChecked ? '✓' : '+'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1.5">
                          Primary Source Language
                        </label>
                        <input
                          type="text"
                          value="English (Standard Master)"
                          disabled
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1.5">
                          Translation Certification / Accreditation *
                        </label>
                        <select
                          value={translationCredential}
                          onChange={e => setTranslationCredential(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-semibold"
                        >
                          <option value="University Board Certified">University Examination Board Certified</option>
                          <option value="Government Bureau of Translation">National Bureau of Translation Accredited</option>
                          <option value="Certified Technical Translator">Certified Technical & Legal Translator</option>
                          <option value="Senior Academic Faculty">Senior Vernacular Academic Faculty</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Centre Operator Specific Controls */}
                {selectedRole === 'CENTRE_OPERATOR' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Examination Centre Name *
                      </label>
                      <input
                        type="text"
                        value={centreName}
                        onChange={e => setCentreName(e.target.value)}
                        placeholder="e.g. Centre 101 - National Engineering College"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Centre Identification Code *
                      </label>
                      <input
                        type="text"
                        value={centreCode}
                        onChange={e => setCentreCode(e.target.value)}
                        placeholder="e.g. CENTRE-101"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Centre Physical Address & City *
                      </label>
                      <input
                        type="text"
                        value={centreAddress}
                        onChange={e => setCentreAddress(e.target.value)}
                        placeholder="e.g. Sector 12, Academic Enclave, Pune, Maharashtra"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5">
                        Certified Primary Terminal / Station ID *
                      </label>
                      <input
                        type="text"
                        value={terminalId}
                        onChange={e => setTerminalId(e.target.value)}
                        placeholder="e.g. TERMINAL-OP-01"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl input-luxury text-slate-900 font-medium font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Step 5: Hardware Signature & Non-Disclosure Agreement */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 text-xs flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-950/80 rounded-xl border border-emerald-500/40 text-emerald-400">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold block text-slate-200">Terminal Fingerprint Auto-Bound</span>
                      <span className="font-mono text-[10px] text-slate-400">{deviceFp}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ECDSA-P256 ATTESTED
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="ndaCheck"
                      checked={ndaAccepted}
                      onChange={e => setNdaAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-amber-300 text-emerald-700 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="ndaCheck" className="text-slate-800 text-xs font-semibold leading-relaxed cursor-pointer">
                      <strong>Examination Non-Disclosure & Security Oath:</strong> I solemnly affirm that all examination blueprints, vetted question banks, translation texts, and decryption keys accessed on this terminal will remain strictly confidential under the Official Examination Secrecy and Leak-Prevention Guidelines.
                    </label>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 btn-gradient-emerald text-white rounded-xl font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4 text-emerald-200" />
                <span>{loading ? 'Registering Cryptographic Terminal...' : `COMPLETE ${selectedRole.replace(/_/g, ' ')} REGISTRATION &rarr;`}</span>
              </button>
            </form>
          </div>
        )}

        {/* Bottom Trust Assurance */}
        <p className="mt-6 text-center text-[11px] text-slate-500 font-medium">
          Protected by ZeroLeak Mathematical Zero-Trust Protocol • National Examination Security Infrastructure
        </p>
      </div>
    </div>
  );
};

