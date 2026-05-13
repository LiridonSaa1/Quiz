import React from 'react';
import { cn } from '../../lib/utils';

export type Gender = 'male' | 'female';

const FEMALE_ENDINGS = ['ita', 'ina', 'eta', 'isa', 'ela', 'ora', 'ura', 'ara', 'ana', 'ola', 'lla', 'ia', 'ra', 'sa', 'na', 'ta', 'a'];

export function resolveGender(gender?: string | null, name?: string): Gender {
  if (gender) {
    const g = gender.toLowerCase();
    if (g === 'male' || g === 'm') return 'male';
    if (g === 'female' || g === 'f') return 'female';
  }
  if (name) {
    const first = name.trim().toLowerCase().split(' ')[0];
    for (const end of FEMALE_ENDINGS) {
      if (first.endsWith(end) && first.length > end.length + 1) return 'female';
    }
  }
  return 'male';
}

const MaleIcon = () => (
  <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
    {/* Body/shirt */}
    <rect x="16" y="38" width="32" height="22" rx="6" fill="#cbd5e1" />
    {/* Tie */}
    <polygon points="32,40 29,46 32,52 35,46" fill="#94a3b8" />
    <rect x="30" y="37" width="4" height="5" rx="1" fill="#94a3b8" />
    {/* Head */}
    <circle cx="32" cy="26" r="11" fill="#cbd5e1" />
    {/* Hair */}
    <path d="M21 22 Q22 14 32 13 Q42 14 43 22 Q40 18 32 18 Q24 18 21 22Z" fill="#64748b" />
    {/* Ears */}
    <ellipse cx="21" cy="27" rx="2.5" ry="3" fill="#cbd5e1" />
    <ellipse cx="43" cy="27" rx="2.5" ry="3" fill="#cbd5e1" />
    {/* Face details */}
    <ellipse cx="27.5" cy="27" rx="1.5" ry="2" fill="#94a3b8" />
    <ellipse cx="36.5" cy="27" rx="1.5" ry="2" fill="#94a3b8" />
    <path d="M28 33 Q32 36 36 33" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
);

const FemaleIcon = () => (
  <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
    {/* Body/blouse */}
    <rect x="16" y="38" width="32" height="22" rx="6" fill="#e2e8f0" />
    {/* Necklace/collar detail */}
    <path d="M24 39 Q32 43 40 39" stroke="#cbd5e1" strokeWidth="2" fill="none" />
    {/* Head */}
    <circle cx="32" cy="26" r="11" fill="#e2e8f0" />
    {/* Hair - longer/curly */}
    <path d="M20 22 Q18 12 32 11 Q46 12 44 22 Q44 28 46 32 Q44 30 43 26 Q40 18 32 17 Q24 18 21 26 Q20 30 18 32 Q16 28 20 22Z" fill="#94a3b8" />
    {/* Side hair curls */}
    <path d="M21 26 Q18 30 19 35 Q20 32 22 30" fill="#94a3b8" />
    <path d="M43 26 Q46 30 45 35 Q44 32 42 30" fill="#94a3b8" />
    {/* Ears */}
    <ellipse cx="21" cy="27" rx="2.5" ry="3" fill="#e2e8f0" />
    <ellipse cx="43" cy="27" rx="2.5" ry="3" fill="#e2e8f0" />
    {/* Face details */}
    <ellipse cx="27.5" cy="27" rx="1.5" ry="2" fill="#94a3b8" />
    <ellipse cx="36.5" cy="27" rx="1.5" ry="2" fill="#94a3b8" />
    <path d="M28 33 Q32 36.5 36 33" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
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

  const sizeClass = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-14 h-14' : 'w-12 h-12';

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
