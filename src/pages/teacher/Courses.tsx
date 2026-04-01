import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Plus, Search, BookOpen, Users, Globe, Eye, EyeOff,
  LayoutGrid, List, Edit2, Trash2, Award, Layers
} from 'lucide-react';
import { toast } from 'sonner';

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

const getCourseGradient = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];
};

export default function TeacherCourses() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const navigate = useNavigate();

  const fetchCourses = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('courses').select('*')
        .eq('teacher_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error && error.code !== 'PGRST116' && (error as any).status !== 400) throw error;
      setCourses(data || []);
    } catch { toast.error('Failed to load courses'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCourses(); }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this course?')) return;
    try {
      await supabase.from('courses').delete().eq('id', id);
      toast.success('Course deleted');
      fetchCourses();
    } catch { toast.error('Failed to delete'); }
  };

  const toggleStatus = async (course: any) => {
    const newStatus = course.status === 'published' ? 'draft' : 'published';
    try {
      await supabase.from('courses').update({ status: newStatus }).eq('id', course.id);
      toast.success(`Course ${newStatus === 'published' ? 'published' : 'set to draft'}`);
      fetchCourses();
    } catch { toast.error('Failed to update status'); }
  };

  const filtered = courses.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = (c.name || c.title || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = [
    { label: 'My Courses', value: courses.length, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
    { label: 'Published', value: courses.filter(c => c.status === 'published').length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Drafts', value: courses.filter(c => c.status !== 'published').length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Total Students', value: courses.reduce((acc, c) => acc + (c.student_ids?.length || c.total_students || 0), 0), color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
            <p className="text-slate-500 text-sm mt-1">Build and manage your educational courses.</p>
          </div>
          <Link to="/teacher/courses/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98]">
            <Plus className="w-4 h-4" />
            New Course
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            <div key={stat.label} className={`bg-white border ${stat.border} rounded-2xl p-4 shadow-sm`}>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all">
            {['All', 'published', 'draft'].map(s => <option key={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 ml-auto">
            {(['grid', 'list'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`p-2 rounded-lg transition-all ${viewMode === mode ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}>
                {mode === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array(3).fill(0).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-64 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-violet-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No courses yet</h3>
            <p className="text-slate-400 text-sm mb-6">{search ? `No results for "${search}"` : 'Create your first course to get started.'}</p>
            <Link to="/teacher/courses/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all">
              <Plus className="w-4 h-4" /> Create Course
            </Link>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(course => (
              <TeacherCourseCard key={course.id} course={course} gradient={getCourseGradient(course.id)}
                onEdit={() => navigate(`/teacher/courses/${course.id}/edit`)}
                onDelete={() => handleDelete(course.id)}
                onToggleStatus={() => toggleStatus(course)} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Course</th>
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
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getCourseGradient(course.id)} flex items-center justify-center`}>
                            <BookOpen className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900 line-clamp-1">{name}</div>
                            <div className="text-xs text-slate-400">{course.language || 'English'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {course.level ? <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-medium">{course.level}</span> : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-4"><span className="flex items-center gap-1.5 text-sm text-slate-600"><Users className="w-3.5 h-3.5 text-slate-400" />{students}</span></td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${course.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${course.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {course.status || 'draft'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => toggleStatus(course)} className={`p-2 rounded-lg transition-all ${course.status === 'published' ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                            {course.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button onClick={() => navigate(`/teacher/courses/${course.id}/edit`)} className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(course.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"><Trash2 className="w-4 h-4" /></button>
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
    </TeacherLayout>
  );
}

function TeacherCourseCard({ course, gradient, onEdit, onDelete, onToggleStatus }: any) {
  const name = course.name || course.title || 'Untitled';
  const students = course.student_ids?.length || course.total_students || 0;
  const isPublished = course.status === 'published';
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group overflow-hidden flex flex-col">
      <div className={`relative h-36 bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between`}>
        <div className="flex items-start justify-between">
          <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${isPublished ? 'bg-emerald-500/30 text-white border border-emerald-400/30' : 'bg-white/20 text-white border border-white/20'}`}>
            {course.status || 'draft'}
          </span>
        </div>
        {course.level && <span className="text-[10px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-md w-fit">{course.level}</span>}
        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={onToggleStatus} className={`p-1.5 rounded-lg backdrop-blur-sm text-white transition-all ${isPublished ? 'bg-amber-500/40 hover:bg-amber-500/70' : 'bg-emerald-500/40 hover:bg-emerald-500/70'}`}>
            {isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onEdit} className="p-1.5 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-lg text-white transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1.5 bg-red-500/30 hover:bg-red-500/60 backdrop-blur-sm rounded-lg text-white transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1">{name}</h3>
        <p className="text-slate-400 text-xs line-clamp-2 mb-4 leading-relaxed flex-1">{course.description || 'No description provided.'}</p>
        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{students}</span>
            {course.language && <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{course.language}</span>}
            {course.certificate_enabled && <span className="flex items-center gap-1 text-amber-600"><Award className="w-3.5 h-3.5" /></span>}
          </div>
          <button onClick={onEdit} className="text-xs font-semibold text-violet-600 hover:text-violet-700 px-2.5 py-1.5 hover:bg-violet-50 rounded-lg transition-all">Edit</button>
        </div>
      </div>
    </div>
  );
}
