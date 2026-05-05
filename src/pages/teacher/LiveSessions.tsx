import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_SELECT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import {
  Video, Plus, Search, Trash2, Pencil, X,
  BookOpen, CalendarDays, Radio, CheckCircle2,
  XCircle, Play, Loader2, Users, Download,
  UserCheck, ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTeacherPermissions } from '../../lib/teacherPermissions';

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
  recording_url?: string | null;
  participant_count?: number;
  host?: { id: string; display_name: string; email: string } | null;
  course?: { id: string; title: string } | null;
}

interface CourseOption { id: string; title: string }

const STATUS_CFG: Record<SessionStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  scheduled:  { label: 'Scheduled',  bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    icon: CalendarDays  },
  live:       { label: 'Live Now',   bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    icon: Radio         },
  ended:      { label: 'Ended',      bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: CheckCircle2  },
  cancelled:  { label: 'Cancelled',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: XCircle       },
};

const emptyForm = {
  title: '', description: '', course_id: '',
  scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  duration_minutes: 60, meeting_url: '', status: 'scheduled' as SessionStatus, max_participants: 100,
  recording_url: '',
};

interface UserOption { id: string; display_name: string; email: string; }
interface ClassOption { id: string; name: string; course_id?: string | null; student_ids: string[]; enrollment_count?: number; }

interface AttendanceEntry {
  user_id: string;
  role: string;
  joined_at: string | null;
  left_at: string | null;
  user: { id: string; display_name: string; email: string; avatar_url: string | null };
}

export default function TeacherLiveSessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editing, setEditing] = useState<LiveSession | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedAttendance, setExpandedAttendance] = useState<string | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceEntry[]>>({});
  const [attendanceLoading, setAttendanceLoading] = useState<string | null>(null);
  const { can } = useTeacherPermissions();

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const fetchCourses = useCallback(async (uid: string) => {
    try {
      const res = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(uid)}`);
      const json = await res.json();
      if (json.success) setCourses((json.courses || []).map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })));
    } catch { /* ignore */ }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/teacher/live-sessions');
      const json = await res.json();
      if (json.success) setSessions(json.sessions || []);
      else toast.error(json.error || 'Failed to load sessions');
    } catch { toast.error('Failed to load sessions'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const uid = session.user.id;
      setUserId(uid);
      fetchCourses(uid);
      fetchAll();
    };
    init();
  }, [fetchAll, fetchCourses]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('teacher-live-sessions-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_sessions',
        filter: `host_id=eq.${userId}`,
      }, () => { fetchAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAll]);

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

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    });
    setShowCreateModal(true);
  };

  const openEdit = (s: LiveSession) => {
    setEditing(s);
    setForm({
      title: s.title,
      description: s.description || '',
      course_id: s.course_id || '',
      scheduled_at: s.scheduled_at.slice(0, 16),
      duration_minutes: s.duration_minutes,
      meeting_url: s.meeting_url || '',
      status: s.status,
      max_participants: s.max_participants,
      recording_url: s.recording_url || '',
    });
    setShowModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.scheduled_at) { toast.error('Scheduled date is required'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: form.duration_minutes,
        status: form.status,
      };
      if (form.recording_url !== undefined) payload.recording_url = form.recording_url || null;
      const res = await authFetch(`/api/teacher/live-sessions/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Session updated');
      setShowModal(false);
      fetchAll();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    setDeleting(id);
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Session deleted');
      setSessions(p => p.filter(s => s.id !== id));
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleStart = async (id: string) => {
    try {
      const res = await authFetch(`/api/teacher/live-sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'live' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Session started!');
      navigate(`/teacher/live-sessions/${id}/room`);
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to start session');
    }
  };

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase();
    const matchQ = s.title.toLowerCase().includes(q) || (s.host?.display_name || '').toLowerCase().includes(q);
    const matchS = statusFilter === 'all' || s.status === statusFilter;
    return matchQ && matchS;
  });

  const statItems = [
    { label: 'Total Sessions', value: sessions.length, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: Video },
    { label: 'Live Now', value: sessions.filter(s => s.status === 'live').length, gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/25', icon: Radio },
    { label: 'Upcoming', value: sessions.filter(s => s.status === 'scheduled' && !isPast(new Date(s.scheduled_at))).length, gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/25', icon: CalendarDays },
    { label: 'Completed', value: sessions.filter(s => s.status === 'ended').length, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: CheckCircle2 },
  ];

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Live Sessions"
        title="Live Sessions"
        description="Schedule and manage live video sessions for your students."
        statsGridClassName="grid grid-cols-2 sm:grid-cols-4 gap-4"
        stats={statItems}
        action={
          can('actions.teacher.live_sessions.manage') ? <motion.button
            type="button"
            onClick={openCreate}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
              boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Plus className="w-4 h-4" /> Schedule Session
          </motion.button> : null
        }
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search sessions or hosts..."
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Status</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </AdminListFilterBar>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Video className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No sessions found</p>
              <p className="text-sm mt-1">Schedule your first live session to get started</p>
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(s => {
                const cfg = STATUS_CFG[s.status];
                const pc = s.participant_count ?? 0;
                return (
                  <div key={s.id} className={ADMIN_LIST_ITEM_CARD}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                        <Video className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm leading-snug">{s.title}</p>
                        {s.course && (
                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <BookOpen className="w-3 h-3 shrink-0" />
                            <span className="truncate">{s.course.title}</span>
                          </p>
                        )}
                        <div className="mt-2">
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.bg, cfg.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot, s.status === 'live' ? 'animate-pulse' : '')} />
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Host</span>
                        <span className="text-right truncate">
                          {s.host ? s.host.display_name : '—'}
                        </span>
                      </div>
                      {s.host?.email && (
                        <div className="text-[11px] text-slate-400 truncate text-right">{s.host.email}</div>
                      )}
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">Scheduled</span>
                        <span className="text-right">
                          <span className="block font-medium text-slate-800">{format(new Date(s.scheduled_at), 'MMM d, yyyy')}</span>
                          <span className="block text-slate-400 font-normal text-[11px]">{format(new Date(s.scheduled_at), 'h:mm a')}</span>
                          {!isPast(new Date(s.scheduled_at)) && s.status === 'scheduled' && (
                            <span className="block text-indigo-600 text-[11px] mt-0.5">{formatDistanceToNow(new Date(s.scheduled_at), { addSuffix: true })}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Duration</span>
                        <span>{s.duration_minutes} min</span>
                      </div>
                      <div className="flex justify-between gap-2 items-center">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Participants</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {pc}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.status === 'scheduled' && can('actions.teacher.live_sessions.manage') && (
                        <button
                          type="button"
                          onClick={() => handleStart(s.id)}
                          className="inline-flex flex-1 min-w-[100px] items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold hover:bg-violet-700 transition-all shadow-sm"
                        >
                          <Play className="w-3.5 h-3.5" /> Start
                        </button>
                      )}
                      <Link
                        to={`/teacher/live-sessions/${s.id}/room`}
                        className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5" /> Enter Room
                      </Link>
                      {s.status === 'ended' && s.recording_url && (
                        <a
                          href={s.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" /> Recording
                        </a>
                      )}
                      {s.status === 'ended' && (
                        <button
                          type="button"
                          onClick={() => fetchAttendance(s.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-indigo-100 text-indigo-700 bg-indigo-50 rounded-xl text-xs font-semibold hover:bg-indigo-100 transition-all"
                        >
                          {attendanceLoading === s.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : expandedAttendance === s.id ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                          Attendance
                        </button>
                      )}
                      {can('actions.teacher.live_sessions.manage') && <button type="button" onClick={() => openEdit(s)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100">
                        <Pencil className="w-4 h-4" />
                      </button>}
                      {can('actions.teacher.live_sessions.manage') && <button type="button" onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-100 disabled:opacity-40">
                        {deleting === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>}
                    </div>

                    {s.status === 'ended' && expandedAttendance === s.id && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" /> Attendance List
                        </p>
                        {attendanceLoading === s.id ? (
                          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                          </div>
                        ) : (attendanceMap[s.id] || []).length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No attendance data recorded.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {(attendanceMap[s.id] || []).map((entry) => {
                              const joined = !!entry.joined_at;
                              return (
                                <div
                                  key={entry.user_id}
                                  className={cn(
                                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs',
                                    joined ? 'bg-emerald-50' : 'bg-slate-50',
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AdminListPageShell>

      {/* Edit modal — teacher PATCH whitelist */}
      {showModal && editing && can('actions.teacher.live_sessions.manage') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Edit Session</h2>
                <p className="text-slate-400 text-sm">Update session details</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-400">*</span></label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Python Q&A Session" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="What will be covered in this session?" />
              </div>
              {editing.course && (
                <p className="text-xs text-slate-500">
                  <span className="font-bold text-slate-400 uppercase tracking-wider">Course</span>{' '}
                  {editing.course.title} <span className="text-slate-400">(set at creation)</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date & Time <span className="text-red-400">*</span></label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Duration (min)</label>
                  <input type="number" min={15} max={480} value={form.duration_minutes} onChange={e => set('duration_minutes', parseInt(e.target.value, 10) || 60)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as SessionStatus)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Recording URL</label>
                  <input value={form.recording_url} onChange={e => set('recording_url', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Optional link after session" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                {saving ? 'Saving...' : 'Update Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showCreateModal && userId && can('actions.teacher.live_sessions.manage') && (
          <NewSessionModal
            courses={courses}
            onClose={() => setShowCreateModal(false)}
            onCreated={() => {
              setShowCreateModal(false);
              fetchAll();
              toast.success('Session created!');
            }}
          />
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}

function NewSessionModal({
  courses,
  onClose,
  onCreated,
}: {
  courses: CourseOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    duration_minutes: 60,
    course_id: '',
    meeting_url: '',
    max_participants: 100,
  });
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [courseStudentMap, setCourseStudentMap] = useState<Map<string, string[]>>(new Map());
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const selectedClassStudentIds = Array.from(
    new Set(
      selectedClassIds.flatMap((classId) => {
        const found = classes.find((c) => c.id === classId);
        if (!found) return [];
        const directIds = Array.isArray(found.student_ids) ? found.student_ids.map((sid) => String(sid)).filter(Boolean) : [];
        if (directIds.length > 0) return directIds;
        const courseId = found.course_id ? String(found.course_id) : '';
        return courseId ? (courseStudentMap.get(courseId) || []) : [];
      }),
    ),
  );
  const totalInviteIds = Array.from(new Set([...selectedUsers.map((u) => u.id), ...selectedClassStudentIds]));

  useEffect(() => {
    const fetchClasses = async () => {
      const classesRes = await authFetch('/api/teacher/classes');
      const classesJson = await classesRes.json().catch(() => null);
      if (!classesRes.ok || !classesJson?.success || !Array.isArray(classesJson.classes)) return;

      const normalizedClasses = classesJson.classes.map((row: any) => ({
        id: String(row.id),
        name: String(row.name || 'Untitled class'),
        course_id: row.course_id ? String(row.course_id) : null,
        student_ids: Array.isArray(row.student_ids) ? row.student_ids.map((sid: unknown) => String(sid)) : [],
      }));

      let coursesWithStudents: Array<{ id: string; student_ids: string[] }> = [];
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (uid) {
          const coursesRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(uid)}`);
          const coursesJson = await coursesRes.json().catch(() => null);
          if (coursesRes.ok && coursesJson?.success && Array.isArray(coursesJson.courses)) {
            coursesWithStudents = coursesJson.courses.map((course: any) => ({
              id: String(course.id),
              student_ids: Array.isArray(course.student_ids) ? course.student_ids.map((sid: unknown) => String(sid)) : [],
            }));
          }
        }
      } catch {
        // Keep class list usable even if course enrichment fails.
      }

      const courseStudentMap = new Map<string, string[]>(
        coursesWithStudents.map((course) => [course.id, course.student_ids]),
      );
      setCourseStudentMap(courseStudentMap);
      const classCountPerCourse = normalizedClasses.reduce((acc: Record<string, number>, cls: ClassOption) => {
        const courseId = cls.course_id ? String(cls.course_id) : '';
        if (courseId) acc[courseId] = (acc[courseId] || 0) + 1;
        return acc;
      }, {});

      const enrichedClasses = normalizedClasses.map((cls: ClassOption) => {
        const classStudentIds = Array.isArray(cls.student_ids) ? cls.student_ids : [];
        const courseId = cls.course_id ? String(cls.course_id) : '';
        const hasSingleClassForCourse = courseId ? (classCountPerCourse[courseId] || 0) === 1 : false;
        const courseStudentIds = courseId ? (courseStudentMap.get(courseId) || []) : [];
        const enrollmentCount =
          classStudentIds.length > 0
            ? classStudentIds.length
            : (hasSingleClassForCourse ? courseStudentIds.length : 0);
        return { ...cls, enrollment_count: enrollmentCount };
      });

      setClasses(enrichedClasses);
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
          title: form.title.trim(),
          description: form.description || null,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          duration_minutes: Number(form.duration_minutes),
          status: 'scheduled',
          max_participants: Number(form.max_participants) || 100,
          meeting_url: form.meeting_url || null,
          course_id: form.course_id || null,
          class_ids: selectedClassIds,
          participant_ids: totalInviteIds,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onCreated();
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Schedule Session</h2>
            <p className="text-slate-400 text-sm">Set up a new live session</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-400">*</span></label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Python Q&A Session"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="What will be covered in this session?"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Course</label>
              <select
                value={form.course_id}
                onChange={e => setForm(p => ({ ...p, course_id: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Optional —</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Max participants</label>
              <input
                type="number"
                min={1}
                value={form.max_participants}
                onChange={e => setForm(p => ({ ...p, max_participants: parseInt(e.target.value, 10) || 100 }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date & Time <span className="text-red-400">*</span></label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Duration (min)</label>
              <input
                type="number"
                min={15}
                max={480}
                value={form.duration_minutes}
                onChange={e => setForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Meeting URL</label>
            <input
              value={form.meeting_url}
              onChange={e => setForm(p => ({ ...p, meeting_url: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://zoom.us/j/..."
            />
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Invitations</p>
            {classes.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Invite by class</label>
                <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-40 overflow-y-auto">
                  {classes.map(c => {
                    const checked = selectedClassIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer">
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedClassIds((prev) =>
                                e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                              );
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-slate-700 truncate">{c.name}</span>
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{c.enrollment_count ?? c.student_ids?.length ?? 0} students</span>
                      </label>
                    );
                  })}
                </div>
                {selectedClassIds.length > 0 && (
                  <p className="mt-2 text-xs text-indigo-600 font-medium">
                    {selectedClassIds.length} class{selectedClassIds.length > 1 ? 'es' : ''} selected · {selectedClassStudentIds.length} students from classes
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Invite students individually</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
              </div>
              {searchResults.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-lg max-h-40 overflow-y-auto">
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        if (!selectedUsers.find(s => s.id === u.id)) setSelectedUsers(prev => [...prev, u]);
                        setUserSearch('');
                        setSearchResults([]);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
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
                    <span key={u.id} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
                      {u.display_name}
                      <button type="button" onClick={() => setSelectedUsers(prev => prev.filter(s => s.id !== u.id))} className="hover:text-indigo-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {selectedClassIds.length === 0 && selectedUsers.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Tip: Select at least one class or one student to send invitations.
              </p>
            )}
            {totalInviteIds.length > 0 && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 font-medium">
                Will invite {totalInviteIds.length} unique student{totalInviteIds.length !== 1 ? 's' : ''}.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200 flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Schedule Session'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
