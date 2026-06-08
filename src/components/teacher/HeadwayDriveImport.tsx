import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CloudDownload, CheckCircle2, AlertCircle, Loader2, Play, Pause,
  Trash2, Volume2, Film, Music, RefreshCw, ChevronDown, ChevronRight,
  Key, HardDrive, Layers, AlertTriangle,
} from 'lucide-react';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface Course {
  id: string;
  title: string;
  level?: string | null;
}

interface DriveMedia {
  id: string;
  level: string;
  unit_number: number | null;
  type: 'student_audio' | 'workbook_audio' | 'video';
  title: string | null;
  file_name: string | null;
  drive_file_id: string;
  url: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface ImportJob {
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  skipped: number;
  errors: string[];
  logs: string[];
}

const TYPE_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  student_audio: { label: "Student's Book Audio", color: 'text-violet-700 bg-violet-50 border-violet-200', icon: Music },
  workbook_audio: { label: 'Workbook Audio', color: 'text-teal-700 bg-teal-50 border-teal-200', icon: Volume2 },
  video: { label: 'Video', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Film },
};

/** Levels with configured Drive folders */
const CONFIGURED_LEVELS = [
  {
    key: 'Beginner',
    units: 14,
    color: 'from-emerald-500 to-teal-600',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    folders: {
      student_audio: '12Mmg0fjHxRhglHgKag9bP5QGGo7sNkx-',
      workbook_audio: '1jX0bv2qQDRyhedO7qfvu5yjb97qDazQu',
      video: '15HmRs-8kRI4C1Uzp5iwz-TE4c02lEuCc',
    },
  },
  {
    key: 'Elementary',
    units: 12,
    color: 'from-sky-500 to-blue-600',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    folders: {
      student_audio: '1bJpdL3tkWRlIQKS2lp9ZvKBm-SHrahUE',
      workbook_audio: '1bwL0ANh1IR-YXzc9y53r9wRXEUAw7dkj',
      video: '1DO4J5r-7HnytBb4UArIPnPjZTX60GPZm',
    },
  },
  {
    key: 'Pre-Intermediate',
    units: 12,
    color: 'from-violet-500 to-purple-600',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    folders: {
      student_audio: '1-MS0Eu2-uXELtasjK23r5wpIxSYw13WZ',
      workbook_audio: '1pmBAkEVHE8E0NlZoaZf7VZKrhCUAK5yL',
      video: '1tl7tpMoajGSOX1y6G1Y3-OvvZtnFgnCH',
    },
  },
];

const FOLDER_META = [
  { type: 'student_audio', label: "Student's Book Audio", icon: '📗' },
  { type: 'workbook_audio', label: 'Workbook Audio', icon: '📘' },
  { type: 'video', label: 'Video Clips', icon: '🎬' },
] as const;

function formatBytes(b: number | null): string {
  if (!b) return '';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function AudioRow({ m }: { m: DriveMedia }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const ref = useRef<HTMLAudioElement>(null);
  const streamUrl = m.url || `/api/teacher/headway/drive-stream/${encodeURIComponent(m.drive_file_id)}`;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { void ref.current.play(); setPlaying(true); }
  };
  return (
    <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
      <button onClick={toggle}
        className="w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shrink-0 transition-colors">
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 truncate mb-1">
          {m.title || m.file_name?.replace(/\.[^.]+$/, '') || 'Audio Track'}
        </p>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={duration || 1} step={0.1} value={progress}
            onChange={e => { if (ref.current) ref.current.currentTime = Number(e.target.value); }}
            className="flex-1 h-1 accent-violet-600 cursor-pointer" />
          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{fmt(progress)}/{fmt(duration)}</span>
        </div>
      </div>
      {m.size_bytes && <span className="text-[10px] text-slate-400 shrink-0">{formatBytes(m.size_bytes)}</span>}
      <audio ref={ref} src={streamUrl} preload="none"
        onLoadedMetadata={() => setDuration(ref.current?.duration ?? 0)}
        onTimeUpdate={() => setProgress(ref.current?.currentTime ?? 0)}
        onEnded={() => setPlaying(false)} />
    </div>
  );
}

function VideoRow({ m }: { m: DriveMedia }) {
  const streamUrl = m.url || `/api/teacher/headway/drive-stream/${encodeURIComponent(m.drive_file_id)}`;
  return (
    <div className="rounded-xl overflow-hidden border border-rose-100 bg-rose-50">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-rose-100">
        <Film className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <p className="text-xs font-semibold text-slate-700 truncate flex-1">
          {m.title || m.file_name?.replace(/\.[^.]+$/, '') || 'Video Clip'}
        </p>
        {m.size_bytes && <span className="text-[10px] text-slate-400 shrink-0">{formatBytes(m.size_bytes)}</span>}
      </div>
      <video controls src={streamUrl} preload="none"
        className="w-full max-h-64 bg-black" style={{ display: 'block' }} />
    </div>
  );
}

export default function HeadwayDriveImport() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [selectedLevel, setSelectedLevel] = useState(CONFIGURED_LEVELS[0]);
  const [media, setMedia] = useState<DriveMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [importing, setImporting] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  // Course picker
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkConfig = useCallback(async () => {
    try {
      const res = await authFetch('/api/teacher/headway/drive-config');
      const json = await res.json();
      setConfigured(Boolean(json.configured));
    } catch { setConfigured(false); }
  }, []);

  const loadMedia = useCallback(async (level?: string) => {
    setLoadingMedia(true);
    const lvl = level ?? selectedLevel.key;
    try {
      const res = await authFetch(`/api/teacher/headway/drive-media?level=${encodeURIComponent(lvl)}`);
      if (res.ok) {
        const json = await res.json();
        setMedia(Array.isArray(json.media) ? json.media : []);
      }
    } catch { /* ignore */ } finally {
      setLoadingMedia(false);
    }
  }, [selectedLevel.key]);

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const { supabase } = await import('../../supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const res = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`);
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json.courses ?? json.data ?? []);
        setCourses(list);
      }
    } catch { /* ignore */ } finally {
      setLoadingCourses(false);
    }
  }, []);

  useEffect(() => {
    void checkConfig();
    void loadMedia();
    void loadCourses();
  }, [checkConfig, loadMedia, loadCourses]);

  // Reload media when level changes
  useEffect(() => {
    setExpandedUnits(new Set());
    void loadMedia(selectedLevel.key);
  }, [selectedLevel.key]);

  useEffect(() => {
    if (logsEndRef.current && job?.logs?.length) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [job?.logs?.length]);

  const pollJob = useCallback(async (id: string) => {
    try {
      const res = await authFetch(`/api/teacher/headway/drive-import/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const j: ImportJob = await res.json();
      setJob(j);
      if (j.status === 'done' || j.status === 'error') {
        if (pollRef.current) clearInterval(pollRef.current);
        setImporting(false);
        if (j.status === 'done') {
          toast.success(`Import complete — ${j.done} files imported, ${j.skipped} skipped`);
          void loadMedia(selectedLevel.key);
        } else {
          toast.error('Import finished with errors');
        }
      }
    } catch { /* ignore */ }
  }, [loadMedia, selectedLevel.key]);

  const startImport = async () => {
    setImporting(true);
    setJob(null);
    setJobId(null);
    try {
      const body: Record<string, string> = { level: selectedLevel.key };
      if (selectedCourseId) body.courseId = selectedCourseId;
      const res = await authFetch('/api/teacher/headway/drive-import/start', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to start import');
      const id: string = json.jobId;
      setJobId(id);
      pollRef.current = setInterval(() => void pollJob(id), 2000);
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
      setImporting(false);
    }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const deleteMedia = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    setDeletingId(id);
    try {
      const res = await authFetch(`/api/teacher/headway/drive-media/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json())?.error || 'Delete failed');
      toast.success('Deleted');
      setMedia(prev => prev.filter(m => m.id !== id));
    } catch (err: any) {
      toast.error(err?.message);
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAllMedia = async () => {
    setDeletingAll(true);
    try {
      const res = await authFetch(
        `/api/teacher/headway/drive-media?level=${encodeURIComponent(selectedLevel.key)}`,
        { method: 'DELETE', headers: { 'x-confirm-delete-all': 'yes' } }
      );
      if (!res.ok) throw new Error((await res.json())?.error || 'Delete failed');
      toast.success(`All ${selectedLevel.key} media deleted`);
      setMedia([]);
      setConfirmDeleteAll(false);
    } catch (err: any) {
      toast.error(err?.message);
    } finally {
      setDeletingAll(false);
    }
  };

  const toggleUnit = (key: string) =>
    setExpandedUnits(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const grouped = (() => {
    const map = new Map<number, DriveMedia[]>();
    for (const m of media) {
      const u = m.unit_number ?? 0;
      if (!map.has(u)) map.set(u, []);
      map.get(u)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  })();

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-md">
            <HardDrive className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">Google Drive Import</h2>
            <p className="text-xs text-slate-500">Import Headway audio &amp; video from your Drive folders</p>
          </div>
        </div>
        <button onClick={() => void loadMedia(selectedLevel.key)}
          disabled={loadingMedia}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw className={cn('w-3.5 h-3.5', loadingMedia && 'animate-spin')} />
          Refresh Library
        </button>
      </div>

      {/* ── Level selector ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Level:</span>
        {CONFIGURED_LEVELS.map(lvl => (
          <button
            key={lvl.key}
            onClick={() => setSelectedLevel(lvl)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
              selectedLevel.key === lvl.key
                ? `bg-gradient-to-r ${lvl.color} text-white border-transparent shadow-sm`
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            {lvl.key}
          </button>
        ))}
      </div>

      {/* ── API Key setup notice ── */}
      {configured === false && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <Key className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">GOOGLE_API_KEY required</p>
            <p className="text-xs text-amber-700 mt-1">
              Add <code className="bg-amber-100 px-1 rounded font-mono">GOOGLE_API_KEY</code> to Replit Secrets (Secrets tab).
              The key must have <strong>Google Drive API</strong> enabled.
              Get a free key at <a href="https://console.developers.google.com" target="_blank" rel="noopener noreferrer" className="underline">console.developers.google.com</a>.
            </p>
          </div>
        </div>
      )}

      {/* ── Import panel ── */}
      {configured !== false && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">{selectedLevel.key} — Drive Sources</h3>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', selectedLevel.badge)}>
              {selectedLevel.units} Units
            </span>
          </div>

          {/* Folder cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FOLDER_META.map(f => {
              const folderId = selectedLevel.folders[f.type];
              const count = media.filter(m => m.type === f.type).length;
              return (
                <div key={f.type}
                  className={cn(
                    'p-4 rounded-2xl border',
                    count > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'
                  )}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{f.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800">{f.label}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{folderId.slice(0, 18)}…</p>
                    </div>
                  </div>
                  {count > 0
                    ? <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{count} files imported</p>
                    : <p className="text-[11px] text-slate-400">Not imported yet</p>}
                </div>
              );
            })}
          </div>

          {/* Progress */}
          {job && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>{job.status === 'running' ? '⟳ Importing…' : job.status === 'done' ? '✓ Done' : '✗ Error'}</span>
                <span>{job.done}/{job.total} files</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${job.status === 'error' ? 'bg-red-500' : 'bg-indigo-500'}`}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <div className="flex gap-4 text-[11px] text-slate-500">
                <span className="text-emerald-600 font-semibold">✓ {job.done} imported</span>
                <span className="text-slate-500">↷ {job.skipped} skipped</span>
                {job.errors.length > 0 && <span className="text-red-500">✗ {job.errors.length} errors</span>}
              </div>
              {job.logs.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-slate-900 rounded-xl p-3 font-mono text-[10px] space-y-0.5">
                  {job.logs.map((log, i) => (
                    <p key={i} className={cn(
                      'leading-relaxed',
                      log.startsWith('✓') ? 'text-emerald-400' :
                      log.startsWith('↷') ? 'text-slate-400' :
                      log.startsWith('✗') ? 'text-red-400' :
                      'text-slate-300'
                    )}>{log}</p>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          )}

          {/* ── Course picker ── */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span>📚</span> Lidho me kurs (opsionale)
            </label>
            <div className="relative">
              {loadingCourses ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Duke ngarkuar kurset…
                </div>
              ) : (
                <select
                  value={selectedCourseId}
                  onChange={e => setSelectedCourseId(e.target.value)}
                  disabled={importing}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition disabled:opacity-60 appearance-none cursor-pointer">
                  <option value="">— Pa kurs (import i lirë) —</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title}{c.level ? ` · ${c.level}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedCourseId && (
              <p className="text-[11px] text-indigo-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Media do të lidhet me kursin e zgjedhur
              </p>
            )}
          </div>

          <button
            onClick={() => void startImport()}
            disabled={importing || configured === false}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing {selectedLevel.key}…</>
              : <><CloudDownload className="w-4 h-4" /> {media.length > 0 ? `Re-import ${selectedLevel.key} from Google Drive` : `Import ${selectedLevel.key} from Google Drive`}</>}
          </button>
          {media.length > 0 && !importing && (
            <p className="text-center text-[11px] text-slate-400">
              Re-importing skips existing files automatically (no duplicates)
            </p>
          )}
        </div>
      )}

      {/* ── Media Library ── */}
      {media.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-black text-slate-800">Media Library</h3>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', selectedLevel.badge)}>
              {media.length} files · {selectedLevel.key}
            </span>
            <div className="ml-auto">
              {!confirmDeleteAll ? (
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  disabled={deletingAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete All {selectedLevel.key}
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="text-xs font-semibold text-red-700">Fshi të gjitha {media.length} skedarët?</span>
                  <button
                    onClick={() => void deleteAllMedia()}
                    disabled={deletingAll}
                    className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-1">
                    {deletingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Po, fshi
                  </button>
                  <button
                    onClick={() => setConfirmDeleteAll(false)}
                    disabled={deletingAll}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    Anulo
                  </button>
                </div>
              )}
            </div>
          </div>

          {loadingMedia ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading library…
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.map(([unitNum, files]) => {
                const key = String(unitNum);
                const isOpen = expandedUnits.has(key);
                const audioFiles = files.filter(f => f.type !== 'video');
                const videoFiles = files.filter(f => f.type === 'video');
                return (
                  <div key={key} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                    <button
                      onClick={() => toggleUnit(key)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-8 h-8 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0', selectedLevel.color)}>
                          <span className="text-white text-xs font-black">{unitNum === 0 ? '?' : unitNum}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-800">
                            {unitNum === 0 ? 'Unknown Unit' : `Unit ${unitNum}`}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {audioFiles.length > 0 && (
                              <span className="text-[10px] font-semibold text-violet-600">
                                🎧 {audioFiles.length} audio
                              </span>
                            )}
                            {videoFiles.length > 0 && (
                              <span className="text-[10px] font-semibold text-rose-600">
                                🎬 {videoFiles.length} video
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-slate-100">
                          <div className="p-4 space-y-4">
                            {(['student_audio', 'workbook_audio', 'video'] as const).map(type => {
                              const typeFiles = files.filter(f => f.type === type);
                              if (typeFiles.length === 0) return null;
                              const meta = TYPE_LABELS[type];
                              const Icon = meta.icon;
                              return (
                                <div key={type} className="space-y-2">
                                  <div className="flex items-center gap-1.5">
                                    <Icon className="w-3.5 h-3.5" />
                                    <span className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border', meta.color)}>
                                      {meta.label} · {typeFiles.length}
                                    </span>
                                  </div>
                                  {typeFiles.map(m => (
                                    <div key={m.id} className="flex items-start gap-2 group">
                                      <div className="flex-1 min-w-0">
                                        {m.type === 'video'
                                          ? <VideoRow m={m} />
                                          : <AudioRow m={m} />}
                                      </div>
                                      <button
                                        onClick={() => void deleteMedia(m.id, m.title || m.file_name || 'file')}
                                        disabled={deletingId === m.id}
                                        className="mt-1 w-7 h-7 rounded-lg bg-slate-50 hover:bg-red-50 border border-slate-100 hover:border-red-200 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                                        {deletingId === m.id
                                          ? <Loader2 className="w-3 h-3 animate-spin" />
                                          : <Trash2 className="w-3 h-3" />}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loadingMedia && media.length === 0 && configured !== false && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <CloudDownload className="w-10 h-10 text-slate-200" />
          <p className="text-sm font-bold text-slate-400">No media imported yet for {selectedLevel.key}</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Click "Import from Google Drive" above to pull all {selectedLevel.key} audio and video files.
          </p>
        </div>
      )}

      {configured === null && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
        </div>
      )}

      {/* Error list */}
      {job?.errors && job.errors.length > 0 && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-xs font-bold text-red-700">{job.errors.length} import error{job.errors.length > 1 ? 's' : ''}</p>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {job.errors.map((e, i) => (
              <p key={i} className="text-[11px] text-red-600 font-mono">{e}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
