import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { Users, UserPlus, Search, UserCheck, UserX, BookOpen, X, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import GenderAvatar from '../../components/ui/GenderAvatar';
import { toast } from 'sonner';
import { UserProfile, UserRole } from '../../types';
import { cn } from '../../lib/utils';
import AddStudentModal from '../../components/AddStudentModal';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { apiUrl, authFetch } from '../../lib/apiUrl';
import { isMissingCoursesStudentIdsError } from '../../lib/schemaErrors';
import { motion, AnimatePresence } from 'motion/react';
import {
  AdminListPageShell,
  AdminListFilterBar,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_SELECT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';

function DeleteConfirmModal({
  name,
  onConfirm,
  onCancel,
  loading,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mb-1">
            <AlertTriangle className="w-7 h-7 text-rose-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Delete Student</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Are you sure you want to delete <span className="font-semibold text-slate-700">{name}</span>? This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}

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

interface StudentWithCourses extends UserProfile {
  enrolledCourses: string[];
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
  { label: 'Total Students', gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/25', icon: Users },
  { label: 'Active', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: UserCheck },
  { label: 'Inactive', gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/25', icon: UserX },
  { label: 'With enrollments', gradient: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25', icon: BookOpen },
];

export default function StudentManagement() {
  const { t } = useTranslation();
  const [students, setStudents] = useState<StudentWithCourses[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string; studentIds: string[] }[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; studentIds: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudentWithCourses | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const studentsRes = await authFetch(
        `/api/teacher/students?userId=${encodeURIComponent(session.user.id)}`
      );
      const classesRes = await authFetch('/api/teacher/classes');
      if (classesRes.ok) {
        const classesJson = await classesRes.json();
        if (classesJson?.success && Array.isArray(classesJson.classes)) {
          setClasses(classesJson.classes.map((c: any) => ({
            id: String(c.id),
            name: String(c.name || 'Untitled class'),
            studentIds: Array.isArray(c.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [],
          })));
        }
      }
      if (studentsRes.ok) {
        const json = await studentsRes.json();
        if (json?.success && Array.isArray(json.students) && Array.isArray(json.courses)) {
          setCourses(json.courses);
          setStudents(
            json.students.map((s: {
              uid: string;
              email?: string | null;
              displayName?: string | null;
              role?: string | null;
              teacherId?: string | null;
              status?: string | null;
              createdAt?: string | null;
              enrolledCourses?: string[];
            }) => ({
              uid: s.uid,
              email: s.email ?? '',
              displayName: s.displayName ?? '',
              role: (s.role === 'teacher' || s.role === 'admin' ? s.role : 'student') as UserRole,
              teacherId: s.teacherId,
              status: s.status === 'inactive' ? 'inactive' : 'active',
              createdAt: s.createdAt || new Date().toISOString(),
              enrolledCourses: Array.isArray(s.enrolledCourses) ? s.enrolledCourses : [],
            }))
          );
          return;
        }
      }

      // Fallback when API unavailable: direct Supabase (requires permissive profiles SELECT RLS).
      const scopedIds = await resolveTeacherIdCandidates(session.user.id);

      let courseRows: { id: string; title?: string; name?: string; student_ids?: string[] }[] = [];
      let coursesFromApi = false;
      const coursesOnlyRes = await fetch(
        apiUrl(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`)
      );
      if (coursesOnlyRes.ok) {
        const backendJson = await coursesOnlyRes.json();
        if (backendJson?.success && Array.isArray(backendJson.courses)) {
          courseRows = backendJson.courses;
          coursesFromApi = true;
        }
      }
      if (!coursesFromApi) {
        const withIds = await supabase
          .from('courses')
          .select('id, title, student_ids')
          .in('teacher_id', scopedIds);
        const missingStudentIds = Boolean(withIds.error && isMissingCoursesStudentIdsError(withIds.error));
        if (missingStudentIds) {
          const narrow = await supabase.from('courses').select('id, title').in('teacher_id', scopedIds);
          if (narrow.error) throw narrow.error;
          courseRows = narrow.data || [];
        } else {
          if (withIds.error) throw withIds.error;
          courseRows = withIds.data || [];
        }
      }

      const coursesData = courseRows.map((c: { id: string; title?: string; name?: string; student_ids?: string[] }) => ({
        id: c.id,
        name: c.title || c.name || 'Untitled',
        studentIds: Array.isArray(c.student_ids) ? c.student_ids : [],
      }));

      const { data: classRows, error: clsErr } = await supabase
        .from('classes')
        .select('id, name, course_id, student_ids')
        .in('teacher_id', scopedIds);
      if (!clsErr && classRows?.length) {
        setClasses(classRows.map((cl: any) => ({
          id: String(cl.id),
          name: String(cl.name || 'Untitled class'),
          studentIds: Array.isArray(cl.student_ids) ? cl.student_ids.map((sid: unknown) => String(sid)) : [],
        })));
        const byCourseId = new Map(coursesData.map(c => [c.id, c] as const));
        classRows.forEach((cl: { course_id?: string | null; student_ids?: unknown[] }) => {
          const cid = cl.course_id != null ? String(cl.course_id) : '';
          if (!cid || !byCourseId.has(cid)) return;
          const row = byCourseId.get(cid)!;
          const set = new Set(row.studentIds);
          (Array.isArray(cl.student_ids) ? cl.student_ids : []).forEach((sid: unknown) => {
            const s = String(sid || '');
            if (s) set.add(s);
          });
          row.studentIds = [...set];
        });
      }

      setCourses(coursesData);

      const enrolledIds = new Set<string>();
      coursesData.forEach(c => {
        c.studentIds.forEach((sid: string) => {
          if (sid) enrolledIds.add(sid);
        });
      });

      const [linkedSnap, enrolledSnap] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .in('teacher_id', scopedIds)
          .eq('role', 'student')
          .order('created_at', { ascending: false }),
        enrolledIds.size > 0
          ? supabase.from('profiles').select('*').in('id', [...enrolledIds])
          : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      ]);

      if (linkedSnap.error) throw linkedSnap.error;
      if (enrolledSnap.error) throw enrolledSnap.error;

      type ProfileRow = {
        id: string;
        email?: string | null;
        display_name?: string | null;
        role?: string | null;
        teacher_id?: string | null;
        status?: string | null;
        created_at?: string | null;
      };

      const byId = new Map<string, ProfileRow>();
      (linkedSnap.data || []).forEach((d: ProfileRow) => byId.set(d.id, d));
      (enrolledSnap.data || []).forEach((d: ProfileRow) => {
        if (!byId.has(d.id)) byId.set(d.id, d);
      });

      const merged = [...byId.values()].sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      const coursesByStudent: Record<string, string[]> = {};
      coursesData.forEach(c => {
        c.studentIds.forEach((sid: string) => {
          if (!coursesByStudent[sid]) coursesByStudent[sid] = [];
          coursesByStudent[sid].push(c.name);
        });
      });

      setStudents(
        merged.map(d => ({
          uid: d.id,
          email: d.email,
          displayName: d.display_name,
          role: d.role,
          teacherId: d.teacher_id,
          status: d.status || 'active',
          createdAt: d.created_at,
          enrolledCourses: coursesByStudent[d.id] || [],
        }))
      );
    } catch {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleStatus = async (student: StudentWithCourses) => {
    const newStatus = student.status === 'active' ? 'inactive' : 'active';
    try {
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', student.uid);
      if (error) throw error;
      toast.success(newStatus === 'active' ? t('teacher.studentManagement.studentActivated') : t('teacher.studentManagement.studentDeactivated'));
      fetchData();
    } catch { toast.error(t('teacher.studentManagement.failedUpdateStatus')); }
  };

  const editStudent = async (student: StudentWithCourses) => {
    const displayName = window.prompt(t('teacher.studentManagement.addStudent'), student.displayName || '');
    if (displayName === null) return;
    const email = window.prompt('Email', student.email || '');
    if (email === null) return;
    try {
      const res = await authFetch(`/api/teacher/students/${encodeURIComponent(student.uid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('teacher.studentManagement.failedUpdateStudent'));
      toast.success(t('teacher.studentManagement.studentUpdated'));
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || t('teacher.studentManagement.failedUpdateStudent'));
    }
  };

  const deleteStudent = (student: StudentWithCourses) => {
    setDeleteTarget(student);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/teacher/students/${encodeURIComponent(deleteTarget.uid)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('teacher.studentManagement.failedDeleteStudent'));
      toast.success(t('teacher.studentManagement.studentDeleted'));
      setDeleteTarget(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || t('teacher.studentManagement.failedDeleteStudent'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = useMemo(() => students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch =
      (s.displayName || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      s.enrolledCourses.some(c => c.toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchCourse = courseFilter === 'all' || courses.some(
      c => c.id === courseFilter && c.studentIds.includes(s.uid)
    );
    const matchClass = classFilter === 'all' || classes.some(
      c => c.id === classFilter && c.studentIds.includes(s.uid)
    );
    return matchSearch && matchStatus && matchCourse && matchClass;
  }), [students, search, statusFilter, courseFilter, classFilter, courses, classes]);

  const stats = [
    { ...STAT_CONFIG[0], value: students.length },
    { ...STAT_CONFIG[1], value: students.filter(s => s.status === 'active').length },
    { ...STAT_CONFIG[2], value: students.filter(s => s.status !== 'active').length },
    { ...STAT_CONFIG[3], value: students.filter(s => s.enrolledCourses.length > 0).length },
  ];

  const hasActiveFilters = search || statusFilter !== 'all' || courseFilter !== 'all' || classFilter !== 'all';

  return (
    <TeacherLayout>
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            name={deleteTarget.displayName || deleteTarget.email || 'this student'}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteTarget(null)}
            loading={deleteLoading}
          />
        )}
      </AnimatePresence>
      <AdminListPageShell
        breadcrumbPortalLabel={t('nav.teacherPortal')}
        breadcrumbLabel={t('teacher.studentManagement.title')}
        title={t('teacher.studentManagement.title')}
        description={t('teacher.studentManagement.description')}
        action={
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
            {t('teacher.studentManagement.addStudent')}
          </motion.button>
        }
        stats={stats}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                type="text"
                placeholder={t('teacher.studentManagement.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">{t('teacher.studentManagement.allStatuses')}</option>
              <option value="active">{t('teacher.studentManagement.active')}</option>
              <option value="inactive">{t('teacher.studentManagement.inactive')}</option>
            </select>
            {courses.length > 0 && (
              <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
                <option value="all">{t('teacher.studentManagement.allCourses')}</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {classes.length > 0 && (
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
                <option value="all">{t('teacher.studentManagement.allClasses')}</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('all'); setCourseFilter('all'); setClassFilter('all'); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
              >
                <X className="w-3.5 h-3.5" /> {t('teacher.studentManagement.clear')}
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
                {hasActiveFilters ? t('teacher.studentManagement.noResults') : t('teacher.studentManagement.noStudentsYet')}
              </h3>
              <p className="text-slate-400 text-sm mb-6 max-w-xs text-center">
                {hasActiveFilters
                  ? t('teacher.studentManagement.adjustSearch')
                  : t('teacher.studentManagement.noStudentsAdded')}
              </p>
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(student => {
                const enrolledCount = student.enrolledCourses.length;
                return (
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
                          onClick={() => editStudent(student)}
                          title="Edit"
                          className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(student)}
                          title={student.status === 'active' ? 'Deactivate' : 'Activate'}
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
                          title="Delete"
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2 text-slate-500">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider">{t('teacher.studentManagement.status')}</span>
                        <span className="text-slate-700 font-medium">{student.status === 'active' ? t('teacher.studentManagement.active') : t('teacher.studentManagement.inactive')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider">{t('teacher.studentManagement.courses')}</span>
                        {enrolledCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg">
                            <BookOpen className="w-3 h-3" />
                            {enrolledCount}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic">{t('teacher.studentManagement.none')}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-slate-500">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider">{t('teacher.studentManagement.joined')}</span>
                        <span>{new Date(student.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
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
    </TeacherLayout>
  );
}
