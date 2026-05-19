import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { BookOpen, ArrowLeft, Clock, CheckCircle2, Circle, Play, Video, Headphones, FileText, AlignLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import LessonDiscussionBoard from '../../components/discussion/LessonDiscussionBoard';

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

type LessonContentRow = {
  id: string;
  type: 'video' | 'audio' | 'pdf' | 'text';
  title: string | null;
  description: string | null;
  text_content: string | null;
  signed_url?: string | null;
  pdf_page?: number | null;
  duration_seconds?: number | null;
  position: number;
};

type LessonProgressRow = {
  completed: boolean;
  last_video_position: number;
};

export default function StudentLessonDetail() {
  const { t } = useTranslation();
  const { lessonId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<LessonDetailRow | null>(null);
  const [contents, setContents] = useState<LessonContentRow[]>([]);
  const [completed, setCompleted] = useState(false);
  const [lastVideoPosition, setLastVideoPosition] = useState(0);
  const [linkedQuizId, setLinkedQuizId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'pdf' | 'text'>('video');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !lessonId) {
          setLoading(false);
          return;
        }

        const detailRes = await authFetch(`/api/student/lessons/${encodeURIComponent(lessonId)}/detail`);
        const detailJson = detailRes.ok ? await detailRes.json() : {};
        if (!detailRes.ok || !detailJson?.lesson) {
          setLoading(false);
          return;
        }
        const found = detailJson.lesson;
        const contentRows = Array.isArray(detailJson.contents) ? detailJson.contents : [];
        const progress = (detailJson.progress || {}) as LessonProgressRow;

        const normalized: LessonDetailRow = {
          id: String(found.id),
          title: String(found.title || t('student.lessons.untitled')),
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
        setContents(contentRows);
        setCompleted(Boolean(progress?.completed));
        setLastVideoPosition(Number(progress?.last_video_position || 0));

        const availableTabs = new Set(contentRows.map((c: LessonContentRow) => c.type));
        if (availableTabs.has('video')) setActiveTab('video');
        else if (availableTabs.has('audio')) setActiveTab('audio');
        else if (availableTabs.has('pdf')) setActiveTab('pdf');
        else setActiveTab('text');

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

  const persistProgress = async (nextCompleted: boolean, nextVideoPosition: number) => {
    await authFetch(`/api/student/lessons/${encodeURIComponent(lessonId)}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        completed: nextCompleted,
        lastVideoPosition: nextVideoPosition,
      }),
    });
  };

  const toggleCompleted = async () => {
    const next = !completed;
    setCompleted(next);
    await persistProgress(next, lastVideoPosition);
  };

  const statusLabel = useMemo(() => {
    if (!lesson) return t('common.lesson');
    if (completed) return t('common.completed');
    return lesson.type === 'quiz' ? t('common.quizLesson') : t('common.inProgress');
  }, [lesson, completed, t]);

  const sections = useMemo(() => {
    const byType: Record<string, LessonContentRow[]> = { video: [], audio: [], pdf: [], text: [] };
    contents.forEach((c) => {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c);
    });
    return byType;
  }, [contents]);

  const tabConfig = [
    { key: 'video', label: t('common.video'), icon: Video },
    { key: 'audio', label: t('common.audio'), icon: Headphones },
    { key: 'pdf', label: t('common.pdf'), icon: FileText },
    { key: 'text', label: t('common.text'), icon: AlignLeft },
  ] as const;

  const activeItems = sections[activeTab] || [];

  return (
    <StudentLayout>
      <div className="space-y-6">
        <Link to="/student/lessons" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          {t('student.lessons.backToLessons')}
        </Link>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-8">
            <div className="h-6 w-48 bg-slate-100 rounded animate-pulse mb-4" />
            <div className="h-4 w-64 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : !lesson ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">{t('student.lessons.lessonNotAvailable')}</h2>
            <p className="text-sm text-slate-500 mt-1">{t('student.lessons.noAccessToLesson')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-100 p-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {lesson.course_title || t('common.course')} {lesson.module_title ? `· ${lesson.module_title}` : ''}
              </p>
              <h1 className="text-2xl font-black text-slate-900 mt-1">{lesson.title}</h1>
              <p className="text-sm text-slate-500 mt-2">{lesson.short_description || t('student.lessons.lessonDescriptionPlaceholder')}</p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">{t('common.type')}</p>
                  <p className="text-base font-bold text-slate-900 mt-1 capitalize">{t(`common.${lesson.type}`)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">{t('common.duration')}</p>
                  <p className="text-base font-bold text-slate-900 mt-1 inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {t('common.minutesCount', { count: lesson.duration_minutes ?? 0 })}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">{t('common.status')}</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{statusLabel}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 p-6 flex flex-wrap gap-3">
              <button
                onClick={() => void toggleCompleted()}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  completed
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                )}
              >
                {completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                {completed ? t('common.completed') : t('student.lessons.markAsCompleted')}
              </button>

              {lesson.type === 'quiz' && linkedQuizId && (
                <Link
                  to={`/student/quiz/${linkedQuizId}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90"
                >
                  <Play className="w-4 h-4" />
                  {t('common.startQuiz')}
                </Link>
              )}

              {lesson.course_id && (
                <Link
                  to={`/student/courses/${lesson.course_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  {t('student.lessons.backToCourse')}
                </Link>
              )}
            </div>

            {contents.length > 0 ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {tabConfig
                    .filter((tab) => (sections[tab.key] || []).length > 0)
                    .map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                          'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all',
                          activeTab === tab.key
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    ))}
                </div>

                <div className="space-y-4">
                  {activeItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 p-4 space-y-2">
                      <h3 className="text-base font-bold text-slate-900">{item.title || t('student.lessons.untitledContent')}</h3>
                      {item.description && <p className="text-sm text-slate-500">{item.description}</p>}

                      {item.type === 'video' && item.signed_url && (
                        <video
                          ref={videoRef}
                          src={item.signed_url}
                          controls
                          className="w-full rounded-xl bg-black"
                          onLoadedMetadata={(e) => {
                            if (lastVideoPosition > 0) {
                              e.currentTarget.currentTime = lastVideoPosition;
                            }
                          }}
                          onTimeUpdate={(e) => {
                            const current = e.currentTarget.currentTime;
                            setLastVideoPosition(current);
                            const now = Date.now();
                            if (now - lastSyncRef.current > 5000) {
                              lastSyncRef.current = now;
                              void persistProgress(completed, current);
                            }
                          }}
                        />
                      )}
                      {item.type === 'audio' && item.signed_url && (
                        <audio src={item.signed_url} controls className="w-full" />
                      )}
                      {item.type === 'pdf' && item.signed_url && (
                        <iframe
                          title={item.title || 'PDF'}
                          src={`${item.signed_url}#page=${Math.max(1, Number(item.pdf_page || 1))}`}
                          className="w-full h-[70vh] rounded-xl border border-slate-200"
                        />
                      )}
                      {item.type === 'text' && (
                        <div
                          className="prose prose-slate max-w-none"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.text_content || `<p>${t('student.lessons.noTextContent')}</p>`) }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 p-8 text-sm text-slate-500">
                {t('student.lessons.noContentAdded')}
              </div>
            )}
            <LessonDiscussionBoard lessonId={lesson.id} title={t('student.lessons.questionsAboutLesson')} />
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
