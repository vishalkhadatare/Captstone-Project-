import React, { useState, useEffect } from 'react';
import { User, NotificationItem } from '../types';
import { api, getDeviceFingerprint } from '../api';
import {
  Bell,
  Laptop,
  LogOut,
  AlertTriangle,
  FileCheck2,
  ShieldCheck,
  ArrowRight,
  Sun,
  Moon,
  Shield,
  Lock,
} from 'lucide-react';
import { ZeroLeakLogo } from './ZeroLeakLogo';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  onNavigateProfile?: () => void;
  onNavigateTab?: (tab: any) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  onNavigateProfile,
  onNavigateTab,
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

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('zeroleak_theme');
      if (stored) return stored === 'dark';
      return document.documentElement.classList.contains('dark') && false;
    }
    return false;
  });

  const toggleHeaderTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('zeroleak_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('zeroleak_theme', 'light');
    }
  };

  const roleLabelMap: Record<string, string> = {
    ORG_OWNER: 'Organization Owner / Registrar',
    EXAM_MANAGER: 'Controller of Examinations',
    TRANSLATOR: 'Linguistic Translator',
    CENTRE_OPERATOR: 'Examination Centre Superintendent',
    AUDITOR: 'Independent Security Auditor',
  };

  return (
    <header className="sticky top-0 z-40 w-full h-[68px] bg-white/95 backdrop-blur-xl border-b border-[#E6ECEA] text-[#172A35] px-4 sm:px-6 flex items-center justify-between transition-all shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
      {/* Left: Professional Shield Logo & Wordmark */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 group cursor-pointer" onClick={() => onNavigateTab?.('dashboard')}>
          <div className="w-8 h-8 rounded-lg bg-[#008A63] flex items-center justify-center shadow-xs group-hover:bg-[#007050] transition-colors">
            <Shield className="w-4 h-4 text-white" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-black text-sm tracking-wider text-[#172A35]">
                ZEROLEAK
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6]">
                PRO
              </span>
            </div>
            <span className="text-[8.5px] font-mono tracking-widest text-[#66777A] uppercase font-semibold block leading-none">
              SECURE EXAMINATION INFRASTRUCTURE
            </span>
          </div>
        </div>
      </div>

      {/* Center: Compact Security Status Pills */}
      <div className="hidden lg:flex items-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECFBF5] border border-[#B8EBD6] text-[#008A63] text-[10px] font-mono font-bold shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#008A63] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#008A63]"></span>
          </span>
          <span>ENCLAVE ACTIVE</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F8FA] border border-[#DCE5E8] text-[#52636B] text-[10px] font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#008A63]" />
          <span>FIPS 140-2</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F8FA] border border-[#DCE5E8] text-[#52636B] text-[10px] font-mono font-bold">
          <Lock className="w-3 h-3 text-[#2474A6]" />
          <span>AES-256</span>
        </div>
      </div>

      {/* Right Side: Terminal ID, System status, Notification, Theme, Profile, Logout */}
      {currentUser && (
        <div className="flex items-center gap-2.5 sm:gap-3 text-xs">
          {/* Terminal ID */}
          <div className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F5F8FA] text-[#52636B] border border-[#DCE5E8] text-[10px] font-mono">
            <Laptop className="w-3 h-3 text-[#008A63]" />
            <span className="truncate max-w-[85px]">{deviceFp || 'TERM-01'}</span>
          </div>

          {/* System status pill */}
          <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFBF5] border border-[#B8EBD6] text-[#008A63] text-[10px] font-mono font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#008A63]" />
            <span>SYSTEM SECURE</span>
          </div>

          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleHeaderTheme}
            className="p-2 rounded-lg bg-[#F5F8FA] hover:bg-[#EDF2F4] border border-[#DCE5E8] text-[#52636B] hover:text-[#172A35] transition-all cursor-pointer"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Security Mode"}
          >
            {isDark ? <Sun className="w-4 h-4 text-[#F5B942]" /> : <Moon className="w-4 h-4 text-[#52636B]" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-lg bg-[#F5F8FA] hover:bg-[#EDF2F4] border border-[#DCE5E8] text-[#52636B] hover:text-[#172A35] transition-all cursor-pointer"
              title="System Alerts & Audit Trail"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D64550] text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-white rounded-xl border border-[#E6ECEA] shadow-xl p-2.5 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#E6ECEA] mb-1">
                  <span className="font-mono font-bold text-xs text-[#172A35]">Security & Operational Alerts</span>
                  <span className="text-[10px] text-[#008A63] font-mono bg-[#ECFBF5] px-2 py-0.5 rounded-full border border-[#B8EBD6]">
                    {notifications.length} Total
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1.5 p-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[#66777A] p-6 text-center">No alerts recorded in active session.</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => handleMarkRead(n.id)}
                        className={`p-3 rounded-lg text-xs cursor-pointer transition-all ${
                          n.is_read
                            ? 'bg-[#F8FAFA] text-[#52636B] border border-[#EDF2F0] hover:bg-[#F0F5F3]'
                            : 'bg-[#ECFBF5]/70 text-[#172A35] border border-[#B8EBD6] hover:bg-[#ECFBF5]'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          {n.category === 'SECURITY' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-[#C98200] shrink-0" />
                          ) : (
                            <FileCheck2 className="w-3.5 h-3.5 text-[#008A63] shrink-0" />
                          )}
                          <span className="text-xs truncate">{n.title}</span>
                        </div>
                        <p className="text-[11px] text-[#52636B] mt-1 leading-relaxed">{n.message}</p>
                        <span className="text-[9px] text-[#879598] block mt-1.5 font-mono">
                          {new Date(n.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile: Prof. Rajesh Sharma, Controller of Examinations */}
          <div className="flex items-center gap-2.5 border-l border-[#E6ECEA] pl-3">
            <button
              type="button"
              onClick={() => onNavigateProfile?.()}
              className="text-right hidden sm:block hover:opacity-90 transition-opacity cursor-pointer group"
            >
              <p className="text-xs font-bold text-[#172A35] leading-tight group-hover:text-[#008A63] transition-colors">
                {currentUser.full_name || 'Prof. Rajesh Sharma'}
              </p>
              <span className="text-[10px] font-mono text-[#008A63] font-semibold">
                {roleLabelMap[currentUser.role] || 'Controller of Examinations'}
              </span>
            </button>

            {/* Avatar Initials Pill */}
            <div
              onClick={() => onNavigateProfile?.()}
              className="w-8 h-8 rounded-lg bg-[#ECFBF5] border border-[#B8EBD6] text-[#008A63] flex items-center justify-center font-mono font-bold text-xs shrink-0 cursor-pointer shadow-2xs hover:scale-105 transition-all"
              title="View User Profile & Security Settings"
            >
              {currentUser.full_name
                ? currentUser.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                : 'RS'}
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={onLogout}
              title="Terminate Secure Session"
              className="p-2 rounded-lg text-[#52636B] hover:text-[#D64550] hover:bg-[#FFF0F1] border border-transparent hover:border-[#FAD1D5] transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
