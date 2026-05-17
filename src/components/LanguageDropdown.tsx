import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'sq', label: 'Shqip',   flag: '🇦🇱' },
  { code: 'fr', label: 'Français',flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

interface LanguageDropdownProps {
  variant?: 'light' | 'dark';
}

export default function LanguageDropdown({ variant = 'light' }: LanguageDropdownProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  const isDark = variant === 'dark';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all select-none',
          isDark
            ? 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        )}
        title="Change language"
      >
        <Globe className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">{current.flag} {current.label}</span>
        <span className="sm:hidden">{current.flag}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 mt-1.5 w-40 rounded-xl shadow-xl border overflow-hidden z-[9999]',
            isDark
              ? 'bg-slate-900 border-white/10'
              : 'bg-white border-slate-200'
          )}
          style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
        >
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors',
                isDark
                  ? 'text-slate-300 hover:bg-white/[0.06]'
                  : 'text-slate-700 hover:bg-slate-50',
                lang.code === i18n.language && (isDark ? 'bg-white/[0.04]' : 'bg-slate-50')
              )}
            >
              <span className="text-base">{lang.flag}</span>
              <span className="flex-1 text-left font-medium">{lang.label}</span>
              {lang.code === i18n.language && (
                <Check className={cn('w-3.5 h-3.5', isDark ? 'text-violet-400' : 'text-indigo-600')} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
