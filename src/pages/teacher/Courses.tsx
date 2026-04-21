import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Plus, Search, BookOpen, Users, Globe, Eye, EyeOff,
  LayoutGrid, List, Edit2, Trash2, Award, AlertTriangle,
  FileText, CheckCircle2, GraduationCap, MoreVertical
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { apiUrl } from '../../lib/apiUrl';
import { AIPanel, AITriggerButton } from '../../components/AIPanel';
import { generateCourseData } from '../../lib/gemini';

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
  const [courseToDelete, setCourseToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const navigate = useNavigate();

  const handleAICreate = async (input: string) => {
    const aiData = await generateCourseData(input);
    navigate('/teacher/courses/new', { state: { aiData } });
  };

  const fetchCourses = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setCourses([]);
      setLoading(false);
      return;
    }
    try {
      const backendRes = await fetch(apiUrl(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`));
      if (backendRes.ok) {
        const backendJson = await backendRes.json();
        if (backendJson?.success && Array.isArray(backendJson.courses)) {
          setCourses(backendJson.courses);
          return;
        }
      }

      const scopedIds = await resolveTeacherIdCandidates(session.user.id);

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .in('teacher_id', scopedIds)
        .order('created_at', { ascending: false });

      if (error && error.code !== 'PGRST116') throw error;
      setCourses(data || []);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load courses');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCourses(); }, []);

  const requestDeleteCourse = (course: { id: string; name?: string; title?: string }) => {
    const title = (course.name || course.title || 'Untitled').trim() || 'Untitled';
    setCourseToDelete({ id: course.id, title });
  };

  const performDeleteCourse = async () => {
    if (!courseToDelete) return;
    const courseId = courseToDelete.id;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Not signed in');
      return;
    }

    const fail = (message: string) => toast.error(message);
    setDeleting(true);

    try {
      const res = await fetch(
        apiUrl(`/api/teacher/courses/${encodeURIComponent(courseId)}/delete?userId=${encodeURIComponent(session.user.id)}`),
        { method: 'POST' }
      );

      let body: { error?: string } = {};
      try {
        body = await res.json();
      } catch { /* non-JSON response */ }

      if (res.ok) {
        toast.success('Course deleted');
        setCourseToDelete(null);
        fetchCourses();
        return;
      }

      const apiMessage = typeof body?.error === 'string' ? body.error : '';

      if (apiMessage) {
        fail(apiMessage);
        return;
      }

      if (res.status === 403 || res.status === 404 || res.status === 409) {
        fail('Could not delete this course.');
        return;
      }

      const scopedIds = await resolveTeacherIdCandidates(session.user.id);
      const { data: deleted, error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId)
        .in('teacher_id', scopedIds)
        .select('id');

      if (error) {
        fail(error.message || 'Failed to delete course');
        return;
      }
      if (!deleted?.length) {
        fail(
          'Could not delete this course. If you are the owner, restart the app server so the API is available, or remove related quizzes and classes in the database first.'
        );
        return;
      }
      toast.success('Course deleted');
      setCourseToDelete(null);
      fetchCourses();
    } catch (e: any) {
      fail(e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const toggleStatus = async (course: any) => {
    const newStatus = course.status === 'published' ? 'draft' : 'published';
    try {
      const res = await authFetch(`/api/teacher/courses/${encodeURIComponent(course.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to update status');
      }
      toast.success(`Course ${newStatus === 'published' ? 'published' : 'set to draft'}`);
      fetchCourses();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update status');
    }
  };

  const filtered = courses.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = (c.name || c.title || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = [
    { label: 'My Courses', value: courses.length, icon: BookOpen, iconBg: 'bg-violet-100 text-violet-600', grad: 'from-violet-500 to-purple-500', ring: 'ring-violet-100' },
    { label: 'Published', value: courses.filter(c => c.status === 'published').length, icon: CheckCircle2, iconBg: 'bg-emerald-100 text-emerald-600', grad: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-100' },
    { label: 'Drafts', value: courses.filter(c => c.status !== 'published').length, icon: FileText, iconBg: 'bg-amber-100 text-amber-600', grad: 'from-amber-500 to-orange-500', ring: 'ring-amber-100' },
    { label: 'Total Students', value: courses.reduce((acc, c) => acc + (c.student_ids?.length || c.total_students || 0), 0), icon: GraduationCap, iconBg: 'bg-indigo-100 text-indigo-600', grad: 'from-indigo-500 to-blue-500', ring: 'ring-indigo-100' },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
            <p className="text-slate-500 text-sm mt-1">Build and manage your educational courses.</p>
          </div>
          <div className="flex items-center gap-2">
            <AITriggerButton onClick={() => setAiOpen(true)} label="AI Create" />
            <Link to="/teacher/courses/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-[0.98]">
              <Plus className="w-4 h-4" />
              New Course
            </Link>
          </div>
        </div>

        <AIPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          label="AI Course Creator"
          description="Describe your course — AI will fill the form automatically"
          placeholder='e.g. "Create an intermediate JavaScript course for web developers covering async/await, APIs, and DOM manipulation, with tags and free access"'
          buttonLabel="Create Course"
          onSubmit={handleAICreate}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={cn('h-0.5 bg-gradient-to-r', s.grad)} />
              <div className="p-5">
                <div className={cn('p-2.5 rounded-xl ring-4 inline-flex mb-4', s.iconBg, s.ring)}>
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
              placeholder="Search courses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all placeholder-slate-400"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(['All', 'published', 'draft'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200',
                  statusFilter === f
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {Array(4).fill(0).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-72 animate-pulse" />)}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <AnimatePresence>
              {filtered.map((course, i) => (
                <TeacherCourseCard
                  key={course.id}
                  course={course}
                  index={i}
                  gradient={getCourseGradient(course.id)}
                  onEdit={() => navigate(`/teacher/courses/${course.id}/edit`)}
                  onDelete={() => requestDeleteCourse(course)}
                  onToggleStatus={() => toggleStatus(course)}
                />
              ))}
            </AnimatePresence>
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
                          <button onClick={() => requestDeleteCourse(course)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {courseToDelete && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-course-title">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              aria-label="Close"
              disabled={deleting}
              onClick={() => !deleting && setCourseToDelete(null)}
            />
            <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50">
                  <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id="delete-course-title" className="text-lg font-bold text-slate-900">
                    Delete this course?
                  </h3>
                  <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                    <span className="font-semibold text-slate-800">&ldquo;{courseToDelete.title}&rdquo;</span>{' '}
                    will be permanently removed. Modules, lessons, and enrollments tied to it may be affected. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-6">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setCourseToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void performDeleteCourse()}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete course'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}

const AVATAR_COLORS = [
  'from-violet-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-cyan-400 to-blue-500',
  'from-fuchsia-400 to-purple-500',
];

function MiniAvatar({ seed, sizePx = 24 }: { seed: string; sizePx?: number }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  const grad = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  const letter = seed.charAt(0).toUpperCase();
  return (
    <div
      className={`rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold border-2 border-white`}
      style={{ width: sizePx, height: sizePx, fontSize: sizePx * 0.45 }}
    >
      {letter}
    </div>
  );
}

function TeacherCourseCard({ course, gradient, index, onEdit, onDelete, onToggleStatus }: any) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = course.name || course.title || 'Untitled';
  const students = course.student_ids?.length || course.total_students || 0;
  const isPublished = course.status === 'published';
  const studentCap = Math.max(students, 20);
  const progress = Math.min(Math.round((students / studentCap) * 100), 100);
  const fakeAvatarSeeds = Array.from({ length: Math.min(students, 3) }, (_, i) => `${course.id}-${i}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col relative"
    >
      {/* Card Header */}
      <div className={`relative h-36 bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between overflow-hidden rounded-t-2xl`}>
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        <div className="flex items-start justify-between relative z-10">
          <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl border border-white/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border',
            isPublished ? 'bg-emerald-500/30 text-white border-emerald-400/30' : 'bg-white/15 text-white border-white/20'
          )}>
            {course.status || 'draft'}
          </span>
        </div>

        <div className="relative z-10">
          {course.level && (
            <span className="text-[10px] font-semibold bg-white/20 backdrop-blur-sm text-white px-2 py-0.5 rounded-md border border-white/20">
              {course.level}
            </span>
          )}
        </div>
      </div>

      {/* 3-dot menu — outside the header so it's never clipped */}
      <div className="absolute top-3 right-3 z-30">
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
          className="p-1.5 bg-white/15 hover:bg-white/35 backdrop-blur-sm rounded-lg text-white transition-all border border-white/20"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 py-1"
              >
                <button onClick={() => { onToggleStatus(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  {isPublished ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-emerald-500" />}
                  {isPublished ? 'Set to Draft' : 'Publish'}
                </button>
                <button onClick={() => { onEdit(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <Edit2 className="w-3.5 h-3.5 text-violet-500" /> Edit Course
                </button>
                <div className="h-px bg-slate-100 mx-2 my-1" />
                <button onClick={() => { onDelete(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Course
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Card Body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1 group-hover:text-violet-700 transition-colors">{name}</h3>
        <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed flex-1">{course.description || 'No description provided.'}</p>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Enrollment</span>
            <span className="text-[10px] font-bold text-slate-500">{students} students</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ delay: index * 0.06 + 0.3, duration: 0.6, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-50">
          <div className="flex items-center gap-2">
            {fakeAvatarSeeds.length > 0 ? (
              <div className="flex -space-x-1.5">
                {fakeAvatarSeeds.map(seed => <MiniAvatar key={seed} seed={seed} sizePx={24} />)}
                {students > 3 && (
                  <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-slate-500">
                    +{students - 3}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Users className="w-3.5 h-3.5" />
                <span>No students</span>
              </div>
            )}
            {course.certificate_enabled && (
              <span className="ml-1 p-1 bg-amber-50 rounded-lg" title="Certificate enabled">
                <Award className="w-3 h-3 text-amber-500" />
              </span>
            )}
          </div>
          <button
            onClick={onEdit}
            className="text-xs font-semibold text-violet-600 hover:text-violet-700 px-2.5 py-1.5 hover:bg-violet-50 rounded-lg transition-all active:scale-95"
          >
            Edit →
          </button>
        </div>
      </div>
    </motion.div>
  );
}
