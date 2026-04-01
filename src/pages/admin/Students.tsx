import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { UserProfile } from '../../types';
import { Users, UserPlus, Search, UserCheck, UserX, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import AddStudentModal from '../../components/AddStudentModal';

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
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export default function AdminStudents() {
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
      const res = await fetch('/api/admin/students');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch students');
      setStudents(json.students);
      setTeacherOptions(json.teacherOptions);
    } catch {
      toast.error('Failed to load students');
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
      toast.success(`Student ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch { toast.error('Failed to update status'); }
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
    { label: 'Total Students', value: students.length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Active', value: students.filter(s => s.status === 'active').length, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
    { label: 'Inactive', value: students.filter(s => s.status !== 'active').length, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-100' },
    { label: 'Enrolled in Courses', value: students.filter(s => s.enrolledCourseCount > 0).length, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Students</h1>
            <p className="text-slate-500 text-sm mt-1">Platform-wide view of all student accounts.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            Add Student
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`bg-white border ${s.border} rounded-2xl p-4 shadow-sm`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email or teacher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {teacherOptions.length > 0 && (
            <select
              value={teacherFilter}
              onChange={e => setTeacherFilter(e.target.value)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            >
              <option value="all">All Teachers</option>
              {teacherOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-emerald-300" />
              </div>
              <p className="font-semibold text-slate-700">No students found</p>
              <p className="text-slate-400 text-sm mt-1">
                {search || statusFilter !== 'all' || teacherFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'No students have been added yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-5 py-3.5">Student</th>
                      <th className="px-5 py-3.5">Teacher</th>
                      <th className="px-5 py-3.5">Courses</th>
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
                              {student.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{student.displayName}</div>
                              <div className="text-xs text-slate-400">{student.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-500">{student.teacherName}</td>
                        <td className="px-5 py-4">
                          {student.enrolledCourseCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg">
                              <BookOpen className="w-3 h-3" />
                              {student.enrolledCourseCount} {student.enrolledCourseCount === 1 ? 'course' : 'courses'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300 italic">Not enrolled</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg',
                            student.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          )}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', student.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                            {student.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-400">
                          {new Date(student.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-all">
                            <button
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

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-50">
                {filtered.map(student => (
                  <div key={student.uid} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(student.displayName)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                        {student.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{student.displayName}</div>
                        <div className="text-xs text-slate-400 truncate">{student.email}</div>
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-medium mt-1',
                          student.status === 'active' ? 'text-emerald-600' : 'text-slate-400'
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', student.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                          {student.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleStatus(student)}
                      className={cn(
                        'p-2 rounded-lg shrink-0 transition-all',
                        student.status === 'active'
                          ? 'text-slate-300 hover:text-orange-500 hover:bg-orange-50'
                          : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'
                      )}
                    >
                      {student.status === 'active' ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Student Modal */}
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
