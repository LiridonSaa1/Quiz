import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { authFetch } from '../../lib/apiUrl';
import { supabase } from '../../supabase';
import { ArrowLeft, GripVertical, Plus, Save, Trash2, UploadCloud, ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

type ContentType = 'video' | 'audio' | 'pdf' | 'text';

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

const CONTENT_TYPES: ContentType[] = ['video', 'audio', 'pdf', 'text'];

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

        <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('lessons.manage')}</h1>
            <p className="text-sm text-slate-500 mt-1">{lessonTitle}</p>
          </div>
          <button
            onClick={() => void addItem()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            {t('lessons.addContentItem')}
          </button>
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
