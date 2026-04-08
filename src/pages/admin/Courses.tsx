import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  Plus, Search, BookOpen, Users, Globe, BarChart2,
  LayoutGrid, List, Edit2, Trash2, Eye, EyeOff,
  GraduationCap, Clock, Star, Filter, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import StyledSelect from '../../components/ui/StyledSelect';

const GRADIENT_PALETTES = [
  'from-indigo-500 to-violet-600',
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-violet-600',
];

const getCourseGradient = (course: any) => {
  const savedGradient = typeof course?.gradient === 'string' ? course.gradient.trim() : '';
  if (savedGradient) return savedGradient;

  const id = typeof course?.id === 'string' ? course.id : '';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];
};

const LEVELS = ['All Levels', 'Beginner', 'Intermediate', 'Advanced'];
const STATUSES = [
  { label: 'All', value: 'all' },
  { label: 'published', value: 'published' },
  { label: 'unpublished', value: 'draft' },
];

const getNormalizedCourseStatus = (status?: string) =>
  (status || '').toLowerCase() === 'published' ? 'published' : 'draft';

const getCourseStatusLabel = (status?: string) =>
  getNormalizedCourseStatus(status) === 'published' ? 'published' : 'unpublished';

type TeacherOption = {
  id?: string;
  uid?: string;
  teacherId?: string | null;
  display_name?: string;
  displayName?: string;
  email?: string;
};

export default function AdminCourses() {
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('All Levels');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [coursesRes, teachersApiRes] = await Promise.all([
        supabase.from('courses').select('*').order('created_at', { ascending: false }),
        fetch('/api/admin/teachers').then(async (res) => {
          if (!res.ok) throw new Error('Failed to load teachers');
          return res.json();
        }),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (!teachersApiRes.success) throw new Error(teachersApiRes.error || 'Failed to load teachers');

      setCourses(coursesRes.data || []);
      setTeachers(teachersApiRes.teachers || []);
    } catch (err) {
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this course? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (error) throw error;
      toast.success('Course deleted');
      fetchData();
    } catch { toast.error('Failed to delete course'); }
  };

  const toggleStatus = async (course: any) => {
    const currentStatus = getNormalizedCourseStatus(course.status);
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch(`/api/admin/update-course/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update status');

      setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, status: newStatus } : c)));
      toast.success(`Course ${newStatus === 'published' ? 'published' : 'unpublished'}`);
    } catch { toast.error('Failed to update status'); }
  };

  const getTeacherName = (teacherId: string) => {
    const normalizedTeacherId = (teacherId || '').trim();
    if (!normalizedTeacherId) return 'Unknown';

    const t = teachers.find((teacher) =>
      teacher.teacherId === normalizedTeacherId ||
      teacher.uid === normalizedTeacherId ||
      teacher.id === normalizedTeacherId,
    );

    return t?.displayName || t?.display_name || 'Unknown';
  };

  const filtered = courses.filter(c => {
    const q = search.trim().toLowerCase();
    const matchSearch = (c.name || c.title || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
    const normalizedStatusFilter = statusFilter.toLowerCase();
    const normalizedLevelFilter = levelFilter.toLowerCase();
    const courseStatus = getNormalizedCourseStatus(c.status);
    const courseLevel = (c.level || '').toLowerCase();
    const matchStatus = normalizedStatusFilter === 'all' || courseStatus === normalizedStatusFilter;
    const matchLevel = normalizedLevelFilter === 'all levels' || courseLevel === normalizedLevelFilter;
    return matchSearch && matchStatus && matchLevel;
  });

  const stats = [
    { label: 'Total Courses', value: courses.length, icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
    { label: 'Published', value: courses.filter(c => c.status === 'published').length, icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Drafts', value: courses.filter(c => c.status !== 'published').length, icon: EyeOff, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Total Students', value: courses.reduce((acc, c) => acc + (c.student_ids?.length || c.total_students || 0), 0), icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
            <p className="text-slate-500 text-sm mt-1">Manage all courses across the platform.</p>
          </div>
          <Link
            to="/admin/courses/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Course
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            <div key={stat.label} className={`bg-white border ${stat.border} rounded-2xl p-4 shadow-sm`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 ${stat.bg} rounded-xl`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            {LEVELS.map(l => <option key={l}>{l}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 ml-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5' : 'space-y-3'}>
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 h-64 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No courses found</h3>
            <p className="text-slate-400 text-sm mb-6">
              {search ? `No results for "${search}"` : 'Create your first course to get started.'}
            </p>
            <Link to="/admin/courses/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all">
              <Plus className="w-4 h-4" /> Create Course
            </Link>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                teacherName={getTeacherName(course.teacher_id)}
                gradient={getCourseGradient(course)}
                onEdit={() => navigate(`/admin/courses/${course.id}/edit`)}
                onDelete={() => handleDelete(course.id)}
                onToggleStatus={() => toggleStatus(course)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Course</th>
                  <th className="px-5 py-3.5">Teacher</th>
                  <th className="px-5 py-3.5">Level</th>
                  <th className="px-5 py-3.5">Students</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(course => {
                  const name = course.name || course.title || 'Untitled';
                  const students = course.student_ids?.length || course.total_students || 0;
                  return (
                    <tr key={course.id} className="hover:bg-slate-50/60 transition-all group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getCourseGradient(course)} flex items-center justify-center shadow-sm`}>
                            <BookOpen className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900 line-clamp-1">{name}</div>
                            <div className="text-xs text-slate-400 line-clamp-1">{course.description?.substring(0, 50) || 'No description'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{getTeacherName(course.teacher_id)}</td>
                      <td className="px-5 py-4">
                        {course.level ? (
                          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">{course.level}</span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {students}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {(() => {
                          const isPublished = getNormalizedCourseStatus(course.status) === 'published';
                          return (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                              isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              {getCourseStatusLabel(course.status)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          {(() => {
                            const isPublished = getNormalizedCourseStatus(course.status) === 'published';
                            return (
                              <button
                                onClick={() => toggleStatus(course)}
                                className={`p-2 rounded-lg text-xs transition-all ${isPublished ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                title={isPublished ? 'Unpublish' : 'Publish'}
                              >
                                {isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            );
                          })()}
                          <button onClick={() => navigate(`/admin/courses/${course.id}/edit`)}
                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(course.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function CourseCard({ course, teacherName, gradient, onEdit, onDelete, onToggleStatus }: any) {
  const name = course.name || course.title || 'Untitled';
  const students = course.student_ids?.length || course.total_students || 0;
  const isPublished = getNormalizedCourseStatus(course.status) === 'published';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <div className={`relative h-36 bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between`}>
        <div className="flex items-start justify-between">
          <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
            isPublished ? 'bg-emerald-500/30 text-white border border-emerald-400/30' : 'bg-white/20 text-white border border-white/20'
          }`}>
            {getCourseStatusLabel(course.status)}
          </span>
        </div>
        <div>
          {course.level && (
            <span className="text-[10px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-md">
              {course.level}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1">{name}</h3>
        <p className="text-slate-400 text-xs line-clamp-2 mb-4 leading-relaxed flex-1">
          {course.description || 'No description provided.'}
        </p>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-4">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white font-bold text-[9px]">
            {teacherName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{teacherName}</span>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{students}</span>
            {course.language && <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{course.language}</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleStatus}
              className={`p-1.5 rounded-lg transition-all ${
                isPublished
                  ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
              }`}
              title={isPublished ? 'Unpublish' : 'Publish'}
            >
              {isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
