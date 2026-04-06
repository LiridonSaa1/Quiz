import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import {
  Video, Search, Radio, CalendarDays, Clock, CheckCircle2,
  XCircle, Users, Link2, BookOpen, Wifi, Play
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, formatDistanceToNow, isPast, isFuture, isWithinInterval, addMinutes } from 'date-fns';

type SessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  host_id: string | null;
  course_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  status: SessionStatus;
  max_participants: number;
  courseTitle: string;
  hostName: string;
}

const STATUS_CFG: Record<SessionStatus, { label: string; bg: string; text: string; dot: string; border: string; icon: React.ElementType }> = {
  scheduled: { label: 'Upcoming',  bg: 'bg-blue-50',   text: 'text-blue-700',  dot: 'bg-blue-500',   border: 'border-blue-200',  icon: CalendarDays },
  live:      { label: 'Live Now',  bg: 'bg-rose-50',   text: 'text-rose-700',  dot: 'bg-rose-500',   border: 'border-rose-200',  icon: Radio        },
  ended:     { label: 'Ended',     bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400',  border: 'border-slate-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', bg: 'bg-amber-50',  text: 'text-amber-700', dot: 'bg-amber-500',  border: 'border-amber-200', icon: XCircle      },
};

const TABS: { key: 'all' | SessionStatus; label: string }[] = [
  { key: 'all',       label: 'All'      },
  { key: 'live',      label: 'Live Now' },
  { key: 'scheduled', label: 'Upcoming' },
  { key: 'ended',     label: 'Ended'    },
];

export default function StudentLiveClasses() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | SessionStatus>('all');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const { data: courses } = await supabase.from('courses').select('id, title').contains('student_ids', [uid]);
      if (!courses?.length) { setLoading(false); return; }
      const courseIds = courses.map((c: any) => c.id);
      const courseMap: Record<string, string> = {};
      courses.forEach((c: any) => { courseMap[c.id] = c.title; });

      const { data } = await supabase
        .from('live_sessions')
        .select('*, host:profiles(display_name)')
        .in('course_id', courseIds)
        .order('scheduled_at', { ascending: false });

      setSessions((data || []).map((s: any) => ({
        ...s,
        courseTitle: courseMap[s.course_id] || 'Course',
        hostName: s.host?.display_name || 'Instructor',
      })));
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = sessions;
    if (search) list = list.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.courseTitle.toLowerCase().includes(search.toLowerCase()));
    if (tab !== 'all') list = list.filter(s => s.status === tab);
    return list;
  }, [sessions, search, tab]);

  const liveSessions = sessions.filter(s => s.status === 'live');
  const upcoming = sessions.filter(s => s.status === 'scheduled');

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/25 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                <Video className="w-3.5 h-3.5 text-rose-300" />
                <span className="text-white/80 text-xs font-semibold">Live Classes</span>
              </div>
              <h1 className="text-3xl font-black text-white">Live Classes</h1>
              <p className="text-slate-400 text-sm mt-1">Join live sessions with your instructors.</p>
              {liveSessions.length > 0 && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
                  className="mt-3 inline-flex items-center gap-2 bg-rose-500/30 border border-rose-400/40 rounded-xl px-3 py-1.5">
                  <motion.div className="w-2 h-2 rounded-full bg-rose-400"
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                  <span className="text-rose-200 text-xs font-bold">{liveSessions.length} session{liveSessions.length > 1 ? 's' : ''} live now!</span>
                </motion.div>
              )}
            </div>
            <div className="flex gap-3">
              {[
                { label: 'Total',    value: sessions.length  },
                { label: 'Live',     value: liveSessions.length },
                { label: 'Upcoming', value: upcoming.length  },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
                  className="bg-white/8 border border-white/10 rounded-2xl p-3 text-center min-w-[64px]">
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-slate-400 text-[10px] font-semibold">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Search + Tabs */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sessions..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 shadow-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn('px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all border',
                  tab === t.key ? 'bg-rose-600 text-white border-transparent shadow-lg shadow-rose-200' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sessions */}
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
              <Video className="w-8 h-8 text-rose-400" />
            </motion.div>
            <p className="text-slate-600 font-bold">No sessions found</p>
            <p className="text-slate-400 text-sm mt-1">No live classes scheduled for your courses yet.</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filtered.map((s, i) => {
                const cfg = STATUS_CFG[s.status];
                const StatusIcon = cfg.icon;
                const isLive = s.status === 'live';
                return (
                  <motion.div key={s.id}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    className={cn('bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden group', isLive ? 'border-rose-200' : 'border-slate-100')}>
                    {isLive && <div className="h-0.5 bg-gradient-to-r from-rose-500 to-pink-500" />}
                    <div className="p-5 flex items-start gap-4">
                      <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', cfg.bg, cfg.border, 'border')}>
                        {isLive
                          ? <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                              <Wifi className={cn('w-5 h-5', cfg.text)} />
                            </motion.div>
                          : <StatusIcon className={cn('w-5 h-5', cfg.text)} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={cn('flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-lg border', cfg.bg, cfg.text, cfg.border)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                            {cfg.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">{s.courseTitle}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-rose-600 transition-colors">{s.title}</h3>
                        {s.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{s.description}</p>}
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <CalendarDays className="w-3 h-3" /> {format(new Date(s.scheduled_at), 'MMM d, yyyy · h:mm a')}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" /> {s.duration_minutes} min
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Users className="w-3 h-3" /> Max {s.max_participants}
                          </span>
                        </div>
                      </div>
                      {isLive && s.meeting_url && (
                        <a href={s.meeting_url} target="_blank" rel="noreferrer"
                          className="shrink-0 flex items-center gap-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-rose-200/60 active:scale-95">
                          <Play className="w-3.5 h-3.5" /> Join
                        </a>
                      )}
                      {s.status === 'scheduled' && s.meeting_url && (
                        <a href={s.meeting_url} target="_blank" rel="noreferrer"
                          className="shrink-0 flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-100 transition-all">
                          <Link2 className="w-3.5 h-3.5" /> Link
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
