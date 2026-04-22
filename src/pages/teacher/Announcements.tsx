import React, { useEffect, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { motion } from 'motion/react';
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
  Megaphone, Plus, Search, Trash2, Pencil, X,
  Users, GraduationCap, Globe, AlertTriangle,
  Info, Zap, Send, FileText, Archive, Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';

type Audience = 'all' | 'students' | 'teachers';
type Priority  = 'normal' | 'important' | 'urgent';
type AnnStatus = 'draft' | 'published' | 'archived';

interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: string | null;
  target_audience: Audience;
  priority: Priority;
  status: AnnStatus;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  author?: { id: string; display_name: string; email: string } | null;
}

const AUDIENCE_CFG: Record<Audience, { label: string; icon: React.ElementType; color: string }> = {
  all:      { label: 'Everyone', icon: Globe,          color: 'text-slate-600'   },
  students: { label: 'Students', icon: GraduationCap,  color: 'text-blue-600'    },
  teachers: { label: 'Teachers', icon: Users,           color: 'text-violet-600'  },
};

const PRIORITY_CFG: Record<Priority, { label: string; bg: string; text: string; icon: React.ElementType; border: string }> = {
  normal:    { label: 'Normal',    bg: 'bg-slate-100',  text: 'text-slate-600',  icon: Info,          border: 'border-slate-200'  },
  important: { label: 'Important', bg: 'bg-amber-50',   text: 'text-amber-700',  icon: AlertTriangle, border: 'border-amber-200'  },
  urgent:    { label: 'Urgent',    bg: 'bg-rose-50',    text: 'text-rose-700',   icon: Zap,           border: 'border-rose-200'   },
};

const STATUS_CFG: Record<AnnStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',    text: 'text-slate-600',   dot: 'bg-slate-400',   icon: FileText },
  published: { label: 'Published', bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500', icon: Send     },
  archived:  { label: 'Archived',  bg: 'bg-slate-100',    text: 'text-slate-400',   dot: 'bg-slate-300',   icon: Archive  },
};

const emptyForm = {
  title: '', content: '', author_id: '',
  target_audience: 'all' as Audience,
  priority: 'normal' as Priority,
  status: 'draft' as AnnStatus,
  expires_at: '',
};

interface ClassOption { id: string; name: string; student_ids: string[]; }
interface UserOption { id: string; display_name: string; email: string; }

export default function TeacherAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    fetchAll();
    fetchClasses();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/announcements');
      const json = await res.json();
      if (json.success) setAnnouncements(json.announcements || []);
      else toast.error(json.error || 'Failed to load announcements');
    } catch { toast.error('Failed to load announcements'); }
    finally { setLoading(false); }
  };

  const fetchClasses = async () => {
    try {
      const res = await authFetch('/api/teacher/classes');
      const json = await res.json();
      if (json.success) {
        setClasses((json.classes || []).map((c: any) => ({
          id: String(c.id),
          name: String(c.name || 'Untitled class'),
          student_ids: Array.isArray(c.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [],
        })));
      }
    } catch {
      // non-blocking
    }
  };

  const searchUsers = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await authFetch(`/api/teacher/users/search?q=${encodeURIComponent(q)}&role=student`);
      const json = await res.json();
      if (json.success) setSearchResults(json.users || []);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { searchUsers(userSearch); }, 350);
    return () => clearTimeout(t);
  }, [userSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setSelectedClassIds([]);
    setSelectedUsers([]);
    setUserSearch('');
    setSearchResults([]);
    setShowModal(true);
  };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title, content: a.content, author_id: a.author_id || '',
      target_audience: a.target_audience, priority: a.priority, status: a.status,
      expires_at: a.expires_at ? a.expires_at.slice(0, 10) : '',
    });
    setSelectedClassIds([]);
    setSelectedUsers([]);
    setUserSearch('');
    setSearchResults([]);
    setShowModal(true);
  };

  const handleSave = async (overrideStatus?: AnnStatus) => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.content.trim()) { toast.error('Content is required'); return; }
    setSaving(true);
    try {
      const status = overrideStatus ?? form.status;
      const payload = {
        ...form,
        status,
        author_id: form.author_id || null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        class_ids: selectedClassIds,
        student_ids: selectedUsers.map((u) => u.id),
      };
      const url = editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Announcement updated' : status === 'published' ? 'Announcement published!' : 'Draft saved');
      setShowModal(false);
      fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Announcement deleted');
      setAnnouncements(p => p.filter(x => x.id !== id));
    } catch (e: unknown) { toast.error((e as Error).message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const quickPublish = async (a: Announcement) => {
    try {
      const res = await fetch(`/api/admin/announcements/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Published!');
      fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const filtered = announcements.filter(a => {
    const q = search.toLowerCase();
    const matchQ = a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q);
    const matchP = priorityFilter === 'all' || a.priority === priorityFilter;
    const matchS = statusFilter === 'all' || a.status === statusFilter;
    return matchQ && matchP && matchS;
  });

  const statItems = [
    { label: 'Total', value: announcements.length, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: Megaphone },
    { label: 'Published', value: announcements.filter(a => a.status === 'published').length, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: Send },
    { label: 'Drafts', value: announcements.filter(a => a.status === 'draft').length, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25', icon: FileText },
    { label: 'Urgent', value: announcements.filter(a => a.priority === 'urgent' && a.status === 'published').length, gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/25', icon: Zap },
  ];

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Announcements"
        title="Announcements"
        description="Broadcast messages to students, teachers, or everyone."
        statsGridClassName="grid grid-cols-2 sm:grid-cols-4 gap-4"
        stats={statItems}
        action={
          <motion.button
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
            <Plus className="w-4 h-4" /> New Announcement
          </motion.button>
        }
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search announcements..."
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
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
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Megaphone className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No announcements yet</p>
              <p className="text-sm mt-1">Create your first announcement to reach your community</p>
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(ann => {
                const priCfg = PRIORITY_CFG[ann.priority];
                const statCfg = STATUS_CFG[ann.status];
                const audCfg = AUDIENCE_CFG[ann.target_audience];
                const PriIcon = priCfg.icon;
                const AudIcon = audCfg.icon;
                const isExpired = ann.expires_at && isPast(new Date(ann.expires_at));
                return (
                  <div key={ann.id} className={cn(
                    ADMIN_LIST_ITEM_CARD,
                    ann.priority === 'urgent' ? 'border-rose-200' : ann.priority === 'important' ? 'border-amber-200' : 'border-slate-100',
                  )}>
                    <div className="flex items-start gap-4">
                      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', priCfg.bg)}>
                        <PriIcon className={cn('w-5 h-5', priCfg.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', priCfg.bg, priCfg.text)}>
                              <PriIcon className="w-3 h-3" />{priCfg.label}
                            </span>
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', statCfg.bg, statCfg.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', statCfg.dot)} />
                              {statCfg.label}
                            </span>
                            <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-slate-500')}>
                              <AudIcon className="w-3.5 h-3.5" />{audCfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {ann.status === 'draft' && (
                              <button type="button" onClick={() => quickPublish(ann)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-all">
                                <Send className="w-3 h-3" /> Publish
                              </button>
                            )}
                            <button type="button" onClick={() => openEdit(ann)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => handleDelete(ann.id)} disabled={deleting === ann.id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-40">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold text-slate-900 mt-2 text-base">{ann.title}</h3>
                        <p className="text-slate-500 text-sm mt-1.5 line-clamp-2 leading-relaxed">{ann.content}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
                          {ann.author && <span className="font-medium text-slate-500">{ann.author.display_name}</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {ann.published_at ? `Published ${formatDistanceToNow(new Date(ann.published_at), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}`}
                          </span>
                          {ann.expires_at && (
                            <span className={cn('flex items-center gap-1', isExpired ? 'text-rose-400' : 'text-amber-500')}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {isExpired ? 'Expired' : `Expires ${format(new Date(ann.expires_at), 'MMM d, yyyy')}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AdminListPageShell>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Announcement' : 'New Announcement'}</h2>
                <p className="text-slate-400 text-sm">{editing ? 'Update announcement details' : 'Broadcast a message to your community'}</p>
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
                  placeholder="e.g. Platform Maintenance on Saturday" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Content <span className="text-red-400">*</span></label>
                <textarea rows={5} value={form.content} onChange={e => set('content', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                  placeholder="Write your full announcement message here..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Audience</label>
                  <select value={form.target_audience} onChange={e => set('target_audience', e.target.value as Audience)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(AUDIENCE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e => set('priority', e.target.value as Priority)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as AnnStatus)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expires On</label>
                  <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Targeting (Optional)</p>
                {classes.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Show for class(es)</label>
                    <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-36 overflow-y-auto">
                      {classes.map((c) => {
                        const checked = selectedClassIds.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer">
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedClassIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)));
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700 truncate">{c.name}</span>
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{c.student_ids.length} students</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Or specific students</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search student by name or email..."
                      className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    {searching && <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow max-h-36 overflow-y-auto">
                      {searchResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            if (!selectedUsers.find((x) => x.id === u.id)) setSelectedUsers((prev) => [...prev, u]);
                            setUserSearch('');
                            setSearchResults([]);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center gap-3 border-b border-slate-50 last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                            {u.display_name?.[0]?.toUpperCase() || '?'}
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
                      {selectedUsers.map((u) => (
                        <span key={u.id} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
                          {u.display_name}
                          <button type="button" onClick={() => setSelectedUsers((prev) => prev.filter((s) => s.id !== u.id))}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button type="button" onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">
                Cancel
              </button>
              <button type="button" onClick={() => handleSave('draft')} disabled={saving}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
                Save Draft
              </button>
              <button type="button" onClick={() => handleSave('published')} disabled={saving}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                {saving ? 'Saving...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
