import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { authFetch } from '../../lib/apiUrl';
import { supabase } from '../../supabase';
import {
  ArrowLeft, GripVertical, Plus, Save, Trash2, UploadCloud,
  ArrowDown, ArrowUp, RotateCcw, ExternalLink, Link2,
  FileText, Video, Headphones, FileImage, Type, Hash,
} from 'lucide-react';
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

const CONTENT_TYPES: { value: ContentType; label: string; icon: React.ReactNode; color: string; bg: string; border: string }[] = [
  { value: 'text',  label: 'Text',  icon: <Type className="w-3.5 h-3.5" />,        color: 'text-slate-700',  bg: 'bg-slate-100',   border: 'border-slate-200' },
  { value: 'video', label: 'Video', icon: <Video className="w-3.5 h-3.5" />,       color: 'text-rose-700',   bg: 'bg-rose-50',     border: 'border-rose-200' },
  { value: 'audio', label: 'Audio', icon: <Headphones className="w-3.5 h-3.5" />,  color: 'text-violet-700', bg: 'bg-violet-50',   border: 'border-violet-200' },
  { value: 'pdf',   label: 'PDF',   icon: <FileImage className="w-3.5 h-3.5" />,   color: 'text-orange-700', bg: 'bg-orange-50',   border: 'border-orange-200' },
  { value: 'link',  label: 'Link',  icon: <Link2 className="w-3.5 h-3.5" />,       color: 'text-indigo-700', bg: 'bg-indigo-50',   border: 'border-indigo-200' },
];

const TYPE_ACCENT: Record<ContentType, { bar: string; badge: string; badgeText: string }> = {
  text:  { bar: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-700 border-slate-200',   badgeText: 'Text' },
  video: { bar: 'bg-rose-500',   badge: 'bg-rose-50 text-rose-700 border-rose-200',       badgeText: 'Video' },
  audio: { bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 border-violet-200', badgeText: 'Audio' },
  pdf:   { bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200', badgeText: 'PDF' },
  link:  { bar: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', badgeText: 'Link' },
};

const moveItem = <T extends object>(arr: T[], from: number, to: number) => {
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
  const [lessonTitle, setLessonTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LessonContentRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [items]
  );

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) { setLoading(false); return; }
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

  useEffect(() => { void load(); }, [lessonId, t]);

  const addItem = async () => {
    if (!userId) return;
    const nextPosition = sorted.length + 1;
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents`, {
      method: 'POST',
      body: JSON.stringify({ userId, type: 'text', title: `Content ${nextPosition}`, text_content: '', position: nextPosition }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) { toast.error(json?.error || t('lessons.failedToSaveContentItem')); return; }
    setItems(prev => [...prev, json.content]);
    toast.success(t('lessons.contentItemCreated'));
  };

  const updateItem = async (item: LessonContentRow) => {
    if (!userId) return;
    setSavingId(item.id);
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        userId, type: item.type, title: item.title, description: item.description,
        text_content: item.text_content, pdf_page: item.pdf_page,
        duration_seconds: item.duration_seconds, storage_path: item.storage_path,
        mime_type: item.mime_type, size_bytes: item.size_bytes, position: item.position,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingId(null);
    if (!res.ok || !json?.success) { toast.error(json?.error || t('lessons.failedToSaveContentItem')); return; }
    setItems(prev => prev.map(x => x.id === item.id ? json.content : x));
    toast.success(t('lessons.saved'));
  };

  const removeItem = async (id: string) => {
    if (!userId) return;
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) { toast.error(json?.error || t('lessons.failedToDeleteContentItem')); return; }
    const next = sorted.filter(x => x.id !== id).map((x, idx) => ({ ...x, position: idx + 1 }));
    setItems(next);
    await saveOrder(next);
    toast.success(t('lessons.deleted'));
  };

  const saveOrder = async (current: LessonContentRow[]) => {
    if (!userId) return;
    const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ userId, orderedIds: current.map(x => x.id) }),
    });
    if (!res.ok) { const json = await res.json().catch(() => ({})); toast.error(json?.error || t('lessons.failedToSaveOrder')); }
  };

  const onUpload = async (item: LessonContentRow, file: File) => {
    if (!userId) return;
    setUploadingId(item.id);
    const urlRes = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/contents/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ userId, fileName: file.name, contentType: file.type || 'application/octet-stream' }),
    });
    const urlJson = await urlRes.json().catch(() => ({}));
    if (!urlRes.ok || !urlJson?.signedUrl || !urlJson?.storagePath) {
      setUploadingId(null); toast.error(urlJson?.error || 'Failed to request upload URL'); return;
    }
    const putRes = await fetch(urlJson.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    if (!putRes.ok) { setUploadingId(null); toast.error('Upload failed'); return; }
    const nextItem = { ...item, storage_path: String(urlJson.storagePath), mime_type: file.type || item.mime_type, size_bytes: file.size };
    await updateItem(nextItem);
    setUploadingId(null);
    toast.success('Uploaded');
  };

  const handleDropReorder = async (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) { setDragIndex(null); setDragOver(null); return; }
    const re = moveItem(sorted, dragIndex, toIndex).map((x, idx) => ({ ...x, position: idx + 1 })) as LessonContentRow[];
    setItems(re);
    setDragIndex(null);
    setDragOver(null);
    await saveOrder(re);
  };

  const handleRegenerateContent = async () => {
    if (!userId) return;
    setRegenerating(true);
    try {
      const res = await authFetch(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/regenerate-content`, { method: 'POST', body: JSON.stringify({ userId }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Regeneration failed');
      toast.success('Content regenerated');
      void load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to regenerate content');
    } finally {
      setRegenerating(false);
    }
  };

  const patchItem = (id: string, patch: Partial<LessonContentRow>) =>
    setItems(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));

  return (
    <TeacherLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">

        {/* Breadcrumb */}
        <button
          onClick={() => navigate('/teacher/lessons')}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Lessons
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">Lesson Content</p>
              <h1 className="text-2xl font-bold truncate">{lessonTitle || 'Loading…'}</h1>
              <p className="text-indigo-200 text-sm mt-1">
                {loading ? 'Loading items…' : `${sorted.length} item${sorted.length !== 1 ? 's' : ''} · drag to reorder`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(lessonTitle.includes('Audio') || lessonTitle.includes('Video')) && (
                <button
                  onClick={() => void handleRegenerateContent()}
                  disabled={regenerating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold disabled:opacity-50 transition-all"
                >
                  {regenerating
                    ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    : <RotateCcw className="w-4 h-4" />}
                  Regenerate
                </button>
              )}
              <button
                onClick={() => void addItem()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-700 text-sm font-bold hover:bg-indigo-50 transition-all shadow-md"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-36 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-600 font-semibold text-base">No content yet</p>
            <p className="text-slate-400 text-sm mt-1">Click "Add Item" to start building this lesson.</p>
            <button
              onClick={() => void addItem()}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add First Item
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((item, index) => {
              const accent = TYPE_ACCENT[item.type] || TYPE_ACCENT.text;
              const isDraggingOver = dragOver === index && dragIndex !== null && dragIndex !== index;
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={e => { e.preventDefault(); setDragOver(index); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => void handleDropReorder(index)}
                  onDragEnd={() => { setDragIndex(null); setDragOver(null); }}
                  className={cn(
                    'bg-white rounded-2xl border transition-all duration-150 overflow-hidden',
                    isDraggingOver
                      ? 'border-indigo-400 shadow-lg shadow-indigo-100 scale-[1.01]'
                      : dragIndex === index
                      ? 'border-slate-300 opacity-50 shadow-none'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  )}
                >
                  {/* Coloured top bar */}
                  <div className={cn('h-1 w-full', accent.bar)} />

                  <div className="p-5 space-y-4">
                    {/* Top row: drag, number, type badge, move buttons, delete */}
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-slate-300 cursor-grab active:cursor-grabbing shrink-0" />

                      <span className="text-xs font-bold text-slate-400 w-5 text-center shrink-0">
                        {index + 1}
                      </span>

                      {/* Type pills */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {CONTENT_TYPES.map(ct => (
                          <button
                            key={ct.value}
                            onClick={() => patchItem(item.id, { type: ct.value })}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all',
                              item.type === ct.value
                                ? `${ct.bg} ${ct.color} ${ct.border} shadow-sm`
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                            )}
                          >
                            {ct.icon} {ct.label}
                          </button>
                        ))}
                      </div>

                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            if (index === 0) return;
                            const re = moveItem(sorted, index, index - 1).map((x, i) => ({ ...x, position: i + 1 })) as LessonContentRow[];
                            setItems(re); await saveOrder(re);
                          }}
                          disabled={index === 0}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-all"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (index >= sorted.length - 1) return;
                            const re = moveItem(sorted, index, index + 1).map((x, i) => ({ ...x, position: i + 1 })) as LessonContentRow[];
                            setItems(re); await saveOrder(re);
                          }}
                          disabled={index >= sorted.length - 1}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-all"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-slate-200 mx-1" />
                        <button
                          onClick={() => void removeItem(item.id)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Title & description */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Title</label>
                        <input
                          value={item.title || ''}
                          onChange={e => patchItem(item.id, { title: e.target.value })}
                          placeholder="Content title"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Description</label>
                        <input
                          value={item.description || ''}
                          onChange={e => patchItem(item.id, { description: e.target.value })}
                          placeholder="Optional description"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                        />
                      </div>
                    </div>

                    {/* Type-specific fields */}
                    {item.type === 'text' ? (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Content</label>
                        <textarea
                          value={item.text_content || ''}
                          onChange={e => patchItem(item.id, { text_content: e.target.value })}
                          rows={4}
                          placeholder="Write your text content here…"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all resize-y"
                        />
                      </div>
                    ) : item.type === 'link' ? (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">URL</label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              type="url"
                              value={item.storage_path || ''}
                              onChange={e => patchItem(item.id, { storage_path: e.target.value })}
                              placeholder="https://example.com/resource"
                              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                            />
                          </div>
                          {item.storage_path && (
                            <a
                              href={item.storage_path}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-200 shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Open
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Media preview */}
                        {item.signed_url && item.type === 'video' && (
                          <div className="rounded-xl overflow-hidden bg-black">
                            <video
                              src={item.signed_url}
                              controls
                              className="w-full max-h-72"
                            />
                          </div>
                        )}
                        {item.signed_url && item.type === 'audio' && (
                          <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
                            <audio src={item.signed_url} controls className="w-full" />
                          </div>
                        )}
                        {item.signed_url && item.type === 'pdf' && (
                          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-orange-50 border border-orange-100">
                            <FileImage className="w-4 h-4 text-orange-500 shrink-0" />
                            <span className="text-sm text-orange-700 flex-1 truncate">PDF uploaded</span>
                            <a
                              href={item.signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors shrink-0"
                            >
                              <ExternalLink className="w-3 h-3" /> Open
                            </a>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">File</label>
                            <label className={cn(
                              'w-full px-3.5 py-3 rounded-xl border-2 border-dashed text-sm flex items-center gap-2 cursor-pointer transition-all',
                              uploadingId === item.id
                                ? 'opacity-60 pointer-events-none border-slate-200 bg-slate-50'
                                : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                            )}>
                              <UploadCloud className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-500">
                                {uploadingId === item.id ? 'Uploading…' : item.storage_path ? 'Replace file' : 'Upload file'}
                              </span>
                              <input
                                type="file"
                                accept={item.type === 'video' ? 'video/*' : item.type === 'audio' ? 'audio/*' : 'application/pdf'}
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) void onUpload(item, f); }}
                              />
                            </label>
                            {item.storage_path && !item.signed_url && (
                              <p className="text-[11px] text-slate-400 mt-1.5 ml-1 truncate">{item.storage_path}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">
                              {item.type === 'pdf' ? 'Start Page' : 'Duration (sec)'}
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={item.type === 'pdf' ? (item.pdf_page || 1) : (item.duration_seconds || 0)}
                              onChange={e => patchItem(item.id, item.type === 'pdf'
                                ? { pdf_page: Number(e.target.value) }
                                : { duration_seconds: Number(e.target.value) }
                              )}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Save row */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-[11px] text-slate-400 font-mono">{item.id.slice(0, 8)}…</span>
                      </div>
                      <button
                        onClick={() => void updateItem(item)}
                        disabled={savingId === item.id}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all"
                      >
                        {savingId === item.id
                          ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          : <Save className="w-4 h-4" />}
                        {savingId === item.id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add more button at bottom */}
            <button
              onClick={() => void addItem()}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-sm font-semibold hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add another item
            </button>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
