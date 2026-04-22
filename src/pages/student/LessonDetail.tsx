import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { BookOpen, ArrowLeft, Clock, CheckCircle2, Circle, Play } from 'lucide-react';
import { cn } from '../../lib/utils';

type LessonDetailRow = {
  id: string;
  title: string;
  short_description: string | null;
  type: string;
  duration_minutes: number | null;
  status: string;
  is_free_preview: boolean;
  module_title: string | null;
  course_title: string | null;
  course_id: string | null;
};

type LessonProgress = {
  startedAt: string;
  completed: boolean;
  lastVisitedAt: string;
};

const readProgress = (studentId: string, lessonId: string): LessonProgress | null => {
  try {
    const raw = localStorage.getItem(`lesson_progress:${studentId}:${lessonId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LessonProgress>;
    return {
      startedAt: parsed.startedAt || new Date().toISOString(),
      completed: Boolean(parsed.completed),
      lastVisitedAt: parsed.lastVisitedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const saveProgress = (studentId: string, lessonId: string, progress: LessonProgress) => {
  localStorage.setItem(`lesson_progress:${studentId}:${lessonId}`, JSON.stringify(progress));
};

export default function StudentLessonDetail() {
  const { lessonId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [lesson, setLesson] = useState<LessonDetailRow | null>(null);
  const [completed, setCompleted] = useState(false);
  const [startedAt, setStartedAt] = useState('');
  const [linkedQuizId, setLinkedQuizId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !lessonId) {
          setLoading(false);
          return;
        }
        const uid = session.user.id;
        setStudentId(uid);

        const lessonsRes = await authFetch('/api/student/lessons');
        const lessonsJson = lessonsRes.ok ? await lessonsRes.json() : { lessons: [] };
        const rows = Array.isArray(lessonsJson?.lessons) ? lessonsJson.lessons : [];
        const found = rows.find((l: any) => String(l.id) === String(lessonId));
        if (!found) {
          setLoading(false);
          return;
        }

        const normalized: LessonDetailRow = {
          id: String(found.id),
          title: String(found.title || 'Untitled lesson'),
          short_description: found.short_description || null,
          type: String(found.type || 'text'),
          duration_minutes: found.duration_minutes == null ? null : Number(found.duration_minutes),
          status: String(found.status || ''),
          is_free_preview: Boolean(found.is_free_preview),
          module_title: found.module_title || null,
          course_title: found.course_title || null,
          course_id: found.course_id ? String(found.course_id) : null,
        };
        setLesson(normalized);

        const progress = readProgress(uid, lessonId);
        if (progress) {
          setCompleted(progress.completed);
          setStartedAt(progress.startedAt);
          saveProgress(uid, lessonId, { ...progress, lastVisitedAt: new Date().toISOString() });
        } else {
          const initial: LessonProgress = {
            startedAt: new Date().toISOString(),
            completed: false,
            lastVisitedAt: new Date().toISOString(),
          };
          setStartedAt(initial.startedAt);
          setCompleted(false);
          saveProgress(uid, lessonId, initial);
        }

        if (normalized.type === 'quiz') {
          const quizRes = await supabase
            .from('quizzes')
            .select('id')
            .eq('lesson_id', normalized.id)
            .limit(1)
            .maybeSingle();
          if (!quizRes.error && quizRes.data?.id) {
            setLinkedQuizId(String(quizRes.data.id));
          }
        }

        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    void load();
  }, [lessonId]);

  const toggleCompleted = () => {
    if (!studentId || !lessonId) return;
    const next = !completed;
    setCompleted(next);
    saveProgress(studentId, lessonId, {
      startedAt: startedAt || new Date().toISOString(),
      completed: next,
      lastVisitedAt: new Date().toISOString(),
    });
  };

  const statusLabel = useMemo(() => {
    if (!lesson) return 'Lesson';
    if (completed) return 'Completed';
    return lesson.type === 'quiz' ? 'Quiz lesson' : 'In progress';
  }, [lesson, completed]);

  return (
    <StudentLayout>
      <div className="space-y-6">
        <Link to="/student/lessons" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          Back to lessons
        </Link>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-8">
            <div className="h-6 w-48 bg-slate-100 rounded animate-pulse mb-4" />
            <div className="h-4 w-64 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : !lesson ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Lesson not available</h2>
            <p className="text-sm text-slate-500 mt-1">You do not have access to this lesson.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-100 p-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {lesson.course_title || 'Course'} {lesson.module_title ? `· ${lesson.module_title}` : ''}
              </p>
              <h1 className="text-2xl font-black text-slate-900 mt-1">{lesson.title}</h1>
              <p className="text-sm text-slate-500 mt-2">{lesson.short_description || 'Read the lesson details and continue learning.'}</p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Type</p>
                  <p className="text-base font-bold text-slate-900 mt-1 capitalize">{lesson.type}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Duration</p>
                  <p className="text-base font-bold text-slate-900 mt-1 inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {lesson.duration_minutes ?? 0} min
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Status</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{statusLabel}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 p-6 flex flex-wrap gap-3">
              <button
                onClick={toggleCompleted}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  completed
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                )}
              >
                {completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                {completed ? 'Completed' : 'Mark as completed'}
              </button>

              {lesson.type === 'quiz' && linkedQuizId && (
                <Link
                  to={`/student/quiz/${linkedQuizId}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90"
                >
                  <Play className="w-4 h-4" />
                  Start Quiz
                </Link>
              )}

              {lesson.course_id && (
                <Link
                  to={`/student/courses/${lesson.course_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  Back to course
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
