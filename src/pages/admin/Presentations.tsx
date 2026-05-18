import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { authFetch } from '../../lib/apiUrl';
import {
  Presentation, Search, Trash2, Eye, Calendar, User,
  Palette, Globe, BookOpen, LayoutGrid, List, ChevronRight, X,
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
  user_id: string;
  title: string;
  description?: string;
  theme: string;
  language: string;
  education_level?: string;
  slides: Slide[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

const THEME_COLORS: Record<string, { bg: string; accent: string; text: string; badge: string }> = {
  modern:    { bg: 'from-indigo-600 to-violet-700',   accent: '#6366f1', text: 'text-indigo-700',  badge: 'bg-indigo-100 text-indigo-700' },
  business:  { bg: 'from-slate-700 to-slate-900',     accent: '#475569', text: 'text-slate-700',   badge: 'bg-slate-100 text-slate-700' },
  education: { bg: 'from-emerald-500 to-teal-600',    accent: '#059669', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  minimal:   { bg: 'from-gray-400 to-gray-600',       accent: '#6b7280', text: 'text-gray-700',    badge: 'bg-gray-100 text-gray-700' },
};

function SlideViewer({ slides, theme, onClose }: { slides: Slide[]; theme: string; onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const colors = THEME_COLORS[theme] || THEME_COLORS.modern;
  const slide = slides[current];
  if (!slide) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white/60 text-sm">{current + 1} / {slides.length}</span>
          <button onClick={onClose} className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-gradient-to-br ${colors.bg} rounded-2xl p-10 min-h-[420px] flex flex-col justify-center shadow-2xl`}
        >
          {slide.emoji && <div className="text-5xl mb-4">{slide.emoji}</div>}
          <h2 className="text-3xl font-bold text-white mb-6 leading-tight">{slide.title}</h2>
          {slide.content?.length > 0 && (
            <ul className="space-y-3">
              {slide.content.map((point, i) => (
                <li key={i} className="flex items-start gap-3 text-white/90 text-lg">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-white/60 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          )}
          {slide.notes && (
            <div className="mt-8 pt-6 border-t border-white/20 max-h-40 overflow-y-auto">
              <p className="text-white/60 text-sm font-medium mb-2">Speaker Notes</p>
              <p className="text-white/80 text-sm leading-relaxed italic">{slide.notes}</p>
            </div>
          )}
        </motion.div>
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setCurrent(Math.max(0, current - 1))}
            disabled={current === 0}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors disabled:opacity-30 font-medium"
          >
            ← Previous
          </button>
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn('w-2 h-2 rounded-full transition-all', i === current ? 'bg-white w-6' : 'bg-white/30')}
              />
            ))}
          </div>
          <button
            onClick={() => setCurrent(Math.min(slides.length - 1, current + 1))}
            disabled={current === slides.length - 1}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors disabled:opacity-30 font-medium"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPresentations() {
  const [presentations, setPresentations] = useState<PresentationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [viewing, setViewing] = useState<PresentationRecord | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { loadPresentations(); }, []);

  async function loadPresentations() {
    setLoading(true);
    try {
      const res = await authFetch('/api/presentations');
      const json = await res.json();
      if (json.success) setPresentations(json.presentations);
    } catch { toast.error('Failed to load presentations'); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this presentation permanently?')) return;
    setDeleting(id);
    try {
      const res = await authFetch(`/api/presentations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPresentations(p => p.filter(x => x.id !== id));
        toast.success('Presentation deleted');
      } else toast.error('Delete failed');
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  }

  const filtered = presentations.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.theme.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      {viewing && (
        <SlideViewer slides={viewing.slides} theme={viewing.theme} onClose={() => setViewing(null)} />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Presentation className="w-7 h-7 text-indigo-600" />
              AI Presentations
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {presentations.length} presentation{presentations.length !== 1 ? 's' : ''} across all users
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('grid')} className={cn('p-2 rounded-lg transition-colors', viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={cn('p-2 rounded-lg transition-colors', viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200')}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search presentations..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: presentations.length, icon: Presentation, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Modern', value: presentations.filter(p => p.theme === 'modern').length, icon: Palette, color: 'text-violet-600 bg-violet-50' },
            { label: 'Education', value: presentations.filter(p => p.theme === 'education').length, icon: BookOpen, color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Public', value: presentations.filter(p => p.is_public).length, icon: Globe, color: 'text-blue-600 bg-blue-50' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-800">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className={cn(viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3')}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
                <div className="h-28 bg-slate-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <Presentation className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No presentations found</p>
            <p className="text-slate-400 text-sm mt-1">Teachers and students can create presentations using AI</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p, idx) => {
              const colors = THEME_COLORS[p.theme] || THEME_COLORS.modern;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-all group"
                >
                  <div className={`h-28 bg-gradient-to-br ${colors.bg} flex items-center justify-center relative`}>
                    <div className="text-4xl">{p.slides[0]?.emoji || '📊'}</div>
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      <span className="px-2 py-0.5 bg-white/20 text-white text-xs rounded-full font-medium capitalize">{p.theme}</span>
                      {p.is_public && <span className="px-2 py-0.5 bg-white/20 text-white text-xs rounded-full font-medium">Public</span>}
                    </div>
                    <div className="absolute bottom-3 right-3 text-white/70 text-xs">{p.slides.length} slides</div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-slate-800 text-sm truncate mb-1">{p.title}</h3>
                    {p.description && <p className="text-slate-500 text-xs truncate mb-3">{p.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(p.created_at), 'MMM d, yyyy')}</span>
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{p.language}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewing(p)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deleting === p.id}
                        className="p-1.5 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p, idx) => {
              const colors = THEME_COLORS[p.theme] || THEME_COLORS.modern;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-4 hover:shadow-md transition-all"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-xl shrink-0`}>
                    {p.slides[0]?.emoji || '📊'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 text-sm truncate">{p.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="capitalize">{p.theme}</span>
                      <span>{p.slides.length} slides</span>
                      <span>{p.language}</span>
                      <span>{format(new Date(p.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setViewing(p)} className="p-2 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 rounded-lg transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="p-2 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
