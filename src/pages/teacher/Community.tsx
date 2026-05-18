import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import TeacherLayout from "../../components/layout/TeacherLayout";
import LessonDiscussionBoard from "../../components/discussion/LessonDiscussionBoard";
import { authFetch } from "../../lib/apiUrl";
import { MessageSquare, BookOpen, Loader2, Search } from "lucide-react";

export default function TeacherCommunity() {
  const { t } = useTranslation();
  const [lessons, setLessons] = useState<
    Array<{ id: string; title: string; course_title?: string | null }>
  >([]);
  const [lessonId, setLessonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("/api/teacher/lessons");
        const json = res.ok ? await res.json() : { lessons: [] };
        const rows = Array.isArray(json?.lessons) ? json.lessons : [];
        const mapped = rows
          .map((row: any) => ({
            id: String(row?.id || ""),
            title: String(row?.title || "Untitled lesson"),
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        (l.course_title || "").toLowerCase().includes(q),
    );
  }, [lessons, search]);

  const selectedLesson = lessons.find((l) => l.id === lessonId);

  return (
    <TeacherLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Community</h1>
              <p className="text-indigo-200 text-sm">
                Moderate lesson discussions, pin questions and mark best answers
              </p>
            </div>
          </div>
        </div>

        {/* Lesson Picker */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-semibold text-slate-700">
                Choose a lesson to discuss
              </span>
              {!loading && lessons.length > 0 && (
                <span className="text-xs text-slate-400">
                  ({lessons.length})
                </span>
              )}
            </div>
            {!loading && lessons.length > 5 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter lessons…"
                  className="rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading lessons…
            </div>
          ) : lessons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-500">
                No lessons found
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Create lessons in your courses to enable discussions.
              </p>
            </div>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto pr-1 flex flex-wrap gap-2 content-start">
                {filtered.map((lesson) => (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => setLessonId(lesson.id)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                      lessonId === lesson.id
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50"
                    }`}
                  >
                    {lesson.title}
                    {lesson.course_title && (
                      <span className="ml-1.5 text-xs opacity-60">
                        — {lesson.course_title}
                      </span>
                    )}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-slate-400 py-2">
                    No lessons match "{search}"
                  </p>
                )}
              </div>
              {lessons.length > 5 && (
                <p className="mt-2 text-xs text-slate-400">
                  Showing {filtered.length} of {lessons.length} lessons
                </p>
              )}
            </>
          )}
        </div>

        {/* Discussion Board */}
        {lessonId && (
          <LessonDiscussionBoard
            key={lessonId}
            lessonId={lessonId}
            canModerate
            title={
              selectedLesson
                ? `Discussion: ${selectedLesson.title}`
                : "Lesson Discussion"
            }
          />
        )}
      </div>
    </TeacherLayout>
  );
}
