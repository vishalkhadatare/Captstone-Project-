import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  count: number | string;
  description: string;
  trend: string;
  icon: LucideIcon;
  isActive: boolean;
  onClick: () => void;
  accentColor?: 'emerald' | 'teal' | 'amber' | 'rose';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  count,
  description,
  trend,
  icon: Icon,
  isActive,
  onClick,
  accentColor = 'emerald',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer backdrop-blur-md relative overflow-hidden group ${
        isActive
          ? 'bg-[#102723] border-[#00D68F] ring-1 ring-[#00D68F]/40 shadow-[0_0_20px_rgba(0,214,143,0.12)]'
          : 'bg-[#0D211E] border-white/[0.08] hover:bg-[#102723]/80 hover:border-white/[0.16] hover:-translate-y-0.5'
      }`}
    >
      {/* Active top line indicator */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#00D68F]" />
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#9AAEAA]">
          {label}
        </span>
        <div
          className={`p-1.5 rounded-lg transition-colors ${
            isActive
              ? 'bg-[#00D68F]/20 text-[#00D68F]'
              : 'bg-white/[0.04] text-[#9AAEAA] group-hover:text-[#00D68F] group-hover:bg-[#00D68F]/10'
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tight text-[#F4F8F7] font-mono">
          {count}
        </span>
      </div>

      <p className="text-[11px] text-[#9AAEAA] mt-1 line-clamp-1">
        {description}
      </p>

      <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px]">
        <span className="inline-flex items-center gap-1 font-mono text-[#00D68F]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F]" />
          {trend}
        </span>
        <span className="text-[#617773] text-[9px] uppercase tracking-wider font-mono">
          {isActive ? 'Filtered' : 'Click to view'}
        </span>
      </div>
    </button>
  );
};
