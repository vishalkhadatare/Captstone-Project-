import React, { useState, useEffect } from 'react';
import { api, getDeviceFingerprint } from '../api';
import {
  Organization,
  OrganizationDocument,
  VerificationHistoryItem,
  TrustedDevice,
  User,
  OrgVerificationStatus,
} from '../types';
import {
  Building2,
  FileCheck,
  ShieldCheck,
  Upload,
  Globe,
  UserCheck,
  Laptop,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Trash2,
  Key,
} from 'lucide-react';

interface OrgModuleProps {
  currentUser: User | null;
  onRefresh: () => void;
}

export const OrganizationModule: React.FC<OrgModuleProps> = ({ currentUser, onRefresh }) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [history, setHistory] = useState<VerificationHistoryItem[]>([]);
  const [representatives, setRepresentatives] = useState<any[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [showRegModal, setShowRegModal] = useState(false);
  const [regForm, setRegForm] = useState({
    name: 'National Board of Technical Examinations',
    type: 'Government Examination Authority',
    reg_number: 'NBTE/2026/REG-9482',
    auth_id: 'AUTH-NBTE-01',
    official_email: 'controller@nbte.edu.in',
    website: 'https://nbte.edu.in',
    address: 'Vidya Bhavan, Academic Enclave, Sector 12',
    contact: '+91 11 2389 4000',
    rep_name: 'Dr. Alok Verma',
    rep_designation: 'Registrar & Chief Signatory',
    rep_contact: '+91 98100 12345',
  });

  const [docUploadForm, setDocUploadForm] = useState({
    doc_type: 'Government Recognition Certificate & Gazette Notification',
    file_name: 'NBTE_Accreditation_Gazette_2026.pdf',
    file_size: 2450000,
  });

  const [domainOtpForm, setDomainOtpForm] = useState({
    domain: 'nbte.edu.in',
    otp: '948210',
  });

  const [authManagerForm, setAuthManagerForm] = useState({
    email: 'manager@nbte.edu.in',
    full_name: 'Prof. Rajesh Sharma',
    role: 'EXAM_MANAGER',
    password: 'Password123!',
    centre_id: '',
  });

  const [deviceForm, setDeviceForm] = useState({
    device_name: 'Executive Registrar Terminal 01',
    device_fingerprint: getDeviceFingerprint(),
  });

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgRes, membersRes, devicesRes] = await Promise.all([
        api.getCurrentOrg(),
        api.getOrgMembers(),
        api.getDevices(),
      ]);

      setOrg(orgRes.organization);
      setDocuments(orgRes.documents || []);
      setHistory(orgRes.history || []);
      setRepresentatives(orgRes.representatives || []);
      setMembers(membersRes.members || []);
      setDevices(devicesRes.devices || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.registerOrg(regForm);
      setActionMessage({ type: 'success', text: res.message });
      setShowRegModal(false);
      loadData();
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.uploadOrgDoc(docUploadForm);
      setActionMessage({ type: 'success', text: res.message });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleVerifyDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.verifyDomain(domainOtpForm.domain, domainOtpForm.otp);
      setActionMessage({ type: 'success', text: res.message });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleTransitionState = async (target: OrgVerificationStatus) => {
    try {
      const res = await api.transitionOrgStatus(target, `Institutional authority review transitioned to ${target}`);
      setActionMessage({ type: 'success', text: res.message });
      loadData();
      onRefresh();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleAuthorizeManager = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.authorizeManager(authManagerForm);
      setActionMessage({
        type: 'success',
        text: `${res.message} (Password: ${res.temporaryPassword || 'Password123!'})`,
      });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage({ type: 'error', text: 'Manual device creation is retired. Each user enrolls their device from sign-in using a P-256 challenge response.' });
  };

  const handleRevokeDevice = async (id: string) => {
    try {
      const res = await api.revokeDevice(id);
      setActionMessage({ type: 'success', text: res.message });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message || 'Failed to revoke device.' });
    }
  };

  // State Machine Step Visualizer
  const stateSteps: Array<{ key: OrgVerificationStatus; label: string }> = [
    { key: 'PENDING', label: '1. Registration' },
    { key: 'DOCUMENT_SUBMITTED', label: '2. Documents' },
    { key: 'IDENTITY_VALIDATION', label: '3. Identity' },
    { key: 'ORGANIZATION_VALIDATION', label: '4. Legal Org' },
    { key: 'AUTHORIZED_REPRESENTATIVE_VERIFICATION', label: '5. Rep Auth' },
    { key: 'OFFICIAL_DOMAIN_VERIFICATION', label: '6. Domain DNS' },
    { key: 'MANUAL_INDEPENDENT_REVIEW', label: '7. Review' },
    { key: 'VERIFIED', label: '8. VERIFIED' },
  ];

  const currentStepIndex = org ? stateSteps.findIndex(s => s.key === org.status) : 0;

  return (
    <div className="space-y-6">
      {/* Module Title & Academic Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white font-serif">
              1. Organization & Access Verification
            </h1>
            {org?.status === 'VERIFIED' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Accredited & Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                <Clock className="w-3.5 h-3.5" />
                {org?.status || 'PENDING ACCREDITATION'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Institutional registration, multi-tier state machine accreditation, authorized manager delegation, and trusted hardware binding.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          {!org && (
            <button
              onClick={() => setShowRegModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-900/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Organization</span>
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs font-bold px-1.5 hover:opacity-75">✕</button>
        </div>
      )}

      {/* SECTION 10: VERIFICATION STATE MACHINE VISUALIZER */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              Accreditation State Machine (Strict Non-Binary Lifecycle)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Requirement #10: Multi-stage independent verification pipeline. Every state transition is cryptographically audited.
            </p>
          </div>
          {currentUser?.role === 'ORG_OWNER' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Advance Workflow:</span>
              {stateSteps.map((step, idx) => (
                <button
                  key={step.key}
                  onClick={() => handleTransitionState(step.key)}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                    org?.status === step.key
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950'
                  }`}
                >
                  {step.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline Progression Steps */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {stateSteps.map((s, idx) => {
            const isCompleted = idx <= (currentStepIndex !== -1 ? currentStepIndex : 0);
            const isCurrent = s.key === org?.status;

            return (
              <div
                key={s.key}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  isCurrent
                    ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 shadow-md ring-1 ring-indigo-500/50'
                    : isCompleted
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                    : 'bg-slate-100/60 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-400 opacity-60'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1 truncate">
                  {s.label}
                </div>
                <div className="text-[11px] flex items-center justify-center gap-1">
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span className="font-mono text-[9px]">{isCurrent ? 'ACTIVE' : isCompleted ? 'PASSED' : 'WAITING'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Org Credentials & Document Vault */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Institutional Details & Domain Verification */}
        <div className="lg:col-span-2 space-y-6">
          {/* Institutional Dossier */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500" />
                Institutional Organization Dossier
              </h2>
              {org && (
                <span className="text-xs font-mono text-slate-400">
                  ID: {org.id}
                </span>
              )}
            </div>

            {!org ? (
              <div className="py-8 text-center text-slate-400 space-y-3">
                <p className="text-sm">No organization credentials registered yet.</p>
                <button
                  onClick={() => setShowRegModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
                >
                  Register Institutional Organization
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Legal Organization Name</div>
                  <div className="font-semibold text-slate-900 dark:text-white text-sm">{org.name}</div>
                  <div className="text-slate-500 text-[11px]">{org.type}</div>
                </div>

                <div className="space-y-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Registration & Authority ID</div>
                  <div className="font-mono text-indigo-400 font-semibold">{org.reg_number}</div>
                  <div className="text-slate-500 text-[11px]">Authority Code: {org.auth_id}</div>
                </div>

                <div className="space-y-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Official Educational Domain & Email</div>
                  <div className="text-slate-900 dark:text-slate-100 font-medium">{org.official_email}</div>
                  <div className="text-indigo-400 text-[11px] flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <span>{org.website}</span>
                  </div>
                </div>

                <div className="space-y-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Campus Headquarters & Contact</div>
                  <div className="text-slate-900 dark:text-slate-100">{org.address}</div>
                  <div className="text-slate-500 text-[11px]">{org.contact}</div>
                </div>
              </div>
            )}

            {/* Official Domain DNS Handshake Form */}
            {org && (
              <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Section 11: Institutional Domain DNS Verification
                    </span>
                  </div>
                  {org.domain_verified ? (
                    <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Domain DNS Verified
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Verification Pending
                    </span>
                  )}
                </div>

                <form onSubmit={handleVerifyDomain} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={domainOtpForm.domain}
                    onChange={e => setDomainOtpForm({ ...domainOtpForm, domain: e.target.value })}
                    placeholder="Institutional Domain (e.g. nbte.edu.in)"
                    className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={domainOtpForm.otp}
                    onChange={e => setDomainOtpForm({ ...domainOtpForm, otp: e.target.value })}
                    placeholder="DNS Cryptographic OTP Token"
                    className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Verify Domain Handshake
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* SECTION 14 & 15: ROLE AUTHORIZATION MANAGER */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-500" />
                  Authorized Operational Roles (RBAC Delegation)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Authorize Examination Managers, Subject Matter Experts (SMEs), Centre Operators, and Independent Auditors.
                </p>
              </div>
            </div>

            {/* Authorize New Member Form */}
            {currentUser?.role === 'ORG_OWNER' && (
              <form onSubmit={handleAuthorizeManager} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={authManagerForm.full_name}
                  onChange={e => setAuthManagerForm({ ...authManagerForm, full_name: e.target.value })}
                  required
                  className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="email"
                  placeholder="Official Institutional Email"
                  value={authManagerForm.email}
                  onChange={e => setAuthManagerForm({ ...authManagerForm, email: e.target.value })}
                  required
                  className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <select
                  value={authManagerForm.role}
                  onChange={e => setAuthManagerForm({ ...authManagerForm, role: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                >
                  <option value="EXAM_MANAGER">Role 2: Examination Manager</option>
                  <option value="AUDITOR">Role 5: Security Auditor</option>
                </select>
                <input
                  type="text"
                  placeholder="Centre ID (if Operator)"
                  value={authManagerForm.centre_id}
                  onChange={e => setAuthManagerForm({ ...authManagerForm, centre_id: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Authorize Role</span>
                </button>
              </form>
            )}

            {/* Members Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Authorized Member</th>
                    <th className="py-2.5 px-3">Role Boundary</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Centre Code</th>
                    <th className="py-2.5 px-3">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">No authorized role members registered yet.</td>
                    </tr>
                  ) : (
                    members.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{m.full_name}</div>
                          <div className="text-[10px] text-slate-400">{m.email}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-indigo-400">{m.role}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                            {m.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{m.centre_id || 'CENTRAL'}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">
                          {m.last_login_at ? new Date(m.last_login_at).toLocaleTimeString() : 'Pending'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Documents Vault & Trusted Devices */}
        <div className="space-y-6">
          {/* SECTION 9: UPLOAD OFFICIAL DOCUMENTS */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-500" />
                Document Verification Vault
              </h2>
              <span className="text-xs text-slate-400 font-mono">{documents.length} Docs</span>
            </div>

            <form onSubmit={handleUploadDoc} className="space-y-3 text-xs bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">Document Classification</label>
                <select
                  value={docUploadForm.doc_type}
                  onChange={e => setDocUploadForm({ ...docUploadForm, doc_type: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="Government Recognition Certificate & Gazette Notification">Government Recognition Certificate</option>
                  <option value="Official University Registration & License">Official University Registration / License</option>
                  <option value="Authorized Representative Delegation Charter">Authorized Representative Delegation Charter</option>
                  <option value="Examination Authority Document">Examination Authority Statutory Document</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">Document Filename</label>
                <input
                  type="text"
                  value={docUploadForm.file_name}
                  onChange={e => setDocUploadForm({ ...docUploadForm, file_name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Verification Evidence</span>
              </button>
            </form>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {documents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No documents submitted yet.</p>
              ) : (
                documents.map(d => (
                  <div key={d.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{d.doc_type}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {d.status}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-indigo-400 truncate">{d.file_name}</div>
                    <div className="text-[10px] text-slate-500 flex items-center justify-between">
                      <span>{(d.file_size / 1024 / 1024).toFixed(2)} MB</span>
                      <span>{new Date(d.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SECTION 19: TRUSTED HARDWARE DEVICE BINDING */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Laptop className="w-4 h-4 text-indigo-500" />
                Trusted Hardware Device Tokens
              </h2>
              <span className="text-xs text-slate-400 font-mono">{devices.length} Registered</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {devices.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">
                  <p>No trusted devices registered.</p>
                </div>
              ) : (
                devices.map(dev => (
                  <div
                    key={dev.id}
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      dev.status === 'REVOKED'
                        ? 'bg-rose-950/20 border-rose-800/40 text-rose-300 opacity-60'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900 dark:text-white">{dev.device_name}</div>
                      {dev.status === 'TRUSTED' ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          TRUSTED
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                          REVOKED
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 truncate">
                      FP: {dev.device_fingerprint}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center justify-between">
                      <span>Owner: {dev.user_name || 'Station'}</span>
                      {currentUser?.role === 'ORG_OWNER' && dev.status === 'TRUSTED' && (
                        <button
                          onClick={() => handleRevokeDevice(dev.id)}
                          className="text-rose-400 hover:text-rose-300 font-semibold"
                        >
                          Revoke Token
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Register Organization Modal */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-serif">
                Institutional Organization Registration (Section 8)
              </h2>
              <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleRegisterOrg} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Legal Organization Name</label>
                  <input
                    type="text"
                    value={regForm.name}
                    onChange={e => setRegForm({ ...regForm, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Organization Type</label>
                  <select
                    value={regForm.type}
                    onChange={e => setRegForm({ ...regForm, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="Government Examination Authority">Government Examination Authority</option>
                    <option value="University">University</option>
                    <option value="College / Educational Institution">College / Educational Institution</option>
                    <option value="Examination Board">Examination Board</option>
                    <option value="Entrance Examination Authority / Entrance Test Cell">Entrance Examination Authority / Entrance Test Cell</option>
                    <option value="Company / Private Organization">Company / Private Organization</option>
                    <option value="Other">Other</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">Select the type of organization that conducts or manages your examinations.</p>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Govt. Registration Number</label>
                  <input
                    type="text"
                    value={regForm.reg_number}
                    onChange={e => setRegForm({ ...regForm, reg_number: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">University / Board Authority ID</label>
                  <input
                    type="text"
                    value={regForm.auth_id}
                    onChange={e => setRegForm({ ...regForm, auth_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Official Institutional Email</label>
                  <input
                    type="email"
                    value={regForm.official_email}
                    onChange={e => setRegForm({ ...regForm, official_email: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Official Website</label>
                  <input
                    type="url"
                    value={regForm.website}
                    onChange={e => setRegForm({ ...regForm, website: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-400 font-semibold mb-1">Registered Institutional Address</label>
                  <input
                    type="text"
                    value={regForm.address}
                    onChange={e => setRegForm({ ...regForm, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Authorized Representative Name</label>
                  <input
                    type="text"
                    value={regForm.rep_name}
                    onChange={e => setRegForm({ ...regForm, rep_name: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Representative Designation</label>
                  <input
                    type="text"
                    value={regForm.rep_designation}
                    onChange={e => setRegForm({ ...regForm, rep_designation: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold shadow-md"
                >
                  Submit for Accreditation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
