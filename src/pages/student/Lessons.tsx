import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Search, Video, FileText, HelpCircle, Clock, Lock, Play, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';

const TYPE_CFG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  video: { label: 'Video', icon: Video, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  text:  { label: 'Text',  icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  quiz:  { label: 'Quiz',  icon: HelpCircle, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
};

const COURSE_GRADIENTS = [
  'from-indigo-500 to-violet-500', 'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',  'from-blue-500 to-cyan-500',
  'from-rose-500 to-pink-500',     'from-fuchsia-500 to-purple-500',
];

interface LessonItem {
  id: string;
  title: string;
  shortDescription: string;
  type: string;
  durationMinutes: number;
  order: number;
  status: string;
  isFreePreview: boolean;
  moduleTitle: string;
  courseTitle: string;
  courseGradient: string;
}

export default function StudentLessons() {
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const { data: courses } = await supabase.from('courses').select('id, title').contains('student_ids', [uid]);
      if (!courses?.length) { setLoading(false); return; }
      const courseIds = courses.map((c: any) => c.id);
      const courseMap: Record<string, { title: string; grad: string }> = {};
      courses.forEach((c: any, i: number) => { courseMap[c.id] = { title: c.title, grad: COURSE_GRADIENTS[i % COURSE_GRADIENTS.length] }; });

      const { data: modules } = await supabase.from('modules').select('id, title, course_id').in('course_id', courseIds);
      if (!modules?.length) { setLoading(false); return; }
      const moduleIds = modules.map((m: any) => m.id);
      const moduleMap: Record<string, { title: string; courseId: string }> = {};
      modules.forEach((m: any) => { moduleMap[m.id] = { title: m.title, courseId: m.course_id }; });

      const { data: lessonData } = await supabase
        .from('lessons').select('*').in('module_id', moduleIds).eq('status', 'published').order('order');

      const mapped: LessonItem[] = (lessonData || []).map((l: any) => {
        const mod = moduleMap[l.module_id] || { title: '', courseId: '' };
        const course = courseMap[mod.courseId] || { title: 'Course', grad: COURSE_GRADIENTS[0] };
        return {
          id: l.id,
          title: l.title,
          shortDescription: l.short_description || l.shortDescription || '',
          type: l.type || 'text',
          durationMinutes: l.duration_minutes ?? l.durationMinutes ?? 0,
          order: l.order ?? 0,
          status: l.status,
          isFreePreview: l.is_free_preview ?? l.isFreePreview ?? false,
          moduleTitle: mod.title,
          courseTitle: course.title,
          courseGradient: course.grad,
        };
      });

      setLessons(mapped);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = lessons;
    if (search) list = list.filter(l => l.title.toLowerCase().includes(search.toLowerCase()) || l.courseTitle.toLowerCase().includes(search.toLowerCase()));
    if (typeFilter !== 'all') list = list.filter(l => l.type === typeFilter);
    return list;
  }, [lessons, search, typeFilter]);

  const totalMinutes = lessons.reduce((s, l) => s + l.durationMinutes, 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-amber-600/25 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                <BookOpen className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-white/80 text-xs font-semibold">Lessons</span>
              </div>
              <h1 className="text-3xl font-black text-white">My Lessons</h1>
              <p className="text-slate-400 text-sm mt-1">
                {lessons.length} lessons · {hours > 0 ? `${hours}h ` : ''}{mins}m total content
              </p>
            </div>
            <div className="flex gap-3">
              {[
                { label: 'Total', value: lessons.length, color: 'from-amber-500 to-orange-500' },
                { label: 'Video', value: lessons.filter(l => l.type === 'video').length, color: 'from-blue-500 to-cyan-500' },
                { label: 'Text', value: lessons.filter(l => l.type === 'text').length, color: 'from-violet-500 to-purple-500' },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
                  className="bg-white/8 border border-white/10 rounded-2xl p-3 text-center min-w-[60px]">
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-slate-400 text-[10px] font-semibold">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lessons..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 shadow-sm" />
          </div>
          <div className="flex gap-2">
            {['all', 'video', 'text', 'quiz'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={cn('px-4 py-2.5 rounded-2xl text-sm font-semibold capitalize transition-all border',
                  typeFilter === t ? 'bg-amber-500 text-white border-transparent shadow-lg shadow-amber-200' : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300')}>
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
              <BookOpen className="w-8 h-8 text-amber-400" />
            </motion.div>
            <p className="text-slate-600 font-bold">No lessons found</p>
            <p className="text-slate-400 text-sm mt-1">Enroll in courses to access lessons.</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((lesson, i) => {
                const cfg = TYPE_CFG[lesson.type] || TYPE_CFG.text;
                const Icon = cfg.icon;
                return (
                  <motion.div key={lesson.id}
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-4 flex items-center gap-4 group cursor-pointer hover:border-slate-200">
                    <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', cfg.bg, cfg.border, 'border')}>
                      <Icon className={cn('w-4 h-4', cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{lesson.courseTitle} · {lesson.moduleTitle}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-amber-600 transition-colors">{lesson.title}</h3>
                      {lesson.shortDescription && <p className="text-xs text-slate-400 truncate mt-0.5">{lesson.shortDescription}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {lesson.durationMinutes > 0 && (
                        <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                          <Clock className="w-3.5 h-3.5" /> {lesson.durationMinutes}m
                        </span>
                      )}
                      <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg', cfg.bg, cfg.color)}>{cfg.label}</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
