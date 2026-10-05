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
    <aside className="w-full lg:w-[260px] bg-white border-r border-[#E1E7EA] flex flex-col justify-between shrink-0 shadow-[2px_0_12px_rgba(20,40,50,0.02)] z-20">
      <div className="p-4 space-y-5 overflow-y-auto">
        {/* Header: LIGHT SECURITY CARD (Specification 6) */}
        <div 
          className="p-4 rounded-2xl border border-[#CDEDE1] shadow-xs relative overflow-hidden space-y-2.5"
          style={{
            background: 'linear-gradient(135deg, #F1FBF7 0%, #FFFFFF 100%)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#00A878]" />
              <span className="text-[12px] font-mono font-black tracking-wider text-[#102A38]">
                ZEROLEAK
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-mono font-bold text-[#008A63] bg-[#E7F8F2] px-2 py-0.5 rounded-full border border-[#B8EBD6]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A878] animate-pulse" />
              SYSTEM SECURE
            </span>
          </div>

          <div className="pt-2 border-t border-[#E1F2EC] space-y-1 text-[11px] font-mono">
            <div className="text-[9.5px] font-bold text-[#61747E] uppercase tracking-wider">
              SECURITY CORE
            </div>
            <div className="flex items-center justify-between text-[#102A38]">
              <span className="text-[#61747E]">ENCLAVE</span>
              <span className="text-[#008A63] font-bold">ACTIVE</span>
            </div>
            <div className="flex items-center justify-between text-[#102A38]">
              <span className="text-[#61747E]">ENCRYPTION</span>
              <span className="text-[#2672B8] font-bold">AES-256</span>
            </div>
            <div className="flex items-center justify-between text-[#102A38]">
              <span className="text-[#61747E]">INTEGRITY</span>
              <span className="text-[#008A63] font-bold">98.4%</span>
            </div>
          </div>
        </div>

        {/* Dynamic Section Navigation Groups (Height 44-48px, Icons 18-20px, Text 14px) */}
        <div className="space-y-4">
          {sections.map(section => (
            <div key={section.title} className="space-y-1">
              <p className="text-[10px] font-mono font-bold text-[#879598] uppercase tracking-wider px-3 py-1">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeSubTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectSubTab(item.id)}
                      className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all relative cursor-pointer ${
                        isActive
                          ? 'bg-[#E7F8F2] text-[#008A63] font-bold border-l-[3px] border-[#00A878] shadow-2xs'
                          : 'text-[#53635F] hover:bg-[#F2F7F8] hover:text-[#102A38] border-l-[3px] border-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 transition-colors ${
                          isActive ? 'text-[#008A63]' : 'text-[#879598] group-hover:text-[#53635F]'
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
      <div className="p-4 border-t border-[#E1E7EA] bg-white space-y-2">
        <div className="flex items-center justify-between px-2 text-[11px] font-mono text-[#879598]">
          <span>TERMINAL SESSION</span>
          <span className="inline-flex items-center gap-1.5 text-[#008A63] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00A878]" />
            BOUND
          </span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#D64550] bg-[#FFF0F1] hover:bg-[#FFE4E6] border border-[#FAD1D5] transition-all cursor-pointer shadow-2xs"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Enclave</span>
        </button>
      </div>
    </aside>
  );
};
