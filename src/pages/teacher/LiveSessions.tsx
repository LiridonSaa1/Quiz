import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format, formatDistanceToNow, isPast, isFuture } from 'date-fns';
import {
  Video, Plus, Search, Trash2, Pencil, X,
  Clock, BookOpen, CalendarDays, Radio, CheckCircle2,
  XCircle, Play, Link2, Users, Zap, ChevronRight, Wifi
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../supabase';

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
  created_at: string;
  host?: { id: string; display_name: string; email: string } | null;
  course?: { id: string; title: string } | null;
}

interface Course { id: string; title: string }

const STATUS_CFG: Record<SessionStatus, { label: string; bg: string; text: string; dot: string; border: string; icon: React.ElementType }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   border: 'border-blue-200',   icon: CalendarDays },
  live:      { label: 'Live Now',  bg: 'bg-rose-50',    text: 'text-rose-700',   dot: 'bg-rose-500',   border: 'border-rose-200',   icon: Radio        },
  ended:     { label: 'Ended',     bg: 'bg-slate-100',  text: 'text-slate-500',  dot: 'bg-slate-400',  border: 'border-slate-200',  icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200',  icon: XCircle      },
};

const TABS = [
  { key: 'all',       label: 'All Sessions' },
  { key: 'live',      label: 'Live Now'     },
  { key: 'scheduled', label: 'Upcoming'     },
  { key: 'ended',     label: 'Ended'        },
  { key: 'cancelled', label: 'Cancelled'    },
];

const defaultForm = () => ({
  title: '', description: '', course_id: '',
  scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  duration_minutes: 60, meeting_url: '',
  status: 'scheduled' as SessionStatus, max_participants: 100,
});

export default function TeacherLiveSessions() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LiveSession | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const fetchSessions = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/live-sessions');
      const json = await res.json();
      if (json.success) {
        const mine = (json.sessions || []).filter((s: LiveSession) => s.host_id === tid);
        setSessions(mine);
      } else toast.error(json.error || 'Failed to load sessions');
    } catch { toast.error('Failed to load sessions'); }
    finally { setLoading(false); }
  }, []);

  const fetchCourses = useCallback(async (tid: string) => {
    try {
      const { data } = await supabase.from('courses').select('id,title').eq('teacher_id', tid);
      setCourses(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setTeacherId(session.user.id);
        fetchSessions(session.user.id);
        fetchCourses(session.user.id);
      }
    });
  }, [fetchSessions, fetchCourses]);

  const openCreate = () => { setEditing(null); setForm(defaultForm()); setShowModal(true); };
  const openEdit = (s: LiveSession) => {
    setEditing(s);
    setForm({
      title: s.title, description: s.description || '', course_id: s.course_id || '',
      scheduled_at: s.scheduled_at.slice(0, 16),
      duration_minutes: s.duration_minutes, meeting_url: s.meeting_url || '',
      status: s.status, max_participants: s.max_participants,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.scheduled_at) { toast.error('Scheduled date is required'); return; }
    if (!teacherId) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        host_id: teacherId,
        course_id: form.course_id || null,
        meeting_url: form.meeting_url || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      };
      const url = editing ? `/api/admin/live-sessions/${editing.id}` : '/api/admin/live-sessions';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Session updated' : 'Session scheduled');
      setShowModal(false);
      fetchSessions(teacherId);
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId || !teacherId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/live-sessions/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Session deleted');
      setDeleteId(null);
      fetchSessions(teacherId);
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase();
    const matchQ = s.title.toLowerCase().includes(q) || (s.course?.title || '').toLowerCase().includes(q);
    const matchTab = activeTab === 'all' || s.status === activeTab;
    return matchQ && matchTab;
  });

  const stats = {
    total: sessions.length,
    live: sessions.filter(s => s.status === 'live').length,
    upcoming: sessions.filter(s => s.status === 'scheduled' && isFuture(new Date(s.scheduled_at))).length,
    ended: sessions.filter(s => s.status === 'ended').length,
  };

  const nextSession = sessions
    .filter(s => s.status === 'scheduled' && isFuture(new Date(s.scheduled_at)))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  const liveSession = sessions.find(s => s.status === 'live');

  const tabCounts: Record<string, number> = {
    all: sessions.length,
    live: stats.live,
    scheduled: stats.upcoming,
    ended: stats.ended,
    cancelled: sessions.filter(s => s.status === 'cancelled').length,
  };

  return (
    <TeacherLayout>
      <div className="space-y-6 pb-6">

        {/* ── Hero Header ───────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 p-6 sm:p-8">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #7c3aed 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f6 0%, transparent 40%)' }} />
          <div className="absolute top-4 right-4 w-48 h-48 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/10">
                  <Wifi className="w-3 h-3" /> Broadcast Studio
                </span>
                {stats.live > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> ON AIR
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Live Sessions</h1>
              <p className="text-slate-400 text-sm mt-1">Host and manage real-time classes for your students</p>
              <div className="flex items-center gap-5 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{stats.total}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Total</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-rose-400">{stats.live}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Live</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">{stats.upcoming}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Upcoming</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{stats.ended}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Completed</p>
                </div>
              </div>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-5 py-3 bg-violet-500 hover:bg-violet-400 text-white rounded-xl font-semibold text-sm transition-all shadow-xl shadow-violet-900/50 active:scale-[0.97] shrink-0">
              <Plus className="w-4 h-4" /> Schedule Session
            </button>
          </div>
        </div>

        {/* ── Featured: Live or Next Session ──────────── */}
        {(liveSession || nextSession) && (() => {
          const featured = liveSession || nextSession!;
          const isLive = featured.status === 'live';
          return (
            <div className={cn(
              'relative rounded-2xl p-5 sm:p-6 overflow-hidden border',
              isLive
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 border-rose-500/30'
                : 'bg-gradient-to-r from-violet-600 to-blue-600 border-violet-500/30'
            )}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }} />
              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                    isLive ? 'bg-white/20' : 'bg-white/15'
                  )}>
                    {isLive
                      ? <Radio className="w-6 h-6 text-white animate-pulse" />
                      : <Zap className="w-6 h-6 text-white" />
                    }
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white/70 uppercase tracking-wider mb-1">
                      {isLive ? 'Happening Right Now' : 'Up Next'}
                    </p>
                    <h2 className="text-lg font-bold text-white leading-tight">{featured.title}</h2>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {featured.course && (
                        <span className="flex items-center gap-1 text-white/70 text-xs">
                          <BookOpen className="w-3 h-3" /> {featured.course.title}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-white/70 text-xs">
                        <Clock className="w-3 h-3" /> {featured.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1 text-white/70 text-xs">
                        <CalendarDays className="w-3 h-3" />
                        {isLive ? 'Started ' : ''}{formatDistanceToNow(new Date(featured.scheduled_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                <Link to={`/teacher/live-sessions/${featured.id}/room`}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-bold hover:bg-white/90 transition-all shadow-lg shrink-0">
                  <Play className="w-4 h-4" />
                  {isLive ? 'Join Now' : 'Enter Room'}
                </Link>
              </div>
            </div>
          );
        })()}

        {/* ── Search + Tabs ─────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search sessions or courses..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all" />
            </div>
          </div>
          <div className="flex overflow-x-auto px-4 gap-1 py-2 scrollbar-hide">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                  activeTab === tab.key
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                )}>
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-md text-xs font-bold',
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  )}>{tabCounts[tab.key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Sessions Grid ──────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-100 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded" />
                  <div className="h-3 bg-slate-100 rounded w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-4">
              <Video className="w-10 h-10 text-violet-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              {search ? 'No sessions match your search' : 'No sessions yet'}
            </h3>
            <p className="text-slate-400 text-sm max-w-xs">
              {search ? 'Try a different keyword or clear the search.' : 'Schedule your first live session and start teaching in real time.'}
            </p>
            {!search && (
              <button onClick={openCreate}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200">
                <Plus className="w-4 h-4" /> Schedule Now
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(s => {
              const cfg = STATUS_CFG[s.status];
              const isLive = s.status === 'live';
              const isUpcoming = s.status === 'scheduled' && isFuture(new Date(s.scheduled_at));

              return (
                <div key={s.id}
                  className={cn(
                    'group bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col',
                    isLive ? 'border-rose-200 ring-2 ring-rose-100' : 'border-slate-100'
                  )}>
                  <div className={cn(
                    'h-1.5',
                    isLive ? 'bg-gradient-to-r from-rose-500 to-pink-500' :
                    isUpcoming ? 'bg-gradient-to-r from-violet-500 to-blue-500' :
                    s.status === 'ended' ? 'bg-gradient-to-r from-slate-300 to-slate-400' :
                    'bg-gradient-to-r from-amber-400 to-orange-400'
                  )} />

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className={cn(
                        'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
                        isLive
                          ? 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-200'
                          : isUpcoming
                            ? 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200'
                            : 'bg-slate-100'
                      )}>
                        {isLive
                          ? <Radio className="w-5 h-5 text-white animate-pulse" />
                          : <Video className={cn('w-5 h-5', isUpcoming ? 'text-white' : 'text-slate-400')} />
                        }
                      </div>
                      <span className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', cfg.bg, cfg.text, cfg.border)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot, isLive ? 'animate-pulse' : '')} />
                        {cfg.label}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 leading-snug mb-1 line-clamp-2">{s.title}</h3>
                    {s.description && (
                      <p className="text-slate-400 text-xs line-clamp-2 mb-3">{s.description}</p>
                    )}

                    <div className="flex flex-col gap-1.5 mt-auto pt-3 border-t border-slate-50">
                      {s.course && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{s.course.title}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{format(new Date(s.scheduled_at), 'MMM d, yyyy · h:mm a')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{s.duration_minutes} min</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>Up to {s.max_participants}</span>
                        </div>
                      </div>
                      {isUpcoming && (
                        <p className="text-xs font-semibold text-violet-600 flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {formatDistanceToNow(new Date(s.scheduled_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-5 pb-4 flex items-center gap-2">
                    <Link to={`/teacher/live-sessions/${s.id}/room`}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all',
                        isLive
                          ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-200'
                          : 'bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-200'
                      )}>
                      <Play className="w-3.5 h-3.5" />
                      {isLive ? 'Join Now' : 'Enter Room'}
                    </Link>
                    <button onClick={() => openEdit(s)}
                      className="p-2.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all border border-slate-100">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteId(s.id)}
                      className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-slate-400">
            Showing {filtered.length} of {sessions.length} sessions
          </p>
        )}
      </div>

      {/* ── Schedule / Edit Modal ─────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-slate-100 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-200">
                  <Video className="w-4.5 h-4.5 text-white w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Session' : 'Schedule New Session'}</h2>
                  <p className="text-slate-400 text-xs">{editing ? 'Update session details' : 'Fill in the details below to get started'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Session Title <span className="text-rose-400 normal-case font-normal tracking-normal">required</span>
                </label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all"
                  placeholder="e.g. Weekly Q&A · Chapter 3 Review" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
                <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all resize-none"
                  placeholder="What will you cover? Help students know what to expect." />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Course</label>
                <select value={form.course_id} onChange={e => set('course_id', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all">
                  <option value="">— Not linked to a course —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Date & Time <span className="text-rose-400 normal-case font-normal tracking-normal">required</span>
                  </label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Duration (min)</label>
                  <input type="number" min={15} max={480} value={form.duration_minutes}
                    onChange={e => set('duration_minutes', parseInt(e.target.value) || 60)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  <span className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" />External Meeting URL <span className="normal-case font-normal tracking-normal text-slate-400">(optional)</span></span>
                </label>
                <input value={form.meeting_url} onChange={e => set('meeting_url', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all"
                  placeholder="https://zoom.us/j/... or https://meet.google.com/..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as SessionStatus)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Max Participants</label>
                  <input type="number" value={form.max_participants}
                    onChange={e => set('max_participants', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all" />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50/80 backdrop-blur-sm px-6 py-4 border-t border-slate-100 rounded-b-2xl flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 disabled:opacity-50">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editing ? 'Save Changes' : 'Schedule Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ───────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
                <Trash2 className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete this session?</h3>
              <p className="text-slate-500 text-sm leading-relaxed">This can't be undone. Students will no longer be able to join or see this session.</p>
            </div>
            <div className="p-4 bg-slate-50 flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-100 transition-all">
                Keep It
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
