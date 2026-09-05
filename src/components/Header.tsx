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
    <header className="sticky top-0 z-30 w-full h-16 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 text-slate-900 px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-all shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
      {/* Official ZeroLeak Logo */}
      <div className="flex items-center gap-4">
        <ZeroLeakLogo size="md" imgHeightClass="h-9 sm:h-11 md:h-12" showWordmark variant="lockup" />
      </div>

      {/* Authenticated Institutional Security Status & User Bar */}
      {currentUser && (
        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          {/* Institutional Status Badge */}
          <div className="hidden md:inline-flex items-center gap-2 bg-emerald-50/90 text-emerald-900 px-3.5 py-1.5 rounded-full border border-emerald-200/90 shadow-2xs backdrop-blur-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider">
              Enclave Active • FIPS 140-2
            </span>
          </div>

          {/* Hardware Device Fingerprint Badge */}
          <div className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 text-[10px] font-mono shadow-xs">
            <Laptop className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate max-w-[100px] text-slate-300">{deviceFp}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Terminal Authorized</span>
          </div>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition-all shadow-2xs hover:shadow-xs cursor-pointer"
              title="System Alerts & Notifications"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center shadow-xs animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-84 bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200/90 shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 mb-1">
                  <span className="font-bold text-xs text-slate-900">Security & Operational Alerts</span>
                  <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-full">
                    {notifications.length} Total
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1.5 p-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-400 p-6 text-center">No alerts recorded.</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => handleMarkRead(n.id)}
                        className={`p-3 rounded-xl text-xs cursor-pointer transition-all ${
                          n.is_read
                            ? 'bg-slate-50/70 text-slate-600 hover:bg-slate-100/70'
                            : 'bg-emerald-50/80 text-slate-900 border border-emerald-200/80 shadow-2xs hover:bg-emerald-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          {n.category === 'SECURITY' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          ) : (
                            <FileCheck2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          )}
                          <span className="text-xs">{n.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                        <span className="text-[9px] text-slate-400 block mt-1.5 font-mono">
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
          <div className="flex items-center gap-3 border-l border-slate-200 pl-3 sm:pl-4">
            <button
              onClick={() => onNavigateProfile?.()}
              className="text-right hidden sm:block hover:opacity-90 transition-opacity cursor-pointer group"
            >
              <p className="text-xs font-black text-slate-900 leading-tight group-hover:text-emerald-800 transition-colors">
                {currentUser.full_name}
              </p>
              <span className="inline-block text-[10px] font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80 mt-0.5 shadow-2xs">
                {roleLabelMap[currentUser.role] || currentUser.role}
              </span>
            </button>

            <div
              onClick={() => onNavigateProfile?.()}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-800 via-teal-700 to-emerald-950 text-white flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer shadow-sm ring-2 ring-emerald-100 hover:ring-emerald-400 transition-all hover:scale-105"
              title="View User Profile & Security Settings"
            >
              {currentUser.full_name
                ? currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                : 'OP'}
            </div>

            {/* Direct Logout Button */}
            <button
              onClick={onLogout}
              title="Terminate Secure Session"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
