import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CloudDownload, CheckCircle2, AlertCircle, Loader2, Play, Pause,
  Trash2, Volume2, Film, Music, RefreshCw, ChevronDown, ChevronRight,
  Key, HardDrive, Layers,
} from 'lucide-react';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

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
  const streamUrl = `/api/teacher/headway/drive-stream/${encodeURIComponent(m.drive_file_id)}`;
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
  const streamUrl = `/api/teacher/headway/drive-stream/${encodeURIComponent(m.drive_file_id)}`;
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
  const [media, setMedia] = useState<DriveMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [importing, setImporting] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkConfig = useCallback(async () => {
    try {
      const res = await authFetch('/api/teacher/headway/drive-config');
      const json = await res.json();
      setConfigured(Boolean(json.configured));
    } catch { setConfigured(false); }
  }, []);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const res = await authFetch('/api/teacher/headway/drive-media?level=Beginner');
      if (res.ok) {
        const json = await res.json();
        setMedia(Array.isArray(json.media) ? json.media : []);
      }
    } catch { /* ignore */ } finally {
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    void checkConfig();
    void loadMedia();
  }, [checkConfig, loadMedia]);

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
          void loadMedia();
        } else {
          toast.error('Import finished with errors');
        }
      }
    } catch { /* ignore */ }
  }, [loadMedia]);

  const startImport = async () => {
    setImporting(true);
    setJob(null);
    setJobId(null);
    try {
      const res = await authFetch('/api/teacher/headway/drive-import/start', {
        method: 'POST',
        body: JSON.stringify({ level: 'Beginner' }),
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
        <button onClick={() => void loadMedia()}
          disabled={loadingMedia}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw className={cn('w-3.5 h-3.5', loadingMedia && 'animate-spin')} />
          Refresh Library
        </button>
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
            <h3 className="text-sm font-bold text-slate-800">Beginner Level — Drive Sources</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              14 Units
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { type: 'student_audio', label: "Student's Book Audio", icon: '📗', folderId: '12Mmg0fjHxRhglHgKag9bP5QGGo7sNkx-', accent: 'violet' },
              { type: 'workbook_audio', label: 'Workbook Audio', icon: '📘', folderId: '1jX0bv2qQDRyhedO7qfvu5yjb97qDazQu', accent: 'teal' },
              { type: 'video', label: 'Video Clips', icon: '🎬', folderId: '15HmRs-8kRI4C1Uzp5iwz-TE4c02lEuCc', accent: 'rose' },
            ].map(s => {
              const count = media.filter(m => m.type === s.type).length;
              return (
                <div key={s.type}
                  className={`p-4 rounded-2xl border ${count > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{s.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{s.label}</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">{s.folderId.slice(0, 20)}…</p>
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

          <button
            onClick={() => void startImport()}
            disabled={importing || configured === false}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
              : <><CloudDownload className="w-4 h-4" /> {media.length > 0 ? 'Re-import from Google Drive' : 'Import from Google Drive'}</>}
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
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
              {media.length} files · Beginner
            </span>
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
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
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
          <p className="text-sm font-bold text-slate-400">No media imported yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Click "Import from Google Drive" above to pull all Beginner audio and video files.
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
