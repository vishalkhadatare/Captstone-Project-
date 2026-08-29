import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const ZeroLeakLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  const titleSizes = {
    sm: 'text-lg font-bold tracking-tight',
    md: 'text-2xl font-bold tracking-tight',
    lg: 'text-3xl font-bold tracking-tight',
    xl: 'text-4xl font-bold tracking-tight',
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Geometric Cryptographic Emblem */}
      <div className="relative flex items-center justify-center shrink-0">
        <div
          className={`${iconSizes[size]} rounded-lg bg-emerald-900 p-2 shadow-sm flex items-center justify-center text-white`}
        >
          <ShieldCheck className="w-full h-full text-white" />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full p-0.5 ring-2 ring-white">
          <Lock className="w-2 h-2 text-white" />
        </div>
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col">
        <h1 className={`${titleSizes[size]} text-slate-900 leading-tight tracking-tight font-sans`}>
          ZeroLeak
        </h1>
        {showSubtitle && (
          <p className="text-[10px] text-emerald-800 font-semibold uppercase tracking-wider leading-none mt-0.5">
            AI Powered Secure Exam Paper Generation and Protection
          </p>
        )}
      </div>
    </div>
  );
};
