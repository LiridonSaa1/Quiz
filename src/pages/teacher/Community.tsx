import React, { useEffect, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import LessonDiscussionBoard from '../../components/discussion/LessonDiscussionBoard';
import { authFetch } from '../../lib/apiUrl';
import { MessageSquare, BookOpen, Loader2 } from 'lucide-react';

export default function TeacherCommunity() {
  const [lessons, setLessons] = useState<Array<{ id: string; title: string; course_title?: string | null }>>([]);
  const [lessonId, setLessonId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch('/api/teacher/lessons');
        const json = res.ok ? await res.json() : { lessons: [] };
        const rows = Array.isArray(json?.lessons) ? json.lessons : [];
        const mapped = rows
          .map((row: any) => ({
            id: String(row?.id || ''),
            title: String(row?.title || 'Untitled lesson'),
            course_title: row?.course_title || null,
          }))
          .filter((row: { id: string }) => row.id);
        setLessons(mapped);
        if (mapped[0]?.id) setLessonId(mapped[0].id);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const selectedLesson = lessons.find(l => l.id === lessonId);

  return (
    <TeacherLayout>
      <div className="space-y-5 max-w-6xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Community</h1>
              <p className="text-indigo-200 text-sm">Moderate lesson discussions, pin questions and mark best answers</p>
            </div>
          </div>
        </div>

        {/* Lesson Picker */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">Choose a lesson to discuss</span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading lessons…
            </div>
          ) : lessons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-500">No lessons found</p>
              <p className="text-xs text-slate-400 mt-1">Create lessons in your courses to enable discussions.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lessons.map(lesson => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => setLessonId(lesson.id)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                    lessonId === lesson.id
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50'
                  }`}
                >
                  {lesson.title}
                  {lesson.course_title && (
                    <span className="ml-1.5 text-xs opacity-60">— {lesson.course_title}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Discussion Board */}
        {lessonId && (
          <LessonDiscussionBoard
            key={lessonId}
            lessonId={lessonId}
            canModerate
            title={selectedLesson ? `Discussion: ${selectedLesson.title}` : 'Lesson Discussion'}
          />
        )}
      </div>
    </TeacherLayout>
  );
}
