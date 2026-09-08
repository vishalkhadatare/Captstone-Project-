import React from 'react';
import zeroLeakLogo from '../assets/zeroleak-logo.png';
import signInLogo from '../assets/sign in logo.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  /**
   * 'standard' → the horizontal emblem + wordmark banner (header, landing, registration).
   * 'signin'   → the dedicated stacked ZeroLeak sign-in brand artwork (login page only).
   */
  variant?: 'standard' | 'signin';
}

/**
 * Official ZeroLeak brand mark.
 *
 * Renders the supplied ZeroLeak logo artwork — the emblem and "ZeroLeak" wordmark
 * are part of the image itself, so no text wordmark is drawn here (that would
 * duplicate the logo). The optional tagline below applies to the standard banner
 * only; the sign-in artwork already contains its own lockup, so the tagline is
 * never rendered for the 'signin' variant (this removes the old overlapping text).
 */
export const ZeroLeakLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
  variant = 'standard',
}) => {
  const isSignin = variant === 'signin';

  const standardHeights = {
    sm: 'h-7',
    md: 'h-9',
    lg: 'h-11',
    xl: 'h-14',
  };
  const signinHeights = {
    sm: 'h-14',
    md: 'h-20',
    lg: 'h-24',
    xl: 'h-32',
  };

  const imgHeights = isSignin ? signinHeights : standardHeights;
  const src = isSignin ? signInLogo : zeroLeakLogo;

  return (
    <div className={`flex flex-col ${isSignin ? 'items-center' : ''} select-none ${className}`}>
      <img
        src={src}
        alt="ZeroLeak — AI Powered Secure Exam Paper Generation and Protection"
        className={`${imgHeights[size]} w-auto object-contain`}
        draggable={false}
      />
      {showSubtitle && !isSignin && (
        <p className="text-[10px] text-emerald-800 font-semibold uppercase tracking-wider leading-none mt-1">
          AI Powered Secure Exam Paper Generation and Protection
        </p>
      )}
    </div>
  );
};
