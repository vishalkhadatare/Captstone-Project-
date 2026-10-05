import React from 'react';
import { PlusCircle, Sparkles, GraduationCap, Award, ShieldAlert, Building2, ChevronRight, Zap, FolderLock } from 'lucide-react';
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
      id: 'all_examinations' as NavSubTab,
      label: 'All Examinations Catalog',
      description: 'Inspect examination blueprints & marks',
      icon: FolderLock,
      color: 'text-[#008A63]',
      badge: 'Catalog',
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
    <div className="rounded-[18px] bg-white border border-[#DCE5E9] p-6 lg:p-7 shadow-[0_4px_20px_rgba(20,50,65,0.06)] space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E8F8F2] text-[#00A878] border border-[#B8EBD6] flex items-center justify-center shadow-xs">
            <Zap className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#102A38] uppercase tracking-wider font-mono">
              OPERATIONAL SHORTCUTS
            </h3>
            <p className="text-xs sm:text-[13px] text-[#61747E]">
              Fast execution pathways for controller operations
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono font-bold text-[#61747E] bg-[#F5F8FA] px-3 py-1 rounded-full border border-[#DCE5E8]">
          6 ACTIONS
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {actions.map((act, index) => {
          const Icon = act.icon;
          return (
            <button
              key={`${act.id}-${index}`}
              type="button"
              onClick={() => onNavigateTab(act.id)}
              className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8EC] hover:bg-white hover:border-[#CBD8D5] transition-all flex items-start justify-between text-left group cursor-pointer hover:-translate-y-0.5 shadow-2xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4.5 h-4.5 ${act.color} shrink-0`} />
                  <span className="text-xs sm:text-[13px] font-bold text-[#102A38] group-hover:text-[#008A63] transition-colors truncate">
                    {act.label}
                  </span>
                </div>
                <p className="text-xs text-[#61747E] line-clamp-1">
                  {act.description}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-md bg-white text-[#61747E] group-hover:text-[#102A38] border border-[#E5ECE9]">
                  {act.badge}
                </span>
                <ChevronRight className="w-4 h-4 text-[#879598] group-hover:text-[#008A63] group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
