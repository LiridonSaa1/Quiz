import React, { useEffect, useState } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import LessonDiscussionBoard from '../../components/discussion/LessonDiscussionBoard';
import { authFetch } from '../../lib/apiUrl';

export default function StudentCommunity() {
  const [lessons, setLessons] = useState<Array<{ id: string; title: string; course_title?: string | null }>>([]);
  const [lessonId, setLessonId] = useState('');

  useEffect(() => {
    const load = async () => {
      const res = await authFetch('/api/student/lessons');
      const json = res.ok ? await res.json() : { lessons: [] };
      const rows = Array.isArray(json?.lessons) ? json.lessons : [];
      const mapped = rows
        .map((row: any) => ({ id: String(row?.id || ''), title: String(row?.title || 'Untitled lesson'), course_title: row?.course_title || null }))
        .filter((row: { id: string }) => row.id);
      setLessons(mapped);
      if (mapped[0]?.id) setLessonId(mapped[0].id);
    };
    void load();
  }, []);

  return (
    <StudentLayout>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <h1 className="text-2xl font-black text-slate-900">Lesson Community</h1>
          <p className="text-sm text-slate-500 mt-1">Choose a lesson and join focused learning discussions.</p>
          <select
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
            className="mt-3 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title} {lesson.course_title ? `- ${lesson.course_title}` : ''}
              </option>
            ))}
          </select>
        </div>
        {lessonId ? <LessonDiscussionBoard lessonId={lessonId} /> : null}
      </div>
    </StudentLayout>
  );
}
