import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  Video, Mic, MicOff, VideoOff, MonitorStop, Circle,
  StopCircle, Download, Upload, ChevronLeft, Users,
  Clock, BookOpen, Wifi, WifiOff, Play, Film,
  CheckCircle2, Loader2, Trash2, ExternalLink, X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  max_participants: number;
  recording_url: string | null;
  started_at: string | null;
  host?: { id: string; display_name: string; email: string } | null;
  course?: { id: string; title: string } | null;
}

type RecordingState = 'idle' | 'recording' | 'uploading' | 'saved';

export default function LiveSessionRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [meetingActive, setMeetingActive] = useState(false);

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [savedRecordings, setSavedRecordings] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSession();
  }, [id]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const fetchSession = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/live-sessions/${id}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.session);
        if (json.session.recording_url) {
          setSavedRecordings([json.session.recording_url]);
        }
      } else {
        toast.error('Session not found');
        navigate('/admin/live-sessions');
      }
    } catch {
      toast.error('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const startMeeting = async () => {
    // Mark session as live
    await fetch(`/api/admin/live-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'live' }),
    });
    setSession(prev => prev ? { ...prev, status: 'live' } : prev);
    setMeetingActive(true);
    toast.success('Meeting started!');
  };

  const endMeeting = async () => {
    if (!confirm('End the live session?')) return;
    // Stop any recording
    if (recordingState === 'recording') await stopRecording();
    // Mark session as ended
    await fetch(`/api/admin/live-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ended' }),
    });
    setSession(prev => prev ? { ...prev, status: 'ended' } : prev);
    setMeetingActive(false);
    toast.success('Session ended');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => handleRecordingStopped();

      // Stop recording if user stops screen share
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      recorder.start(1000); // collect chunks every second
      setRecordingState('recording');
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);

      toast.success('Recording started');
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') toast.error('Could not start recording: ' + e.message);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const handleRecordingStopped = async () => {
    setRecordingState('uploading');
    setUploadProgress(0);
    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      chunksRef.current = [];

      // Get signed upload URL from backend
      const urlRes = await fetch(`/api/admin/live-sessions/${id}/upload-url`, { method: 'POST' });
      const urlJson = await urlRes.json();
      if (!urlJson.success) throw new Error(urlJson.error || 'Failed to get upload URL');

      const { signedUrl, publicUrl } = urlJson;

      // Upload to Supabase Storage
      setUploadProgress(30);
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'video/webm' },
      });
      if (!uploadRes.ok) throw new Error('Upload failed');

      setUploadProgress(80);

      // Save URL to session
      await fetch(`/api/admin/live-sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_url: publicUrl }),
      });

      setUploadProgress(100);
      setSavedRecordings(prev => [...prev, publicUrl]);
      setRecordingState('saved');
      setSession(prev => prev ? { ...prev, recording_url: publicUrl } : prev);
      toast.success('Recording saved successfully!');

      setTimeout(() => setRecordingState('idle'), 3000);
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
      setRecordingState('idle');
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const jitsiRoomName = `quizmaster-session-${id?.slice(0, 8)}`;
  const jitsiUrl = `https://meet.jit.si/${jitsiRoomName}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_BRAND_WATERMARK=false&interfaceConfig.DEFAULT_BACKGROUND=0f172a`;

  if (loading) {
    return (
      <AdminLayout>
        <LayoutPageSkeleton />
      </AdminLayout>
    );
  }

  if (!session) return null;

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    live: 'bg-rose-100 text-rose-700',
    ended: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-amber-100 text-amber-700',
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Link to="/admin/live-sessions"
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
            <ChevronLeft className="w-4 h-4" /> Live Sessions
          </Link>
        </div>

        {/* Session Info Bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <Video className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-900">{session.title}</h1>
                  <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide', statusColors[session.status])}>
                    {session.status === 'live' ? '🔴 ' : ''}{session.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 flex-wrap">
                  {session.host && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{session.host.display_name}</span>}
                  {session.course && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{session.course.title}</span>}
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{format(new Date(session.scheduled_at), 'MMM d, yyyy · h:mm a')}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{session.duration_minutes} min</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {!meetingActive && session.status !== 'ended' && session.status !== 'cancelled' && (
                <button onClick={startMeeting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]">
                  <Play className="w-4 h-4" /> Start Meeting
                </button>
              )}
              {meetingActive && (
                <button onClick={endMeeting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl font-semibold text-sm hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 active:scale-[0.98]">
                  <MonitorStop className="w-4 h-4" /> End Session
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Meeting Area */}
          <div className="xl:col-span-2 space-y-4">
            {/* Jitsi Meet Embed */}
            <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl" style={{ minHeight: '520px' }}>
              {meetingActive ? (
                <iframe
                  src={jitsiUrl}
                  allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
                  className="w-full"
                  style={{ height: '520px', border: 'none' }}
                  title="Live Meeting"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-[520px] text-white/70 gap-5">
                  <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                    <Video className="w-10 h-10 text-white/60" />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-semibold text-white mb-1">Meeting Room Ready</p>
                    <p className="text-sm text-white/50">Click <span className="text-indigo-400 font-semibold">Start Meeting</span> to launch the live session</p>
                    <p className="text-xs text-white/30 mt-2">Room: {jitsiRoomName}</p>
                  </div>
                  {session.status === 'ended' && (
                    <div className="px-4 py-2 bg-white/10 rounded-xl text-sm text-white/60">
                      This session has ended
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recording Controls */}
            {meetingActive && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center',
                      recordingState === 'recording' ? 'bg-rose-100' : 'bg-slate-100'
                    )}>
                      <Film className={cn('w-5 h-5', recordingState === 'recording' ? 'text-rose-600' : 'text-slate-500')} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Screen Recording</p>
                      <p className="text-xs text-slate-400">
                        {recordingState === 'idle' && 'Record your screen and audio — saved to this session'}
                        {recordingState === 'recording' && <span className="text-rose-600 font-semibold flex items-center gap-1.5"><span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse inline-block" /> Recording · {formatTime(recordingTime)}</span>}
                        {recordingState === 'uploading' && <span className="text-indigo-600 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin inline" /> Uploading… {uploadProgress}%</span>}
                        {recordingState === 'saved' && <span className="text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 inline" /> Recording saved!</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {recordingState === 'idle' && (
                      <button onClick={startRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition-all shadow-md shadow-rose-200">
                        <Circle className="w-3.5 h-3.5 fill-white" /> Start Recording
                      </button>
                    )}
                    {recordingState === 'recording' && (
                      <button onClick={stopRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-900 transition-all">
                        <StopCircle className="w-4 h-4" /> Stop & Save
                      </button>
                    )}
                    {recordingState === 'uploading' && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-semibold">
                        <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                      </div>
                    )}
                    {recordingState === 'saved' && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold">
                        <CheckCircle2 className="w-4 h-4" /> Saved!
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload progress bar */}
                {recordingState === 'uploading' && (
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Session Details */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Session Details</h3>
              <div className="space-y-3 text-sm">
                {session.description && (
                  <p className="text-slate-500 leading-relaxed">{session.description}</p>
                )}
                <div className="flex items-center justify-between py-2 border-t border-slate-50">
                  <span className="text-slate-400 font-medium">Room Name</span>
                  <span className="text-slate-700 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-lg">{jitsiRoomName}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-slate-50">
                  <span className="text-slate-400 font-medium">Max Participants</span>
                  <span className="text-slate-700 font-semibold">{session.max_participants}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-slate-50">
                  <span className="text-slate-400 font-medium">Duration</span>
                  <span className="text-slate-700 font-semibold">{session.duration_minutes} min</span>
                </div>
              </div>
              {/* Share link */}
              <div className="mt-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <p className="text-xs font-bold text-indigo-700 mb-1.5">Share Meeting Link</p>
                <p className="text-xs text-indigo-500 break-all font-mono leading-relaxed">
                  {`https://meet.jit.si/${jitsiRoomName}`}
                </p>
                <button
                  onClick={() => { navigator.clipboard.writeText(`https://meet.jit.si/${jitsiRoomName}`); toast.success('Link copied!'); }}
                  className="mt-2 w-full py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-all">
                  Copy Link
                </button>
              </div>
            </div>

            {/* Saved Recordings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Recordings</h3>
                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{savedRecordings.length}</span>
              </div>
              {savedRecordings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-300">
                  <Film className="w-8 h-8 mb-2" />
                  <p className="text-xs font-medium text-slate-400 text-center">No recordings yet.<br />Start recording during the session.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRecordings.map((url, i) => (
                    <div key={i} className="rounded-xl border border-slate-100 overflow-hidden">
                      <video
                        src={url}
                        controls
                        className="w-full"
                        style={{ maxHeight: '180px' }}
                      />
                      <div className="flex items-center gap-2 p-2 bg-slate-50">
                        <a href={url} download target="_blank" rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-all">
                          <Download className="w-3.5 h-3.5" /> Download
                        </a>
                        <a href={url} target="_blank" rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-all">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
