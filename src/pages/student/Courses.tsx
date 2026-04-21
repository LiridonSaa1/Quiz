import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { authFetch } from '../../lib/apiUrl';
import { selectPublishedQuizzesCompat } from '../../lib/quizzesCompat';
import {
  BookOpen, Search, Clock, Users, Play, CheckCircle2,
  Layers, Flame, Trophy, ChevronRight, Filter,
  GraduationCap, Sparkles, Lock, Star, UserPlus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchAttemptRowsByStudentId } from '../../lib/quizAttempts';

interface CourseData {
  id: string;
  title: string;
  description: string;
  level: string;
  language: string;
  total_lessons: number;
  total_students: number;
  teacher_id: string;
  teacher_name: string;
  quizCount: number;
  attemptedQuizzes: number;
  status: string;
  isEnrolled: boolean;
}

type FilterTab = 'all' | 'inprogress' | 'completed' | 'notstarted';

const LEVEL_META: Record<string, { label: string; gradient: string; pattern: string; badge: string; icon: string }> = {
  beginner:     { label: 'Beginner',      gradient: 'from-emerald-400 via-teal-500 to-cyan-500',       pattern: 'circles',   badge: 'bg-emerald-400/20 text-emerald-100 border-emerald-300/30', icon: '🌱' },
  intermediate: { label: 'Intermediate',  gradient: 'from-blue-500 via-indigo-500 to-violet-500',       pattern: 'grid',      badge: 'bg-blue-400/20 text-blue-100 border-blue-300/30',         icon: '⚡' },
  advanced:     { label: 'Advanced',      gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',    pattern: 'dots',      badge: 'bg-violet-400/20 text-violet-100 border-violet-300/30',   icon: '🔥' },
  proficiency:  { label: 'Proficiency',   gradient: 'from-rose-500 via-pink-500 to-orange-400',         pattern: 'wave',      badge: 'bg-rose-400/20 text-rose-100 border-rose-300/30',         icon: '🏆' },
};

const FALLBACK_GRADIENTS = [
  'from-amber-400 via-orange-500 to-rose-500',
  'from-cyan-400 via-sky-500 to-blue-600',
  'from-lime-400 via-emerald-500 to-teal-600',
  'from-fuchsia-500 via-pink-500 to-rose-500',
  'from-indigo-400 via-violet-500 to-purple-600',
];

function getMeta(level: string, index: number) {
  const key = (level || '').toLowerCase();
  if (LEVEL_META[key]) return LEVEL_META[key];
  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
  return { label: level || 'Course', gradient, pattern: 'dots', badge: 'bg-white/20 text-white border-white/20', icon: '📚' };
}

function CircleProgress({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct / 100);
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
      <circle
        cx="24" cy="24" r={r} fill="none"
        stroke="white" strokeWidth="4"
        strokeDasharray={circ}
        strokeDashoffset={dash}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

function CourseCard({
  course,
  index,
  onEnroll,
  enrolling,
}: {
  course: CourseData;
  index: number;
  onEnroll: (courseId: string) => void;
  enrolling: boolean;
  key?: React.Key;
}) {
  const meta = getMeta(course.level, index);
  const pct = course.quizCount > 0
    ? Math.round((course.attemptedQuizzes / course.quizCount) * 100)
    : 0;
  const isCompleted = pct === 100;
  const isStarted = pct > 0;
  const initials = course.teacher_name
    ? course.teacher_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'T';

  return (
    <div className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-slate-200/80 transition-all duration-300 hover:-translate-y-1 flex flex-col border border-slate-100">

      {/* Card Cover */}
      <div className={`relative bg-gradient-to-br ${meta.gradient} h-44 flex-shrink-0 overflow-hidden`}>
        {/* Decorative patterns */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id={`pat-${index}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="10" fill="none" stroke="white" strokeWidth="1" />
                <circle cx="0" cy="0" r="5" fill="none" stroke="white" strokeWidth="1" />
                <circle cx="40" cy="0" r="5" fill="none" stroke="white" strokeWidth="1" />
                <circle cx="0" cy="40" r="5" fill="none" stroke="white" strokeWidth="1" />
                <circle cx="40" cy="40" r="5" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#pat-${index})`} />
          </svg>
        </div>

        {/* Glow blobs */}
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/20 rounded-full blur-2xl" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-black/10 rounded-full blur-xl" />

        {/* Top row: level badge + status */}
        <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
          <span className={cn('inline-flex items-center gap-1.5 border text-xs font-bold px-2.5 py-1 rounded-xl backdrop-blur-sm', meta.badge)}>
            <span className="text-sm">{meta.icon}</span>
            {meta.label}
          </span>
          {isCompleted && (
            <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-[10px] font-bold px-2.5 py-1 rounded-xl">
              <CheckCircle2 className="w-3 h-3" /> Done
            </span>
          )}
        </div>

        {/* Bottom row: progress ring + teacher avatar */}
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <CircleProgress pct={pct} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">
                {pct}%
              </span>
            </div>
            <div>
              <div className="text-white/70 text-[10px] font-semibold uppercase tracking-wide">Progress</div>
              <div className="text-white text-xs font-bold">
                {isCompleted ? 'Complete' : isStarted ? 'In progress' : 'Not started'}
              </div>
            </div>
          </div>

          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center shadow-lg">
            <span className="text-white text-xs font-black">{initials}</span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="text-base font-black text-slate-900 leading-tight line-clamp-2 mb-1.5 group-hover:text-emerald-600 transition-colors">
            {course.title}
          </h3>
          <p className="text-xs text-slate-400 font-medium mb-4 line-clamp-2 leading-relaxed">
            {course.description || 'No description provided for this course.'}
          </p>

          {/* Meta chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold px-2.5 py-1 rounded-lg">
              <Layers className="w-3 h-3" />
              {course.total_lessons ?? 0} lessons
            </span>
            <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold px-2.5 py-1 rounded-lg">
              <BookOpen className="w-3 h-3" />
              {course.quizCount} quiz{course.quizCount !== 1 ? 'zes' : ''}
            </span>
            <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold px-2.5 py-1 rounded-lg">
              <Users className="w-3 h-3" />
              {course.total_students}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Quiz Progress</span>
            <span className="text-[10px] font-bold text-slate-500">{course.attemptedQuizzes}/{course.quizCount}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700', isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-violet-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* CTA */}
        {course.isEnrolled ? (
          <Link
            to={`/student/courses/${course.id}`}
            className={cn(
              'flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-bold transition-all',
              isCompleted
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                : isStarted
                ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90 shadow-lg shadow-blue-200/60'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-200'
            )}
          >
            {isCompleted ? (
              <><CheckCircle2 className="w-4 h-4" /> View Completion</>
            ) : isStarted ? (
              <><Play className="w-4 h-4" /> Continue</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Start Course</>
            )}
            <ChevronRight className="w-4 h-4 ml-auto" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onEnroll(course.id)}
            disabled={enrolling}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-bold transition-all bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
          >
            <UserPlus className="w-4 h-4" />
            {enrolling ? 'Enrolling...' : 'Enroll'}
          </button>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
      <div className="h-44 bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse" />
      <div className="p-5 space-y-3">
        <div className="h-5 w-3/4 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse" />
        <div className="flex gap-2 mt-2">
          <div className="h-6 w-16 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-6 w-16 bg-slate-100 rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-full bg-slate-100 rounded-2xl animate-pulse mt-3" />
      </div>
    </div>
  );
}

export default function StudentCourses() {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setStudentId(uid);

      const profileSnap = await supabase
        .from('profiles')
        .select('display_name, teacher_id')
        .eq('id', uid)
        .single();

      if (profileSnap.data) setStudentName(profileSnap.data.display_name || '');

      const linkedTeacherId = profileSnap.data?.teacher_id || null;
      if (!linkedTeacherId) {
        setCourses([]);
        setLoading(false);
        return;
      }

      const teacherIdCandidates = await resolveTeacherIdCandidates(String(linkedTeacherId));
      const scopedTeacherIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [String(linkedTeacherId)];
      if (import.meta.env.DEV) {
        console.debug('[StudentCourses] linkedTeacherId:', linkedTeacherId);
        console.debug('[StudentCourses] scopedTeacherIds:', scopedTeacherIds);
      }

      const coursesRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(String(linkedTeacherId))}`);
      const coursesJson = coursesRes.ok ? await coursesRes.json() : { courses: [] };
      const rawCourses = Array.isArray(coursesJson?.courses)
        ? coursesJson.courses.filter((c: any) => String(c?.status || '').toLowerCase() === 'published')
        : [];
      if (import.meta.env.DEV) {
        console.debug('[StudentCourses] fetched courses count:', rawCourses.length);
      }
      if (rawCourses.length === 0) { setLoading(false); return; }

      const courseIds = rawCourses.map((c: any) => c.id);
      const teacherIds = [...new Set(rawCourses.map((c: any) => c.teacher_id).filter(Boolean))] as string[];

      const [modulesSnap, lessonsByCourseSnap, attemptsSnap, teachersSnap] = await Promise.all([
        supabase.from('modules').select('id, course_id').in('course_id', courseIds),
        supabase.from('lessons').select('id, course_id, module_id').in('course_id', courseIds),
        fetchAttemptRowsByStudentId(supabase, uid),
        teacherIds.length > 0
          ? supabase.from('profiles').select('id, display_name').in('id', teacherIds)
          : Promise.resolve({ data: [] }),
      ]);

      const modules = modulesSnap.data || [];
      const moduleToCourse: Record<string, string> = {};
      modules.forEach((m: any) => {
        const mid = String(m?.id || '');
        const cid = String(m?.course_id || '');
        if (mid && cid) moduleToCourse[mid] = cid;
      });

      const lessonsByCourse = lessonsByCourseSnap.data || [];
      const lessonsCountByCourse: Record<string, number> = {};
      const lessonIdsByCourse: Record<string, string[]> = {};
      (lessonsByCourse || []).forEach((l: any) => {
        const lid = String(l?.id || '');
        const directCourseId = String(l?.course_id || '');
        const mappedCourseId = directCourseId || moduleToCourse[String(l?.module_id || '')] || '';
        if (!lid || !mappedCourseId) return;
        lessonsCountByCourse[mappedCourseId] = (lessonsCountByCourse[mappedCourseId] || 0) + 1;
        if (!lessonIdsByCourse[mappedCourseId]) lessonIdsByCourse[mappedCourseId] = [];
        lessonIdsByCourse[mappedCourseId].push(lid);
      });

      const quizRowsByCourse = await selectPublishedQuizzesCompat(supabase, courseIds, 'id, course_id, lesson_id');
      const allLessonIds = Object.values(lessonIdsByCourse).flat();
      const quizRowsByLesson = allLessonIds.length > 0
        ? await supabase.from('quizzes').select('id, lesson_id').in('lesson_id', allLessonIds)
        : { data: [] as any[] };

      const quizzesByCourse: Record<string, string[]> = {};
      (quizRowsByCourse || []).forEach((q: any) => {
        const cid = String(q?.course_id || '');
        const qid = String(q?.id || '');
        if (!cid || !qid) return;
        if (!quizzesByCourse[cid]) quizzesByCourse[cid] = [];
        if (!quizzesByCourse[cid].includes(qid)) quizzesByCourse[cid].push(qid);
      });
      (quizRowsByLesson.data || []).forEach((q: any) => {
        const lessonId = String(q?.lesson_id || '');
        const qid = String(q?.id || '');
        if (!lessonId || !qid) return;
        const cid = Object.keys(lessonIdsByCourse).find((courseKey) => lessonIdsByCourse[courseKey].includes(lessonId));
        if (!cid) return;
        if (!quizzesByCourse[cid]) quizzesByCourse[cid] = [];
        if (!quizzesByCourse[cid].includes(qid)) quizzesByCourse[cid].push(qid);
      });

      const attemptedQuizIds = new Set((attemptsSnap || []).map((a: any) => a.quiz_id));
      const teacherMap: Record<string, string> = {};
      (teachersSnap.data || []).forEach((t: any) => { teacherMap[t.id] = t.display_name || 'Unknown'; });

      const mapped: CourseData[] = rawCourses.map((c: any) => {
        const cQuizzes = quizzesByCourse[c.id] || [];
        const attempted = cQuizzes.filter(qid => attemptedQuizIds.has(qid)).length;
        const courseStudentIds = Array.isArray(c.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [];
        return {
          id: c.id,
          title: c.title || 'Untitled Course',
          description: c.description || c.short_description || '',
          level: c.level || '',
          language: c.language || '',
          total_lessons: lessonsCountByCourse[c.id] ?? c.total_lessons ?? 0,
          total_students: c.total_students ?? 0,
          teacher_id: c.teacher_id,
          teacher_name: teacherMap[c.teacher_id] || 'Your Teacher',
          quizCount: cQuizzes.length,
          attemptedQuizzes: attempted,
          status: c.status || 'published',
          isEnrolled: courseStudentIds.includes(uid),
        };
      });

      setCourses(mapped);
      setLoading(false);
    };
    fetchData();
  }, []);

  const enrollInCourse = async (courseId: string) => {
    if (!studentId || enrollingCourseId) return;
    setEnrollingCourseId(courseId);
    try {
      const res = await authFetch(`/api/student/courses/${encodeURIComponent(courseId)}/enroll`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to enroll');
      toast.success('Enrollment successful');

      setCourses((prev) =>
        prev.map((course) =>
          course.id === courseId
            ? {
                ...course,
                isEnrolled: true,
                total_students: (course.total_students || 0) + 1,
              }
            : course
        )
      );
    } catch (e) {
      toast.error((e as Error)?.message || 'Failed to enroll');
    } finally {
      setEnrollingCourseId(null);
    }
  };

  const firstName = studentName.split(' ')[0] || 'Student';

  const filtered: CourseData[] = useMemo(() => {
    let list = courses;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
    }
    if (filterTab === 'inprogress') list = list.filter(c => c.attemptedQuizzes > 0 && c.attemptedQuizzes < c.quizCount);
    if (filterTab === 'completed')  list = list.filter(c => c.quizCount > 0 && c.attemptedQuizzes === c.quizCount);
    if (filterTab === 'notstarted') list = list.filter(c => c.attemptedQuizzes === 0);
    return list;
  }, [courses, search, filterTab]);

  const counts = useMemo(() => ({
    all: courses.length,
    inprogress: courses.filter(c => c.attemptedQuizzes > 0 && c.attemptedQuizzes < c.quizCount).length,
    completed:  courses.filter(c => c.quizCount > 0 && c.attemptedQuizzes === c.quizCount).length,
    notstarted: courses.filter(c => c.attemptedQuizzes === 0).length,
  }), [courses]);

  const totalPct = courses.length > 0
    ? Math.round(courses.reduce((a, c) => a + (c.quizCount > 0 ? (c.attemptedQuizzes / c.quizCount) * 100 : 0), 0) / courses.length)
    : 0;

  const TABS: { id: FilterTab; label: string; icon: React.ElementType }[] = [
    { id: 'all',        label: 'All Courses',  icon: BookOpen },
    { id: 'inprogress', label: 'In Progress',  icon: Play },
    { id: 'completed',  label: 'Completed',    icon: CheckCircle2 },
    { id: 'notstarted', label: 'Not Started',  icon: Lock },
  ];

  return (
    <StudentLayout>
      <div className="space-y-8 max-w-8xl mx-auto">

        {/* ── Hero welcome banner ── */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-8 shadow-2xl">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="hero-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.5" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#hero-dots)" />
            </svg>
          </div>

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
                <Flame className="w-3.5 h-3.5" /> Keep learning!
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                Welcome back,<br />
                <span className="text-emerald-400">{loading ? '...' : firstName}</span> 👋
              </h1>
              <p className="text-slate-400 text-sm mt-2">
                You're enrolled in <span className="text-white font-bold">{courses.length} course{courses.length !== 1 ? 's' : ''}</span>. Keep pushing forward!
              </p>
            </div>

            {/* Overall progress ring */}
            <div className="flex items-center gap-5 bg-white/5 border border-white/10 rounded-2xl px-6 py-5 backdrop-blur-sm shrink-0">
              <div className="relative w-20 h-20">
                <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="32" fill="none"
                    stroke="#10b981" strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - totalPct / 100)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-white font-black text-lg leading-none">{totalPct}%</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-white font-black text-lg">{counts.completed}</div>
                <div className="text-slate-400 text-xs font-medium">Completed</div>
                <div className="h-px bg-white/10 my-2" />
                <div className="text-white font-black text-lg">{counts.inprogress}</div>
                <div className="text-slate-400 text-xs font-medium">In Progress</div>
              </div>
            </div>
          </div>

          {/* Quick stat bar */}
          <div className="relative mt-6 pt-6 border-t border-white/10 grid grid-cols-3 sm:grid-cols-3 gap-4">
            {[
              { icon: Trophy, label: 'Overall Progress', value: `${totalPct}%`, color: 'text-amber-400' },
              { icon: GraduationCap, label: 'Active Courses', value: courses.length, color: 'text-emerald-400' },
              { icon: Star, label: 'Quizzes Attempted', value: courses.reduce((a, c) => a + c.attemptedQuizzes, 0), color: 'text-violet-400' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <div className="text-white font-black text-sm">{loading ? '—' : s.value}</div>
                  <div className="text-slate-500 text-[10px] font-semibold">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search your courses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 overflow-x-auto shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all',
                  filterTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                <span className={cn(
                  'text-[10px] font-black px-1.5 py-0.5 rounded-lg min-w-[18px] text-center',
                  filterTab === tab.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500'
                )}>
                  {counts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Course Grid ── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm">
              <BookOpen className="w-9 h-9 text-emerald-400" />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">
              {search ? 'No courses match your search' : 'No courses here yet'}
            </h3>
            <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
              {search
                ? `We couldn't find any courses matching "${search}". Try a different keyword.`
                : filterTab !== 'all'
                ? 'Switch to "All Courses" to see everything you\'re enrolled in.'
                : 'You haven\'t been enrolled in any courses yet. Contact your teacher to get started.'}
            </p>
            {(search || filterTab !== 'all') && (
              <button
                onClick={() => { setSearch(''); setFilterTab('all'); }}
                className="mt-5 inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                <Filter className="w-4 h-4" /> Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((course, i) => (
              <CourseCard
                key={course.id}
                course={course}
                index={i}
                onEnroll={enrollInCourse}
                enrolling={enrollingCourseId === course.id}
              />
            ))}
          </div>
        )}

      </div>
    </StudentLayout>
  );
}
