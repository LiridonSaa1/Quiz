import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  Search, PlayCircle, BookOpen, Layers, Video, FileText,
  HelpCircle, Clock, GripVertical, Lock, Unlock
} from 'lucide-react';
import { toast } from 'sonner';
import { Lesson } from '../../types';
import { cn } from '../../lib/utils';
import StyledSelect from '../../components/ui/StyledSelect';

const LESSON_TYPES = [
  { value: 'video', label: 'Video', icon: Video, color: 'text-blue-600', bg: 'bg-blue-50' },
  { value: 'text', label: 'Text', icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50' },
  { value: 'quiz', label: 'Quiz', icon: HelpCircle, color: 'text-violet-600', bg: 'bg-violet-50' },
];

const getLessonType = (type: string) =>
  LESSON_TYPES.find(t => t.value === type) || LESSON_TYPES[0];

export default function AdminLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [courseMap, setCourseMap] = useState<Record<string, string>>({});
  const [moduleMap, setModuleMap] = useState<Record<string, string>>({});
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});
  const [coursesForFilter, setCoursesForFilter] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lessonsSnap, coursesSnap, modulesSnap, teachersSnap] = await Promise.all([
        supabase.from('lessons').select('*').order('order', { ascending: true }),
        supabase.from('courses').select('id, title, teacher_id'),
        supabase.from('modules').select('id, title'),
        supabase.from('teachers').select('user_id, first_name, last_name'),
      ]);

      if (lessonsSnap.error) throw lessonsSnap.error;

      const tMap: Record<string, string> = {};
      (teachersSnap.data || []).forEach(t => { tMap[t.user_id] = `${t.first_name} ${t.last_name}`; });
      setTeacherMap(tMap);

      const cMap: Record<string, string> = {};
      const teacherByCourse: Record<string, string> = {};
      const courseList: { id: string; title: string }[] = [];
      (coursesSnap.data || []).forEach(c => {
        const title = c.title || 'Untitled';
        cMap[c.id] = title;
        teacherByCourse[c.id] = tMap[c.teacher_id] || '—';
        courseList.push({ id: c.id, title });
      });
      setCourseMap(cMap);
      setCoursesForFilter(courseList);

      const mMap: Record<string, string> = {};
      (modulesSnap.data || []).forEach(m => { mMap[m.id] = m.title; });
      setModuleMap(mMap);

      setLessons((lessonsSnap.data || []).map(l => ({
        id: l.id,
        courseId: l.course_id,
        moduleId: l.module_id,
        title: l.title,
        slug: l.slug || '',
        shortDescription: l.short_description || '',
        type: l.type || 'video',
        durationMinutes: l.duration_minutes || 0,
        order: l.order || 1,
        status: l.status || 'published',
        isFreePreview: l.is_free_preview || false,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      })));
    } catch {
      toast.error('Failed to load lessons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = lessons.filter(l => {
    const matchSearch =
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      (l.shortDescription || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || l.courseId === courseFilter;
    const matchType = typeFilter === 'all' || l.type === typeFilter;
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchCourse && matchType && matchStatus;
  });

  const totalDuration = lessons.reduce((acc, l) => acc + (l.durationMinutes || 0), 0);
  const hours = Math.floor(totalDuration / 60);
  const mins = totalDuration % 60;

  const stats = [
    { label: 'Total Lessons', value: lessons.length, icon: BookOpen, iconBg: 'bg-indigo-100 text-indigo-600', grad: 'from-indigo-500 to-violet-500', ring: 'ring-indigo-100' },
    { label: 'Video', value: lessons.filter(l => l.type === 'video').length, icon: Video, iconBg: 'bg-blue-100 text-blue-600', grad: 'from-blue-500 to-cyan-500', ring: 'ring-blue-100' },
    { label: 'Text', value: lessons.filter(l => l.type === 'text').length, icon: FileText, iconBg: 'bg-amber-100 text-amber-600', grad: 'from-amber-500 to-orange-500', ring: 'ring-amber-100' },
    { label: 'Total Duration', value: `${hours}h ${mins}m`, icon: Clock, iconBg: 'bg-violet-100 text-violet-600', grad: 'from-violet-500 to-purple-500', ring: 'ring-violet-100' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lessons</h1>
          <p className="text-slate-500 text-sm mt-1">Overview of all lessons across the platform.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={cn("h-0.5 bg-gradient-to-r", s.grad)} />
              <div className="p-5">
                <div className={cn("p-2.5 rounded-xl ring-4 inline-flex mb-4", s.iconBg, s.ring)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{s.value}</p>
                <p className="text-sm font-medium text-slate-700 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search lessons..."
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
            {coursesForFilter.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="all">All Types</option>
            {LESSON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
                  <th className="px-5 py-3.5">Lesson</th>
                  <th className="px-5 py-3.5">Course</th>
                  <th className="px-5 py-3.5">Module</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Preview</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={9} className="px-5 py-4 h-16 bg-slate-50/50" />
                    </tr>
                  ))
                ) : filtered.length > 0 ? filtered.map(lesson => {
                  const lt = getLessonType(lesson.type);
                  return (
                    <tr key={lesson.id} className="hover:bg-slate-50/60 transition-all">
                      <td className="pl-5 py-4">
                        <GripVertical className="w-4 h-4 text-slate-300" />
                      </td>
                      <td className="px-5 py-4 min-w-[200px]">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl ${lt.bg} flex items-center justify-center shrink-0`}>
                            <lt.icon className={`w-4 h-4 ${lt.color}`} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900 line-clamp-1">{lesson.title}</div>
                            {lesson.shortDescription && (
                              <div className="text-xs text-slate-400 line-clamp-1 max-w-[200px]">{lesson.shortDescription}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium whitespace-nowrap">
                          <BookOpen className="w-3 h-3" />
                          {courseMap[lesson.courseId] || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium whitespace-nowrap">
                          <Layers className="w-3 h-3" />
                          {moduleMap[lesson.moduleId] || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold', lt.bg, lt.color)}>
                          <lt.icon className="w-3 h-3" />
                          {lt.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 whitespace-nowrap">
                          <Clock className="w-3.5 h-3.5 text-slate-300" />
                          {lesson.durationMinutes} min
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg',
                          lesson.isFreePreview
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        )}>
                          {lesson.isFreePreview ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {lesson.isFreePreview ? 'Free' : 'Locked'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg',
                          lesson.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', lesson.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500')} />
                          {lesson.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-400">{new Date(lesson.createdAt).toLocaleDateString()}</span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={9} className="px-5 py-20 text-center">
                      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <PlayCircle className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-slate-700 font-semibold">No lessons found</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {search || courseFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all'
                          ? 'Try adjusting your filters.'
                          : 'Lessons created by teachers will appear here.'}
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
