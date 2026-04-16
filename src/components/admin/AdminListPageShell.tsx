import React, { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

function AnimatedCount({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
}

export type AdminListPageStat = {
  label: string;
  value: number;
  gradient: string;
  shadow: string;
  icon: React.ElementType;
};

export const ADMIN_LIST_SEARCH_INPUT =
  'w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400';

export const ADMIN_LIST_SELECT =
  'px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700';

/** Card grid inside the white list panel (replaces tables). */
export const ADMIN_LIST_CARD_GRID =
  'p-4 sm:p-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

/** Single list item card. */
export const ADMIN_LIST_ITEM_CARD =
  'rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-indigo-100/70 transition-all';

export function AdminListFilterBar({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="rounded-2xl border border-white/60 shadow-sm p-4 flex flex-wrap gap-3 items-center"
      style={{
        background: 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Filters</p>
      {children}
    </motion.div>
  );
}

export type AdminListPageShellProps = {
  breadcrumbLabel: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  stats: AdminListPageStat[];
  statsGridClassName?: string;
  statsAppend?: React.ReactNode;
  filterBar?: React.ReactNode;
  children: React.ReactNode;
};

export function AdminListPageShell({
  breadcrumbLabel,
  title,
  description,
  action,
  stats,
  statsGridClassName = 'grid grid-cols-2 lg:grid-cols-4 gap-4',
  statsAppend,
  filterBar,
  children,
}: AdminListPageShellProps) {
  return (
    <div
      className="min-h-screen -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 -mt-6"
      style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
    >
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />
        <div className="pointer-events-none absolute top-96 left-1/2 w-72 h-72 rounded-full bg-indigo-100/20 blur-3xl" />

        <div
          className="relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)',
          }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />

          <div className="relative px-6 sm:px-8 lg:px-10 py-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                  <span className="text-indigo-400 tracking-wider uppercase">Admin Portal</span>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                  <span className="text-indigo-200 tracking-wider uppercase">{breadcrumbLabel}</span>
                </nav>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">{title}</h1>
                <p className="text-indigo-200 text-sm mt-2 max-w-md">{description}</p>
              </div>
              {action}
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
          <motion.div
            className={cn(statsGridClassName)}
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
          >
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
                  }}
                  className={cn(
                    'relative overflow-hidden rounded-2xl p-5 text-white shadow-lg',
                    `bg-gradient-to-br ${stat.gradient}`,
                    stat.shadow
                  )}
                  style={{ boxShadow: `0 8px 24px var(--tw-shadow-color, rgba(0,0,0,0.12))` }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-3xl font-extrabold tracking-tight">
                        <AnimatedCount value={stat.value} />
                      </div>
                      <div className="text-xs font-semibold text-white/75 mt-1">{stat.label}</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                </motion.div>
              );
            })}
            {statsAppend}
          </motion.div>

          {filterBar}
          {children}
        </div>
      </div>
    </div>
  );
}
