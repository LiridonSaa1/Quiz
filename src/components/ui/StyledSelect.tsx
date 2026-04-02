import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StyledSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  icon?: React.ReactNode;
  wrapperClassName?: string;
}

const StyledSelect = React.forwardRef<HTMLSelectElement, StyledSelectProps>(
  ({ icon, wrapperClassName, className, children, ...props }, ref) => {
    return (
      <div className={cn('relative inline-flex items-center', wrapperClassName)}>
        {icon && (
          <span className="pointer-events-none absolute left-3 z-10 flex items-center text-slate-400">
            {icon}
          </span>
        )}
        <select
          ref={ref}
          {...props}
          className={cn(
            'w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pr-9 text-sm text-slate-700',
            'shadow-sm transition-all duration-150',
            'hover:border-slate-300 hover:bg-slate-50',
            'focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            icon ? 'pl-9' : 'pl-3.5',
            className
          )}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400 transition-transform duration-150" />
      </div>
    );
  }
);

StyledSelect.displayName = 'StyledSelect';

export default StyledSelect;
