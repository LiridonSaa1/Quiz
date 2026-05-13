import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const LOADING_TEXT_MAP: Record<string, string> = {
  'save':       'Saving...',
  'save changes': 'Saving...',
  'submit':     'Submitting...',
  'update':     'Updating...',
  'delete':     'Deleting...',
  'remove':     'Removing...',
  'upload':     'Uploading...',
  'generate':   'Generating...',
  'create':     'Creating...',
  'add':        'Adding...',
  'send':       'Sending...',
  'publish':    'Publishing...',
  'export':     'Exporting...',
  'approve':    'Approving...',
  'reject':     'Rejecting...',
  'assign':     'Assigning...',
  'sign in':    'Signing in...',
  'login':      'Signing in...',
  'log in':     'Signing in...',
  'register':   'Registering...',
  'reset':      'Resetting...',
  'verify':     'Verifying...',
  'confirm':    'Confirming...',
  'invite':     'Inviting...',
  'mark':       'Marking...',
  'grade':      'Grading...',
  'issue':      'Issuing...',
  'revoke':     'Revoking...',
  'enroll':     'Enrolling...',
  'import':     'Importing...',
  'download':   'Downloading...',
  'apply':      'Applying...',
  'post':       'Posting...',
};

function inferLoadingText(label: string): string {
  const lower = label.toLowerCase().trim();
  for (const [key, val] of Object.entries(LOADING_TEXT_MAP)) {
    if (lower === key || lower.startsWith(key + ' ')) return val;
  }
  return 'Loading...';
}

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
    const isDisabled = disabled || loading;
    const label = typeof children === 'string' ? children : '';
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
              aria-label="Loading"
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
