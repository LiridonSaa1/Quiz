import React, { useState, useRef } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { Headphones, Video, ExternalLink, AlertCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';

const OUP_BASE = 'https://elt.oup.com/student/headway/preint4';

const UNITS = Array.from({ length: 12 }, (_, i) => i + 1);

const SECTIONS = [
  {
    key: 'book_audio',
    title: "Student's Book Audio",
    icon: Headphones,
    color: 'from-indigo-500 to-violet-600',
    items: UNITS.map(u => ({
      label: `Unit ${u}`,
      size: [23, 18, 16, 22, 36, 17, 26, 22, 36, 28, 15, 21][u - 1],
      url: `${OUP_BASE}/audiodl?cc=global&selLanguage=en`,
    })),
  },
  {
    key: 'video',
    title: 'Video',
    icon: Video,
    color: 'from-rose-500 to-pink-600',
    items: UNITS.map(u => ({
      label: `Unit ${u}`,
      size: [45, 38, 52, 41, 60, 35, 48, 55, 43, 50, 37, 44][u - 1],
      url: `${OUP_BASE}/audiodl?cc=global&selLanguage=en`,
    })),
  },
];

export default function HeadwayAudio() {
  const [open, setOpen] = useState<Record<string, boolean>>({ book_audio: true, video: false });
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  const OUP_URL = `${OUP_BASE}/audiodl?cc=global&selLanguage=en`;

  return (
    <StudentLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                <Headphones className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-0.5">Headway Pre-Intermediate</p>
                <h1 className="text-2xl font-black text-slate-900">Audio and Video Downloads</h1>
                <p className="text-sm text-slate-500 mt-1">Download audio and video resources to help you study better with <em>Headway</em></p>
              </div>
            </div>
            <a
              href={OUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> OUP Site
            </a>
          </div>
        </div>

        {/* Resource sections */}
        {SECTIONS.map(section => (
          <div key={section.key} className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
            <button
              onClick={() => toggle(section.key)}
              className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center`}>
                  <section.icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-slate-900">{section.title}</span>
                <span className="text-xs text-slate-400 font-medium">{section.items.length} units</span>
              </div>
              {open[section.key] ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {open[section.key] && (
              <div className="border-t border-slate-100">
                {section.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                    <span className="text-sm font-semibold text-indigo-600 group-hover:text-indigo-700 cursor-pointer">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">(ZIP, {item.size}MB)</span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Embedded OUP page */}
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">OUP Audio &amp; Video Page</h2>
            <a
              href={OUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Full Page
            </a>
          </div>

          {iframeError ? (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <h3 className="text-base font-bold text-slate-900">Embedding not allowed</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                The OUP website prevents embedding. Use the download buttons above or open the full page directly.
              </p>
              <a
                href={OUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Open on OUP Website
              </a>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={OUP_URL}
              className="w-full"
              style={{ height: '60vh', border: 'none' }}
              title="OUP Audio and Video Downloads"
              onError={() => setIframeError(true)}
              onLoad={(e) => {
                try {
                  const doc = (e.target as HTMLIFrameElement).contentDocument;
                  if (!doc || doc.body.innerHTML === '') setIframeError(true);
                } catch {
                  setIframeError(true);
                }
              }}
            />
          )}
        </div>
      </div>
    </StudentLayout>
  );
}
