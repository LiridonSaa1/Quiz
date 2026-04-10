import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { supabase } from '../../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, CalendarDays, Clock, BookOpen, Loader2, Video, ArrowRight, CheckCircle2, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

interface SessionItem {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  recording_url: string | null;
  host: { id: string; display_name: string } | null;
}

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  scheduled: { label: 'Upcoming', bg: 'bg-blue-50', text: 'text-blue-700' },
  live: { label: 'Live Now', bg: 'bg-rose-50', text: 'text-rose-700' },
  ended: { label: 'Ended', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100', text: 'text-slate-500' },
};

export default function StudentLiveSessionsList() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) { navigate('/login'); return; }
      try {
        const res = await authFetch('/api/student/live-sessions');
        const json = await res.json();
        if (json.success) setSessions(json.sessions || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  return (
    <StudentLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Sessions</h1>
          <p className="text-slate-500 text-sm mt-1">Sessions you've been invited to join.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-20 text-center">
            <Video className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-medium text-slate-400">No sessions yet</p>
            <p className="text-sm text-slate-300 mt-1">Your teacher will invite you to sessions here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {sessions.map((s, i) => {
                const meta = STATUS_META[s.status] || STATUS_META.scheduled;
                const isLive = s.status === 'live';
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900">{s.title}</h3>
                          <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-bold', meta.bg, meta.text)}>
                            {isLive && <span className="mr-1">●</span>}{meta.label}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          {s.host && (
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" /> {s.host.display_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5" />
                            {format(new Date(s.scheduled_at), 'MMM d, yyyy · h:mm a')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {s.duration_minutes} min
                          </span>
                          <span className="text-slate-400">
                            {s.status === 'scheduled'
                              ? formatDistanceToNow(new Date(s.scheduled_at), { addSuffix: true })
                              : null}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-wrap items-center gap-2">
                        {isLive ? (
                          <button
                            onClick={() => navigate(`/student/live-sessions/${s.id}`)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                          >
                            <Radio className="w-4 h-4 animate-pulse" /> Join Now
                          </button>
                        ) : s.status === 'ended' ? (
                          <>
                            {s.recording_url && (
                              <a
                                href={s.recording_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-all"
                              >
                                <Download className="w-4 h-4" /> Recording
                              </a>
                            )}
                            <button
                              onClick={() => navigate(`/student/live-sessions/${s.id}`)}
                              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Details
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => navigate(`/student/live-sessions/${s.id}`)}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all"
                          >
                            <ArrowRight className="w-4 h-4" /> Details
                          </button>
                        )}
                      </div>
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
