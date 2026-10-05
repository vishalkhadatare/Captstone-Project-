import React from 'react';
import { LucideIcon, Shield, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';

interface StatCardProps {
  label: string;
  count: number | string;
  description: string;
  trend: string;
  icon: LucideIcon;
  isActive: boolean;
  onClick: () => void;
  accentColor?: 'emerald' | 'teal' | 'amber' | 'rose' | 'blue';
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
  const l = label.toUpperCase();

  // Determine individual identity and visual styling
  const isQuarantined = l.includes('QUARANTINED') || accentColor === 'rose';
  const isPool = l.includes('POOL') || accentColor === 'teal' || accentColor === 'blue';
  const isVerified = l.includes('VERIFIED');
  const isTotal = !isQuarantined && !isPool && !isVerified;

  const getTheme = () => {
    if (isQuarantined) {
      return {
        iconBg: 'bg-[#FFF0F2]',
        iconText: 'text-[#D03D50]',
        iconBorder: 'border-[#FAD1D5]',
        topLine: 'bg-[#D03D50]',
        activeBorder: 'border-[#D03D50]',
        activeRing: 'ring-[#D03D50]/20',
        badgeBg: 'bg-[#FFF0F2]',
        badgeText: 'text-[#D03D50]',
      };
    }
    if (isPool) {
      return {
        iconBg: 'bg-[#EEF5FF]',
        iconText: 'text-[#2672B8]',
        iconBorder: 'border-[#C5DCFA]',
        topLine: 'bg-[#2672B8]',
        activeBorder: 'border-[#2672B8]',
        activeRing: 'ring-[#2672B8]/20',
        badgeBg: 'bg-[#EEF5FF]',
        badgeText: 'text-[#2672B8]',
      };
    }
    if (isVerified) {
      return {
        iconBg: 'bg-[#EFFBFD]',
        iconText: 'text-[#008AA3]',
        iconBorder: 'border-[#BEE7F0]',
        topLine: 'bg-[#00B8D9]',
        activeBorder: 'border-[#00B8D9]',
        activeRing: 'ring-[#00B8D9]/20',
        badgeBg: 'bg-[#EFFBFD]',
        badgeText: 'text-[#008AA3]',
      };
    }
    // Total Examinations (Emerald)
    return {
      iconBg: 'bg-[#E8F8F2]',
      iconText: 'text-[#008A63]',
      iconBorder: 'border-[#B8EBD6]',
      topLine: 'bg-[#00A878]',
      activeBorder: 'border-[#00A878]',
      activeRing: 'ring-[#00A878]/20',
      badgeBg: 'bg-[#E8F8F2]',
      badgeText: 'text-[#008A63]',
    };
  };

  const theme = getTheme();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-6 rounded-[14px] border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group min-h-[175px] flex flex-col justify-between shadow-[0_4px_18px_rgba(30,50,60,0.06)] bg-white ${
        isActive
          ? `${theme.activeBorder} ring-2 ${theme.activeRing} shadow-[0_6px_22px_rgba(20,50,65,0.1)]`
          : 'border-[#DCE5E9] hover:border-[#CBD8D5] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(30,50,60,0.09)]'
      }`}
    >
      {/* Active top line accent */}
      {isActive && (
        <div className={`absolute top-0 left-0 right-0 h-1 ${theme.topLine}`} />
      )}

      {/* Top Row: Label & Top-Right Colored Icon */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-wider text-[#52636B]">
          {label}
        </span>
        <div
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${theme.iconBg} ${theme.iconBorder} ${theme.iconText} shadow-2xs group-hover:scale-105`}
        >
          <Icon className="w-5 h-5 stroke-[2]" />
        </div>
      </div>

      {/* Center Row: Number & Unique Visual Element */}
      <div className="flex items-center justify-between gap-3 my-2">
        <span className="text-[36px] font-extrabold tracking-tight text-[#102A38] font-mono leading-none">
          {count}
        </span>

        {/* Individual Card Visual Identity Element */}
        {isTotal && (
          /* Tiny Emerald Trend Chart */
          <div className="flex items-center shrink-0 pr-1">
            <svg className="w-16 h-8 text-[#00A878]" viewBox="0 0 60 25" fill="none">
              <path
                d="M 2 20 Q 15 15, 25 18 T 45 8 T 58 4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="58" cy="4" r="2.5" fill="currentColor" />
            </svg>
          </div>
        )}

        {isPool && (
          /* Blue Circular Sealed Indicator */
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EEF5FF] border border-[#C5DCFA] text-[10px] font-mono font-bold text-[#2672B8] shrink-0">
            <Lock className="w-3 h-3 text-[#2672B8]" />
            <span>SEALED</span>
          </div>
        )}

        {isVerified && (
          /* Small Cyan Progress Ring */
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-9 h-9 transform -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" stroke="#E2E8EC" strokeWidth="3" fill="none" />
              <circle
                cx="18"
                cy="18"
                r="14"
                stroke="#00B8D9"
                strokeWidth="3"
                strokeDasharray="88"
                strokeDashoffset={88 * (1 - 0.984)}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span className="absolute text-[8.5px] font-mono font-bold text-[#008AA3]">98%</span>
          </div>
        )}

        {isQuarantined && (
          /* Red Shield Icon */
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF0F2] border border-[#FAD1D5] text-[10px] font-mono font-bold text-[#D03D50] shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D03D50]" />
            <span>CLEARED</span>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-[13px] text-[#61747E] font-medium leading-snug line-clamp-1">
        {description}
      </p>

      {/* Bottom Row: Trend & Filter hint */}
      <div className="mt-3 pt-3 border-t border-[#EEF3F1] flex items-center justify-between text-[11px]">
        <span className={`inline-flex items-center gap-1.5 font-mono font-bold text-xs ${theme.badgeText}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {trend}
        </span>
        <span className="text-[#879598] text-[10px] uppercase tracking-wider font-mono">
          {isActive ? 'Filtered' : 'Click to inspect'}
        </span>
      </div>
    </button>
  );
};
