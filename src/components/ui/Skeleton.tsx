import React from 'react';
import { cn } from '../../lib/utils';
import sandyLoadingGif from '../../assets/sandy-loading.gif';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/80', className)} {...props} />;
}

export function AppBootSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center justify-center">
          <img
            src={sandyLoadingGif}
            alt="Loading"
            className="w-24 h-24 object-contain"
          />
        </div>
        <div className="mt-4 text-center">
          <h2 className="text-base font-semibold text-slate-800">Loading QuizMaster...</h2>
          <p className="text-sm text-slate-500 mt-1">Please wait while we prepare your dashboard.</p>
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-2.5 w-5/6 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function LayoutPageSkeleton({
  cards = 4,
  rows = 6,
}: {
  cards?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function TableRowsSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('p-4 space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function QuizPageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="space-y-2 min-w-0 flex-1">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
      <div className="h-1 bg-slate-100">
        <Skeleton className="h-1 w-1/3 rounded-none" />
      </div>
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-slate-100 p-8 md:p-12 space-y-6 shadow-sm">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </main>
      <div className="bg-white border-t border-slate-200 p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Skeleton className="h-11 w-28 rounded-xl" />
          <Skeleton className="h-11 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
