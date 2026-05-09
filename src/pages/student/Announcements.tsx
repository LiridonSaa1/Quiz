import React, { useEffect, useState } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, format, isPast } from 'date-fns';
import {
  Megaphone, Search, Clock, AlertTriangle, Info, Zap,
  Globe, GraduationCap, Tag, Calendar, ChevronDown, ChevronUp, X,
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

const PRIORITY_CFG: Record<Priority, {
  label: string;
  headerGradient: string;
  border: string;
  icon: React.ElementType;
  pill: string;
  glow: string;
}> = {
  normal: {
    label: 'Normal',
    headerGradient: 'from-slate-600 to-slate-700',
    border: 'border-slate-200',
    icon: Info,
    pill: 'bg-white/20 text-white',
    glow: '',
  },
  important: {
    label: 'Important',
    headerGradient: 'from-amber-500 to-orange-600',
    border: 'border-amber-200',
    icon: AlertTriangle,
    pill: 'bg-white/20 text-white',
    glow: 'shadow-amber-100',
  },
  urgent: {
    label: 'Urgent',
    headerGradient: 'from-rose-500 to-red-600',
    border: 'border-rose-200',
    icon: Zap,
    pill: 'bg-white/20 text-white',
    glow: 'shadow-rose-100',
  },
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

function AnnouncementModal({ ann, onClose }: { ann: Announcement; onClose: () => void }) {
  const priCfg  = PRIORITY_CFG[ann.priority];
  const typeCfg = ANN_TYPE_CFG[ann.ann_type || 'general'];
  const PriIcon = priCfg.icon;
  const isExpired = ann.expires_at && isPast(new Date(ann.expires_at));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className={cn('px-6 py-5 bg-gradient-to-br', priCfg.headerGradient)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{typeCfg.emoji}</span>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold', priCfg.pill)}>
                    <PriIcon className="w-3 h-3" />{priCfg.label}
                  </span>
                  {ann.ann_type && ann.ann_type !== 'general' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white">
                      {typeCfg.label}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-white leading-snug">{ann.title}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
        </div>

        <div className="px-6 pb-5 flex flex-wrap items-center gap-3 text-xs text-slate-400 border-t border-slate-100 pt-4">
          {ann.author && <span className="font-semibold text-slate-600">{ann.author.display_name}</span>}
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
          {isExpired && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Expired</span>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function AnnouncementCard({ ann, onClick }: { ann: Announcement; onClick: () => void }) {
  const priCfg  = PRIORITY_CFG[ann.priority];
  const typeCfg = ANN_TYPE_CFG[ann.ann_type || 'general'];
  const PriIcon = priCfg.icon;
  const isExpired = ann.expires_at && isPast(new Date(ann.expires_at));
  const preview = ann.content.length > 120 ? ann.content.slice(0, 120) + '…' : ann.content;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      onClick={onClick}
      className={cn(
        'rounded-2xl border overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow',
        priCfg.border,
        priCfg.glow && `shadow-sm ${priCfg.glow}`,
      )}
    >
      <div className={cn('px-4 py-3 bg-gradient-to-br flex items-center gap-3', priCfg.headerGradient)}>
        <span className="text-2xl">{typeCfg.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold', priCfg.pill)}>
              <PriIcon className="w-2.5 h-2.5" />{priCfg.label}
            </span>
            {isExpired && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white/60 text-xs line-through">Expired</span>
            )}
          </div>
          <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{ann.title}</h3>
        </div>
      </div>

      <div className="px-4 py-3 bg-white flex-1">
        <p className="text-xs text-slate-500 leading-relaxed">{preview}</p>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            <span>
              {ann.published_at
                ? formatDistanceToNow(new Date(ann.published_at), { addSuffix: true })
                : formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}
            </span>
          </div>
          {ann.ann_type && ann.ann_type !== 'general' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
              <Tag className="w-2.5 h-2.5" />{typeCfg.label}
            </span>
          )}
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
  const [selected, setSelected] = useState<Announcement | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/student/announcements');
        const json = await res.json();
        if (json.success) setAnnouncements(json.announcements || []);
      } catch { }
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
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">Announcements</h1>
              {urgentCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold animate-pulse">
                  <Zap className="w-3 h-3" />{urgentCount} Urgent
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm">
              {loading ? 'Loading…' : announcements.length === 0
                ? 'No announcements at the moment.'
                : `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''} from your school`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search announcements…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="all">All Priorities</option>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="all">All Types</option>
            {Object.entries(ANN_TYPE_CFG).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Megaphone className="w-14 h-14 mb-3 opacity-20" />
            <p className="font-semibold text-base">No announcements</p>
            <p className="text-sm mt-1">
              {search || priorityFilter !== 'all' || typeFilter !== 'all'
                ? 'Try clearing your filters'
                : 'Check back later for updates from your school'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filtered.map(ann => (
                <AnnouncementCard key={ann.id} ann={ann} onClick={() => setSelected(ann)} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <AnnouncementModal ann={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </StudentLayout>
  );
}
