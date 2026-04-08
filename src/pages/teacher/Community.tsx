import React, { useEffect, useMemo, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { MessageSquare, Search, ThumbsUp, MessageCircle, Pin, Sparkles, HelpCircle, BookMarked, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';

type PostStatus = 'active' | 'pinned' | 'archived';
type PostCategory = 'general' | 'q_and_a' | 'resources' | 'showcase';

interface PostRow {
  id: string;
  title: string;
  content: string | null;
  category: PostCategory;
  status: PostStatus;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  authorName: string;
}

const CATEGORY_META: Record<PostCategory, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  general: { label: 'General', icon: Globe, bg: 'bg-slate-100', text: 'text-slate-600' },
  q_and_a: { label: 'Q&A', icon: HelpCircle, bg: 'bg-amber-50', text: 'text-amber-700' },
  resources: { label: 'Resources', icon: BookMarked, bg: 'bg-blue-50', text: 'text-blue-700' },
  showcase: { label: 'Showcase', icon: Sparkles, bg: 'bg-violet-50', text: 'text-violet-700' },
};

export default function TeacherCommunity() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PostRow[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PostCategory>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const postsRes = await supabase
          .from('community_posts')
          .select('*')
          .neq('status', 'archived')
          .order('created_at', { ascending: false });

        if (postsRes.error) throw postsRes.error;

        const authorIds = Array.from(new Set((postsRes.data || []).map((p: any) => p.author_id).filter(Boolean))) as string[];
        let authorMap: Record<string, string> = {};
        if (authorIds.length > 0) {
          const authorsRes = await supabase.from('profiles').select('id,display_name').in('id', authorIds);
          if (!authorsRes.error) {
            authorMap = (authorsRes.data || []).reduce((acc: Record<string, string>, a: any) => {
              acc[a.id] = a.display_name || 'Unknown';
              return acc;
            }, {});
          }
        }

        const mapped = (postsRes.data || []).map((p: any) => ({
          id: p.id,
          title: p.title,
          content: p.content || null,
          category: p.category as PostCategory,
          status: p.status as PostStatus,
          likesCount: p.likes_count || 0,
          repliesCount: p.replies_count || 0,
          createdAt: p.created_at,
          authorName: p.author_id ? (authorMap[p.author_id] || 'Unknown') : 'System',
        }));

        setRows(mapped);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load community posts');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch =
        r.title.toLowerCase().includes(q) ||
        (r.content || '').toLowerCase().includes(q) ||
        r.authorName.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [rows, search, categoryFilter]);

  const stats = {
    posts: rows.length,
    pinned: rows.filter((r) => r.status === 'pinned').length,
    likes: rows.reduce((acc, r) => acc + r.likesCount, 0),
    replies: rows.reduce((acc, r) => acc + r.repliesCount, 0),
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Community</h1>
          <p className="text-slate-500 text-sm mt-1">Engage with recent posts and discussions.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Posts" value={stats.posts} icon={MessageSquare} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Pinned" value={stats.pinned} icon={Pin} color="text-amber-600" bg="bg-amber-50" />
          <StatCard label="Likes" value={stats.likes} icon={ThumbsUp} color="text-blue-600" bg="bg-blue-50" />
          <StatCard label="Replies" value={stats.replies} icon={MessageCircle} color="text-emerald-600" bg="bg-emerald-50" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | PostCategory)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            <option value="all">All Categories</option>
            <option value="general">General</option>
            <option value="q_and_a">Q&A</option>
            <option value="resources">Resources</option>
            <option value="showcase">Showcase</option>
          </select>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center text-slate-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No posts found</p>
            </div>
          ) : (
            filtered.map((row) => {
              const meta = CATEGORY_META[row.category];
              const Icon = meta.icon;
              return (
                <div
                  key={row.id}
                  className={cn(
                    'bg-white rounded-2xl border shadow-sm p-5 transition-all hover:shadow-md',
                    row.status === 'pinned' ? 'border-violet-200 bg-violet-50/30' : 'border-slate-100',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', meta.bg)}>
                      <Icon className={cn('w-5 h-5', meta.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900">{row.title}</h3>
                        {row.status === 'pinned' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-violet-100 text-violet-700">
                            <Pin className="w-3 h-3" />
                            Pinned
                          </span>
                        )}
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md', meta.bg, meta.text)}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{row.content || 'No content'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>By {row.authorName}</span>
                        <span>{formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}</span>
                        <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> {row.likesCount}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {row.repliesCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className={cn('p-2 rounded-xl', bg)}>
          <Icon className={cn('w-4 h-4', color)} />
        </div>
      </div>
      <div className={cn('text-2xl font-bold', color)}>{value}</div>
      <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
    </div>
  );
}
