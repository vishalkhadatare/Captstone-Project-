import React from 'react';
import {
  LayoutDashboard,
  Building2,
  FolderLock,
  PlusCircle,
  Cpu,
  Layers,
  Printer,
  History,
  Lock,
  Activity,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Award,
  GraduationCap,
  Settings,
  Shield,
  FileText,
  Laptop,
  Users,
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
            title: 'OVERVIEW',
            items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'ACCESS CONTROL',
            items: [
              { id: 'authorized_managers', label: 'Authorized Managers', icon: Users },
              { id: 'trusted_devices', label: 'Trusted Workstations', icon: Laptop },
            ],
          },
          {
            title: 'SECURITY',
            items: [{ id: 'security_events', label: 'Security Events', icon: ShieldAlert }],
          },
        ];

      case 'EXAM_MANAGER':
        return [
          {
            title: 'OVERVIEW',
            items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'EXAMINATIONS',
            items: [
              { id: 'all_examinations', label: 'All Examinations', icon: FolderLock },
              { id: 'create_examination', label: 'Create Examination', icon: PlusCircle },
            ],
          },
          {
            title: 'COMPETITIVE EXAMINATIONS',
            items: [
              { id: 'question_workflow', label: 'Competitive Examination', icon: Award },
            ],
          },
          {
            title: 'UNIVERSITY',
            items: [
              { id: 'paper_generation', label: 'University Paper Generation', icon: GraduationCap },
            ],
          },
          {
            title: 'INFRASTRUCTURE',
            items: [{ id: 'examination_centres', label: 'Examination Centres', icon: Building2 }],
          },
          {
            title: 'SECURITY',
            items: [
              { id: 'security_events', label: 'Security Events', icon: ShieldAlert },
              { id: 'audit_trail', label: 'Audit Logs', icon: History },
              { id: 'proctor_dashboard', label: 'Threat Detection', icon: Activity },
            ],
          },
          {
            title: 'SYSTEM',
            items: [
              { id: 'security_settings', label: 'Settings', icon: Settings },
              { id: 'device_status', label: 'System Health', icon: Cpu },
            ],
          },
        ];

      case 'TRANSLATOR':
        return [
          {
            title: 'OVERVIEW',
            items: [{ id: 'dashboard', label: 'Translation Hub', icon: LayoutDashboard }],
          },
          {
            title: 'VERIFICATION',
            items: [
              { id: 'translation_tasks', label: 'Assigned Papers', icon: FileText },
              { id: 'verification_history', label: 'Translation Logs', icon: History },
            ],
          },
        ];

      case 'CENTRE_OPERATOR':
        return [
          {
            title: 'OVERVIEW',
            items: [{ id: 'dashboard', label: 'Center Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'RELEASE & PRINTING',
            items: [
              { id: 'released_examinations', label: 'Released Papers', icon: Lock },
              { id: 'secure_viewer', label: 'Secure Viewer', icon: FolderLock },
              { id: 'print_management', label: 'Print Station', icon: Printer },
            ],
          },
          {
            title: 'HARDWARE',
            items: [{ id: 'device_status', label: 'Device Attestation', icon: Laptop }],
          },
        ];

      case 'AUDITOR':
        return [
          {
            title: 'OVERVIEW',
            items: [{ id: 'dashboard', label: 'Audit Dashboard', icon: LayoutDashboard }],
          },
          {
            title: 'AUDIT LEDGER',
            items: [
              { id: 'audit_trail', label: 'Cryptographic Trail', icon: History },
              { id: 'login_history', label: 'Authentication Events', icon: Users },
              { id: 'paper_events', label: 'Paper Lifecycle Logs', icon: FileText },
              { id: 'printing_events', label: 'Printing Logs', icon: Printer },
            ],
          },
          {
            title: 'SURVEILLANCE',
            items: [{ id: 'proctor_dashboard', label: 'Leak Surveillance Audit', icon: ShieldAlert }],
          },
        ];

      default:
        return [];
    }
  };

  const sections = getNavSections();

  return (
    <aside className="w-full lg:w-[260px] bg-[#081715] border-r border-white/[0.08] flex flex-col justify-between shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.5)] z-20">
      <div className="p-4 space-y-5 overflow-y-auto">
        {/* Header: ZEROLEAK with System Secure indicator */}
        <div className="p-3.5 rounded-xl bg-[#0D211E] border border-white/[0.08] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold tracking-wider text-[#F4F8F7]">
              ZEROLEAK
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold text-[#00D68F] bg-[#00D68F]/10 px-2 py-0.5 rounded-full border border-[#00D68F]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F] animate-pulse" />
              SYSTEM SECURE
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-[#9AAEAA] font-mono">
            <span className="truncate">{userRole ? userRole.replace(/_/g, ' ') : 'CONTROLLER'}</span>
            <span className="text-[#00D68F] font-bold">FIPS 140-2</span>
          </div>
        </div>

        {/* Dynamic Section Navigation Groups */}
        <div className="space-y-4">
          {sections.map(section => (
            <div key={section.title} className="space-y-1">
              <p className="text-[9.5px] font-mono font-bold text-[#617773] uppercase tracking-wider px-3 py-1">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeSubTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectSubTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all relative cursor-pointer ${
                        isActive
                          ? 'bg-[#0D211E] text-[#00D68F] font-bold border-l-2 border-[#00D68F] shadow-[inset_0_0_12px_rgba(0,214,143,0.06)]'
                          : 'text-[#9AAEAA] hover:bg-[#102723]/60 hover:text-[#F4F8F7] border-l-2 border-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-[#00D68F]' : 'text-[#617773] group-hover:text-[#9AAEAA]'
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

      {/* Terminal Session & Sign Out Footer */}
      <div className="p-3.5 border-t border-white/[0.08] bg-[#06110F]/80 space-y-2">
        <div className="flex items-center justify-between px-2 text-[10px] font-mono text-[#617773]">
          <span>TERMINAL SESSION</span>
          <span className="inline-flex items-center gap-1 text-[#00D68F]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F]" />
            BOUND
          </span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[#FF5C6C] hover:bg-[#FF5C6C]/10 border border-[#FF5C6C]/20 hover:border-[#FF5C6C]/40 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out of Enclave</span>
        </button>
      </div>
    </aside>
  );
};
