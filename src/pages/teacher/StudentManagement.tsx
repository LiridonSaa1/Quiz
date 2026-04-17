import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { Users, UserPlus, Search, UserCheck, UserX, BookOpen, X } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../../types';
import { cn } from '../../lib/utils';
import AddStudentModal from '../../components/AddStudentModal';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { motion } from 'motion/react';
import {
  AdminListPageShell,
  AdminListFilterBar,
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
  const [students, setStudents] = useState<StudentWithCourses[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string; studentIds: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const scopedIds = await resolveTeacherIdCandidates(session.user.id);

      const coursesSnap = await supabase
        .from('courses')
        .select('id, title, name, student_ids')
        .in('teacher_id', scopedIds);
      if (coursesSnap.error) throw coursesSnap.error;

      const coursesData = (coursesSnap.data || []).map((c: { id: string; title?: string; name?: string; student_ids?: string[] }) => ({
        id: c.id,
        name: c.title || c.name || 'Untitled',
        studentIds: Array.isArray(c.student_ids) ? c.student_ids : [],
      }));
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
      toast.success(`Student ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch { toast.error('Failed to update status'); }
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
    return matchSearch && matchStatus && matchCourse;
  }), [students, search, statusFilter, courseFilter, courses]);

  const stats = [
    { ...STAT_CONFIG[0], value: students.length },
    { ...STAT_CONFIG[1], value: students.filter(s => s.status === 'active').length },
    { ...STAT_CONFIG[2], value: students.filter(s => s.status !== 'active').length },
    { ...STAT_CONFIG[3], value: students.filter(s => s.enrolledCourses.length > 0).length },
  ];

  const hasActiveFilters = search || statusFilter !== 'all' || courseFilter !== 'all';

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Students"
        title="Students"
        description="Students linked to your account and their course enrollments."
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
            Add Student
          </motion.button>
        }
        stats={stats}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                type="text"
                placeholder="Search by name, email or course..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {courses.length > 0 && (
              <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
                <option value="all">All courses</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('all'); setCourseFilter('all'); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
              >
                <X className="w-3.5 h-3.5" /> Clear
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
                {hasActiveFilters ? 'No results found' : 'No students yet'}
              </h3>
              <p className="text-slate-400 text-sm mb-6 max-w-xs text-center">
                {hasActiveFilters
                  ? 'Try adjusting your search or filters.'
                  : 'No students have been added yet.'}
              </p>
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(student => {
                const enrolledCount = student.enrolledCourses.length;
                return (
                  <div key={student.uid} className={ADMIN_LIST_ITEM_CARD}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getAvatarColor(student.displayName || student.email || '')} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                        {(student.displayName || student.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">{student.displayName || '—'}</div>
                        <div className="text-xs text-slate-400 truncate">{student.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleStatus(student)}
                        title={student.status === 'active' ? 'Deactivate' : 'Activate'}
                        className={cn(
                          'p-2 rounded-lg shrink-0 transition-all',
                          student.status === 'active'
                            ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        )}
                      >
                        {student.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2 text-slate-500">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                        <span className="text-slate-700 font-medium">{student.status === 'active' ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider">Courses</span>
                        {enrolledCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg">
                            <BookOpen className="w-3 h-3" />
                            {enrolledCount}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic">None</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-slate-500">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider">Joined</span>
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
