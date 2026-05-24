import React, { useState, useRef } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { FlaskConical, ExternalLink, AlertCircle, RefreshCw, Maximize2 } from 'lucide-react';

const TEST_BUILDER_URL = 'https://elt.oup.com/student/headway/preint4/testbuilder?cc=global&selLanguage=en';

const UNITS = [
  { label: 'Unit 1', url: `${TEST_BUILDER_URL}&unit=1` },
  { label: 'Unit 2', url: `${TEST_BUILDER_URL}&unit=2` },
  { label: 'Unit 3', url: `${TEST_BUILDER_URL}&unit=3` },
  { label: 'Unit 4', url: `${TEST_BUILDER_URL}&unit=4` },
  { label: 'Unit 5', url: `${TEST_BUILDER_URL}&unit=5` },
  { label: 'Unit 6', url: `${TEST_BUILDER_URL}&unit=6` },
  { label: 'Unit 7', url: `${TEST_BUILDER_URL}&unit=7` },
  { label: 'Unit 8', url: `${TEST_BUILDER_URL}&unit=8` },
  { label: 'Unit 9', url: `${TEST_BUILDER_URL}&unit=9` },
  { label: 'Unit 10', url: `${TEST_BUILDER_URL}&unit=10` },
  { label: 'Unit 11', url: `${TEST_BUILDER_URL}&unit=11` },
  { label: 'Unit 12', url: `${TEST_BUILDER_URL}&unit=12` },
];

export default function TestBuilder() {
  const [iframeError, setIframeError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const reload = () => {
    setIframeError(false);
    setLoading(true);
    setKey(k => k + 1);
  };

  return (
    <StudentLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Headway Pre-Intermediate</p>
                <h1 className="text-2xl font-black text-slate-900">Test Builder</h1>
                <p className="text-sm text-slate-500 mt-1">Interactive tests for each unit — practise grammar, vocabulary and more</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={reload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Reload
              </button>
              <a
                href={TEST_BUILDER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                <Maximize2 className="w-4 h-4" /> Full Screen
              </a>
            </div>
          </div>

          {/* Unit quick links */}
          <div className="mt-5 flex flex-wrap gap-2">
            {UNITS.map(u => (
              <a
                key={u.label}
                href={u.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors border border-emerald-100"
              >
                {u.label}
              </a>
            ))}
          </div>
        </div>

        {/* Embedded Test Builder */}
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-700">Oxford University Press — Test Builder</span>
            <a
              href={TEST_BUILDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> elt.oup.com
            </a>
          </div>

          {iframeError ? (
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Cannot embed this page</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  The OUP Test Builder blocks embedding. Open it directly in a new tab to use all the interactive tests.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={reload}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Try Again
                </button>
                <a
                  href={TEST_BUILDER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Open Test Builder
                </a>
              </div>

              {/* Unit cards as fallback */}
              <div className="w-full max-w-2xl mt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Open a specific unit</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {UNITS.map(u => (
                    <a
                      key={u.label}
                      href={u.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center py-3 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-100 transition-all"
                    >
                      {u.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10" style={{ minHeight: '70vh' }}>
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-slate-500">Loading Test Builder…</p>
                  </div>
                </div>
              )}
              <iframe
                key={key}
                ref={iframeRef}
                src={TEST_BUILDER_URL}
                className="w-full"
                style={{ height: '75vh', border: 'none' }}
                title="Headway Test Builder"
                onLoad={(e) => {
                  setLoading(false);
                  try {
                    const doc = (e.target as HTMLIFrameElement).contentDocument;
                    if (!doc || doc.title === '' || doc.body.innerHTML === '') {
                      setIframeError(true);
                    }
                  } catch {
                    setIframeError(true);
                  }
                }}
                onError={() => { setLoading(false); setIframeError(true); }}
              />
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 pb-2">
          Content provided by <a href="https://elt.oup.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Oxford University Press</a>. All rights reserved.
        </p>
      </div>
    </StudentLayout>
  );
}
