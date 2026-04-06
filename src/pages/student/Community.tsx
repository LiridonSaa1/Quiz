import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare, Search, ThumbsUp, MessageCircle,
  Pin, Globe, HelpCircle, BookMarked, Sparkles, Flame
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';

type PostCategory = 'general' | 'q_and_a' | 'resources' | 'showcase';
type PostStatus = 'active' | 'pinned' | 'archived';

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
  authorName: string;
}

const CATEGORY_CFG: Record<PostCategory, { label: string; bg: string; text: string; border: string; icon: React.ElementType; accentGrad: string }> = {
  general:   { label: 'General',   bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  icon: Globe,      accentGrad: 'from-slate-400 to-slate-500' },
  q_and_a:   { label: 'Q&A',       bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  icon: HelpCircle, accentGrad: 'from-amber-500 to-orange-500' },
  resources: { label: 'Resources', bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   icon: BookMarked, accentGrad: 'from-blue-500 to-cyan-500' },
  showcase:  { label: 'Showcase',  bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200', icon: Sparkles,   accentGrad: 'from-violet-500 to-purple-500' },
};

const TABS = [
  { key: 'all',       label: 'All'      },
  { key: 'general',   label: 'General'  },
  { key: 'q_and_a',   label: 'Q&A'      },
  { key: 'resources', label: 'Resources'},
  { key: 'showcase',  label: 'Showcase' },
] as const;

export default function StudentCommunity() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | PostCategory>('all');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('community_posts')
        .select('*, author:profiles(display_name)')
        .neq('status', 'archived')
        .order('status', { ascending: false })
        .order('created_at', { ascending: false });

      setPosts((data || []).map((p: any) => ({
        ...p, authorName: p.author?.display_name || 'Anonymous',
      })));
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = posts;
    if (search) list = list.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
    if (tab !== 'all') list = list.filter(p => p.category === tab);
    return list;
  }, [posts, search, tab]);

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-fuchsia-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-fuchsia-500/25 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                <MessageSquare className="w-3.5 h-3.5 text-fuchsia-300" />
                <span className="text-white/80 text-xs font-semibold">Community</span>
              </div>
              <h1 className="text-3xl font-black text-white">Community</h1>
              <p className="text-slate-400 text-sm mt-1">{posts.length} posts · Connect, share, and learn together.</p>
            </div>
            <div className="flex gap-3">
              {[
                { label: 'Posts',     value: posts.length },
                { label: 'Pinned',    value: posts.filter(p => p.status === 'pinned').length },
                { label: 'Q&A',       value: posts.filter(p => p.category === 'q_and_a').length },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
                  className="bg-white/8 border border-white/10 rounded-2xl p-3 text-center min-w-[60px]">
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-slate-400 text-[10px] font-semibold">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Tabs + Search */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-400 shadow-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn('px-4 py-2 rounded-2xl text-sm font-semibold transition-all border',
                  tab === t.key ? 'bg-fuchsia-600 text-white border-transparent shadow-lg shadow-fuchsia-200' : 'bg-white border-slate-200 text-slate-600 hover:border-fuchsia-300')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-fuchsia-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
              <MessageSquare className="w-8 h-8 text-fuchsia-400" />
            </motion.div>
            <p className="text-slate-600 font-bold">No posts found</p>
            <p className="text-slate-400 text-sm mt-1">The community is getting started!</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filtered.map((post, i) => {
                const cfg = CATEGORY_CFG[post.category] || CATEGORY_CFG.general;
                const Icon = cfg.icon;
                const isPinned = post.status === 'pinned';
                return (
                  <motion.div key={post.id}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    className={cn('bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden group cursor-pointer', isPinned ? 'border-indigo-200' : 'border-slate-100')}>
                    <div className={cn('h-1 bg-gradient-to-r', cfg.accentGrad)} />
                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', cfg.bg)}>
                          <Icon className={cn('w-4 h-4', cfg.text)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg border', cfg.bg, cfg.text, cfg.border)}>{cfg.label}</span>
                            {isPinned && (
                              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <Pin className="w-2.5 h-2.5" /> Pinned
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-fuchsia-600 transition-colors line-clamp-1">{post.title}</h3>
                          {post.content && <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{post.content}</p>}
                          <div className="flex items-center gap-4 mt-3">
                            <span className="text-xs text-slate-400 font-medium">by {post.authorName}</span>
                            <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                            <span className="flex items-center gap-1 text-xs text-slate-400 ml-auto">
                              <ThumbsUp className="w-3 h-3" /> {post.likes_count ?? 0}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <MessageCircle className="w-3 h-3" /> {post.replies_count ?? 0}
                            </span>
                          </div>
                        </div>
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
