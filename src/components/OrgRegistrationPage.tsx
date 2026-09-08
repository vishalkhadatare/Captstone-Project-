import React, { useState } from 'react';
import {
  Building2,
  ShieldCheck,
  Upload,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Laptop,
  KeyRound,
  Lock,
  FileCheck2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';
import { api, setStoredAuth } from '../api';
import { User } from '../types';
import { getOrCreateDeviceKeyPair, exportPublicKeyBase64, signChallengeBase64 } from '../deviceKeys';

interface OrgRegistrationPageProps {
  onRegistrationSuccess?: (user: User, token: string) => void;
  onLoginRedirect?: () => void;
  onNavigateLogin?: () => void;
  onBackToLanding: () => void;
}

// Stage-1 outcome as surfaced to the user. Internal verification substeps
// (OCR / SHA-256 / registry lookups / rule engine) are NEVER shown here.
type VerifyState = 'idle' | 'running' | 'VERIFIED' | 'PENDING_VERIFICATION' | 'VERIFICATION_FAILED';
type BindState = 'idle' | 'binding' | 'completed' | 'error';

interface DocSlot {
  name: string;
  size: number;
  dataUrl: string;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Jammu & Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry',
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Short, user-friendly outcome copy. Deliberately says nothing about the internal
// verification pipeline (documents/OCR/registry/rules) — only what the user should do.
function outcomeCopy(state: VerifyState): { title: string; body: string; tone: 'ok' | 'warn' | 'fail' } {
  if (state === 'VERIFIED') {
    return { title: 'Organization Verified', body: 'Your organization has been verified. Continue to secure your owner workstation.', tone: 'ok' };
  }
  if (state === 'PENDING_VERIFICATION') {
    return {
      title: 'Verification in review',
      body: 'We could not automatically confirm your organization yet. Please make sure your official email uses your institution’s own domain and that your uploaded documents are clear, machine-readable PDFs showing your legal name and registration number, then submit again.',
      tone: 'warn',
    };
  }
  return {
    title: 'Verification failed',
    body: 'We could not verify your organization with the details provided. Please double-check your legal organization name, registration/institution ID, and official institutional email, then submit again.',
    tone: 'fail',
  };
}

export const OrgRegistrationPage: React.FC<OrgRegistrationPageProps> = ({
  onRegistrationSuccess,
  onLoginRedirect,
  onNavigateLogin,
  onBackToLanding,
}) => {
  const navigateLogin = onLoginRedirect || onNavigateLogin;

  // Stepper: EXACTLY two stages.
  const [stage, setStage] = useState<1 | 2>(1);

  // ---- Stage 1: organization + owner details ------------------------------
  const [orgName, setOrgName] = useState('National Board of Technical Examinations');
  const [orgType, setOrgType] = useState('Government Examination Board');
  const [regNumber, setRegNumber] = useState('NBTE/2026/REG-9482');
  const [authId, setAuthId] = useState('AUTH-NBTE-01');
  const [state, setState] = useState('Delhi');
  const [officialEmail, setOfficialEmail] = useState('registrar@nbte.edu.in');
  const [website, setWebsite] = useState('https://nbte.edu.in');
  const [contact, setContact] = useState('+91 11 2338 9000');
  const [address, setAddress] = useState('Institutional Enclave, Sector 5, New Delhi 110001');

  const [repName, setRepName] = useState('Dr. Anand Vardhan Sharma');
  const [repDesignation, setRepDesignation] = useState('Registrar & Controller of Examinations');
  const [repEmail, setRepEmail] = useState('registrar@nbte.edu.in');
  const [repContact, setRepContact] = useState('+91 98765 43210');
  const [password, setPassword] = useState('');

  // Real document uploads (read to base64 data URLs; the file content never
  // leaves as anything other than what the backend hashes + extracts).
  const [estDoc, setEstDoc] = useState<DocSlot | null>(null);       // Organization / Establishment Certificate (optional)
  const [accredDoc, setAccredDoc] = useState<DocSlot | null>(null); // Recognition / Accreditation Document (required)
  const [authRepDoc, setAuthRepDoc] = useState<DocSlot | null>(null); // Authorized Representative Document (required)

  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [stage1Error, setStage1Error] = useState<string | null>(null);

  // ---- Stage 2: owner device / workstation binding ------------------------
  const [bindingToken, setBindingToken] = useState<string | null>(null);
  const [bindState, setBindState] = useState<BindState>('idle');
  const [bindError, setBindError] = useState<string | null>(null);
  const [bindProgress, setBindProgress] = useState<string>('');
  const [completed, setCompleted] = useState<{ user: User; token: string } | null>(null);

  const stage2Unlocked = verifyState === 'VERIFIED' && !!bindingToken;

  const handleDocChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: DocSlot | null) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setter({ name: file.name, size: file.size, dataUrl });
    } catch {
      setStage1Error('That file could not be read. Please try a different file.');
    }
  };

  const handleSubmitStage1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setStage1Error(null);

    if (!orgName.trim() || !regNumber.trim() || !officialEmail.trim() || !state.trim()) {
      setStage1Error('Please complete the required organization details (name, registration ID, state, official email).');
      return;
    }
    if (!repName.trim() || !repEmail.trim()) {
      setStage1Error('Please provide the authorized representative’s name and official email.');
      return;
    }
    if (password.length < 6) {
      setStage1Error('Please set an owner passphrase of at least 6 characters.');
      return;
    }
    if (!accredDoc || !authRepDoc) {
      setStage1Error('Please attach the Recognition / Accreditation document and the Authorized Representative document.');
      return;
    }

    const documents = [
      accredDoc && { doc_type: 'ACCREDITATION_CERTIFICATE', file_name: accredDoc.name, file_size: accredDoc.size, file_data: accredDoc.dataUrl },
      authRepDoc && { doc_type: 'AUTHORIZATION_LETTER', file_name: authRepDoc.name, file_size: authRepDoc.size, file_data: authRepDoc.dataUrl },
      estDoc && { doc_type: 'ESTABLISHMENT_CERTIFICATE', file_name: estDoc.name, file_size: estDoc.size, file_data: estDoc.dataUrl },
    ].filter(Boolean);

    setVerifyState('running');
    try {
      const res = await api.verifyOrganization({
        name: orgName,
        type: orgType,
        reg_number: regNumber,
        auth_id: authId,
        state,
        official_email: officialEmail,
        website,
        address,
        contact,
        rep_name: repName,
        rep_designation: repDesignation,
        rep_contact: repContact,
        rep_email: repEmail,
        account: { email: repEmail, username: repEmail, password, full_name: repName },
        documents,
      });

      if (res.result.status === 'VERIFIED' && res.token && res.user) {
        setBindingToken(res.token);
        setVerifyState('VERIFIED');
        setStage(2);
      } else {
        // PENDING or FAILED → stay in Stage 1, Stage 2 stays locked. No account, no token.
        setVerifyState(res.result.status);
      }
    } catch (err: any) {
      // Includes the "account already exists / please sign in" case from the server.
      setVerifyState('idle');
      setStage1Error(err.message || 'Submission failed. Please try again.');
    }
  };

  const handleBindDevice = async () => {
    if (!bindingToken) return;
    setBindError(null);
    setBindState('binding');
    try {
      setBindProgress('Generating this workstation’s secure device key…');
      const pair = await getOrCreateDeviceKeyPair();
      const publicKey = await exportPublicKeyBase64(pair);

      setBindProgress('Requesting a one-time binding challenge…');
      const { challengeId, challenge } = await api.deviceBindingChallenge(
        { public_key: publicKey, device_name: `${repName || 'Organization Owner'} — Primary Workstation` },
        bindingToken,
      );

      setBindProgress('Signing the challenge on this device…');
      const signature = await signChallengeBase64(pair, challenge);

      setBindProgress('Establishing trusted device binding…');
      const res = await api.deviceBindingVerify({ challengeId, signature }, bindingToken);

      setStoredAuth(res.token, res.user);
      setCompleted({ user: res.user, token: res.token });
      setBindState('completed');
    } catch (err: any) {
      setBindError(err.message || 'Device binding failed. Please try again.');
      setBindState('error');
    }
  };

  const enterDashboard = () => {
    if (completed && onRegistrationSuccess) {
      onRegistrationSuccess(completed.user, completed.token);
    } else if (navigateLogin) {
      navigateLogin();
    }
  };

  const oc = outcomeCopy(verifyState);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto w-full">
        <button
          onClick={onBackToLanding}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to ZeroLeak Overview</span>
        </button>

        <div className="flex justify-center mb-4">
          <ZeroLeakLogo size="md" />
        </div>

        <h2 className="text-center text-2xl font-extrabold text-slate-900 tracking-tight">
          Educational Organization Registration
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500">
          Establish an official, verified examination enclave for your institution.
        </p>

        {/* Two-Stage Stepper (exactly two stages) */}
        <div className="mt-8 mb-6 grid grid-cols-2 gap-3 text-center text-[11px] font-semibold">
          <div
            className={`p-3 rounded-lg border transition-colors ${
              stage === 1 ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 font-bold">
              {verifyState === 'VERIFIED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
              <span>Stage 1</span>
            </div>
            <div className="text-[10px] mt-0.5">Organization Registration &amp; Verification</div>
          </div>
          <div
            className={`p-3 rounded-lg border transition-colors ${
              stage === 2 && stage2Unlocked
                ? 'bg-emerald-900 text-white border-emerald-900'
                : stage2Unlocked
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 font-bold">
              {bindState === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5" /> : stage2Unlocked ? <Laptop className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>Stage 2</span>
            </div>
            <div className="text-[10px] mt-0.5">Owner Device / Workstation Binding</div>
          </div>
        </div>

        {/* ================= STAGE 1 ================= */}
        {stage === 1 && (
          <form onSubmit={handleSubmitStage1} className="bg-white p-6 sm:p-8 border border-slate-200 rounded-xl shadow-xs space-y-6">
            {stage1Error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{stage1Error}</span>
              </div>
            )}

            {/* Non-VERIFIED outcome banner (short, friendly, no internal details) */}
            {(verifyState === 'PENDING_VERIFICATION' || verifyState === 'VERIFICATION_FAILED') && (
              <div
                className={`p-4 rounded-lg border text-xs flex items-start gap-3 ${
                  oc.tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">{oc.title}</div>
                  <p className="mt-0.5 leading-relaxed">{oc.body}</p>
                </div>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">Institutional Details</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">Legal Organization Name *</label>
                  <input
                    type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Organization Type</label>
                  <select
                    value={orgType} onChange={e => setOrgType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  >
                    <option>Government Examination Board</option>
                    <option>Central Examination Board</option>
                    <option>State Examination Authority</option>
                    <option>Central University</option>
                    <option>State University</option>
                    <option>Autonomous University</option>
                    <option>Technical Education Council</option>
                    <option>AICTE-Approved Technical Institution</option>
                    <option>National Recruitment Commission</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Registration / Institution ID *</label>
                  <input
                    type="text" value={regNumber} onChange={e => setRegNumber(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">University / Board Authority ID</label>
                  <input
                    type="text" value={authId} onChange={e => setAuthId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">State / Union Territory *</label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={state} onChange={e => setState(e.target.value)} required
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                    >
                      <option value="">Select state…</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Official Institutional Email *</label>
                  <input
                    type="email" value={officialEmail} onChange={e => setOfficialEmail(e.target.value)} required
                    placeholder="registrar@yourinstitution.edu.in"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Official Website</label>
                  <input
                    type="text" value={website} onChange={e => setWebsite(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Official Contact Number</label>
                  <input
                    type="text" value={contact} onChange={e => setContact(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">Registered Address</label>
                  <input
                    type="text" value={address} onChange={e => setAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">Authorized Representative (Organization Owner Account)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Full Legal Name *</label>
                  <input
                    type="text" value={repName} onChange={e => setRepName(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Designation</label>
                  <input
                    type="text" value={repDesignation} onChange={e => setRepDesignation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Representative Official Email *</label>
                  <input
                    type="email" value={repEmail} onChange={e => setRepEmail(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Representative Direct Line</label>
                  <input
                    type="text" value={repContact} onChange={e => setRepContact(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">Owner Account Passphrase *</label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="Create a strong passphrase (min 6 characters)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Used by the Organization Owner to sign in after registration completes.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">Verification Documents</h3>
              <p className="text-[11px] text-slate-500 -mt-1">
                Upload clear, machine-readable PDF documents. Accepted: PDF, PNG, JPG.
              </p>

              <DocUpload
                label="Organization / Establishment Certificate"
                hint="Certificate of establishment or university act (recommended)."
                doc={estDoc}
                onChange={e => handleDocChange(e, setEstDoc)}
              />
              <DocUpload
                label="Recognition / Accreditation Document *"
                hint="UGC / AICTE / board recognition or accreditation certificate."
                doc={accredDoc}
                onChange={e => handleDocChange(e, setAccredDoc)}
              />
              <DocUpload
                label="Authorized Representative Document *"
                hint="Official authorization / appointment letter for the representative."
                doc={authRepDoc}
                onChange={e => handleDocChange(e, setAuthRepDoc)}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={navigateLogin}
                className="text-xs text-emerald-900 font-bold hover:underline"
              >
                Already registered? Sign In
              </button>

              <button
                type="submit"
                disabled={verifyState === 'running'}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-md disabled:opacity-50"
              >
                {verifyState === 'running' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verification in progress…</span>
                  </>
                ) : verifyState === 'PENDING_VERIFICATION' || verifyState === 'VERIFICATION_FAILED' ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Submit for Verification Again</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Submit for Verification</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ================= STAGE 2 ================= */}
        {stage === 2 && stage2Unlocked && (
          <div className="bg-white p-6 sm:p-8 border border-slate-200 rounded-xl shadow-xs space-y-6">
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
              <div className="text-xs">
                <div className="font-bold">Organization Verified</div>
                <p className="mt-0.5">Final step: bind this workstation as the trusted Organization Owner device.</p>
              </div>
            </div>

            {bindState !== 'completed' ? (
              <div className="space-y-4 text-xs">
                <h3 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-emerald-900" />
                  <span>Owner Device / Workstation Binding</span>
                </h3>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 space-y-2">
                  <p className="leading-relaxed">
                    This creates a cryptographic key pair for your workstation. The private key is generated on
                    this device and never leaves it; only the public key is registered with ZeroLeak.
                  </p>
                  <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Device identity &amp; trusted binding are established here.</span>
                  </div>
                </div>

                {bindError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{bindError}</span>
                  </div>
                )}

                {bindState === 'binding' && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{bindProgress || 'Binding this workstation…'}</span>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleBindDevice}
                    disabled={bindState === 'binding'}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-md disabled:opacity-50"
                  >
                    {bindState === 'binding' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Securing Workstation…</span>
                      </>
                    ) : bindState === 'error' ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Retry Device Binding</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Bind This Workstation</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center py-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Laptop className="w-7 h-7 text-emerald-700" />
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Owner Device / Workstation Trusted</span>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-900 text-white text-sm font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Secure Registration Completed</span>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={enterDashboard}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-md"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>Enter Secure Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Reusable document upload row.
const DocUpload: React.FC<{
  label: string;
  hint: string;
  doc: DocSlot | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ label, hint, doc, onChange }) => (
  <label
    className={`p-4 rounded-lg border-2 border-dashed cursor-pointer flex items-center justify-between transition-colors ${
      doc ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:bg-slate-50'
    }`}
  >
    <div className="flex items-center gap-3">
      <Upload className="w-5 h-5 text-emerald-900 shrink-0" />
      <div>
        <div className="font-bold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500">
          {doc ? `${doc.name} · ${(doc.size / 1024).toFixed(0)} KB` : hint}
        </div>
      </div>
    </div>
    {doc && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
    <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*" className="hidden" onChange={onChange} />
  </label>
);
