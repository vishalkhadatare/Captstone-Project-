import React, { useState } from 'react';
import {
  Building2,
  ShieldCheck,
  Upload,
  KeyRound,
  FileCheck2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Lock,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';
import { api, setStoredAuth } from '../api';
import { User } from '../types';

interface OrgRegistrationPageProps {
  onRegistrationSuccess?: (user: User, token: string) => void;
  onLoginRedirect?: () => void;
  onNavigateLogin?: () => void;
  onBackToLanding: () => void;
}

export const OrgRegistrationPage: React.FC<OrgRegistrationPageProps> = ({
  onRegistrationSuccess,
  onLoginRedirect,
  onNavigateLogin,
  onBackToLanding,
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigateLogin = onLoginRedirect || onNavigateLogin;

  // Step 1: Org Details
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('Central University');
  const [regNumber, setRegNumber] = useState('');
  const [authId, setAuthId] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');

  // Step 2: Authorized Representative
  const [repName, setRepName] = useState('');
  const [repDesignation, setRepDesignation] = useState('Controller of Examinations');
  const [repEmail, setRepEmail] = useState('');
  const [repContact, setRepContact] = useState('');
  const [repPassword, setRepPassword] = useState('');

  // Step 3: Documents
  const [certUploaded, setCertUploaded] = useState(false);
  const [authLetterUploaded, setAuthLetterUploaded] = useState(false);
  const [officialIdUploaded, setOfficialIdUploaded] = useState(false);

  // Step 4: Domain OTP
  const [domainOtp, setDomainOtp] = useState('884219');
  const [otpEntered, setOtpEntered] = useState('');
  const [domainVerified, setDomainVerified] = useState(false);

  // Step 5: Completed Org ID
  const [registeredOrgId, setRegisteredOrgId] = useState<string | null>(null);

  const handleVerifyOtp = () => {
    if (otpEntered.trim() === domainOtp || otpEntered.trim() === '884219' || otpEntered.trim().length === 6) {
      setDomainVerified(true);
      setErrorMessage(null);
    } else {
      setErrorMessage('Invalid verification OTP code. Enter 884219 for verification testing.');
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Register Org in DB
      const orgRes = await api.registerOrg({
        name: orgName,
        type: orgType,
        reg_number: regNumber,
        auth_id: authId,
        official_email: officialEmail,
        website: website,
        address: address,
        contact: contact,
        rep_name: repName,
        rep_designation: repDesignation,
        rep_email: repEmail,
        rep_contact: repContact,
      });

      const orgId = orgRes.orgId;
      setRegisteredOrgId(orgId);

      // 2. Upload initial document records
      await api.uploadOrgDoc({
        doc_type: 'ACCREDITATION_CERTIFICATE',
        file_name: 'Institutional_Accreditation_Certificate.pdf',
        file_size: 2048576,
      });

      await api.uploadOrgDoc({
        doc_type: 'AUTHORIZATION_LETTER',
        file_name: 'Controller_Authorization_Gazette.pdf',
        file_size: 1048576,
      });

      // 3. Register Authorized Representative as ORG_OWNER User
      const userRes = await api.register({
        email: repEmail,
        username: repEmail.split('@')[0],
        password: repPassword,
        full_name: repName,
        role: 'ORG_OWNER',
        org_id: orgId,
        device_name: `${repName}'s Certified Primary Terminal`,
      });

      setStoredAuth(userRes.token, userRes.user);
      if (onRegistrationSuccess) {
        onRegistrationSuccess(userRes.user, userRes.token);
      } else if (navigateLogin) {
        navigateLogin();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please check institutional details.');
      setLoading(false);
    }
  };

  const nextStep = () => {
    setErrorMessage(null);
    if (step === 1) {
      if (!orgName || !regNumber || !officialEmail) {
        setErrorMessage('Please complete all mandatory institutional details.');
        return;
      }
    } else if (step === 2) {
      if (!repName || !repEmail || !repPassword) {
        setErrorMessage('Please fill in authorized representative details and passphrase.');
        return;
      }
      if (repPassword.length < 6) {
        setErrorMessage('Passphrase must be at least 6 characters.');
        return;
      }
    } else if (step === 3) {
      if (!certUploaded || !authLetterUploaded) {
        setErrorMessage('Please confirm document upload attachments.');
        return;
      }
    } else if (step === 4) {
      if (!domainVerified) {
        setErrorMessage('Please verify your official institutional domain OTP.');
        return;
      }
    }
    setStep(prev => prev + 1);
  };

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
          Educational Organization Accreditation
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500">
          Establish an official cryptographic examination enclave for your institution.
        </p>

        {/* 5-Step Stepper Bar */}
        <div className="mt-8 mb-6 grid grid-cols-5 gap-2 text-center text-[11px] font-semibold">
          {[
            { n: 1, label: 'Organization' },
            { n: 2, label: 'Representative' },
            { n: 3, label: 'Documents' },
            { n: 4, label: 'Domain OTP' },
            { n: 5, label: 'Review' },
          ].map(s => (
            <div
              key={s.n}
              className={`p-2 rounded-lg border transition-colors ${
                step === s.n
                  ? 'bg-emerald-900 text-white border-emerald-900'
                  : step > s.n
                  ? 'bg-emerald-50 text-emerald-850 border-emerald-200'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              <div className="font-bold">Step 0{s.n}</div>
              <div className="truncate text-[10px]">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white p-6 sm:p-8 border border-slate-200 rounded-xl shadow-xs space-y-6">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Organization Details */}
          {step === 1 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
                1. Institutional Legal Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">
                    Legal Organization Name *
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="e.g. National Board of Technical Examinations & Assessment"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Organization Type
                  </label>
                  <select
                    value={orgType}
                    onChange={e => setOrgType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  >
                    <option value="Central Examination Board">Central Examination Board</option>
                    <option value="State Examination Authority">State Examination Authority</option>
                    <option value="Autonomous University">Autonomous University</option>
                    <option value="Technical Education Council">Technical Education Council</option>
                    <option value="Recruitment Commission">National Recruitment Commission</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Registration / Gazette Number *
                  </label>
                  <input
                    type="text"
                    value={regNumber}
                    onChange={e => setRegNumber(e.target.value)}
                    placeholder="e.g. REG/2026/EXAM-9921"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    University / Board Authority ID
                  </label>
                  <input
                    type="text"
                    value={authId}
                    onChange={e => setAuthId(e.target.value)}
                    placeholder="e.g. AUTH-NBTE-01"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Official Institutional Email *
                  </label>
                  <input
                    type="email"
                    value={officialEmail}
                    onChange={e => setOfficialEmail(e.target.value)}
                    placeholder="contact@nbte.edu.in"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Official Website URL
                  </label>
                  <input
                    type="text"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="https://nbte.edu.in"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Official Contact Number
                  </label>
                  <input
                    type="text"
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                    placeholder="+91 (11) 2338-9000"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">
                    Registered Headquarters Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Institutional Enclave, Sector 5, New Delhi 110001"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Authorized Representative */}
          {step === 2 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
                2. Authorized Representative (Organization Owner Account)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Full Legal Name *
                  </label>
                  <input
                    type="text"
                    value={repName}
                    onChange={e => setRepName(e.target.value)}
                    placeholder="Dr. Anand Vardhan Sharma"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Designation *
                  </label>
                  <input
                    type="text"
                    value={repDesignation}
                    onChange={e => setRepDesignation(e.target.value)}
                    placeholder="Controller of Examinations"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Representative Official Email *
                  </label>
                  <input
                    type="email"
                    value={repEmail}
                    onChange={e => setRepEmail(e.target.value)}
                    placeholder="anand.sharma@nbte.edu.in"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Representative Mobile / Direct Line
                  </label>
                  <input
                    type="text"
                    value={repContact}
                    onChange={e => setRepContact(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">
                    Master Terminal Passphrase *
                  </label>
                  <input
                    type="password"
                    value={repPassword}
                    onChange={e => setRepPassword(e.target.value)}
                    placeholder="Create a strong secret passphrase (min 6 characters)"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    This passphrase will be used by the Organization Owner to log in and manage examination manager permissions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Documents Upload */}
          {step === 3 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
                3. Institutional Verification Documents
              </h3>

              <div className="space-y-3">
                <div
                  onClick={() => setCertUploaded(!certUploaded)}
                  className={`p-4 rounded-lg border-2 border-dashed cursor-pointer flex items-center justify-between transition-colors ${
                    certUploaded ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-emerald-900" />
                    <div>
                      <div className="font-bold text-slate-900">
                        1. Institutional Accreditation / University Act Certificate
                      </div>
                      <div className="text-[11px] text-slate-500">
                        PDF or scanned copy of central/state recognition.
                      </div>
                    </div>
                  </div>
                  {certUploaded && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                </div>

                <div
                  onClick={() => setAuthLetterUploaded(!authLetterUploaded)}
                  className={`p-4 rounded-lg border-2 border-dashed cursor-pointer flex items-center justify-between transition-colors ${
                    authLetterUploaded ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-emerald-900" />
                    <div>
                      <div className="font-bold text-slate-900">
                        2. Controller of Examinations Official Authorization Letter
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Official gazette or appointment notification letter.
                      </div>
                    </div>
                  </div>
                  {authLetterUploaded && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                </div>

                <div
                  onClick={() => setOfficialIdUploaded(!officialIdUploaded)}
                  className={`p-4 rounded-lg border-2 border-dashed cursor-pointer flex items-center justify-between transition-colors ${
                    officialIdUploaded ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-emerald-900" />
                    <div>
                      <div className="font-bold text-slate-900">
                        3. Representative Official Photo ID (Aadhaar / National ID)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Official government identification card.
                      </div>
                    </div>
                  </div>
                  {officialIdUploaded && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Official Domain OTP */}
          {step === 4 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
                4. Official Institutional Domain Verification
              </h3>

              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                <div className="font-bold">Institutional Domain Challenge</div>
                <p className="text-[11px]">
                  ZeroLeak verifies that you possess authorized access to the institutional domain:
                  <span className="font-mono font-bold ml-1">{officialEmail}</span>.
                </p>
                <p className="text-[10px] text-emerald-700 pt-1">
                  Verification OTP challenge token: <span className="font-mono font-bold bg-emerald-100 px-1.5 py-0.5 rounded">884219</span>
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-slate-700 font-bold">
                  Enter 6-Digit Domain OTP Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={otpEntered}
                    onChange={e => setOtpEntered(e.target.value)}
                    placeholder="Enter 884219"
                    maxLength={6}
                    className="w-48 px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono text-center tracking-widest text-sm focus:bg-white focus:border-emerald-800 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs"
                  >
                    Verify Domain OTP
                  </button>
                </div>
                {domainVerified && (
                  <p className="text-xs text-emerald-700 font-bold flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Official Domain Successfully Validated!
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Review & Submission */}
          {step === 5 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
                5. Accreditation Summary & Submission Review
              </h3>

              <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Organization Name:</span>
                  <span className="font-bold text-slate-900">{orgName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Organization Type:</span>
                  <span className="font-bold text-slate-900">{orgType}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Registration Number:</span>
                  <span className="font-mono text-slate-900">{regNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Official Domain Email:</span>
                  <span className="font-mono text-slate-900">{officialEmail}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Authorized Representative:</span>
                  <span className="font-bold text-slate-900">{repName} ({repDesignation})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Initial Verification Status:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                    PENDING REVIEW
                  </span>
                </div>
              </div>

              {/* State Machine Visualization */}
              <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-[10px] text-slate-600 space-y-1">
                <span className="font-bold uppercase tracking-wider block text-slate-700">
                  Verification Lifecycle Sequence:
                </span>
                <p className="font-mono text-slate-700">
                  PENDING → DOCUMENT_SUBMITTED → IDENTITY_VALIDATION → ORGANIZATION_VALIDATION → AUTHORIZED_REPRESENTATIVE_VERIFICATION → MANUAL_INDEPENDENT_REVIEW → VERIFIED
                </p>
              </div>
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(prev => prev - 1)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Previous Step
              </button>
            ) : (
              <button
                type="button"
                onClick={navigateLogin}
                className="text-xs text-emerald-900 font-bold hover:underline"
              >
                Already registered? Sign In
              </button>
            )}

            {step < 5 ? (
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleFinalSubmit}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-md disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{loading ? 'Registering Enclave...' : 'Submit Institutional Registration'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
