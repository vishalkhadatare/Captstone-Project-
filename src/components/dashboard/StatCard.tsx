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
  // Determine color scheme based on label or accentColor
  const getScheme = () => {
    const l = label.toUpperCase();
    if (l.includes('QUARANTINED') || accentColor === 'rose') {
      return {
        chipBg: 'bg-[#FFF0F1]',
        chipBorder: 'border-[#FAD1D5]',
        chipText: 'text-[#D64550]',
        trendText: 'text-[#D64550]',
        dotColor: 'bg-[#D64550]',
      };
    }
    if (l.includes('POOL') || accentColor === 'teal') {
      return {
        chipBg: 'bg-[#EAF5FB]',
        chipBorder: 'border-[#BDE0F5]',
        chipText: 'text-[#2474A6]',
        trendText: 'text-[#2474A6]',
        dotColor: 'bg-[#2474A6]',
      };
    }
    if (accentColor === 'amber') {
      return {
        chipBg: 'bg-[#FFF7E5]',
        chipBorder: 'border-[#F5E0B3]',
        chipText: 'text-[#C98200]',
        trendText: 'text-[#C98200]',
        dotColor: 'bg-[#C98200]',
      };
    }
    // Default: Total Exams or Verified Questions (Emerald)
    return {
      chipBg: 'bg-[#ECFBF5]',
      chipBorder: 'border-[#B8EBD6]',
      chipText: 'text-[#008A63]',
      trendText: 'text-[#008A63]',
      dotColor: 'bg-[#00B982]',
    };
  };

  const scheme = getScheme();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-5 rounded-[14px] border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
        isActive
          ? 'bg-[#F4FBF8] border-[#00B982] ring-2 ring-[#00B982]/30 shadow-[0_4px_16px_rgba(0,185,130,0.12)]'
          : 'bg-white border-[#E4ECE9] hover:bg-[#F9FBFA] hover:border-[#CBD8D5] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]'
      }`}
    >
      {/* Active top line indicator */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#00B982]" />
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-[#5F7074]">
          {label}
        </span>
        <div
          className={`p-2 rounded-lg border transition-all ${scheme.chipBg} ${scheme.chipBorder} ${scheme.chipText} shadow-2xs`}
        >
          <Icon className="w-4 h-4 stroke-[2.2]" />
        </div>
      </div>

      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tight text-[#172A35] font-mono">
          {count}
        </span>
      </div>

      <p className="text-[11.5px] text-[#5F7074] mt-1 line-clamp-1 font-medium">
        {description}
      </p>

      <div className="mt-3 pt-2.5 border-t border-[#EEF3F1] flex items-center justify-between text-[10px]">
        <span className={`inline-flex items-center gap-1.5 font-mono font-bold ${scheme.trendText}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${scheme.dotColor}`} />
          {trend}
        </span>
        <span className="text-[#879598] text-[9.5px] uppercase tracking-wider font-mono">
          {isActive ? 'Filtered' : 'Click to view'}
        </span>
      </div>
    </button>
  );
};
