import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, Search, Calendar, BookOpen, AlertCircle, CheckCircle2, Archive, FileText, ArrowRight, Play } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isPast, isToday } from 'date-fns';
import { authFetch } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { Link } from 'react-router-dom';

type AssignmentStatus = 'draft' | 'published' | 'closed';
type AssignmentType = 'homework' | 'project' | 'essay' | 'quiz' | 'lab' | 'other';

const TYPE_CFG: Record<AssignmentType, { label: string; color: string; bg: string }> = {
  homework: { label: 'Homework', color: 'text-blue-700',   bg: 'bg-blue-50'   },
  project:  { label: 'Project',  color: 'text-violet-700', bg: 'bg-violet-50' },
  essay:    { label: 'Essay',    color: 'text-rose-700',   bg: 'bg-rose-50'   },
  quiz:     { label: 'Quiz',     color: 'text-amber-700',  bg: 'bg-amber-50'  },
  lab:      { label: 'Lab',      color: 'text-teal-700',   bg: 'bg-teal-50'   },
  other:    { label: 'Other',    color: 'text-slate-600',  bg: 'bg-slate-100' },
};

const STATUS_CFG: Record<AssignmentStatus, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',  text: 'text-slate-600',   icon: FileText     },
  published: { label: 'Published', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 },
  closed:    { label: 'Closed',    bg: 'bg-amber-50',   text: 'text-amber-700',   icon: Archive      },
};

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  type: AssignmentType;
  due_date: string | null;
  max_score: number;
  status: AssignmentStatus;
  created_at: string;
  courseTitle: string;
}

export default function StudentAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AssignmentStatus>('all');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const uid = session.user.id;

      const profileSnap = await supabase
        .from('profiles')
        .select('teacher_id')
        .eq('id', uid)
        .single();
      const linkedTeacherId = String(profileSnap.data?.teacher_id || '').trim();
      if (!linkedTeacherId) { setLoading(false); return; }

      const teacherIdCandidates = await resolveTeacherIdCandidates(linkedTeacherId);
      const scopedTeacherIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [linkedTeacherId];

      const coursesRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(linkedTeacherId)}`);
      const coursesJson = coursesRes.ok ? await coursesRes.json() : { courses: [] };
      const courses = Array.isArray(coursesJson?.courses)
        ? coursesJson.courses
            .filter((c: any) => {
              const isPublished = String(c?.status || '').toLowerCase() === 'published';
              const isTeacherScoped = scopedTeacherIds.includes(String(c?.teacher_id || ''));
              const studentIds = Array.isArray(c?.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [];
              const isEnrolled = studentIds.includes(uid);
              return isPublished && isTeacherScoped && isEnrolled;
            })
            .map((c: any) => ({ id: c.id, title: c.title || 'Course' }))
        : [];
      if (!courses.length) { setLoading(false); return; }
      const courseIds = courses.map((c: any) => c.id);
      const courseMap: Record<string, string> = {};
      courses.forEach((c: any) => { courseMap[c.id] = c.title; });

      const { data } = await supabase
        .from('assignments').select('*').in('course_id', courseIds).eq('status', 'published')
        .order('due_date', { ascending: true });

      setAssignments((data || []).map((a: any) => ({
        ...a, courseTitle: courseMap[a.course_id] || 'Course',
      })));
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = assignments;
    if (search) list = list.filter(a => a.title.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter);
    return list;
  }, [assignments, search, statusFilter]);

  const overdue = assignments.filter(a => a.due_date && isPast(new Date(a.due_date)) && a.status !== 'closed').length;
  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/25 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
              <ClipboardList className="w-3.5 h-3.5 text-teal-300" />
              <span className="text-white/80 text-xs font-semibold">Assignments</span>
            </div>
            <h1 className="text-3xl font-black text-white">My Assignments</h1>
            <p className="text-slate-400 text-sm mt-1">{assignments.length} assignments · {overdue > 0 ? `${overdue} overdue` : 'All on track!'}</p>
            {overdue > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 bg-rose-500/20 border border-rose-400/30 rounded-xl px-3 py-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300 text-xs font-semibold">{overdue} assignment{overdue > 1 ? 's' : ''} overdue</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assignments..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 shadow-sm" />
          </div>
          <div className="flex gap-2">
            {(['all', 'published', 'closed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-4 py-2.5 rounded-2xl text-sm font-semibold capitalize transition-all border',
                  statusFilter === s ? 'bg-teal-600 text-white border-transparent shadow-lg shadow-teal-200' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300')}>
                {s === 'all' ? 'All' : s === 'published' ? 'Active' : 'Closed'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-teal-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
              <ClipboardList className="w-8 h-8 text-teal-400" />
            </motion.div>
            <p className="text-slate-600 font-bold">No assignments found</p>
            <p className="text-slate-400 text-sm mt-1">
              {hasActiveFilters ? 'No results for current filter.' : 'No enrolled content yet.'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((a, i) => {
                const typeCfg = TYPE_CFG[a.type] || TYPE_CFG.other;
                const statusCfg = STATUS_CFG[a.status];
                const StatusIcon = statusCfg.icon;
                const isOverdue = a.due_date && isPast(new Date(a.due_date)) && a.status !== 'closed';
                const dueToday = a.due_date && isToday(new Date(a.due_date));
                const dueStateLabel = isOverdue ? 'Overdue' : dueToday ? 'Due today' : a.status === 'closed' ? 'Closed' : 'Open';
                return (
                  <motion.div key={a.id}
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className={cn('bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-4 group',
                      isOverdue ? 'border-rose-200' : 'border-slate-100')}>
                    <div className="flex items-start gap-4">
                      <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5', typeCfg.bg)}>
                        <ClipboardList className={cn('w-4 h-4', typeCfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg', typeCfg.bg, typeCfg.color)}>{typeCfg.label}</span>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1', statusCfg.bg, statusCfg.text)}>
                            <StatusIcon className="w-3 h-3" /> {statusCfg.label}
                          </span>
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-lg',
                            isOverdue
                              ? 'bg-rose-50 text-rose-600'
                              : dueToday
                                ? 'bg-amber-50 text-amber-600'
                                : a.status === 'closed'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-blue-50 text-blue-700'
                          )}>
                            {dueStateLabel}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-600 transition-colors">{a.title}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                          <span className="flex items-center gap-1 text-xs text-slate-400"><BookOpen className="w-3 h-3" /> {a.courseTitle}</span>
                          {a.due_date && (
                            <span className={cn('flex items-center gap-1 text-xs font-medium', isOverdue ? 'text-rose-500' : 'text-slate-400')}>
                              <Calendar className="w-3 h-3" /> Due {format(new Date(a.due_date), 'MMM d, yyyy')}
                            </span>
                          )}
                          <span className="text-xs text-slate-400 font-medium">Max: {a.max_score} pts</span>
                        </div>
                        {a.description && <p className="text-xs text-slate-400 mt-1.5 line-clamp-1">{a.description}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            to={`/student/assignments/${a.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-all"
                          >
                            <Play className="w-3.5 h-3.5" />
                            View Details
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          <Link
                            to="/student/courses"
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-all"
                          >
                            Open Course
                          </Link>
                        </div>
                      </div>
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
