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
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[55%] h-[55%]">
    <circle cx="12" cy="6.5" r="3.5" />
    <path d="M12 12c-3.5 0-5.5 1.8-5.5 3.5V18h11v-2.5c0-1.7-2-3.5-5.5-3.5z" />
  </svg>
);

const FemaleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[55%] h-[55%]">
    <circle cx="12" cy="6" r="3.5" />
    <path d="M12 11c-2.8 0-4.5 1.4-4.5 2.8L6 19h12l-1.5-5.2c0-1.4-1.7-2.8-4.5-2.8z" />
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

  const sizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center shrink-0',
        isFemale
          ? 'bg-gradient-to-br from-pink-400 to-rose-500 text-white'
          : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white',
        sizeClass,
        className,
      )}
    >
      {isFemale ? <FemaleIcon /> : <MaleIcon />}
    </div>
  );
}
