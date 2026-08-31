import React from 'react';

// Brand assets. Two lockup treatments are supported:
//  - 'split'  : the shield/exam icon followed by the "ZeroLeak" wordmark, side by side (legacy).
//  - 'lockup' : the single combined horizontal lockup image (detailed icon + wordmark as one file).
import logoIcon from '../assets/logo-icon.png';
import wordmark from '../assets/logo-wordmark.png';
import logoLockup from '../assets/zeroleak.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Kept for backwards compatibility — no longer changes the output. */
  showSubtitle?: boolean;
  /** Explicit height override (Tailwind classes). Takes precedence over `size`. */
  imgHeightClass?: string;
  /** Kept for backwards compatibility — the wordmark is always shown now. */
  showWordmark?: boolean;
  /**
   * Which brand treatment to render.
   * 'lockup' = the single combined logo image; 'split' = icon + wordmark side by side.
   * Defaults to 'split' so untouched call sites (e.g. the sign-in page) keep their current look.
   */
  variant?: 'lockup' | 'split';
}

// Default lockup height per size when the caller doesn't pass imgHeightClass.
const sizeHeights: Record<string, string> = {
  sm: 'h-8 sm:h-9 md:h-10',
  md: 'h-10 sm:h-12 md:h-14',
  lg: 'h-14 sm:h-16 md:h-20',
  xl: 'h-20 sm:h-24 md:h-28',
};

export const ZeroLeakLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  imgHeightClass = '',
  variant = 'split',
}) => {
  const heightClass = imgHeightClass || sizeHeights[size] || sizeHeights.md;

  if (variant === 'lockup') {
    return (
      <div className={`zero-leak-logo flex items-center select-none ${className}`}>
        <img
          src={logoLockup}
          alt="ZeroLeak"
          className={`w-auto object-contain shrink-0 ${heightClass}`}
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
      />
      <img
        src={wordmark}
        alt="ZeroLeak"
        className={`w-auto object-contain shrink-0 ${heightClass}`}
      />
    </div>
  );
};
