import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, Search, Calendar, AlertCircle, CheckCircle2, Archive, FileText, ArrowRight, Play } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isPast, isToday } from 'date-fns';
import { Link } from 'react-router-dom';

type AssignmentStatus = 'draft' | 'published' | 'closed';
type AssignmentType = 'homework' | 'project' | 'essay' | 'quiz' | 'lab' | 'other';

const TYPE_CFG = (t: any): Record<AssignmentType, { label: string; color: string; bg: string }> => ({
  homework: { label: t('common.homework'), color: 'text-blue-700',   bg: 'bg-blue-50'   },
  project:  { label: t('common.project'),  color: 'text-violet-700', bg: 'bg-violet-50' },
  essay:    { label: t('common.essay'),    color: 'text-rose-700',   bg: 'bg-rose-50'   },
  quiz:     { label: t('common.quiz'),     color: 'text-amber-700',  bg: 'bg-amber-50'  },
  lab:      { label: t('common.lab'),      color: 'text-teal-700',   bg: 'bg-teal-50'   },
  other:    { label: t('common.other'),    color: 'text-slate-600',  bg: 'bg-slate-100' },
});

const STATUS_CFG = (t: any): Record<AssignmentStatus, { label: string; bg: string; text: string; icon: React.ElementType }> => ({
  draft:     { label: t('common.draft'),     bg: 'bg-slate-100',  text: 'text-slate-600',   icon: FileText     },
  published: { label: t('common.published'), bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 },
  closed:    { label: t('common.closed'),    bg: 'bg-amber-50',   text: 'text-amber-700',   icon: Archive      },
});

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  type: AssignmentType;
  due_date: string | null;
  max_score: number;
  status: AssignmentStatus;
  created_at: string;
  courseTitle: string;
}

export default function StudentAssignments() {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AssignmentStatus>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch('/api/student/assignments');
        const json = await res.json();
        if (json.success) {
          setAssignments((json.assignments || []).map((a: any) => ({
            ...a,
            courseTitle: a.course_title || a.courseTitle || '',
          })));
        }
      } catch {
        // silent fallback — empty list
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = assignments;
    if (search) list = list.filter(a => a.title.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter);
    return list;
  }, [assignments, search, statusFilter]);

  const overdue = assignments.filter(a => a.due_date && isPast(new Date(a.due_date)) && a.status !== 'closed').length;
  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/25 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
              <ClipboardList className="w-3.5 h-3.5 text-teal-300" />
              <span className="text-white/80 text-xs font-semibold">{t('nav.assignments')}</span>
            </div>
            <h1 className="text-3xl font-black text-white">{t('student.assignments.myAssignments')}</h1>
            <p className="text-slate-400 text-sm mt-1">{t('student.assignments.assignmentsSummary', { count: assignments.length, overdue })}</p>
            {overdue > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 bg-rose-500/20 border border-rose-400/30 rounded-xl px-3 py-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300 text-xs font-semibold">{t('student.assignments.overdueCount', { count: overdue })}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('student.assignments.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 shadow-sm" />
          </div>
          <div className="flex gap-2">
            {(['all', 'published', 'closed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-4 py-2.5 rounded-2xl text-sm font-semibold capitalize transition-all border',
                  statusFilter === s ? 'bg-teal-600 text-white border-transparent shadow-lg shadow-teal-200' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300')}>
                {s === 'all' ? t('common.all') : s === 'published' ? t('common.active') : t('common.closed')}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="h-3 bg-slate-200 animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-5 w-3/4 bg-slate-100 rounded-xl animate-pulse" />
                  <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                  <div className="h-10 bg-slate-100 rounded-2xl animate-pulse mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-teal-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
              <ClipboardList className="w-8 h-8 text-teal-400" />
            </motion.div>
            <p className="text-slate-600 font-bold">{t('student.assignments.noAssignmentsFound')}</p>
            <p className="text-slate-400 text-sm mt-1">
              {hasActiveFilters ? t('student.assignments.noResultsForFilter') : t('student.assignments.noEnrolledContent')}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {filtered.map((a, i) => {
                const typeCfgMap = TYPE_CFG(t);
                const statusCfgMap = STATUS_CFG(t);
                const typeCfg = typeCfgMap[a.type] || typeCfgMap.other;
                const statusCfg = statusCfgMap[a.status];
                const StatusIcon = statusCfg.icon;
                const isOverdue = a.due_date && isPast(new Date(a.due_date)) && a.status !== 'closed';
                const dueToday = a.due_date && isToday(new Date(a.due_date));
                const dueStateLabel = isOverdue ? t('common.overdue') : dueToday ? t('common.dueToday') : a.status === 'closed' ? t('common.closed') : t('common.open');
                return (
                  <motion.div key={a.id}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className={cn(
                      'bg-white rounded-3xl border overflow-hidden shadow-sm hover:shadow-xl hover:shadow-slate-200/80 transition-shadow flex flex-col group',
                      isOverdue ? 'border-rose-200' : 'border-slate-100'
                    )}>
                    <div className={cn(
                      'h-1.5 bg-gradient-to-r',
                      isOverdue ? 'from-rose-500 to-red-500' : 'from-teal-500 to-cyan-500'
                    )} />
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn('p-2.5 rounded-xl transition-colors', typeCfg.bg)}>
                          <ClipboardList className={cn('w-4 h-4', typeCfg.color)} />
                        </div>
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1', statusCfg.bg, statusCfg.text)}>
                          <StatusIcon className="w-3 h-3" /> {t(`common.${statusCfg.label.toLowerCase()}`)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{a.courseTitle}</span>
                        <h3 className="text-sm font-black text-slate-900 mt-0.5 mb-2 line-clamp-2 group-hover:text-teal-600 transition-colors">{a.title}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                          {a.description || t('student.assignments.completeAssignmentPlaceholder')}
                        </p>
                        <div className="flex gap-2 mb-5 flex-wrap">
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg', typeCfg.bg, typeCfg.color)}>{typeCfg.label}</span>
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-lg',
                            isOverdue
                              ? 'bg-rose-50 text-rose-600'
                              : dueToday
                                ? 'bg-amber-50 text-amber-600'
                                : a.status === 'closed'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-blue-50 text-blue-700'
                          )}>
                            {dueStateLabel}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 mb-5">
                          {a.due_date && (
                            <span className={cn('flex items-center gap-1 text-xs font-medium', isOverdue ? 'text-rose-500' : 'text-slate-400')}>
                              <Calendar className="w-3 h-3" /> {format(new Date(a.due_date), 'MMM d, yyyy')}
                            </span>
                          )}
                          <span className="text-xs text-slate-400 font-medium">Max: {a.max_score} pts</span>
                        </div>
                      </div>
                      <Link
                        to={`/student/assignments/${a.id}`}
                        className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-bold transition-all bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:opacity-90 shadow-lg shadow-teal-200/60"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {t('student.assignments.viewDetails')}
                        <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                      </Link>
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
