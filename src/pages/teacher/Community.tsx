import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare, Plus, Search, Trash2, Pencil, X,
  ThumbsUp, MessageCircle, Pin, Archive,
  HelpCircle, BookMarked, Sparkles, Globe,
  Users, TrendingUp, Flame
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../supabase';

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

const CATEGORY_CFG: Record<PostCategory, {
  label: string; bg: string; text: string; border: string;
  icon: React.ElementType; accentFrom: string; accentTo: string; headerGrad: string;
}> = {
  general:   { label: 'General',   bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  icon: Globe,      accentFrom: 'from-slate-400',   accentTo: 'to-slate-500',   headerGrad: 'from-slate-500 to-slate-600'   },
  q_and_a:   { label: 'Q&A',       bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  icon: HelpCircle, accentFrom: 'from-amber-500',   accentTo: 'to-orange-500',  headerGrad: 'from-amber-500 to-orange-500'  },
  resources: { label: 'Resources', bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   icon: BookMarked, accentFrom: 'from-blue-500',    accentTo: 'to-cyan-500',    headerGrad: 'from-blue-500 to-cyan-500'     },
  showcase:  { label: 'Showcase',  bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200', icon: Sparkles,   accentFrom: 'from-violet-500',  accentTo: 'to-purple-500',  headerGrad: 'from-violet-500 to-purple-500' },
};

const STATUS_CFG: Record<PostStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  active:   { label: 'Active',   icon: Globe,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
  pinned:   { label: 'Pinned',   icon: Pin,     color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
  archived: { label: 'Archived', icon: Archive, color: 'text-slate-400',   bg: 'bg-slate-50'   },
};

const TABS = [
  { key: 'all',       label: 'All Posts'  },
  { key: 'general',   label: 'General'    },
  { key: 'q_and_a',  label: 'Q&A'        },
  { key: 'resources', label: 'Resources'  },
  { key: 'showcase',  label: 'Showcase'   },
  { key: 'pinned',    label: 'Pinned'     },
];

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-indigo-600',
  'from-rose-500 to-pink-600',     'from-teal-500 to-cyan-600',
  'from-amber-400 to-orange-500',  'from-emerald-500 to-green-600',
];
const avatarColor = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};
const initials = (name: string) =>
  name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

const emptyForm = {
  title: '', content: '',
  category: 'general' as PostCategory,
  status: 'active' as PostStatus,
};

export default function TeacherCommunity() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/community');
      const json = await res.json();
      if (json.success) setPosts(json.posts || []);
      else toast.error(json.error || 'Failed to load posts');
    } catch { toast.error('Failed to load community posts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setTeacherId(session.user.id);
        fetchPosts();
      }
    });
  }, [fetchPosts]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (p: Post) => {
    setEditing(p);
    setForm({ title: p.title, content: p.content || '', category: p.category, status: p.status });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!teacherId) return;
    setSaving(true);
    try {
      const payload = { ...form, author_id: teacherId, content: form.content || null };
      const url = editing ? `/api/admin/community/${editing.id}` : '/api/admin/community';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Post updated' : 'Post published');
      setShowModal(false);
      fetchPosts();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/community/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Post deleted');
      setDeleteId(null);
      setPosts(p => p.filter(x => x.id !== deleteId));
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const filtered = posts.filter(p => {
    const q = search.toLowerCase();
    const matchQ = p.title.toLowerCase().includes(q) || (p.author?.display_name || '').toLowerCase().includes(q);
    const matchTab =
      activeTab === 'all'     ? true :
      activeTab === 'pinned'  ? p.status === 'pinned' :
      p.category === activeTab;
    return matchQ && matchTab;
  });

  const tabCounts: Record<string, number> = {
    all:       posts.length,
    general:   posts.filter(p => p.category === 'general').length,
    q_and_a:   posts.filter(p => p.category === 'q_and_a').length,
    resources: posts.filter(p => p.category === 'resources').length,
    showcase:  posts.filter(p => p.category === 'showcase').length,
    pinned:    posts.filter(p => p.status === 'pinned').length,
  };

  const totalLikes   = posts.reduce((s, p) => s + p.likes_count, 0);
  const totalReplies = posts.reduce((s, p) => s + p.replies_count, 0);
  const pinnedCount  = posts.filter(p => p.status === 'pinned').length;

  const featuredPost = posts.find(p => p.status === 'pinned') ||
    [...posts].sort((a, b) => b.likes_count - a.likes_count)[0];

  return (
    <TeacherLayout>
      <div className="space-y-6 pb-6">

        {/* ── Hero Header ───────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 15% 50%, #6366f1 0%, transparent 50%), radial-gradient(circle at 85% 20%, #8b5cf6 0%, transparent 40%)' }} />
          <div className="absolute top-4 right-4 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/10">
                  <Users className="w-3 h-3" /> Community Hub
                </span>
                {pinnedCount > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
                    <Pin className="w-3 h-3" /> {pinnedCount} pinned
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Community</h1>
              <p className="text-slate-400 text-sm mt-1">Discussions, Q&As, and shared resources with your students</p>
              <div className="flex items-center gap-5 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{posts.length}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Posts</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{totalLikes}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Likes</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{totalReplies}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Replies</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-indigo-400">{pinnedCount}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Pinned</p>
                </div>
              </div>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-5 py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-semibold text-sm transition-all shadow-xl shadow-indigo-900/50 active:scale-[0.97] shrink-0">
              <Plus className="w-4 h-4" /> New Post
            </button>
          </div>
        </div>

        {/* ── Featured Post ──────────────────────────── */}
        {!loading && featuredPost && (() => {
          const cat = CATEGORY_CFG[featuredPost.category];
          const CatIcon = cat.icon;
          const aColor  = avatarColor(featuredPost.author?.display_name || featuredPost.id);
          const ini     = initials(featuredPost.author?.display_name || '?');
          const isPinned = featuredPost.status === 'pinned';
          return (
            <div className={cn(
              'relative rounded-2xl p-5 sm:p-6 overflow-hidden border',
              isPinned
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500/30'
                : 'bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600/30'
            )}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 90% 50%, white 0%, transparent 60%)' }} />
              <div className="relative flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', isPinned ? 'bg-white/20' : 'bg-white/10')}>
                    {isPinned ? <Pin className="w-6 h-6 text-white" /> : <Flame className="w-6 h-6 text-amber-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-1">
                      {isPinned ? 'Pinned Post' : 'Most Popular'}
                    </p>
                    <h2 className="text-lg font-bold text-white leading-tight line-clamp-1">{featuredPost.title}</h2>
                    {featuredPost.content && (
                      <p className="text-white/60 text-sm mt-1 line-clamp-2 leading-relaxed">{featuredPost.content}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/15 text-white/80')}>
                        <CatIcon className="w-3 h-3" /> {cat.label}
                      </span>
                      <span className="flex items-center gap-1 text-white/60 text-xs">
                        <ThumbsUp className="w-3 h-3" /> {featuredPost.likes_count}
                      </span>
                      <span className="flex items-center gap-1 text-white/60 text-xs">
                        <MessageCircle className="w-3 h-3" /> {featuredPost.replies_count}
                      </span>
                      <span className="text-white/50 text-xs">
                        {formatDistanceToNow(new Date(featuredPost.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shadow-lg', aColor)}>
                    {ini}
                  </div>
                  <div>
                    <p className="text-white/80 text-xs font-semibold">{featuredPost.author?.display_name || 'Unknown'}</p>
                    <p className="text-white/40 text-xs">{featuredPost.author?.email}</p>
                  </div>
                </div>
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
                placeholder="Search posts or authors..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all" />
            </div>
          </div>
          <div className="flex overflow-x-auto px-4 gap-1 py-2 scrollbar-hide">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
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

        {/* ── Posts ─────────────────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-100 rounded w-1/4" />
                    <div className="h-5 bg-slate-100 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-5/6" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              {search ? 'No posts match your search' : 'No posts yet'}
            </h3>
            <p className="text-slate-400 text-sm max-w-xs">
              {search ? 'Try a different keyword.' : 'Start the conversation — share a resource, ask a question, or post an update.'}
            </p>
            {!search && (
              <button onClick={openCreate}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                <Plus className="w-4 h-4" /> Create First Post
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(post => {
              const cat     = CATEGORY_CFG[post.category];
              const stat    = STATUS_CFG[post.status];
              const CatIcon = cat.icon;
              const StatIcon = stat.icon;
              const aColor  = avatarColor(post.author?.display_name || post.id);
              const ini     = initials(post.author?.display_name || '?');
              const isPinned = post.status === 'pinned';
              const isOwn   = post.author_id === teacherId;

              return (
                <div key={post.id} className={cn(
                  'group bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden',
                  isPinned ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-100'
                )}>
                  <div className={cn('h-1 bg-gradient-to-r', cat.accentFrom, cat.accentTo)} />
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={cn('w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 text-white text-sm font-bold shadow-sm', aColor)}>
                        {ini}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border', cat.bg, cat.text, cat.border)}>
                              <CatIcon className="w-3 h-3" /> {cat.label}
                            </span>
                            {post.status !== 'active' && (
                              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', stat.bg, stat.color)}>
                                <StatIcon className="w-3 h-3" /> {stat.label}
                              </span>
                            )}
                            {isOwn && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-600 border border-violet-100">
                                You
                              </span>
                            )}
                          </div>
                          {isOwn && (
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(post)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteId(post.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-900 mt-2 leading-snug">{post.title}</h3>
                        {post.content && (
                          <p className="text-slate-500 text-sm mt-1.5 line-clamp-2 leading-relaxed">{post.content}</p>
                        )}

                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                          <span className="font-semibold text-slate-600">{post.author?.display_name || 'Unknown'}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                          <span className="flex items-center gap-1 ml-auto">
                            <ThumbsUp className="w-3.5 h-3.5" /> {post.likes_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3.5 h-3.5" /> {post.replies_count}
                          </span>
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
            Showing {filtered.length} of {posts.length} posts
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
                <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Post' : 'New Community Post'}</h2>
                  <p className="text-slate-400 text-xs">{editing ? 'Update your post' : 'Share something with the community'}</p>
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
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all"
                  placeholder="What's on your mind?" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Content</label>
                <textarea rows={5} value={form.content} onChange={e => set('content', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all resize-none leading-relaxed"
                  placeholder="Share more details, a question, or a resource link..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                  <select value={form.category} onChange={e => set('category', e.target.value as PostCategory)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all">
                    {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as PostStatus)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50/80 backdrop-blur-sm px-6 py-4 border-t border-slate-100 rounded-b-2xl flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editing ? 'Save Changes' : 'Publish Post'}
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
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete this post?</h3>
              <p className="text-slate-500 text-sm leading-relaxed">This can't be undone. The post and all its engagement will be permanently removed.</p>
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
