import React from 'react';

// Official ZeroLeak Brand assets
import logoIcon from '../assets/logo-icon.png';
import wordmark from '../assets/logo-wordmark.png';
import logoLockup from '../assets/zeroleak.png';
import signInLogo from '../assets/zeroleak sign logo.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Kept for backwards compatibility */
  showSubtitle?: boolean;
  /** Explicit height override (Tailwind classes). Takes precedence over `size`. */
  imgHeightClass?: string;
  /** Kept for backwards compatibility */
  showWordmark?: boolean;
  /**
   * Which brand treatment to render.
   * 'lockup'   = the single combined logo image
   * 'split'    = icon + wordmark side by side
   * 'icon'     = emblem icon only
   * 'standard' = standard brand mark banner
   * 'signin'   = dedicated stacked sign-in brand artwork
   */
  variant?: 'lockup' | 'split' | 'icon' | 'standard' | 'signin';
}

const sizeHeights: Record<string, string> = {
  sm: 'h-8 sm:h-9 md:h-10',
  md: 'h-10 sm:h-12 md:h-14',
  lg: 'h-14 sm:h-16 md:h-20',
  xl: 'h-20 sm:h-24 md:h-28',
};

const signinHeights: Record<string, string> = {
  sm: 'h-14',
  md: 'h-20',
  lg: 'h-24',
  xl: 'h-32',
};

export const ZeroLeakLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  imgHeightClass = '',
  variant = 'split',
}) => {
  const isSignin = variant === 'signin';
  const heightClass =
    imgHeightClass || (isSignin ? signinHeights[size] : sizeHeights[size]) || sizeHeights.md;

  if (variant === 'icon') {
    return (
      <div className={`zero-leak-logo flex items-center select-none ${className}`}>
        <img
          src={logoIcon}
          alt="ZeroLeak"
          className={`w-auto object-contain shrink-0 ${heightClass}`}
          draggable={false}
        />
      </div>
    );
  }

  if (variant === 'signin') {
    return (
      <div className={`zero-leak-logo flex flex-col items-center select-none ${className}`}>
        <img
          src={signInLogo}
          alt="ZeroLeak Sign In"
          className={`w-auto object-contain shrink-0 ${heightClass}`}
          draggable={false}
        />
      </div>
    );
  }

  if (variant === 'lockup' || variant === 'standard') {
    return (
      <div className={`zero-leak-logo flex items-center select-none ${className}`}>
        <img
          src={logoLockup}
          alt="ZeroLeak — AI Powered Secure Exam Paper Generation and Protection"
          className={`w-auto object-contain shrink-0 ${heightClass}`}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className={`zero-leak-logo flex items-center gap-2 select-none ${className}`}>
      <img
        src={logoIcon}
        alt=""
        aria-hidden="true"
        className={`w-auto object-contain shrink-0 ${heightClass}`}
        draggable={false}
      />
      <img
        src={wordmark}
        alt="ZeroLeak"
        className={`w-auto object-contain shrink-0 ${heightClass}`}
        draggable={false}
      />
    </div>
  );
};
