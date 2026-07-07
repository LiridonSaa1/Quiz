import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import examsNotFoundGif from '../assets/exams-not-found.gif';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center">
        <img
          src={examsNotFoundGif}
          alt="Page not found"
          className="w-40 h-40 object-contain mx-auto"
        />

        <h1 className="mt-4 text-2xl font-bold text-slate-900">{t('notFound.pageNotFound')}</h1>
        <p className="mt-2 text-slate-500 text-sm">
          {t('notFound.pageDoesNotExist')}
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all"
          >
            <Home className="w-4 h-4" />
            {t('notFound.goHome')}
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('notFound.goBackBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
