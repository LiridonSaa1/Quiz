import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { authFetch } from '../../lib/apiUrl';
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
  const { t } = useTranslation();
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

      const { data: enrolledCourses } = await supabase
        .from('courses')
        .select('id, title, status, student_ids')
        .contains('student_ids', [uid]);

      const coursesData = (enrolledCourses || []).filter((c: any) => {
        const status = String(c?.status || '').toLowerCase();
        return status === '' || status === 'published' || status === 'active';
      });

      if (!coursesData.length) {
        setLoading(false);
        return;
      }

      const courseIds = (coursesData || []).map((c: any) => c.id);

      if (!courseIds.length) { setLoading(false); return; }

      const courseMap: Record<string, string> = {};
      (coursesData || []).forEach((c: any) => { courseMap[c.id] = c.title; });

      const examsByCourse: any[] = [];
      await Promise.all(
        courseIds.map(async (courseId: string) => {
          try {
            const res = await authFetch(`/api/student/quizzes?courseId=${encodeURIComponent(courseId)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const rows = Array.isArray(json?.quizzes) ? json.quizzes : [];
            rows.forEach((row: any) => examsByCourse.push(row));
          } catch {
            // Ignore one-course failure and continue with others.
          }
        })
      );
      const uniqueQuizMap = new Map<string, any>();
      examsByCourse.forEach((row: any) => {
        const id = String(row?.id || '').trim();
        if (!id) return;
        if (!uniqueQuizMap.has(id)) uniqueQuizMap.set(id, row);
      });
      const quizzesData = Array.from(uniqueQuizMap.values()).filter(
        (q: any) => String(q?.type || 'standard').toLowerCase() === 'exam'
      );

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
    { key: 'all',       label: t('exams.allExams'), count: () => exams.length },
    { key: 'available', label: t('exams.availableExams'),  count: () => exams.filter(e => e.canAttempt).length },
    { key: 'passed',    label: t('exams.passedExams'),     count: () => exams.filter(e => e.passed).length },
    { key: 'failed',    label: t('exams.failedExams'),     count: () => exams.filter(e => !e.passed && e.attemptsUsed > 0 && !e.canAttempt).length },
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
            <span className="text-fuchsia-300 text-sm font-semibold uppercase tracking-widest">{t('exams.examCenter')}</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">{t('exams.myExams')}</h1>
          <p className="text-slate-400 text-sm max-w-xl">{t('exams.formalAssessments')}</p>
          <div className="flex flex-wrap gap-6 mt-5">
            {[
              { label: t('exams.totalExams'),  value: stats.total,     icon: FileText,     color: 'text-fuchsia-300' },
              { label: t('exams.passedExams'),       value: stats.passed,    icon: CheckCircle2, color: 'text-emerald-300' },
              { label: t('exams.availableExams'),    value: stats.available, icon: Unlock,       color: 'text-blue-300'    },
              { label: t('exams.avgBestScore'), value: `${stats.avgBest}%`, icon: Trophy, color: 'text-amber-300'  },
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="h-3 bg-slate-200 animate-pulse" />
              <div className="p-5 space-y-3">
                <div className="h-5 w-3/4 bg-slate-100 rounded-xl animate-pulse" />
                <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-10 bg-slate-100 rounded-2xl animate-pulse mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-fuchsia-50 rounded-2xl flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-fuchsia-300" />
          </div>
          <h3 className="text-slate-700 font-bold text-lg mb-1">{t('exams.noExamsHere')}</h3>
          <p className="text-slate-400 text-sm">
            {hasActiveFilters ? t('exams.noResultsForFilter') : t('exams.noEnrolledContent')}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence>
            {visible.map((exam, i) => {
              const statusColor = exam.passed ? 'from-emerald-500 to-teal-500' : 'from-violet-500 to-purple-500';
              const latestAttemptId = exam.attempts[0]?.id ? String(exam.attempts[0].id) : null;
              const stateLabel = exam.passed ? 'Passed' : exam.attemptsUsed > 0 ? 'Completed' : 'New';
              const scorePct = exam.bestScore !== null ? Math.round(Number(exam.bestScore) || 0) : null;

              return (
                <motion.div key={exam.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-slate-200/80 transition-shadow flex flex-col group">
                  <div className={cn('h-1.5 bg-gradient-to-r', statusColor)} />
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-2.5 bg-violet-50 rounded-xl group-hover:bg-violet-100 transition-colors">
                        <GraduationCap className="w-4 h-4 text-violet-600" />
                      </div>
                      {scorePct !== null && (
                        <span className={cn('text-xs font-bold px-2.5 py-1 rounded-xl',
                          exam.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                          {scorePct}%
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{exam.courseName}</span>
                      <h3 className="text-sm font-black text-slate-900 mt-0.5 mb-2 line-clamp-2 group-hover:text-violet-600 transition-colors">{exam.title}</h3>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">{exam.description || 'Formal assessment for this course.'}</p>
                      <div className="flex gap-2 mb-5">
                        <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold px-2 py-1 rounded-lg">
                          <Clock className="w-3 h-3" /> {exam.timeLimit} min
                        </span>
                        <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold px-2 py-1 rounded-lg">
                          <FileText className="w-3 h-3" /> {exam.questionCount} Q
                        </span>
                        <span className={cn(
                          'flex items-center gap-1 border text-[11px] font-semibold px-2 py-1 rounded-lg',
                          exam.passed
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : exam.attemptsUsed > 0
                              ? 'bg-blue-50 border-blue-100 text-blue-700'
                              : 'bg-violet-50 border-violet-100 text-violet-700'
                        )}>
                          {exam.passed ? <Trophy className="w-3 h-3" /> : exam.attemptsUsed > 0 ? <CheckCircle2 className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                          {stateLabel}
                        </span>
                      </div>
                    </div>

                    {exam.attemptsUsed === 0 && (
                      <button onClick={() => navigate(`/student/quiz/${exam.id}`)}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-bold transition-all bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:opacity-90 shadow-lg shadow-violet-200/60">
                        <Zap className="w-4 h-4" /> {t('exams.startExam')}
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </button>
                    )}
                    {exam.attemptsUsed > 0 && latestAttemptId && (
                      <button
                        onClick={() => navigate(`/student/results/${latestAttemptId}`)}
                        className="mt-2 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-xs font-bold transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('exams.viewResult')}
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
            <h4 className="text-sm font-bold text-fuchsia-900">{t('exams.examTips')}</h4>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: Timer,       tip: t('exams.checkTimeLimit') },
              { icon: AlertCircle, tip: t('exams.submitEarly') },
              { icon: Star,        tip: t('exams.scorePassMark') },
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
