import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Headphones, Video, Upload, Trash2, Loader2, Play, Pause,
  Volume2, VolumeX, AlertCircle, Music, Film,
} from 'lucide-react';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface MediaFile {
  name: string;
  path: string;
  url: string;
  type: 'audio' | 'video';
  size?: number;
}

interface HeadwayMediaSectionProps {
  levelSlug: string;
  levelKey: string;
  unitNum: number;
  accentColor: string;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AudioPlayer({ file }: { file: MediaFile }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { void ref.current.play(); setPlaying(true); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
      <button onClick={toggle}
        className="w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shrink-0 transition-colors">
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 truncate mb-1">{file.name.replace(/\.[^.]+$/, '')}</p>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={duration || 1} step={0.1} value={progress}
            onChange={e => { if (ref.current) ref.current.currentTime = Number(e.target.value); }}
            className="flex-1 h-1 accent-violet-600 cursor-pointer" />
          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
            {fmt(progress)}/{fmt(duration)}
          </span>
        </div>
      </div>
      <button onClick={() => { setMuted(m => !m); if (ref.current) ref.current.muted = !muted; }}
        className="text-slate-400 hover:text-violet-600 transition-colors shrink-0">
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <audio ref={ref} src={file.url} preload="metadata"
        onLoadedMetadata={() => setDuration(ref.current?.duration ?? 0)}
        onTimeUpdate={() => setProgress(ref.current?.currentTime ?? 0)}
        onEnded={() => setPlaying(false)} />
    </div>
  );
}

function VideoPlayer({ file }: { file: MediaFile }) {
  return (
    <div className="rounded-xl overflow-hidden border border-rose-100 bg-rose-50">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-rose-100">
        <Film className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <p className="text-xs font-semibold text-slate-700 truncate flex-1">{file.name.replace(/\.[^.]+$/, '')}</p>
        {file.size && <span className="text-[10px] text-slate-400 shrink-0">{formatSize(file.size)}</span>}
      </div>
      <video controls src={file.url} preload="metadata"
        className="w-full max-h-64 bg-black"
        style={{ display: 'block' }} />
    </div>
  );
}

export default function HeadwayMediaSection({ levelSlug, levelKey, unitNum, accentColor }: HeadwayMediaSectionProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/teacher/headway/media?levelSlug=${encodeURIComponent(levelSlug)}&unitNum=${unitNum}`);
      if (res.ok) {
        const json = await res.json();
        setFiles(json.files ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [levelSlug, unitNum]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'audio' | 'video') => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    e.target.value = '';
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(fileList)) {
      try {
        // Get signed upload URL
        const urlRes = await authFetch('/api/teacher/headway/media/upload-url', {
          method: 'POST',
          body: JSON.stringify({ levelSlug, unitNum, type: mediaType, filename: file.name }),
        });
        const urlJson = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlJson?.error || 'Failed to get upload URL');
        // Upload file directly to Supabase Storage
        const putRes = await fetch(urlJson.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || (mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4') },
          body: file,
        });
        if (!putRes.ok) throw new Error('Upload failed');
        uploaded++;
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err?.message}`);
      }
    }
    if (uploaded > 0) {
      toast.success(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded ✓`);
      await loadFiles();
    }
    setUploading(false);
  };

  const handleDelete = async (path: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    setDeletingPath(path);
    try {
      const res = await authFetch('/api/teacher/headway/media', {
        method: 'DELETE',
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Delete failed');
      }
      toast.success('File deleted');
      setFiles(prev => prev.filter(f => f.path !== path));
    } catch (err: any) {
      toast.error(err?.message);
    } finally {
      setDeletingPath(null);
    }
  };

  const audioFiles = files.filter(f => f.type === 'audio');
  const videoFiles = files.filter(f => f.type === 'video');

  return (
    <div className="border-t border-slate-100 mt-3 pt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: accentColor + '22' }}>
            <Volume2 className="w-3.5 h-3.5" style={{ color: accentColor }} />
          </div>
          <span className="text-xs font-bold text-slate-700">Unit Media</span>
          {files.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {files.length} file{files.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={audioInputRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
            multiple className="hidden" onChange={e => void handleUpload(e, 'audio')} />
          <input ref={videoInputRef} type="file" accept="video/*,.mp4,.webm,.mov,.avi,.mkv"
            multiple className="hidden" onChange={e => void handleUpload(e, 'video')} />
          <button
            onClick={() => audioInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors disabled:opacity-50">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Headphones className="w-3 h-3" />}
            Audio
          </button>
          <button
            onClick={() => videoInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
            Video
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading media…
        </div>
      ) : files.length === 0 ? (
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          <Upload className="w-4 h-4 text-slate-300 shrink-0" />
          <p className="text-xs text-slate-400">
            Upload audio (MP3, WAV) or video (MP4, MOV) files to play them directly in the platform.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Audio files */}
          {audioFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Music className="w-3 h-3 text-violet-500" />
                <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">Audio · {audioFiles.length}</span>
              </div>
              {audioFiles.map(f => (
                <div key={f.path} className="flex items-start gap-2 group">
                  <div className="flex-1 min-w-0">
                    <AudioPlayer file={f} />
                  </div>
                  <button
                    onClick={() => void handleDelete(f.path, f.name)}
                    disabled={deletingPath === f.path}
                    className="mt-1 w-7 h-7 rounded-lg bg-slate-50 hover:bg-red-50 border border-slate-100 hover:border-red-200 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                    {deletingPath === f.path
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Video files */}
          {videoFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Film className="w-3 h-3 text-rose-500" />
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wide">Video · {videoFiles.length}</span>
              </div>
              {videoFiles.map(f => (
                <div key={f.path} className="group">
                  <div className="relative">
                    <VideoPlayer file={f} />
                    <button
                      onClick={() => void handleDelete(f.path, f.name)}
                      disabled={deletingPath === f.path}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white/80 hover:bg-red-50 border border-slate-100 hover:border-red-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      {deletingPath === f.path
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
