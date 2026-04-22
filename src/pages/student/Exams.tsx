import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap, Clock, Target, CheckCircle2, XCircle,
  AlertCircle, BookOpen, Trophy, Lock, Unlock, ChevronRight,
  Timer, RotateCcw, Star, Zap, Shield, FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { selectPublishedQuizzesCompat } from '../../lib/quizzesCompat';
import { authFetch } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { fetchAttemptRowsByStudentId } from '../../lib/quizAttempts';

interface ExamEntry {
  id: string;
  title: string;
  description: string;
  courseName: string;
  courseId: string;
  timeLimit: number;
  passMark: number;
  maxAttempts: number;
  questionCount: number;
  published: boolean;
  attempts: { id: string; score: number; passed: boolean; completedAt: string }[];
  bestScore: number | null;
  passed: boolean;
  attemptsUsed: number;
  canAttempt: boolean;
}

const ORBS = [
  { cx: '5%',  cy: '30%', r: 200, color: 'rgba(217,70,239,0.10)' },
  { cx: '90%', cy: '50%', r: 250, color: 'rgba(139,92,246,0.08)' },
  { cx: '50%', cy: '90%', r: 160, color: 'rgba(168,85,247,0.12)' },
];

export default function StudentExams() {
  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'available' | 'passed' | 'failed'>('all');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
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
      if (!linkedTeacherId) {
        setLoading(false);
        return;
      }

      const teacherIdCandidates = await resolveTeacherIdCandidates(linkedTeacherId);
      const scopedTeacherIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [linkedTeacherId];

      const coursesRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(linkedTeacherId)}`);
      const coursesJson = coursesRes.ok ? await coursesRes.json() : { courses: [] };
      const coursesData = Array.isArray(coursesJson?.courses)
        ? coursesJson.courses.filter((c: any) => {
            const isPublished = String(c?.status || '').toLowerCase() === 'published';
            const isTeacherScoped = scopedTeacherIds.includes(String(c?.teacher_id || ''));
            const studentIds = Array.isArray(c?.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [];
            const isEnrolled = studentIds.includes(uid);
            return isPublished && isTeacherScoped && isEnrolled;
          })
        : [];

      if (!coursesData.length) {
        setLoading(false);
        return;
      }

      const { data: coursesFallback } = await supabase
        .from('courses')
        .select('id, title')
        .in('id', coursesData.map((c: any) => c.id));
      const courseIds = (coursesFallback || coursesData || []).map((c: any) => c.id);

      if (!courseIds.length) { setLoading(false); return; }

      const courseMap: Record<string, string> = {};
      (coursesFallback || coursesData || []).forEach((c: any) => { courseMap[c.id] = c.title; });

      const quizRows = await selectPublishedQuizzesCompat(supabase, courseIds, '*');
      const quizzesData = (quizRows || []).filter((q: any) => String(q?.type || '') === 'exam');

      if (!quizzesData?.length) { setLoading(false); return; }

      const quizIds = quizzesData.map((q: any) => q.id);

      const { data: questionsData } = await supabase
        .from('questions')
        .select('quiz_id');
      const qCount: Record<string, number> = {};
      (questionsData || []).forEach((q: any) => { qCount[q.quiz_id] = (qCount[q.quiz_id] || 0) + 1; });

      const attemptsData = (await fetchAttemptRowsByStudentId(supabase, uid))
        .filter((a: any) => quizIds.includes(a.quiz_id))
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const attMap: Record<string, { id: string; score: number; passed: boolean; completedAt: string }[]> = {};
      (attemptsData || []).forEach((a: any) => {
        if (!attMap[a.quiz_id]) attMap[a.quiz_id] = [];
        attMap[a.quiz_id].push({ id: a.id, score: a.score ?? 0, passed: a.passed ?? false, completedAt: a.completed_at || a.created_at });
      });

      const entries: ExamEntry[] = quizzesData.map((q: any) => {
        const att = attMap[q.id] || [];
        const bestScore = att.length ? Math.max(...att.map(a => a.score)) : null;
        const passed = att.some(a => a.passed);
        const maxAtt = q.max_attempts || 1;
        return {
          id: q.id,
          title: q.title,
          description: q.description,
          courseName: courseMap[q.course_id] || 'Unknown Course',
          courseId: q.course_id,
          timeLimit: q.time_limit || 60,
          passMark: q.pass_mark || q.settings?.passingScore || 70,
          maxAttempts: maxAtt,
          questionCount: qCount[q.id] || 0,
          published: q.published,
          attempts: att,
          bestScore,
          passed,
          attemptsUsed: att.length,
          canAttempt: !passed && att.length < maxAtt,
        };
      });

      setExams(entries);
      setLoading(false);
    };

    fetchData();
  }, []);

  const filters: { key: typeof activeFilter; label: string; count: () => number }[] = [
    { key: 'all',       label: 'All Exams', count: () => exams.length },
    { key: 'available', label: 'Available',  count: () => exams.filter(e => e.canAttempt).length },
    { key: 'passed',    label: 'Passed',     count: () => exams.filter(e => e.passed).length },
    { key: 'failed',    label: 'Failed',     count: () => exams.filter(e => !e.passed && e.attemptsUsed > 0 && !e.canAttempt).length },
  ];

  const visible = exams.filter(e => {
    if (activeFilter === 'available') return e.canAttempt;
    if (activeFilter === 'passed')    return e.passed;
    if (activeFilter === 'failed')    return !e.passed && e.attemptsUsed > 0 && !e.canAttempt;
    return true;
  });

  const stats = {
    total: exams.length,
    passed: exams.filter(e => e.passed).length,
    available: exams.filter(e => e.canAttempt).length,
    avgBest: exams.filter(e => e.bestScore !== null).length
      ? Math.round(exams.filter(e => e.bestScore !== null).reduce((s, e) => s + (e.bestScore ?? 0), 0) / exams.filter(e => e.bestScore !== null).length)
      : 0,
  };
  const hasActiveFilters = activeFilter !== 'all';

  return (
    <StudentLayout>
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-fuchsia-950 via-slate-900 to-slate-900 min-h-[200px] flex flex-col justify-end p-8">
        <svg className="absolute inset-0 w-full h-full">
          {ORBS.map((o, i) => (
            <motion.circle key={i} cx={o.cx} cy={o.cy} r={o.r} fill={o.color}
              animate={{ r: [o.r, o.r + 25, o.r], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 5 + i * 1.5, repeat: Infinity, ease: 'easeInOut' }} />
          ))}
        </svg>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-fuchsia-500/20 border border-fuchsia-500/30 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-fuchsia-300" />
            </div>
            <span className="text-fuchsia-300 text-sm font-semibold uppercase tracking-widest">Exam Center</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">My Exams</h1>
          <p className="text-slate-400 text-sm max-w-xl">Formal assessments for your enrolled courses. Pass to earn certificates and advance your learning.</p>
          <div className="flex flex-wrap gap-6 mt-5">
            {[
              { label: 'Total Exams',  value: stats.total,     icon: FileText,     color: 'text-fuchsia-300' },
              { label: 'Passed',       value: stats.passed,    icon: CheckCircle2, color: 'text-emerald-300' },
              { label: 'Available',    value: stats.available, icon: Unlock,       color: 'text-blue-300'    },
              { label: 'Avg Best Score', value: `${stats.avgBest}%`, icon: Trophy, color: 'text-amber-300'  },
            ].map(s => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5">
                <s.icon className={cn('w-4 h-4', s.color)} />
                <div>
                  <div className={cn('text-xl font-black', s.color)}>{s.value}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {filters.map(f => (
          <button key={f.key} onClick={() => setActiveFilter(f.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border',
              activeFilter === f.key
                ? 'bg-fuchsia-600 text-white border-fuchsia-600 shadow-lg shadow-fuchsia-500/20'
                : 'bg-white text-slate-600 border-slate-200 hover:border-fuchsia-300 hover:text-fuchsia-600'
            )}>
            {f.label}
            <span className={cn('text-xs font-black px-1.5 py-0.5 rounded-lg min-w-[20px] text-center',
              activeFilter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
              {f.count()}
            </span>
          </button>
        ))}
      </div>

      {/* Exam Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-56 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-fuchsia-50 rounded-2xl flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-fuchsia-300" />
          </div>
          <h3 className="text-slate-700 font-bold text-lg mb-1">No exams here</h3>
          <p className="text-slate-400 text-sm">
            {hasActiveFilters ? 'No results for current filter.' : 'No enrolled content yet.'}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {visible.map((exam, i) => {
              const statusColor = exam.passed
                ? 'from-emerald-500 to-teal-500'
                : !exam.canAttempt && exam.attemptsUsed > 0
                  ? 'from-rose-500 to-red-500'
                  : 'from-fuchsia-500 to-violet-500';
              const latestAttemptId = exam.attempts[0]?.id ? String(exam.attempts[0].id) : null;
              const stateLabel = exam.passed ? 'Passed' : !exam.canAttempt && exam.attemptsUsed > 0 ? 'No attempts left' : 'Can attempt';

              return (
                <motion.div key={exam.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all overflow-hidden group">
                  {/* Top accent bar */}
                  <div className={cn('h-1.5 bg-gradient-to-r', statusColor)} />

                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br', statusColor)}>
                        {exam.passed
                          ? <Trophy className="w-5 h-5 text-white" />
                          : !exam.canAttempt && exam.attemptsUsed > 0
                            ? <Lock className="w-5 h-5 text-white" />
                            : <GraduationCap className="w-5 h-5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-slate-900 font-bold text-base leading-tight">{exam.title}</h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <BookOpen className="w-3 h-3 text-slate-400" />
                          <span className="text-xs text-slate-400 truncate">{exam.courseName}</span>
                        </div>
                        <div className="mt-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border',
                            exam.passed
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : !exam.canAttempt && exam.attemptsUsed > 0
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                          )}>
                            {stateLabel}
                          </span>
                        </div>
                        {exam.description && (
                          <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{exam.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {[
                        { icon: Timer,    label: 'Minutes',   value: exam.timeLimit     },
                        { icon: FileText, label: 'Questions', value: exam.questionCount },
                        { icon: Target,   label: 'Pass Mark', value: `${exam.passMark}%` },
                      ].map(m => (
                        <div key={m.label} className="bg-slate-50 rounded-xl p-2.5 text-center">
                          <m.icon className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
                          <div className="text-sm font-black text-slate-800">{m.value}</div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wide">{m.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Attempt History */}
                    {exam.attempts.length > 0 && (
                      <div className="mb-4 space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attempt History</p>
                        {exam.attempts.slice(0, 3).map((att, j) => (
                          <div key={att.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              {att.passed
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                              <span className="text-xs text-slate-600 font-medium">Attempt {j + 1}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={cn('text-xs font-black', att.passed ? 'text-emerald-600' : 'text-rose-500')}>
                                {att.score}%
                              </span>
                              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-md border',
                                att.passed
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-600 border-rose-200')}>
                                {att.passed ? 'PASSED' : 'FAILED'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Attempts counter */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex gap-1">
                        {Array.from({ length: exam.maxAttempts }).map((_, j) => (
                          <div key={j} className={cn('w-5 h-1.5 rounded-full',
                            j < exam.attemptsUsed ? 'bg-rose-400' : 'bg-slate-200')} />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {exam.attemptsUsed}/{exam.maxAttempts} attempts used
                      </span>
                    </div>

                    {/* CTA */}
                    {exam.passed ? (
                      latestAttemptId ? (
                        <button
                          onClick={() => navigate(`/student/results/${latestAttemptId}`)}
                          className="w-full flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all"
                        >
                          <Trophy className="w-4 h-4" /> View Result
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 py-2.5 rounded-xl text-sm font-bold">
                          <Trophy className="w-4 h-4" /> Passed
                        </div>
                      )
                    ) : !exam.canAttempt ? (
                      <div className="flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 text-slate-400 py-2.5 rounded-xl text-sm font-bold">
                        <Lock className="w-4 h-4" /> No Attempts Remaining
                      </div>
                    ) : (
                      <button onClick={() => navigate(`/student/quiz/${exam.id}`)}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-700 hover:to-violet-700 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-fuchsia-500/20 group-hover:shadow-fuchsia-500/30">
                        <Zap className="w-4 h-4" />
                        {exam.attemptsUsed > 0 ? 'Retake' : 'Start'}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Tips panel */}
      {exams.some(e => e.canAttempt) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="mt-6 bg-gradient-to-r from-fuchsia-50 to-violet-50 border border-fuchsia-100 rounded-2xl p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 bg-fuchsia-100 rounded-lg flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-fuchsia-600" />
            </div>
            <h4 className="text-sm font-bold text-fuchsia-900">Exam Tips</h4>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: Timer,       tip: 'Check the time limit before starting. The timer begins immediately.' },
              { icon: AlertCircle, tip: 'Submitting early is final. Review all answers before submitting.' },
              { icon: Star,        tip: 'Score above the pass mark to earn your course certificate.' },
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <t.icon className="w-4 h-4 text-fuchsia-400 mt-0.5 shrink-0" />
                <p className="text-xs text-fuchsia-700">{t.tip}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </StudentLayout>
  );
}
