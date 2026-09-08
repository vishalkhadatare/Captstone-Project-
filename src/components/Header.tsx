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
    <header className="sticky top-0 z-30 w-full h-16 bg-white border-b border-slate-200 text-slate-900 px-4 lg:px-8 flex items-center justify-between transition-colors shadow-xs">
      {/* Official ZeroLeak Logo (standard brand mark) */}
      <div className="flex items-center gap-4">
        <ZeroLeakLogo size="md" variant="standard" showSubtitle={false} />
      </div>

      {/* Authenticated Institutional Security Status & User Bar */}
      {currentUser && (
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          {/* Institutional Status Badge */}
          <div className="hidden md:flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200/80">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Enclave Active • FIPS 140-2
            </span>
          </div>

          {/* Hardware Device Fingerprint Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-50 border border-stone-200 text-stone-700 font-mono text-[10px]">
            <Laptop className="w-3 h-3 text-emerald-900" />
            <span className="truncate max-w-[120px]">{deviceFp}</span>
          </div>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors"
              title="System Alerts & Notifications"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 mb-1">
                  <span className="font-bold text-xs text-slate-900">Security & Operational Alerts</span>
                  <span className="text-[10px] text-slate-400 font-mono">{notifications.length} Total</span>
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
                            ? 'bg-slate-50 text-slate-500'
                            : 'bg-emerald-50 text-slate-900 border border-emerald-200/80'
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
              onClick={onNavigateProfile}
              className="text-right hidden sm:block hover:opacity-80 transition-opacity"
            >
              <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser.full_name}</p>
              <span className="inline-block text-[10px] font-semibold text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">
                {roleLabelMap[currentUser.role] || currentUser.role}
              </span>
            </button>

            <div
              onClick={onNavigateProfile}
              className="w-8 h-8 rounded-lg bg-emerald-900 text-white flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer shadow-xs"
              title="View Account Profile & Security Settings"
            >
              {currentUser.full_name
                ? currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                : 'OP'}
            </div>

            {/* Direct Logout Button */}
            <button
              onClick={onLogout}
              title="Terminate Secure Session"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
