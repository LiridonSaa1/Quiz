import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import {
  GraduationCap, Plus, Search, Edit2, Trash2, Eye, EyeOff,
  Clock, Users, Target, BarChart3,
  BookOpen, FileText, Trophy, X, ChevronRight,
  Timer, RotateCcw, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import {
  fetchTeacherQuizzesFromSupabase,
  missingQuizzesPublishedColumn,
} from '../../lib/fetchTeacherQuizzes';
import { deleteAttemptRowsByQuizId, fetchAttemptRowsByQuizIds, normalizeAttempts } from '../../lib/quizAttempts';

interface Exam {
  id: string;
  title: string;
  description: string;
  courseId: string;
  courseName: string;
  timeLimit: number;
  passMark: number;
  maxAttempts: number;
  published: boolean;
  questionCount: number;
  totalAttempts: number;
  passRate: number;
  avgScore: number;
  createdAt: string;
  settings: any;
}

interface Course { id: string; title: string; }

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

const EXAM_ACCENT = 'linear-gradient(90deg,#4f46e5,#a78bfa)';

const STAT_CONFIG = [
  { label: 'Total Exams', gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', shadow: 'shadow-indigo-500/25', icon: GraduationCap },
  { label: 'Published', gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20', shadow: 'shadow-emerald-500/25', icon: Eye },
  { label: 'Drafts', gradient: 'from-amber-500 to-amber-600', iconBg: 'bg-white/20', shadow: 'shadow-amber-500/25', icon: EyeOff },
  { label: 'Attempts', gradient: 'from-violet-500 to-violet-600', iconBg: 'bg-white/20', shadow: 'shadow-violet-500/25', icon: Users },
];

export default function Exams() {
  const { t } = useTranslation();
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', courseId: '',
    timeLimit: 60, passMark: 70, maxAttempts: 1,
    shuffleQuestions: true, shuffleAnswers: true,
  });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const scopedTeacherIds = await resolveTeacherIdCandidates(session.user.id);
    const effectiveTeacherIds = scopedTeacherIds.length > 0 ? scopedTeacherIds : [session.user.id];

    try {
      let courseRows: { id: string; title: string | null }[] | null = null;
      const coursesRes = await authFetch(
        `/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`
      );
      if (coursesRes.ok) {
        const j = await coursesRes.json();
        if (j?.success && Array.isArray(j.courses)) {
          courseRows = j.courses.map((c: { id: string; title?: string | null }) => ({ id: c.id, title: c.title ?? null }));
        }
      }
      if (courseRows === null) {
        const { data: cd } = await supabase.from('courses').select('id, title').in('teacher_id', effectiveTeacherIds);
        courseRows = cd ?? [];
      }

      const { data: courseRosterRows } = await supabase
        .from('courses')
        .select('id,student_ids')
        .in('teacher_id', effectiveTeacherIds);
      const allowedStudentIds = new Set<string>();
      (courseRosterRows || []).forEach((course: any) => {
        const list = Array.isArray(course?.student_ids) ? course.student_ids : [];
        list.forEach((sid: any) => {
          const normalized = String(sid || '').trim();
          if (normalized) allowedStudentIds.add(normalized);
        });
      });

      let quizRows: any[] | null = null;
      const qzRes = await authFetch(
        `/api/teacher/quizzes?userId=${encodeURIComponent(session.user.id)}`
      );
      if (qzRes.ok) {
        const j = await qzRes.json();
        if (j?.success && Array.isArray(j.quizzes)) quizRows = j.quizzes;
      }
      if (quizRows === null) {
        quizRows = await fetchTeacherQuizzesFromSupabase(supabase, effectiveTeacherIds, session.user.id);
      }

      const examsOnly = (quizRows || []).filter((d: any) => (d.type || 'standard') === 'exam');

      const { data: questionsSnap } = await supabase.from('questions').select('quiz_id');
      const courseMap: Record<string, string> = {};
      (courseRows || []).forEach(c => { courseMap[c.id] = c.title || ''; });
      setCourses((courseRows || []).map(c => ({ id: c.id, title: c.title || '' })));

      const qCount: Record<string, number> = {};
      (questionsSnap || []).forEach((q: { quiz_id: string }) => {
        if (!q?.quiz_id) return;
        qCount[q.quiz_id] = (qCount[q.quiz_id] || 0) + 1;
      });

      const examIds = examsOnly.map((e: any) => e.id).filter(Boolean);
      let attemptRows: any[] = [];
      try {
        attemptRows = await fetchAttemptRowsByQuizIds(supabase, examIds);
      } catch {
        attemptRows = [];
      }

      const passingByQuiz: Record<string, number> = {};
      examsOnly.forEach((ex: any) => {
        passingByQuiz[ex.id] = Number(ex.settings?.passingScore ?? ex.pass_mark ?? 70);
      });
      const normalizedAttempts = normalizeAttempts(attemptRows, passingByQuiz).filter((a) => {
        if (allowedStudentIds.size === 0) return true;
        return allowedStudentIds.has(String(a.student_id || ''));
      });

      const attempts: Record<string, { total: number; passed: number; scores: number[] }> = {};
      normalizedAttempts.forEach((a) => {
        const qid = a.quiz_id;
        if (!attempts[qid]) attempts[qid] = { total: 0, passed: 0, scores: [] };
        attempts[qid].total++;
        if (a.passed) attempts[qid].passed++;
        attempts[qid].scores.push(a.score);
      });

      setExams(examsOnly.map((d: any) => {
        const att = attempts[d.id] || { total: 0, passed: 0, scores: [] };
        const avgScore = att.scores.length ? Math.round(att.scores.reduce((a, b) => a + b, 0) / att.scores.length) : 0;
        const passRate = att.total ? Math.round((att.passed / att.total) * 100) : 0;
        return {
          id: d.id,
          title: d.title,
          description: d.description,
          courseId: d.course_id,
          courseName: courseMap[d.course_id] || 'Unknown Course',
          timeLimit: d.time_limit || 60,
          passMark: d.pass_mark || d.settings?.passingScore || 70,
          maxAttempts: d.max_attempts || 1,
          published:
            typeof d.published === 'boolean'
              ? d.published
              : d.status === 'published' || String(d.status || '').toLowerCase() === 'active',
          questionCount: qCount[d.id] || 0,
          totalAttempts: att.total,
          passRate,
          avgScore,
          createdAt: d.created_at,
          settings: d.settings || {},
        };
      }));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.courseId) {
      toast.error('Title and course are required');
      return;
    }
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const createRes = await authFetch('/api/teacher/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          course_id: form.courseId,
          type: 'exam',
          time_limit: form.timeLimit,
          pass_mark: form.passMark,
          max_attempts: form.maxAttempts,
          published: false,
          settings: {
            passingScore: form.passMark,
            shuffleQuestions: form.shuffleQuestions,
            shuffleAnswers: form.shuffleAnswers,
            allowRetry: form.maxAttempts > 1,
          },
        }),
      });
      if (!createRes.ok) throw new Error(await readApiError(createRes));
      const created = await createRes.json();
      const newId = created?.quiz?.id as string | undefined;
      if (!newId) throw new Error('Exam create returned no id');
      toast.success('Exam created! Add questions in the builder.');
      setShowCreate(false);
      setForm({ title: '', description: '', courseId: '', timeLimit: 60, passMark: 70, maxAttempts: 1, shuffleQuestions: true, shuffleAnswers: true });
      navigate(`/teacher/quizzes/edit/${newId}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create exam');
    } finally {
      setCreating(false);
    }
  };

  const togglePublish = async (exam: Exam) => {
    setToggling(exam.id);
    try {
      const nextPub = !exam.published;
      let { error } = await supabase.from('quizzes').update({ published: nextPub }).eq('id', exam.id);
      if (error && missingQuizzesPublishedColumn(error)) {
        ({ error } = await supabase
          .from('quizzes')
          .update({ status: nextPub ? 'published' : 'draft' })
          .eq('id', exam.id));
      }
      if (error) throw error;
      setExams(prev => prev.map(e => e.id === exam.id ? { ...e, published: !exam.published } : e));
      toast.success(exam.published ? 'Exam unpublished' : 'Exam published — students can now see it!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setToggling(null);
    }
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this exam? All attempts will also be deleted.')) return;
    setDeleting(id);
    try {
      await deleteAttemptRowsByQuizId(supabase, id);
      await supabase.from('questions').delete().eq('quiz_id', id);
      const { error } = await supabase.from('quizzes').delete().eq('id', id);
      if (error) throw error;
      setExams(prev => prev.filter(e => e.id !== id));
      toast.success('Exam deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const filtered = exams.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = e.title.toLowerCase().includes(q) ||
      e.courseName.toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q);
    const matchCourse = courseFilter === 'all' || e.courseId === courseFilter;
    return matchSearch && matchCourse;
  });

  const hasActiveFilters = Boolean(search) || courseFilter !== 'all';

  const stats = [
    { ...STAT_CONFIG[0], value: exams.length },
    { ...STAT_CONFIG[1], value: exams.filter(e => e.published).length },
    { ...STAT_CONFIG[2], value: exams.filter(e => !e.published).length },
    { ...STAT_CONFIG[3], value: exams.reduce((s, e) => s + e.totalAttempts, 0) },
  ];

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
                    <span className="text-indigo-200 tracking-wider uppercase">Exams</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Course exams
                  </h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    Create timed assessments, set pass marks, and track how students perform across your courses.
                  </p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  disabled={courses.length === 0}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
                    boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  New exam
                </motion.button>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">

            {!loading && courses.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3"
              >
                <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">No courses found</p>
                  <p className="text-xs text-amber-600 mt-0.5">Create a course first, then add exams tied to it.</p>
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
                    style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
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
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  type="text"
                  placeholder="Search exams..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              <select
                value={courseFilter}
                onChange={e => setCourseFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">All courses</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setCourseFilter('all'); }}
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
                  {hasActiveFilters ? 'No results found' : 'No exams yet'}
                </h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {hasActiveFilters
                    ? 'Try adjusting your search or course filter.'
                    : 'Create your first exam, then add questions in the builder.'}
                </p>
                {courses.length > 0 && !hasActiveFilters && (
                  <motion.button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                    }}
                  >
                    <Plus className="w-4 h-4" /> Create your first exam
                  </motion.button>
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
                {filtered.map((exam) => {
                  const isPublished = exam.published;
                  return (
                    <motion.div
                      key={exam.id}
                      variants={{
                        hidden: { opacity: 0, y: 20 },
                        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
                      }}
                      whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.15)' }}
                      className="group relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-200"
                    >
                      <div className="h-1.5 w-full" style={{ background: EXAM_ACCENT }} />

                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-indigo-50">
                            <GraduationCap className="w-5 h-5 text-indigo-600" />
                          </div>
                          <button
                            type="button"
                            onClick={() => togglePublish(exam)}
                            disabled={toggling === exam.id}
                            className={cn(
                              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all',
                              isPublished
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
                              toggling === exam.id && 'opacity-60 cursor-wait'
                            )}
                          >
                            {toggling === exam.id ? (
                              <RotateCcw className="w-3 h-3 animate-spin" />
                            ) : (
                              <span className={cn('w-1.5 h-1.5 rounded-full', isPublished ? 'bg-emerald-500' : 'bg-amber-500')} />
                            )}
                            {isPublished ? 'Published' : 'Draft'}
                          </button>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{exam.title}</h3>
                        {exam.description ? (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-2">{exam.description}</p>
                        ) : null}

                        <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[140px] truncate">
                              <Layers className="w-3 h-3 shrink-0" />
                              <span className="truncate">{exam.courseName}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
                              <Clock className="w-3.5 h-3.5 text-slate-300" />
                              {exam.timeLimit} min
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { icon: FileText, label: 'Questions', value: exam.questionCount },
                              { icon: Target, label: 'Pass', value: `${exam.passMark}%` },
                              { icon: Timer, label: 'Attempts', value: exam.maxAttempts },
                            ].map(m => (
                              <div key={m.label} className="bg-slate-50 rounded-lg px-1.5 py-2 text-center">
                                <m.icon className="w-3 h-3 text-slate-400 mx-auto mb-0.5" />
                                <div className="text-xs font-bold text-slate-800 leading-tight">{m.value}</div>
                                <div className="text-[9px] text-slate-400 uppercase tracking-wide truncate">{m.label}</div>
                              </div>
                            ))}
                          </div>

                          {exam.totalAttempts > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-1">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                                <Users className="w-3 h-3" /> {exam.totalAttempts} attempts
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="inline-flex items-center gap-1">
                                <Trophy className="w-3 h-3 text-amber-500" /> {exam.passRate}% pass
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="inline-flex items-center gap-1">
                                <BarChart3 className="w-3 h-3 text-indigo-400" /> avg {exam.avgScore}%
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200 sm:translate-y-1 sm:group-hover:translate-y-0">
                          <button
                            type="button"
                            onClick={() => navigate(`/teacher/quizzes/edit/${exam.id}`)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteExam(exam.id)}
                            disabled={deleting === exam.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-60"
                          >
                            {deleting === exam.id ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Delete
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">New exam</h2>
                    <p className="text-xs text-slate-400">Set details, then add questions in the builder</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowCreate(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Final exam – Unit 4"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Course <span className="text-red-500">*</span></label>
                  <select
                    value={form.courseId}
                    onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  >
                    <option value="">Select course...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Instructions or overview for students..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time (min)</label>
                    <input
                      type="number"
                      min={5}
                      max={480}
                      value={form.timeLimit}
                      onChange={e => setForm(f => ({ ...f, timeLimit: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-center font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pass (%)</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.passMark}
                      onChange={e => setForm(f => ({ ...f, passMark: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-center font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Attempts</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={form.maxAttempts}
                      onChange={e => setForm(f => ({ ...f, maxAttempts: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-center font-semibold"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  {[
                    { key: 'shuffleQuestions' as const, label: 'Shuffle questions' },
                    { key: 'shuffleAnswers' as const, label: 'Shuffle answers' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={form[opt.key]}
                        onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="px-6 pb-6 flex items-center justify-end gap-3 shrink-0 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >
                  {creating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  {creating ? 'Creating...' : 'Create & add questions'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}
