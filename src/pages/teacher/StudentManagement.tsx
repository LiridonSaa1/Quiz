import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Plus, Search, Users, BookOpen, UserCheck, UserX, ChevronRight, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../../types';
import { cn } from '../../lib/utils';
import AddStudentModal from '../../components/AddStudentModal';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

function AnimatedCount({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
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
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
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
  { label: 'Total Students', gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', shadow: 'shadow-indigo-500/25', icon: Users },
  { label: 'Active', gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20', shadow: 'shadow-emerald-500/25', icon: UserCheck },
  { label: 'Inactive', gradient: 'from-amber-500 to-amber-600', iconBg: 'bg-white/20', shadow: 'shadow-amber-500/25', icon: UserX },
  { label: 'With enrollments', gradient: 'from-violet-500 to-violet-600', iconBg: 'bg-white/20', shadow: 'shadow-violet-500/25', icon: BookOpen },
];

export default function StudentManagement() {
  const [students, setStudents] = useState<StudentWithCourses[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string; studentIds: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const [profilesSnap, coursesSnap] = await Promise.all([
        supabase.from('profiles').select('*').eq('teacher_id', session.user.id).eq('role', 'student').order('created_at', { ascending: false }),
        supabase.from('courses').select('id, title, student_ids').eq('teacher_id', session.user.id),
      ]);
      if (profilesSnap.error) throw profilesSnap.error;

      const coursesData = (coursesSnap.data || []).map(c => ({
        id: c.id,
        name: c.title || 'Untitled',
        studentIds: c.student_ids || [],
      }));
      setCourses(coursesData);

      const coursesByStudent: Record<string, string[]> = {};
      coursesData.forEach(c => {
        c.studentIds.forEach((sid: string) => {
          if (!coursesByStudent[sid]) coursesByStudent[sid] = [];
          coursesByStudent[sid].push(c.name);
        });
      });

      setStudents((profilesSnap.data || []).map(d => ({
        uid: d.id,
        email: d.email,
        displayName: d.display_name,
        role: d.role,
        teacherId: d.teacher_id,
        status: d.status || 'active',
        createdAt: d.created_at,
        enrolledCourses: coursesByStudent[d.id] || [],
      })));
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

  const filtered = students.filter(s => {
    const matchSearch =
      s.displayName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchCourse = courseFilter === 'all' || courses.some(
      c => c.id === courseFilter && c.studentIds.includes(s.uid)
    );
    return matchSearch && matchStatus && matchCourse;
  });

  const stats = [
    { ...STAT_CONFIG[0], value: students.length },
    { ...STAT_CONFIG[1], value: students.filter(s => s.status === 'active').length },
    { ...STAT_CONFIG[2], value: students.filter(s => s.status !== 'active').length },
    { ...STAT_CONFIG[3], value: students.filter(s => s.enrolledCourses.length > 0).length },
  ];

  const hasActiveFilters = search || statusFilter !== 'all' || courseFilter !== 'all';

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />
          <div className="pointer-events-none absolute top-96 left-1/2 w-72 h-72 rounded-full bg-indigo-100/20 blur-3xl" />

          <div
            className="relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)',
            }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />

            <div className="relative px-6 sm:px-8 lg:px-10 py-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                    <span className="text-indigo-400 tracking-wider uppercase">Teacher Portal</span>
                    <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                    <span className="text-indigo-200 tracking-wider uppercase">Students</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Students
                  </h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    Manage your students and their course enrollments.
                  </p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
                    boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add Student
                </motion.button>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08 } },
              }}
            >
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
                    }}
                    className={cn(
                      'relative overflow-hidden rounded-2xl p-5 text-white shadow-lg',
                      `bg-gradient-to-br ${stat.gradient}`,
                      stat.shadow
                    )}
                    style={{ boxShadow: `0 8px 24px var(--tw-shadow-color, rgba(0,0,0,0.12))` }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-3xl font-extrabold tracking-tight"><AnimatedCount value={stat.value} /></div>
                        <div className="text-xs font-semibold text-white/75 mt-1">{stat.label}</div>
                      </div>
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.iconBg)}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </motion.div>
                );
              })}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="rounded-2xl border border-white/60 shadow-sm p-4 flex flex-wrap gap-3 items-center"
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Filters</p>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={courseFilter}
                onChange={e => setCourseFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">All Courses</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setStatusFilter('all'); setCourseFilter('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </motion.div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-8 space-y-3">
                  {Array(6).fill(0).map((_, i) => (
                    <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center px-4">
                  <EmptyIllustration />
                  <h3 className="text-xl font-extrabold text-slate-800 mt-6 mb-2">
                    {hasActiveFilters ? 'No results found' : 'No students yet'}
                  </h3>
                  <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                    {hasActiveFilters
                      ? 'Try adjusting your search or filters.'
                      : 'Add your first student to get started.'}
                  </p>
                  {!hasActiveFilters && (
                    <motion.button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white"
                      style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                      }}
                    >
                      <Plus className="w-4 h-4" /> Add your first student
                    </motion.button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3.5">Student</th>
                        <th className="px-5 py-3.5">Enrolled Courses</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5">Joined</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered.map(student => (
                        <tr key={student.uid} className="hover:bg-slate-50/60 transition-all group">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(student.displayName)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                                {(student.displayName || student.email || '?').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{student.displayName || '—'}</div>
                                <div className="text-xs text-slate-400">{student.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {student.enrolledCourses.length === 0 ? (
                              <span className="text-xs text-slate-300 italic">Not enrolled</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {student.enrolledCourses.slice(0, 2).map((c, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg">
                                    <BookOpen className="w-2.5 h-2.5" />
                                    {c}
                                  </span>
                                ))}
                                {student.enrolledCourses.length > 2 && (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-lg">
                                    +{student.enrolledCourses.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => toggleStatus(student)}
                              className={cn(
                                'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all',
                                student.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              )}
                            >
                              <span className={cn('w-1.5 h-1.5 rounded-full', student.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                              {student.status === 'active' ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-400">
                            {new Date(student.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
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
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <AddStudentModal
          accentColor="violet"
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchData}
        />
      )}
    </TeacherLayout>
  );
}
