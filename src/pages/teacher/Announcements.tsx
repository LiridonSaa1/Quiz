import React, { useEffect, useMemo, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { Megaphone, Search, CalendarDays, AlertTriangle, Info, Zap, Users, Globe, GraduationCap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';

type Audience = 'all' | 'students' | 'teachers';
type Priority = 'normal' | 'important' | 'urgent';

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  priority: Priority;
  targetAudience: Audience;
  publishedAt: string | null;
  expiresAt: string | null;
  authorName: string;
}

const PRIORITY_META: Record<Priority, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  normal: { label: 'Normal', icon: Info, bg: 'bg-blue-50', text: 'text-blue-700' },
  important: { label: 'Important', icon: AlertTriangle, bg: 'bg-amber-50', text: 'text-amber-700' },
  urgent: { label: 'Urgent', icon: Zap, bg: 'bg-rose-50', text: 'text-rose-700' },
};

const AUDIENCE_META: Record<Audience, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  all: { label: 'Everyone', icon: Globe, bg: 'bg-slate-100', text: 'text-slate-600' },
  teachers: { label: 'Teachers', icon: Users, bg: 'bg-violet-50', text: 'text-violet-700' },
  students: { label: 'Students', icon: GraduationCap, bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

export default function TeacherAnnouncements() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await supabase
          .from('announcements')
          .select('*')
          .eq('status', 'published')
          .order('published_at', { ascending: false });

        if (res.error) throw res.error;

        const source = (res.data || []).filter((a: any) => a.target_audience === 'all' || a.target_audience === 'teachers');
        const authorIds = Array.from(new Set(source.map((a: any) => a.author_id).filter(Boolean))) as string[];

        let authorMap: Record<string, string> = {};
        if (authorIds.length > 0) {
          const profilesRes = await supabase.from('profiles').select('id,display_name').in('id', authorIds);
          if (!profilesRes.error) {
            authorMap = (profilesRes.data || []).reduce((acc: Record<string, string>, p: any) => {
              acc[p.id] = p.display_name || 'Unknown';
              return acc;
            }, {});
          }
        }

        const mapped = source.map((a: any) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          priority: a.priority as Priority,
          targetAudience: a.target_audience as Audience,
          publishedAt: a.published_at || null,
          expiresAt: a.expires_at || null,
          authorName: a.author_id ? (authorMap[a.author_id] || 'Unknown') : 'System',
        }));

        setRows(mapped);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load announcements');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch = r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
      const matchesPriority = priorityFilter === 'all' || r.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [rows, search, priorityFilter]);

  const stats = {
    total: rows.length,
    urgent: rows.filter((r) => r.priority === 'urgent').length,
    expiringSoon: rows.filter((r) => {
      if (!r.expiresAt) return false;
      const expiry = new Date(r.expiresAt).getTime();
      const now = Date.now();
      const within3Days = expiry - now <= 3 * 24 * 60 * 60 * 1000;
      return within3Days && expiry > now;
    }).length,
    expired: rows.filter((r) => r.expiresAt && isPast(new Date(r.expiresAt))).length,
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
          <h1 className="text-2xl font-bold text-slate-900">Announcements</h1>
          <p className="text-slate-500 text-sm mt-1">Important announcements visible to teachers.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Published" value={stats.total} icon={Megaphone} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Urgent" value={stats.urgent} icon={Zap} color="text-rose-600" bg="bg-rose-50" />
          <StatCard label="Expiring Soon" value={stats.expiringSoon} icon={CalendarDays} color="text-amber-600" bg="bg-amber-50" />
          <StatCard label="Expired" value={stats.expired} icon={AlertTriangle} color="text-slate-600" bg="bg-slate-100" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search announcements..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | Priority)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            <option value="all">All Priorities</option>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center text-slate-400">
              <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No announcements found</p>
            </div>
          ) : (
            filtered.map((row) => {
              const priority = PRIORITY_META[row.priority];
              const audience = AUDIENCE_META[row.targetAudience];
              const PriorityIcon = priority.icon;
              const AudienceIcon = audience.icon;
              const isExpired = row.expiresAt ? isPast(new Date(row.expiresAt)) : false;

              return (
                <div key={row.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900">{row.title}</h3>
                        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md', priority.bg, priority.text)}>
                          <PriorityIcon className="w-3 h-3" />
                          {priority.label}
                        </span>
                        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md', audience.bg, audience.text)}>
                          <AudienceIcon className="w-3 h-3" />
                          {audience.label}
                        </span>
                        {isExpired && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                            Expired
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{row.content}</p>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>By {row.authorName}</span>
                        <span>{row.publishedAt ? formatDistanceToNow(new Date(row.publishedAt), { addSuffix: true }) : 'Unscheduled'}</span>
                        {row.expiresAt && <span>Expires {format(new Date(row.expiresAt), 'MMM dd, yyyy')}</span>}
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
