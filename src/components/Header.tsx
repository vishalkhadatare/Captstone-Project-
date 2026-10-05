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
      return document.documentElement.classList.contains('dark') || true;
    }
    return true;
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
    <header className="sticky top-0 z-40 w-full h-[68px] bg-[#081715]/95 backdrop-blur-2xl border-b border-white/[0.08] text-[#F4F8F7] px-4 sm:px-6 flex items-center justify-between transition-all shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
      {/* Left: Professional Shield Logo & Wordmark */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 group cursor-pointer" onClick={() => onNavigateTab?.('dashboard')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D68F] to-[#18C8B2] p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(0,214,143,0.3)]">
            <div className="w-full h-full bg-[#06110F] rounded-[6px] flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#00D68F]" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-black text-sm tracking-wider text-[#F4F8F7]">
                ZEROLEAK
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#00D68F]/15 text-[#00D68F] border border-[#00D68F]/30">
                PRO
              </span>
            </div>
            <span className="text-[8.5px] font-mono tracking-widest text-[#9AAEAA] uppercase font-semibold block leading-none">
              SECURE EXAMINATION INFRASTRUCTURE
            </span>
          </div>
        </div>
      </div>

      {/* Center: Compact Security Status Pills */}
      <div className="hidden lg:flex items-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00D68F]/10 border border-[#00D68F]/30 text-[#00D68F] text-[10px] font-mono font-bold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D68F] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00D68F]"></span>
          </span>
          <span>ENCLAVE ACTIVE</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#102723] border border-white/[0.08] text-[#9AAEAA] text-[10px] font-mono">
          <ShieldCheck className="w-3 h-3 text-[#00D68F]" />
          <span>FIPS 140-2</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#18C8B2]/10 border border-[#18C8B2]/25 text-[#18C8B2] text-[10px] font-mono font-bold">
          <Lock className="w-3 h-3 text-[#18C8B2]" />
          <span>AES-256</span>
        </div>
      </div>

      {/* Right Side: Terminal ID, System status, Notification, Theme, Profile, Logout */}
      {currentUser && (
        <div className="flex items-center gap-2.5 sm:gap-3 text-xs">
          {/* Terminal ID */}
          <div className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D211E] text-[#9AAEAA] border border-white/[0.08] text-[10px] font-mono">
            <Laptop className="w-3 h-3 text-[#00D68F]" />
            <span className="truncate max-w-[85px]">{deviceFp || 'TERM-01'}</span>
          </div>

          {/* System status pill */}
          <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#102723] border border-white/[0.08] text-[#9AAEAA] text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F]" />
            <span>SYSTEM SECURE</span>
          </div>

          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleHeaderTheme}
            className="p-2 rounded-lg bg-[#102723] hover:bg-[#132D29] border border-white/[0.08] hover:border-white/[0.16] text-[#9AAEAA] hover:text-white transition-all cursor-pointer"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Security Mode"}
          >
            {isDark ? <Sun className="w-4 h-4 text-[#F5B942]" /> : <Moon className="w-4 h-4 text-[#9AAEAA]" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-lg bg-[#102723] hover:bg-[#132D29] border border-white/[0.08] hover:border-white/[0.16] text-[#9AAEAA] hover:text-white transition-all cursor-pointer"
              title="System Alerts & Audit Trail"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FF5C6C] text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-[#0D211E] rounded-xl border border-white/[0.12] shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] mb-1">
                  <span className="font-mono font-bold text-xs text-[#F4F8F7]">Security & Operational Alerts</span>
                  <span className="text-[10px] text-[#00D68F] font-mono bg-[#00D68F]/10 px-2 py-0.5 rounded-full border border-[#00D68F]/20">
                    {notifications.length} Total
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1.5 p-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[#617773] p-6 text-center">No alerts recorded in active session.</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => handleMarkRead(n.id)}
                        className={`p-3 rounded-lg text-xs cursor-pointer transition-all ${
                          n.is_read
                            ? 'bg-[#102723]/60 text-[#9AAEAA] hover:bg-[#102723]'
                            : 'bg-[#102723] text-[#F4F8F7] border border-[#00D68F]/30 hover:border-[#00D68F]/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          {n.category === 'SECURITY' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-[#F5B942] shrink-0" />
                          ) : (
                            <FileCheck2 className="w-3.5 h-3.5 text-[#00D68F] shrink-0" />
                          )}
                          <span className="text-xs truncate">{n.title}</span>
                        </div>
                        <p className="text-[11px] text-[#9AAEAA] mt-1 leading-relaxed">{n.message}</p>
                        <span className="text-[9px] text-[#617773] block mt-1.5 font-mono">
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
          <div className="flex items-center gap-2.5 border-l border-white/[0.08] pl-3">
            <button
              type="button"
              onClick={() => onNavigateProfile?.()}
              className="text-right hidden sm:block hover:opacity-90 transition-opacity cursor-pointer group"
            >
              <p className="text-xs font-bold text-[#F4F8F7] leading-tight group-hover:text-[#00D68F] transition-colors">
                {currentUser.full_name || 'Prof. Rajesh Sharma'}
              </p>
              <span className="text-[10px] font-mono text-[#00D68F]">
                {roleLabelMap[currentUser.role] || 'Controller of Examinations'}
              </span>
            </button>

            {/* Avatar Initials Pill */}
            <div
              onClick={() => onNavigateProfile?.()}
              className="w-8 h-8 rounded-lg bg-[#102723] border border-[#00D68F]/40 text-[#00D68F] flex items-center justify-center font-mono font-bold text-xs shrink-0 cursor-pointer shadow-sm hover:scale-105 transition-all"
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
              className="p-2 rounded-lg text-[#9AAEAA] hover:text-[#FF5C6C] hover:bg-[#FF5C6C]/10 border border-transparent hover:border-[#FF5C6C]/25 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
