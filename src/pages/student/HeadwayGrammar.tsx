import React, { useState, useRef } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { BookOpen, ExternalLink, AlertCircle, RefreshCw, Maximize2 } from 'lucide-react';

const OUP_BASE = 'https://elt.oup.com/student/headway/preint4';

const TABS = [
  { key: 'grammar',      label: 'Grammar',          url: `${OUP_BASE}/grammar?cc=global&selLanguage=en`,         color: 'from-indigo-500 to-violet-600' },
  { key: 'vocabulary',   label: 'Vocabulary',        url: `${OUP_BASE}/vocabulary?cc=global&selLanguage=en`,      color: 'from-blue-500 to-cyan-600' },
  { key: 'everyday',    label: 'Everyday English',   url: `${OUP_BASE}/everydayenglish?cc=global&selLanguage=en`, color: 'from-emerald-500 to-teal-600' },
];

const UNITS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function HeadwayGrammar() {
  const [activeTab, setActiveTab] = useState('grammar');
  const [iframeError, setIframeError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const currentTab = TABS.find(t => t.key === activeTab) || TABS[0];

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setIframeError(false);
    setLoading(true);
    setIframeKey(k => k + 1);
  };

  const reload = () => {
    setIframeError(false);
    setLoading(true);
    setIframeKey(k => k + 1);
  };

  return (
    <StudentLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${currentTab.color} flex items-center justify-center flex-shrink-0`}>
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-0.5">Headway Pre-Intermediate</p>
                <h1 className="text-2xl font-black text-slate-900">Grammar &amp; Practice</h1>
                <p className="text-sm text-slate-500 mt-1">Interactive exercises for Grammar, Vocabulary and Everyday English</p>
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
                href={currentTab.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                <Maximize2 className="w-4 h-4" /> Full Screen
              </a>
            </div>
          </div>

          {/* Section Tabs */}
          <div className="mt-5 flex flex-wrap gap-2">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === tab.key
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-sm`
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Unit quick links */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-xs font-semibold text-slate-400 self-center mr-1">Units:</span>
            {UNITS.map(u => (
              <a
                key={u}
                href={`${currentTab.url}&unit=${u}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-100 transition-colors"
              >
                {u}
              </a>
            ))}
          </div>
        </div>

        {/* Embedded OUP content */}
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${currentTab.color}`} />
              <span className="text-sm font-bold text-slate-700">{currentTab.label} — Oxford University Press</span>
            </div>
            <a
              href={currentTab.url}
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
                  The OUP {currentTab.label} page blocks embedding. Open it directly to practise.
                </p>
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                <button
                  onClick={reload}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Try Again
                </button>
                <a
                  href={currentTab.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Open {currentTab.label}
                </a>
              </div>

              {/* Unit cards as fallback */}
              <div className="w-full max-w-2xl mt-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Open a specific unit</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {UNITS.map(u => (
                    <a
                      key={u}
                      href={`${currentTab.url}&unit=${u}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center py-3 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-100 transition-all"
                    >
                      {u}
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
                    <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin bg-gradient-to-r ${currentTab.color}`}
                      style={{ borderTopColor: 'transparent' }}
                    />
                    <p className="text-sm text-slate-500">Loading {currentTab.label}…</p>
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={currentTab.url}
                className="w-full"
                style={{ height: '75vh', border: 'none' }}
                title={`Headway ${currentTab.label}`}
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

        <p className="text-center text-xs text-slate-400 pb-2">
          Content provided by <a href="https://elt.oup.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Oxford University Press</a>. All rights reserved.
        </p>
      </div>
    </StudentLayout>
  );
}
