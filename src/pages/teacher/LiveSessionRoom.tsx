import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, Video, VideoOff, Monitor,
  Circle, StopCircle, Hand, Users, MessageSquare, PhoneOff,
  Smile, ChevronLeft, ChevronRight, Send, Loader2,
  CheckCircle2, Film, VolumeX, Pin, UserX, Download, X
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
  recording_urls: string[];
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

interface JitsiMeetExternalAPIInstance {
  executeCommand: (command: string, ...args: unknown[]) => void;
  dispose: () => void;
  addListener: (event: string, cb: (...args: unknown[]) => void) => void;
}

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
        disableThirdPartyRequests: true,
        p2p: { enabled: false },
        analytics: { disabled: true },
        // Suppress all notification banners inside Jitsi
        notifications: [],
        disableRemoteMute: false,
        enableNoisyMicDetection: false,
        enableNoAudioDetection: false,
        hideConferenceTimer: false,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [],
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        HIDE_INVITE_MORE_HEADER: true,
        SHOW_PROMOTIONAL_CLOSE_PAGE: false,
        SHOW_CHROME_EXTENSION_BANNER: false,
        MOBILE_APP_PROMO: false,
        ENABLE_FEEDBACK_ANIMATION: false,
        DISABLE_FOCUS_INDICATOR: true,
        DISABLE_VIDEO_BACKGROUND: false,
        DEFAULT_LOGO_URL: '',
        JITSI_WATERMARK_LINK: '',
      },
    });
    setTimeout(() => {
      const jitsiIframe = container.querySelector('iframe');
      if (jitsiIframe) {
        jitsiIframe.setAttribute('allow', 'camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *');
      }
    }, 1500);

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
  const { t } = useTranslation();
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('participants');
  const [isMobile, setIsMobile] = useState(false);

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
  const jitsiApiRef = useRef<JitsiMeetExternalAPIInstance | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);

  // Track mobile breakpoint
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // On mobile sidebar defaults closed; on desktop open by default
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

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
      if (jitsiApiRef.current) { jitsiApiRef.current.dispose(); jitsiApiRef.current = null; }
    };
  }, [id]);

  useEffect(() => {
    if (!meetingActive || !userDisplayName) return;
    const timer = setTimeout(() => initJitsi(), 200);
    return () => {
      clearTimeout(timer);
      if (!meetingActive && jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [meetingActive, userDisplayName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [id]);

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
        const urls: string[] = Array.isArray(json.session.recording_urls) && json.session.recording_urls.length > 0
          ? json.session.recording_urls
          : json.session.recording_url ? [json.session.recording_url] : [];
        if (urls.length > 0) setSavedRecordings(urls);
        if (json.session.status === 'live') setMeetingActive(true);
      } else {
        toast.error(t('liveSessions.sessionNotFound'));
        navigate('/teacher/live-sessions');
      }
    } catch {
      toast.error(t('liveSessions.failedToLoadSession'));
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
    if (!auto && !confirm(t('liveSessions.endSessionConfirm'))) return;
    if (recordingState === 'recording') await stopRecording();
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
    toast.success(auto ? t('liveSessions.sessionEndedAuto') : t('liveSessions.sessionEnded'));
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
      if (!chatRealtimeConnected) void fetchChat();
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
    if (!confirm(t('liveSessions.removeParticipantConfirm', { name: p.user?.display_name }))) return;
    try {
      await authFetch(`/api/teacher/live-sessions/${id}/participants/${p.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_removed: true, left_at: new Date().toISOString() }),
      });
      setParticipants(prev => prev.filter(x => x.user_id !== p.user_id));
      toast.success(t('liveSessions.participantRemoved'));
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
      toast.success(t('liveSessions.recordingStarted'));
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') toast.error(t('liveSessions.recordingError') + ': ' + e.message);
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
      if (remaining <= 0 && session.status === 'live') endMeeting(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [session, meetingActive]);

  const openSidebar = (tab: SidebarTab) => {
    setSidebarTab(tab);
    setSidebarOpen(prev => sidebarTab === tab ? !prev : true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          <span>{t('liveSessions.loadingSession')}</span>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 py-2.5 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate('/teacher/live-sessions')}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-sm transition-colors shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t('common.back')}</span>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white font-semibold text-sm truncate max-w-[180px] sm:max-w-none">{session.title}</h1>
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
                ⏱ {formatTime(timeRemaining)}
              </span>
            )}
          </div>
          {session.course && <p className="text-slate-500 text-xs truncate">{session.course.title}</p>}
        </div>
        {recordingState === 'recording' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/20 border border-rose-500/30 rounded-full shrink-0">
            <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            <span className="text-rose-400 text-xs font-semibold">{formatTime(recordingTime)}</span>
          </div>
        )}
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Video + Controls column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Video */}
          <div className="flex-1 bg-slate-950 relative overflow-hidden">
            {meetingActive ? (
              <div
                ref={jitsiContainerRef}
                className="w-full h-full"
                id="jitsi-meeting-container"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-5 text-white/70 px-4">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Video className="w-10 h-10 sm:w-12 sm:h-12 text-white/30" />
                </div>
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-semibold text-white mb-2">
                    {session.status === 'ended' ? t('liveSessions.sessionEnded') : t('liveSessions.meetingRoomReady')}
                  </p>
                  {session.status !== 'ended' && session.status !== 'cancelled' ? (
                    <p className="text-sm text-white/50 mb-5">{t('liveSessions.startMeetingPrompt')}</p>
                  ) : (
                    <p className="text-sm text-white/40 mb-5">{t('liveSessions.sessionHasEnded')}</p>
                  )}
                  <p className="text-xs text-white/20 font-mono">Room: {jitsiRoomName}</p>
                </div>
                {session.status !== 'ended' && session.status !== 'cancelled' && (
                  <button
                    onClick={startMeeting}
                    className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-all shadow-lg shadow-violet-900/50"
                  >
                    <Video className="w-5 h-5" /> {t('liveSessions.startMeeting')}
                  </button>
                )}
              </div>
            )}

            {/* Floating Reactions */}
            <div className="absolute bottom-20 right-4 pointer-events-none">
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

          {/* Recordings Panel */}
          {savedRecordings.length > 0 && (
            <div className="bg-slate-900 border-t border-slate-800 p-2.5">
              <p className="text-slate-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5" /> {t('liveSessions.recordings', { count: savedRecordings.length })}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {savedRecordings.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-all shrink-0">
                    <Download className="w-3.5 h-3.5" /> Recording {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Control Bar — horizontally scrollable on mobile */}
          <div className="bg-slate-900 border-t border-slate-800 px-3 py-3 shrink-0">
            <div className="flex items-center justify-center gap-2 overflow-x-auto min-w-0 no-scrollbar">
              {/* Mic */}
              <ControlBtn
                active={micOn}
                activeClass="bg-slate-700 hover:bg-slate-600"
                inactiveClass="bg-rose-600 hover:bg-rose-700"
                onClick={toggleMic}
                title={micOn ? 'Mute' : 'Unmute'}
                icon={micOn ? <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
              />
              {/* Camera */}
              <ControlBtn
                active={cameraOn}
                activeClass="bg-slate-700 hover:bg-slate-600"
                inactiveClass="bg-rose-600 hover:bg-rose-700"
                onClick={toggleCamera}
                title={cameraOn ? 'Stop Video' : 'Start Video'}
                icon={cameraOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
              />
              {/* Screen Share */}
              <ControlBtn
                active={true}
                activeClass="bg-slate-700 hover:bg-slate-600"
                inactiveClass="bg-slate-700 hover:bg-slate-600"
                onClick={toggleScreenShare}
                title="Share Screen"
                icon={<Monitor className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
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
                  recordingState === 'recording' ? <StopCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> :
                  recordingState === 'uploading' ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-spin" /> :
                  recordingState === 'saved' ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> :
                  <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 fill-rose-400" />
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
                icon={<Hand className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
              />
              {/* Reactions */}
              <div className="relative shrink-0">
                <ControlBtn
                  active={true}
                  activeClass="bg-slate-700 hover:bg-slate-600"
                  inactiveClass="bg-slate-700"
                  onClick={() => setShowReactions(v => !v)}
                  title="Reactions"
                  icon={<Smile className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                />
                <AnimatePresence>
                  {showReactions && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.9 }}
                      className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-2xl p-1.5 flex gap-1 shadow-2xl z-20"
                    >
                      {REACTIONS.map(e => (
                        <button key={e} onClick={() => sendReaction(e)}
                          className="text-xl sm:text-2xl p-1.5 hover:bg-slate-700 rounded-xl transition-colors">
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
                onClick={() => openSidebar('participants')}
                title="Participants"
                icon={<Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                badge={participants.length}
              />
              {/* Chat */}
              <ControlBtn
                active={!(sidebarOpen && sidebarTab === 'chat')}
                activeClass="bg-slate-700 hover:bg-slate-600"
                inactiveClass="bg-violet-600 hover:bg-violet-700"
                onClick={() => openSidebar('chat')}
                title="Chat"
                icon={<MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
              />

              <div className="w-px h-6 bg-slate-700 mx-1 shrink-0" />

              {/* End / Leave */}
              {meetingActive ? (
                <button
                  onClick={() => endMeeting()}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 transition-all shrink-0 text-sm"
                  title="End Session"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span className="hidden sm:inline">End</span>
                </button>
              ) : session.status !== 'ended' && session.status !== 'cancelled' ? (
                <button
                  onClick={startMeeting}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-all shrink-0 text-sm"
                >
                  <Video className="w-4 h-4" />
                  <span className="hidden sm:inline">Start</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Sidebar — overlay on mobile, inline on desktop */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {/* Mobile backdrop */}
              {isMobile && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/50 z-20 md:hidden"
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              <motion.div
                initial={isMobile ? { x: '100%' } : { width: 0, opacity: 0 }}
                animate={isMobile ? { x: 0 } : { width: 300, opacity: 1 }}
                exit={isMobile ? { x: '100%' } : { width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden shrink-0',
                  isMobile ? 'absolute right-0 top-0 bottom-0 w-4/5 max-w-xs z-30' : ''
                )}
                style={isMobile ? {} : undefined}
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
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Participants</span>
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
                    <MessageSquare className="w-4 h-4" />
                    <span className="hidden sm:inline">Chat</span>
                    {chatMessages.length > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-300 rounded-full">{chatMessages.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-3 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {isMobile ? <X className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {p.joined_at && !p.left_at && (
                                <span className="text-[10px] text-emerald-400 font-semibold">● Online</span>
                              )}
                              {p.is_hand_raised && <span className="text-[10px] text-amber-400 font-semibold">✋ Hand</span>}
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
                          className="p-2.5 bg-violet-600 rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 shrink-0"
                        >
                          {sendingChat ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Sidebar toggle tab (desktop, when closed) */}
        {!sidebarOpen && !isMobile && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 bg-slate-800 border border-slate-700 border-r-0 rounded-l-xl text-slate-400 hover:text-white transition-colors z-10"
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
        'relative p-2.5 sm:p-3 rounded-xl transition-all shrink-0',
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
