import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { sendNotification } from '../../lib/utils';
import {
  Plus, Search, FileText, Trash2, Edit2,
  Clock, BookOpen, AlertTriangle,
  HelpCircle, Shuffle, RotateCcw, Target,
  ChevronRight, X, PlayCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Quiz } from '../../types';
import { cn } from '../../lib/utils';
import { apiUrl, authFetch, readApiError } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { fetchTeacherQuizzesFromSupabase, missingQuizzesPublishedColumn } from '../../lib/fetchTeacherQuizzes';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useTeacherPermissions } from '../../lib/teacherPermissions';

function AnimatedCount({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
}

function EmptyIllustration() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="75" width="100" height="35" rx="8" fill="#e0e7ff" />
      <rect x="30" y="55" width="80" height="30" rx="8" fill="#c7d2fe" />
      <rect x="40" y="35" width="60" height="30" rx="8" fill="#a5b4fc" />
      <rect x="50" y="15" width="40" height="30" rx="8" fill="#818cf8" />
      <circle cx="70" cy="30" r="8" fill="#6366f1" />
      <path d="M66 30 L70 25 L74 30" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 25 L70 35" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <rect x="58" y="60" width="24" height="3" rx="1.5" fill="#818cf8" opacity="0.5" />
      <rect x="54" y="80" width="32" height="3" rx="1.5" fill="#c7d2fe" opacity="0.5" />
    </svg>
  );
}

interface QuizWithCount extends Quiz {
  questionCount: number;
  courseName: string;
}

const STAT_CONFIG = [
  { label: 'Total Quizzes', gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', shadow: 'shadow-indigo-500/25', icon: FileText },
  { label: 'Published', gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20', shadow: 'shadow-emerald-500/25', icon: PlayCircle },
  { label: 'Drafts', gradient: 'from-amber-500 to-amber-600', iconBg: 'bg-white/20', shadow: 'shadow-amber-500/25', icon: X },
  { label: 'Total Questions', gradient: 'from-violet-500 to-violet-600', iconBg: 'bg-white/20', shadow: 'shadow-violet-500/25', icon: HelpCircle },
];

export default function QuizManagement() {
  const [quizzes, setQuizzes] = useState<QuizWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseOptions, setCourseOptions] = useState<{ id: string; name: string }[]>([]);
  const [classOptions, setClassOptions] = useState<Array<{ id: string; name: string; course_id: string | null }>>([]);
  const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { can } = useTeacherPermissions();
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      let courseRows: { id: string; title: string | null }[] | null = null;
      let classRows: Array<{ id: string; name: string; course_id: string | null }> = [];
      const backendRes = await authFetch(
        `/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`
      );
      if (backendRes.ok) {
        const backendJson = await backendRes.json();
        if (backendJson?.success && Array.isArray(backendJson.courses)) {
          courseRows = backendJson.courses.map((c: { id: string; title?: string | null }) => ({
            id: c.id,
            title: c.title ?? null,
          }));
        }
      }
      if (courseRows === null) {
        const scopedIds = await resolveTeacherIdCandidates(session.user.id);
        const { data: coursesData, error: coursesErr } = await supabase
          .from('courses')
          .select('id, title')
          .in('teacher_id', scopedIds);
        if (coursesErr && coursesErr.code !== 'PGRST116') {
          courseRows = [];
        } else {
          courseRows = coursesData ?? [];
        }
      }

      const classesRes = await fetch(apiUrl(`/api/teacher/classes?userId=${encodeURIComponent(session.user.id)}`));
      if (classesRes.ok) {
        const classesJson = await classesRes.json();
        if (classesJson?.success && Array.isArray(classesJson.classes)) {
          classRows = classesJson.classes.map((c: any) => ({
            id: String(c.id),
            name: String(c.name || 'Untitled class'),
            course_id: c.course_id ? String(c.course_id) : null,
          }));
        }
      }

      let quizRows: Record<string, unknown>[] | null = null;
      const quizzesRes = await authFetch(
        `/api/teacher/quizzes?userId=${encodeURIComponent(session.user.id)}`
      );
      if (quizzesRes.ok) {
        try {
          const quizzesJson = await quizzesRes.json();
          if (quizzesJson?.success && Array.isArray(quizzesJson.quizzes)) {
            quizRows = quizzesJson.quizzes as Record<string, unknown>[];
          }
        } catch {
          /* invalid JSON — fall through to Supabase */
        }
      }
      if (quizRows === null) {
        const scopedIds = await resolveTeacherIdCandidates(session.user.id);
        quizRows = await fetchTeacherQuizzesFromSupabase(supabase, scopedIds, session.user.id);
      }
      const nonExamQuizRows = (quizRows || []).filter((d: Record<string, any>) => String(d?.type || 'standard') !== 'exam');

      const courseMap: Record<string, string> = {};
      const options: { id: string; name: string }[] = [];
      (courseRows || []).forEach(c => {
        courseMap[c.id] = c.title || 'Untitled';
        options.push({ id: c.id, name: c.title || 'Untitled' });
      });
      setCourseOptions(options);
      setClassOptions(classRows.filter((c) => !!c.course_id && options.some((o) => o.id === c.course_id)));

      const questionCountMap: Record<string, number> = {};
      const countRes = await authFetch(
        `/api/teacher/quizzes/question-counts?userId=${encodeURIComponent(session.user.id)}`
      );
      if (countRes.ok) {
        const countJson = await countRes.json();
        if (countJson?.success && countJson.counts && typeof countJson.counts === 'object') {
          Object.entries(countJson.counts as Record<string, unknown>).forEach(([quizId, count]) => {
            const n = Number(count);
            questionCountMap[quizId] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
          });
        }
      } else {
        // Fallback for older API: may still be limited by RLS in some environments.
        const qCount = await supabase.from('questions').select('quiz_id');
        if (!qCount.error) {
          (qCount.data ?? []).forEach((q: { quiz_id: string }) => {
            if (!q?.quiz_id) return;
            questionCountMap[q.quiz_id] = (questionCountMap[q.quiz_id] || 0) + 1;
          });
        }
      }

      setQuizzes(nonExamQuizRows.map((d: Record<string, any>) => ({
        id: d.id,
        courseId: d.course_id,
        teacherId: d.teacher_id,
        title: d.title,
        description: d.description,
        type: d.type || 'standard',
        timeLimit: d.time_limit,
        totalMarks: d.total_marks,
        passMark: d.pass_mark,
        maxAttempts: d.max_attempts,
        status: d.status,
        settings: d.settings,
        published:
          typeof d.published === 'boolean'
            ? d.published
            : d.status === 'published' || String(d.status || '').toLowerCase() === 'active',
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        questionCount: questionCountMap[d.id] || 0,
        courseName: courseMap[d.course_id] || 'Unknown Course',
      })));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load quizzes';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const requestDelete = (quiz: QuizWithCount) => {
    setQuizToDelete({ id: quiz.id, title: quiz.title });
  };

  const confirmDelete = async () => {
    if (!quizToDelete) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/teacher/quizzes/${encodeURIComponent(quizToDelete.id)}/delete`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readApiError(res));
      toast.success('Quiz deleted');
      setQuizToDelete(null);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete quiz';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const togglePublish = async (quiz: QuizWithCount) => {
    try {
      const nextPub = !quiz.published;
      let { error } = await supabase
        .from('quizzes')
        .update({ published: nextPub })
        .eq('id', quiz.id);
      if (error && missingQuizzesPublishedColumn(error)) {
        ({ error } = await supabase
          .from('quizzes')
          .update({ status: nextPub ? 'published' : 'draft' })
          .eq('id', quiz.id));
      }
      if (error) throw error;

      if (!quiz.published) {
        try {
          const { data: course } = await supabase
            .from('courses').select('student_ids').eq('id', quiz.courseId).single();
          if (course?.student_ids) {
            course.student_ids.forEach((sid: string) =>
              sendNotification(sid, 'New Quiz Available', `"${quiz.title}" is now available in your course.`, 'info')
            );
          }
        } catch { /* ignore */ }
      }
      toast.success(`Quiz ${!quiz.published ? 'published' : 'unpublished'}`);
      fetchData();
    } catch { toast.error('Failed to update status'); }
  };

  const filtered = quizzes.filter(q => {
    const matchSearch = q.title.toLowerCase().includes(search.toLowerCase()) ||
      (q.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || q.courseId === courseFilter;
    const selectedClass = classOptions.find((c) => c.id === classFilter);
    const matchClass = classFilter === 'all' || (selectedClass?.course_id ? q.courseId === selectedClass.course_id : false);
    const matchStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'published' ? q.published : !q.published;
    return matchSearch && matchCourse && matchClass && matchStatus;
  });

  const totalQuestions = quizzes.reduce((a, q) => a + q.questionCount, 0);

  const stats = [
    { ...STAT_CONFIG[0], value: quizzes.length },
    { ...STAT_CONFIG[1], value: quizzes.filter(q => q.published).length },
    { ...STAT_CONFIG[2], value: quizzes.filter(q => !q.published).length },
    { ...STAT_CONFIG[3], value: totalQuestions },
  ];

  const hasActiveFilters = search || courseFilter !== 'all' || classFilter !== 'all' || statusFilter !== 'all';

  const passLabel = (q: QuizWithCount) => {
    const s = q.settings?.passingScore;
    if (typeof s === 'number') return `${s}%`;
    if (q.passMark != null && q.passMark > 0) return `${q.passMark}%`;
    return '—';
  };

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />
          <div className="pointer-events-none absolute top-96 left-1/2 w-72 h-72 rounded-full bg-indigo-100/20 blur-3xl" />

          <div
            className="relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)',
            }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />

            <div className="relative px-6 sm:px-8 lg:px-10 py-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                    <span className="text-indigo-400 tracking-wider uppercase">Teacher Portal</span>
                    <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                    <span className="text-indigo-200 tracking-wider uppercase">Quizzes</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Quizzes
                  </h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    Build and manage quizzes to assess your students.
                  </p>
                </div>
                <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                  {can('actions.teacher.quizzes.create') && <Link
                    to="/teacher/quizzes/new"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
                      boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Create Quiz
                  </Link>}
                </motion.div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
            {!loading && courseOptions.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3"
              >
                <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">No courses found</p>
                  <p className="text-xs text-amber-600 mt-0.5">Create a course first; quizzes are attached to a course.</p>
                </div>
              </motion.div>
            )}

            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08 } },
              }}
            >
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
                    }}
                    className={cn(
                      'relative overflow-hidden rounded-2xl p-5 text-white shadow-lg',
                      `bg-gradient-to-br ${stat.gradient}`,
                      stat.shadow
                    )}
                    style={{ boxShadow: `0 8px 24px var(--tw-shadow-color, rgba(0,0,0,0.12))` }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-3xl font-extrabold tracking-tight"><AnimatedCount value={stat.value} /></div>
                        <div className="text-xs font-semibold text-white/75 mt-1">{stat.label}</div>
                      </div>
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.iconBg)}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </motion.div>
                );
              })}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="rounded-2xl border border-white/60 shadow-sm p-4 flex flex-wrap gap-3 items-center"
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Filters</p>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  type="text"
                  placeholder="Search quizzes..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              <select
                value={courseFilter}
                onChange={e => { setCourseFilter(e.target.value); setClassFilter('all'); }}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">All Courses</option>
                {courseOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {classOptions.length > 0 && (
                <select
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
                >
                  <option value="all">All Classes</option>
                  {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setCourseFilter('all'); setClassFilter('all'); setStatusFilter('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </motion.div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 h-52 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm"
              >
                <EmptyIllustration />
                <h3 className="text-xl font-extrabold text-slate-800 mt-6 mb-2">
                  {hasActiveFilters ? 'No results found' : 'No quizzes yet'}
                </h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {hasActiveFilters
                    ? 'Try adjusting your search or filters.'
                    : 'Create your first quiz to start assessing students.'}
                </p>
                {courseOptions.length > 0 && !hasActiveFilters && can('actions.teacher.quizzes.create') && (
                  <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Link
                      to="/teacher/quizzes/new"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white"
                      style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                      }}
                    >
                      <Plus className="w-4 h-4" /> Create Your First Quiz
                    </Link>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.07 } },
                }}
              >
                {filtered.map((quiz) => (
                  <QuizLessonStyleCard
                    key={quiz.id}
                    quiz={quiz}
                    passLabel={passLabel(quiz)}
                    onEdit={() => navigate(`/teacher/quizzes/edit/${quiz.id}`)}
                    onDelete={() => requestDelete(quiz)}
                    onTogglePublish={() => void togglePublish(quiz)}
                    canEdit={can('actions.teacher.quizzes.edit')}
                    canDelete={can('actions.teacher.quizzes.delete')}
                    canPublish={can('actions.teacher.quizzes.publish')}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {quizToDelete && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              aria-label="Close"
              disabled={deleting}
              onClick={() => !deleting && setQuizToDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100"
            >
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50">
                  <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-slate-900">Delete this quiz?</h3>
                  <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                    <span className="font-semibold text-slate-800">&ldquo;{quizToDelete.title}&rdquo;</span>{' '}
                    and all its questions will be permanently removed. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-6">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setQuizToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void confirmDelete()}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? 'Deleting…' : 'Delete quiz'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}

function QuizLessonStyleCard({
  quiz,
  passLabel,
  onEdit,
  onDelete,
  onTogglePublish,
  canEdit,
  canDelete,
  canPublish,
}: {
  quiz: QuizWithCount;
  passLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
}) {
  const published = !!quiz.published;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
      }}
      whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.15)' }}
      className="group relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-200"
    >
      <div
        className="h-1.5 w-full"
        style={{
          background: published
            ? 'linear-gradient(90deg,#6366f1,#8b5cf6)'
            : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
        }}
      />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
          >
            <FileText className="w-5 h-5 text-indigo-500" />
          </div>
          {canPublish && <button
            type="button"
            onClick={onTogglePublish}
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all',
              published
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', published ? 'bg-emerald-500' : 'bg-amber-500')} />
            {published ? 'Published' : 'Draft'}
          </button>}
        </div>

        <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{quiz.title}</h3>
        {quiz.description && (
          <p className="text-xs text-slate-400 line-clamp-2 mb-2">{quiz.description}</p>
        )}

        {(quiz.settings?.shuffleQuestions || quiz.settings?.allowRetry) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {quiz.settings?.shuffleQuestions && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-semibold">
                <Shuffle className="w-3 h-3" /> Shuffle
              </span>
            )}
            {quiz.settings?.allowRetry && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[10px] font-semibold">
                <RotateCcw className="w-3 h-3" /> Retry
              </span>
            )}
          </div>
        )}

        <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[130px] truncate">
              <BookOpen className="w-3 h-3 shrink-0" />
              <span className="truncate">{quiz.courseName}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
              <HelpCircle className="w-3.5 h-3.5 text-slate-300" />
              {quiz.questionCount} Q
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-300" />
              {quiz.timeLimit} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-slate-300" />
              Pass {passLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200 sm:translate-y-1 sm:group-hover:translate-y-0">
          {canEdit && <button
            type="button"
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>}
          {canDelete && <button
            type="button"
            onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>}
        </div>
      </div>
    </motion.div>
  );
}
