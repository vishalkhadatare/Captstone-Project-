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
  User as UserIcon,
  KeyRound,
} from 'lucide-react';
import { UserRole } from '../types';

export type NavSubTab =
  // Common
  | 'dashboard'
  | 'profile'
  | 'security_settings'
  | 'security_events'
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
  | 'paper_versions'
  | 'examination_centres'
  // SME
  | 'assigned_questions'
  | 'question_verification'
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
            title: 'Organization',
            items: [
              { id: 'org_profile', label: 'Organization Profile', icon: Building2 },
              { id: 'verification_status', label: 'Verification Status', icon: FileCheck },
              { id: 'documents', label: 'Documents & Certificates', icon: FileText },
            ],
          },
          {
            title: 'Access Control',
            items: [
              { id: 'authorized_managers', label: 'Authorized Managers', icon: Users },
              { id: 'trusted_devices', label: 'Trusted Workstations', icon: Laptop },
            ],
          },
          {
            title: 'Security',
            items: [{ id: 'security_events', label: 'Security & Threat Events', icon: ShieldAlert }],
          },
        ];

      case 'EXAM_MANAGER':
        return [
          {
            title: 'Overview',
            items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'Examinations',
            items: [{ id: 'create_examination', label: 'Create Examination', icon: PlusCircle }],
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

      case 'SME':
        return [
          {
            title: 'Overview',
            items: [{ id: 'dashboard', label: 'Dashboard & Review', icon: LayoutDashboard }],
          },
          {
            title: 'History',
            items: [{ id: 'verification_history', label: 'Verification History', icon: History }],
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
        ];

      default:
        return [];
    }
  };

  const sections = getNavSections();

  return (
    <aside className="w-full lg:w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-xs">
      <div className="p-4 space-y-5 overflow-y-auto">
        {/* Role Domain Header Banner */}
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs">
          <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider block">
            Active Boundary
          </span>
          <p className="font-bold text-emerald-900 mt-0.5">
            {userRole ? userRole.replace('_', ' ') : 'UNAUTHENTICATED'}
          </p>
        </div>

        {/* Dynamic Section Navigation */}
        <div className="space-y-4">
          {sections.map(section => (
            <div key={section.title} className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-0.5">
                {section.title}
              </p>
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = activeSubTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectSubTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-emerald-900 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-white' : 'text-slate-500'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Account & Session Controls */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-0.5">
          Account
        </p>

        <button
          onClick={() => onSelectSubTab('profile')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeSubTab === 'profile'
              ? 'bg-emerald-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <UserIcon className="w-4 h-4 text-slate-500" />
          <span>User Profile</span>
        </button>

        <button
          onClick={() => onSelectSubTab('security_settings')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeSubTab === 'security_settings'
              ? 'bg-emerald-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <KeyRound className="w-4 h-4 text-slate-500" />
          <span>Security & Passphrase</span>
        </button>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors mt-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
