import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
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
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare, Plus, Search, Trash2, Pencil, X,
  ThumbsUp, MessageCircle, Pin, Archive,
  HelpCircle, BookMarked, Sparkles, Globe
} from 'lucide-react';
import { cn } from '../../lib/utils';

type PostStatus   = 'active' | 'pinned' | 'archived';
type PostCategory = 'general' | 'q_and_a' | 'resources' | 'showcase';

interface Post {
  id: string;
  title: string;
  content: string | null;
  author_id: string | null;
  category: PostCategory;
  status: PostStatus;
  likes_count: number;
  replies_count: number;
  created_at: string;
  author?: { id: string; display_name: string; email: string } | null;
}

const CATEGORY_CFG: Record<PostCategory, { label: string; bg: string; text: string; icon: React.ElementType; iconBg: string; ring: string; grad: string }> = {
  general:   { label: 'General',   bg: 'bg-slate-100',   text: 'text-slate-600',   icon: Globe,     iconBg: 'bg-slate-100 text-slate-600',   ring: 'ring-slate-100',   grad: 'from-slate-400 to-slate-500'   },
  q_and_a:   { label: 'Q&A',       bg: 'bg-amber-50',    text: 'text-amber-700',   icon: HelpCircle, iconBg: 'bg-amber-100 text-amber-600',  ring: 'ring-amber-100',   grad: 'from-amber-500 to-orange-500'  },
  resources: { label: 'Resources', bg: 'bg-blue-50',     text: 'text-blue-700',    icon: BookMarked, iconBg: 'bg-blue-100 text-blue-600',    ring: 'ring-blue-100',    grad: 'from-blue-500 to-cyan-500'     },
  showcase:  { label: 'Showcase',  bg: 'bg-violet-50',   text: 'text-violet-700',  icon: Sparkles,   iconBg: 'bg-violet-100 text-violet-600', ring: 'ring-violet-100',  grad: 'from-violet-500 to-purple-500' },
};

const STATUS_CFG: Record<PostStatus, { label: string; icon: React.ElementType; color: string }> = {
  active:   { label: 'Active',   icon: Globe,   color: 'text-emerald-600' },
  pinned:   { label: 'Pinned',   icon: Pin,     color: 'text-indigo-600'  },
  archived: { label: 'Archived', icon: Archive, color: 'text-slate-400'   },
};

const CATEGORY_STAT_STYLE: Record<PostCategory, { gradient: string; shadow: string }> = {
  general:   { gradient: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-500/25' },
  q_and_a:   { gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25' },
  resources: { gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/25' },
  showcase:  { gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25' },
};

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600','from-blue-500 to-indigo-600',
  'from-rose-500 to-pink-600','from-teal-500 to-cyan-600',
  'from-amber-400 to-orange-500','from-emerald-500 to-green-600',
];
const avatarColor = (s: string) => {
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const emptyForm = {
  title: '', content: '', author_id: '', category: 'general' as PostCategory, status: 'active' as PostStatus,
};

export default function AdminCommunity() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [members, setMembers] = useState<{ id: string; displayName: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => { fetchAll(); fetchMembers(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/community');
      const json = await res.json();
      if (json.success) setPosts(json.posts || []);
      else toast.error(json.error || 'Failed to load posts');
    } catch { toast.error('Failed to load community posts'); }
    finally { setLoading(false); }
  };

  const fetchMembers = async () => {
    try {
      const [tRes, sRes] = await Promise.all([fetch('/api/admin/teachers'), fetch('/api/admin/students')]);
      const [t, s] = await Promise.all([tRes.json(), sRes.json()]);
      const combined = [
        ...(t.teachers || []).map((x: any) => ({ id: x.uid, displayName: x.displayName, email: x.email })),
        ...(s.students || []).map((x: any) => ({ id: x.uid, displayName: x.displayName, email: x.email })),
      ];
      setMembers(combined);
    } catch {}
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (p: Post) => {
    setEditing(p);
    setForm({ title: p.title, content: p.content || '', author_id: p.author_id || '', category: p.category, status: p.status });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, author_id: form.author_id || null, content: form.content || null };
      const url = editing ? `/api/admin/community/${editing.id}` : '/api/admin/community';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Post updated' : 'Post created');
      setShowModal(false);
      fetchAll();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/community/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Post deleted');
      setPosts(p => p.filter(x => x.id !== id));
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const filtered = posts.filter(p => {
    const q = search.toLowerCase();
    const matchQ = p.title.toLowerCase().includes(q) || (p.author?.display_name || '').toLowerCase().includes(q);
    const matchC = categoryFilter === 'all' || p.category === categoryFilter;
    const matchS = statusFilter === 'all' || p.status === statusFilter;
    return matchQ && matchC && matchS;
  });

  const statItems = (Object.keys(CATEGORY_CFG) as PostCategory[]).map((k) => {
    const v = CATEGORY_CFG[k];
    const st = CATEGORY_STAT_STYLE[k];
    return {
      label: v.label,
      value: posts.filter(p => p.category === k).length,
      gradient: st.gradient,
      shadow: st.shadow,
      icon: v.icon,
    };
  });

  return (
    <AdminLayout>
      <AdminListPageShell
        breadcrumbLabel="Community"
        title="Community"
        description="Manage discussions, Q&As, and community posts."
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
            <Plus className="w-4 h-4" /> New Post
          </motion.button>
        }
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search posts or authors..."
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
                <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No posts found</p>
              <p className="text-sm mt-1">Start the conversation by creating the first post</p>
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(post => {
                const catCfg = CATEGORY_CFG[post.category];
                const statCfg = STATUS_CFG[post.status];
                const CatIcon = catCfg.icon;
                const StatIcon = statCfg.icon;
                const initials = (post.author?.display_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const aColor = avatarColor(post.author?.display_name || post.id);
                return (
                  <div key={post.id} className={cn(ADMIN_LIST_ITEM_CARD, post.status === 'pinned' && 'border-indigo-200 bg-indigo-50/30')}>
                    <div className="flex items-start gap-4">
                      <div className={cn('w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 text-white text-sm font-bold shadow-sm', aColor)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', catCfg.bg, catCfg.text)}>
                              <CatIcon className="w-3 h-3" />{catCfg.label}
                            </span>
                            <span className={cn('inline-flex items-center gap-1 text-xs font-medium', statCfg.color)}>
                              <StatIcon className="w-3 h-3" />{statCfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => openEdit(post)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(post.id)} disabled={deleting === post.id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-40">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold text-slate-900 mt-2 leading-snug">{post.title}</h3>
                        {post.content && <p className="text-slate-500 text-sm mt-1.5 line-clamp-2 leading-relaxed">{post.content}</p>}
                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                          <span className="font-medium">{post.author?.display_name || 'Unknown'}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                          <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" />{post.likes_count}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{post.replies_count}</span>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Post' : 'New Community Post'}</h2>
                <p className="text-slate-400 text-sm">{editing ? 'Update post content and settings' : 'Start a new discussion or share a resource'}</p>
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
                  placeholder="What's on your mind?" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Content</label>
                <textarea rows={5} value={form.content} onChange={e => set('content', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                  placeholder="Share more details, questions, or resources..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                  <select value={form.category} onChange={e => set('category', e.target.value as PostCategory)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as PostStatus)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Author</label>
                <select value={form.author_id} onChange={e => set('author_id', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Admin (default) —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.displayName} ({m.email})</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                {saving ? 'Saving...' : editing ? 'Update Post' : 'Publish Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
