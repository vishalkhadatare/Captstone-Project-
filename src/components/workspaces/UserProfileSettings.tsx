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

      {/* USER PROFILE TAB */}
      {activeSubTab === 'profile' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-900 text-white flex items-center justify-center font-bold text-lg shadow-xs">
              {currentUser?.full_name
                ? currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                : 'OP'}
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">{currentUser?.full_name}</h2>
              <p className="text-xs text-slate-500">{currentUser?.email}</p>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                {currentUser?.role ? roleLabelMap[currentUser.role] || currentUser.role : 'OPERATOR'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Organization ID</span>
              <span className="font-mono font-bold text-slate-900">{currentUser?.org_id}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Assigned Role (Read-Only)</span>
              <span className="font-bold text-slate-900">{currentUser?.role}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Account Authority</span>
              <span className="font-bold text-emerald-700">ACTIVE & CRYPTOGRAPHICALLY BOUND</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Bound Hardware Workstation</span>
              <span className="font-mono text-slate-700">{deviceFp}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="text-sm font-bold text-slate-900">User Profile</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Full Name</span>
                <span className="font-bold text-slate-900">{currentUser?.full_name}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Email</span>
                <span className="font-mono font-bold text-slate-900">{currentUser?.email}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Role</span>
                <span className="font-bold text-slate-900">
                  {currentUser?.role ? roleLabelMap[currentUser.role] || currentUser.role : 'Operator'}
                </span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Account Type</span>
                <span className="font-bold text-slate-900">Organization Owner</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200 sm:col-span-2">
                <span className="text-slate-500 block">User Status</span>
                <span className="font-bold text-emerald-700">Active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECURITY SETTINGS & PASSPHRASE TAB */}
      {activeSubTab === 'security_settings' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b pb-2">
              Update Enclave Access Passphrase
            </h3>

            <form onSubmit={handleUpdatePassword} className="space-y-4 text-xs max-w-md">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Current Passphrase *</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">New Passphrase *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Confirm New Passphrase *</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs"
              >
                Update Passphrase
              </button>
            </form>
          </div>

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Enclave Session Management</h4>
            <p className="text-xs text-slate-500">
              Terminating your session immediately invalidates your JWT access token on the server and releases hardware memory resources.
            </p>
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5"
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
