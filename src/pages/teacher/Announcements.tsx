import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import {
  Megaphone, Plus, Search, Trash2, Pencil, X,
  Users, GraduationCap, Globe, AlertTriangle,
  Info, Zap, Send, FileText, Archive, Clock,
  Radio
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../supabase';

type Audience  = 'all' | 'students' | 'teachers';
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

const AUDIENCE_CFG: Record<Audience, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  all:      { label: 'Everyone', icon: Globe,         bg: 'bg-slate-100',  text: 'text-slate-600'  },
  students: { label: 'Students', icon: GraduationCap, bg: 'bg-blue-50',    text: 'text-blue-700'   },
  teachers: { label: 'Teachers', icon: Users,          bg: 'bg-violet-50',  text: 'text-violet-700' },
};

const PRIORITY_CFG: Record<Priority, {
  label: string; bg: string; text: string; border: string;
  icon: React.ElementType; accentFrom: string; accentTo: string; ring: string;
}> = {
  normal:    { label: 'Normal',    bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  icon: Info,          accentFrom: 'from-slate-400',  accentTo: 'to-slate-500',   ring: 'ring-slate-100'  },
  important: { label: 'Important', bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  icon: AlertTriangle, accentFrom: 'from-amber-500',  accentTo: 'to-orange-400',  ring: 'ring-amber-100'  },
  urgent:    { label: 'Urgent',    bg: 'bg-rose-50',    text: 'text-rose-700',   border: 'border-rose-200',   icon: Zap,           accentFrom: 'from-rose-500',   accentTo: 'to-pink-500',    ring: 'ring-rose-100'   },
};

const STATUS_CFG: Record<AnnStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400',   icon: FileText },
  published: { label: 'Published', bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', icon: Send     },
  archived:  { label: 'Archived',  bg: 'bg-slate-100',   text: 'text-slate-400',   dot: 'bg-slate-300',   icon: Archive  },
};

const TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'published', label: 'Published' },
  { key: 'draft',     label: 'Drafts'    },
  { key: 'urgent',    label: 'Urgent'    },
  { key: 'archived',  label: 'Archived'  },
];

const emptyForm = {
  title: '', content: '',
  target_audience: 'students' as Audience,
  priority: 'normal' as Priority,
  status: 'draft' as AnnStatus,
  expires_at: '',
};

export default function TeacherAnnouncements() {
  const [teacherId, setTeacherId]         = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [activeTab, setActiveTab]         = useState('all');
  const [showModal, setShowModal]         = useState(false);
  const [editing, setEditing]             = useState<Announcement | null>(null);
  const [form, setForm]                   = useState(emptyForm);
  const [saving, setSaving]               = useState(false);
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/announcements');
      const json = await res.json();
      if (json.success) setAnnouncements(json.announcements || []);
      else toast.error(json.error || 'Failed to load announcements');
    } catch { toast.error('Failed to load announcements'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setTeacherId(session.user.id); fetchAll(); }
    });
  }, [fetchAll]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit   = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title, content: a.content,
      target_audience: a.target_audience, priority: a.priority, status: a.status,
      expires_at: a.expires_at ? a.expires_at.slice(0, 10) : '',
    });
    setShowModal(true);
  };

  const handleSave = async (overrideStatus?: AnnStatus) => {
    if (!form.title.trim())   { toast.error('Title is required');   return; }
    if (!form.content.trim()) { toast.error('Content is required'); return; }
    if (!teacherId) return;
    setSaving(true);
    try {
      const status  = overrideStatus ?? form.status;
      const payload = {
        ...form, status, author_id: teacherId,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      const url    = editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements';
      const method = editing ? 'PATCH' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json   = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Announcement updated' : status === 'published' ? 'Announcement published!' : 'Draft saved');
      setShowModal(false);
      fetchAll();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res  = await fetch(`/api/admin/announcements/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Announcement deleted');
      setDeleteId(null);
      setAnnouncements(p => p.filter(x => x.id !== deleteId));
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const quickPublish = async (a: Announcement) => {
    try {
      const res  = await fetch(`/api/admin/announcements/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Announcement published!');
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = announcements.filter(a => {
    const q      = search.toLowerCase();
    const matchQ = a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q);
    const matchT =
      activeTab === 'all'     ? true :
      activeTab === 'urgent'  ? a.priority === 'urgent' :
      a.status === activeTab;
    return matchQ && matchT;
  });

  const stats = {
    total:     announcements.length,
    published: announcements.filter(a => a.status === 'published').length,
    drafts:    announcements.filter(a => a.status === 'draft').length,
    urgent:    announcements.filter(a => a.priority === 'urgent' && a.status === 'published').length,
  };

  const tabCounts: Record<string, number> = {
    all:       announcements.length,
    published: stats.published,
    draft:     stats.drafts,
    urgent:    announcements.filter(a => a.priority === 'urgent').length,
    archived:  announcements.filter(a => a.status === 'archived').length,
  };

  const latestUrgent = announcements.find(a => a.priority === 'urgent' && a.status === 'published');
  const latestPublished = announcements.filter(a => a.status === 'published')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const featured = latestUrgent || latestPublished;

  return (
    <TeacherLayout>
      <div className="space-y-6 pb-6">

        {/* ── Hero Header ───────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-orange-950 to-slate-900 p-6 sm:p-8">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #f97316 0%, transparent 50%), radial-gradient(circle at 85% 20%, #f59e0b 0%, transparent 40%)' }} />
          <div className="absolute top-4 right-4 w-48 h-48 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/10">
                  <Radio className="w-3 h-3" /> Broadcast Center
                </span>
                {stats.urgent > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30 animate-pulse">
                    <Zap className="w-3 h-3" /> {stats.urgent} urgent
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Announcements</h1>
              <p className="text-slate-400 text-sm mt-1">Broadcast messages to your students and the community</p>
              <div className="flex items-center gap-5 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{stats.total}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Total</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{stats.published}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Published</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{stats.drafts}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Drafts</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-rose-400">{stats.urgent}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Urgent</p>
                </div>
              </div>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-semibold text-sm transition-all shadow-xl shadow-orange-900/50 active:scale-[0.97] shrink-0">
              <Plus className="w-4 h-4" /> New Announcement
            </button>
          </div>
        </div>

        {/* ── Featured / Latest Urgent ───────────────── */}
        {!loading && featured && (() => {
          const pri  = PRIORITY_CFG[featured.priority];
          const aud  = AUDIENCE_CFG[featured.target_audience];
          const AudIcon = aud.icon;
          const isUrgent = featured.priority === 'urgent';
          const isExpired = featured.expires_at && isPast(new Date(featured.expires_at));
          return (
            <div className={cn(
              'relative rounded-2xl p-5 sm:p-6 overflow-hidden border',
              isUrgent
                ? 'bg-gradient-to-r from-rose-600 to-orange-600 border-rose-500/30'
                : 'bg-gradient-to-r from-amber-600 to-orange-500 border-amber-500/30'
            )}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 90% 50%, white 0%, transparent 60%)' }} />
              <div className="relative flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    {isUrgent
                      ? <Zap className="w-6 h-6 text-white" />
                      : <Megaphone className="w-6 h-6 text-white" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white/70 uppercase tracking-wider mb-1">
                      {isUrgent ? 'Urgent Announcement' : 'Latest Broadcast'}
                    </p>
                    <h2 className="text-lg font-bold text-white leading-tight">{featured.title}</h2>
                    <p className="text-white/60 text-sm mt-1 line-clamp-2 leading-relaxed">{featured.content}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1 text-white/70 text-xs">
                        <AudIcon className="w-3 h-3" /> {aud.label}
                      </span>
                      <span className="flex items-center gap-1 text-white/60 text-xs">
                        <Clock className="w-3 h-3" />
                        {featured.published_at
                          ? formatDistanceToNow(new Date(featured.published_at), { addSuffix: true })
                          : formatDistanceToNow(new Date(featured.created_at), { addSuffix: true })}
                      </span>
                      {featured.expires_at && (
                        <span className={cn('flex items-center gap-1 text-xs font-semibold', isExpired ? 'text-white/40' : 'text-white/80')}>
                          <AlertTriangle className="w-3 h-3" />
                          {isExpired ? 'Expired' : `Expires ${format(new Date(featured.expires_at), 'MMM d')}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => openEdit(featured)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-bold hover:bg-white/90 transition-all shadow-lg shrink-0">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
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
                placeholder="Search announcements..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300 transition-all" />
            </div>
          </div>
          <div className="flex overflow-x-auto px-4 gap-1 py-2 scrollbar-hide">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                  activeTab === tab.key
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
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

        {/* ── Announcements List ────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                    <div className="h-5 bg-slate-100 rounded w-2/3" />
                    <div className="h-3 bg-slate-100 rounded" />
                    <div className="h-3 bg-slate-100 rounded w-5/6" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center mb-4">
              <Megaphone className="w-10 h-10 text-orange-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              {search ? 'No announcements match your search' : 'Nothing here yet'}
            </h3>
            <p className="text-slate-400 text-sm max-w-xs">
              {search ? 'Try a different keyword.' : 'Create your first announcement to reach your students.'}
            </p>
            {!search && (
              <button onClick={openCreate}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200">
                <Plus className="w-4 h-4" /> Create Announcement
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(ann => {
              const pri     = PRIORITY_CFG[ann.priority];
              const stat    = STATUS_CFG[ann.status];
              const aud     = AUDIENCE_CFG[ann.target_audience];
              const PriIcon = pri.icon;
              const AudIcon = aud.icon;
              const isExpired = ann.expires_at && isPast(new Date(ann.expires_at));
              const isOwn   = ann.author_id === teacherId;

              return (
                <div key={ann.id} className={cn(
                  'group bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden',
                  ann.priority === 'urgent'    ? 'border-rose-200 ring-1 ring-rose-100' :
                  ann.priority === 'important' ? 'border-amber-200' :
                  'border-slate-100'
                )}>
                  <div className={cn('h-1 bg-gradient-to-r', pri.accentFrom, pri.accentTo)} />
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ring-4',
                        pri.bg, pri.ring
                      )}>
                        <PriIcon className={cn('w-5 h-5', pri.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border', pri.bg, pri.text, pri.border)}>
                              <PriIcon className="w-3 h-3" /> {pri.label}
                            </span>
                            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold', stat.bg, stat.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', stat.dot)} />
                              {stat.label}
                            </span>
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', aud.bg, aud.text)}>
                              <AudIcon className="w-3 h-3" /> {aud.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {ann.status === 'draft' && isOwn && (
                              <button onClick={() => quickPublish(ann)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200">
                                <Send className="w-3 h-3" /> Publish
                              </button>
                            )}
                            {isOwn && (
                              <>
                                <button onClick={() => openEdit(ann)}
                                  className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeleteId(ann.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <h3 className="font-bold text-slate-900 mt-2 text-base leading-snug">{ann.title}</h3>
                        <p className="text-slate-500 text-sm mt-1.5 line-clamp-2 leading-relaxed">{ann.content}</p>

                        <div className="flex items-center gap-3 mt-3 text-xs text-slate-400 flex-wrap">
                          {ann.author && (
                            <span className="font-semibold text-slate-600">{ann.author.display_name}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {ann.published_at
                              ? `Published ${formatDistanceToNow(new Date(ann.published_at), { addSuffix: true })}`
                              : `Created ${formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}`}
                          </span>
                          {ann.expires_at && (
                            <span className={cn('flex items-center gap-1', isExpired ? 'text-rose-400 font-semibold' : 'text-amber-500')}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {isExpired ? 'Expired' : `Expires ${format(new Date(ann.expires_at), 'MMM d, yyyy')}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-slate-400">
            Showing {filtered.length} of {announcements.length} announcements
          </p>
        )}
      </div>

      {/* ── Create / Edit Modal ─────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-slate-100 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                  <Megaphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Announcement' : 'New Announcement'}</h2>
                  <p className="text-slate-400 text-xs">{editing ? 'Update this announcement' : 'Broadcast a message to your students'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Title <span className="text-rose-400 normal-case font-normal tracking-normal">required</span>
                </label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300 transition-all"
                  placeholder="e.g. Quiz deadline extended to Friday" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Message <span className="text-rose-400 normal-case font-normal tracking-normal">required</span>
                </label>
                <textarea rows={5} value={form.content} onChange={e => set('content', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300 transition-all resize-none leading-relaxed"
                  placeholder="Write your full announcement here. Be clear and concise..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target Audience</label>
                  <select value={form.target_audience} onChange={e => set('target_audience', e.target.value as Audience)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300 transition-all">
                    {Object.entries(AUDIENCE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Priority</label>
                  <select value={form.priority} onChange={e => set('priority', e.target.value as Priority)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300 transition-all">
                    {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Expiry Date <span className="normal-case font-normal tracking-normal text-slate-400">(optional)</span>
                </label>
                <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300 transition-all" />
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50/80 backdrop-blur-sm px-6 py-4 border-t border-slate-100 rounded-b-2xl flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
                Cancel
              </button>
              <button onClick={() => handleSave('draft')} disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all disabled:opacity-50">
                {saving && <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />}
                Save Draft
              </button>
              <button onClick={() => handleSave('published')} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 disabled:opacity-50">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <Send className="w-3.5 h-3.5" /> Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ───────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
                <Trash2 className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete this announcement?</h3>
              <p className="text-slate-500 text-sm leading-relaxed">This can't be undone. The announcement will be permanently removed.</p>
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
