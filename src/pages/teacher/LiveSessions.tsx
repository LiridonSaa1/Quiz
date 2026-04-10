import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Video, Search, CalendarDays, Clock, Radio, CheckCircle2,
  XCircle, Plus, Users, Play, Eye, Trash2, X, Loader2,
  BookOpen, ChevronDown, Download, UserCheck, ChevronUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';

type SessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

interface SessionRow {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: SessionStatus;
  meeting_url: string | null;
  recording_url: string | null;
  participant_count: number;
  course: { id: string; title: string } | null;
  class_id: string | null;
}

interface UserOption { id: string; display_name: string; email: string; }
interface ClassOption { id: string; name: string; student_ids: string[]; }

interface AttendanceEntry {
  user_id: string;
  role: string;
  joined_at: string | null;
  left_at: string | null;
  user: { id: string; display_name: string; email: string; avatar_url: string | null };
}

const STATUS_META: Record<SessionStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', icon: CalendarDays },
  live: { label: 'Live', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', icon: Radio },
  ended: { label: 'Ended', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', icon: XCircle },
};

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'live', label: 'Live Now' },
  { key: 'past', label: 'Past' },
] as const;

type TabKey = 'upcoming' | 'live' | 'past';

export default function TeacherLiveSessions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [userId, setUserId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedAttendance, setExpandedAttendance] = useState<string | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceEntry[]>>({});
  const [attendanceLoading, setAttendanceLoading] = useState<string | null>(null);

  const fetchAttendance = async (sessionId: string) => {
    if (attendanceMap[sessionId]) {
      setExpandedAttendance(prev => prev === sessionId ? null : sessionId);
      return;
    }
    setAttendanceLoading(sessionId);
    setExpandedAttendance(sessionId);
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${sessionId}/participants`);
      const json = await res.json();
      if (json.success) setAttendanceMap(prev => ({ ...prev, [sessionId]: json.participants || [] }));
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setAttendanceLoading(null);
    }
  };

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/teacher/live-sessions');
      const json = await res.json();
      if (json.success) setRows(json.sessions || []);
      else throw new Error(json.error);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);
      fetchSessions();
    };
    init();
  }, [fetchSessions]);

  // Realtime: reflect session status changes (e.g. another tab starts the session)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('teacher-live-sessions-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_sessions',
        filter: `host_id=eq.${userId}`,
      }, (payload) => {
        const updated = payload.new as SessionRow | undefined;
        const removed = payload.old as { id?: string } | undefined;
        if (payload.eventType === 'DELETE' && removed?.id) {
          setRows(prev => prev.filter(r => r.id !== removed.id));
        } else if (payload.eventType === 'INSERT' && updated?.id) {
          setRows(prev => {
            if (prev.find(r => r.id === updated.id)) return prev;
            return [updated, ...prev];
          });
        } else if (payload.eventType === 'UPDATE' && updated?.id) {
          setRows(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const stats = useMemo(() => ({
    total: rows.length,
    scheduled: rows.filter(r => r.status === 'scheduled').length,
    live: rows.filter(r => r.status === 'live').length,
    ended: rows.filter(r => r.status === 'ended').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      const matchSearch = r.title.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
      const matchTab =
        activeTab === 'upcoming' ? r.status === 'scheduled' :
        activeTab === 'live' ? r.status === 'live' :
        r.status === 'ended' || r.status === 'cancelled';
      return matchSearch && matchTab;
    });
  }, [rows, search, activeTab]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    setDeleting(id);
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setRows(prev => prev.filter(r => r.id !== id));
      toast.success('Session deleted');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to delete session');
    } finally {
      setDeleting(null);
    }
  };

  const handleStart = async (id: string) => {
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'live' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'live' as SessionStatus } : r));
      toast.success('Session started!');
      navigate(`/teacher/live-sessions/${id}/room`);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to start session');
    }
  };

  if (loading) {
    return (
      <TeacherLayout>
        <LayoutPageSkeleton cards={4} rows={6} />
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Sessions</h1>
            <p className="text-slate-500 text-sm mt-1">Manage your virtual classroom sessions.</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
          >
            <Plus className="w-4 h-4" /> New Session
          </motion.button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, icon: Video, color: 'text-violet-600', bg: 'bg-violet-50' },
            { label: 'Scheduled', value: stats.scheduled, icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Live Now', value: stats.live, icon: Radio, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Ended', value: stats.ended, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"
            >
              <div className={cn('p-2 rounded-xl w-fit mb-2', stat.bg)}>
                <stat.icon className={cn('w-4 h-4', stat.color)} />
              </div>
              <div className={cn('text-2xl font-bold', stat.color)}>{stat.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs + Search */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1 w-fit">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
                  activeTab === tab.key
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab.label}
                {tab.key === 'live' && stats.live > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-rose-500 text-white rounded-full">
                    {stats.live}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sessions..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
        </div>

        {/* Session List */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center"
              >
                <Video className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="font-medium text-slate-400">No sessions found</p>
                <p className="text-sm text-slate-300 mt-1">
                  {activeTab === 'upcoming' ? 'Schedule a new session to get started.' : 'No sessions in this category.'}
                </p>
              </motion.div>
            ) : (
              filtered.map((row, i) => {
                const meta = STATUS_META[row.status];
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900">{row.title}</h3>
                          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold', meta.bg, meta.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot, row.status === 'live' && 'animate-pulse')} />
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </div>
                        {row.description && (
                          <p className="text-sm text-slate-500 mt-1 line-clamp-1">{row.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5" />
                            {format(new Date(row.scheduled_at), 'MMM dd, yyyy HH:mm')}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {row.duration_minutes} min
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {row.participant_count} {row.status === 'ended' ? 'attendees' : 'invited'}
                          </span>
                          {row.course && (
                            <span className="inline-flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" />
                              {row.course.title}
                            </span>
                          )}
                          <span className="text-slate-400">
                            {formatDistanceToNow(new Date(row.scheduled_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.status === 'scheduled' && (
                          <button
                            onClick={() => handleStart(row.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
                          >
                            <Play className="w-3.5 h-3.5" /> Start
                          </button>
                        )}
                        {row.status === 'live' && (
                          <button
                            onClick={() => navigate(`/teacher/live-sessions/${row.id}/room`)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                          >
                            <Radio className="w-3.5 h-3.5 animate-pulse" /> Rejoin
                          </button>
                        )}
                        {row.status === 'ended' && (
                          <>
                            {row.recording_url && (
                              <a
                                href={row.recording_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-all"
                                title="Download recording"
                              >
                                <Download className="w-3.5 h-3.5" /> Recording
                              </a>
                            )}
                            <button
                              onClick={() => fetchAttendance(row.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 border border-violet-200 text-violet-700 bg-violet-50 rounded-xl text-xs font-semibold hover:bg-violet-100 transition-all"
                            >
                              {attendanceLoading === row.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : expandedAttendance === row.id ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                              Attendance
                            </button>
                            <button
                              onClick={() => navigate(`/teacher/live-sessions/${row.id}/room`)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" /> View
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => navigate(`/teacher/live-sessions/${row.id}/room`)}
                          className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all"
                          title="Open room"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          disabled={deleting === row.id}
                          className="p-2 rounded-xl border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                          title="Delete"
                        >
                          {deleting === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Attendance detail panel — expanded for past sessions */}
                    {row.status === 'ended' && expandedAttendance === row.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-3 border-t border-slate-100 pt-3"
                      >
                        <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" /> Attendance List
                        </p>
                        {attendanceLoading === row.id ? (
                          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                          </div>
                        ) : (attendanceMap[row.id] || []).length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No attendance data recorded.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {(attendanceMap[row.id] || []).map((entry) => {
                              const joined = !!entry.joined_at;
                              return (
                                <div
                                  key={entry.user_id}
                                  className={cn(
                                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs',
                                    joined ? 'bg-emerald-50' : 'bg-slate-50'
                                  )}
                                >
                                  <div className={cn('w-2 h-2 rounded-full shrink-0', joined ? 'bg-emerald-400' : 'bg-slate-300')} />
                                  <span className="font-medium text-slate-700 truncate">{entry.user?.display_name || 'Unknown'}</span>
                                  <span className="text-slate-400 truncate">{entry.user?.email}</span>
                                  {joined ? (
                                    <span className="ml-auto text-emerald-600 font-semibold shrink-0">Attended</span>
                                  ) : (
                                    <span className="ml-auto text-slate-400 shrink-0">Invited</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* New Session Modal */}
      <AnimatePresence>
        {showModal && (
          <NewSessionModal
            onClose={() => setShowModal(false)}
            onCreated={(session) => {
              setRows(prev => [session, ...prev]);
              setShowModal(false);
              toast.success('Session created!');
            }}
          />
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}

function NewSessionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (session: SessionRow) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduled_at: '',
    duration_minutes: 60,
    course_id: '',
    class_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const fetchClasses = async () => {
      const res = await authFetch('/api/teacher/classes');
      const json = await res.json();
      if (json.success) setClasses(json.classes || []);
    };
    fetchClasses();
  }, []);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await authFetch(`/api/teacher/users/search?q=${encodeURIComponent(q)}&role=student`);
      const json = await res.json();
      if (json.success) setSearchResults(json.users || []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(userSearch), 400);
    return () => clearTimeout(t);
  }, [userSearch, searchUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_at) {
      toast.error('Title and scheduled time are required');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch('/api/teacher/live-sessions', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          status: 'scheduled',
          max_participants: 100,
          course_id: form.course_id || null,
          class_id: form.class_id || null,
          participant_ids: selectedUsers.map(u => u.id),
          duration_minutes: Number(form.duration_minutes),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onCreated({ ...json.session, participant_count: selectedUsers.length });
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to create session');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">New Live Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Session Title *</label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Introduction to Algebra"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What will be covered in this session?"
              rows={3}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Scheduled At *</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Duration (min)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={e => setForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))}
                min={15}
                max={480}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
          </div>

          {/* Invite by class */}
          {classes.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Invite Entire Class</label>
              <div className="relative">
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={form.class_id}
                  onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 appearance-none pr-9"
                >
                  <option value="">— Select a class —</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.student_ids?.length || 0} students)</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Invite individual students */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Invite Students Individually</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-lg">
                {searchResults.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      if (!selectedUsers.find(s => s.id === u.id)) {
                        setSelectedUsers(prev => [...prev, u]);
                      }
                      setUserSearch('');
                      setSearchResults([]);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-violet-50 flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-xs shrink-0">
                      {u.display_name[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{u.display_name}</p>
                      <p className="text-xs text-slate-400 truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedUsers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedUsers.map(u => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-semibold">
                    {u.display_name}
                    <button type="button" onClick={() => setSelectedUsers(prev => prev.filter(s => s.id !== u.id))} className="hover:text-violet-900 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Session'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
