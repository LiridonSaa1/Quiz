import React, { useEffect, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import LessonDiscussionBoard from '../../components/discussion/LessonDiscussionBoard';
import { authFetch } from '../../lib/apiUrl';

export default function TeacherCommunity() {
  const [lessons, setLessons] = useState<Array<{ id: string; title: string }>>([]);
  const [lessonId, setLessonId] = useState('');

  useEffect(() => {
    const load = async () => {
      const res = await authFetch('/api/teacher/lessons');
      const json = res.ok ? await res.json() : { lessons: [] };
      const mapped = (Array.isArray(json?.lessons) ? json.lessons : [])
        .map((row: any) => ({ id: String(row?.id || ''), title: String(row?.title || 'Untitled lesson') }))
        .filter((row: { id: string }) => row.id);
      setLessons(mapped);
      if (mapped[0]?.id) setLessonId(mapped[0].id);
    };
    void load();
  }, []);

  return (
    <TeacherLayout>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <h1 className="text-2xl font-black text-slate-900">Lesson Community Moderation</h1>
          <p className="text-sm text-slate-500 mt-1">Manage lesson-level questions, best answers, and moderation actions.</p>
          <select
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
            className="mt-3 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title}
              </option>
            ))}
          </select>
        </div>
        {lessonId ? <LessonDiscussionBoard lessonId={lessonId} canModerate title="Teacher Discussion View" /> : null}
      </div>
    </TeacherLayout>
  );
}
