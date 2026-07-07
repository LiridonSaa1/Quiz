import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Video, Hand, MessageSquare, Smile, ChevronLeft, ChevronRight,
  Send, Loader2, Users, Clock, BookOpen, Radio, CheckCircle2,
  CalendarDays, Copy, ExternalLink, ClipboardCheck, PlayCircle,
  Wifi, WifiOff, WifiZero
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import StudentLayout from '../../components/layout/StudentLayout';

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: object) => {
      dispose: () => void;
      executeCommand: (cmd: string, ...args: unknown[]) => void;
    };
  }
}

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
  jitsi_room_name: string | null;
  host: { id: string; display_name: string } | null;
  course: { id: string; title: string } | null;
}

interface ChatMessage {
  id: string;
  session_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender: { id: string; display_name: string; avatar_url: string | null };
}

const REACTIONS = ['👏', '❤️', '😂', '🎉', '😮', '👍', '🔥'];

export default function StudentLiveSessionJoin() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── All state declarations first (Rules of Hooks: no hooks after conditional) ──
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [joined, setJoined] = useState(false);
  const [showNavWarning, setShowNavWarning] = useState(false);
  const [joining, setJoining] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  // Session controls pushed by teacher
  const [chatEnabled, setChatEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [raiseHandEnabled, setRaiseHandEnabled] = useState(true);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatRealtimeConnected, setChatRealtimeConnected] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor' | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const defaultJitsiRoomName = `quizmaster-session-${id?.slice(0, 8)}`;
  const [activeRoomName, setActiveRoomName] = useState(defaultJitsiRoomName);
  const [jaasDomain, setJaasDomain] = useState<string | null>(null);
  const [jaasAppId, setJaasAppId] = useState<string | null>(null);
  const [liveQuizPush, setLiveQuizPush] = useState<{ quizId: string; quizTitle: string; sessionId: string } | null>(null);

  // ── Refs ──
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);
  const jitsiApiRef = useRef<ReturnType<typeof window.JitsiMeetExternalAPI> | null>(null);
  const micMutedRef = useRef(false); // tracks actual Jitsi audio state for teacher-mute sync

  // ── Derived constants (no hooks below) ──
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  );
  const jitsiMeetUrl = (jaasDomain === '8x8.vc' && jaasAppId)
    ? `https://8x8.vc/${jaasAppId}/${activeRoomName}`
    : `https://meet.jit.si/${activeRoomName}`;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // ── Effects ──

  // Block browser tab close / refresh while joined
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (joined) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [joined]);

  // Intercept browser back button while joined
  useEffect(() => {
    if (!joined) return;
    const handler = () => { setShowNavWarning(true); window.history.pushState(null, '', window.location.href); };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [joined]);

  // Countdown timer while session is live
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
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  // Sync activeRoomName when teacher reconnects (jitsi_room_name changes via Realtime)
  useEffect(() => {
    if (session?.jitsi_room_name && session.jitsi_room_name !== activeRoomName) {
      setActiveRoomName(session.jitsi_room_name);
      // Force reinit by clearing existing API instance
      if (jitsiApiRef.current) { jitsiApiRef.current.dispose(); jitsiApiRef.current = null; }
    }
  }, [session?.jitsi_room_name]);

  // Initialize Jitsi External API when student joins (desktop only — mobile opens in new tab)
  useEffect(() => {
    if (!joined || isMobile || !jitsiContainerRef.current || jitsiApiRef.current) return;
    const container = jitsiContainerRef.current;
    let destroyed = false;

    const initWithToken = () => {
      const domain = 'meet.jit.si';

      if (destroyed) return;

      const init = () => {
        if (destroyed) return;
        const JitsiAPI = window.JitsiMeetExternalAPI;
        if (!JitsiAPI) { console.error('JitsiMeetExternalAPI not available'); return; }
        const options: Record<string, unknown> = {
          roomName: activeRoomName,
          parentNode: container,
          width: '100%',
          height: '100%',
          userInfo: { displayName: userDisplayName },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            disableThirdPartyRequests: true,
            analytics: { disabled: true },
            notifications: [],
            enableNoisyMicDetection: false,
            enableNoAudioDetection: false,
            enableAuth: false,
            enableFeaturesBasedOnToken: false,
            p2p: { enabled: true },
            lobbyChatEnabled: false,
            enableLobbyChat: false,
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
            DEFAULT_LOGO_URL: '',
            JITSI_WATERMARK_LINK: '',
          },
        };
        const api = new JitsiAPI(domain, options);
        setTimeout(() => {
          const iframe = container.querySelector('iframe');
          if (iframe) {
            iframe.setAttribute('allow', 'camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *');
          }
        }, 1500);
        // Track mic state so teacher-mute sync can toggle correctly
        (api as any).addListener('audioMuteStatusChanged', (e: unknown) => {
          micMutedRef.current = Boolean((e as any)?.muted);
        });
        // Network quality listener
        (api as any).addListener('connectionQualityChanged', (e: unknown) => {
          const ev = e as { quality?: number };
          const q = ev.quality ?? 100;
          if (q >= 60) setNetworkQuality('good');
          else if (q >= 30) setNetworkQuality('fair');
          else setNetworkQuality('poor');
        });
        jitsiApiRef.current = api;
      };

      const scriptId = 'jitsi-external-api';
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
      const scriptSrc = `https://${domain}/external_api.js`;
      if (existingScript && existingScript.src.includes(domain)) {
        init();
      } else {
        if (existingScript) existingScript.remove();
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = scriptSrc;
        script.async = true;
        script.onload = init;
        document.head.appendChild(script);
      }
    };

    initWithToken();

    return () => {
      destroyed = true;
      if (jitsiApiRef.current) { jitsiApiRef.current.dispose(); jitsiApiRef.current = null; }
    };
  }, [joined, userDisplayName, activeRoomName]);

  useEffect(() => {
    const init = async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) { navigate('/login'); return; }
      setUserId(authSession.user.id);

      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authSession.user.id).single();
      setUserDisplayName(profile?.display_name || 'Student');

      await fetchSession();
      await fetchChat();
    };
    init();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Realtime chat & session subscription
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`student-session-chat-${id}`)
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
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_sessions',
        filter: `id=eq.${id}`,
      }, (payload) => {
        const updated = payload.new as LiveSession;
        setSession(prev => prev ? { ...prev, ...updated } : prev);

        // ── Teacher ended the session → kick student out ──
        if ((payload.new as any).status === 'ended') {
          toast.info('📴 Mësuesi mbylli sesionin. Po largoheni...', { duration: 4000 });
          if (jitsiApiRef.current) { jitsiApiRef.current.dispose(); jitsiApiRef.current = null; }
          setTimeout(() => navigate('/student/live-sessions'), 3000);
          return;
        }

        // Sync session controls
        const u = payload.new as any;
        if (u.chat_enabled !== undefined) {
          const next = u.chat_enabled !== false;
          setChatEnabled(next);
          if (!next) toast.warning('💬 Mësuesi bllokoi chat-in');
        }
        if (u.reactions_enabled !== undefined) {
          const next = u.reactions_enabled !== false;
          setReactionsEnabled(next);
          if (!next) toast.warning('😶 Mësuesi bllokoi reaksionet');
        }
        if (u.raise_hand_enabled !== undefined) {
          const next = u.raise_hand_enabled !== false;
          setRaiseHandEnabled(next);
          if (!next) { toast.warning('✋ Mësuesi bllokoi ngritjen e dorës'); setHandRaised(false); }
        }
        // Check for pushed quiz (live_quiz_id set on session)
        if (u.live_quiz_id && u.live_quiz_title) {
          setLiveQuizPush({ quizId: u.live_quiz_id, quizTitle: u.live_quiz_title, sessionId: id! });
          toast.info(`📝 Mësuesi nisi kuizin: ${u.live_quiz_title}`);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChatRealtimeConnected(true);
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setChatRealtimeConnected(false);
          console.warn('[live-chat] Student chat realtime status:', status);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Teacher mute/unmute: listen for is_muted changes on own participant row
  useEffect(() => {
    if (!id || !userId) return;
    const channel = supabase
      .channel(`student-mute-${id}-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${id}`,
      }, (payload) => {
        const row = payload.new as any;
        if (row.user_id !== userId) return;
        const shouldBeMuted = Boolean(row.is_muted);
        if (shouldBeMuted !== micMutedRef.current && jitsiApiRef.current) {
          (jitsiApiRef.current as any).executeCommand('toggleAudio');
          toast.info(shouldBeMuted ? '🔇 Mësuesi ju bëri mute' : '🎤 Mësuesi ju dha mikrofonin');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, userId]);

  // Log leave on unmount
  useEffect(() => {
    return () => {
      if (joined && userId && id) {
        authFetch(`/api/teacher/live-sessions/${id}/leave`, {
          method: 'POST',
          body: JSON.stringify({ user_id: userId }),
        }).catch(() => {});
      }
    };
  }, [joined, userId, id]);

  const fetchSession = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/student/live-sessions/${id}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.session);
        setChatEnabled(json.session.chat_enabled !== false);
        setReactionsEnabled(json.session.reactions_enabled !== false);
        setRaiseHandEnabled(json.session.raise_hand_enabled !== false);
      } else {
        toast.error(t('errors.notFound'));
        navigate('/student/live-sessions');
      }
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchChat = async () => {
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}/chat`);
      const json = await res.json();
      if (json.success) setChatMessages(json.messages || []);
    } catch { /* silent */ }
  };

  const handleJoin = async () => {
    if (!userId) return;
    setJoining(true);
    try {
      await authFetch(`/api/teacher/live-sessions/${id}/join`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      });
      setJoined(true);
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setJoining(false);
    }
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
      const json = await res.json();
      setChatInput('');
      // Optimistically add to UI from API response — dedup guard in Realtime handler prevents duplicates
      if (json.success && json.message) {
        const sent = json.message;
        const sentWithSender = {
          ...sent,
          sender: sent.sender || { id: userId, display_name: userDisplayName || 'You', avatar_url: null },
        };
        setChatMessages(prev => prev.some(m => m.id === sent.id) ? prev : [...prev, sentWithSender]);
      } else if (!chatRealtimeConnected) {
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

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          {t('liveSessionStudent.loadingSession')}
        </div>
      </StudentLayout>
    );
  }

  if (!session) return null;

  const isLive = session.status === 'live';
  const isEnded = session.status === 'ended';

  return (
    <StudentLayout>
      <div className="space-y-6">
        <button
          onClick={() => navigate('/student/live-sessions')}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> {t('liveSessionStudent.liveClasses')}
        </button>

        {/* Session Info */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{session.title}</h1>
                <span className={cn(
                  'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide',
                  isLive ? 'bg-rose-100 text-rose-700' :
                  isEnded ? 'bg-slate-100 text-slate-600' :
                  'bg-blue-100 text-blue-700'
                )}>
                  {isLive ? t('liveSessions.liveNow2') : isEnded ? t('liveSessions.ended') : t('liveSessions.upcoming2')}
                </span>
                {isLive && timeRemaining !== null && (
                  <span className={cn(
                    'px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide',
                    timeRemaining < 300 ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-slate-100 text-slate-600'
                  )}>
                    {t('liveSessions.timeRemaining', { time: formatTime(timeRemaining) })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500 flex-wrap">
                {session.host && <span>{session.host.display_name}</span>}
                {session.course && (
                  <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {session.course.title}</span>
                )}
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {format(new Date(session.scheduled_at), 'MMM d, yyyy · h:mm a')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {session.duration_minutes} min
                </span>
              </div>
              {session.description && (
                <p className="text-sm text-slate-500 mt-2 line-clamp-2">{session.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Live Banner */}
        {isLive && !joined && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-lg shadow-rose-200"
          >
            <div className="flex items-center gap-3 text-white">
              <Radio className="w-6 h-6 animate-pulse" />
              <div>
                <p className="font-bold">{t('liveSessionStudent.sessionIsLiveNow')}</p>
                <p className="text-rose-100 text-sm">{t('liveSessionStudent.joinToParticipate')}</p>
              </div>
            </div>
            <button
              onClick={handleJoin}
              disabled={joining}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-rose-600 rounded-xl font-bold text-sm hover:bg-rose-50 transition-all shadow-lg disabled:opacity-70"
            >
              {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              {t('liveSessionStudent.joinNow')}
            </button>
          </motion.div>
        )}

        {/* Ended - Show Recording */}
        {isEnded && (() => {
          const allUrls: string[] = Array.isArray(session.recording_urls) && session.recording_urls.length > 0
            ? session.recording_urls
            : session.recording_url ? [session.recording_url] : [];
          if (allUrls.length === 0) return null;
          return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t('liveSessionStudent.sessionRecording')}
                {allUrls.length > 1 && (
                  <span className="ml-1 text-xs font-normal text-slate-500">({allUrls.length} {t('liveSessions.recordings', { count: allUrls.length })})</span>
                )}
              </h3>
              <div className="flex flex-col gap-4">
                {allUrls.map((url, i) => (
                  <div key={url}>
                    {allUrls.length > 1 && (
                      <p className="text-xs text-slate-500 mb-1 font-medium">Part {i + 1}</p>
                    )}
                    <video src={url} controls className="w-full rounded-xl" style={{ maxHeight: 400 }} />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Video Room (when live) */}
        {isLive && (
          <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl relative" style={{ height: 'calc(100vh - 260px)', minHeight: 560 }}>
            {joined ? (
              <div className="flex h-full">
                <div className="flex-1 relative h-full">
                  {/* Mobile: open in new tab instead of embedding Jitsi */}
                  {isMobile ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-6 bg-slate-900">
                      <div className="w-20 h-20 rounded-full bg-emerald-600/20 border-2 border-emerald-500 flex items-center justify-center">
                        <Video className="w-10 h-10 text-emerald-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-white mb-2">{t('liveSessionStudent.sessionIsLiveNow')}</p>
                        <p className="text-white/50 text-sm">{t('liveSessionStudent.openMeetingDesc')}</p>
                      </div>
                      <a
                        href={jitsiMeetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-base transition-all shadow-xl shadow-emerald-900/40"
                      >
                        <Video className="w-5 h-5" />
                        {t('liveSessionStudent.openMeeting')}
                      </a>
                      <p className="text-white/30 text-xs text-center">{t('liveSessionStudent.openMeetingHint')}</p>
                    </div>
                  ) : (
                    /* Desktop: embed Jitsi External API */
                    <div ref={jitsiContainerRef} className="w-full h-full" />
                  )}
                  {/* Network quality badge (desktop, when joined) */}
                  {!isMobile && networkQuality && (
                    <div className={cn(
                      'absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold z-10 backdrop-blur-sm',
                      networkQuality === 'good' ? 'bg-emerald-600/80 text-white' :
                      networkQuality === 'fair' ? 'bg-amber-500/80 text-white' :
                      'bg-rose-600/80 text-white'
                    )}>
                      {networkQuality === 'good' ? <Wifi className="w-3 h-3" /> :
                       networkQuality === 'fair' ? <Wifi className="w-3 h-3" /> :
                       <WifiOff className="w-3 h-3" />}
                      {networkQuality === 'good' ? 'Good' : networkQuality === 'fair' ? 'Fair' : 'Poor'}
                    </div>
                  )}
                  {/* Floating Reactions */}
                  <div className="absolute bottom-20 right-4 pointer-events-none z-10">
                    <AnimatePresence>
                      {floatingReactions.map(r => (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 1, y: 0, scale: 0.5 }}
                          animate={{ opacity: 0, y: -100, scale: 1.5 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 3 }}
                          className="text-3xl"
                        >
                          {r.emoji}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Chat Sidebar */}
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: 280 }}
                      exit={{ width: 0 }}
                      className="bg-slate-800 flex flex-col overflow-hidden border-l border-slate-700 h-full shrink-0"
                    >
                      <div className="p-3 border-b border-slate-700 flex items-center justify-between shrink-0">
                        <span className="text-white text-sm font-semibold flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-emerald-400" /> Chat
                        </span>
                        <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {chatMessages.length === 0 ? (
                          <p className="text-slate-500 text-xs text-center mt-8">{t('liveSessionStudent.noMessagesYet')}</p>
                        ) : (
                          chatMessages.map(msg => (
                            <div key={msg.id} className={cn('flex gap-2', msg.sender_id === userId ? 'flex-row-reverse' : '')}>
                              <div className="w-6 h-6 rounded-full bg-emerald-600/30 flex items-center justify-center text-emerald-300 font-bold text-[10px] shrink-0">
                                {msg.sender?.display_name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div className={cn('max-w-[160px]', 'flex flex-col gap-0.5', msg.sender_id === userId ? 'items-end' : 'items-start')}>
                                <span className="text-[9px] text-slate-500">{msg.sender?.display_name}</span>
                                <div className={cn(
                                  'px-2.5 py-1.5 rounded-xl text-xs',
                                  msg.sender_id === userId ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-slate-700 text-slate-200 rounded-tl-sm'
                                )}>
                                  {msg.message}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        <div ref={chatEndRef} />
                      </div>
                      <div className="p-2 border-t border-slate-700 shrink-0">
                        <form onSubmit={e => { e.preventDefault(); sendChat(); }} className="flex gap-1.5">
                          <input
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            placeholder={t('liveSessionStudent.messagePlaceholder')}
                            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                          />
                          <button type="submit" disabled={sendingChat || !chatInput.trim()}
                            className="p-1.5 bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                            <Send className="w-3.5 h-3.5 text-white" />
                          </button>
                        </form>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-5 text-white/70">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                  <Video className="w-10 h-10 text-white/30" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-white mb-1">{t('liveSessionStudent.sessionIsLive')}</p>
                  <p className="text-sm text-white/50">{t('liveSessionStudent.clickJoinToEnter')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls (when live and joined) */}
        {isLive && joined && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-center gap-3 flex-wrap">
            {/* Raise Hand */}
            <button
              onClick={async () => {
                if (!raiseHandEnabled) { toast.warning('✋ Mësuesi ka bllokuar ngritjen e dorës'); return; }
                const next = !handRaised;
                setHandRaised(next);
                toast.info(next ? t('liveSessionStudent.handRaised') : t('liveSessionStudent.handLowered'));
                if (userId) {
                  authFetch(`/api/teacher/live-sessions/${id}/participants/${userId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ is_hand_raised: next }),
                  }).catch(() => {});
                }
              }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                !raiseHandEnabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                  : handRaised
                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              <Hand className="w-4 h-4" />
              {handRaised ? t('liveSessionStudent.lowerHand') : t('liveSessionStudent.raiseHand')}
              {!raiseHandEnabled && <span className="text-[10px] text-rose-500 font-normal">bllokuar</span>}
            </button>

            {/* Reactions */}
            <div className="relative">
              <button
                onClick={() => {
                  if (!reactionsEnabled) { toast.warning('😶 Mësuesi ka bllokuar reaksionet'); return; }
                  setShowReactions(v => !v);
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  !reactionsEnabled
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                <Smile className="w-4 h-4" /> {t('liveSessionStudent.reactions')}
                {!reactionsEnabled && <span className="text-[10px] text-rose-500 font-normal">bllokuar</span>}
              </button>
              <AnimatePresence>
                {showReactions && reactionsEnabled && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-12 left-0 bg-white border border-slate-200 rounded-2xl p-2 flex gap-1 shadow-xl z-10"
                  >
                    {REACTIONS.map(e => (
                      <button key={e} onClick={() => sendReaction(e)} className="text-xl p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
                        {e}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Chat toggle */}
            <button
              onClick={() => {
                if (!chatEnabled) { toast.warning('💬 Mësuesi ka bllokuar chat-in'); return; }
                setSidebarOpen(v => !v);
              }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                !chatEnabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                  : sidebarOpen
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              <MessageSquare className="w-4 h-4" /> {t('liveSessionStudent.chat')}
              {!chatEnabled && <span className="text-[10px] text-rose-500 font-normal">bllokuar</span>}
              {chatEnabled && chatMessages.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500 text-white rounded-full">{chatMessages.length}</span>
              )}
            </button>

            {/* Copy invite link */}
            <button
              onClick={() => {
                const url = `${window.location.origin}/student/live-sessions/${id}`;
                navigator.clipboard.writeText(url).then(() => {
                  setLinkCopied(true);
                  toast.success('Linku u kopjua!');
                  setTimeout(() => setLinkCopied(false), 3000);
                }).catch(() => toast.error('Nuk u kopjua'));
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-semibold transition-all"
            >
              {linkCopied ? <ClipboardCheck className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {linkCopied ? 'U kopjua!' : 'Kopjo linkun'}
            </button>
          </div>
        )}

        {/* Upcoming info */}
        {!isLive && !isEnded && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 text-blue-400" />
            <p className="font-semibold text-blue-800">{t('liveSessionStudent.sessionScheduled')}</p>
            <p className="text-sm text-blue-600 mt-1">
              {t('liveSessionStudent.startsIn', { time: formatDistanceToNow(new Date(session.scheduled_at), { addSuffix: true }) })}
            </p>
          </div>
        )}
      </div>

      {/* Push-quiz modal */}
      <AnimatePresence>
        {liveQuizPush && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
                <PlayCircle className="w-7 h-7 text-violet-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Kuiz i ri nga mësuesi!</h3>
              <p className="text-slate-500 text-sm mb-5">
                <span className="font-semibold text-slate-700">{liveQuizPush.quizTitle}</span> — mësuesi ka nisur këtë kuiz gjatë sesionit live.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setLiveQuizPush(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition"
                >
                  Më vonë
                </button>
                <a
                  href={`/student/quiz/${liveQuizPush.quizId}`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition"
                  onClick={() => setLiveQuizPush(null)}
                >
                  <ExternalLink className="w-4 h-4" /> Hap kuizin
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation warning confirmation */}
      {showNavWarning && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Video className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Po largohesh nga sesioni?</h3>
            <p className="text-slate-500 text-sm mb-6">
              Nëse largohesh, do të shkëputesh nga sesioni live. A je i sigurt?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNavWarning(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition"
              >
                Qëndro
              </button>
              <button
                onClick={() => { setShowNavWarning(false); navigate('/student/live-sessions'); }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition"
              >
                Largohu
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentLayout>
  );
}
