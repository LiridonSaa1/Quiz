import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, BookOpen, Layers, Video, FileText, HelpCircle,
  Clock, ChevronRight, ChevronLeft, Edit2, Lock, Unlock, Plus, Search,
  X, Headphones, Play, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useTeacherPermissions } from '../../lib/teacherPermissions';

const ITEMS_PER_PAGE = 12;

const LESSON_TYPES = [
  { value: 'video', label: 'Video', icon: Video, color: 'text-blue-600', bg: 'bg-blue-50', accentGradient: 'linear-gradient(90deg,#3b82f6,#60a5fa)' },
  { value: 'text', label: 'Text', icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', accentGradient: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
  { value: 'quiz', label: 'Quiz', icon: HelpCircle, color: 'text-violet-600', bg: 'bg-violet-50', accentGradient: 'linear-gradient(90deg,#7c3aed,#a78bfa)' },
];
const getLessonType = (type: string) => LESSON_TYPES.find(t => t.value === type) || LESSON_TYPES[0];

const levelBadgeClass = (level?: string) => {
  if (!level) return 'bg-slate-100 text-slate-500';
  const l = level.toLowerCase();
  if (l.includes('begin') || l.includes('a1') || l.includes('a2')) return 'bg-emerald-100 text-emerald-700';
  if (l.includes('inter') || l.includes('b1') || l.includes('b2')) return 'bg-blue-100 text-blue-700';
  if (l.includes('advan') || l.includes('upper') || l.includes('c1') || l.includes('c2')) return 'bg-violet-100 text-violet-700';
  return 'bg-indigo-100 text-indigo-700';
};

function PaginationBar({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button onClick={() => onChange(Math.max(1, current - 1))} disabled={current === 1}
        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all">
        <ChevronLeft className="w-4 h-4" />
      </button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={cn('w-9 h-9 flex items-center justify-center rounded-xl text-sm font-semibold transition-all',
            current === p ? 'bg-indigo-600 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(Math.min(total, current + 1))} disabled={current === total}
        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

type ContentRow = {
  id: string;
  type: 'video' | 'audio' | 'pdf' | 'text' | 'link';
  title: string | null;
  signed_url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  duration_seconds?: number | null;
  position: number;
};

function MediaPreviewModal({ lesson, onClose }: { lesson: any; onClose: () => void }) {
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const fetchContents = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await authFetch(
          `/api/teacher/lessons/${encodeURIComponent(lesson.id)}/contents?userId=${encodeURIComponent(session.user.id)}`
        );
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        const rows: ContentRow[] = Array.isArray(json?.contents) ? json.contents : [];
        setContents(rows.filter(c => c.type === 'video' || c.type === 'audio'));
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    };
    void fetchContents();
  }, [lesson.id]);

  const videos = contents.filter(c => c.type === 'video');
  const audios = contents.filter(c => c.type === 'audio');

  const formatDuration = (secs?: number | null) => {
    if (!secs) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl flex flex-col"
          initial={{ scale: 0.94, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{lesson.title}</h2>
              {lesson.shortDescription && (
                <p className="text-sm text-slate-400 mt-0.5">{lesson.shortDescription}</p>
              )}
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0 ml-3">
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : contents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Play className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No video or audio content</p>
                <p className="text-xs text-slate-400 mt-1">This lesson has no media attached yet.</p>
              </div>
            ) : (
              <>
                {videos.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Video className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Video</span>
                    </div>
                    {videos.map((v) => (
                      <div key={v.id} className="rounded-xl overflow-hidden bg-black">
                        {v.signed_url || v.storage_path ? (
                          <video
                            ref={videoRef}
                            controls
                            className="w-full max-h-72 object-contain"
                            src={v.signed_url || v.storage_path || undefined}
                          >
                            Your browser does not support video playback.
                          </video>
                        ) : (
                          <div className="flex items-center justify-center h-36 text-slate-400 text-sm">
                            No video URL available
                          </div>
                        )}
                        {(v.title || v.duration_seconds) && (
                          <div className="bg-slate-50 px-3 py-2 flex items-center justify-between border-t border-slate-100">
                            {v.title && <span className="text-xs font-medium text-slate-600">{v.title}</span>}
                            {v.duration_seconds && (
                              <span className="text-xs text-slate-400">{formatDuration(v.duration_seconds)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {audios.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Headphones className="w-4 h-4 text-violet-500" />
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Audio</span>
                    </div>
                    {audios.map((a) => (
                      <div key={a.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        {a.title && (
                          <p className="text-sm font-semibold text-slate-700 mb-2">{a.title}</p>
                        )}
                        {a.signed_url || a.storage_path ? (
                          <audio
                            ref={audioRef}
                            controls
                            className="w-full"
                            src={a.signed_url || a.storage_path || undefined}
                          >
                            Your browser does not support audio playback.
                          </audio>
                        ) : (
                          <p className="text-xs text-slate-400">No audio URL available</p>
                        )}
                        {a.duration_seconds && (
                          <p className="text-xs text-slate-400 mt-1.5">{formatDuration(a.duration_seconds)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
            <Link
              to={`/teacher/lessons/${encodeURIComponent(lesson.id)}/content`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" /> Manage Content
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function TeacherModuleDetail() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { can } = useTeacherPermissions();

  const [moduleInfo, setModuleInfo] = useState<any>(null);
  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLesson, setSelectedLesson] = useState<any>(null);

  useEffect(() => { if (moduleId) fetchData(); }, [moduleId]);
  useEffect(() => { setCurrentPage(1); }, [search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let resolvedMod: any = null;
      const { data: mod, error: modErr } = await supabase
        .from('modules').select('*').eq('id', moduleId).maybeSingle();
      if (modErr && modErr.code !== 'PGRST116') throw modErr;
      if (mod) {
        resolvedMod = mod;
      } else {
        // Fallback: fetch via API (uses service role, bypasses RLS)
        const modRes = await authFetch(`/api/teacher/modules?userId=${encodeURIComponent(session.user.id)}`);
        if (modRes.ok) {
          const modJson = await modRes.json();
          resolvedMod = (modJson.modules || modJson.data || []).find((m: any) => m.id === moduleId) ?? null;
        }
        if (!resolvedMod) throw new Error('Module not found or access denied');
      }
      setModuleInfo(resolvedMod);

      if (resolvedMod?.course_id) {
        const { data: courseData } = await supabase
          .from('courses').select('id, title, level, language').eq('id', resolvedMod.course_id).maybeSingle();
        setCourse(courseData ?? null);
      }

      let lessonsData: any[] = [];
      const res = await authFetch(`/api/teacher/lessons?userId=${encodeURIComponent(session.user.id)}`);
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Array.isArray(json.lessons)) {
          lessonsData = json.lessons.filter((l: any) => String(l.module_id) === String(moduleId));
        }
      }
      if (lessonsData.length === 0) {
        const { data, error } = await supabase
          .from('lessons').select('*').eq('module_id', moduleId).order('order', { ascending: true });
        if (!error) lessonsData = data || [];
      }

      setLessons(lessonsData.map((l: any) => ({
        id: l.id,
        title: l.title,
        type: l.type || 'video',
        durationMinutes: l.duration_minutes || 0,
        order: l.order || 1,
        status: l.status || 'published',
        isFreePreview: l.is_free_preview || false,
        shortDescription: l.short_description || '',
      })));
    } catch (err: any) {
      toast.error(err.message || 'Failed to load module details');
    } finally {
      setLoading(false);
    }
  };

  const filtered = lessons.filter(l =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    (l.shortDescription || '').toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const courseTitle = course?.title || course?.name || '';
  const courseLevel = course?.level || '';
  const courseLanguage = course?.language || '';

  return (
    <TeacherLayout>
      <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7" style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}>

        {/* Hero */}
        <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)' }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />
          <div className="relative px-6 sm:px-8 lg:px-10 py-10">
            <nav className="flex items-center gap-1.5 text-xs font-semibold mb-4" aria-label="Breadcrumb">
              <button onClick={() => navigate('/teacher/modules')} className="text-indigo-400 hover:text-indigo-200 tracking-wider uppercase transition-colors">
                Modules
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
              <span className="text-indigo-200 tracking-wider uppercase truncate max-w-[200px]">
                {moduleInfo?.title || '...'}
              </span>
            </nav>
            <div className="flex items-start gap-4">
              <button onClick={() => navigate('/teacher/modules')}
                className="mt-1 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-all">
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                  {loading ? '...' : moduleInfo?.title}
                </h1>
                {(courseTitle || courseLevel || courseLanguage) && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {courseTitle && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200">
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        {courseTitle}
                      </span>
                    )}
                    {courseLevel && (
                      <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold', levelBadgeClass(courseLevel))}>
                        {courseLevel}
                      </span>
                    )}
                    {courseLanguage && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-indigo-200">
                        {courseLanguage}
                      </span>
                    )}
                  </div>
                )}
                {moduleInfo?.description && (
                  <p className="text-indigo-200 text-sm mt-1.5 max-w-lg">{moduleInfo.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 bg-white/10 px-3 py-1 rounded-full">
                    <Layers className="w-3.5 h-3.5" />
                    {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-indigo-300 font-medium">Order #{moduleInfo?.order}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 sm:px-8 lg:px-10 py-8 bg-slate-50 space-y-6">

          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input type="text" placeholder="Search lessons..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 shadow-sm placeholder-slate-400" />
            </div>
            <span className="text-sm text-slate-400 font-medium shrink-0">
              {filtered.length} lesson{filtered.length !== 1 ? 's' : ''}
            </span>
            {can('actions.teacher.lessons.manage') && (
              <Link to="/teacher/lessons"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white shrink-0 transition-all"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
                <Plus className="w-3.5 h-3.5" /> Add Lesson
              </Link>
            )}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array(8).fill(0).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-48 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm">
              <Layers className="w-14 h-14 text-indigo-200 mb-4" />
              <h3 className="text-lg font-bold text-slate-700 mb-1">{search ? 'No results found' : 'No lessons yet'}</h3>
              <p className="text-sm text-slate-400 text-center max-w-xs">
                {search ? 'Try a different search term.' : 'Add lessons to this module from the Lessons page.'}
              </p>
            </div>
          ) : (
            <>
              <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                initial="hidden" animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
                {paginated.map((lesson) => {
                  const lt = getLessonType(lesson.type);
                  const isPublished = lesson.status === 'published';
                  return (
                    <motion.div key={lesson.id}
                      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } } }}
                      whileHover={{ y: -4, boxShadow: '0 16px 40px rgba(99,102,241,0.13)' }}
                      className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-200 cursor-pointer"
                      onClick={() => setSelectedLesson(lesson)}>
                      <div className="h-1.5 w-full" style={{ background: lt.accentGradient }} />
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', lt.bg)}>
                            <lt.icon className={cn('w-5 h-5', lt.color)} />
                          </div>
                          <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full',
                            isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', isPublished ? 'bg-emerald-500' : 'bg-amber-500')} />
                            {isPublished ? 'Published' : 'Draft'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-5 h-5 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold shrink-0">
                            {lesson.order}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">{lesson.title}</h3>
                        </div>
                        {lesson.shortDescription && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-2">{lesson.shortDescription}</p>
                        )}
                        <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3.5 h-3.5 text-slate-300" />
                            {lesson.durationMinutes} min
                          </span>
                          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                            lesson.isFreePreview ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
                            {lesson.isFreePreview ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            {lesson.isFreePreview ? 'Free' : 'Locked'}
                          </span>
                        </div>
                        <div className="flex gap-2 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200">
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedLesson(lesson); }}
                            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all">
                            <Play className="w-3 h-3" /> Preview
                          </button>
                          {can('actions.teacher.lessons.manage') && (
                            <Link to="/teacher/lessons"
                              onClick={e => e.stopPropagation()}
                              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all">
                              <Edit2 className="w-3 h-3" /> Edit
                            </Link>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>

              <PaginationBar current={currentPage} total={totalPages} onChange={p => { setCurrentPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </>
          )}
        </div>
      </div>
      {selectedLesson && (
        <MediaPreviewModal lesson={selectedLesson} onClose={() => setSelectedLesson(null)} />
      )}
    </TeacherLayout>
  );
}
