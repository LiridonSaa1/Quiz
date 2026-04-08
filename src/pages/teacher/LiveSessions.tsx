import React, { useEffect, useMemo, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { Video, Search, CalendarDays, Clock, ExternalLink, Radio, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';

type SessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

interface SessionRow {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: SessionStatus;
  meetingUrl: string | null;
  courseTitle: string;
}

const STATUS_META: Record<SessionStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', icon: CalendarDays },
  live: { label: 'Live', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', icon: Radio },
  ended: { label: 'Ended', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', icon: XCircle },
};

export default function TeacherLiveSessions() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SessionStatus>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const teacherId = session.user.id;

        const sessionsRes = await supabase
          .from('live_sessions')
          .select('*')
          .eq('host_id', teacherId)
          .order('scheduled_at', { ascending: false });
        if (sessionsRes.error) throw sessionsRes.error;

        const courseIds = Array.from(
          new Set((sessionsRes.data || []).map((s: any) => s.course_id).filter(Boolean)),
        ) as string[];

        let courseMap: Record<string, string> = {};
        if (courseIds.length > 0) {
          const coursesRes = await supabase.from('courses').select('id,title').in('id', courseIds);
          if (!coursesRes.error) {
            courseMap = (coursesRes.data || []).reduce((acc: Record<string, string>, c: any) => {
              acc[c.id] = c.title;
              return acc;
            }, {});
          }
        }

        const mapped = (sessionsRes.data || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          description: s.description || null,
          scheduledAt: s.scheduled_at,
          durationMinutes: s.duration_minutes || 60,
          status: s.status as SessionStatus,
          meetingUrl: s.meeting_url || null,
          courseTitle: s.course_id ? (courseMap[s.course_id] || 'Unknown Course') : 'No Course',
        }));

        setRows(mapped);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load live sessions');
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
        (r.description || '').toLowerCase().includes(q) ||
        r.courseTitle.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const stats = {
    total: rows.length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    live: rows.filter((r) => r.status === 'live').length,
    ended: rows.filter((r) => r.status === 'ended').length,
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
          <h1 className="text-2xl font-bold text-slate-900">Live Sessions</h1>
          <p className="text-slate-500 text-sm mt-1">Manage and monitor your scheduled live classes.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total" value={stats.total} icon={Video} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Scheduled" value={stats.scheduled} icon={CalendarDays} color="text-blue-600" bg="bg-blue-50" />
          <StatCard label="Live" value={stats.live} icon={Radio} color="text-rose-600" bg="bg-rose-50" />
          <StatCard label="Ended" value={stats.ended} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or course..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | SessionStatus)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Video className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No live sessions found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map((row) => {
                const meta = STATUS_META[row.status];
                const Icon = meta.icon;
                return (
                  <div key={row.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 truncate">{row.title}</h3>
                          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold', meta.bg, meta.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{row.description || 'No description'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {format(new Date(row.scheduledAt), 'MMM dd, yyyy HH:mm')}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {row.durationMinutes} min</span>
                          <span>{row.courseTitle}</span>
                          <span>{formatDistanceToNow(new Date(row.scheduledAt), { addSuffix: true })}</span>
                        </div>
                      </div>
                      {row.meetingUrl && (
                        <a
                          href={row.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open Meeting
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
