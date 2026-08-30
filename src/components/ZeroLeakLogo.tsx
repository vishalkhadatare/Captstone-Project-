import React from 'react';
import zeroLeakLogo from '../assets/zeroleak-logo.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

/**
 * Official ZeroLeak brand mark.
 *
 * Renders the supplied ZeroLeak logo artwork (src/assets/zeroleak-logo.png) — the
 * emblem and "ZeroLeak" wordmark are part of the image itself, so no text wordmark
 * is drawn here (that would duplicate the logo). The optional tagline below is kept
 * to preserve the previous layout wherever the logo is used (header, login, registration).
 */
export const ZeroLeakLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const imgHeights = {
    sm: 'h-7',
    md: 'h-9',
    lg: 'h-11',
    xl: 'h-14',
  };

  return (
    <div className={`flex flex-col select-none ${className}`}>
      <img
        src={zeroLeakLogo}
        alt="ZeroLeak — AI Powered Secure Exam Paper Generation and Protection"
        className={`${imgHeights[size]} w-auto object-contain`}
        draggable={false}
      />
      {showSubtitle && (
        <p className="text-[10px] text-emerald-800 font-semibold uppercase tracking-wider leading-none mt-1">
          AI Powered Secure Exam Paper Generation and Protection
        </p>
      )}
    </div>
  );
};
