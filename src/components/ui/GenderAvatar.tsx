import React from 'react';
import { cn } from '../../lib/utils';
import { resolveGender } from '../../lib/genderUtils';

const MaleIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
    {/* Suit body */}
    <path d="M14 80 Q14 56 40 53 Q66 56 66 80Z" fill="#64748b" />
    {/* Collar left */}
    <path d="M33 53 L40 65 L40 80 L14 80 L14 72 Q28 68 33 53Z" fill="#475569" />
    {/* Collar right */}
    <path d="M47 53 L40 65 L40 80 L66 80 L66 72 Q52 68 47 53Z" fill="#475569" />
    {/* Shirt/tie center */}
    <path d="M36 53 L40 58 L44 53 L42 65 L40 68 L38 65Z" fill="#e2e8f0" />
    {/* Tie knot */}
    <rect x="38" y="53" width="4" height="4" rx="1" fill="#94a3b8" />
    {/* Neck */}
    <rect x="35" y="45" width="10" height="10" rx="3" fill="#94a3b8" />
    {/* Head */}
    <circle cx="40" cy="32" r="16" fill="#94a3b8" />
    {/* Hair */}
    <path d="M24 28 Q25 14 40 12 Q55 14 56 28 Q53 20 40 19 Q27 20 24 28Z" fill="#475569" />
    {/* Ear left */}
    <ellipse cx="24" cy="33" rx="3" ry="4" fill="#94a3b8" />
    {/* Ear right */}
    <ellipse cx="56" cy="33" rx="3" ry="4" fill="#94a3b8" />
    {/* Eyes */}
    <ellipse cx="34" cy="32" rx="2.5" ry="3" fill="#475569" />
    <ellipse cx="46" cy="32" rx="2.5" ry="3" fill="#475569" />
    {/* Smile */}
    <path d="M34 42 Q40 46 46 42" stroke="#475569" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
);

const FemaleIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
    {/* Body */}
    <path d="M16 80 Q16 57 40 54 Q64 57 64 80Z" fill="#94a3b8" />
    {/* Top clothing */}
    <path d="M30 54 Q40 57 50 54 L48 80 L32 80Z" fill="#cbd5e1" />
    {/* Neck */}
    <rect x="35" y="46" width="10" height="10" rx="3" fill="#b0bec5" />
    {/* Curly hair — multiple overlapping circles for poofy/afro look */}
    <circle cx="40" cy="16" r="9" fill="#64748b" />
    <circle cx="26" cy="20" r="8" fill="#64748b" />
    <circle cx="54" cy="20" r="8" fill="#64748b" />
    <circle cx="20" cy="30" r="7" fill="#64748b" />
    <circle cx="60" cy="30" r="7" fill="#64748b" />
    <circle cx="23" cy="40" r="6" fill="#64748b" />
    <circle cx="57" cy="40" r="6" fill="#64748b" />
    <circle cx="33" cy="15" r="7" fill="#64748b" />
    <circle cx="47" cy="15" r="7" fill="#64748b" />
    {/* Head (face on top of hair) */}
    <circle cx="40" cy="33" r="14" fill="#b0bec5" />
    {/* Ear left */}
    <ellipse cx="26" cy="34" rx="3" ry="4" fill="#b0bec5" />
    {/* Ear right */}
    <ellipse cx="54" cy="34" rx="3" ry="4" fill="#b0bec5" />
    {/* Eyes */}
    <ellipse cx="35" cy="32" rx="2.5" ry="3" fill="#475569" />
    <ellipse cx="45" cy="32" rx="2.5" ry="3" fill="#475569" />
    {/* Eyelashes */}
    <path d="M32.5 29 L33 27" stroke="#475569" strokeWidth="1" />
    <path d="M35 28.5 L35 26.5" stroke="#475569" strokeWidth="1" />
    <path d="M37.5 29 L37 27" stroke="#475569" strokeWidth="1" />
    <path d="M42.5 29 L43 27" stroke="#475569" strokeWidth="1" />
    <path d="M45 28.5 L45 26.5" stroke="#475569" strokeWidth="1" />
    <path d="M47.5 29 L47 27" stroke="#475569" strokeWidth="1" />
    {/* Smile */}
    <path d="M35 42 Q40 46 45 42" stroke="#475569" strokeWidth="2" strokeLinecap="round" fill="none" />
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
