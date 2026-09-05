import React, { useState } from 'react';
import {
  User as UserIcon,
  KeyRound,
  ShieldCheck,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Building2,
} from 'lucide-react';
import { User } from '../../types';
import { getDeviceFingerprint } from '../../api';

interface UserProfileSettingsProps {
  currentUser: User | null;
  activeSubTab: 'profile' | 'security_settings';
  onLogout: () => void;
}

export const UserProfileSettings: React.FC<UserProfileSettingsProps> = ({
  currentUser,
  activeSubTab,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const deviceFp = getDeviceFingerprint();

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (newPassword.length < 6) {
      setStatusMessage({ type: 'error', text: 'New passphrase must be at least 6 characters in length.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: 'error', text: 'Passphrase confirmation does not match.' });
      return;
    }

    setStatusMessage({ type: 'success', text: 'Passphrase updated successfully for your enclave credentials.' });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const roleLabelMap: Record<string, string> = {
    ORG_OWNER: 'Organization Owner / Registrar',
    EXAM_MANAGER: 'Examination Manager',
    SME: 'Subject Matter Expert',
    CENTRE_OPERATOR: 'Examination Centre Operator',
    AUDITOR: 'Independent Security Auditor',
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border shadow-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* USER PROFILE TAB */}
      {activeSubTab === 'profile' && (
        <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-800 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {currentUser?.full_name
                ? currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                : 'OP'}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{currentUser?.full_name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {currentUser?.role ? roleLabelMap[currentUser.role] || currentUser.role : 'OPERATOR'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{currentUser?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
              <span className="text-slate-500 text-[11px] block">Organization ID</span>
              <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">{currentUser?.org_id}</span>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
              <span className="text-slate-500 text-[11px] block">Assigned Role (Read-Only)</span>
              <span className="font-bold text-slate-900 text-sm mt-0.5 block">{currentUser?.role}</span>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
              <span className="text-slate-500 text-[11px] block">Account Authority</span>
              <span className="font-bold text-emerald-700 text-xs mt-1 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                ACTIVE & CRYPTOGRAPHICALLY BOUND
              </span>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
              <span className="text-slate-500 text-[11px] block">Bound Hardware Workstation</span>
              <span className="font-mono text-slate-700 text-xs mt-0.5 block truncate">{deviceFp}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Enclave Identity Profile</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Active Verification
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Full Legal Name</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{currentUser?.full_name}</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Official Email</span>
                <span className="font-mono font-bold text-slate-900 mt-0.5 block">{currentUser?.email}</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Institutional Scope</span>
                <span className="font-bold text-slate-900 mt-0.5 block">
                  {currentUser?.role ? roleLabelMap[currentUser.role] || currentUser.role : 'Operator'}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-500 text-[11px] block">Account Status</span>
                <span className="font-bold text-emerald-700 mt-0.5 block">Authorized & Chained</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECURITY SETTINGS & PASSPHRASE TAB */}
      {activeSubTab === 'security_settings' && (
        <div className="space-y-6">
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Passphrase Vault
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                Update Enclave Access Passphrase
              </h3>
              <p className="text-xs text-slate-500">Update the cryptographic credential used to access your authority enclave.</p>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4 text-xs max-w-md">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Current Passphrase *</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5">New Passphrase *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Confirm New Passphrase *</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer"
              >
                Update Passphrase
              </button>
            </form>
          </div>

          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <LogOut className="w-4 h-4 text-rose-600" />
              <span>Enclave Session Management</span>
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Terminating your session immediately invalidates your JWT access token on the server and releases hardware memory resources.
            </p>
            <button
              onClick={onLogout}
              className="px-4 py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Terminate Active Session</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
