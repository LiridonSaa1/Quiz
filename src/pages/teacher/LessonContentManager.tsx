import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { authFetch } from '../../lib/apiUrl';
import { supabase } from '../../supabase';
import { ArrowLeft, GripVertical, Plus, Save, Trash2, UploadCloud, ArrowDown, ArrowUp, RotateCcw, ExternalLink, Globe, Headphones, Video, ChevronDown, ChevronRight, BookOpen, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

type ContentType = 'video' | 'audio' | 'pdf' | 'text' | 'link';

type LessonContentRow = {
  id: string;
  lesson_id: string;
  type: ContentType;
  title: string | null;
  description: string | null;
  storage_path: string | null;
  signed_url?: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  text_content: string | null;
  pdf_page: number | null;
  duration_seconds: number | null;
  position: number;
};

const CONTENT_TYPES: ContentType[] = ['video', 'audio', 'pdf', 'text', 'link'];

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

const moveItem = <T,>(arr: T[], from: number, to: number) => {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (item === undefined) return arr;
  next.splice(to, 0, item);
  return next;
};

export default function TeacherLessonContentManager() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lessonId = '' } = useParams();
  const [userId, setUserId] = useState('');
  const [lessonTitle, setLessonTitle] = useState(t('lessons.title'));
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LessonContentRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [showHeadway, setShowHeadway] = useState(false);
  const [headwayLevel, setHeadwayLevel] = useState('preint4');
  const [headwayTab, setHeadwayTab] = useState<'audio' | 'video' | 'links'>('audio');
  const [headwayUnit, setHeadwayUnit] = useState(1);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [items]
  );

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    setUserId(session.user.id);

    const [lessonRes, contentsRes] = await Promise.all([
      authFetch(`/api/teacher/lessons?userId=${encodeURIComponent(session.user.id)}`),
      authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents?userId=${encodeURIComponent(session.user.id)}`),
    ]);

    const lessonJson = lessonRes.ok ? await lessonRes.json().catch(() => ({})) : {};
    const contentsJson = contentsRes.ok ? await contentsRes.json().catch(() => ({})) : {};

    const foundLesson = Array.isArray(lessonJson?.lessons)
      ? lessonJson.lessons.find((l: any) => String(l.id) === String(lessonId))
      : null;
    setLessonTitle(String(foundLesson?.title || t('lessons.title')));
    setItems(Array.isArray(contentsJson?.contents) ? contentsJson.contents : []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [lessonId, t]);

  const addItem = async () => {
    if (!userId) return;
    const nextPosition = sorted.length + 1;
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents`, {
      method: 'POST',
      body: JSON.stringify({
        userId,
        type: 'text',
        title: `Content ${nextPosition}`,
        text_content: '',
        position: nextPosition,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      toast.error(json?.error || t('lessons.failedToSaveContentItem'));
      return;
    }
    setItems((prev) => [...prev, json.content]);
    toast.success(t('lessons.contentItemCreated'));
  };

  const updateItem = async (item: LessonContentRow) => {
    if (!userId) return;
    setSavingId(item.id);
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        userId,
        type: item.type,
        title: item.title,
        description: item.description,
        text_content: item.text_content,
        pdf_page: item.pdf_page,
        duration_seconds: item.duration_seconds,
        storage_path: item.storage_path,
        mime_type: item.mime_type,
        size_bytes: item.size_bytes,
        position: item.position,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingId(null);
    if (!res.ok || !json?.success) {
      toast.error(json?.error || t('lessons.failedToSaveContentItem'));
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === item.id ? json.content : x)));
    toast.success(t('lessons.saved'));
  };

  const removeItem = async (id: string) => {
    if (!userId) return;
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      toast.error(json?.error || t('lessons.failedToDeleteContentItem'));
      return;
    }
    const next = sorted.filter((x) => x.id !== id).map((x, idx) => ({ ...x, position: idx + 1 }));
    setItems(next);
    await saveOrder(next);
    toast.success(t('lessons.deleted'));
  };

  const saveOrder = async (current: LessonContentRow[]) => {
    if (!userId) return;
    const orderedIds = current.map((x) => x.id);
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ userId, orderedIds }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error || t('lessons.failedToSaveOrder'));
    }
  };

  const onUpload = async (item: LessonContentRow, file: File) => {
    if (!userId) return;
    setUploadingId(item.id);
    const urlRes = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/upload-url`, {
      method: 'POST',
      body: JSON.stringify({
        userId,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      }),
    });
    const urlJson = await urlRes.json().catch(() => ({}));
    if (!urlRes.ok || !urlJson?.signedUrl || !urlJson?.storagePath) {
      setUploadingId(null);
      toast.error(urlJson?.error || 'Failed to request upload URL');
      return;
    }

    const putRes = await fetch(urlJson.signedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!putRes.ok) {
      setUploadingId(null);
      toast.error('Upload failed');
      return;
    }

    const nextItem = {
      ...item,
      storage_path: String(urlJson.storagePath),
      mime_type: file.type || item.mime_type,
      size_bytes: file.size,
    };
    await updateItem(nextItem);
    setUploadingId(null);
    toast.success('Uploaded');
  };

  const handleDropReorder = async (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) return;
    const re = moveItem(sorted, dragIndex, toIndex).map((x, idx) => ({ ...x, position: idx + 1 }));
    setItems(re);
    setDragIndex(null);
    await saveOrder(re);
  };

  const handleRegenerateContent = async () => {
    if (!userId) return;
    setRegenerating(true);
    try {
      const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/regenerate-content`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Regeneration failed');
      toast.success('Content regenerated with download page link');
      void load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to regenerate content');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <TeacherLayout>
      <div className="space-y-5">
        <button
          onClick={() => navigate('/teacher/lessons')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('lessons.backToLessons')}
        </button>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('lessons.manage')}</h1>
            <p className="text-sm text-slate-500 mt-1">{lessonTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {(lessonTitle.includes('Audio') || lessonTitle.includes('Video')) && (
              <button
                onClick={() => void handleRegenerateContent()}
                disabled={regenerating}
                title="Regenerate download page content"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 text-sm font-semibold hover:bg-teal-100 disabled:opacity-50 transition-all"
              >
                {regenerating
                  ? <span className="w-4 h-4 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                  : <RotateCcw className="w-4 h-4" />}
                Regenerate
              </button>
            )}
            <button
              onClick={() => void addItem()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              {t('lessons.addContentItem')}
            </button>
          </div>
        </div>

        {/* Headway Resources Panel */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <button
            onClick={() => setShowHeadway(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
                <Globe className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">Headway Resources</p>
                <p className="text-xs text-slate-400">Audio &amp; Video inline player + OUP links</p>
              </div>
            </div>
            {showHeadway
              ? <ChevronDown className="w-4 h-4 text-slate-400" />
              : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>
          {showHeadway && (
            <div className="border-t border-slate-100">
              {/* Controls row */}
              <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-slate-50">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 shrink-0">Level:</label>
                  <select
                    value={headwayLevel}
                    onChange={e => { setHeadwayLevel(e.target.value); setHeadwayUnit(1); }}
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
                    value={headwayUnit}
                    onChange={e => setHeadwayUnit(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                    {Array.from({ length: headwayLevel === 'beg' ? 14 : 12 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>Unit {n}</option>
                    ))}
                  </select>
                </div>
                {/* Tab switcher */}
                <div className="ml-auto flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
                  {([
                    { id: 'audio', icon: '🎧', label: 'Audio' },
                    { id: 'video', icon: '🎬', label: 'Video' },
                    { id: 'links', icon: '🔗', label: 'Links' },
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setHeadwayTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        headwayTab === tab.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{tab.icon}</span> {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio tab */}
              {headwayTab === 'audio' && (
                <div className="px-5 pb-5 pt-3">
                  <div
                    className="rounded-2xl border-2 border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 flex flex-col items-center justify-center gap-5 py-10 px-6 text-center"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                      <Headphones className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800">OUP Headway Audio</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Unit <strong>{headwayUnit}</strong> — Student's Book Audio Player
                      </p>
                      <p className="text-xs text-slate-400 mt-2">
                        Opens the OUP audio player in a new tab. Scroll to Unit {headwayUnit} and press ▶ to listen.
                      </p>
                    </div>
                    <a
                      href={`${OUP_BASE}/${headwayLevel}/audiodl${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200"
                    >
                      <Headphones className="w-4 h-4" /> Open Audio Player
                    </a>
                    <p className="text-[10px] text-slate-400">
                      OUP blocks embedded playback — the player works only when opened directly in a tab.
                    </p>
                  </div>
                </div>
              )}

              {/* Video tab */}
              {headwayTab === 'video' && (
                <div className="px-5 pb-5 pt-3">
                  <div
                    className="rounded-2xl border-2 border-dashed border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 flex flex-col items-center justify-center gap-5 py-10 px-6 text-center"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-200">
                      <Video className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800">OUP Headway Video</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Unit <strong>{headwayUnit}</strong> — Video clips with script &amp; tasks
                      </p>
                      <p className="text-xs text-slate-400 mt-2">
                        Opens the OUP video page in a new tab. Find Unit {headwayUnit} and press ▶ to watch.
                      </p>
                    </div>
                    <a
                      href={`${OUP_BASE}/${headwayLevel}/video_bandw${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition-colors shadow-md shadow-rose-200"
                    >
                      <Video className="w-4 h-4" /> Open Video Player
                    </a>
                    <p className="text-[10px] text-slate-400">
                      OUP blocks embedded playback — the player works only when opened directly in a tab.
                    </p>
                  </div>
                </div>
              )}

              {/* Links tab — quick external links */}
              {headwayTab === 'links' && (
                <div className="px-5 pb-5 pt-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <a
                      href={`${OUP_BASE}/${headwayLevel}/testbuilder${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-all group border border-emerald-100 text-center"
                    >
                      <BookOpen className="w-5 h-5 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700">Test Builder</span>
                      <ExternalLink className="w-3 h-3 text-emerald-400 group-hover:text-emerald-600" />
                    </a>
                    <a
                      href={`${OUP_BASE}/${headwayLevel}/audiodl${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-all group border border-indigo-100 text-center"
                    >
                      <Headphones className="w-5 h-5 text-indigo-600" />
                      <span className="text-xs font-bold text-indigo-700">Audio DL</span>
                      <ExternalLink className="w-3 h-3 text-indigo-400 group-hover:text-indigo-600" />
                    </a>
                    <a
                      href={`${OUP_BASE}/${headwayLevel}/video_bandw${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 transition-all group border border-rose-100 text-center"
                    >
                      <Video className="w-5 h-5 text-rose-600" />
                      <span className="text-xs font-bold text-rose-700">Video</span>
                      <ExternalLink className="w-3 h-3 text-rose-400 group-hover:text-rose-600" />
                    </a>
                    <a
                      href={`${OUP_BASE}/${headwayLevel}/grammar${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-all group border border-amber-100 text-center"
                    >
                      <BookOpen className="w-5 h-5 text-amber-600" />
                      <span className="text-xs font-bold text-amber-700">Grammar</span>
                      <ExternalLink className="w-3 h-3 text-amber-400 group-hover:text-amber-600" />
                    </a>
                  </div>
                  <p className="text-xs text-slate-400">
                    Tip: Copy any OUP URL and use the <strong>Link</strong> content type below to add it directly to this lesson for students.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
            {t('lessons.noContentItems')}
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void handleDropReorder(index)}
                className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                  <select
                    value={item.type}
                    onChange={(e) => setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, type: e.target.value as ContentType } : x))}
                    className="ml-2 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  >
                    {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (index === 0) return;
                        const re = moveItem(sorted, index, index - 1).map((x, idx) => ({ ...x, position: idx + 1 }));
                        setItems(re);
                        await saveOrder(re);
                      }}
                      className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (index >= sorted.length - 1) return;
                        const re = moveItem(sorted, index, index + 1).map((x, idx) => ({ ...x, position: idx + 1 }));
                        setItems(re);
                        await saveOrder(re);
                      }}
                      className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => void removeItem(item.id)}
                      className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={item.title || ''}
                    onChange={(e) => setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, title: e.target.value } : x))}
                    placeholder={t('lessons.contentTitle')}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                  <input
                    value={item.description || ''}
                    onChange={(e) => setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, description: e.target.value } : x))}
                    placeholder={t('lessons.description')}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                </div>

                {item.type === 'text' ? (
                  <textarea
                    value={item.text_content || ''}
                    onChange={(e) => setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, text_content: e.target.value } : x))}
                    rows={4}
                    placeholder={t('lessons.richTextContent')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                ) : item.type === 'link' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-500">URL</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="url"
                          value={item.storage_path || ''}
                          onChange={(e) => setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, storage_path: e.target.value } : x))}
                          placeholder="https://elt.oup.com/student/headway/..."
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm"
                        />
                      </div>
                      {item.storage_path && (
                        <a
                          href={item.storage_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 transition-colors shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">{t('lessons.file')}</label>
                      <label className={cn(
                        'w-full px-3 py-3 rounded-lg border border-dashed text-sm flex items-center gap-2 cursor-pointer',
                        uploadingId === item.id ? 'opacity-60 pointer-events-none' : 'hover:bg-slate-50'
                      )}>
                        <UploadCloud className="w-4 h-4" />
                        {uploadingId === item.id ? t('lessons.uploading') : t('lessons.uploadFile')}
                        <input
                          type="file"
                          accept={item.type === 'video' ? 'video/*' : item.type === 'audio' ? 'audio/*' : 'application/pdf'}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void onUpload(item, file);
                          }}
                        />
                      </label>
                      {item.storage_path && <p className="text-xs text-slate-400 mt-1 break-all">{item.storage_path}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        {item.type === 'pdf' ? t('lessons.startPage') : t('lessons.durationSec')}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={item.type === 'pdf' ? (item.pdf_page || 1) : (item.duration_seconds || 0)}
                        onChange={(e) => setItems((prev) => prev.map((x) => x.id === item.id
                          ? item.type === 'pdf'
                            ? { ...x, pdf_page: Number(e.target.value) }
                            : { ...x, duration_seconds: Number(e.target.value) }
                          : x))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => void updateItem(item)}
                    disabled={savingId === item.id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {savingId === item.id ? t('lessons.saving') : t('lessons.saveItem')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
