import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, BookOpen, Layers, Globe, ChevronRight, BarChart2, Download,
} from 'lucide-react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { authFetch } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Course, Module } from '../../types';

const LEVEL_COLORS: Record<string, { gradient: string; badge: string; shadow: string }> = {
  Beginner:            { gradient: 'from-emerald-500 to-teal-600',   badge: 'bg-emerald-100 text-emerald-700',  shadow: 'shadow-emerald-500/20' },
  Elementary:          { gradient: 'from-sky-500 to-blue-600',       badge: 'bg-sky-100 text-sky-700',          shadow: 'shadow-sky-500/20' },
  'Pre-Intermediate':  { gradient: 'from-violet-500 to-purple-600',  badge: 'bg-violet-100 text-violet-700',    shadow: 'shadow-violet-500/20' },
  Intermediate:        { gradient: 'from-orange-500 to-amber-600',   badge: 'bg-orange-100 text-orange-700',    shadow: 'shadow-orange-500/20' },
  'Upper-Intermediate':{ gradient: 'from-rose-500 to-pink-600',      badge: 'bg-rose-100 text-rose-700',        shadow: 'shadow-rose-500/20' },
  Advanced:            { gradient: 'from-indigo-600 to-blue-700',    badge: 'bg-indigo-100 text-indigo-700',    shadow: 'shadow-indigo-500/20' },
};

const getColors = (level: string) =>
  LEVEL_COLORS[level] ?? { gradient: 'from-slate-500 to-slate-700', badge: 'bg-slate-100 text-slate-700', shadow: 'shadow-slate-500/20' };

export default function TeacherCoursesList() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const teacherIds = await resolveTeacherIdCandidates(session.user.id);
      const params = teacherIds.map(id => `teacherId=${encodeURIComponent(id)}`).join('&');
      const [cRes, mRes] = await Promise.all([
        authFetch(`/api/teacher/courses?${params}`),
        authFetch(`/api/teacher/modules?userId=${encodeURIComponent(session.user.id)}`),
      ]);
      const cJson = cRes.ok ? await cRes.json().catch(() => ({})) : {};
      const mJson = mRes.ok ? await mRes.json().catch(() => ({})) : {};
      setCourses(Array.isArray(cJson?.courses) ? cJson.courses : []);
      setModules(Array.isArray(mJson?.modules) ? mJson.modules : []);
    } catch {
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const getModuleCount = (courseId: string) =>
    modules.filter(m => (m.courseId || (m as any).course_id) === courseId).length;

  const getLessonCount = (courseId: string) =>
    modules
      .filter(m => (m.courseId || (m as any).course_id) === courseId)
      .reduce((acc, m) => acc + (m.totalLessons || 0), 0);

  return (
    <TeacherLayout>
      <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7" style={{ fontFamily: "'Inter','Poppins',system-ui,sans-serif" }}>

        {/* Hero Header */}
        <div className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)' }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />
          <div className="relative px-6 sm:px-8 lg:px-10 py-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3">
                  <span className="text-indigo-400 uppercase tracking-wider">Teacher Portal</span>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                  <span className="text-indigo-200 uppercase tracking-wider">Courses & Modules</span>
                </nav>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  Courses
                </h1>
                <p className="text-indigo-200 text-sm mt-2 max-w-md">
                  Select a course to manage its modules, lessons and quizzes
                </p>
              </div>
              <div className="flex flex-wrap gap-3 shrink-0">
                <Link to="/teacher/headway-tests"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1565c0 100%)', boxShadow: '0 8px 32px rgba(21,101,192,0.4)' }}>
                  <Globe className="w-4 h-4" />
                  Headway Tests
                </Link>
                <Link to="/teacher/courses/new"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.45)' }}>
                  <Plus className="w-4 h-4" />
                  New Course
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-6 sm:px-8 lg:px-10 py-5 bg-white border-b border-slate-100">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Courses</p>
                <p className="text-lg font-extrabold text-slate-900 leading-none">{courses.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <Layers className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Modules</p>
                <p className="text-lg font-extrabold text-slate-900 leading-none">{modules.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Lessons</p>
                <p className="text-lg font-extrabold text-slate-900 leading-none">
                  {modules.reduce((acc, m) => acc + (m.totalLessons || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="px-6 sm:px-8 lg:px-10 py-8 bg-slate-50 min-h-[60vh]">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 h-56 animate-pulse" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm">
              <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
                <BookOpen className="w-10 h-10 text-indigo-300" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-800 mb-2">No courses yet</h3>
              <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                Create your first course to start building modules and lessons.
              </p>
              <Link to="/teacher/courses/new"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}>
                <Plus className="w-4 h-4" /> Create Course
              </Link>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden" animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}>
              {courses.map((course) => {
                const level: string = (course as any).level || '';
                const title: string = (course as any).name || (course as any).title || 'Untitled Course';
                const description: string = (course as any).description || '';
                const colors = getColors(level);
                const modCount = getModuleCount(course.id);
                const lessonCount = getLessonCount(course.id);

                return (
                  <motion.div
                    key={course.id}
                    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }}
                    whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.14)' }}
                    className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-shadow duration-200">

                    {/* Top accent bar */}
                    <div className={`h-1.5 w-full bg-gradient-to-r ${colors.gradient}`} />

                    <div className="p-6 flex flex-col flex-1">
                      {/* Icon + level badge */}
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shrink-0 shadow-md ${colors.shadow}`}>
                          <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        {level && (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${colors.badge}`}>
                            {level}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-base font-extrabold text-slate-900 line-clamp-2 leading-snug mb-1">
                        {title}
                      </h3>
                      {description && (
                        <p className="text-xs text-slate-400 line-clamp-2 mb-2">{description}</p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-5 py-3 mt-auto border-t border-slate-50">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-sm font-bold text-slate-700">{modCount}</span>
                          <span className="text-xs text-slate-400">modules</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                          <span className="text-sm font-bold text-slate-700">{lessonCount}</span>
                          <span className="text-xs text-slate-400">lessons</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-3">
                        <Link
                          to={`/teacher/courses/${course.id}/modules`}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                          style={{ background: `linear-gradient(135deg, ${colors.gradient.replace('from-', '').replace(' to-', ', ')})` }}>
                          <Layers className="w-3.5 h-3.5" />
                          View Modules
                        </Link>
                        <Link
                          to={`/teacher/courses/${course.id}/modules?import=headway`}
                          title="Import Headway curriculum"
                          className="flex items-center justify-center w-11 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all active:scale-95">
                          <Download className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

      </div>
    </TeacherLayout>
  );
}
