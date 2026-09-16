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
  ArrowRight,
  Sun,
  Moon,
} from 'lucide-react';

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
      return document.documentElement.classList.contains('dark');
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
    EXAM_MANAGER: 'Examination Manager',
    TRANSLATOR: 'Linguistic Translator',
    CENTRE_OPERATOR: 'Examination Centre Operator',
    AUDITOR: 'Independent Security Auditor',
  };

  return (
    <header className="sticky top-0 z-30 w-full h-16 bg-white/70 dark:bg-[#080B11]/50 backdrop-blur-2xl border-b border-slate-200/80 dark:border-white/[0.08] text-slate-900 dark:text-white px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-all shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
      {/* Official ZeroLeak Logo */}
      <div className="flex items-center gap-4">
        <ZeroLeakLogo size="md" imgHeightClass="h-9 sm:h-11 md:h-12" showWordmark variant="lockup" />
      </div>

      {/* Authenticated Institutional Security Status & User Bar */}
      {currentUser && (
        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          {/* Institutional Status Badge */}
          <div className="hidden md:inline-flex items-center gap-2 bg-[#00cc5f]/10 dark:bg-[#00cc5f]/15 text-[#00873d] dark:text-[#00cc5f] px-3.5 py-1.5 rounded-full border border-[#00cc5f]/30 dark:border-[#00cc5f]/40 shadow-xs backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00cc5f] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00cc5f]"></span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider">
              Enclave Active • FIPS 140-2
            </span>
          </div>

          {/* Hardware Device Fingerprint Badge */}
          <div className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 dark:bg-white/[0.05] text-slate-200 border border-slate-800 dark:border-white/10 text-[10px] font-mono shadow-xs backdrop-blur-md">
            <Laptop className="w-3.5 h-3.5 text-[#00cc5f]" />
            <span className="truncate max-w-[100px] text-slate-300">{deviceFp}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00cc5f] animate-pulse ml-0.5" />
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50/90 dark:bg-white/[0.04] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 text-[10px] font-bold shadow-2xs backdrop-blur-md">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00cc5f]" />
            <span>Terminal Authorized</span>
          </div>

          {/* Theme Switcher Button */}
          <button
            onClick={toggleHeaderTheme}
            className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.05] hover:bg-slate-100 dark:hover:bg-white/[0.1] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs backdrop-blur-md"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-xl bg-slate-50 dark:bg-white/[0.05] hover:bg-slate-100 dark:hover:bg-white/[0.1] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 transition-all shadow-2xs hover:shadow-xs cursor-pointer backdrop-blur-md"
              title="System Alerts & Notifications"
            >
              <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center shadow-xs animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-84 bg-white/95 dark:bg-[#0B0F17]/90 backdrop-blur-2xl rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-white/10 mb-1">
                  <span className="font-bold text-xs text-slate-900 dark:text-white">Security & Operational Alerts</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
                    {notifications.length} Total
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1.5 p-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-400 p-6 text-center">No alerts recorded.</p>
                  ) : (
                    notifications.map(n => {
                      const isQuestionReviewNotif =
                        n.title.toLowerCase().includes('question') ||
                        n.title.toLowerCase().includes('assigned') ||
                        n.message.toLowerCase().includes('verification queue') ||
                        n.message.toLowerCase().includes('review');

                      return (
                        <div
                          key={n.id}
                          onClick={() => handleMarkRead(n.id)}
                          className={`p-3 rounded-xl text-xs cursor-pointer transition-all ${
                            n.is_read
                              ? 'bg-slate-50/70 dark:bg-white/[0.02] text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-white/[0.05]'
                              : 'bg-emerald-50/80 dark:bg-[#00cc5f]/10 text-slate-900 dark:text-white border border-emerald-200/80 dark:border-[#00cc5f]/30 shadow-2xs hover:bg-emerald-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                            {n.category === 'SECURITY' ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            ) : (
                              <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#00cc5f] shrink-0" />
                            )}
                            <span className="text-xs">{n.title}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                          
                          {isQuestionReviewNotif && (
                            <div className="mt-2.5 pt-2 border-t border-emerald-200/70 dark:border-white/10 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-emerald-800 dark:text-[#00cc5f] uppercase tracking-wider">
                                Action Required
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkRead(n.id);
                                  setShowNotifMenu(false);
                                  onNavigateTab?.('assigned_questions');
                                  setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('enter-authority-enclave'));
                                  }, 50);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#00cc5f] hover:bg-[#00dd68] text-black font-bold text-[11px] shadow-xs flex items-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-95"
                              >
                                <span>Verify Questions Now</span>
                                <ArrowRight className="w-3 h-3 text-black" />
                              </button>
                            </div>
                          )}

                          <span className="text-[9px] text-slate-400 block mt-1.5 font-mono">
                            {new Date(n.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Role Info Block */}
          <div className="flex items-center gap-3 border-l border-slate-200 dark:border-white/10 pl-3 sm:pl-4">
            <button
              onClick={() => onNavigateProfile?.()}
              className="text-right hidden sm:block hover:opacity-90 transition-opacity cursor-pointer group"
            >
              <p className="text-xs font-black text-slate-900 dark:text-white leading-tight group-hover:text-emerald-500 transition-colors">
                {currentUser.full_name}
              </p>
              <span className="inline-block text-[10px] font-bold text-emerald-900 dark:text-[#00cc5f] bg-emerald-50 dark:bg-[#00cc5f]/10 px-2 py-0.5 rounded-md border border-emerald-200/80 dark:border-[#00cc5f]/30 mt-0.5 shadow-2xs backdrop-blur-md">
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
