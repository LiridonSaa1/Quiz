import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { Layers, BookOpen, Search, ChevronRight, Lock, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

const COURSE_GRADIENTS = [
  'from-indigo-500 to-violet-500', 'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',  'from-blue-500 to-cyan-500',
  'from-rose-500 to-pink-500',     'from-fuchsia-500 to-purple-500',
];

interface ModuleItem {
  id: string;
  title: string;
  description: string;
  order: number;
  status: string;
  course_id: string;
  courseTitle: string;
  courseGradient: string;
  lessonCount: number;
  completedCount: number;
}

export default function StudentModules() {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [searchParams] = useSearchParams();
  const preselectedCourse = (searchParams.get('courseId') || '').trim();

  useEffect(() => {
    if (preselectedCourse) setCourseFilter(preselectedCourse);
  }, [preselectedCourse]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }
        const uid = session.user.id;

        // Fetch all published courses (handle missing student_ids column gracefully)
        let courseRows: any[] = [];
        try {
          const { data } = await supabase
            .from('courses')
            .select('id,title,status')
            .eq('status', 'published')
            .contains('student_ids', [uid]);
          courseRows = data || [];
        } catch {
          try {
            const { data } = await supabase
              .from('courses')
              .select('id,title,status')
              .eq('status', 'published');
            courseRows = data || [];
          } catch { courseRows = []; }
        }

        if (!courseRows.length) { setLoading(false); return; }

        const courseIds = courseRows.map((c) => c.id);
        const courseGradientMap: Record<string, string> = {};
        const courseTitleMap: Record<string, string> = {};
        courseRows.forEach((c, i) => {
          courseGradientMap[c.id] = COURSE_GRADIENTS[i % COURSE_GRADIENTS.length];
          courseTitleMap[c.id] = c.title || 'Course';
        });

        // Fetch modules for all enrolled courses
        const { data: modRows } = await supabase
          .from('modules')
          .select('id,title,description,order,status,course_id')
          .in('course_id', courseIds)
          .order('order', { ascending: true });

        if (!modRows?.length) { setLoading(false); return; }

        // Fetch lesson counts per module
        const moduleIds = modRows.map((m) => m.id);
        const { data: lessonRows } = await supabase
          .from('lessons')
          .select('id,module_id,status')
          .in('module_id', moduleIds);

        const lessonsByModule: Record<string, string[]> = {};
        (lessonRows || []).forEach((l: any) => {
          if (!lessonsByModule[l.module_id]) lessonsByModule[l.module_id] = [];
          lessonsByModule[l.module_id].push(l.id);
        });

        // Read progress from localStorage for each course
        const completedByModule: Record<string, number> = {};
        courseIds.forEach((cid) => {
          try {
            const raw = localStorage.getItem(`course_progress:${uid}:${cid}`);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const completedIds: string[] = Array.isArray(parsed?.completedLessonIds) ? parsed.completedLessonIds : [];
            modRows
              .filter((m) => m.course_id === cid)
              .forEach((m) => {
                const modLessons = lessonsByModule[m.id] || [];
                completedByModule[m.id] = modLessons.filter((lid) => completedIds.includes(lid)).length;
              });
          } catch { /* skip */ }
        });

        const mapped: ModuleItem[] = modRows.map((m) => ({
          id: m.id,
          title: m.title || 'Untitled Module',
          description: m.description || '',
          order: m.order ?? 0,
          status: m.status || 'published',
          course_id: m.course_id,
          courseTitle: courseTitleMap[m.course_id] || 'Course',
          courseGradient: courseGradientMap[m.course_id] || COURSE_GRADIENTS[0],
          lessonCount: (lessonsByModule[m.id] || []).length,
          completedCount: completedByModule[m.id] || 0,
        }));

        setModules(mapped);
      } catch { /* graceful */ } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const courses = useMemo(() => {
    const seen = new Set<string>();
    return modules
      .filter((m) => { if (seen.has(m.course_id)) return false; seen.add(m.course_id); return true; })
      .map((m) => ({ id: m.course_id, title: m.courseTitle }));
  }, [modules]);

  const filtered = useMemo(() => {
    return modules.filter((m) => {
      if (courseFilter !== 'all' && m.course_id !== courseFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!m.title.toLowerCase().includes(q) && !m.courseTitle.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [modules, search, courseFilter]);

  // Group by course for display
  const grouped = useMemo(() => {
    const map: Record<string, ModuleItem[]> = {};
    filtered.forEach((m) => {
      if (!map[m.course_id]) map[m.course_id] = [];
      map[m.course_id].push(m);
    });
    return Object.entries(map).map(([courseId, mods]) => ({
      courseId,
      courseTitle: mods[0].courseTitle,
      courseGradient: mods[0].courseGradient,
      modules: mods,
    }));
  }, [filtered]);

  return (
    <StudentLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-emerald-600" />
              {t('nav.modules')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('modules.modulesDesc', 'Browse modules from your enrolled courses')}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('modules.searchPlaceholder', 'Search modules...')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-white"
            />
          </div>
          {courses.length > 1 && (
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-slate-700"
            >
              <option value="all">{t('common.allCourses', 'All Courses')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">
              {search ? t('modules.noModulesFound', 'No modules found') : t('modules.noModulesYet', 'No modules yet')}
            </p>
            {!search && (
              <p className="text-sm text-slate-400 mt-1">
                {t('modules.addCourse', 'Enroll in a course to see its modules here')}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.courseId}>
                {/* Course header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0', group.courseGradient)}>
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-slate-700 truncate">{group.courseTitle}</h2>
                    <p className="text-xs text-slate-400">{group.modules.length} {t('modules.modulesLabel', 'modules')}</p>
                  </div>
                  <Link
                    to={`/student/courses/${group.courseId}`}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 shrink-0"
                  >
                    {t('common.viewCourse', 'View course')}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Module cards */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.modules.map((mod, idx) => {
                    const pct = mod.lessonCount > 0 ? Math.round((mod.completedCount / mod.lessonCount) * 100) : 0;
                    const isLocked = mod.status === 'draft';
                    return (
                      <Link
                        key={mod.id}
                        to={`/student/lessons?courseId=${mod.course_id}`}
                        className={cn(
                          'group bg-white rounded-xl border border-slate-200 p-4 flex gap-4 items-start hover:shadow-md hover:border-emerald-300 transition-all',
                          isLocked && 'opacity-60 pointer-events-none'
                        )}
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white bg-gradient-to-br',
                          group.courseGradient
                        )}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                              {mod.title}
                            </h3>
                            {isLocked
                              ? <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              : <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 shrink-0 mt-0.5 transition-colors" />
                            }
                          </div>
                          {mod.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{mod.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              {mod.lessonCount} {t('modules.lessons', 'lessons')}
                            </span>
                            {mod.lessonCount > 0 && (
                              <span className={cn(
                                'text-xs flex items-center gap-1 font-medium',
                                pct === 100 ? 'text-emerald-600' : 'text-slate-400'
                              )}>
                                {pct === 100
                                  ? <CheckCircle2 className="w-3 h-3" />
                                  : <Circle className="w-3 h-3" />
                                }
                                {pct}%
                              </span>
                            )}
                          </div>
                          {mod.lessonCount > 0 && (
                            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-emerald-400')}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
