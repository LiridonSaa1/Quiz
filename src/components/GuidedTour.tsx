import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, ChevronRight, CheckCircle2, Navigation } from 'lucide-react';
import { Tour, TourStep } from '../lib/tourDefinitions';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface GuidedTourProps {
  tour: Tour;
  onClose: () => void;
}

const COLOR_MAP: Record<string, { ring: string; badge: string; btn: string; dot: string; dotActive: string }> = {
  indigo:  { ring: 'ring-indigo-200',  badge: 'bg-indigo-100 text-indigo-700',  btn: 'bg-indigo-600 hover:bg-indigo-700',  dot: 'bg-indigo-200', dotActive: 'bg-indigo-600' },
  violet:  { ring: 'ring-violet-200',  badge: 'bg-violet-100 text-violet-700',  btn: 'bg-violet-600 hover:bg-violet-700',  dot: 'bg-violet-200', dotActive: 'bg-violet-600' },
  emerald: { ring: 'ring-emerald-200', badge: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-600 hover:bg-emerald-700', dot: 'bg-emerald-200', dotActive: 'bg-emerald-600' },
  amber:   { ring: 'ring-amber-200',   badge: 'bg-amber-100 text-amber-700',   btn: 'bg-amber-500 hover:bg-amber-600',   dot: 'bg-amber-200', dotActive: 'bg-amber-500' },
  rose:    { ring: 'ring-rose-200',    badge: 'bg-rose-100 text-rose-700',    btn: 'bg-rose-600 hover:bg-rose-700',    dot: 'bg-rose-200', dotActive: 'bg-rose-600' },
  blue:    { ring: 'ring-blue-200',    badge: 'bg-blue-100 text-blue-700',    btn: 'bg-blue-600 hover:bg-blue-700',    dot: 'bg-blue-200', dotActive: 'bg-blue-600' },
  teal:    { ring: 'ring-teal-200',    badge: 'bg-teal-100 text-teal-700',    btn: 'bg-teal-600 hover:bg-teal-700',    dot: 'bg-teal-200', dotActive: 'bg-teal-600' },
};

export default function GuidedTour({ tour, onClose }: GuidedTourProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const navigate = useNavigate();
  const colors = COLOR_MAP[tour.color] || COLOR_MAP.indigo;
  const current: TourStep = tour.steps[step];
  const isLast = step === tour.steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && step < tour.steps.length - 1) goTo(step + 1);
      if (e.key === 'ArrowLeft' && step > 0) goTo(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const goTo = (next: number) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 180);
  };

  const handleNavigate = () => {
    if (current.navigateTo) {
      navigate(current.navigateTo);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden ring-1 ring-slate-100">

        {/* Header gradient bar */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${tour.gradient}`} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${colors.badge}`}>
                  {t('guidedTour.stepOf', { step: step + 1, total: tour.steps.length })}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">{tour.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{tour.subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1.5 mt-4">
            {tour.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step ? `${colors.dotActive} w-6` : `${colors.dot} w-1.5 hover:opacity-70`
                )}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div
          className={cn(
            'px-6 py-5 transition-all duration-180',
            animating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
          )}
        >
          {/* Icon + Title */}
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tour.gradient} flex items-center justify-center text-2xl shadow-md`}>
              {current.icon}
            </div>
            <h3 className="text-base font-bold text-slate-800">{current.title}</h3>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            {current.description}
          </p>

          {/* Tip */}
          {current.tip && (
            <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mb-4">
              <span className="text-base mt-0.5">💡</span>
              <p className="text-xs text-slate-500 leading-relaxed">{current.tip}</p>
            </div>
          )}

          {/* Navigate button */}
          {current.navigateTo && (
            <button
              onClick={handleNavigate}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all',
                colors.btn
              )}
            >
              <Navigation className="w-4 h-4" />
              {current.actionLabel || t('guidedTour.goThere')}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {t('guidedTour.skipTour')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => goTo(step - 1)}
              disabled={step === 0}
              className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {isLast ? (
              <button
                onClick={onClose}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all',
                  colors.btn
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
                {t('guidedTour.done')}
              </button>
            ) : (
              <button
                onClick={() => goTo(step + 1)}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all',
                  colors.btn
                )}
              >
                {t('guidedTour.next')}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
