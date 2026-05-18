import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import { UserProfile } from '../../types';
import { Users, UserPlus, Search, UserCheck, UserX, BookOpen, X, Pencil, Trash2, PartyPopper } from 'lucide-react';
import GenderAvatar from '../../components/ui/GenderAvatar';
import { toast } from 'sonner';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import AddStudentModal from '../../components/AddStudentModal';
import { motion } from 'motion/react';
import { apiUrl, authFetch } from '../../lib/apiUrl';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_SELECT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';

function EmptyIllustration() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="75" width="100" height="35" rx="8" fill="#e0e7ff" />
      <rect x="30" y="55" width="80" height="30" rx="8" fill="#c7d2fe" />
      <rect x="40" y="35" width="60" height="30" rx="8" fill="#a5b4fc" />
      <rect x="50" y="15" width="40" height="30" rx="8" fill="#818cf8" />
      <circle cx="70" cy="30" r="8" fill="#6366f1" />
      <path d="M66 30 L70 25 L74 30" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 25 L70 35" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface StudentWithMeta extends UserProfile {
  teacherName: string;
  enrolledCourseCount: number;
}

const AVATAR_COLORS = [
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-cyan-600',
];
const getAvatarColor = (name: string) => {
  let hash = 0;
  const s = name || '?';
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const STAT_CONFIG = [
  { labelKey: 'dashboard.totalStudents', gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/25', icon: Users },
  { labelKey: 'common.active', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: UserCheck },
  { labelKey: 'common.inactive', gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/25', icon: UserX },
  { labelKey: 'dashboard.withEnrollments', gradient: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25', icon: BookOpen },
];

export default function AdminStudents() {
  const { t } = useTranslation();
  const [students, setStudents] = useState<StudentWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [teacherOptions, setTeacherOptions] = useState<{ id: string; name: string }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await authFetch(apiUrl('/api/admin/students'));
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch students');
      setStudents(json.students);
      setTeacherOptions(json.teacherOptions);
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleStatus = async (student: StudentWithMeta) => {
    const newStatus = student.status === 'active' ? 'inactive' : 'active';
    try {
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', student.uid);
      if (error) throw error;
      toast.success(newStatus === 'active' ? t('students.studentEnabled') : t('students.studentDisabled'));
      fetchData();
    } catch { toast.error(t('errors.saveFailed')); }
  };

  const editStudent = async (student: StudentWithMeta) => {
    const displayName = window.prompt(t('dashboard.studentNamePrompt'), student.displayName || '');
    if (displayName === null) return;
    const email = window.prompt(t('dashboard.studentEmailPrompt'), student.email || '');
    if (email === null) return;
    try {
      const res = await authFetch(apiUrl(`/api/admin/students/${encodeURIComponent(student.uid)}`), {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('errors.saveFailed'));
      toast.success(t('dashboard.studentUpdated'));
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || t('errors.saveFailed'));
    }
  };

  const resetWelcome = async (student: StudentWithMeta) => {
    try {
      const res = await authFetch(apiUrl(`/api/admin/reset-welcome/${encodeURIComponent(student.uid)}`), { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('errors.saveFailed'));
      // Also clear localStorage so the browser shows celebration on next login
      try { localStorage.removeItem(`quizmaster_welcomed_v1_${student.uid}`); } catch {}
      toast.success(t('dashboard.resetWelcomeSuccess', { name: student.displayName || student.email }));
    } catch (e: any) {
      toast.error(e?.message || t('errors.saveFailed'));
    }
  };

  const resetAllWelcome = async () => {
    if (!window.confirm(t('dashboard.resetAllWelcomeConfirm'))) return;
    try {
      const res = await authFetch(apiUrl('/api/admin/reset-all-welcome'), { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('errors.saveFailed'));
      // Clear localStorage for all known students
      students.forEach(s => {
        try { localStorage.removeItem(`quizmaster_welcomed_v1_${s.uid}`); } catch {}
      });
      toast.success(t('dashboard.resetAllWelcomeSuccess', { count: json.count }));
    } catch (e: any) {
      toast.error(e?.message || t('errors.saveFailed'));
    }
  };

  const deleteStudent = async (student: StudentWithMeta) => {
    if (!window.confirm(t('dashboard.deleteStudentConfirm', { name: student.displayName || student.email }))) return;
    try {
      const res = await authFetch(apiUrl(`/api/admin/students/${encodeURIComponent(student.uid)}`), { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('errors.deleteFailed'));
      toast.success(t('success.deleted'));
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || t('errors.deleteFailed'));
    }
  };

  const filtered = students.filter(s => {
    const matchSearch =
      s.displayName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.teacherName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchTeacher = teacherFilter === 'all' || s.teacherId === teacherFilter;
    return matchSearch && matchStatus && matchTeacher;
  });

  const stats = [
    { ...STAT_CONFIG[0], label: t(STAT_CONFIG[0].labelKey), value: students.length },
    { ...STAT_CONFIG[1], label: t(STAT_CONFIG[1].labelKey), value: students.filter(s => s.status === 'active').length },
    { ...STAT_CONFIG[2], label: t(STAT_CONFIG[2].labelKey), value: students.filter(s => s.status !== 'active').length },
    { ...STAT_CONFIG[3], label: t(STAT_CONFIG[3].labelKey), value: students.filter(s => s.enrolledCourseCount > 0).length },
  ];

  const hasActiveFilters = search || statusFilter !== 'all' || teacherFilter !== 'all';

  return (
    <AdminLayout>
      <AdminListPageShell
        breadcrumbLabel={t('nav.students')}
        title={t('nav.students')}
        description={t('dashboard.platformWideStudents')}
        action={
          <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={resetAllWelcome}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            title={t('dashboard.resetAllWelcome')}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm shrink-0 transition-all border border-violet-200 text-violet-600 bg-white hover:bg-violet-50"
            style={{ boxShadow: '0 2px 8px rgba(139,92,246,0.12)' }}
          >
            <PartyPopper className="w-4 h-4" />
            {t('dashboard.resetAllWelcome')}
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setShowAddModal(true)}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
              boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <UserPlus className="w-4 h-4" />
            {t('students.addStudent')}
          </motion.button>
          </div>
        }
        stats={stats}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                type="text"
                placeholder={t('dashboard.searchStudents')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">{t('dashboard.allStatuses')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </select>
            {teacherOptions.length > 0 && (
              <select value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
                <option value="all">{t('dashboard.allTeachers')}</option>
                {teacherOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('all'); setTeacherFilter('all'); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
              >
                <X className="w-3.5 h-3.5" /> {t('dashboard.clearFilters')}
              </button>
            )}
          </AdminListFilterBar>
        }
      >
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {loading ? (
                <div className={ADMIN_LIST_CARD_GRID}>
                  {Array(6).fill(0).map((_, i) => (
                    <div key={i} className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center px-4">
                  <EmptyIllustration />
                  <h3 className="text-xl font-extrabold text-slate-800 mt-6 mb-2">
                    {hasActiveFilters ? t('common.noResults') : t('dashboard.noStudentsYet')}
                  </h3>
                  <p className="text-slate-400 text-sm mb-6 max-w-xs text-center">
                    {hasActiveFilters
                      ? t('dashboard.adjustSearch')
                      : t('dashboard.noStudentsAdded')}
                  </p>
                </div>
              ) : (
                <div className={ADMIN_LIST_CARD_GRID}>
                  {filtered.map(student => (
                    <div key={student.uid} className={ADMIN_LIST_ITEM_CARD} style={{ borderLeftWidth: '4px', borderLeftColor: student.status === 'active' ? '#10b981' : '#94a3b8' }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <GenderAvatar name={student.displayName || student.email} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 truncate">{student.displayName || '—'}</div>
                          <div className="text-xs text-slate-400 truncate">{student.email}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => resetWelcome(student)}
                            title={t('students.resetWelcome')}
                            className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                          >
                            <PartyPopper className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editStudent(student)}
                            title={t('common.edit')}
                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(student)}
                            title={student.status === 'active' ? t('common.disable') : t('common.enable')}
                            className={cn(
                              'p-2 rounded-lg transition-all',
                              student.status === 'active'
                                ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            )}
                          >
                            {student.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteStudent(student)}
                            title={t('common.delete')}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2 text-slate-500">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider">{t('dashboard.tableHeaders.teacher')}</span>
                          <span className="text-slate-700 truncate text-right">{student.teacherName}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider">{t('courses.title')}</span>
                          {student.enrolledCourseCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg">
                              <BookOpen className="w-3 h-3" />
                              {student.enrolledCourseCount}
                            </span>
                          ) : (
                            <span className="text-slate-300 italic">{t('dashboard.none')}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-slate-500">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider">{t('common.joinedDate')}</span>
                          <span>{new Date(student.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
      </AdminListPageShell>

      {showAddModal && (
        <AddStudentModal
          accentColor="emerald"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => fetchData()}
        />
      )}
    </AdminLayout>
  );
}
