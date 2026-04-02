import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import {
  Video, Plus, Search, Trash2, Pencil, X, ExternalLink,
  Clock, Users, BookOpen, CalendarDays, Radio, CheckCircle2,
  XCircle, Play
} from 'lucide-react';
import { cn } from '../../lib/utils';

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

interface Teacher { id: string; displayName: string; email: string; }
interface Course  { id: string; title: string; }

const STATUS_CFG: Record<SessionStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  scheduled:  { label: 'Scheduled',  bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    icon: CalendarDays  },
  live:       { label: 'Live Now',   bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    icon: Radio         },
  ended:      { label: 'Ended',      bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: CheckCircle2  },
  cancelled:  { label: 'Cancelled',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: XCircle       },
};

const emptyForm = {
  title: '', description: '', host_id: '', course_id: '',
  scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  duration_minutes: 60, meeting_url: '', status: 'scheduled' as SessionStatus, max_participants: 100,
};

export default function AdminLiveSessions() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LiveSession | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    fetchAll();
    fetchTeachers();
    fetchCourses();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/live-sessions');
      const json = await res.json();
      if (json.success) setSessions(json.sessions || []);
      else toast.error(json.error || 'Failed to load sessions');
    } catch { toast.error('Failed to load sessions'); }
    finally { setLoading(false); }
  };

  const fetchTeachers = async () => {
    try {
      const res = await fetch('/api/admin/teachers');
      const json = await res.json();
      if (json.success) setTeachers(json.teachers.map((t: any) => ({ id: t.uid, displayName: t.displayName, email: t.email })));
    } catch {}
  };

  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/admin/courses-list');
      const json = await res.json();
      if (json.success) setCourses(json.courses || []);
    } catch {}
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit   = (s: LiveSession) => {
    setEditing(s);
    setForm({
      title: s.title, description: s.description || '', host_id: s.host_id || '',
      course_id: s.course_id || '',
      scheduled_at: s.scheduled_at.slice(0, 16),
      duration_minutes: s.duration_minutes, meeting_url: s.meeting_url || '',
      status: s.status, max_participants: s.max_participants,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.scheduled_at) { toast.error('Scheduled date is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        host_id: form.host_id || null,
        course_id: form.course_id || null,
        meeting_url: form.meeting_url || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      };
      const url = editing ? `/api/admin/live-sessions/${editing.id}` : '/api/admin/live-sessions';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Session updated' : 'Session created');
      setShowModal(false);
      fetchAll();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/live-sessions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Session deleted');
      setSessions(p => p.filter(s => s.id !== id));
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase();
    const matchQ = s.title.toLowerCase().includes(q) || (s.host?.display_name || '').toLowerCase().includes(q);
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
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Sessions</h1>
            <p className="text-slate-500 text-sm mt-0.5">Schedule and manage live video sessions for your students</p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Schedule Session
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Sessions', value: stats.total, iconBg: 'bg-indigo-100 text-indigo-600', ring: 'ring-indigo-100', grad: 'from-indigo-500 to-violet-500', icon: Video },
            { label: 'Live Now', value: stats.live, iconBg: 'bg-rose-100 text-rose-600', ring: 'ring-rose-100', grad: 'from-rose-500 to-pink-500', icon: Radio },
            { label: 'Upcoming', value: stats.upcoming, iconBg: 'bg-blue-100 text-blue-600', ring: 'ring-blue-100', grad: 'from-blue-500 to-cyan-500', icon: CalendarDays },
            { label: 'Completed', value: stats.ended, iconBg: 'bg-emerald-100 text-emerald-600', ring: 'ring-emerald-100', grad: 'from-emerald-500 to-teal-500', icon: CheckCircle2 },
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sessions or hosts..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">All Status</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Video className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No sessions found</p>
              <p className="text-sm mt-1">Schedule your first live session to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Session</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Host</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Scheduled</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Duration</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(s => {
                    const cfg = STATUS_CFG[s.status];
                    const Icon = cfg.icon;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                              <Video className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 leading-tight">{s.title}</p>
                              {s.course && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><BookOpen className="w-3 h-3" />{s.course.title}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          {s.host ? (
                            <div>
                              <p className="font-medium text-slate-700">{s.host.display_name}</p>
                              <p className="text-xs text-slate-400">{s.host.email}</p>
                            </div>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <p className="font-medium text-slate-700">{format(new Date(s.scheduled_at), 'MMM d, yyyy')}</p>
                          <p className="text-xs text-slate-400">{format(new Date(s.scheduled_at), 'h:mm a')} · {!isPast(new Date(s.scheduled_at)) && s.status === 'scheduled' ? formatDistanceToNow(new Date(s.scheduled_at), { addSuffix: true }) : ''}</p>
                        </td>
                        <td className="px-5 py-4 hidden sm:table-cell">
                          <span className="text-slate-600 font-medium">{s.duration_minutes} min</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.bg, cfg.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot, s.status === 'live' ? 'animate-pulse' : '')} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/admin/live-sessions/${s.id}/room`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200">
                              <Play className="w-3 h-3" /> Enter Room
                            </Link>
                            <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-40">
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
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Session' : 'Schedule Session'}</h2>
                <p className="text-slate-400 text-sm">{editing ? 'Update session details' : 'Set up a new live session'}</p>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Host (Teacher)</label>
                  <select value={form.host_id} onChange={e => set('host_id', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">— Select host —</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Course</label>
                  <select value={form.course_id} onChange={e => set('course_id', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">— Optional —</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date & Time <span className="text-red-400">*</span></label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Duration (min)</label>
                  <input type="number" min={15} max={480} value={form.duration_minutes} onChange={e => set('duration_minutes', parseInt(e.target.value) || 60)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Meeting URL</label>
                <input value={form.meeting_url} onChange={e => set('meeting_url', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="https://zoom.us/j/..." />
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Max Participants</label>
                  <input type="number" min={1} value={form.max_participants} onChange={e => set('max_participants', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                {saving ? 'Saving...' : editing ? 'Update Session' : 'Schedule Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
