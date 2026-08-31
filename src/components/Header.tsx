import React, { useState, useEffect } from 'react';
import { ZeroLeakLogo } from './ZeroLeakLogo';
import { User, NotificationItem } from '../types';
import { api, getDeviceFingerprint } from '../api';
import {
  Bell,
  Laptop,
  Building2,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  onNavigateProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  onNavigateProfile,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const deviceFp = getDeviceFingerprint();

  useEffect(() => {
    if (currentUser) {
      loadNotifications();
    }
  }, [currentUser]);

  const loadNotifications = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications || []);
    } catch {
      // ignore
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: 1 } : n)));
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const roleLabelMap: Record<string, string> = {
    ORG_OWNER: 'Organization Owner / Registrar',
    EXAM_MANAGER: 'Examination Manager',
    SME: 'Subject Matter Expert',
    CENTRE_OPERATOR: 'Examination Centre Operator',
    AUDITOR: 'Independent Security Auditor',
  };

  return (
    <header className="sticky top-0 z-30 w-full h-16 bg-white border-b border-[#E2E8F0] text-[#0F172A] px-4 lg:px-8 flex items-center justify-between transition-colors shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      {/* Official ZeroLeak Logo */}
      <div className="flex items-center gap-4">
        <ZeroLeakLogo size="md" imgHeightClass="h-10 sm:h-12 md:h-14" showWordmark variant="lockup" />
      </div>

      {/* Authenticated Institutional Security Status & User Bar */}
      {currentUser && (
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          {/* Institutional Status Badge */}
          <div className="hidden md:flex items-center gap-2 bg-[#CCFBF1] text-[#047857] px-3 py-1 rounded-full border border-[#99F6E4]">
            <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Enclave Active • FIPS 140-2
            </span>
          </div>

          {/* Hardware Device Fingerprint Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] font-mono text-[10px]">
            <Laptop className="w-3 h-3 text-[#047857]" />
            <span className="truncate max-w-[120px]">{deviceFp}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-[10px] font-bold uppercase tracking-wide">
            <ShieldCheck className="w-3 h-3" />
            <span>Device Status: Authorized</span>
          </div>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569] transition-colors"
              title="System Alerts & Notifications"
            >
              <Bell className="w-4 h-4 text-[#475569]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-[#E2E8F0] shadow-[0_12px_28px_rgba(15,23,42,0.08)] p-2 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#E2E8F0] mb-1">
                  <span className="font-bold text-xs text-[#0F172A]">Security & Operational Alerts</span>
                  <span className="text-[10px] text-[#64748B] font-mono">{notifications.length} Total</span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-400 p-4 text-center">No alerts recorded.</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => handleMarkRead(n.id)}
                        className={`p-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          n.is_read
                            ? 'bg-[#F8FAFC] text-[#64748B]'
                            : 'bg-[#ECFDF5] text-[#0F172A] border border-[#A7F3D0]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          {n.category === 'SECURITY' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          ) : (
                            <FileCheck2 className="w-3.5 h-3.5 text-emerald-900 shrink-0" />
                          )}
                          <span>{n.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{n.message}</p>
                        <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                          {new Date(n.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Role Info Block */}
          <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
            <button
              onClick={() => onNavigateProfile?.()}
              className="text-right hidden sm:block hover:opacity-80 transition-opacity"
            >
              <p className="text-xs font-bold text-[#0F172A] leading-tight">{currentUser.full_name}</p>
              <span className="inline-block text-[10px] font-semibold text-[#047857] bg-[#ECFDF5] px-1.5 py-0.5 rounded border border-[#A7F3D0] mt-0.5">
                {roleLabelMap[currentUser.role] || currentUser.role}
              </span>
            </button>

            <div
              onClick={() => onNavigateProfile?.()}
              className="w-8 h-8 rounded-lg bg-[#047857] text-white flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer shadow-[0_4px_12px_rgba(4,120,87,0.25)]"
              title="View Organization Profile"
            >
              {currentUser.full_name
                ? currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                : 'OP'}
            </div>

            {/* Direct Logout Button */}
            <button
              onClick={onLogout}
              title="Terminate Secure Session"
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] border border-transparent hover:border-[#FECACA] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
