import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  Search, Layers, BookOpen, PlayCircle, CheckCircle2, XCircle, Users, GripVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { Module } from '../../types';
import { cn } from '../../lib/utils';
import StyledSelect from '../../components/ui/StyledSelect';

export default function AdminModules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Record<string, { title: string; teacher: string }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [modulesSnap, coursesSnap, teachersSnap] = await Promise.all([
        supabase.from('modules').select('*').order('order', { ascending: true }),
        supabase.from('courses').select('id, title, teacher_id'),
        supabase.from('teachers').select('user_id, first_name, last_name'),
      ]);

      if (modulesSnap.error) throw modulesSnap.error;

      const teacherMap: Record<string, string> = {};
      (teachersSnap.data || []).forEach(t => {
        teacherMap[t.user_id] = `${t.first_name} ${t.last_name}`;
      });

      const coursesMap: Record<string, { title: string; teacher: string }> = {};
      (coursesSnap.data || []).forEach(c => {
        coursesMap[c.id] = {
          title: c.title || 'Untitled',
          teacher: teacherMap[c.teacher_id] || 'Unknown',
        };
      });
      setCourses(coursesMap);

      setModules((modulesSnap.data || []).map(m => ({
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        slug: m.slug,
        description: m.description,
        order: m.order,
        status: m.status,
        totalLessons: m.total_lessons || 0,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })));
    } catch {
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const courseOptions = Object.entries(courses).map(([id, val]) => ({ id, title: val.title }));

  const filtered = modules.filter(m => {
    const matchSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    const matchCourse = courseFilter === 'all' || m.courseId === courseFilter;
    return matchSearch && matchStatus && matchCourse;
  });

  const stats = [
    { label: 'Total Modules', value: modules.length, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
    { label: 'Published', value: modules.filter(m => m.status === 'published').length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Drafts', value: modules.filter(m => m.status !== 'published').length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Across Courses', value: new Set(modules.map(m => m.courseId)).size, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Modules</h1>
          <p className="text-slate-500 text-sm mt-1">View all modules across every course on the platform.</p>
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
            <input
              type="text"
              placeholder="Search modules..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="all">All Courses</option>
            {courseOptions.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5 w-8"></th>
                  <th className="px-5 py-3.5">Module</th>
                  <th className="px-5 py-3.5">Course</th>
                  <th className="px-5 py-3.5">Teacher</th>
                  <th className="px-5 py-3.5">Lessons</th>
                  <th className="px-5 py-3.5">Order</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={8} className="px-5 py-4 h-16 bg-slate-50/50" />
                    </tr>
                  ))
                ) : filtered.length > 0 ? filtered.map(mod => (
                  <tr key={mod.id} className="hover:bg-slate-50/60 transition-all">
                    <td className="pl-5 py-4">
                      <GripVertical className="w-4 h-4 text-slate-300" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                          <Layers className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 line-clamp-1">{mod.title}</div>
                          {mod.description && (
                            <div className="text-xs text-slate-400 line-clamp-1 max-w-[220px]">{mod.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                        <BookOpen className="w-3 h-3" />
                        {courses[mod.courseId]?.title || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-slate-500">{courses[mod.courseId]?.teacher || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                        <PlayCircle className="w-4 h-4 text-slate-300" />
                        {mod.totalLessons}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">
                        {mod.order}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg",
                        mod.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", mod.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {mod.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-slate-400">{new Date(mod.createdAt).toLocaleDateString()}</span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-5 py-20 text-center">
                      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Layers className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-slate-700 font-semibold">No modules found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {search || statusFilter !== 'all' || courseFilter !== 'all'
                          ? 'Try adjusting your filters.'
                          : 'Modules created by teachers will appear here.'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
