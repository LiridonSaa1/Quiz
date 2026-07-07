import React from 'react';
import { cn } from '../../lib/utils';
import { resolveGender } from '../../lib/genderUtils';

const MaleIcon = () => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* Suit body */}
    <path d="M6 64 Q6 47 32 44 Q58 47 58 64Z" fill="#64748b" />
    {/* Left lapel */}
    <path d="M24 44 L32 55 L32 64 L6 64 L6 56 Q17 52 24 44Z" fill="#475569" />
    {/* Right lapel */}
    <path d="M40 44 L32 55 L32 64 L58 64 L58 56 Q47 52 40 44Z" fill="#475569" />
    {/* Tie */}
    <polygon points="29.5,44 34.5,44 33,53 32,55 31,53" fill="#94a3b8" />
    {/* Neck */}
    <rect x="27" y="36" width="10" height="10" rx="3" fill="#94a3b8" />
    {/* Head */}
    <circle cx="32" cy="23" r="15" fill="#94a3b8" />
    {/* Hair cap */}
    <path d="M17 20 Q18 7 32 6 Q46 7 47 20 Q44 13 32 13 Q20 13 17 20Z" fill="#475569" />
    {/* Ear left */}
    <ellipse cx="17" cy="24" rx="2.5" ry="3.5" fill="#94a3b8" />
    {/* Ear right */}
    <ellipse cx="47" cy="24" rx="2.5" ry="3.5" fill="#94a3b8" />
    {/* Eyes */}
    <ellipse cx="25" cy="22" rx="2.5" ry="3" fill="#334155" />
    <ellipse cx="39" cy="22" rx="2.5" ry="3" fill="#334155" />
    {/* Smile */}
    <path d="M25 32 Q32 37 39 32" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" fill="none" />
  </svg>
);

const FemaleIcon = () => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* Body */}
    <path d="M8 64 Q8 48 32 45 Q56 48 56 64Z" fill="#94a3b8" />
    {/* Neck */}
    <rect x="27" y="37" width="10" height="10" rx="3" fill="#b0bec5" />
    {/* Curly/poofy hair — single large organic blob */}
    <path
      d="M32 4
         C18 3 8 11 8 24
         C8 31 10 36 13 40
         C16 43 20 45 25 46
         C27 47 30 47 32 47
         C34 47 37 47 39 46
         C44 45 48 43 51 40
         C54 36 56 31 56 24
         C56 11 46 3 32 4Z"
      fill="#475569"
    />
    {/* Curly bumps along top edge */}
    <path d="M19 10 C16 7 12 9 11 13 C13 11 17 10 19 10Z" fill="#334155" />
    <path d="M45 10 C48 7 52 9 53 13 C51 11 47 10 45 10Z" fill="#334155" />
    <path d="M26 5 C28 2 32 2 34 3 C32 3 29 4 26 5Z" fill="#334155" />
    <path d="M38 5 C36 2 32 2 30 3 C32 3 35 4 38 5Z" fill="#334155" />
    {/* Face */}
    <circle cx="32" cy="27" r="14" fill="#b0bec5" />
    {/* Ear left */}
    <ellipse cx="18" cy="28" rx="2.5" ry="3.5" fill="#b0bec5" />
    {/* Ear right */}
    <ellipse cx="46" cy="28" rx="2.5" ry="3.5" fill="#b0bec5" />
    {/* Eyes */}
    <ellipse cx="26" cy="26" rx="2.5" ry="3" fill="#334155" />
    <ellipse cx="38" cy="26" rx="2.5" ry="3" fill="#334155" />
    {/* Smile */}
    <path d="M26 34 Q32 38 38 34" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" fill="none" />
  </svg>
);

interface GenderAvatarProps {
  gender?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function GenderAvatar({ gender, name, size = 'md', className }: GenderAvatarProps) {
  const resolved = resolveGender(gender, name);
  const isFemale = resolved === 'female';
  const sizeClass = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';

  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center shrink-0 overflow-hidden bg-slate-50 border border-slate-200',
        sizeClass,
        className,
      )}
    >
      {isFemale ? <FemaleIcon /> : <MaleIcon />}
    </div>
  );
}
