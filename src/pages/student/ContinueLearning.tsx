import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, useInView, AnimatePresence } from 'motion/react';
import {
  Play, CheckCircle2, BookOpen, Flame, Trophy,
  Sparkles, ChevronRight, Star, Zap, Target,
  Clock, TrendingUp, Award, ArrowRight, BarChart2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface CourseProgress {
  id: string;
  title: string;
  description: string;
  level: string;
  quizCount: number;
  attemptedQuizzes: number;
  teacher_name: string;
  gradient: string;
  icon: string;
}

interface AttemptData {
  id: string;
  score: number;
  total_points: number;
  completed_at: string;
  quiz_id: string;
}

const LEVEL_GRADIENTS: Record<string, { gradient: string; icon: string; accent: string }> = {
  beginner:     { gradient: 'from-emerald-400 via-teal-500 to-cyan-500',     icon: '🌱', accent: 'emerald' },
  intermediate: { gradient: 'from-blue-500 via-indigo-500 to-violet-500',     icon: '⚡', accent: 'blue' },
  advanced:     { gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',  icon: '🔥', accent: 'violet' },
  proficiency:  { gradient: 'from-rose-500 via-pink-500 to-orange-400',       icon: '🏆', accent: 'rose' },
};

const FALLBACK: { gradient: string; icon: string; accent: string }[] = [
  { gradient: 'from-amber-400 via-orange-500 to-rose-500',    icon: '📚', accent: 'amber' },
  { gradient: 'from-cyan-400 via-sky-500 to-blue-600',        icon: '🎯', accent: 'cyan' },
  { gradient: 'from-lime-400 via-emerald-500 to-teal-600',    icon: '💡', accent: 'lime' },
  { gradient: 'from-fuchsia-500 via-pink-500 to-rose-500',    icon: '🚀', accent: 'fuchsia' },
  { gradient: 'from-indigo-400 via-violet-500 to-purple-600', icon: '✨', accent: 'indigo' },
];

function getMeta(level: string, index: number) {
  const key = (level || '').toLowerCase();
  return LEVEL_GRADIENTS[key] ?? FALLBACK[index % FALLBACK.length];
}

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 1200;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, value]);

  return <span ref={ref}>{count}{suffix}</span>;
}

function RadialProgress({ pct, size = 80, stroke = 6 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="white" strokeWidth={stroke}
        strokeDasharray={circ}
        strokeLinecap="round"
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: dash }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
      />
    </svg>
  );
}

function FloatingOrb({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn('absolute rounded-full opacity-20 blur-3xl pointer-events-none', className)}
      animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function CourseCard({ course, index }: { course: CourseProgress; index: number }) {
  const meta = getMeta(course.level, index);
  const pct = course.quizCount > 0 ? Math.round((course.attemptedQuizzes / course.quizCount) * 100) : 0;
  const isCompleted = pct === 100;
  const isStarted = pct > 0 && !isCompleted;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-slate-200 transition-shadow duration-300 flex flex-col border border-slate-100"
    >
      {/* Cover */}
      <div className={`relative bg-gradient-to-br ${meta.gradient} h-40 overflow-hidden flex-shrink-0`}>
        <FloatingOrb className="w-40 h-40 bg-white -top-10 -right-10" />
        <FloatingOrb className="w-28 h-28 bg-black/30 -bottom-8 -left-8" />

        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern id={`p-${index}`} x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="8" fill="none" stroke="white" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#p-${index})`} />
          </svg>
        </div>

        <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
          <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-xs font-bold px-2.5 py-1 rounded-xl">
            <span>{meta.icon}</span> {course.level || 'Course'}
          </span>
          {isCompleted && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.5 }}
              className="flex items-center gap-1 bg-white/25 backdrop-blur-sm border border-white/40 text-white text-[10px] font-bold px-2 py-1 rounded-xl"
            >
              <CheckCircle2 className="w-3 h-3" /> Done
            </motion.span>
          )}
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative w-12 h-12">
              <RadialProgress pct={pct} size={48} stroke={4} />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white">{pct}%</span>
            </div>
            <div>
              <div className="text-white/60 text-[10px] font-semibold uppercase tracking-wide">Progress</div>
              <div className="text-white text-xs font-bold">
                {isCompleted ? 'Completed!' : isStarted ? 'In Progress' : 'Not Started'}
              </div>
            </div>
          </div>
          <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
            <span className="text-white text-[10px] font-black">
              {course.teacher_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'T'}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-sm font-black text-slate-900 leading-tight line-clamp-2 mb-1.5 group-hover:text-emerald-600 transition-colors">
          {course.title}
        </h3>
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4 flex-1">
          {course.description || 'Continue where you left off and master this course.'}
        </p>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Quiz Progress</span>
            <span className="text-[10px] font-bold text-slate-500">{course.attemptedQuizzes}/{course.quizCount}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-violet-500')}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.2 + index * 0.1 }}
            />
          </div>
        </div>

        <Link
          to="/student/quizzes"
          className={cn(
            'flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-bold transition-all group/btn',
            isCompleted
              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              : isStarted
              ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90 shadow-lg shadow-blue-200/60'
              : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200'
          )}
        >
          {isCompleted ? <><CheckCircle2 className="w-4 h-4" /> Review</> :
           isStarted  ? <><Play className="w-4 h-4" /> Continue</> :
                        <><Sparkles className="w-4 h-4" /> Start</>}
          <ChevronRight className="w-4 h-4 ml-auto group-hover/btn:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </motion.div>
  );
}

export default function ContinueLearning() {
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [attempts, setAttempts] = useState<AttemptData[]>([]);
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const [profileSnap, coursesSnap, attemptsSnap] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', uid).single(),
        supabase.from('courses').select('*').contains('student_ids', [uid]),
        supabase.from('attempts').select('*').eq('student_id', uid).order('completed_at', { ascending: false }),
      ]);

      if (profileSnap.data) setStudentName(profileSnap.data.display_name || '');
      const attemptsData: AttemptData[] = attemptsSnap.data || [];
      setAttempts(attemptsData);

      const raw = coursesSnap.data || [];
      if (raw.length === 0) { setLoading(false); return; }

      const courseIds = raw.map((c: any) => c.id);
      const teacherIds = [...new Set(raw.map((c: any) => c.teacher_id).filter(Boolean))] as string[];

      const [quizzesSnap, teachersSnap] = await Promise.all([
        supabase.from('quizzes').select('id, course_id').in('course_id', courseIds).eq('published', true),
        teacherIds.length > 0
          ? supabase.from('profiles').select('id, display_name').in('id', teacherIds)
          : Promise.resolve({ data: [] }),
      ]);

      const quizzesByCourse: Record<string, string[]> = {};
      (quizzesSnap.data || []).forEach((q: any) => {
        if (!quizzesByCourse[q.course_id]) quizzesByCourse[q.course_id] = [];
        quizzesByCourse[q.course_id].push(q.id);
      });

      const attemptedSet = new Set(attemptsData.map(a => a.quiz_id));
      const teacherMap: Record<string, string> = {};
      (teachersSnap.data || []).forEach((t: any) => { teacherMap[t.id] = t.display_name || ''; });

      const mapped: CourseProgress[] = raw.map((c: any, i: number) => {
        const cq = quizzesByCourse[c.id] || [];
        const meta = getMeta(c.level, i);
        return {
          id: c.id,
          title: c.title || 'Untitled',
          description: c.description || c.short_description || '',
          level: c.level || '',
          quizCount: cq.length,
          attemptedQuizzes: cq.filter(qid => attemptedSet.has(qid)).length,
          teacher_name: teacherMap[c.teacher_id] || '',
          gradient: meta.gradient,
          icon: meta.icon,
        };
      });

      // sort: in-progress first, then not-started, then completed
      mapped.sort((a, b) => {
        const pA = a.quizCount > 0 ? a.attemptedQuizzes / a.quizCount : 0;
        const pB = b.quizCount > 0 ? b.attemptedQuizzes / b.quizCount : 0;
        if (pA === 1 && pB !== 1) return 1;
        if (pB === 1 && pA !== 1) return -1;
        if (pA > 0 && pB === 0) return -1;
        if (pB > 0 && pA === 0) return 1;
        return 0;
      });

      setCourses(mapped);
      setLoading(false);
    };
    load();
  }, []);

  const completedCourses = courses.filter(c => c.quizCount > 0 && c.attemptedQuizzes === c.quizCount);
  const inProgressCourses = courses.filter(c => c.attemptedQuizzes > 0 && c.attemptedQuizzes < c.quizCount);
  const notStarted = courses.filter(c => c.attemptedQuizzes === 0);

  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((acc, a) => acc + (a.total_points > 0 ? (a.score / a.total_points) * 100 : 0), 0) / attempts.length)
    : 0;

  const heroStats = [
    { label: 'Courses Enrolled', value: courses.length, suffix: '', icon: BookOpen, color: 'from-blue-500 to-indigo-500' },
    { label: 'In Progress',       value: inProgressCourses.length, suffix: '', icon: Flame,   color: 'from-orange-500 to-rose-500' },
    { label: 'Completed',         value: completedCourses.length,  suffix: '', icon: Trophy,  color: 'from-emerald-500 to-teal-500' },
    { label: 'Avg Score',         value: avgScore, suffix: '%',    icon: Target, color: 'from-violet-500 to-purple-500' },
  ];

  const firstName = studentName.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <StudentLayout>
      <div className="space-y-10">

        {/* ── HERO ── */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 md:p-10 shadow-2xl">
          {/* Ambient orbs */}
          <motion.div
            className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-20 -left-20 w-72 h-72 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />

          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5 mb-4"
                >
                  <motion.span
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-400" />
                  </motion.span>
                  <span className="text-white/80 text-xs font-semibold">Continue Learning</span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="text-3xl md:text-4xl font-black text-white leading-tight"
                >
                  {greeting},<br />
                  <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    {firstName}!
                  </span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-slate-400 mt-2 text-sm"
                >
                  {inProgressCourses.length > 0
                    ? `You have ${inProgressCourses.length} course${inProgressCourses.length > 1 ? 's' : ''} in progress — keep going!`
                    : 'Pick up where you left off or start something new.'}
                </motion.p>
              </div>

              {/* Quick action */}
              {inProgressCourses.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  <Link
                    to="/student/quizzes"
                    className="inline-flex items-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-emerald-900/40 transition-all hover:scale-105 active:scale-95"
                  >
                    <Play className="w-4 h-4" />
                    Resume Learning
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              )}
            </div>

            {/* Stat pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
              {heroStats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.08 }}
                  className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-4"
                >
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2.5 shadow-lg`}>
                    <stat.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-2xl font-black text-white">
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="text-slate-400 text-[11px] font-semibold mt-0.5">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ── LOADING ── */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
                  <div className="h-40 bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 w-3/4 bg-slate-100 rounded-xl animate-pulse" />
                    <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse" />
                    <div className="h-10 w-full bg-slate-100 rounded-2xl animate-pulse mt-4" />
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CONTENT ── */}
        {!loading && (
          <>
            {/* In-Progress */}
            {inProgressCourses.length > 0 && (
              <Section title="Continue Where You Left Off" icon={<Flame className="w-4 h-4 text-orange-500" />} badge={`${inProgressCourses.length} Active`} badgeColor="bg-orange-50 text-orange-700 border-orange-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inProgressCourses.map((c, i) => <CourseCard key={c.id} course={c} index={i} />)}
                </div>
              </Section>
            )}

            {/* Not Started */}
            {notStarted.length > 0 && (
              <Section title="Ready to Start" icon={<Sparkles className="w-4 h-4 text-blue-500" />} badge={`${notStarted.length} New`} badgeColor="bg-blue-50 text-blue-700 border-blue-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {notStarted.map((c, i) => <CourseCard key={c.id} course={c} index={i} />)}
                </div>
              </Section>
            )}

            {/* Completed */}
            {completedCourses.length > 0 && (
              <Section title="Completed Courses" icon={<Trophy className="w-4 h-4 text-emerald-500" />} badge={`${completedCourses.length} Done`} badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {completedCourses.map((c, i) => <CourseCard key={c.id} course={c} index={i} />)}
                </div>
              </Section>
            )}

            {/* Recent Results Panel */}
            {attempts.length > 0 && (
              <Section title="Recent Quiz Results" icon={<BarChart2 className="w-4 h-4 text-violet-500" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {attempts.slice(0, 6).map((attempt, i) => {
                    const pct = attempt.total_points > 0 ? Math.round((attempt.score / attempt.total_points) * 100) : 0;
                    const passed = pct >= 50;
                    return (
                      <motion.div
                        key={attempt.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.06 }}
                        onClick={() => window.location.href = `/student/results/${attempt.id}`}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-4 cursor-pointer group flex items-center gap-4"
                      >
                        <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 shadow-sm',
                          passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                        )}>
                          {pct}
                          <span className="text-[10px] font-bold ml-0.5">%</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">
                            {passed ? '✅ Passed' : '❌ Not Passed'}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {new Date(attempt.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              className={cn('h-full rounded-full', passed ? 'bg-emerald-500' : 'bg-red-400')}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, delay: 0.1 + i * 0.05 }}
                            />
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
                      </motion.div>
                    );
                  })}
                </div>
                <div className="mt-4 text-center">
                  <Link to="/student/results" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                    View all results <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </Section>
            )}

            {/* Empty state */}
            {courses.length === 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center justify-center py-24 text-center"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-3xl flex items-center justify-center mb-5 shadow-lg"
                >
                  <BookOpen className="w-9 h-9 text-indigo-500" />
                </motion.div>
                <h3 className="text-xl font-black text-slate-900 mb-2">No courses yet</h3>
                <p className="text-slate-400 text-sm max-w-xs">You haven't been enrolled in any courses. Contact your teacher to get started.</p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
}

function Section({
  title, icon, badge, badgeColor, children
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 bg-slate-100 rounded-xl flex items-center justify-center">{icon}</div>
          <h2 className="text-base font-black text-slate-900">{title}</h2>
        </div>
        {badge && (
          <span className={cn('inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-xl border', badgeColor)}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </motion.section>
  );
}
