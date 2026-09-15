import React from 'react';
import {
  LayoutDashboard,
  Building2,
  FileCheck,
  FileText,
  Users,
  Laptop,
  ShieldAlert,
  FolderLock,
  PlusCircle,
  HelpCircle,
  Cpu,
  Layers,
  Printer,
  History,
  Lock,
  UserCheck,
  Languages,
  Activity,
  LogOut,
  ShieldCheck,
  Shuffle,
} from 'lucide-react';
import { UserRole } from '../types';

export type NavSubTab =
  // Common
  | 'dashboard'
  | 'profile'
  | 'security_settings'
  | 'security_events'
  | 'proctor_dashboard'
  // Org Owner
  | 'org_profile'
  | 'verification_status'
  | 'documents'
  | 'authorized_managers'
  | 'trusted_devices'
  // Exam Manager
  | 'all_examinations'
  | 'create_examination'
  | 'question_workflow'
  | 'question_pools'
  | 'blueprint_pattern'
  | 'paper_generation'
  | 'multi_paper_generator'
  | 'paper_versions'
  | 'examination_centres'
  // Translator
  | 'translation_tasks'
  | 'verification_history'
  // Centre Operator
  | 'released_examinations'
  | 'secure_viewer'
  | 'print_management'
  | 'device_status'
  // Auditor
  | 'audit_trail'
  | 'login_history'
  | 'paper_events'
  | 'printing_events'
  | 'regeneration_events';

interface SidebarProps {
  activeSubTab: NavSubTab;
  onSelectSubTab: (tab: NavSubTab) => void;
  userRole: UserRole | null;
  onLogout: () => void;
}

interface NavItem {
  id: NavSubTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSubTab,
  onSelectSubTab,
  userRole,
  onLogout,
}) => {
  const getNavSections = (): NavSection[] => {
    switch (userRole) {
      case 'ORG_OWNER':
        return [
          {
            title: 'Overview',
            items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'Access Control',
            items: [
              { id: 'authorized_managers', label: 'Authorized Managers', icon: Users },
              { id: 'trusted_devices', label: 'Trusted Workstations', icon: Laptop },
            ],
          },
          {
            title: 'Leak Avoidance Surveillance',
            items: [{ id: 'proctor_dashboard', label: 'Authority Camera Surveillance', icon: ShieldAlert }],
          },
        ];

      case 'EXAM_MANAGER':
        return [
          {
            title: 'Overview',
            items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'Leak Avoidance Surveillance',
            items: [{ id: 'proctor_dashboard', label: 'Authority Camera Surveillance', icon: ShieldAlert }],
          },
          {
            title: 'Examinations',
            items: [
              { id: 'all_examinations', label: 'All Examinations', icon: FolderLock },
              { id: 'create_examination', label: 'Create Examination', icon: PlusCircle },
            ],
          },
          {
            title: 'Question Bank',
            items: [
              { id: 'question_workflow', label: 'Question Workflow', icon: FileCheck },
              { id: 'question_pools', label: 'Question Pools', icon: HelpCircle },
            ],
          },
          {
            title: 'Configuration',
            items: [{ id: 'blueprint_pattern', label: 'Blueprint & Pattern', icon: Cpu }],
          },
          {
            title: 'Paper Generation',
            items: [
              { id: 'paper_generation', label: 'Paper Generation', icon: Lock },
              { id: 'multi_paper_generator', label: 'Multi-Paper Generator', icon: Shuffle },
              { id: 'paper_versions', label: 'Paper Versions', icon: Layers },
            ],
          },
          {
            title: 'Examination Centres',
            items: [{ id: 'examination_centres', label: 'Examination Centres', icon: Building2 }],
          },
          {
            title: 'Security',
            items: [{ id: 'security_events', label: 'Security Events', icon: ShieldAlert }],
          },
        ];

      case 'TRANSLATOR':
        return [
          {
            title: 'Overview',
            items: [{ id: 'dashboard', label: 'Translator Dashboard & Workbench', icon: LayoutDashboard }],
          },
          {
            title: 'Ledger & Audit',
            items: [{ id: 'verification_history', label: 'Translation Ledger', icon: History }],
          },
        ];

      case 'CENTRE_OPERATOR':
        return [
          {
            title: 'Overview',
            items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'Examination Delivery',
            items: [
              { id: 'released_examinations', label: 'Released Examinations', icon: FolderLock },
              { id: 'secure_viewer', label: 'Secure Viewer', icon: Lock },
            ],
          },
          {
            title: 'Printing',
            items: [{ id: 'print_management', label: 'Print Management', icon: Printer }],
          },
          {
            title: 'Hardware Terminal',
            items: [{ id: 'device_status', label: 'Device Status', icon: Laptop }],
          },
        ];

      case 'AUDITOR':
        return [
          {
            title: 'Overview',
            items: [{ id: 'dashboard', label: 'Auditor Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'Audit Logs',
            items: [
              { id: 'audit_trail', label: 'Immutable Audit Trail', icon: Activity },
              { id: 'login_history', label: 'Login & Session History', icon: UserCheck },
            ],
          },
          {
            title: 'Security & Forensics',
            items: [
              { id: 'security_events', label: 'Security & Threat Events', icon: ShieldAlert },
              { id: 'paper_events', label: 'Paper Lifecycle Events', icon: Layers },
              { id: 'printing_events', label: 'Printing Copy Logs', icon: Printer },
              { id: 'regeneration_events', label: 'Regeneration Events', icon: History },
            ],
          },
          {
            title: 'Leak Surveillance',
            items: [{ id: 'proctor_dashboard', label: 'Authority Surveillance Audit', icon: ShieldAlert }],
          },
        ];

      default:
        return [];
    }
  };

  const sections = getNavSections();

  return (
    <aside className="w-full lg:w-72 bg-white/70 dark:bg-[#080B11]/50 backdrop-blur-2xl border-r border-slate-200/80 dark:border-white/[0.08] flex flex-col justify-between shrink-0 shadow-[1px_0_12px_rgba(15,23,42,0.03)] dark:shadow-[4px_0_30px_rgba(0,0,0,0.5)] z-20">
      <div className="p-4 space-y-5 overflow-y-auto">
        {/* Role Domain Header Banner */}
        <div className="p-4 bg-gradient-to-br from-[#00cc5f]/12 via-[#00cc5f]/5 to-transparent border border-[#00cc5f]/30 rounded-2xl shadow-xs relative overflow-hidden backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">
              Enclave Boundary
            </span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00cc5f] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00cc5f]"></span>
            </span>
          </div>
          <p className="font-black text-slate-900 dark:text-white text-xs mt-1.5 tracking-tight flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#00cc5f] shrink-0" />
            <span>{userRole ? userRole.replace(/_/g, ' ') : 'UNAUTHENTICATED'}</span>
          </p>
          <div className="mt-2 pt-2 border-t border-[#00cc5f]/20 dark:border-white/10 flex items-center justify-between text-[10px] text-[#00873d] dark:text-[#00cc5f] font-mono">
            <span>FIPS-140-2</span>
            <span className="font-bold text-[#00873d] dark:text-[#00cc5f]">AES-256</span>
          </div>
        </div>

        {/* Dynamic Section Navigation */}
        <div className="space-y-4">
          {sections.map(section => (
            <div key={section.title} className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest px-3 py-1">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeSubTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectSubTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all relative cursor-pointer backdrop-blur-md ${
                        isActive
                          ? 'bg-[#00cc5f]/12 dark:bg-[#00cc5f]/18 text-[#00873d] dark:text-[#00cc5f] font-bold border border-[#00cc5f]/40 dark:border-[#00cc5f]/50 shadow-[0_2px_12px_rgba(0,204,95,0.12)] dark:shadow-[0_0_20px_rgba(0,204,95,0.25)]'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-950 dark:hover:text-white border border-transparent hover:translate-x-0.5'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-4.5 rounded-full bg-[#00cc5f] shadow-[0_0_8px_#00cc5f]" />
                      )}
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-[#00cc5f]' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account & Session Controls */}
      <div className="p-4 border-t border-slate-200/90 dark:border-white/10 bg-slate-50/70 dark:bg-black/20 backdrop-blur-md space-y-2">
        <div className="flex items-center justify-between px-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Terminal Session
          </span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981]" />
        </div>

        <button
          onClick={() => onLogout?.()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 hover:border-rose-300 dark:hover:border-rose-700 transition-all cursor-pointer shadow-2xs hover:shadow-xs bg-white/80 dark:bg-white/[0.03] backdrop-blur-md"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Enclave</span>
        </button>
      </div>
    </aside>
  );
};
