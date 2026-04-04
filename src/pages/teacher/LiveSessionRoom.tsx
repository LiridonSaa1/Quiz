import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Video, Circle, StopCircle, Download, ChevronLeft, Users,
  Clock, BookOpen, Play, Film, CheckCircle2, Loader2,
  ExternalLink, MonitorStop, Copy
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  max_participants: number;
  meeting_url: string | null;
  recording_url: string | null;
  host?: { id: string; display_name: string; email: string } | null;
  course?: { id: string; title: string } | null;
}

type RecordingState = 'idle' | 'recording' | 'uploading' | 'saved';

export default function TeacherLiveSessionRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [meetingActive, setMeetingActive] = useState(false);

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [savedRecordings, setSavedRecordings] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchSession();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [id]);

  const fetchSession = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/live-sessions/${id}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.session);
        if (json.session.recording_url) setSavedRecordings([json.session.recording_url]);
      } else {
        toast.error('Session not found');
        navigate('/teacher/live-sessions');
      }
    } catch {
      toast.error('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const patchSession = async (patch: object) => {
    await fetch(`/api/admin/live-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  };

  const startMeeting = async () => {
    await patchSession({ status: 'live' });
    setSession(prev => prev ? { ...prev, status: 'live' } : prev);
    setMeetingActive(true);
    toast.success('Meeting started!');
  };

  const endMeeting = async () => {
    if (!confirm('End the live session?')) return;
    if (recordingState === 'recording') await stopRecording();
    await patchSession({ status: 'ended' });
    setSession(prev => prev ? { ...prev, status: 'ended' } : prev);
    setMeetingActive(false);
    toast.success('Session ended');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => handleRecordingStopped();
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      };

      recorder.start(1000);
      setRecordingState('recording');
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      toast.success('Recording started');
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') toast.error('Could not start recording: ' + e.message);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const handleRecordingStopped = async () => {
    setRecordingState('uploading');
    setUploadProgress(0);
    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      chunksRef.current = [];

      const urlRes = await fetch(`/api/admin/live-sessions/${id}/upload-url`, { method: 'POST' });
      const urlJson = await urlRes.json();
      if (!urlJson.success) throw new Error(urlJson.error || 'Failed to get upload URL');

      const { signedUrl, publicUrl } = urlJson;
      setUploadProgress(30);

      const uploadRes = await fetch(signedUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'video/webm' } });
      if (!uploadRes.ok) throw new Error('Upload failed');
      setUploadProgress(80);

      await patchSession({ recording_url: publicUrl });
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
  const jitsiUrl = `https://meet.jit.si/${jitsiRoomName}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&interfaceConfig.SHOW_JITSI_WATERMARK=false`;
  const jitsiPublicLink = `https://meet.jit.si/${jitsiRoomName}`;

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    live:      'bg-rose-100 text-rose-700',
    ended:     'bg-slate-100 text-slate-600',
    cancelled: 'bg-amber-100 text-amber-700',
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
          Loading session...
        </div>
      </TeacherLayout>
    );
  }

  if (!session) return null;

  return (
    <TeacherLayout>
      <div className="space-y-5">
        {/* Back */}
        <Link to="/teacher/live-sessions"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
          <ChevronLeft className="w-4 h-4" /> Live Sessions
        </Link>

        {/* Session Info Bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200 shrink-0">
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
                  {session.course && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{session.course.title}</span>}
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{format(new Date(session.scheduled_at), 'MMM d, yyyy · h:mm a')}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{session.duration_minutes} min</span>
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />Max {session.max_participants}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {session.meeting_url && (
                <a href={session.meeting_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all">
                  <ExternalLink className="w-4 h-4" /> External Link
                </a>
              )}
              {!meetingActive && session.status !== 'ended' && session.status !== 'cancelled' && (
                <button onClick={startMeeting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98]">
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

        {/* Main */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Meeting Area */}
          <div className="xl:col-span-2 space-y-4">
            {/* Jitsi Embed */}
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
                    <Video className="w-10 h-10 text-white/50" />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-semibold text-white mb-1">
                      {session.status === 'ended' ? 'Session Ended' : 'Meeting Room Ready'}
                    </p>
                    {session.status !== 'ended' && session.status !== 'cancelled' ? (
                      <p className="text-sm text-white/50">
                        Click <span className="text-violet-400 font-semibold">Start Meeting</span> to launch the live session
                      </p>
                    ) : (
                      <p className="text-sm text-white/40">This session has ended</p>
                    )}
                    <p className="text-xs text-white/25 mt-2 font-mono">Room: {jitsiRoomName}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Recording Controls */}
            {meetingActive && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', recordingState === 'recording' ? 'bg-rose-100' : 'bg-slate-100')}>
                      <Film className={cn('w-5 h-5', recordingState === 'recording' ? 'text-rose-600' : 'text-slate-500')} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Screen Recording</p>
                      <p className="text-xs text-slate-400">
                        {recordingState === 'idle' && 'Record your screen and audio'}
                        {recordingState === 'recording' && (
                          <span className="text-rose-600 font-semibold flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse inline-block" /> Recording · {formatTime(recordingTime)}
                          </span>
                        )}
                        {recordingState === 'uploading' && (
                          <span className="text-violet-600 flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin inline" /> Uploading… {uploadProgress}%
                          </span>
                        )}
                        {recordingState === 'saved' && (
                          <span className="text-emerald-600 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 inline" /> Recording saved!
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div>
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
                      <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-semibold">
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
                {recordingState === 'uploading' && (
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
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
                  <p className="text-slate-500 leading-relaxed text-xs">{session.description}</p>
                )}
                <div className="flex items-center justify-between py-2 border-t border-slate-50">
                  <span className="text-slate-400 font-medium text-xs">Room Name</span>
                  <span className="text-slate-700 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-lg">{jitsiRoomName}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-slate-50">
                  <span className="text-slate-400 font-medium text-xs">Max Participants</span>
                  <span className="text-slate-700 font-semibold text-sm">{session.max_participants}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-slate-50">
                  <span className="text-slate-400 font-medium text-xs">Duration</span>
                  <span className="text-slate-700 font-semibold text-sm">{session.duration_minutes} min</span>
                </div>
              </div>

              {/* Share Meeting Link */}
              <div className="mt-4 p-3 bg-violet-50 rounded-xl border border-violet-100">
                <p className="text-xs font-bold text-violet-700 mb-1.5">Share with Students</p>
                <p className="text-xs text-violet-500 break-all font-mono leading-relaxed">{jitsiPublicLink}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(jitsiPublicLink); toast.success('Link copied!'); }}
                  className="mt-2 w-full py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-all flex items-center justify-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Copy Link
                </button>
              </div>

              {/* External URL if set */}
              {session.meeting_url && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-600 mb-1">External Meeting URL</p>
                  <a href={session.meeting_url} target="_blank" rel="noreferrer"
                    className="text-xs text-violet-600 hover:underline break-all flex items-center gap-1">
                    <ExternalLink className="w-3 h-3 shrink-0" />{session.meeting_url}
                  </a>
                </div>
              )}
            </div>

            {/* Recordings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Recordings</h3>
                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{savedRecordings.length}</span>
              </div>
              {savedRecordings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-300 gap-2">
                  <Film className="w-8 h-8" />
                  <p className="text-xs font-medium text-slate-400 text-center">No recordings yet.<br />Start recording during the session.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedRecordings.map((url, i) => (
                    <div key={i} className="rounded-xl border border-slate-100 overflow-hidden">
                      <video src={url} controls className="w-full" style={{ maxHeight: '180px' }} />
                      <div className="flex items-center gap-2 p-2 bg-slate-50">
                        <a href={url} download target="_blank" rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-all">
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
    </TeacherLayout>
  );
}
