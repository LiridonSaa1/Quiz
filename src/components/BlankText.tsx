import React from 'react';

interface BlankTextProps {
  text: string;
  className?: string;
}

/**
 * Renders question text with _____ shown as a styled inline blank,
 * matching OUP Headway Test Builder visual style.
 */
export default function BlankText({ text, className }: BlankTextProps) {
  if (!text.includes('_____')) {
    return <span className={className}>{text}</span>;
  }

  const parts = text.split('_____');
  return (
    <span className={className}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <span
              className="inline-block min-w-[72px] mx-1 border-b-2 border-slate-500 text-center align-bottom leading-tight text-transparent select-none"
              aria-label="blank"
            >
              {'_____'}
            </span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}
