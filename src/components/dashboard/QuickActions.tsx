import React from 'react';
import { PlusCircle, Sparkles, GraduationCap, Award, ShieldAlert, Building2, ChevronRight, Zap } from 'lucide-react';
import { NavSubTab } from '../Sidebar';

interface QuickActionsProps {
  onNavigateTab: (tab: NavSubTab) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onNavigateTab }) => {
  const actions = [
    {
      id: 'create_examination' as NavSubTab,
      label: 'Create Examination',
      description: 'Configure new exam blueprint',
      icon: PlusCircle,
      color: 'text-[#00D68F]',
      badge: 'New',
    },
    {
      id: 'paper_generation' as NavSubTab,
      label: 'AI Paper Synthesizer',
      description: 'Generate multi-set papers',
      icon: Sparkles,
      color: 'text-[#18C8B2]',
      badge: 'AI Engine',
    },
    {
      id: 'paper_generation' as NavSubTab,
      label: 'University Paper Generation',
      description: 'Format 70-mark university sets',
      icon: GraduationCap,
      color: 'text-[#00D68F]',
      badge: 'FormaTeX',
    },
    {
      id: 'question_workflow' as NavSubTab,
      label: 'Competitive Examination',
      description: '7-step bilingual workflow',
      icon: Award,
      color: 'text-[#F5B942]',
      badge: 'Unified',
    },
    {
      id: 'security_events' as NavSubTab,
      label: 'Security Events & Audit',
      description: 'Inspect cryptographic logs',
      icon: ShieldAlert,
      color: 'text-[#4DA3FF]',
      badge: 'Audited',
    },
    {
      id: 'examination_centres' as NavSubTab,
      label: 'Examination Centres',
      description: 'Superintendents & biometrics',
      icon: Building2,
      color: 'text-[#18C8B2]',
      badge: 'Delivery',
    },
  ];

  return (
    <div className="rounded-xl bg-[#0D211E] border border-white/[0.08] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/20">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#F4F8F7]">
              OPERATIONAL SHORTCUTS
            </h3>
            <p className="text-[11px] text-[#9AAEAA]">
              Fast execution pathways for controller operations
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono text-[#617773] uppercase">
          6 Actions
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {actions.map((act, index) => {
          const Icon = act.icon;
          return (
            <button
              key={`${act.id}-${index}`}
              type="button"
              onClick={() => onNavigateTab(act.id)}
              className="p-3.5 rounded-lg bg-[#102723]/60 border border-white/[0.04] hover:bg-[#102723] hover:border-white/[0.12] transition-all flex items-start justify-between text-left group cursor-pointer hover:-translate-y-0.5"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${act.color} shrink-0`} />
                  <span className="text-xs font-bold text-[#F4F8F7] group-hover:text-[#00D68F] transition-colors truncate">
                    {act.label}
                  </span>
                </div>
                <p className="text-[11px] text-[#9AAEAA] line-clamp-1">
                  {act.description}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white/[0.04] text-[#617773] group-hover:text-[#F4F8F7] border border-white/[0.06]">
                  {act.badge}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-[#617773] group-hover:text-[#00D68F] group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
