import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, Video, VideoOff, Monitor,
  Circle, StopCircle, Hand, Users, MessageSquare, PhoneOff,
  Smile, ChevronLeft, ChevronRight, Send, Loader2,
  CheckCircle2, Film, VolumeX, Pin, UserX, Download
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  recording_url: string | null;
  started_at: string | null;
  host_id: string | null;
  course: { id: string; title: string } | null;
}

interface Participant {
  id: string;
  session_id: string;
  user_id: string;
  role: string;
  joined_at: string | null;
  left_at: string | null;
  is_muted: boolean;
  is_pinned: boolean;
  is_removed: boolean;
  is_hand_raised: boolean;
  user: { id: string; display_name: string; email: string; avatar_url: string | null };
}

interface ChatMessage {
  id: string;
  session_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender: { id: string; display_name: string; avatar_url: string | null };
}

type RecordingState = 'idle' | 'recording' | 'uploading' | 'saved';
type SidebarTab = 'participants' | 'chat';

const REACTIONS = ['👏', '❤️', '😂', '🎉', '😮', '👍', '🔥'];

// Minimal type for the JitsiMeetExternalAPI instance
interface JitsiMeetExternalAPIInstance {
  executeCommand: (command: string, ...args: unknown[]) => void;
  dispose: () => void;
  addListener: (event: string, cb: (...args: unknown[]) => void) => void;
}

// Extend window to include JitsiMeetExternalAPI global
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: {
        roomName: string;
        parentNode: HTMLElement;
        width: string;
        height: string;
        userInfo: { displayName: string };
        configOverwrite: Record<string, unknown>;
        interfaceConfigOverwrite: Record<string, unknown>;
      }
    ) => JitsiMeetExternalAPIInstance;
  }
}

// Load JitsiMeetExternalAPI script and instantiate meeting in the given container
function loadJitsiExternalAPI(
  roomName: string,
  container: HTMLDivElement,
  displayName: string,
  startMuted: boolean,
  startVideoMuted: boolean,
  onReady: (api: JitsiMeetExternalAPIInstance) => void
) {
  const scriptId = 'jitsi-external-api';
  const existingScript = document.getElementById(scriptId);

  const init = () => {
    const JitsiAPI = window.JitsiMeetExternalAPI;
    if (!JitsiAPI) { console.error('JitsiMeetExternalAPI not available'); return; }
    const api: JitsiMeetExternalAPIInstance = new JitsiAPI('meet.jit.si', {
      roomName,
      parentNode: container,
      width: '100%',
      height: '100%',
      userInfo: { displayName },
      configOverwrite: {
        prejoinPageEnabled: false,
        startWithAudioMuted: startMuted,
        startWithVideoMuted: startVideoMuted,
        disableDeepLinking: true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [], // Hide built-in toolbar; use our own
      },
    });
    onReady(api);
  };

  if (existingScript) { init(); return; }

  const script = document.createElement('script');
  script.id = scriptId;
  script.src = 'https://meet.jit.si/external_api.js';
  script.async = true;
  script.onload = init;
  document.head.appendChild(script);
}

export default function TeacherLiveSessionRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');

  const [meetingActive, setMeetingActive] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [handRaised, setHandRaised] = useState(false);


  const [showReactions, setShowReactions] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('participants');

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatRealtimeConnected, setChatRealtimeConnected] = useState(false);

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [savedRecordings, setSavedRecordings] = useState<string[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const jitsiRoomName = `quizmaster-session-${id?.slice(0, 8)}`;
  // JitsiMeetExternalAPI instance — controls mic/camera/screen-share in real time
  const jitsiApiRef = useRef<JitsiMeetExternalAPIInstance | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);

  const toggleMic = () => {
    if (jitsiApiRef.current) jitsiApiRef.current.executeCommand('toggleAudio');
    setMicOn(v => !v);
  };

  const toggleCamera = () => {
    if (jitsiApiRef.current) jitsiApiRef.current.executeCommand('toggleVideo');
    setCameraOn(v => !v);
  };

  const toggleScreenShare = () => {
    if (jitsiApiRef.current) jitsiApiRef.current.executeCommand('toggleShareScreen');
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) { navigate('/login'); return; }
      setUserId(authSession.user.id);

      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authSession.user.id).single();
      setUserDisplayName(profile?.display_name || 'Teacher');

      await fetchSession();
      await fetchParticipants();
      await fetchChat();
    };
    init();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      // Dispose Jitsi API on unmount regardless of meeting state
      if (jitsiApiRef.current) { jitsiApiRef.current.dispose(); jitsiApiRef.current = null; }
    };
  }, [id]);

  // Initialize Jitsi External API whenever meetingActive becomes true and user info is ready
  // This covers both "Start Meeting" (new session) and "Rejoin" (already-live session)
  useEffect(() => {
    if (!meetingActive || !userDisplayName) return;
    // Allow React to render the container div first
    const timer = setTimeout(() => initJitsi(), 200);
    return () => {
      clearTimeout(timer);
      // Dispose Jitsi when meeting becomes inactive (cleanup on unmount / session end)
      if (!meetingActive && jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [meetingActive, userDisplayName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Supabase Realtime for chat
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`session-chat-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_chat_messages',
        filter: `session_id=eq.${id}`,
      }, async (payload) => {
        const msg = payload.new as { id: string; session_id: string; sender_id: string; message: string; created_at: string };
        const { data: sender } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', msg.sender_id).single();
        setChatMessages(prev => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, sender: sender || { id: msg.sender_id, display_name: 'User', avatar_url: null } }];
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChatRealtimeConnected(true);
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setChatRealtimeConnected(false);
          console.warn('[live-chat] Teacher chat realtime status:', status);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Supabase Realtime for participants
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`session-participants-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${id}`,
      }, () => { fetchParticipants(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const fetchSession = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.session);
        if (json.session.recording_url) setSavedRecordings([json.session.recording_url]);
        if (json.session.status === 'live') setMeetingActive(true);
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

  const fetchParticipants = async () => {
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}/participants`);
      const json = await res.json();
      if (json.success) setParticipants(json.participants || []);
    } catch { /* silent */ }
  };

  const fetchChat = async () => {
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}/chat`);
      const json = await res.json();
      if (json.success) setChatMessages(json.messages || []);
    } catch { /* silent */ }
  };

  const patchSession = async (patch: object) => {
    await authFetch(`/api/teacher/live-sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  };

  const startMeeting = async () => {
    const started_at = new Date().toISOString();
    await patchSession({ status: 'live', started_at });
    setSession(prev => prev ? { ...prev, status: 'live', started_at } : prev);
    setMeetingActive(true);

    if (userId) {
      await authFetch(`/api/teacher/live-sessions/${id}/join`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      });
    }
    toast.success('Meeting started!');
    // Jitsi will be initialized by the meetingActive effect
  };

  const initJitsi = () => {
    if (!jitsiContainerRef.current || jitsiApiRef.current) return;
    loadJitsiExternalAPI(
      jitsiRoomName,
      jitsiContainerRef.current,
      userDisplayName,
      !micOn,
      !cameraOn,
      (api) => {
        jitsiApiRef.current = api;
        // Sync mic/camera state from Jitsi events
        api.addListener('audioMuteStatusChanged', (e: unknown) => {
          const event = e as { muted: boolean };
          setMicOn(!event.muted);
        });
        api.addListener('videoMuteStatusChanged', (e: unknown) => {
          const event = e as { muted: boolean };
          setCameraOn(!event.muted);
        });
      }
    );
  };

  const endMeeting = async (auto = false) => {
    if (!auto && !confirm('End the live session for everyone?')) return;
    if (recordingState === 'recording') await stopRecording();
    // Dispose Jitsi API before marking ended
    if (jitsiApiRef.current) { jitsiApiRef.current.dispose(); jitsiApiRef.current = null; }
    await patchSession({ status: 'ended' });
    if (userId) {
      await authFetch(`/api/teacher/live-sessions/${id}/leave`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      });
    }
    setSession(prev => prev ? { ...prev, status: 'ended' } : prev);
    setMeetingActive(false);
    toast.success(auto ? 'Session ended automatically (time is up)' : 'Session ended');
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || !userId) return;
    setSendingChat(true);
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ sender_id: userId, message: msg }),
      });
      if (!res.ok) {
        const errText = await readApiError(res);
        throw new Error(errText || 'Failed to send message');
      }
      setChatInput('');
      // Fallback sync when realtime is temporarily unstable.
      if (!chatRealtimeConnected) {
        void fetchChat();
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send message');
    } finally {
      setSendingChat(false);
    }
  };

  const sendReaction = (emoji: string) => {
    const rid = Math.random().toString(36).slice(2);
    setFloatingReactions(prev => [...prev, { id: rid, emoji }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== rid)), 3000);
    setShowReactions(false);
    // Persist reaction to DB (best-effort)
    authFetch(`/api/teacher/live-sessions/${id}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }).catch(() => {});
  };

  const muteParticipant = async (p: Participant) => {
    try {
      await authFetch(`/api/teacher/live-sessions/${id}/participants/${p.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_muted: !p.is_muted }),
      });
      setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, is_muted: !p.is_muted } : x));
    } catch { /* silent */ }
  };

  const pinParticipant = async (p: Participant) => {
    try {
      await authFetch(`/api/teacher/live-sessions/${id}/participants/${p.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_pinned: !p.is_pinned }),
      });
      setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, is_pinned: !p.is_pinned } : x));
    } catch { /* silent */ }
  };

  const removeParticipant = async (p: Participant) => {
    if (!confirm(`Remove ${p.user?.display_name} from session? They will not be able to rejoin.`)) return;
    try {
      await authFetch(`/api/teacher/live-sessions/${id}/participants/${p.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_removed: true, left_at: new Date().toISOString() }),
      });
      setParticipants(prev => prev.filter(x => x.user_id !== p.user_id));
      toast.success('Participant removed');
    } catch { /* silent */ }
  };

  const startRecording = async () => {
    try {
      const constraints: DisplayMediaStreamOptions = { video: { frameRate: 30 } as MediaTrackConstraints, audio: true };
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
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
      const urlRes = await authFetch(`/api/teacher/live-sessions/${id}/upload-url`, { method: 'POST' });
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
      toast.success('Recording saved!');
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

  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!session || session.status !== 'live' || !session.started_at) {
      setTimeRemaining(null);
      return;
    }
    
    const interval = setInterval(() => {
      const start = new Date(session.started_at!).getTime();
      const end = start + session.duration_minutes * 60 * 1000;
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeRemaining(remaining);
      
      if (remaining <= 0 && session.status === 'live') {
        endMeeting(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session, meetingActive]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          <span>Loading session...</span>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate('/teacher/live-sessions')}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-white font-semibold text-sm truncate">{session.title}</h1>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0',
              session.status === 'live' ? 'bg-rose-500 text-white animate-pulse' :
              session.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
              'bg-slate-700 text-slate-400'
            )}>
              {session.status === 'live' ? '● Live' : session.status}
            </span>
            {session.status === 'live' && timeRemaining !== null && (
              <span className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide shrink-0',
                timeRemaining < 300 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-slate-800 text-slate-300'
              )}>
                ⏱ {formatTime(timeRemaining)} remaining
              </span>
            )}
          </div>
          {session.course && <p className="text-slate-500 text-xs">{session.course.title}</p>}
        </div>
        {recordingState === 'recording' && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 border border-rose-500/30 rounded-full">
            <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            <span className="text-rose-400 text-xs font-semibold">{formatTime(recordingTime)}</span>
          </div>
        )}
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Video Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 bg-slate-950 relative overflow-hidden">
            {meetingActive ? (
              <div
                ref={jitsiContainerRef}
                className="w-full h-full"
                id="jitsi-meeting-container"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-6 text-white/70">
                <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Video className="w-12 h-12 text-white/30" />
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-white mb-2">
                    {session.status === 'ended' ? 'Session Ended' : 'Meeting Room Ready'}
                  </p>
                  {session.status !== 'ended' && session.status !== 'cancelled' ? (
                    <p className="text-sm text-white/50 mb-6">
                      Click <span className="text-violet-400 font-semibold">Start Meeting</span> to launch
                    </p>
                  ) : (
                    <p className="text-sm text-white/40 mb-6">This session has ended</p>
                  )}
                  <p className="text-xs text-white/20 font-mono">Room: {jitsiRoomName}</p>
                </div>
                {session.status !== 'ended' && session.status !== 'cancelled' && (
                  <button
                    onClick={startMeeting}
                    className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-all shadow-lg shadow-violet-900/50"
                  >
                    <Video className="w-5 h-5" /> Start Meeting
                  </button>
                )}
              </div>
            )}

            {/* Floating Reactions */}
            <div className="absolute bottom-24 right-8 pointer-events-none">
              <AnimatePresence>
                {floatingReactions.map(r => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 1, y: 0, scale: 0.5 }}
                    animate={{ opacity: 0, y: -120, scale: 1.5 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 3 }}
                    className="text-4xl text-center"
                  >
                    {r.emoji}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Recordings Panel (shown when session ended or recordings exist) */}
          {savedRecordings.length > 0 && (
            <div className="bg-slate-900 border-t border-slate-800 p-3">
              <p className="text-slate-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5" /> Recordings ({savedRecordings.length})
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {savedRecordings.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-all shrink-0">
                    <Download className="w-3.5 h-3.5" /> Recording {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Control Bar */}
          <div className="bg-slate-900 border-t border-slate-800 px-6 py-4 flex items-center justify-center gap-3 shrink-0">
            {/* Mic */}
            <ControlBtn
              active={micOn}
              activeClass="bg-slate-700 hover:bg-slate-600"
              inactiveClass="bg-rose-600 hover:bg-rose-700"
              onClick={toggleMic}
              title={micOn ? 'Mute' : 'Unmute'}
              icon={micOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
            />
            {/* Camera */}
            <ControlBtn
              active={cameraOn}
              activeClass="bg-slate-700 hover:bg-slate-600"
              inactiveClass="bg-rose-600 hover:bg-rose-700"
              onClick={toggleCamera}
              title={cameraOn ? 'Stop Video' : 'Start Video'}
              icon={cameraOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}
            />
            {/* Screen Share — via Jitsi External API */}
            <ControlBtn
              active={true}
              activeClass="bg-slate-700 hover:bg-slate-600"
              inactiveClass="bg-slate-700 hover:bg-slate-600"
              onClick={toggleScreenShare}
              title="Share Screen"
              icon={<Monitor className="w-5 h-5 text-white" />}
            />
            {/* Record */}
            <ControlBtn
              active={recordingState !== 'recording'}
              activeClass={recordingState === 'uploading' ? 'bg-violet-600' : recordingState === 'saved' ? 'bg-emerald-600' : 'bg-slate-700 hover:bg-slate-600'}
              inactiveClass="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (recordingState === 'idle') startRecording();
                else if (recordingState === 'recording') stopRecording();
              }}
              title={recordingState === 'recording' ? 'Stop Recording' : 'Start Recording'}
              icon={
                recordingState === 'recording' ? <StopCircle className="w-5 h-5 text-white" /> :
                recordingState === 'uploading' ? <Loader2 className="w-5 h-5 text-white animate-spin" /> :
                recordingState === 'saved' ? <CheckCircle2 className="w-5 h-5 text-white" /> :
                <Circle className="w-5 h-5 text-rose-400 fill-rose-400" />
              }
            />
            {/* Raise Hand */}
            <ControlBtn
              active={!handRaised}
              activeClass="bg-slate-700 hover:bg-slate-600"
              inactiveClass="bg-amber-500 hover:bg-amber-600"
              onClick={async () => {
                const next = !handRaised;
                setHandRaised(next);
                toast.info(next ? 'Hand raised' : 'Hand lowered');
                if (userId) {
                  authFetch(`/api/teacher/live-sessions/${id}/participants/${userId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ is_hand_raised: next }),
                  }).catch(() => {});
                }
              }}
              title={handRaised ? 'Lower Hand' : 'Raise Hand'}
              icon={<Hand className={cn('w-5 h-5', handRaised ? 'text-white' : 'text-white')} />}
            />
            {/* Reactions */}
            <div className="relative">
              <ControlBtn
                active={true}
                activeClass="bg-slate-700 hover:bg-slate-600"
                inactiveClass="bg-slate-700"
                onClick={() => setShowReactions(v => !v)}
                title="Reactions"
                icon={<Smile className="w-5 h-5 text-white" />}
              />
              <AnimatePresence>
                {showReactions && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.9 }}
                    className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-2xl p-2 flex gap-1 shadow-2xl"
                  >
                    {REACTIONS.map(e => (
                      <button key={e} onClick={() => sendReaction(e)}
                        className="text-2xl p-1.5 hover:bg-slate-700 rounded-xl transition-colors">
                        {e}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* Participants */}
            <ControlBtn
              active={!(sidebarOpen && sidebarTab === 'participants')}
              activeClass="bg-slate-700 hover:bg-slate-600"
              inactiveClass="bg-violet-600 hover:bg-violet-700"
              onClick={() => { setSidebarTab('participants'); setSidebarOpen(v => sidebarTab === 'participants' ? !v : true); }}
              title="Participants"
              icon={<Users className="w-5 h-5 text-white" />}
              badge={participants.length}
            />
            {/* Chat */}
            <ControlBtn
              active={!(sidebarOpen && sidebarTab === 'chat')}
              activeClass="bg-slate-700 hover:bg-slate-600"
              inactiveClass="bg-violet-600 hover:bg-violet-700"
              onClick={() => { setSidebarTab('chat'); setSidebarOpen(v => sidebarTab === 'chat' ? !v : true); }}
              title="Chat"
              icon={<MessageSquare className="w-5 h-5 text-white" />}
            />
            {/* End / Leave */}
            {meetingActive ? (
              <button
                onClick={endMeeting}
                className="flex items-center gap-2 px-5 py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 transition-all"
                title="End Session"
              >
                <PhoneOff className="w-5 h-5" />
                <span className="text-sm hidden sm:inline">End</span>
              </button>
            ) : session.status !== 'ended' && session.status !== 'cancelled' ? (
              <button
                onClick={startMeeting}
                className="flex items-center gap-2 px-5 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-all"
              >
                <Video className="w-5 h-5" />
                <span className="text-sm hidden sm:inline">Start</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden shrink-0"
            >
              {/* Sidebar Header */}
              <div className="flex items-center border-b border-slate-800 shrink-0">
                <button
                  onClick={() => setSidebarTab('participants')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors',
                    sidebarTab === 'participants'
                      ? 'border-violet-500 text-violet-400'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  )}
                >
                  <Users className="w-4 h-4" /> Participants
                  {participants.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-300 rounded-full">{participants.length}</span>
                  )}
                </button>
                <button
                  onClick={() => setSidebarTab('chat')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors',
                    sidebarTab === 'chat'
                      ? 'border-violet-500 text-violet-400'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  )}
                >
                  <MessageSquare className="w-4 h-4" /> Chat
                  {chatMessages.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-300 rounded-full">{chatMessages.length}</span>
                  )}
                </button>
                <button onClick={() => setSidebarOpen(false)} className="p-3 text-slate-500 hover:text-slate-300 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {sidebarTab === 'participants' ? (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {participants.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No participants yet</p>
                    </div>
                  ) : (
                    participants.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800 group transition-colors">
                        <div className="w-9 h-9 rounded-full bg-violet-600/30 flex items-center justify-center text-violet-300 font-bold text-sm shrink-0">
                          {p.user?.display_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-200 truncate">{p.user?.display_name || 'Unknown'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {p.joined_at && !p.left_at && (
                              <span className="text-[10px] text-emerald-400 font-semibold">● Online</span>
                            )}
                            {p.is_hand_raised && <span className="text-[10px] text-amber-400 font-semibold">✋ Hand raised</span>}
                            {p.is_muted && <span className="text-[10px] text-slate-500">Muted</span>}
                            {p.is_pinned && <span className="text-[10px] text-amber-400">Pinned</span>}
                            {p.left_at && <span className="text-[10px] text-slate-600">Left</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => muteParticipant(p)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title={p.is_muted ? 'Unmute' : 'Mute'}>
                            <VolumeX className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => pinParticipant(p)} className={cn('p-1.5 rounded-lg hover:bg-slate-700 transition-colors', p.is_pinned ? 'text-amber-400' : 'text-slate-400 hover:text-white')} title="Pin">
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeParticipant(p)} className="p-1.5 rounded-lg hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition-colors" title="Remove">
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {chatMessages.length === 0 ? (
                      <div className="py-12 text-center text-slate-500">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No messages yet</p>
                        <p className="text-xs text-slate-600 mt-1">Be the first to say hello!</p>
                      </div>
                    ) : (
                      chatMessages.map(msg => (
                        <div key={msg.id} className={cn('flex gap-2', msg.sender_id === userId ? 'flex-row-reverse' : '')}>
                          <div className="w-7 h-7 rounded-full bg-violet-600/30 flex items-center justify-center text-violet-300 font-bold text-xs shrink-0">
                            {msg.sender?.display_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className={cn('max-w-[200px]', msg.sender_id === userId ? 'items-end' : 'items-start', 'flex flex-col gap-0.5')}>
                            <span className="text-[10px] text-slate-500">
                              {msg.sender?.display_name} · {format(new Date(msg.created_at), 'HH:mm')}
                            </span>
                            <div className={cn(
                              'px-3 py-2 rounded-2xl text-sm',
                              msg.sender_id === userId
                                ? 'bg-violet-600 text-white rounded-tr-sm'
                                : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                            )}>
                              {msg.message}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-3 border-t border-slate-800 shrink-0">
                    <form
                      onSubmit={e => { e.preventDefault(); sendChat(); }}
                      className="flex gap-2"
                    >
                      <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                      />
                      <button
                        type="submit"
                        disabled={sendingChat || !chatInput.trim()}
                        className="p-2.5 bg-violet-600 rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50"
                      >
                        {sendingChat ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar toggle when closed */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 bg-slate-800 border border-slate-700 border-r-0 rounded-l-xl text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}


function ControlBtn({
  active,
  activeClass,
  inactiveClass,
  onClick,
  title,
  icon,
  badge,
}: {
  active: boolean;
  activeClass: string;
  inactiveClass: string;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'relative p-3 rounded-xl transition-all',
        active ? activeClass : inactiveClass
      )}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
