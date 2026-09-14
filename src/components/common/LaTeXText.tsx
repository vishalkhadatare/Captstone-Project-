import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LaTeXTextProps {
  text: string;
  className?: string;
}

export const LaTeXText: React.FC<LaTeXTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // If text does not contain LaTeX math delimiters, render cleanly as text
  if (!text.includes('$')) {
    return <span className={className}>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  const regex = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`txt-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
    }
    const isBlock = !!match[1];
    const formula = (match[1] || match[2] || '').trim();
    try {
      const html = katex.renderToString(formula, {
        displayMode: isBlock,
        throwOnError: false,
      });
      parts.push(
        <span
          key={`math-${match.index}`}
          dangerouslySetInnerHTML={{ __html: html }}
          className={isBlock ? 'block my-1.5 overflow-x-auto' : 'inline-block align-baseline mx-0.5'}
        />
      );
    } catch {
      parts.push(<span key={`err-${match.index}`}>{isBlock ? `$$${formula}$$` : `$${formula}$`}</span>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`txt-${lastIndex}`}>{text.substring(lastIndex)}</span>);
  }

  return <span className={className}>{parts}</span>;
};

