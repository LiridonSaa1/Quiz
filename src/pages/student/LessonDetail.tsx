import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { BookOpen, ArrowLeft, Clock, CheckCircle2, Circle, Play, Video, Headphones, FileText, AlignLeft, Globe, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import LessonDiscussionBoard from '../../components/discussion/LessonDiscussionBoard';

const OUP_BASE = 'https://elt.oup.com/student/headway';
const CC = '?cc=global&selLanguage=en';
const HEADWAY_LEVELS = [
  { key: 'Beginner', slug: 'beg' },
  { key: 'Elementary', slug: 'elementary4' },
  { key: 'Pre-Intermediate', slug: 'preint4' },
  { key: 'Intermediate', slug: 'int5' },
  { key: 'Upper-Intermediate', slug: 'upperint5' },
  { key: 'Advanced', slug: 'adv4' },
];

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
  const [showOupPanel, setShowOupPanel] = useState(false);
  const [oupLevel, setOupLevel] = useState('preint4');
  const [oupUnit, setOupUnit] = useState(1);
  const [oupTab, setOupTab] = useState<'audio' | 'video' | 'links'>('audio');
  const [oupAudioLoaded, setOupAudioLoaded] = useState(false);
  const [oupVideoLoaded, setOupVideoLoaded] = useState(false);

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

            {/* ── Featured media: show primary video or audio player prominently ── */}
            {sections.video.length > 0 && (
              <div className="bg-slate-950 rounded-3xl overflow-hidden shadow-xl">
                <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                  <Video className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {sections.video[0].title || t('common.video')}
                  </span>
                </div>
                <video
                  ref={videoRef}
                  src={sections.video[0].signed_url ?? undefined}
                  controls
                  className="w-full"
                  style={{ maxHeight: '520px', background: '#000' }}
                  onLoadedMetadata={(e) => {
                    if (lastVideoPosition > 0) e.currentTarget.currentTime = lastVideoPosition;
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
                {sections.video[0].description && (
                  <p className="px-5 py-3 text-sm text-slate-400">{sections.video[0].description}</p>
                )}
                {/* Additional videos */}
                {sections.video.slice(1).map((item) => (
                  <div key={item.id} className="border-t border-slate-800 px-5 py-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-400">{item.title}</p>
                    <video src={item.signed_url ?? undefined} controls className="w-full rounded-xl" style={{ background: '#000' }} />
                  </div>
                ))}
              </div>
            )}

            {/* ── Featured audio player (shown when no video, or alongside video) ── */}
            {sections.audio.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-100 p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <Headphones className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-bold text-slate-800">{t('common.audio')}</span>
                  <span className="text-xs text-slate-400 ml-1">({sections.audio.length} {sections.audio.length === 1 ? 'track' : 'tracks'})</span>
                </div>
                {sections.audio.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 p-4 space-y-2">
                    {item.title && <p className="text-sm font-semibold text-slate-800">{item.title}</p>}
                    {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                    <audio src={item.signed_url ?? undefined} controls className="w-full" style={{ borderRadius: '12px' }} />
                  </div>
                ))}
              </div>
            )}

            {contents.length > 0 ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
                {/* Only show tabs if there are non-video/audio content types */}
                {(sections.pdf.length > 0 || sections.text.length > 0) && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {tabConfig
                        .filter((tab) => tab.key !== 'video' && tab.key !== 'audio' && (sections[tab.key] || []).length > 0)
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
                      {(sections[activeTab] || [])
                        .filter((item) => item.type !== 'video' && item.type !== 'audio')
                        .map((item) => (
                          <div key={item.id} className="rounded-2xl border border-slate-100 p-4 space-y-2">
                            <h3 className="text-base font-bold text-slate-900">{item.title || t('student.lessons.untitledContent')}</h3>
                            {item.description && <p className="text-sm text-slate-500">{item.description}</p>}
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
                  </>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 p-8 text-sm text-slate-500">
                {t('student.lessons.noContentAdded')}
              </div>
            )}
            {/* ── OUP Headway Resources panel ── */}
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
              <button
                onClick={() => setShowOupPanel(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800">Headway Audio &amp; Video</p>
                    <p className="text-xs text-slate-400">OUP online resources — Audio, Video &amp; Links</p>
                  </div>
                </div>
                {showOupPanel
                  ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {showOupPanel && (
                <div className="border-t border-slate-100">
                  {/* Controls row */}
                  <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-600 shrink-0">Level:</label>
                      <select
                        value={oupLevel}
                        onChange={e => { setOupLevel(e.target.value); setOupUnit(1); setOupAudioLoaded(false); setOupVideoLoaded(false); }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"
                      >
                        {HEADWAY_LEVELS.map(l => (
                          <option key={l.slug} value={l.slug}>{l.key}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-600 shrink-0">Unit:</label>
                      <select
                        value={oupUnit}
                        onChange={e => setOupUnit(Number(e.target.value))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"
                      >
                        {Array.from({ length: oupLevel === 'beg' ? 14 : 12 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>Unit {n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="ml-auto flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
                      {([
                        { id: 'audio', icon: '🎧', label: 'Audio' },
                        { id: 'video', icon: '🎬', label: 'Video' },
                        { id: 'links', icon: '🔗', label: 'Links' },
                      ] as const).map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setOupTab(tab.id)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                            oupTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                          )}
                        >
                          <span>{tab.icon}</span> {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Audio tab */}
                  {oupTab === 'audio' && (
                    <div className="px-6 pb-6 pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          <strong>Unit {oupUnit}</strong> — Student's Book Audio (OUP player)
                        </p>
                        <a
                          href={`${OUP_BASE}/${oupLevel}/audiodl${CC}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          <ExternalLink className="w-3 h-3" /> Open in new tab
                        </a>
                      </div>
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50" style={{ height: 480 }}>
                        {oupAudioLoaded ? (
                          <iframe
                            key={`oup-audio-${oupLevel}`}
                            src={`${OUP_BASE}/${oupLevel}/audiodl${CC}`}
                            className="w-full h-full border-0"
                            allow="autoplay; fullscreen"
                            title={`Headway Audio — ${oupLevel}`}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
                              <Headphones className="w-7 h-7 text-indigo-600" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-bold text-slate-700">OUP Audio Player</p>
                              <p className="text-xs text-slate-400 mt-1">Click to load — scroll to Unit {oupUnit} and press ▶</p>
                            </div>
                            <button
                              onClick={() => setOupAudioLoaded(true)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                              ▶ Load Audio Player
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Scroll to <strong>Unit {oupUnit}</strong> and press ▶ to play audio tracks inline.
                      </p>
                    </div>
                  )}

                  {/* Video tab */}
                  {oupTab === 'video' && (
                    <div className="px-6 pb-6 pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          <strong>Unit {oupUnit}</strong> — Video clips with script &amp; tasks
                        </p>
                        <a
                          href={`${OUP_BASE}/${oupLevel}/video_bandw${CC}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold"
                        >
                          <ExternalLink className="w-3 h-3" /> Open in new tab
                        </a>
                      </div>
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50" style={{ height: 480 }}>
                        {oupVideoLoaded ? (
                          <iframe
                            key={`oup-video-${oupLevel}`}
                            src={`${OUP_BASE}/${oupLevel}/video_bandw${CC}`}
                            className="w-full h-full border-0"
                            allow="autoplay; fullscreen"
                            title={`Headway Video — ${oupLevel}`}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center">
                              <Video className="w-7 h-7 text-rose-600" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-bold text-slate-700">OUP Video Player</p>
                              <p className="text-xs text-slate-400 mt-1">Click to load — find Unit {oupUnit} in the list</p>
                            </div>
                            <button
                              onClick={() => setOupVideoLoaded(true)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors shadow-sm"
                            >
                              ▶ Load Video Player
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Find <strong>Unit {oupUnit}</strong> video in the list and press ▶ to play inline.
                      </p>
                    </div>
                  )}

                  {/* Links tab */}
                  {oupTab === 'links' && (
                    <div className="px-6 pb-6 pt-3 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <a
                          href={`${OUP_BASE}/${oupLevel}/audiodl${CC}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-all group border border-indigo-100 text-center"
                        >
                          <Headphones className="w-5 h-5 text-indigo-600" />
                          <span className="text-xs font-bold text-indigo-700">Audio DL</span>
                          <ExternalLink className="w-3 h-3 text-indigo-400 group-hover:text-indigo-600" />
                        </a>
                        <a
                          href={`${OUP_BASE}/${oupLevel}/video_bandw${CC}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-rose-50 hover:bg-rose-100 transition-all group border border-rose-100 text-center"
                        >
                          <Video className="w-5 h-5 text-rose-600" />
                          <span className="text-xs font-bold text-rose-700">Video</span>
                          <ExternalLink className="w-3 h-3 text-rose-400 group-hover:text-rose-600" />
                        </a>
                        <a
                          href={`${OUP_BASE}/${oupLevel}/testbuilder${CC}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-all group border border-emerald-100 text-center"
                        >
                          <BookOpen className="w-5 h-5 text-emerald-600" />
                          <span className="text-xs font-bold text-emerald-700">Test Builder</span>
                          <ExternalLink className="w-3 h-3 text-emerald-400 group-hover:text-emerald-600" />
                        </a>
                      </div>
                      <p className="text-xs text-slate-400">Links open in a new tab. Select your level and unit above first.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <LessonDiscussionBoard lessonId={lesson.id} title={t('student.lessons.questionsAboutLesson')} />
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
