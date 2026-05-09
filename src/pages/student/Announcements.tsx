import React, { useEffect, useState } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, format, isPast } from 'date-fns';
import {
  Megaphone, Search, Clock, AlertTriangle, Info, Zap,
  Globe, GraduationCap, Tag, Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';

type Audience  = 'all' | 'students' | 'teachers';
type Priority  = 'normal' | 'important' | 'urgent';
type AnnStatus = 'draft' | 'published' | 'archived';
type AnnType   =
  | 'general' | 'holiday' | 'religious_holiday' | 'teacher_absence'
  | 'class_cancelled' | 'exam_reminder' | 'homework_reminder' | 'emergency' | 'event';

interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: string | null;
  target_audience: Audience;
  priority: Priority;
  status: AnnStatus;
  ann_type?: AnnType;
  scheduled_at?: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  author?: { id: string; display_name: string; email: string } | null;
}

const PRIORITY_CFG: Record<Priority, { label: string; bg: string; text: string; border: string; icon: React.ElementType; pill: string }> = {
  normal:    { label: 'Normal',    bg: 'bg-slate-50',   text: 'text-slate-600',  border: 'border-slate-200', icon: Info,          pill: 'bg-slate-100 text-slate-600'   },
  important: { label: 'Important', bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200', icon: AlertTriangle, pill: 'bg-amber-100 text-amber-700'   },
  urgent:    { label: 'Urgent',    bg: 'bg-rose-50',    text: 'text-rose-700',   border: 'border-rose-300',  icon: Zap,           pill: 'bg-rose-100 text-rose-700'     },
};

const ANN_TYPE_CFG: Record<AnnType, { label: string; emoji: string }> = {
  general:           { label: 'General',           emoji: '📢' },
  holiday:           { label: 'School Holiday',    emoji: '🏖️' },
  religious_holiday: { label: 'Religious Holiday', emoji: '🌙' },
  teacher_absence:   { label: 'Teacher Absence',   emoji: '🙏' },
  class_cancelled:   { label: 'Class Cancelled',   emoji: '❌' },
  exam_reminder:     { label: 'Exam Reminder',     emoji: '📝' },
  homework_reminder: { label: 'Homework Reminder', emoji: '📚' },
  emergency:         { label: 'Emergency',         emoji: '🚨' },
  event:             { label: 'Event',             emoji: '🎉' },
};

const AUD_CFG: Record<Audience, { label: string; icon: React.ElementType }> = {
  all:      { label: 'Everyone', icon: Globe         },
  students: { label: 'Students', icon: GraduationCap },
  teachers: { label: 'Teachers', icon: GraduationCap },
};

function AnnouncementCard({ ann }: { ann: Announcement }) {
  const [expanded, setExpanded] = useState(false);
  const priCfg  = PRIORITY_CFG[ann.priority];
  const typeCfg = ANN_TYPE_CFG[ann.ann_type || 'general'];
  const PriIcon = priCfg.icon;
  const AudIcon = AUD_CFG[ann.target_audience].icon;
  const isExpired = ann.expires_at && isPast(new Date(ann.expires_at));
  const isLong = ann.content.length > 200;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'rounded-2xl border p-5 transition-all',
        priCfg.bg, priCfg.border,
        ann.priority === 'urgent' && 'shadow-md shadow-rose-100',
      )}
    >
      <div className="flex items-start gap-4">
        {/* Emoji icon */}
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0',
          ann.priority === 'urgent' ? 'bg-rose-100' : ann.priority === 'important' ? 'bg-amber-100' : 'bg-white border border-slate-200',
        )}>
          {typeCfg.emoji}
        </div>

        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', priCfg.pill)}>
              <PriIcon className="w-3 h-3" />{priCfg.label}
            </span>
            {ann.ann_type && ann.ann_type !== 'general' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                <Tag className="w-3 h-3" />{typeCfg.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <AudIcon className="w-3 h-3" />{AUD_CFG[ann.target_audience].label}
            </span>
            {isExpired && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400 line-through">
                Expired
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className={cn('font-bold text-base leading-snug', priCfg.text)}>{ann.title}</h3>

          {/* Content */}
          <div className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
            {isLong && !expanded ? ann.content.slice(0, 200) + '…' : ann.content}
          </div>
          {isLong && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="mt-1.5 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Read more</>}
            </button>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-400">
            {ann.author && (
              <span className="font-medium text-slate-500">{ann.author.display_name}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {ann.published_at
                ? formatDistanceToNow(new Date(ann.published_at), { addSuffix: true })
                : formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}
            </span>
            {ann.expires_at && !isExpired && (
              <span className="flex items-center gap-1 text-amber-500">
                <Calendar className="w-3.5 h-3.5" />
                Expires {format(new Date(ann.expires_at), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function StudentAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/student/announcements');
        const json = await res.json();
        if (json.success) setAnnouncements(json.announcements || []);
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = announcements.filter(a => {
    if (search && !a.title.toLowerCase().includes(search.toLowerCase()) && !a.content.toLowerCase().includes(search.toLowerCase())) return false;
    if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
    if (typeFilter !== 'all' && (a.ann_type || 'general') !== typeFilter) return false;
    return true;
  });

  const urgentCount = announcements.filter(a => a.priority === 'urgent').length;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-indigo-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Announcements</h1>
              {urgentCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold animate-pulse">
                  <Zap className="w-3 h-3" />{urgentCount} Urgent
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm ml-11">
              {announcements.length === 0 && !loading
                ? 'No announcements at the moment.'
                : `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''} from your school`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search announcements…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="all">All Priorities</option>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="all">All Types</option>
            {Object.entries(ANN_TYPE_CFG).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-4">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Megaphone className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-semibold text-base">No announcements</p>
            <p className="text-sm mt-1">
              {search || priorityFilter !== 'all' || typeFilter !== 'all'
                ? 'Try clearing your filters'
                : 'Check back later for updates from your school'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-4">
              {filtered.map(ann => (
                <AnnouncementCard key={ann.id} ann={ann} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </StudentLayout>
  );
}
