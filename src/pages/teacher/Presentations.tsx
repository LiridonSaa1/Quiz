import React, { useEffect, useState, useRef } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { authFetch } from '../../lib/apiUrl';
import {
  Presentation, Plus, Trash2, Eye, Pencil, Sparkles, X, ChevronLeft, ChevronRight,
  Download, Copy, LayoutGrid, Globe, BookOpen, Loader2, Check, Save,
  Wand2, Monitor, GraduationCap, Briefcase, Layers,
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
  slides: Slide[];
  is_public: boolean;
  created_at: string;
}

const THEMES = [
  { value: 'modern',    label: 'Modern',    icon: Monitor,       gradient: 'from-indigo-600 to-violet-700',   desc: 'Clean & Bold' },
  { value: 'business',  label: 'Business',  icon: Briefcase,     gradient: 'from-slate-700 to-slate-900',     desc: 'Formal & Structured' },
  { value: 'education', label: 'Education', icon: GraduationCap, gradient: 'from-emerald-500 to-teal-600',    desc: 'Colorful & Engaging' },
  { value: 'minimal',   label: 'Minimal',   icon: Layers,        gradient: 'from-gray-400 to-gray-600',       desc: 'Simple & Elegant' },
];

const LANGUAGES = ['English', 'Albanian', 'German', 'French', 'Spanish', 'Italian', 'Portuguese'];
const LEVELS    = ['Elementary', 'Middle School', 'High School', 'University', 'Professional', 'General'];

const THEME_META: Record<string, { bg: string; text: string }> = {
  modern:    { bg: 'from-indigo-600 to-violet-700',   text: 'text-indigo-600' },
  business:  { bg: 'from-slate-700 to-slate-900',     text: 'text-slate-600' },
  education: { bg: 'from-emerald-500 to-teal-600',    text: 'text-emerald-600' },
  minimal:   { bg: 'from-gray-400 to-gray-600',       text: 'text-gray-600' },
};

/* ─── Slide Viewer / Presenter ─── */
function SlidePresenter({ slides, theme, title, onClose }: { slides: Slide[]; theme: string; title: string; onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const colors = THEME_META[theme] || THEME_META.modern;
  const slide = slides[current];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setCurrent(c => Math.min(slides.length - 1, c + 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setCurrent(c => Math.max(0, c - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slides.length, onClose]);

  if (!slide) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/40 border-b border-white/10">
        <span className="text-white/70 text-sm font-medium truncate">{title}</span>
        <div className="flex items-center gap-4">
          <span className="text-white/50 text-sm">{current + 1} / {slides.length}</span>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.25 }}
            className={`w-full max-w-4xl bg-gradient-to-br ${colors.bg} rounded-3xl p-12 min-h-[400px] flex flex-col justify-center shadow-2xl`}
          >
            {slide.emoji && <div className="text-6xl mb-6">{slide.emoji}</div>}
            <h2 className={cn(
              'font-black text-white leading-tight mb-8',
              slide.type === 'title' ? 'text-5xl' : 'text-3xl'
            )}>{slide.title}</h2>
            {slide.content?.length > 0 && (
              <ul className="space-y-4">
                {slide.content.map((pt, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="flex items-start gap-4 text-white/90 text-xl"
                  >
                    <span className="mt-2 w-2.5 h-2.5 rounded-full bg-white/60 shrink-0" />
                    {pt}
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Speaker notes */}
      {slide.notes && (
        <div className="px-6 py-3 bg-black/40 border-t border-white/10">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">Speaker Notes</p>
          <p className="text-white/70 text-sm">{slide.notes}</p>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-center gap-4 py-4 bg-black/40 border-t border-white/10">
        <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
          className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors disabled:opacity-30">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex gap-1.5 flex-wrap justify-center">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={cn('w-2 h-2 rounded-full transition-all', i === current ? 'bg-white w-6' : 'bg-white/30 hover:bg-white/60')}
            />
          ))}
        </div>
        <button onClick={() => setCurrent(c => Math.min(slides.length - 1, c + 1))} disabled={current === slides.length - 1}
          className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors disabled:opacity-30">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Slide Editor ─── */
function SlideEditor({ slides, theme, onSave, onClose }: {
  slides: Slide[]; theme: string; onSave: (slides: Slide[]) => void; onClose: () => void;
}) {
  const [localSlides, setLocalSlides] = useState<Slide[]>(slides.map(s => ({ ...s, content: [...s.content] })));
  const [active, setActive] = useState(0);
  const colors = THEME_META[theme] || THEME_META.modern;
  const slide = localSlides[active];

  function updateSlide(field: keyof Slide, value: any) {
    setLocalSlides(prev => prev.map((s, i) => i === active ? { ...s, [field]: value } : s));
  }
  function updateBullet(idx: number, value: string) {
    const content = [...(slide.content || [])];
    content[idx] = value;
    updateSlide('content', content);
  }
  function addBullet() { updateSlide('content', [...(slide.content || []), '']); }
  function removeBullet(idx: number) {
    updateSlide('content', (slide.content || []).filter((_: any, i: number) => i !== idx));
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex">
      {/* Slide list */}
      <div className="w-52 bg-slate-900 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10">
          <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Slides</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {localSlides.map((s, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={cn('w-full text-left px-3 py-2.5 rounded-xl transition-colors text-sm',
                i === active ? 'bg-white/15 text-white font-semibold' : 'text-white/50 hover:bg-white/10 hover:text-white'
              )}>
              <span className="text-white/30 text-xs mr-2">{i + 1}.</span>
              {s.title || 'Untitled'}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-white/10 space-y-2">
          <button onClick={() => onSave(localSlides)} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save
          </button>
          <button onClick={onClose} className="w-full py-2 text-white/40 hover:text-white text-sm transition-colors">Cancel</button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview */}
        <div className={`flex-1 bg-gradient-to-br ${colors.bg} flex flex-col justify-center p-12 relative min-h-0`}>
          <div className="absolute top-4 right-4 text-white/40 text-sm">{active + 1} / {localSlides.length}</div>
          {slide?.emoji && <div className="text-5xl mb-4">{slide.emoji}</div>}
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">{slide?.title || 'Slide Title'}</h2>
          {slide?.content?.length > 0 && (
            <ul className="space-y-2">
              {slide.content.map((pt, i) => (
                <li key={i} className="flex items-start gap-3 text-white/85 text-lg">
                  <span className="mt-2 w-2 h-2 rounded-full bg-white/60 shrink-0" /> {pt}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Edit panel */}
        <div className="h-64 bg-slate-900 border-t border-white/10 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-1 block">Emoji</label>
              <input value={slide?.emoji || ''} onChange={e => updateSlide('emoji', e.target.value)}
                className="w-full bg-white/10 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-1 block">Title</label>
              <input value={slide?.title || ''} onChange={e => updateSlide('title', e.target.value)}
                className="w-full bg-white/10 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-white/40 font-semibold uppercase tracking-wider">Bullet Points</label>
              <button onClick={addBullet} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">+ Add</button>
            </div>
            <div className="space-y-1.5">
              {(slide?.content || []).map((pt: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <input value={pt} onChange={e => updateBullet(i, e.target.value)}
                    className="flex-1 bg-white/10 border border-white/10 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500" />
                  <button onClick={() => removeBullet(i)} className="p-1.5 text-white/30 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-1 block">Speaker Notes</label>
            <textarea value={slide?.notes || ''} onChange={e => updateSlide('notes', e.target.value)} rows={2}
              className="w-full bg-white/10 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Generate Modal ─── */
function GenerateModal({ onGenerated, onClose }: {
  onGenerated: (data: any, opts: any) => void; onClose: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState(8);
  const [theme, setTheme] = useState('modern');
  const [language, setLanguage] = useState('English');
  const [level, setLevel] = useState('General');
  const [loading, setLoading] = useState(false);

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
      onGenerated(json.data, { theme, language, educationLevel: level });
    } catch (e: any) {
      toast.error(e.message || 'AI generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }} />
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <Wand2 className="w-10 h-10 text-white/90 mb-3" />
          <h2 className="text-2xl font-bold text-white">AI Presentation Generator</h2>
          <p className="text-white/70 text-sm mt-1">Describe your topic and AI will build the full presentation</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Topic */}
          <div>
            <label className="block text-sm font-semibold text-white/80 mb-2">Presentation Topic *</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Climate Change and Renewable Energy"
              className="w-full bg-white/10 border border-white/15 text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Theme */}
          <div>
            <label className="block text-sm font-semibold text-white/80 mb-2">Presentation Style</label>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map(t => (
                <button key={t.value} onClick={() => setTheme(t.value)}
                  className={cn('flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                    theme === t.value ? 'border-indigo-500 bg-indigo-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'
                  )}>
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${t.gradient} flex items-center justify-center`}>
                    <t.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-semibold">{t.label}</div>
                    <div className="text-white/40 text-xs">{t.desc}</div>
                  </div>
                  {theme === t.value && <Check className="w-4 h-4 text-indigo-400 ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Row: slides, language, level */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1.5">Slides</label>
              <select value={slideCount} onChange={e => setSlideCount(Number(e.target.value))}
                className="w-full bg-white/10 border border-white/15 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                {[5, 6, 7, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n} slides</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1.5">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full bg-white/10 border border-white/15 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1.5">Level</label>
              <select value={level} onChange={e => setLevel(e.target.value)}
                className="w-full bg-white/10 border border-white/15 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating with AI...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Presentation</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function TeacherPresentations() {
  const [presentations, setPresentations] = useState<PresentationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [presenting, setPresenting] = useState<PresentationRecord | null>(null);
  const [editing, setEditing] = useState<PresentationRecord | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

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
    setSaving('new');
    try {
      const slides: Slide[] = (data.slides || []).map((s: any, i: number) => ({
        order: i + 1, type: s.type || 'content',
        title: s.title || '', content: Array.isArray(s.content) ? s.content : [],
        notes: s.notes || '', emoji: s.emoji || '',
      }));
      const res = await authFetch('/api/presentations', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title || 'New Presentation',
          theme: opts.theme,
          language: opts.language,
          education_level: opts.educationLevel,
          slides,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPresentations(p => [json.presentation, ...p]);
      setShowGenerate(false);
      toast.success('Presentation created!', { icon: '🎉' });
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveEdit(slides: Slide[]) {
    if (!editing) return;
    setSaving(editing.id);
    try {
      const res = await authFetch(`/api/presentations/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editing, slides }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPresentations(p => p.map(x => x.id === editing.id ? json.presentation : x));
      setEditing(null);
      toast.success('Saved!');
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this presentation?')) return;
    try {
      const res = await authFetch(`/api/presentations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPresentations(p => p.filter(x => x.id !== id));
        toast.success('Deleted');
      }
    } catch { toast.error('Delete failed'); }
  }

  async function handleDuplicate(p: PresentationRecord) {
    try {
      const res = await authFetch('/api/presentations', {
        method: 'POST',
        body: JSON.stringify({ ...p, title: `${p.title} (Copy)` }),
      });
      const json = await res.json();
      if (json.success) {
        setPresentations(prev => [json.presentation, ...prev]);
        toast.success('Duplicated!');
      }
    } catch { toast.error('Duplicate failed'); }
  }

  function exportPDF(p: PresentationRecord) {
    const win = window.open('', '_blank');
    if (!win) return;
    const colors = THEME_META[p.theme] || THEME_META.modern;
    const html = `<!DOCTYPE html><html><head><title>${p.title}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: system-ui, sans-serif; background: #0f172a; }
      .slide { page-break-after: always; min-height: 100vh; display:flex; flex-direction:column; justify-content:center; padding: 60px 80px; }
      h1 { font-size: 3rem; font-weight: 900; color: white; margin-bottom: 2rem; line-height: 1.1; }
      ul { list-style:none; }
      li { color: rgba(255,255,255,0.9); font-size: 1.3rem; margin-bottom: 1rem; padding-left: 1.5rem; position: relative; }
      li::before { content: '●'; position: absolute; left: 0; opacity: 0.6; }
      .emoji { font-size: 4rem; margin-bottom: 1.5rem; }
      .notes { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.5); font-size: 0.85rem; font-style: italic; }
      @media print { .slide { page-break-after: always; } }
    </style></head><body>
    ${p.slides.map(s => `
      <div class="slide" style="background: linear-gradient(135deg, ${p.theme === 'modern' ? '#4f46e5, #7c3aed' : p.theme === 'business' ? '#334155, #1e293b' : p.theme === 'education' ? '#10b981, #0d9488' : '#9ca3af, #6b7280'})">
        ${s.emoji ? `<div class="emoji">${s.emoji}</div>` : ''}
        <h1>${s.title}</h1>
        ${s.content?.length ? `<ul>${s.content.map(c => `<li>${c}</li>`).join('')}</ul>` : ''}
        ${s.notes ? `<div class="notes">Notes: ${s.notes}</div>` : ''}
      </div>
    `).join('')}
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;
    win.document.write(html);
    win.document.close();
  }

  return (
    <TeacherLayout>
      {presenting && <SlidePresenter slides={presenting.slides} theme={presenting.theme} title={presenting.title} onClose={() => setPresenting(null)} />}
      {editing && <SlideEditor slides={editing.slides} theme={editing.theme} onSave={handleSaveEdit} onClose={() => setEditing(null)} />}
      {showGenerate && <GenerateModal onGenerated={handleGenerated} onClose={() => setShowGenerate(false)} />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Presentation className="w-7 h-7 text-violet-400" />
              My Presentations
            </h1>
            <p className="text-slate-400 text-sm mt-1">{presentations.length} presentation{presentations.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-900/30"
          >
            <Wand2 className="w-4 h-4" />
            Create with AI
          </button>
        </div>

        {/* Empty state */}
        {!loading && presentations.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-24 bg-white/5 border border-white/10 rounded-3xl"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-indigo-900/40">
              <Wand2 className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No presentations yet</h3>
            <p className="text-slate-400 mb-6">Use AI to generate your first professional presentation in seconds</p>
            <button onClick={() => setShowGenerate(true)}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-semibold text-sm inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Generate with AI
            </button>
          </motion.div>
        )}

        {/* Skeleton loader */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden animate-pulse">
                <div className="h-32 bg-white/10" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-3/4" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        {!loading && presentations.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {presentations.map((p, idx) => {
              const colors = THEME_META[p.theme] || THEME_META.modern;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/25 hover:shadow-xl hover:shadow-black/30 transition-all group"
                >
                  {/* Thumbnail */}
                  <div className={`h-32 bg-gradient-to-br ${colors.bg} flex flex-col justify-between p-5 relative overflow-hidden`}>
                    <div className="absolute inset-0 opacity-10" style={{
                      backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                      backgroundSize: '20px 20px',
                    }} />
                    <div className="flex items-start justify-between relative">
                      <span className="text-3xl">{p.slides[0]?.emoji || '📊'}</span>
                      <span className="text-white/60 text-xs font-medium bg-black/20 px-2 py-0.5 rounded-full capitalize">{p.theme}</span>
                    </div>
                    <div className="relative">
                      <p className="text-white font-bold text-sm leading-tight truncate">{p.title}</p>
                      <p className="text-white/50 text-xs mt-0.5">{p.slides.length} slides · {p.language}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-3">
                    <p className="text-slate-400 text-xs mb-3">{format(new Date(p.created_at), 'MMM d, yyyy')}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      <button onClick={() => setPresenting(p)}
                        className="col-span-2 flex items-center justify-center gap-1.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-indigo-200 rounded-xl text-xs font-semibold transition-colors">
                        <Monitor className="w-3.5 h-3.5" /> Present
                      </button>
                      <button onClick={() => setEditing(p)}
                        className="flex items-center justify-center py-2 bg-white/5 hover:bg-white/15 text-white/60 hover:text-white rounded-xl transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(p.id)}
                        className="flex items-center justify-center py-2 bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 rounded-xl transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <button onClick={() => handleDuplicate(p)}
                        className="flex items-center justify-center gap-1 py-1.5 text-white/40 hover:text-white/70 text-xs transition-colors">
                        <Copy className="w-3 h-3" /> Duplicate
                      </button>
                      <button onClick={() => exportPDF(p)}
                        className="flex items-center justify-center gap-1 py-1.5 text-white/40 hover:text-white/70 text-xs transition-colors">
                        <Download className="w-3 h-3" /> Export PDF
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
