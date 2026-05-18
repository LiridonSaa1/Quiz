import React, { useEffect, useState } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { authFetch } from '../../lib/apiUrl';
import {
  Presentation, Wand2, Sparkles, X, ChevronLeft, ChevronRight,
  Monitor, Trash2, Download, Loader2, Check, ClipboardList,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

interface Slide {
  order: number;
  type: string;
  title: string;
  content: string[];
  notes?: string;
  emoji?: string;
}
interface PresentationRecord {
  id: string;
  title: string;
  description?: string;
  theme: string;
  language: string;
  education_level?: string;
  assignment_id?: string | null;
  slides: Slide[];
  created_at: string;
}
interface AssignmentOption {
  id: string;
  title: string;
  courseTitle: string;
}

const THEMES = [
  { value: 'modern',    label: 'Modern',    gradient: 'from-indigo-500 to-violet-600',  desc: 'Clean & Bold' },
  { value: 'business',  label: 'Business',  gradient: 'from-slate-600 to-slate-800',    desc: 'Professional' },
  { value: 'education', label: 'Education', gradient: 'from-emerald-500 to-teal-600',   desc: 'Colorful & Fun' },
  { value: 'minimal',   label: 'Minimal',   gradient: 'from-gray-400 to-gray-600',      desc: 'Simple & Clean' },
];
const LANGUAGES = ['English', 'Albanian', 'German', 'French', 'Spanish', 'Italian'];
const LEVELS    = ['Elementary', 'Middle School', 'High School', 'University', 'General'];

const THEME_META: Record<string, { bg: string }> = {
  modern:    { bg: 'from-indigo-600 to-violet-700' },
  business:  { bg: 'from-slate-700 to-slate-900' },
  education: { bg: 'from-emerald-500 to-teal-600' },
  minimal:   { bg: 'from-gray-400 to-gray-600' },
};

/* ─── Fullscreen Presenter ─── */
function SlidePresenter({ slides, theme, title, onClose }: { slides: Slide[]; theme: string; title: string; onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const colors = THEME_META[theme] || THEME_META.modern;
  const slide = slides[current];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrent(c => Math.min(slides.length - 1, c + 1));
      if (e.key === 'ArrowLeft') setCurrent(c => Math.max(0, c - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [slides.length, onClose]);

  if (!slide) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 bg-black/40 border-b border-white/10">
        <span className="text-white/70 text-sm font-medium">{title}</span>
        <div className="flex items-center gap-4">
          <span className="text-white/40 text-sm">{current + 1} / {slides.length}</span>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className={`w-full max-w-4xl bg-gradient-to-br ${colors.bg} rounded-3xl p-12 min-h-[380px] flex flex-col justify-center shadow-2xl`}
          >
            {slide.emoji && <div className="text-5xl mb-6">{slide.emoji}</div>}
            <h2 className="text-3xl font-black text-white mb-8 leading-tight">{slide.title}</h2>
            {slide.content?.length > 0 && (
              <ul className="space-y-3">
                {slide.content.map((pt, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                    className="flex items-start gap-4 text-white/90 text-xl">
                    <span className="mt-2 w-2.5 h-2.5 rounded-full bg-white/60 shrink-0" />{pt}
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {slide.notes && (
        <div className="px-6 py-3 bg-black/40 border-t border-white/10">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">Speaker Notes</p>
          <p className="text-white/70 text-sm">{slide.notes}</p>
        </div>
      )}
      <div className="flex items-center justify-center gap-4 py-4 bg-black/40 border-t border-white/10">
        <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
          className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl disabled:opacity-30">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={cn('w-2 h-2 rounded-full transition-all', i === current ? 'bg-white w-6' : 'bg-white/30')} />
          ))}
        </div>
        <button onClick={() => setCurrent(c => Math.min(slides.length - 1, c + 1))} disabled={current === slides.length - 1}
          className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl disabled:opacity-30">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Generate Modal ─── */
function GenerateModal({
  onGenerated,
  onClose,
}: {
  onGenerated: (data: any, opts: any) => void;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [slideCount, setSlideCount] = useState(7);
  const [theme, setTheme] = useState('modern');
  const [language, setLanguage] = useState('English');
  const [level, setLevel] = useState('General');
  const [assignmentId, setAssignmentId] = useState<string>('');
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authFetch('/api/student/assignments')
      .then(r => r.json())
      .then(json => {
        const list: AssignmentOption[] = (json.assignments || []).map((a: any) => ({
          id: String(a.id),
          title: String(a.title || 'Untitled'),
          courseTitle: String(a.course_title || a.courseTitle || ''),
        }));
        setAssignments(list);
      })
      .catch(() => {})
      .finally(() => setLoadingAssignments(false));
  }, []);

  async function generate() {
    if (!topic.trim()) { toast.error('Please enter a topic'); return; }
    setLoading(true);
    try {
      const res = await authFetch('/api/presentations/generate', {
        method: 'POST',
        body: JSON.stringify({ topic, slideCount, style: theme, language, educationLevel: level }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      onGenerated(json.data, { theme, language, educationLevel: level, description, assignmentId: assignmentId || null });
    } catch (e: any) {
      toast.error(e.message || 'AI generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl my-4">
        <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8 relative">
          <div className="absolute inset-0 opacity-15" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }} />
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
          <Wand2 className="w-10 h-10 text-white/90 mb-3" />
          <h2 className="text-2xl font-bold text-white">AI Presentation Generator</h2>
          <p className="text-white/70 text-sm mt-1">Enter your topic and AI creates it instantly</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Assignment selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-400" />
              Link to Assignment <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            {loadingAssignments ? (
              <div className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-400 bg-slate-50 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading assignments...
              </div>
            ) : (
              <select
                value={assignmentId}
                onChange={e => setAssignmentId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white"
              >
                <option value="">— No assignment —</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.courseTitle ? `[${a.courseTitle}] ${a.title}` : a.title}
                  </option>
                ))}
              </select>
            )}
            {!loadingAssignments && assignments.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">No published assignments found for your teacher.</p>
            )}
          </div>

          {/* Topic */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Topic *</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis, World War II, Artificial Intelligence..."
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Description <span className="text-slate-400 font-normal">(optional context for AI)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what the presentation should cover, key points, target audience, or any specific requirements..."
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none leading-relaxed"
            />
          </div>

          {/* Style */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Style</label>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map(t => (
                <button key={t.value} onClick={() => setTheme(t.value)}
                  className={cn('flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left',
                    theme === t.value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                  )}>
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${t.gradient}`} />
                  <div>
                    <div className="text-slate-800 text-sm font-semibold">{t.label}</div>
                    <div className="text-slate-400 text-xs">{t.desc}</div>
                  </div>
                  {theme === t.value && <Check className="w-4 h-4 text-indigo-500 ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Slides / Language / Level */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Slides</label>
              <select value={slideCount} onChange={e => setSlideCount(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {[5, 6, 7, 8, 10, 12].map(n => <option key={n} value={n}>{n} slides</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Level</label>
              <select value={level} onChange={e => setLevel(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <button onClick={generate} disabled={loading || !topic.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate with AI</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function StudentPresentations() {
  const [presentations, setPresentations] = useState<PresentationRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [presenting, setPresenting] = useState<PresentationRecord | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    authFetch('/api/student/assignments')
      .then(r => r.json())
      .then(json => {
        setAssignments((json.assignments || []).map((a: any) => ({
          id: String(a.id),
          title: String(a.title || 'Untitled'),
          courseTitle: String(a.course_title || a.courseTitle || ''),
        })));
      })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await authFetch('/api/presentations');
      const json = await res.json();
      if (json.success) setPresentations(json.presentations);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }

  async function handleGenerated(data: any, opts: any) {
    setSaving(true);
    try {
      const slides: Slide[] = (data.slides || []).map((s: any, i: number) => ({
        order: i + 1, type: s.type || 'content',
        title: s.title || '', content: Array.isArray(s.content) ? s.content : [],
        notes: s.notes || '', emoji: s.emoji || '',
      }));
      const res = await authFetch('/api/presentations', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title || 'My Presentation',
          description: opts.description || null,
          theme: opts.theme,
          language: opts.language,
          education_level: opts.educationLevel,
          assignment_id: opts.assignmentId || null,
          slides,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPresentations(p => [json.presentation, ...p]);
      setShowGenerate(false);
      toast.success('Presentation created! 🎉');
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this presentation?')) return;
    try {
      const res = await authFetch(`/api/presentations/${id}`, { method: 'DELETE' });
      if (res.ok) { setPresentations(p => p.filter(x => x.id !== id)); toast.success('Deleted'); }
    } catch { toast.error('Delete failed'); }
  }

  function exportPDF(p: PresentationRecord) {
    const win = window.open('', '_blank');
    if (!win) return;
    const gradMap: Record<string, string> = {
      modern: '#4f46e5, #7c3aed', business: '#334155, #1e293b',
      education: '#10b981, #0d9488', minimal: '#9ca3af, #6b7280',
    };
    const grad = gradMap[p.theme] || gradMap.modern;
    const html = `<!DOCTYPE html><html><head><title>${p.title}</title>
    <style>* { margin:0;padding:0;box-sizing:border-box; } body { font-family:system-ui; }
    .slide { page-break-after:always; min-height:100vh; display:flex; flex-direction:column; justify-content:center; padding:60px 80px; background: linear-gradient(135deg, ${grad}); }
    h1 { font-size:3rem; font-weight:900; color:white; margin-bottom:2rem; } 
    ul { list-style:none; } li { color:rgba(255,255,255,.9); font-size:1.3rem; margin-bottom:1rem; padding-left:1.5rem; position:relative; }
    li::before { content:'●'; position:absolute; left:0; opacity:.6; } .emoji { font-size:4rem; margin-bottom:1.5rem; }
    </style></head><body>
    ${p.slides.map(s => `<div class="slide">${s.emoji ? `<div class="emoji">${s.emoji}</div>` : ''}<h1>${s.title}</h1>${s.content?.length ? `<ul>${s.content.map(c => `<li>${c}</li>`).join('')}</ul>` : ''}</div>`).join('')}
    <script>window.onload=()=>window.print();</script></body></html>`;
    win.document.write(html);
    win.document.close();
  }

  const assignmentMap = Object.fromEntries(assignments.map(a => [a.id, a]));

  return (
    <StudentLayout>
      {presenting && <SlidePresenter slides={presenting.slides} theme={presenting.theme} title={presenting.title} onClose={() => setPresenting(null)} />}
      {showGenerate && <GenerateModal onGenerated={handleGenerated} onClose={() => setShowGenerate(false)} />}

      <div className="space-y-6">
        {/* Header */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 shadow-2xl">
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                <Presentation className="w-3.5 h-3.5 text-indigo-300" />
                <span className="text-white/80 text-xs font-semibold">AI Presentations</span>
              </div>
              <h1 className="text-3xl font-black text-white">My Presentations</h1>
              <p className="text-slate-400 text-sm mt-1">
                {loading ? '...' : `${presentations.length} presentation${presentations.length !== 1 ? 's' : ''} created`}
              </p>
            </div>
            <button
              onClick={() => setShowGenerate(true)}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-indigo-900/40 disabled:opacity-60 shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {saving ? 'Saving...' : 'New with AI'}
            </button>
          </div>
        </div>

        {/* Hero Banner (shown only when empty) */}
        {!loading && presentations.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-3xl p-8 overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }} />
            <div className="relative flex flex-col sm:flex-row items-center gap-6">
              <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center shrink-0 backdrop-blur-sm">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Create Your First Presentation</h2>
                <p className="text-white/75 mb-4">Type a topic, link it to an assignment, and AI will generate a complete professional presentation with slides, content, and speaker notes.</p>
                <button onClick={() => setShowGenerate(true)}
                  className="px-6 py-3 bg-white text-indigo-700 rounded-xl font-bold text-sm inline-flex items-center gap-2 hover:bg-indigo-50 transition-colors">
                  <Wand2 className="w-4 h-4" /> Generate with AI
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-slate-100 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-36 bg-slate-200" /><div className="p-4 space-y-2"><div className="h-4 bg-slate-200 rounded w-3/4" /><div className="h-3 bg-slate-100 rounded w-1/2" /></div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        {!loading && presentations.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {presentations.map((p, idx) => {
              const colors = THEME_META[p.theme] || THEME_META.modern;
              const linkedAssignment = p.assignment_id ? assignmentMap[p.assignment_id] : null;
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg hover:border-slate-200 transition-all group">
                  <div className={`h-36 bg-gradient-to-br ${colors.bg} flex flex-col justify-between p-5 relative overflow-hidden`}>
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                    <div className="flex items-start justify-between relative">
                      <span className="text-3xl">{p.slides[0]?.emoji || '📊'}</span>
                      <span className="text-white/70 text-xs font-medium capitalize bg-black/20 px-2 py-0.5 rounded-full">{p.theme}</span>
                    </div>
                    <div className="relative">
                      <p className="text-white font-bold text-sm truncate">{p.title}</p>
                      <p className="text-white/60 text-xs">{p.slides.length} slides · {p.language}</p>
                    </div>
                  </div>
                  <div className="p-3">
                    {/* Description snippet */}
                    {p.description && (
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-2">{p.description}</p>
                    )}
                    {/* Linked assignment badge */}
                    {linkedAssignment ? (
                      <div className="flex items-center gap-1.5 mb-2">
                        <ClipboardList className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="text-xs text-indigo-600 font-semibold truncate">{linkedAssignment.title}</span>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs mb-2">{format(new Date(p.created_at), 'MMM d, yyyy')}</p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button onClick={() => setPresenting(p)}
                        className="col-span-2 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors">
                        <Monitor className="w-3.5 h-3.5" /> Present
                      </button>
                      <button onClick={() => exportPDF(p)}
                        className="flex items-center justify-center py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl transition-colors" title="Export PDF">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button onClick={() => handleDelete(p.id)}
                      className="w-full mt-1.5 py-1.5 text-slate-400 hover:text-red-500 text-xs transition-colors flex items-center justify-center gap-1">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
