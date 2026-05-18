import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { BookOpen, CheckCircle2, Circle, Clock, ArrowLeft, Play } from 'lucide-react';
import { cn } from '../../lib/utils';

type LessonRow = {
  id: string;
  title: string;
  order: number;
  duration_minutes: number | null;
  module_id: string;
};

type ModuleRow = {
  id: string;
  title: string;
  order: number | null;
  course_id: string;
};

type ProgressState = {
  startedAt: string;
  lastVisitedAt: string;
  completedLessonIds: string[];
  lastLessonId: string | null;
};

const readProgress = (studentId: string, courseId: string): ProgressState | null => {
  try {
    const raw = localStorage.getItem(`course_progress:${studentId}:${courseId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return {
      startedAt: parsed.startedAt || new Date().toISOString(),
      lastVisitedAt: parsed.lastVisitedAt || new Date().toISOString(),
      completedLessonIds: Array.isArray(parsed.completedLessonIds) ? parsed.completedLessonIds : [],
      lastLessonId: parsed.lastLessonId ?? null,
    };
  } catch {
    return null;
  }
};

const saveProgress = (studentId: string, courseId: string, state: ProgressState) => {
  localStorage.setItem(`course_progress:${studentId}:${courseId}`, JSON.stringify(state));
};

export default function StudentCourseDetail() {
  const { t } = useTranslation();
  const { courseId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [course, setCourse] = useState<any | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<string>('');
  const [lastVisitedAt, setLastVisitedAt] = useState<string>('');
  const [lastLessonId, setLastLessonId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !courseId) {
          setLoading(false);
          return;
        }

        const uid = session.user.id;
        setStudentId(uid);

        const { data: foundCourse } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .contains('student_ids', [uid])
          .maybeSingle();

        if (!foundCourse) {
          setLoading(false);
          return;
        }
        if (String(foundCourse.status || '').toLowerCase() !== 'published') {
          setLoading(false);
          return;
        }

        setCourse(foundCourse);

        const [modulesRes, lessonsRes] = await Promise.all([
          supabase
            .from('modules')
            .select('id,title,order,course_id')
            .eq('course_id', courseId)
            .order('order', { ascending: true }),
          authFetch(`/api/student/lessons?courseId=${encodeURIComponent(courseId)}`),
        ]);

        const moduleRows = (modulesRes.data || []) as ModuleRow[];
        const moduleIdSet = new Set(moduleRows.map((m) => m.id));

        const lessonsJson = lessonsRes.ok ? await lessonsRes.json() : { lessons: [] };
        const lessonRows = Array.isArray(lessonsJson?.lessons) ? lessonsJson.lessons : [];
        const normalizedLessons: LessonRow[] = lessonRows.map((l: any) => ({
          id: String(l.id),
          title: String(l.title || 'Untitled lesson'),
          order: Number(l.order || 0),
          duration_minutes:
            l.duration_minutes == null || l.duration_minutes === ''
              ? null
              : Number(l.duration_minutes),
          module_id: l.module_id ? String(l.module_id) : '',
        }));

        const hasUngrouped = normalizedLessons.some((lesson) => !lesson.module_id || !moduleIdSet.has(lesson.module_id));
        const nextModules = hasUngrouped
          ? [
              ...moduleRows,
              {
                id: '__ungrouped',
                title: t('lessons.ungroupedLessons'),
                order: Number.MAX_SAFE_INTEGER,
                course_id: courseId,
              },
            ]
          : moduleRows;

        const nextLessons = normalizedLessons.map((lesson) => {
          if (!lesson.module_id || !moduleIdSet.has(lesson.module_id)) {
            return { ...lesson, module_id: '__ungrouped' };
          }
          return lesson;
        });

        setModules(nextModules);
        setLessons(nextLessons);

        const existingProgress = readProgress(uid, courseId);
        if (existingProgress) {
          setStartedAt(existingProgress.startedAt);
          setLastVisitedAt(new Date().toISOString());
          setCompletedLessonIds(existingProgress.completedLessonIds);
          setLastLessonId(existingProgress.lastLessonId);
          saveProgress(uid, courseId, {
            ...existingProgress,
            lastVisitedAt: new Date().toISOString(),
          });
        } else {
          const initial: ProgressState = {
            startedAt: new Date().toISOString(),
            lastVisitedAt: new Date().toISOString(),
            completedLessonIds: [],
            lastLessonId: null,
          };
          setStartedAt(initial.startedAt);
          setLastVisitedAt(initial.lastVisitedAt);
          setCompletedLessonIds([]);
          setLastLessonId(null);
          saveProgress(uid, courseId, initial);
        }

        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    load();
  }, [courseId]);

  const lessonsByModule = useMemo(() => {
    const map: Record<string, LessonRow[]> = {};
    lessons.forEach((lesson) => {
      if (!map[lesson.module_id]) map[lesson.module_id] = [];
      map[lesson.module_id].push(lesson);
    });
    return map;
  }, [lessons]);

  const totalLessons = lessons.length;
  const completedCount = completedLessonIds.length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const toggleLesson = (lessonId: string) => {
    if (!studentId || !courseId) return;
    const next = completedLessonIds.includes(lessonId)
      ? completedLessonIds.filter((id) => id !== lessonId)
      : [...completedLessonIds, lessonId];
    const nextState: ProgressState = {
      startedAt: startedAt || new Date().toISOString(),
      lastVisitedAt: new Date().toISOString(),
      completedLessonIds: next,
      lastLessonId: lessonId,
    };
    setCompletedLessonIds(next);
    setLastVisitedAt(nextState.lastVisitedAt);
    setLastLessonId(lessonId);
    saveProgress(studentId, courseId, nextState);
  };

  return (
    <StudentLayout>
      <div className="space-y-6">
        <Link to="/student/courses" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Link>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-8">
            <div className="h-6 w-48 bg-slate-100 rounded animate-pulse mb-4" />
            <div className="h-4 w-64 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : !course ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">{t('student.courseDetail.notAvailable')}</h2>
            <p className="text-sm text-slate-500 mt-1">{t('errors.noAccess')}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-3xl border border-slate-100 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900">{course.title || t('student.courseDetail.untitled')}</h1>
                  <p className="text-sm text-slate-500 mt-1">{course.description || t('student.courseDetail.continueJourney')}</p>
                </div>
                <Link
                  to={`/student/lessons?courseId=${encodeURIComponent(courseId)}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  <Play className="w-4 h-4" />
                  {t('student.courses.continue')}
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">{t('student.progress.progress')}</p>
                  <p className="text-xl font-black text-slate-900 mt-1">{progressPct}%</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">{t('nav.lessons')}</p>
                  <p className="text-xl font-black text-slate-900 mt-1">{completedCount}/{totalLessons}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">{t('student.courseDetail.lastVisited')}</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">{lastVisitedAt ? new Date(lastVisitedAt).toLocaleString() : '—'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {modules.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center text-slate-500">
                  {t('modules.noModules')}
                </div>
              ) : (
                modules.map((module) => {
                  const moduleLessons = lessonsByModule[module.id] || [];
                  return (
                    <div key={module.id} className="bg-white rounded-3xl border border-slate-100 p-5">
                      <h3 className="text-base font-black text-slate-900">{module.title || t('modules.moduleName')}</h3>
                      <div className="mt-3 space-y-2">
                        {moduleLessons.length === 0 ? (
                          <p className="text-sm text-slate-400">{t('lessons.noLessons')}</p>
                        ) : (
                          moduleLessons.map((lesson) => {
                            const done = completedLessonIds.includes(lesson.id);
                            return (
                              <button
                                key={lesson.id}
                                type="button"
                                onClick={() => toggleLesson(lesson.id)}
                                className={cn(
                                  'w-full text-left flex items-center justify-between rounded-2xl border px-4 py-3 transition-all',
                                  done
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                )}
                              >
                                <div>
                                  <p className={cn('text-sm font-semibold', done ? 'text-emerald-800' : 'text-slate-800')}>
                                    {lesson.title}
                                  </p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {t('lessons.title')} {lesson.order || 0} {lesson.duration_minutes ? `· ${lesson.duration_minutes}m` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-slate-400" />
                                  {done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-slate-300" />}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </StudentLayout>
  );
}
