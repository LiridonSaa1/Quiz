import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import {
  Video, Plus, Search, Trash2, Pencil, X,
  Clock, BookOpen, CalendarDays, Radio, CheckCircle2,
  XCircle, Play, Link2, Copy
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

const STATUS_CFG: Record<SessionStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500',   icon: CalendarDays },
  live:      { label: 'Live Now',  bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-500',   icon: Radio        },
  ended:     { label: 'Ended',     bg: 'bg-slate-100', text: 'text-slate-600',  dot: 'bg-slate-400',  icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500',  icon: XCircle      },
};

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
  const [statusFilter, setStatusFilter] = useState('all');
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
    const matchS = statusFilter === 'all' || s.status === statusFilter;
    return matchQ && matchS;
  });

  const stats = {
    total: sessions.length,
    live: sessions.filter(s => s.status === 'live').length,
    upcoming: sessions.filter(s => s.status === 'scheduled' && !isPast(new Date(s.scheduled_at))).length,
    ended: sessions.filter(s => s.status === 'ended').length,
  };

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Sessions</h1>
            <p className="text-slate-500 text-sm mt-0.5">Schedule and host live sessions for your students</p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Schedule Session
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Sessions', value: stats.total,    iconBg: 'bg-violet-100 text-violet-600', ring: 'ring-violet-100', grad: 'from-violet-500 to-purple-500', icon: Video        },
            { label: 'Live Now',       value: stats.live,     iconBg: 'bg-rose-100 text-rose-600',     ring: 'ring-rose-100',   grad: 'from-rose-500 to-pink-500',     icon: Radio        },
            { label: 'Upcoming',       value: stats.upcoming, iconBg: 'bg-blue-100 text-blue-600',     ring: 'ring-blue-100',   grad: 'from-blue-500 to-cyan-500',     icon: CalendarDays },
            { label: 'Completed',      value: stats.ended,    iconBg: 'bg-emerald-100 text-emerald-600', ring: 'ring-emerald-100', grad: 'from-emerald-500 to-teal-500', icon: CheckCircle2 },
          ].map(({ label, value, iconBg, ring, grad, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={cn("h-0.5 bg-gradient-to-r", grad)} />
              <div className="p-5">
                <div className={cn("p-2.5 rounded-xl ring-4 inline-flex mb-4", iconBg, ring)}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
                <p className="text-sm font-medium text-slate-700 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sessions or courses..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40">
            <option value="all">All Status</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Sessions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
              Loading sessions...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-slate-400 gap-3">
              <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center">
                <Video className="w-8 h-8 text-violet-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-500">No sessions found</p>
                <p className="text-sm mt-1">Schedule your first live session to get started</p>
              </div>
              <button onClick={openCreate}
                className="mt-1 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-md shadow-violet-200">
                Schedule Now
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Session</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Scheduled</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(s => {
                      const cfg = STATUS_CFG[s.status];
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                s.status === 'live' ? 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-200' : 'bg-gradient-to-br from-violet-500 to-purple-600'
                              )}>
                                <Video className="w-4.5 h-4.5 text-white w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 leading-tight">{s.title}</p>
                                {s.course && (
                                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                    <BookOpen className="w-3 h-3" />{s.course.title}
                                  </p>
                                )}
                                {s.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{s.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 hidden lg:table-cell">
                            <p className="font-medium text-slate-700">{format(new Date(s.scheduled_at), 'MMM d, yyyy')}</p>
                            <p className="text-xs text-slate-400">
                              {format(new Date(s.scheduled_at), 'h:mm a')}
                              {!isPast(new Date(s.scheduled_at)) && s.status === 'scheduled' && (
                                <span className="ml-1.5 text-violet-500 font-medium">· {formatDistanceToNow(new Date(s.scheduled_at), { addSuffix: true })}</span>
                              )}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1 text-slate-600 font-medium">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {s.duration_minutes} min
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.bg, cfg.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot, s.status === 'live' ? 'animate-pulse' : '')} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Link to={`/teacher/live-sessions/${s.id}/room`}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-all shadow-sm shadow-violet-200">
                                <Play className="w-3 h-3" /> Enter Room
                              </Link>
                              <button onClick={() => openEdit(s)}
                                className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteId(s.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filtered.map(s => {
                  const cfg = STATUS_CFG[s.status];
                  return (
                    <div key={s.id} className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                          <Video className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-900 text-sm leading-tight">{s.title}</p>
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0', cfg.bg, cfg.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot, s.status === 'live' ? 'animate-pulse' : '')} />
                              {cfg.label}
                            </span>
                          </div>
                          {s.course && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><BookOpen className="w-3 h-3" />{s.course.title}</p>}
                          <p className="text-xs text-slate-400 mt-1">
                            {format(new Date(s.scheduled_at), 'MMM d · h:mm a')} · {s.duration_minutes} min
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link to={`/teacher/live-sessions/${s.id}/room`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-all">
                          <Play className="w-3 h-3" /> Enter Room
                        </Link>
                        <button onClick={() => openEdit(s)} className="p-2 hover:bg-violet-50 rounded-lg border border-slate-200"><Pencil className="w-4 h-4 text-slate-400" /></button>
                        <button onClick={() => setDeleteId(s.id)} className="p-2 hover:bg-rose-50 rounded-lg border border-slate-200"><Trash2 className="w-4 h-4 text-slate-400" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
                Showing {filtered.length} of {sessions.length} sessions
              </div>
            </>
          )}
        </div>
      </div>

      {/* Schedule / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                  <Video className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Session' : 'Schedule Session'}</h2>
                  <p className="text-slate-400 text-xs">{editing ? 'Update session details' : 'Set up a new live session for your students'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title <span className="text-rose-400">*</span></label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  placeholder="e.g. Weekly Q&A Session" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
                  placeholder="What will be covered in this session?" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Course</label>
                <select value={form.course_id} onChange={e => set('course_id', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40">
                  <option value="">— No course —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date & Time <span className="text-rose-400">*</span></label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Duration (min)</label>
                  <input type="number" min={15} max={480} value={form.duration_minutes} onChange={e => set('duration_minutes', parseInt(e.target.value) || 60)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <span className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> External Meeting URL (optional)</span>
                </label>
                <input value={form.meeting_url} onChange={e => set('meeting_url', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  placeholder="https://zoom.us/j/... or https://meet.google.com/..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as SessionStatus)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Max Participants</label>
                  <input type="number" min={1} value={form.max_participants} onChange={e => set('max_participants', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all disabled:opacity-50 shadow-lg shadow-violet-200">
                {saving ? 'Saving...' : editing ? 'Update Session' : 'Schedule Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Delete Session?</h3>
            <p className="text-sm text-slate-500 mb-5">This live session will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-lg disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
