import React from 'react';

// Brand assets. The official ZeroLeak logo is the horizontal lockup:
// the shield/exam icon followed by the "ZeroLeak" wordmark, side by side.
import logoIcon from '../assets/logo-icon.png';
import wordmark from '../assets/logo-wordmark.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Kept for backwards compatibility — no longer changes the output. */
  showSubtitle?: boolean;
  /** Explicit height override (Tailwind classes). Takes precedence over `size`. */
  imgHeightClass?: string;
  /** Kept for backwards compatibility — the wordmark is always shown now. */
  showWordmark?: boolean;
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
}) => {
  const heightClass = imgHeightClass || sizeHeights[size] || sizeHeights.md;

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
