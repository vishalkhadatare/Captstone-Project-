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
} from 'lucide-react';
import { User, Organization, OrganizationDocument, TrustedDevice, SecurityEvent } from '../../types';
import { api, getDeviceFingerprint } from '../../api';
import { NavSubTab } from '../Sidebar';

interface OrgOwnerWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
}

export const OrgOwnerWorkspace: React.FC<OrgOwnerWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
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
  const [managerRole, setManagerRole] = useState<'EXAM_MANAGER' | 'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR' | 'AUDITOR'>('EXAM_MANAGER');
  const [showAddUserModal, setShowAddUserModal] = useState(false);

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
    try {
      const res = await api.authorizeManager({
        full_name: managerName,
        email: managerEmail,
        contact_number: managerContact,
        designation: managerDesignation,
        password: managerPassword,
        role: managerRole,
      });
      setStatusMessage({ type: 'success', text: res.message });
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
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Institution Governance Enclave
                </span>
                <h2 className="text-xl font-bold text-slate-900">{org?.name || 'Academic Institution Enclave'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registration ID: <span className="font-mono text-slate-700">{org?.reg_number || 'REG-PENDING'}</span> • Type: {org?.type || 'University'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : verificationStatus === 'VERIFICATION_FAILED'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  STATUS: {verificationStatus || 'PENDING_VERIFICATION'}
                </span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Authorized Personnel</span>
                <span className="text-2xl font-bold text-slate-900">{managers.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Trusted Terminals</span>
                <span className="text-2xl font-bold text-slate-900">{devices.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Accreditation Docs</span>
                <span className="text-2xl font-bold text-slate-900">{documents.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Security Events</span>
                <span className="text-2xl font-bold text-slate-900">{securityEvents.length}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-900" />
                <span>Authorized Examination Personnel</span>
              </h3>
              <div className="space-y-2">
                {managers.slice(0, 4).map(m => (
                  <div key={m.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{m.full_name}</div>
                      <div className="text-[10px] text-slate-500">{m.email}</div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Laptop className="w-4 h-4 text-emerald-900" />
                <span>Active Hardware Terminals</span>
              </h3>
              <div className="space-y-2">
                {devices.slice(0, 4).map(d => (
                  <div key={d.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{d.device_name}</div>
                      <div className="text-[10px] font-mono text-slate-500">{d.device_fingerprint}</div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                      {d.status}
                    </span>
                  </div>
                ))}
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
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Authorized Users
                </h3>
                <p className="text-xs text-slate-500">
                  Institutional authority role-based access management. Users cannot switch roles.
                </p>
              </div>

              <button
                onClick={() => setShowAddUserModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ AUTHORIZE USER</span>
              </button>
            </div>

            {managers.length === 0 ? (
              <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-xl space-y-3">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No authorized users have been added.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click the "+ AUTHORIZE USER" button to issue institutional access credentials for Examination Managers, SMEs, Operators, or Auditors.
                </p>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs"
                >
                  + AUTHORIZE USER
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {managers.map(m => {
                  const roleLabelMap: Record<string, string> = {
                    EXAM_MANAGER: 'Examination Manager',
                    SME: 'SME / Question Verifier',
                    TRANSLATOR: 'Linguistic Translator',
                    CENTRE_OPERATOR: 'Examination Centre Operator',
                    AUDITOR: 'Auditor',
                  };

                  const isRevoked = m.authorization_status === 'REVOKED' || m.status === 'SUSPENDED';

                  return (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                        isRevoked
                          ? 'bg-rose-50/50 border-rose-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{m.full_name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isRevoked
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {isRevoked ? 'ACCESS REVOKED' : (m.authorization_status || 'AUTHORIZED')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono">
                          {m.email}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                          {roleLabelMap[m.role] || m.role}
                        </span>

                        {isRevoked ? (
                          <button
                            onClick={() => handleRestoreUser(m.id)}
                            disabled={processingUserId === m.id}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors disabled:opacity-50"
                          >
                            {processingUserId === m.id ? 'Restoring...' : 'Restore Access'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRevokeUser(m.id)}
                            disabled={processingUserId === m.id}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors disabled:opacity-50"
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
            <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Authorize New Enclave User</h4>
                    <p className="text-[11px] text-slate-500">Provide official identity details and assign an institutional role.</p>
                  </div>
                  <button
                    onClick={() => setShowAddUserModal(false)}
                    className="text-slate-400 hover:text-slate-600 font-bold text-lg"
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
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs"
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
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs"
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
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs"
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
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Institutional Role *</label>
                    <select
                      value={managerRole}
                      onChange={e => setManagerRole(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs font-medium"
                    >
                      <option value="EXAM_MANAGER">Examination Manager</option>
                      <option value="SME">SME / Question Verifier</option>
                      <option value="TRANSLATOR">Linguistic Translator</option>
                      <option value="CENTRE_OPERATOR">Examination Centre Operator</option>
                      <option value="AUDITOR">Auditor</option>
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
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t">
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs"
                    >
                      Authorize & Issue Credentials
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRUSTED DEVICES */}
      {activeSubTab === 'trusted_devices' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Registered Hardware Terminals
            </h3>
            <p className="text-xs text-slate-500">
              Only authorized workstations can establish cryptographic sessions to prevent remote relay attacks.
            </p>

            <div className="space-y-2">
              {devices.map(d => (
                <div
                  key={d.id}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <Laptop className="w-4 h-4 text-emerald-900" />
                    <div>
                      <div className="font-bold text-slate-900">{d.device_name}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        FP: {d.device_fingerprint} • IP: {d.ip_address}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                        d.status === 'APPROVED' || d.status === 'TRUSTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {d.status}
                    </span>

                    {d.status === 'APPROVED' || d.status === 'TRUSTED' ? (
                      <button
                        onClick={() => handleRevokeDevice(d.id)}
                        disabled={processingDeviceId === d.id}
                        className="text-rose-600 hover:text-rose-800 text-xs font-bold px-2.5 py-1 hover:bg-rose-50 rounded border border-rose-200 transition-colors disabled:opacity-50"
                      >
                        {processingDeviceId === d.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    ) : d.status === 'PENDING' || d.status === 'PENDING_APPROVAL' ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleApproveDevice(d.id)}
                          disabled={processingDeviceId === d.id}
                          className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2 py-1 hover:bg-emerald-50 rounded border border-emerald-200 transition-colors disabled:opacity-50"
                        >
                          {processingDeviceId === d.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleRejectDevice(d.id)}
                          disabled={processingDeviceId === d.id}
                          className="text-rose-600 hover:text-rose-800 text-xs font-bold px-2 py-1 hover:bg-rose-50 rounded border border-rose-200 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleTrustDevice(d.id)}
                          disabled={processingDeviceId === d.id}
                          className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2 py-1 hover:bg-emerald-50 rounded border border-emerald-200 transition-colors disabled:opacity-50"
                        >
                          {processingDeviceId === d.id ? 'Restoring...' : 'Re-authorize'}
                        </button>
                        <button
                          onClick={() => handleDeleteDevice(d.id)}
                          disabled={processingDeviceId === d.id}
                          className="text-slate-400 hover:text-rose-600 p-1 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                          title="Disable Device"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Register Workstation Form */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Cryptographic Device Enrollment</h4>
            <p className="text-xs text-slate-500">Users enroll their own browser device at sign-in. A P-256 key is created locally, registration remains pending, and an authorized Org Owner or Auditor approves it here.</p>
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
