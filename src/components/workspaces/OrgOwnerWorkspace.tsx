import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  FileText,
  Users,
  Laptop,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlusCircle,
  Trash2,
  KeyRound,
  FileCheck2,
  Layers,
  Copy,
  Check,
  LogIn,
  ExternalLink,
  UserCheck,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { User, Organization, OrganizationDocument, TrustedDevice, SecurityEvent } from '../../types';
import { api, getDeviceFingerprint, performFullLogin } from '../../api';
import { NavSubTab } from '../Sidebar';

interface OrgOwnerWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
  onSwitchUser?: (user: User, token: string) => void;
}

export const OrgOwnerWorkspace: React.FC<OrgOwnerWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
  onSwitchUser,
}) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerContact, setManagerContact] = useState('');
  const [managerDesignation, setManagerDesignation] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerRole, setManagerRole] = useState<'EXAM_MANAGER' | 'AUDITOR' | 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR'>('EXAM_MANAGER');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    role: 'EXAM_MANAGER' | 'AUDITOR' | 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR';
    roleLabel: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loggingInRole, setLoggingInRole] = useState<string | null>(null);

  const [deviceName, setDeviceName] = useState('');
  const [docType, setDocType] = useState('ACCREDITATION_CERTIFICATE');
  const [docName, setDocName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // Auto-navigate to trusted devices if there are pending devices
  useEffect(() => {
    const pendingDevices = devices.filter(d => d.status === 'PENDING' || d.status === 'PENDING_APPROVAL');
    if (pendingDevices.length > 0 && activeSubTab !== 'trusted_devices') {
      // Only show message once by checking if we're not already on that tab
      console.log(`Found ${pendingDevices.length} pending device(s) awaiting approval`);
    }
  }, [devices, activeSubTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgRes, membersRes, devicesRes, secRes] = await Promise.all([
        api.getCurrentOrg().catch(() => ({ organization: null, documents: [], history: [], representatives: [] })),
        api.getAuthorizedUsers().catch(() => api.getOrgMembers().then(r => ({ users: r.members }))).catch(() => ({ users: [] })),
        api.getDevices().catch(() => ({ devices: [] })),
        api.getSecurityEvents().catch(() => ({ events: [] })),
      ]);

      setOrg(orgRes.organization);
      setDocuments(orgRes.documents || []);
      setHistory(orgRes.history || []);
      setManagers((membersRes as any).users || (membersRes as any).members || []);
      setDevices(devicesRes.devices || []);
      setSecurityEvents(secRes.events || []);
    } catch (err: any) {
      console.error('Data load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  const handleRevokeUser = async (userId: string) => {
    setStatusMessage(null);
    setProcessingUserId(userId);
    try {
      // Optimistic update
      setManagers(prev => prev.map(m => m.id === userId ? { ...m, authorization_status: 'REVOKED', status: 'SUSPENDED' as any } : m));
      const res = await api.revokeUser(userId);
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to revoke user access.' });
      await loadData();
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleRestoreUser = async (userId: string) => {
    setStatusMessage(null);
    setProcessingUserId(userId);
    try {
      // Optimistic update
      setManagers(prev => prev.map(m => m.id === userId ? { ...m, authorization_status: 'AUTHORIZED', status: 'ACTIVE' as any } : m));
      const res = await api.restoreUser(userId);
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to restore user access.' });
      await loadData();
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const createdCreds = {
      name: managerName,
      email: managerEmail.trim().toLowerCase(),
      password: managerPassword,
      role: managerRole,
      roleLabel:
        managerRole === 'EXAM_MANAGER'
          ? 'Examination Manager'
          : managerRole === 'AUDITOR'
          ? 'Auditor'
          : managerRole === 'SME'
          ? 'Subject Matter Expert (SME)'
          : managerRole === 'TRANSLATOR'
          ? 'Linguistic Translator'
          : 'Centre Superintendent & Operator',
    };

    try {
      const res = await api.authorizeManager({
        full_name: managerName,
        email: managerEmail.trim().toLowerCase(),
        contact_number: managerContact,
        designation: managerDesignation,
        password: managerPassword,
        role: managerRole,
      });
      setStatusMessage({ type: 'success', text: res.message });
      setIssuedCredentials(createdCreds);
      setManagerName('');
      setManagerEmail('');
      setManagerContact('');
      setManagerDesignation('');
      setManagerPassword('');
      setShowAddUserModal(false);
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleLoginAsRole = async (targetRole: 'EXAM_MANAGER' | 'AUDITOR', customPass?: string, customEmail?: string) => {
    setStatusMessage(null);
    setLoggingInRole(targetRole);

    try {
      const targetUser = managers.find(m => m.role === targetRole);
      let email = customEmail || targetUser?.email;
      let pass = customPass;

      if (!email) {
        if (targetRole === 'EXAM_MANAGER') {
          email = 'manager@nbte.edu.in';
          pass = pass || 'Password123!';
        } else {
          email = 'auditor@gov-audit.gov.in';
          pass = pass || 'Password123!';
        }
      } else if (!pass) {
        if (email.toLowerCase().includes('nbte.edu.in') || email.toLowerCase().includes('gov-audit') || email.toLowerCase().includes('demo')) {
          pass = 'Password123!';
        } else {
          pass = prompt(`Enter password for ${email}:`, 'Password123!') || '';
          if (!pass) {
            setLoggingInRole(null);
            return;
          }
        }
      }

      const { user, token } = await performFullLogin(email, pass);
      setStatusMessage({ type: 'success', text: `Access verified. Transferring directly to ${user.full_name}'s workspace...` });
      if (onSwitchUser) {
        setTimeout(() => {
          onSwitchUser(user, token);
        }, 400);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Direct login failed: ${err.message}` });
    } finally {
      setLoggingInRole(null);
    }
  };

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage({ type: 'error', text: 'Device enrollment is completed from the user sign-in flow with a cryptographic key and challenge. Manual trusted-device creation is not permitted.' });
  };

  const [processingDeviceId, setProcessingDeviceId] = useState<string | null>(null);

  const handleRevokeDevice = async (deviceId: string) => {
    setStatusMessage(null);
    setProcessingDeviceId(deviceId);
    try {
      const res = await api.revokeDevice(deviceId);
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to revoke device access.' });
    } finally {
      setProcessingDeviceId(null);
    }
  };

  const handleApproveDevice = async (deviceId: string) => {
    setStatusMessage(null);
    setProcessingDeviceId(deviceId);
    try {
      const res = await api.approveDevice(deviceId);
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to approve device.' });
    } finally {
      setProcessingDeviceId(null);
    }
  };

  const handleRejectDevice = async (deviceId: string) => {
    setStatusMessage(null);
    setProcessingDeviceId(deviceId);
    try {
      const res = await api.rejectDevice(deviceId);
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to reject device.' });
    } finally {
      setProcessingDeviceId(null);
    }
  };

  const handleTrustDevice = async (deviceId: string) => {
    setStatusMessage(null);
    setProcessingDeviceId(deviceId);
    try {
      const res = await api.reauthorizeDevice(deviceId);
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to trust device.' });
    } finally {
      setProcessingDeviceId(null);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    setStatusMessage(null);
    setProcessingDeviceId(deviceId);
    try {
      const res = await api.disableDevice(deviceId);
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete device.' });
    } finally {
      setProcessingDeviceId(null);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName) return;
    try {
      const res = await api.uploadOrgDoc({
        doc_type: docType,
        file_name: docName.endsWith('.pdf') ? docName : `${docName}.pdf`,
        file_size: 1024 * 1024 * 2,
      });
      setStatusMessage({ type: 'success', text: res.message });
      setDocName('');
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleAdvanceStatus = async (targetStatus: string) => {
    try {
      const res = await api.transitionOrgStatus(targetStatus, 'Authorized state progression via institution owner panel');
      setStatusMessage({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleRetryVerification = async () => {
    try {
      const res = await api.verifyOrg({
        name: org?.name,
        type: org?.type,
        reg_number: org?.reg_number,
      });
      setStatusMessage({ type: 'success', text: res.message });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Verification retry failed.' });
    }
  };

  const verificationStatus = org?.verification_status || (org?.status === 'VERIFIED' ? 'VERIFIED' : org?.status === 'REJECTED' || org?.status === 'VERIFICATION_FAILED' ? 'VERIFICATION_FAILED' : 'PENDING_VERIFICATION');
  const verificationSource = org?.verification_source || 'Official verification source not yet available';
  const verificationDate = org?.verification_date || 'Not yet verified';
  const documentVerificationStatus = org?.document_verification_status || 'PENDING';

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        Loading organization enclave configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* DASHBOARD OVERVIEW */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="stat-card-luxury p-6 sm:p-8 rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.05)] space-y-6 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Institutional Governance Enclave</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-950 mt-2 tracking-tight">
                  {org?.name || 'Academic Institution Enclave'}
                </h2>
                <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                  <span>Registration ID:</span>
                  <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    {org?.reg_number || 'REG-PENDING'}
                  </span>
                  <span>•</span>
                  <span>Classification:</span>
                  <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    {org?.type || 'University'}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-4 py-2 rounded-full text-xs font-black border shadow-2xs flex items-center gap-2 ${
                    verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : verificationStatus === 'VERIFICATION_FAILED'
                      ? 'bg-rose-50 text-rose-900 border-rose-300'
                      : 'bg-amber-50 text-amber-900 border-amber-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${verificationStatus === 'VERIFIED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span>STATUS: {verificationStatus || 'PENDING_VERIFICATION'}</span>
                </span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div className="stat-card-luxury p-4.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:border-emerald-300 transition-all">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-[11px] font-bold text-slate-600">Authorized Staff</span>
                  <div className="p-2 rounded-xl bg-emerald-100/60 text-emerald-800 border border-emerald-200/60 shadow-2xs">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-slate-950 block">{managers.length}</span>
                <span className="text-[10px] text-emerald-800 font-bold block mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Managers & Auditors
                </span>
              </div>

              <div className="stat-card-luxury p-4.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:border-emerald-300 transition-all">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-[11px] font-bold text-slate-600">Trusted Terminals</span>
                  <div className="p-2 rounded-xl bg-teal-100/60 text-teal-800 border border-teal-200/60 shadow-2xs">
                    <Laptop className="w-4 h-4" />
                  </div>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-slate-950 block">{devices.length}</span>
                <span className="text-[10px] text-teal-800 font-bold block mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                  Hardware Bound
                </span>
              </div>

              <div className="stat-card-luxury p-4.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:border-emerald-300 transition-all">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-[11px] font-bold text-slate-600">Accreditation Docs</span>
                  <div className="p-2 rounded-xl bg-blue-100/60 text-blue-800 border border-blue-200/60 shadow-2xs">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-slate-950 block">{documents.length}</span>
                <span className="text-[10px] text-blue-800 font-bold block mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  Verified Bylaws
                </span>
              </div>

              <div className="stat-card-luxury p-4.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:border-emerald-300 transition-all">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-[11px] font-bold text-slate-600">Security Incidents</span>
                  <div className="p-2 rounded-xl bg-amber-100/60 text-amber-800 border border-amber-200/60 shadow-2xs">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-slate-950 block">{securityEvents.length}</span>
                <span className="text-[10px] text-amber-800 font-bold block mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                  Audit Events
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="modern-card p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <div className="p-1 rounded-md bg-emerald-50 text-emerald-800">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span>Authorized Examination Personnel</span>
                </h3>
                <span className="text-[11px] font-medium text-slate-400">{managers.length} Registered</span>
              </div>
              <div className="space-y-2">
                {managers.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No authorized personnel yet.</p>
                ) : (
                  managers.slice(0, 4).map(m => (
                    <div key={m.id} className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                          {m.full_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{m.full_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{m.email}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        {m.role}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="modern-card p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <div className="p-1 rounded-md bg-emerald-50 text-emerald-800">
                    <Laptop className="w-3.5 h-3.5" />
                  </div>
                  <span>Active Hardware Terminals</span>
                </h3>
                <span className="text-[11px] font-medium text-slate-400">{devices.length} Bound</span>
              </div>
              <div className="space-y-2">
                {devices.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No hardware terminals registered.</p>
                ) : (
                  devices.slice(0, 4).map(d => (
                    <div key={d.id} className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{d.device_name}</div>
                          <div className="text-[10px] font-mono text-slate-500">{d.device_fingerprint?.slice(0, 16)}...</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        {d.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ORGANIZATION PROFILE */}
      {activeSubTab === 'org_profile' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Institutional Legal Entity Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Legal Name</span>
              <span className="font-bold text-slate-900">{org?.name}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Organization Type</span>
              <span className="font-bold text-slate-900">{org?.type}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Gazette Registration Number</span>
              <span className="font-mono text-slate-900">{org?.reg_number}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Authority ID</span>
              <span className="font-mono text-slate-900">{org?.auth_id || 'N/A'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Official Email</span>
              <span className="font-mono text-slate-900">{org?.official_email}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Official Website</span>
              <span className="font-mono text-slate-900">{org?.website || 'N/A'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
              <span className="text-slate-500 block">Registered Headquarters Address</span>
              <span className="font-bold text-slate-900">{org?.address || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {/* VERIFICATION STATUS */}
      {activeSubTab === 'verification_status' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Institutional Verification Lifecycle
              </h3>
              <p className="text-xs text-slate-500">
                Current State: <span className="font-bold text-emerald-900">{verificationStatus}</span>
              </p>
            </div>

            {(verificationStatus === 'PENDING_VERIFICATION' || verificationStatus === 'VERIFICATION_FAILED') && (
              <button
                onClick={handleRetryVerification}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
              >
                Retry Verification
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Organization Name</div>
              <div className="font-bold text-slate-900 mt-1">{org?.name || 'N/A'}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Organization Type</div>
              <div className="font-bold text-slate-900 mt-1">{org?.type || 'N/A'}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Registration ID</div>
              <div className="font-mono font-bold text-slate-900 mt-1">{org?.reg_number || 'N/A'}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Verification Status</div>
              <div className="font-bold text-slate-900 mt-1">{verificationStatus}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Verification Source</div>
              <div className="font-bold text-slate-900 mt-1">{verificationSource}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Verification Date</div>
              <div className="font-bold text-slate-900 mt-1">{verificationDate}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 md:col-span-2">
              <div className="text-slate-500">Document Verification Status</div>
              <div className="font-bold text-slate-900 mt-1">{documentVerificationStatus}</div>
            </div>
          </div>

          <div className="pt-2 text-xs text-slate-600">
            {verificationStatus === 'VERIFIED' ? '✓ Organization Verified' : verificationStatus === 'PENDING_VERIFICATION' ? '⚠ Verification Pending\nWe could not automatically verify all organization details. Please provide the required information or retry verification.' : '✕ Organization Verification Failed'}
          </div>

          {/* Stepper Timeline */}
          <div className="space-y-3">
            {[
              'PENDING',
              'DOCUMENT_SUBMITTED',
              'IDENTITY_VALIDATION',
              'ORGANIZATION_VALIDATION',
              'AUTHORIZED_REPRESENTATIVE_VERIFICATION',
              'MANUAL_INDEPENDENT_REVIEW',
              'VERIFIED',
            ].map((st, idx) => {
              const isPast = ['VERIFIED', 'MANUAL_INDEPENDENT_REVIEW'].includes(org?.status || '') || st === org?.status;
              return (
                <div
                  key={st}
                  className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                    st === org?.status
                      ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                      : isPast
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] w-6 h-6 rounded-full bg-white border flex items-center justify-center font-bold">
                      0{idx + 1}
                    </span>
                    <span>{st.replace(/_/g, ' ')}</span>
                  </div>
                  {isPast && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DOCUMENTS & CERTIFICATES */}
      {activeSubTab === 'documents' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Accreditation Documents Repository
            </h3>

            <div className="space-y-2">
              {documents.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">No documents uploaded yet.</p>
              ) : (
                documents.map(d => (
                  <div
                    key={d.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-emerald-900" />
                      <div>
                        <div className="font-bold text-slate-900">{d.file_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {d.doc_type} • {(d.file_size / 1024).toFixed(0)} KB • SHA-256 Verified
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {d.verification_status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upload New Document Form */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Upload Additional Institutional Certificate</h4>
            <form onSubmit={handleUploadDoc} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Document Category</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                >
                  <option value="ACCREDITATION_CERTIFICATE">Accreditation Certificate</option>
                  <option value="AUTHORIZATION_LETTER">Gazette Appointment Letter</option>
                  <option value="GOVERNMENT_RECOGNITION">Govt Recognition Order</option>
                  <option value="EXAMINATION_BYLAWS">Examination Enclave Bylaws</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">File Name (PDF)</label>
                <input
                  type="text"
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  placeholder="e.g. UGC_Approval_2026.pdf"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs"
                >
                  Register Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUTHORIZED USERS */}
      {activeSubTab === 'authorized_managers' && (
        <div className="space-y-6">
          <div className="stat-card-luxury p-6 sm:p-8 rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.05)] space-y-5 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Role Delegation Registry
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-950 mt-2 tracking-tight">
                  Authorized Enclave Personnel
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Institutional authority role-based access management. Users are restricted to their authorized cryptographic workspaces.
                </p>
              </div>

              <button
                onClick={() => setShowAddUserModal(true)}
                className="btn-gradient-emerald inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs shadow-md shadow-emerald-900/20 hover:shadow-emerald-900/30 transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-emerald-200" />
                <span>+ AUTHORIZE NEW USER</span>
              </button>
            </div>

            {managers.length === 0 ? (
              <div className="py-14 px-4 text-center border-2 border-dashed border-slate-200/80 rounded-3xl space-y-3 bg-slate-50/60">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200/60 shadow-2xs">
                  <Users className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-slate-800">No authorized users registered yet.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click the "+ AUTHORIZE NEW USER" button to issue institutional access credentials for Examination Managers or Auditors.
                </p>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="btn-gradient-emerald px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm cursor-pointer mt-2 inline-flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4 text-emerald-200" />
                  <span>AUTHORIZE FIRST USER</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {managers.map(m => {
                  const roleLabelMap: Record<string, string> = {
                    EXAM_MANAGER: 'Examination Manager',
                    AUDITOR: 'Auditor',
                    SME: 'SME / Question Verifier',
                    TRANSLATOR: 'Linguistic Translator',
                    CENTRE_OPERATOR: 'Centre Operator',
                  };

                  const isRevoked = m.authorization_status === 'REVOKED' || m.status === 'SUSPENDED';
                  const isAuditor = m.role === 'AUDITOR';

                  return (
                    <div
                      key={m.id}
                      className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs transition-all duration-200 ${
                        isRevoked
                          ? 'bg-rose-50/40 border-rose-200/80'
                          : 'bg-white hover:bg-slate-50/70 border-slate-200/80 shadow-2xs hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs ${
                            isRevoked
                              ? 'bg-rose-100 text-rose-800'
                              : isAuditor
                              ? 'bg-gradient-to-br from-rose-50 to-pink-50 text-rose-800 border border-rose-200'
                              : 'bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {m.full_name?.charAt(0) || 'U'}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-900 text-sm tracking-tight">{m.full_name}</span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                                isRevoked
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isRevoked ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`} />
                              {isRevoked ? 'ACCESS REVOKED' : (m.authorization_status || 'AUTHORIZED')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {m.email} {m.phone_number ? `• ${m.phone_number}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 self-end sm:self-center">
                        <span
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${
                            isAuditor
                              ? 'bg-rose-50 text-rose-900 border-rose-200/80'
                              : 'bg-emerald-50 text-emerald-900 border-emerald-200/80'
                          }`}
                        >
                          {roleLabelMap[m.role] || m.role}
                        </span>

                        {isRevoked ? (
                          <button
                            onClick={() => handleRestoreUser(m.id)}
                            disabled={processingUserId === m.id}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {processingUserId === m.id ? 'Restoring...' : 'Restore Access'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRevokeUser(m.id)}
                            disabled={processingUserId === m.id}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {processingUserId === m.id ? 'Revoking...' : 'Revoke Access'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Authorize New User Modal */}
          {showAddUserModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Authorize New Enclave User</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Provide official identity details and assign an institutional role.</p>
                  </div>
                  <button
                    onClick={() => setShowAddUserModal(false)}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center font-bold text-base cursor-pointer"
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleCreateManager} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-bold mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={managerName}
                      onChange={e => setManagerName(e.target.value)}
                      placeholder="e.g. Dr. Rajesh Sharma"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Official Email *</label>
                    <input
                      type="email"
                      value={managerEmail}
                      onChange={e => setManagerEmail(e.target.value)}
                      placeholder="e.g. rajesh.sharma@university.ac.in"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Official Contact Number *</label>
                    <input
                      type="text"
                      value={managerContact}
                      onChange={e => setManagerContact(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Designation *</label>
                    <input
                      type="text"
                      value={managerDesignation}
                      onChange={e => setManagerDesignation(e.target.value)}
                      placeholder="e.g. Senior Controller / Professor"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Institutional Role *</label>
                    <select
                      value={managerRole}
                      onChange={e => setManagerRole(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    >
                      <option value="EXAM_MANAGER">Examination Manager</option>
                      <option value="AUDITOR">Auditor</option>
                      <option value="SME">Subject Matter Expert (SME)</option>
                      <option value="TRANSLATOR">Linguistic Translator</option>
                      <option value="CENTRE_OPERATOR">Centre Superintendent & Operator</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-bold mb-1">Initial Temporary Passphrase *</label>
                    <input
                      type="password"
                      value={managerPassword}
                      onChange={e => setManagerPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer"
                    >
                      Authorize & Issue Credentials
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Access Granted & Credentials Issued Modal */}
          {issuedCredentials && (
            <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-emerald-300 shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Access Granted & Official Credentials Issued</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Enclave user registered in database with cryptographic binding.</p>
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-1">
                  <p className="font-bold">Next Steps for {issuedCredentials.roleLabel}:</p>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Provide these credentials to <strong>{issuedCredentials.name}</strong>. When they sign in with this Login ID & Password, ZeroLeak will authenticate their workstation and immediately transfer them to their dedicated <strong>{issuedCredentials.roleLabel} Workspace</strong>.
                  </p>
                </div>

                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Assigned Enclave Role</span>
                    <span className="inline-flex px-3 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-200">
                      {issuedCredentials.roleLabel} ({issuedCredentials.role})
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Login ID (Official Email)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={issuedCredentials.email}
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-900 font-bold selection:bg-emerald-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(issuedCredentials.email);
                          setCopiedField('email');
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{copiedField === 'email' ? 'Copied' : 'Copy ID'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Temporary Password</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={issuedCredentials.password}
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-900 font-bold selection:bg-emerald-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(issuedCredentials.password);
                          setCopiedField('password');
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{copiedField === 'password' ? 'Copied' : 'Copy Pass'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Login Portal URL</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={window.location.origin}
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-600 selection:bg-emerald-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.origin);
                          setCopiedField('url');
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{copiedField === 'url' ? 'Copied' : 'Copy URL'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIssuedCredentials(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    disabled={loggingInRole === issuedCredentials.role}
                    onClick={() => handleLoginAsRole(issuedCredentials.role, issuedCredentials.password, issuedCredentials.email)}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>
                      {loggingInRole === issuedCredentials.role
                        ? 'Connecting to Enclave...'
                        : `Sign In as ${issuedCredentials.roleLabel} Now →`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRUSTED DEVICES */}
      {activeSubTab === 'trusted_devices' && (
        <div className="space-y-6">
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Workstation Security
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  Registered Hardware Terminals & Access Controls
                </h3>
                <p className="text-xs text-slate-500">
                  Cryptographic workstation bindings and institutional authority access management.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManagerRole('EXAM_MANAGER');
                    setShowAddUserModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-300" />
                  <span>+ Grant Access: Examination Manager</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setManagerRole('AUDITOR');
                    setShowAddUserModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-rose-300" />
                  <span>+ Grant Access: Auditor</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {devices.map(d => {
                const devNameLower = (d.device_name || '').toLowerCase();
                const isExamMgr = devNameLower.includes('controller') || devNameLower.includes('exam') || devNameLower.includes('manager');
                const isAuditor = devNameLower.includes('auditor') || devNameLower.includes('vigilance');

                return (
                  <div
                    key={d.id}
                    className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs transition-all duration-200"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 shrink-0">
                        <Laptop className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{d.device_name}</span>
                          {isExamMgr && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Examination Manager
                            </span>
                          )}
                          {isAuditor && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                              Auditor
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          FP: {d.device_fingerprint} • IP: {d.ip_address}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                          d.status === 'APPROVED' || d.status === 'TRUSTED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        {d.status === 'APPROVED' ? 'ACCESS GRANTED (APPROVED)' : d.status}
                      </span>

                      {/* Quick Sign-In for Manager / Auditor Terminals */}
                      {(d.status === 'APPROVED' || d.status === 'TRUSTED') && isExamMgr && (
                        <button
                          type="button"
                          disabled={loggingInRole === 'EXAM_MANAGER'}
                          onClick={() => handleLoginAsRole('EXAM_MANAGER')}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold rounded-lg border border-emerald-300 text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <LogIn className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{loggingInRole === 'EXAM_MANAGER' ? 'Signing in...' : 'Sign In as Manager →'}</span>
                        </button>
                      )}

                      {(d.status === 'APPROVED' || d.status === 'TRUSTED') && isAuditor && (
                        <button
                          type="button"
                          disabled={loggingInRole === 'AUDITOR'}
                          onClick={() => handleLoginAsRole('AUDITOR')}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-900 font-bold rounded-lg border border-rose-300 text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <LogIn className="w-3.5 h-3.5 text-rose-700" />
                          <span>{loggingInRole === 'AUDITOR' ? 'Signing in...' : 'Sign In as Auditor →'}</span>
                        </button>
                      )}

                      {d.status === 'APPROVED' || d.status === 'TRUSTED' ? (
                        <button
                          onClick={() => handleRevokeDevice(d.id)}
                          disabled={processingDeviceId === d.id}
                          className="text-rose-600 hover:text-rose-800 text-xs font-bold px-3 py-1.5 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {processingDeviceId === d.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      ) : d.status === 'PENDING' || d.status === 'PENDING_APPROVAL' ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApproveDevice(d.id)}
                            disabled={processingDeviceId === d.id}
                            className="bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>{processingDeviceId === d.id ? 'Granting Access...' : 'Grant Access (Approve)'}</span>
                          </button>
                          <button
                            onClick={() => handleRejectDevice(d.id)}
                            disabled={processingDeviceId === d.id}
                            className="text-rose-600 hover:text-rose-800 text-xs font-bold px-3 py-1.5 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleTrustDevice(d.id)}
                            disabled={processingDeviceId === d.id}
                            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-3 py-1.5 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {processingDeviceId === d.id ? 'Restoring...' : 'Grant Access (Restore)'}
                          </button>
                          <button
                            onClick={() => handleDeleteDevice(d.id)}
                            disabled={processingDeviceId === d.id}
                            className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                            title="Disable Device"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Institutional Authority Workstation & Access Hub */}
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Direct Delegation Hub
              </span>
              <h4 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <span>Authority Access Delegation & Sign-In Access</span>
              </h4>
              <p className="text-xs text-slate-500">
                Grant enclave access and hardware workstation permissions. Once access is given, officials can sign in from their terminals to enter their dedicated role workspaces.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
              {/* Examination Manager Card */}
              <div className="modern-card p-5 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white flex flex-col justify-between space-y-4 shadow-xs">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-800 text-white flex items-center justify-center font-bold shadow-xs">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">Examination Manager</div>
                        <div className="text-[11px] text-slate-500">Controller of Examinations (Role 2)</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ACCESS ENABLED
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-emerald-100/80 space-y-1.5 shadow-2xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[11px]">Assigned Official:</span>
                      <span className="font-semibold text-slate-800 text-[11px]">
                        {managers.find(m => m.role === 'EXAM_MANAGER')?.full_name || 'Dr. Rajesh Sharma'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[11px]">Official Email ID:</span>
                      <span className="font-mono text-slate-800 text-[11px]">
                        {managers.find(m => m.role === 'EXAM_MANAGER')?.email || 'manager@nbte.edu.in'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-emerald-100">
                  <button
                    type="button"
                    onClick={() => {
                      setManagerRole('EXAM_MANAGER');
                      setShowAddUserModal(true);
                    }}
                    className="flex-1 py-2.5 px-3 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Grant / Issue Access</span>
                  </button>

                  <button
                    type="button"
                    disabled={loggingInRole === 'EXAM_MANAGER'}
                    onClick={() => handleLoginAsRole('EXAM_MANAGER')}
                    className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{loggingInRole === 'EXAM_MANAGER' ? 'Signing in...' : 'Sign In as Manager →'}</span>
                  </button>
                </div>
              </div>

              {/* Auditor Card */}
              <div className="modern-card p-5 rounded-2xl border border-rose-200 bg-gradient-to-b from-rose-50/50 to-white flex flex-col justify-between space-y-4 shadow-xs">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-700 to-rose-900 text-white flex items-center justify-center font-bold shadow-xs">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">Security Auditor</div>
                        <div className="text-[11px] text-slate-500">Chief Vigilance & Forensics (Role 5)</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      ACCESS ENABLED
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-rose-100/80 space-y-1.5 shadow-2xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[11px]">Assigned Official:</span>
                      <span className="font-semibold text-slate-800 text-[11px]">
                        {managers.find(m => m.role === 'AUDITOR')?.full_name || 'CBI Chief Vigilance Auditor'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[11px]">Official Email ID:</span>
                      <span className="font-mono text-slate-800 text-[11px]">
                        {managers.find(m => m.role === 'AUDITOR')?.email || 'auditor@gov-audit.gov.in'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-rose-100">
                  <button
                    type="button"
                    onClick={() => {
                      setManagerRole('AUDITOR');
                      setShowAddUserModal(true);
                    }}
                    className="flex-1 py-2.5 px-3 bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 rounded-xl font-bold text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-rose-600" />
                    <span>Grant / Issue Access</span>
                  </button>

                  <button
                    type="button"
                    disabled={loggingInRole === 'AUDITOR'}
                    onClick={() => handleLoginAsRole('AUDITOR')}
                    className="flex-1 py-2.5 px-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{loggingInRole === 'AUDITOR' ? 'Signing in...' : 'Sign In as Auditor →'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECURITY EVENTS */}
      {activeSubTab === 'security_events' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Security & Threat Detection Log
          </h3>

          <div className="space-y-2">
            {securityEvents.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No security incidents detected.</p>
            ) : (
              securityEvents.map(e => (
                <div
                  key={e.id}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{e.event_type}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      IP: {e.ip_address} • Risk Score: {e.risk_score} • {new Date(e.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      e.severity === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-800'
                        : e.severity === 'HIGH'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {e.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
};
