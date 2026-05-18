import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

const LOADING_KEY_MAP: Record<string, string> = {
  'save': 'loadingBtn.saving',
  'save changes': 'loadingBtn.saving',
  'ruaj': 'loadingBtn.saving',
  'ruaj ndryshimet': 'loadingBtn.saving',
  'submit': 'loadingBtn.submitting',
  'dërgo': 'loadingBtn.submitting',
  'update': 'loadingBtn.updating',
  'përditëso': 'loadingBtn.updating',
  'delete': 'loadingBtn.deleting',
  'fshi': 'loadingBtn.deleting',
  'remove': 'loadingBtn.removing',
  'hiq': 'loadingBtn.removing',
  'upload': 'loadingBtn.uploading',
  'ngarko': 'loadingBtn.uploading',
  'generate': 'loadingBtn.generating',
  'gjenero': 'loadingBtn.generating',
  'create': 'loadingBtn.creating',
  'krijo': 'loadingBtn.creating',
  'add': 'loadingBtn.adding',
  'shto': 'loadingBtn.adding',
  'send': 'loadingBtn.sending',
  'dërgo mesazh': 'loadingBtn.sending',
  'publish': 'loadingBtn.publishing',
  'publiko': 'loadingBtn.publishing',
  'export': 'loadingBtn.exporting',
  'eksporto': 'loadingBtn.exporting',
  'approve': 'loadingBtn.approving',
  'mirato': 'loadingBtn.approving',
  'reject': 'loadingBtn.rejecting',
  'refuzo': 'loadingBtn.rejecting',
  'assign': 'loadingBtn.assigning',
  'cakto': 'loadingBtn.assigning',
  'sign in': 'loadingBtn.signingIn',
  'kyçu': 'loadingBtn.signingIn',
  'login': 'loadingBtn.signingIn',
  'register': 'loadingBtn.registering',
  'regjistrohu': 'loadingBtn.registering',
  'reset': 'loadingBtn.resetting',
  'rivendos': 'loadingBtn.resetting',
  'verify': 'loadingBtn.verifying',
  'verifiko': 'loadingBtn.verifying',
  'confirm': 'loadingBtn.confirming',
  'konfirmo': 'loadingBtn.confirming',
  'invite': 'loadingBtn.inviting',
  'fto': 'loadingBtn.inviting',
  'mark': 'loadingBtn.marking',
  'shëno': 'loadingBtn.marking',
  'grade': 'loadingBtn.grading',
  'vlerëso': 'loadingBtn.grading',
  'issue': 'loadingBtn.issuing',
  'lësho': 'loadingBtn.issuing',
  'revoke': 'loadingBtn.revoking',
  'revoko': 'loadingBtn.revoking',
  'enroll': 'loadingBtn.enrolling',
  'regjistro': 'loadingBtn.enrolling',
  'import': 'loadingBtn.importing',
  'importo': 'loadingBtn.importing',
  'download': 'loadingBtn.downloading',
  'shkarko': 'loadingBtn.downloading',
  'apply': 'loadingBtn.applying',
  'apliko': 'loadingBtn.applying',
  'post': 'loadingBtn.posting',
  'posto': 'loadingBtn.posting',
};

type ButtonVariant = 'primary' | 'danger' | 'secondary' | 'ghost' | 'outline' | 'success' | 'warning';
type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:   'bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 shadow-sm hover:shadow-indigo-200',
  danger:    'bg-gradient-to-r from-rose-500 to-red-500 text-white hover:from-rose-600 hover:to-red-600 shadow-sm hover:shadow-rose-200',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  ghost:     'bg-transparent text-slate-600 hover:bg-slate-100',
  outline:   'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  success:   'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-sm hover:shadow-emerald-200',
  warning:   'bg-gradient-to-r from-amber-400 to-orange-400 text-white hover:from-amber-500 hover:to-orange-500 shadow-sm',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-7  px-2.5 text-xs  gap-1.5 rounded-lg',
  sm: 'h-8  px-3   text-sm  gap-1.5 rounded-lg',
  md: 'h-10 px-4   text-sm  gap-2   rounded-xl',
  lg: 'h-11 px-5   text-base gap-2  rounded-xl',
};

export interface LoadingButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean;
  loadingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children: React.ReactNode;
  fullWidth?: boolean;
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    {
      loading = false,
      loadingText,
      variant = 'primary',
      size = 'md',
      icon,
      iconRight,
      children,
      fullWidth = false,
      className,
      disabled,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const { t } = useTranslation();
    const isDisabled = disabled || loading;
    const label = typeof children === 'string' ? children : '';

    const inferLoadingText = (lbl: string): string => {
      const lower = lbl.toLowerCase().trim();
      for (const [key, i18nKey] of Object.entries(LOADING_KEY_MAP)) {
        if (lower === key || lower.startsWith(key + ' ')) return t(i18nKey, { defaultValue: t('common.loading') });
      }
      return t('common.loading');
    };

    const resolvedLoadingText = loadingText ?? inferLoadingText(label);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        className={cn(
          'relative inline-flex items-center justify-center font-medium transition-all duration-200 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
          SIZE_CLASSES[size],
          VARIANT_CLASSES[variant],
          fullWidth && 'w-full',
          isDisabled
            ? 'opacity-60 cursor-not-allowed pointer-events-none'
            : 'active:scale-[0.97]',
          className
        )}
        {...rest}
      >
        {loading ? (
          <>
            <Loader2
              className="animate-spin shrink-0"
              style={{ width: size === 'xs' ? 12 : size === 'sm' ? 14 : 16, height: size === 'xs' ? 12 : size === 'sm' ? 14 : 16 }}
              aria-label={t('common.loading')}
            />
            <span>{resolvedLoadingText}</span>
          </>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            <span>{children}</span>
            {iconRight && <span className="shrink-0">{iconRight}</span>}
          </>
        )}
      </button>
    );
  }
);

LoadingButton.displayName = 'LoadingButton';

export default LoadingButton;
