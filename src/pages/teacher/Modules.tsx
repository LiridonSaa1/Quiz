import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import LoadingButton from '../../components/ui/LoadingButton';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Layers, Trash2, Edit2, GripVertical,
  BookOpen, X, Save, PlayCircle, ChevronRight, ChevronLeft, HelpCircle, AlertTriangle, Calendar,
  Download, Globe, CheckCircle2, ChevronDown, RefreshCw, Copy, CheckSquare, Square,
  Eye, EyeOff, RotateCcw, BarChart2, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { Module, Course } from '../../types';
import { cn } from '../../lib/utils';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useTeacherPermissions } from '../../lib/teacherPermissions';

function AnimatedCount({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
}

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

const emptyForm = { title: '', description: '', order: 1, status: 'active' as 'active' | 'inactive', autoPublish: false, publishAt: '' };

const normalizeModuleStatus = (s: string) => {
  if (s === 'published' || s === 'active') return 'active';
  if (s === 'draft' || s === 'inactive') return 'inactive';
  return s === 'inactive' ? 'inactive' : 'active';
};

function SortableCardShell({
  id,
  canDrag,
  children,
}: {
  id: string;
  canDrag: boolean;
  children: (props: { dragHandleProps: Record<string, unknown>; dragHandleRef: (node: HTMLElement | null) => void; isDragging: boolean }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({
        dragHandleProps: canDrag ? { ...attributes, ...listeners } : {},
        dragHandleRef: setActivatorNodeRef,
        isDragging,
      })}
    </div>
  );
}

const STAT_CONFIG = [
  {
    key: 'modules.totalModules',
    gradient: 'from-indigo-500 to-indigo-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-indigo-500/25',
    icon: Layers,
  },
  {
    key: 'modules.activeModules',
    gradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-emerald-500/25',
    icon: PlayCircle,
  },
  {
    key: 'modules.inactiveModules',
    gradient: 'from-amber-500 to-amber-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-amber-500/25',
    icon: X,
  },
  {
    key: 'modules.totalLessons',
    gradient: 'from-violet-500 to-violet-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-violet-500/25',
    icon: BookOpen,
  },
];

function EmptyIllustration() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="70" width="100" height="40" rx="8" fill="#e0e7ff" />
      <rect x="30" y="52" width="80" height="30" rx="8" fill="#c7d2fe" />
      <rect x="40" y="34" width="60" height="30" rx="8" fill="#a5b4fc" />
      <rect x="50" y="16" width="40" height="30" rx="8" fill="#818cf8" />
      <circle cx="70" cy="31" r="8" fill="#6366f1" />
      <path d="M65 31 L70 26 L75 31" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 26 L70 36" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function TeacherModules() {
  const { t } = useTranslation();
  const { courseId: paramCourseId } = useParams<{ courseId?: string }>();
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; course_id: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState(() => paramCourseId || 'all');
  const [classFilter, setClassFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Module | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formCourseId, setFormCourseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Module | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showHeadwayModal, setShowHeadwayModal] = useState(false);
  const [headwayLevel, setHeadwayLevel] = useState('Beginner');
  const [headwayCourseId, setHeadwayCourseId] = useState('');
  const [headwayImporting, setHeadwayImporting] = useState(false);
  const [headwayOptions, setHeadwayOptions] = useState({
    grammar: true,
    vocabulary: true,
    everydayEnglish: true,
    audioDownload: true,
    videoDownload: true,
    testBuilder: true,
  });
  const [headwayDone, setHeadwayDone] = useState<{ modules: number; lessons: number } | null>(null);
  const [headwayProgress, setHeadwayProgress] = useState<{ unit: number; total: number; title: string; phase: string } | null>(null);
  const [headwayClearing, setHeadwayClearing] = useState(false);
  const [headwayClearConfirm, setHeadwayClearConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [bulkActioning, setBulkActioning] = useState(false);
  const [importAllLevels, setImportAllLevels] = useState(false);
  const [showCompletionDashboard, setShowCompletionDashboard] = useState(false);
  const [completionCourseId, setCompletionCourseId] = useState('');
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionData, setCompletionData] = useState<any | null>(null);
  const { can } = useTeacherPermissions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      let courseRows: any[] = [];
      let classRows: Array<{ id: string; name: string; course_id: string | null }> = [];

      const backendRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`);
      if (backendRes.ok) {
        const backendJson = await backendRes.json();
        if (backendJson?.success && Array.isArray(backendJson.courses)) {
          courseRows = backendJson.courses;
        }
      }

      if (courseRows.length === 0) {
        const scopedIds = await resolveTeacherIdCandidates(session.user.id);
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .in('teacher_id', scopedIds)
          .order('created_at', { ascending: false });
        if (coursesError && (coursesError as any).code !== 'PGRST116') throw coursesError;
        courseRows = coursesData || [];
      }

      const classesRes = await authFetch(`/api/teacher/classes?userId=${encodeURIComponent(session.user.id)}`);
      if (classesRes.ok) {
        const classesJson = await classesRes.json();
        if (classesJson?.success && Array.isArray(classesJson.classes)) {
          classRows = classesJson.classes.map((c: any) => ({
            id: String(c.id),
            name: String(c.name || 'Untitled class'),
            course_id: c.course_id ? String(c.course_id) : null,
          }));
        }
      }

      const courseList = courseRows.map((c: any) => ({
        ...c,
        id: c.id,
        title: c.title || '',
        name: c.name || c.title,
      }));
      setCourses(courseList as Course[]);
      setClasses(classRows.filter((c) => !!c.course_id && courseList.some((co: any) => co.id === c.course_id)));

      if (courseList.length === 0) {
        setModules([]);
        return;
      }

      let modulesData: any[] | null = null;
      const modulesRes = await authFetch(`/api/teacher/modules?userId=${encodeURIComponent(session.user.id)}`);
      if (modulesRes.ok) {
        const modulesJson = await modulesRes.json();
        if (modulesJson?.success && Array.isArray(modulesJson.modules)) {
          modulesData = modulesJson.modules;
        }
      }

      if (modulesData === null) {
        const courseIds = courseList.map(c => c.id);
        const { data: fallback, error: modulesError } = await supabase
          .from('modules')
          .select('*')
          .in('course_id', courseIds)
          .order('order', { ascending: true });
        if (modulesError) throw modulesError;
        modulesData = fallback || [];
      }

      const normalizedModules = modulesData || [];
      const moduleIds = normalizedModules.map((m: any) => String(m.id)).filter(Boolean);
      const lessonCountByModule: Record<string, number> = {};
      const quizCountByCourse: Record<string, number> = {};

      if (moduleIds.length > 0) {
        const { data: lessonRows, error: lessonErr } = await supabase
          .from('lessons')
          .select('id, module_id')
          .in('module_id', moduleIds);
        if (lessonErr) throw lessonErr;

        (lessonRows || []).forEach((l: any) => {
          const moduleId = String(l?.module_id || '');
          const lessonId = String(l?.id || '');
          if (!moduleId || !lessonId) return;
          lessonCountByModule[moduleId] = (lessonCountByModule[moduleId] || 0) + 1;
        });
      }

      // Count quizzes by course_id (quizzes are linked to courses, not lessons/modules)
      const courseLookupIds = courseList.map((c: any) => c.id).filter(Boolean);
      if (courseLookupIds.length > 0) {
        const withAvailability = await supabase
          .from('quizzes')
          .select('id, course_id, published, status')
          .in('course_id', courseLookupIds);
        let quizRows: any[] = [];
        if (withAvailability.error) {
          const fallback = await supabase
            .from('quizzes')
            .select('id, course_id')
            .in('course_id', courseLookupIds);
          if (!fallback.error) quizRows = fallback.data || [];
        } else {
          quizRows = withAvailability.data || [];
        }

        const isAvailable = (q: any) => {
          if (typeof q?.published === 'boolean') return q.published;
          const status = String(q?.status || '').toLowerCase();
          if (status) return status === 'published' || status === 'active';
          return true;
        };

        (quizRows || []).forEach((q: any) => {
          if (!isAvailable(q)) return;
          const cId = String(q?.course_id || '');
          if (!cId) return;
          quizCountByCourse[cId] = (quizCountByCourse[cId] || 0) + 1;
        });
      }

      setModules((normalizedModules || []).map(m => ({
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        slug: m.slug,
        description: m.description,
        order: m.order,
        status: normalizeModuleStatus(m.status),
        totalLessons: lessonCountByModule[String(m.id)] ?? m.total_lessons ?? 0,
        totalQuizzes: quizCountByCourse[String(m.course_id)] ?? m.total_quizzes ?? 0,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        publishAt: (m.publish_at as string | null | undefined) ?? null,
      })));
    } catch {
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [search, courseFilter, classFilter]);


  const openCreate = () => {
    setEditing(null);
    setFormCourseId(courses[0]?.id || '');
    const maxOrder = modules.length > 0 ? Math.max(...modules.map(m => m.order)) + 1 : 1;
    setForm({ ...emptyForm, order: maxOrder });
    setShowModal(true);
  };

  const openEdit = (mod: Module) => {
    setEditing(mod);
    setFormCourseId(mod.courseId);
    const hasPublishAt = !!mod.publishAt;
    const publishAtLocal = mod.publishAt
      ? new Date(mod.publishAt).toISOString().slice(0, 16)
      : '';
    setForm({
      title: mod.title,
      description: mod.description || '',
      order: mod.order,
      status: normalizeModuleStatus(mod.status) as 'active' | 'inactive',
      autoPublish: hasPublishAt,
      publishAt: publishAtLocal,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!formCourseId) { toast.error('Please select a course'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not signed in');
        return;
      }

      if (form.autoPublish && !form.publishAt) { toast.error('Please select a date and time for auto-publish'); setSaving(false); return; }
      const status: 'active' | 'inactive' = form.status === 'inactive' ? 'inactive' : 'active';
      const body: Record<string, unknown> = {
        course_id: formCourseId,
        title: form.title.trim(),
        slug: slugify(form.title),
        description: form.description.trim() || null,
        order: Number(form.order) || 1,
        status,
        ...(form.autoPublish && form.publishAt ? { publish_at: new Date(form.publishAt).toISOString() } : { publish_at: null }),
      };

      if (editing) {
        const res = await authFetch(
          `/api/teacher/modules/${encodeURIComponent(editing.id)}?userId=${encodeURIComponent(session.user.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) throw new Error(await readApiError(res));
        toast.success('Module updated');
      } else {
        const res = await authFetch('/api/teacher/modules', {
          method: 'POST',
          body: JSON.stringify({ userId: session.user.id, ...body }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        toast.success('Module created');
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save module');
    } finally {
      setSaving(false);
    }
  };

  const openHeadwayModal = () => {
    setHeadwayDone(null);
    setHeadwayProgress(null);
    setHeadwayClearing(false);
    setHeadwayClearConfirm(false);
    setHeadwayCourseId(courses.length === 1 ? courses[0].id : '');
    setHeadwayLevel('Beginner');
    setHeadwayOptions({ grammar: true, vocabulary: true, everydayEnglish: true, audioDownload: true, videoDownload: true, testBuilder: true });
    setShowHeadwayModal(true);
  };

  const handleClearModules = async () => {
    if (!headwayCourseId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Not signed in'); return; }
    setHeadwayClearing(true);
    setHeadwayClearConfirm(false);
    try {
      const res = await authFetch(`/api/teacher/courses/${encodeURIComponent(headwayCourseId)}/clear-modules`, {
        method: 'POST',
        body: JSON.stringify({ userId: session.user.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Clear failed');
      toast.success(`Cleared ${json.deleted ?? 0} module(s) from this course`);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to clear modules');
    } finally {
      setHeadwayClearing(false);
    }
  };

  const handleClearAndReimport = async () => {
    if (!headwayCourseId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Not signed in'); return; }
    setHeadwayDone(null);
    setHeadwayClearing(true);
    setHeadwayClearConfirm(false);
    try {
      const res = await authFetch(`/api/teacher/courses/${encodeURIComponent(headwayCourseId)}/clear-modules`, {
        method: 'POST',
        body: JSON.stringify({ userId: session.user.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Clear failed');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to clear modules');
      setHeadwayClearing(false);
      return;
    }
    setHeadwayClearing(false);
    await handleHeadwayImport();
  };

  const handleHeadwayImport = async () => {
    if (!headwayCourseId) { toast.error('Please select a course'); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Not signed in'); return; }
    setHeadwayImporting(true);
    setHeadwayProgress(null);
    try {
      const res = await authFetch(`/api/teacher/courses/${encodeURIComponent(headwayCourseId)}/headway-populate`, {
        method: 'POST',
        body: JSON.stringify({ userId: session.user.id, level: headwayLevel, options: headwayOptions, stream: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Import failed');
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let finalModules = 0;
      let finalLessons = 0;
      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let evt: any;
            try { evt = JSON.parse(line.slice(6)); } catch { continue; }
            if (evt.type === 'progress' && evt.phase === 'done') {
              setHeadwayProgress({ unit: evt.unit, total: evt.total, title: evt.title, phase: evt.phase });
            } else if (evt.type === 'progress') {
              setHeadwayProgress({ unit: evt.unit, total: evt.total, title: evt.title, phase: evt.phase });
            } else if (evt.type === 'done') {
              finalModules = evt.modules ?? 0;
              finalLessons = evt.lessons ?? 0;
            } else if (evt.type === 'error') {
              throw new Error(evt.message || 'Import failed');
            }
          }
        }
      }
      setHeadwayProgress(null);
      setHeadwayDone({ modules: finalModules, lessons: finalLessons });
      toast.success(`Headway ${headwayLevel} imported — ${finalModules} modules, ${finalLessons} lessons`);
      fetchData();
    } catch (e: any) {
      setHeadwayProgress(null);
      toast.error(e?.message || 'Import failed');
    } finally {
      setHeadwayImporting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkStatus = async (status: 'active' | 'inactive') => {
    if (!selectedIds.size) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Not signed in'); return; }
    setBulkActioning(true);
    try {
      const res = await authFetch('/api/teacher/modules/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ userId: session.user.id, moduleIds: [...selectedIds], status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Bulk update failed');
      toast.success(`${json.updated} module(s) ${status === 'active' ? 'published' : 'hidden'}`);
      setSelectedIds(new Set());
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Bulk update failed');
    } finally {
      setBulkActioning(false);
    }
  };

  const handleDuplicate = async (mod: Module) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Not signed in'); return; }
    setDuplicatingId(mod.id);
    try {
      const res = await authFetch(`/api/teacher/modules/${encodeURIComponent(mod.id)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ userId: session.user.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Duplicate failed');
      toast.success(`"${mod.title} (Copy)" created`);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to duplicate module');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleImportAllLevels = async () => {
    if (!headwayCourseId) { toast.error('Please select a course'); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Not signed in'); return; }
    const levels = ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
    setHeadwayImporting(true);
    let totalMods = 0;
    let totalLessons = 0;
    for (const lvl of levels) {
      setHeadwayProgress({ unit: 0, total: 1, title: `Importing ${lvl}...`, phase: 'module' });
      try {
        const res = await authFetch(`/api/teacher/courses/${encodeURIComponent(headwayCourseId)}/headway-populate`, {
          method: 'POST',
          body: JSON.stringify({ userId: session.user.id, level: lvl, options: headwayOptions }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          totalMods += json.modules ?? 0;
          totalLessons += json.lessons ?? 0;
        }
      } catch { /* continue to next level */ }
    }
    setHeadwayProgress(null);
    setHeadwayImporting(false);
    setHeadwayDone({ modules: totalMods, lessons: totalLessons });
    toast.success(`All Headway levels imported — ${totalMods} modules, ${totalLessons} lessons`);
    fetchData();
  };

  const handleOpenCompletionDashboard = async (courseId: string) => {
    setCompletionCourseId(courseId);
    setCompletionData(null);
    setShowCompletionDashboard(true);
    setCompletionLoading(true);
    try {
      const res = await authFetch(`/api/teacher/courses/${encodeURIComponent(courseId)}/module-completion`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load');
      setCompletionData(json);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load completion data');
      setShowCompletionDashboard(false);
    } finally {
      setCompletionLoading(false);
    }
  };

  const handleDelete = (mod: Module) => {
    setDeleteTarget(mod);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Not signed in'); return; }
      const res = await authFetch(
        `/api/teacher/modules/${encodeURIComponent(deleteTarget.id)}/delete?userId=${encodeURIComponent(session.user.id)}`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to delete module');
      toast.success('Module deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete module');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (mod: Module) => {
    const cur = normalizeModuleStatus(mod.status);
    const newStatus = cur === 'active' ? 'inactive' : 'active';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not signed in');
        return;
      }
      const res = await authFetch(
        `/api/teacher/modules/${encodeURIComponent(mod.id)}?userId=${encodeURIComponent(session.user.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to update status');
      toast.success(`Module ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update status');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeModule = modules.find(m => m.id === active.id);
    const overModule = modules.find(m => m.id === over.id);
    if (!activeModule || !overModule || activeModule.courseId !== overModule.courseId) return;

    const courseId = activeModule.courseId;
    const courseModules = modules
      .filter(m => m.courseId === courseId)
      .sort((a, b) => a.order - b.order);

    const oldIndex = courseModules.findIndex(m => m.id === active.id);
    const newIndex = courseModules.findIndex(m => m.id === over.id);
    if (oldIndex === newIndex) return;

    const reordered = arrayMove(courseModules, oldIndex, newIndex).map((m, i) => ({ ...m, order: i + 1 }));

    setModules(prev => prev.map(m => reordered.find(r => r.id === m.id) || m));

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSavingOrder(true);
    try {
      await Promise.all(
        reordered.map(m =>
          authFetch(
            `/api/teacher/modules/${encodeURIComponent(m.id)}?userId=${encodeURIComponent(session.user.id)}`,
            { method: 'PATCH', body: JSON.stringify({ order: m.order }) }
          )
        )
      );
      toast.success('Order saved');
    } catch {
      toast.error('Failed to save order');
      fetchData();
    } finally {
      setSavingOrder(false);
    }
  };

  const ITEMS_PER_PAGE = 12;

  const filtered = modules.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || m.courseId === courseFilter;
    const selectedClass = classes.find((c) => c.id === classFilter);
    const matchClass = classFilter === 'all' || (selectedClass?.course_id ? m.courseId === selectedClass.course_id : false);
    return matchSearch && matchCourse && matchClass;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedFiltered = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const getCourseTitle = (courseId: string) =>
    courses.find(c => c.id === courseId)?.name ||
    courses.find(c => c.id === courseId)?.title || 'Unknown Course';

  const getCourseLevel = (courseId: string): string =>
    (courses.find(c => c.id === courseId) as any)?.level || '';

  const groupedModules = (() => {
    const map = new Map<string, typeof paginatedFiltered>();
    paginatedFiltered.forEach(m => {
      const key = m.courseId || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return Array.from(map.entries()).map(([courseId, items]) => ({
      courseId,
      courseTitle: getCourseTitle(courseId),
      courseLevel: getCourseLevel(courseId),
      items,
    }));
  })();

  const stats = [
    { ...STAT_CONFIG[0], label: t(STAT_CONFIG[0].key), value: modules.length },
    { ...STAT_CONFIG[1], label: t(STAT_CONFIG[1].key), value: modules.filter(m => normalizeModuleStatus(m.status) === 'active').length },
    { ...STAT_CONFIG[2], label: t(STAT_CONFIG[2].key), value: modules.filter(m => normalizeModuleStatus(m.status) === 'inactive').length },
    { ...STAT_CONFIG[3], label: t(STAT_CONFIG[3].key), value: modules.reduce((acc, m) => acc + (m.totalLessons || 0), 0) },
  ];

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        {/* Background depth */}
        <div className="relative overflow-hidden">
          {/* Gradient blobs */}
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />
          <div className="pointer-events-none absolute top-96 left-1/2 w-72 h-72 rounded-full bg-indigo-100/20 blur-3xl" />

          {/* Hero Header */}
          <div className="relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)',
            }}
          >
            {/* Subtle dot grid overlay */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            {/* Glow blob inside hero */}
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />

            <div className="relative px-6 sm:px-8 lg:px-10 py-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  {paramCourseId && (
                    <button
                      onClick={() => navigate('/teacher/modules')}
                      className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-white transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Courses
                    </button>
                  )}
                  <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                    <span className="text-indigo-400 tracking-wider uppercase">{t('modules.portalLabel')}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                    <span className="text-indigo-200 tracking-wider uppercase">{t('modules.modulesLabel')}</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    {t('modules.modulesLabel')}
                  </h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    {t('modules.modulesDesc')}
                  </p>
                </div>
                {can('actions.teacher.modules.manage') && (
                  <div className="flex flex-wrap gap-3 shrink-0">
                    {courses.length > 0 && (
                      <motion.button
                        onClick={() => handleOpenCompletionDashboard(courseFilter !== 'all' ? courseFilter : courses[0].id)}
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white transition-all"
                        style={{
                          background: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
                          boxShadow: '0 8px 32px rgba(5,150,105,0.35), 0 2px 8px rgba(0,0,0,0.15)',
                        }}
                        title="Per-unit completion dashboard"
                      >
                        <BarChart2 className="w-4 h-4" />
                        Completion
                      </motion.button>
                    )}
                    <motion.button
                      onClick={openHeadwayModal}
                      disabled={courses.length === 0}
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      style={{
                        background: 'linear-gradient(135deg, #1e3a5f 0%, #1565c0 100%)',
                        boxShadow: '0 8px 32px rgba(21,101,192,0.4), 0 2px 8px rgba(0,0,0,0.15)',
                      }}
                      title="Import Oxford Headway curriculum"
                    >
                      <Globe className="w-4 h-4" />
                      Import Headway
                    </motion.button>
                    <motion.button
                      onClick={openCreate}
                      disabled={courses.length === 0}
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      style={{
                        background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
                        boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      {t('modules.createModule')}
                    </motion.button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
            {/* No courses warning */}
            {!loading && courses.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3"
              >
                <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">{t('modules.noCoursesFound')}</p>
                  <p className="text-xs text-amber-600 mt-0.5">{t('modules.createCourseFirst')}</p>
                </div>
              </motion.div>
            )}

            {/* Premium Stats Cards */}
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
                    {/* Decorative circle */}
                    <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Glassmorphism Search & Filter Bar */}
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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">{t('modules.filtersLabel')}</p>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  type="text"
                  placeholder={t('modules.searchModules')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              <select
                value={courseFilter}
                onChange={e => setCourseFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">{t('modules.allCourses')}</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.title}</option>
                ))}
              </select>
              {classes.length > 0 && (
                <select
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
                >
                  <option value="all">{t('modules.allClasses')}</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {(search || courseFilter !== 'all' || classFilter !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setCourseFilter('all'); setClassFilter('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" /> {t('common.refresh')}
                </button>
              )}
            </motion.div>

            {/* Bulk Action Bar */}
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-white shadow-lg"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                >
                  <CheckSquare className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-semibold">{selectedIds.size} module{selectedIds.size !== 1 ? 's' : ''} selected</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => void handleBulkStatus('active')}
                      disabled={bulkActioning}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      <Eye className="w-3.5 h-3.5" /> Publish All
                    </button>
                    <button
                      onClick={() => void handleBulkStatus('inactive')}
                      disabled={bulkActioning}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      <EyeOff className="w-3.5 h-3.5" /> Hide All
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="p-1.5 rounded-lg hover:bg-white/20 transition-all"
                      title="Clear selection"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Module Grid / Empty State */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 h-52 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm"
              >
                <EmptyIllustration />
                <h3 className="text-xl font-extrabold text-slate-800 mt-6 mb-2">
                  {search || courseFilter !== 'all' ? t('modules.noResultsMessage') : t('modules.noModulesEmpty')}
                </h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {search || courseFilter !== 'all'
                    ? t('modules.tryAdjustingFilters2')
                    : t('modules.createFirstModuleMessage')}
                </p>
                {courses.length > 0 && !(search || courseFilter !== 'all') && can('actions.teacher.modules.manage') && (
                  <motion.button
                    onClick={openCreate}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                    }}
                  >
                    <Plus className="w-4 h-4" /> {t('modules.createYourFirstModuleButton')}
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {savingOrder && (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-indigo-600">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                    Saving order…
                  </div>
                )}
                <div className="space-y-8">
                  {groupedModules.map(({ courseId, courseTitle, items }) => (
                    <div key={courseId} className="space-y-4">
                      <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                          <BookOpen className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-900">{courseTitle}</h2>
                          <p className="text-xs text-slate-400">{items.length} module{items.length !== 1 ? 's' : ''}</p>
                        </div>
                        {can('actions.teacher.modules.manage') && (
                          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-slate-400">
                            <GripVertical className="w-3.5 h-3.5" /> drag to reorder
                          </span>
                        )}
                      </div>
                      <SortableContext items={items.map(m => m.id)} strategy={rectSortingStrategy}>
                        <motion.div
                          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                          initial="hidden"
                          animate="visible"
                          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
                        >
                          {items.map((mod) => {
                            const isActive = normalizeModuleStatus(mod.status) === 'active';
                            const isDragTarget = activeId === mod.id;
                            return (
                              <SortableCardShell key={mod.id} id={mod.id} canDrag={can('actions.teacher.modules.manage')}>
                                {({ dragHandleProps, dragHandleRef, isDragging }) => (
                                  <motion.div
                                    variants={{
                                      hidden: { opacity: 0, y: 20 },
                                      visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
                                    }}
                                    whileHover={isDragging ? undefined : { y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.15)' }}
                                    className={cn(
                                      "group relative bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all duration-200",
                                      selectedIds.has(mod.id) ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-100",
                                      isDragging && "opacity-40 scale-95"
                                    )}
                                  >
                                    {/* Drag handle — top-right */}
                                    {can('actions.teacher.modules.manage') && (
                                      <button
                                        ref={dragHandleRef}
                                        {...dragHandleProps}
                                        className="absolute top-2 right-2 z-10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:bg-slate-100"
                                        title="Drag to reorder"
                                        tabIndex={-1}
                                      >
                                        <GripVertical className="w-4 h-4 text-slate-400" />
                                      </button>
                                    )}

                                    {/* Select checkbox (top-left corner) */}
                                    {can('actions.teacher.modules.manage') && (
                                      <button
                                        onClick={e => { e.stopPropagation(); toggleSelect(mod.id); }}
                                        className="absolute top-3 left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                                        style={{ opacity: selectedIds.has(mod.id) ? 1 : undefined }}
                                        title={selectedIds.has(mod.id) ? 'Deselect' : 'Select'}
                                      >
                                        {selectedIds.has(mod.id)
                                          ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                                          : <Square className="w-4 h-4 text-slate-400" />}
                                      </button>
                                    )}

                                    {/* Card top accent */}
                                    <div
                                      className="h-1.5 w-full"
                                      style={{
                                        background: isActive
                                          ? 'linear-gradient(90deg,#6366f1,#8b5cf6)'
                                          : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                                      }}
                                    />

                                    <div className="p-5 flex flex-col flex-1">
                                      {/* Icon + Status */}
                                      <div className="flex items-start justify-between mb-3">
                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                          style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
                                        >
                                          <Layers className="w-5 h-5 text-indigo-500" />
                                        </div>
                                        {can('actions.teacher.modules.manage') && (
                                          <button
                                            onClick={() => handleToggleStatus(mod)}
                                            className={cn(
                                              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all',
                                              isActive
                                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                            )}
                                          >
                                            <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-emerald-500' : 'bg-amber-500')} />
                                            {isActive ? t('modules.activeModule') : t('modules.inactiveModule')}
                                          </button>
                                        )}
                                      </div>

                                      {/* Title & Description */}
                                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{mod.title}</h3>
                                      {mod.description && (
                                        <p className="text-xs text-slate-400 line-clamp-2 mb-3">{mod.description}</p>
                                      )}

                                      {/* Meta */}
                                      <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[120px] truncate">
                                            <BookOpen className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{getCourseTitle(mod.courseId)}</span>
                                          </span>
                                          {getCourseLevel(mod.courseId) && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                              {getCourseLevel(mod.courseId)}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                            <BookOpen className="w-3.5 h-3.5 text-slate-300" />
                                            {mod.totalLessons} {mod.totalLessons !== 1 ? t('modules.lessons') : t('modules.lesson')}
                                          </span>
                                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                            <HelpCircle className="w-3.5 h-3.5 text-slate-300" />
                                            {mod.totalQuizzes || 0} {(mod.totalQuizzes || 0) !== 1 ? t('modules.quizzes') : t('modules.quiz')}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1">
                                            <span className="w-6 h-6 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold">
                                              {mod.order}
                                            </span>
                                            <span className="text-[11px] text-slate-400">{t('modules.orderText')}</span>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3 h-3 text-slate-300 shrink-0" />
                                            <span className="text-[11px] text-slate-400">
                                              {mod.createdAt ? new Date(mod.createdAt).toLocaleDateString('sq-AL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Actions */}
                                      <div className="flex items-center gap-1.5 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200 sm:translate-y-1 sm:group-hover:translate-y-0">
                                        <Link
                                          to={`/teacher/modules/${mod.id}`}
                                          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
                                        >
                                          <PlayCircle className="w-3.5 h-3.5" /> View
                                        </Link>
                                        {can('actions.teacher.modules.manage') && (
                                          <button
                                            onClick={() => openEdit(mod)}
                                            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" /> {t('modules.editAction')}
                                          </button>
                                        )}
                                        {can('actions.teacher.modules.manage') && (
                                          <button
                                            onClick={() => void handleDuplicate(mod)}
                                            disabled={duplicatingId === mod.id}
                                            className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 transition-all disabled:opacity-50"
                                            title="Duplicate module"
                                          >
                                            {duplicatingId === mod.id
                                              ? <span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                                              : <Copy className="w-3.5 h-3.5" />}
                                          </button>
                                        )}
                                        {can('actions.teacher.modules.manage') && (
                                          <button
                                            onClick={() => handleDelete(mod)}
                                            className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                                            title="Delete module"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </SortableCardShell>
                            );
                          })}
                        </motion.div>
                      </SortableContext>
                    </div>
                  ))}
                </div>

                <DragOverlay>
                  {activeId ? (() => {
                    const mod = modules.find(m => m.id === activeId);
                    if (!mod) return null;
                    const isActive = normalizeModuleStatus(mod.status) === 'active';
                    return (
                      <div className="bg-white rounded-2xl border-2 border-indigo-400 shadow-2xl overflow-hidden opacity-95 rotate-1 scale-105">
                        <div className="h-1.5 w-full" style={{ background: isActive ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
                        <div className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}>
                              <Layers className="w-4 h-4 text-indigo-500" />
                            </div>
                            <GripVertical className="w-4 h-4 text-indigo-400" />
                          </div>
                          <p className="text-sm font-bold text-slate-900 line-clamp-2">{mod.title}</p>
                          <p className="text-xs text-slate-400 mt-1">{getCourseTitle(mod.courseId)}</p>
                        </div>
                      </div>
                    );
                  })() : null}
                </DragOverlay>
              </DndContext>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={currentPage === 1}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button key={page}
                    onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={cn('w-9 h-9 flex items-center justify-center rounded-xl text-sm font-semibold transition-all',
                      currentPage === page ? 'bg-indigo-600 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={currentPage === totalPages}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 lg:left-60 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
                  >
                    <Layers className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{editing ? t('modules.modalHeaderEditModule') : t('modules.modalHeaderCreateModule')}</h2>
                    <p className="text-xs text-slate-400">{editing ? t('modules.modalDescEdit') : t('modules.modalDescCreate')}</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('modules.courseField')} <span className="text-red-500">{t('modules.courseRequired')}</span></label>
                  <select
                    value={formCourseId}
                    onChange={e => setFormCourseId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  >
                    <option value="">{t('modules.selectCourseRequired')}</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('modules.titleField')} <span className="text-red-500">{t('modules.titleRequired2')}</span></label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={t('modules.modulePlaceholder')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  />
                  {form.title && (
                    <p className="text-[10px] text-slate-400 mt-1">{t('modules.slugPreview')} <span className="font-mono">{slugify(form.title)}</span></p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('modules.descriptionField')}</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder={t('modules.descriptionPlaceholder')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('modules.orderField')}</label>
                    <input
                      type="number"
                      min={1}
                      value={form.order}
                      onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('modules.statusField')}</label>
                    <select
                      value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                    >
                      <option value="active">{t('modules.statusActive')}</option>
                      <option value="inactive">{t('modules.statusInactive')}</option>
                    </select>
                  </div>
                </div>

                {/* Auto-publish toggle */}
                <div className={cn(
                  'rounded-xl border transition-all duration-200',
                  form.autoPublish ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-slate-50/60'
                )}>
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={form.autoPublish}
                        onChange={e => setForm(f => ({
                          ...f,
                          autoPublish: e.target.checked,
                          status: e.target.checked ? 'inactive' : f.status,
                          publishAt: e.target.checked ? f.publishAt : '',
                        }))}
                        className="sr-only"
                      />
                      <div className={cn(
                        'w-10 h-5 rounded-full transition-colors duration-200',
                        form.autoPublish ? 'bg-violet-500' : 'bg-slate-300'
                      )}>
                        <div className={cn(
                          'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                          form.autoPublish ? 'translate-x-5' : 'translate-x-0.5'
                        )} />
                      </div>
                    </div>
                    <div>
                      <span className={cn(
                        'text-sm font-semibold transition-colors',
                        form.autoPublish ? 'text-violet-700' : 'text-slate-600'
                      )}>
                        {t('modules.autoPublishToggle')}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {t('modules.autoPublishDescText')}
                      </p>
                    </div>
                  </label>

                  <AnimatePresence>
                    {form.autoPublish && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1">
                          <label className="block text-xs font-semibold text-violet-600 mb-1.5">
                            <Calendar className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                            {t('modules.publishDateTimeLabel')}
                          </label>
                          <input
                            type="datetime-local"
                            value={form.publishAt}
                            min={new Date().toISOString().slice(0, 16)}
                            onChange={e => setForm(f => ({ ...f, publishAt: e.target.value }))}
                            className="w-full px-3.5 py-2.5 bg-white border border-violet-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-slate-700"
                          />
                          {form.publishAt && (
                            <p className="text-[11px] text-violet-500 mt-1.5 font-medium">
                              {t('modules.willBePublishedText', { date: new Date(form.publishAt).toLocaleString('sq-AL', { dateStyle: 'full', timeStyle: 'short' }) })}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-6 flex items-center justify-end gap-3">
                {can('actions.teacher.modules.manage') && <button
                  onClick={closeModal}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  {t('modules.cancelButtonText')}
                </button>}
                {can('actions.teacher.modules.manage') && (
                  <LoadingButton
                    onClick={handleSave}
                    loading={saving}
                    loadingText={editing ? t('modules.savingText') : t('modules.creatingText')}
                    icon={<Save className="w-4 h-4" />}
                    className="px-5 py-2.5"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                  >
                    {editing ? t('modules.saveChangesButton') : t('modules.createModuleButton')}
                  </LoadingButton>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ── */}
      {/* Headway Import Modal */}
      <AnimatePresence>
        {showHeadwayModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 lg:left-60 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => !headwayImporting && setShowHeadwayModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header stripe */}
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#1565c0,#42a5f5)' }} />
              <div className="p-6">
                {/* Logo row */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg,#1e3a5f,#1565c0)' }}>
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Import Oxford Headway</h3>
                    <p className="text-xs text-slate-500">Creates modules, lessons &amp; quizzes from the Oxford curriculum</p>
                  </div>
                  <button
                    type="button"
                    disabled={headwayImporting}
                    onClick={() => setShowHeadwayModal(false)}
                    className="ml-auto p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-40"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                {headwayDone ? (
                  /* Success state */
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                      style={{ background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)' }}>
                      <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <p className="text-lg font-bold text-slate-900 mb-1">Import complete!</p>
                    <p className="text-sm text-slate-500 mb-1">
                      <span className="font-semibold text-slate-700">{headwayDone.modules}</span> modules and{' '}
                      <span className="font-semibold text-slate-700">{headwayDone.lessons}</span> lessons created
                    </p>
                    <p className="text-xs text-slate-400 mb-6">Each lesson links to the real Oxford exercise page</p>
                    <div className="flex gap-3 justify-center">
                      <button
                        type="button"
                        disabled={headwayClearing || headwayImporting}
                        onClick={() => void handleClearAndReimport()}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {headwayClearing ? (
                          <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />Clearing…</>
                        ) : headwayImporting ? (
                          <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />Importing…</>
                        ) : (
                          <><RefreshCw className="w-3.5 h-3.5" />Clear &amp; Re-import</>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowHeadwayModal(false)}
                        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg,#1565c0,#42a5f5)' }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Form state */
                  <div className="space-y-4">
                    {/* Course selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Course</label>
                      <div className="relative">
                        <select
                          value={headwayCourseId}
                          onChange={e => setHeadwayCourseId(e.target.value)}
                          disabled={headwayImporting}
                          className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9 disabled:opacity-50"
                        >
                          <option value="">Select a course…</option>
                          {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.name || c.title || 'Untitled'}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Clear modules action */}
                    {headwayCourseId && !headwayImporting && (
                      <div className="flex items-center gap-2">
                        {headwayClearConfirm ? (
                          <>
                            <span className="text-xs text-red-600 font-medium flex-1">Delete all modules in this course?</span>
                            <button
                              type="button"
                              disabled={headwayClearing}
                              onClick={() => setHeadwayClearConfirm(false)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={headwayClearing}
                              onClick={() => void handleClearModules()}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all flex items-center gap-1.5 disabled:opacity-60"
                            >
                              {headwayClearing
                                ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Clearing…</>
                                : 'Yes, delete all'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={headwayClearing}
                            onClick={() => setHeadwayClearConfirm(true)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium underline underline-offset-2 transition-colors disabled:opacity-50"
                          >
                            Clear existing modules first
                          </button>
                        )}
                      </div>
                    )}

                    {/* Import All Levels toggle */}
                    <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all">
                      <input
                        type="checkbox"
                        checked={importAllLevels}
                        disabled={headwayImporting}
                        onChange={e => setImportAllLevels(e.target.checked)}
                        className="w-4 h-4 rounded accent-blue-600 shrink-0"
                      />
                      <div>
                        <span className="block text-xs font-bold text-slate-800">Import all 6 levels at once</span>
                        <span className="block text-xs text-slate-500">Beginner → Elementary → Pre-Intermediate → Intermediate → Upper-Intermediate → Advanced</span>
                      </div>
                    </label>

                    {/* Level selector */}
                    <div className={importAllLevels ? 'opacity-40 pointer-events-none' : ''}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Level</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Beginner','Elementary','Pre-Intermediate','Intermediate','Upper-Intermediate','Advanced'].map(lvl => (
                          <button
                            key={lvl}
                            type="button"
                            disabled={headwayImporting}
                            onClick={() => setHeadwayLevel(lvl)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                              headwayLevel === lvl
                                ? 'border-blue-600 bg-blue-600 text-white shadow'
                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-400 hover:bg-blue-50'
                            } disabled:opacity-50`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Content options */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Include in import</label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
                        {[
                          { key: 'grammar',        label: 'Grammar exercises',       icon: '📘', desc: 'Interactive grammar practice on Oxford site' },
                          { key: 'vocabulary',     label: 'Vocabulary exercises',    icon: '🌿', desc: 'Vocabulary drills linked to Oxford site' },
                          { key: 'everydayEnglish',label: 'Everyday English',        icon: '🎤', desc: 'Dialogue videos and listening activities' },
                          { key: 'audioDownload',  label: 'Audio Downloads',         icon: '🎧', desc: 'Student\'s Book MP3 audio ZIP files' },
                          { key: 'videoDownload',  label: 'Video Downloads',         icon: '🎬', desc: 'Unit video clip ZIP files' },
                          { key: 'testBuilder',    label: 'Test Builder (quizzes)',  icon: '📝', desc: 'Draft quizzes linked to Oxford Test Builder' },
                        ].map(({ key, label, icon, desc }) => (
                          <label
                            key={key}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${headwayImporting ? 'opacity-50 pointer-events-none' : 'hover:bg-blue-50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={headwayOptions[key as keyof typeof headwayOptions]}
                              onChange={e => setHeadwayOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                              className="w-4 h-4 rounded accent-blue-600 shrink-0"
                            />
                            <span className="text-base shrink-0">{icon}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-semibold text-slate-800">{label}</span>
                              <span className="block text-xs text-slate-500">{desc}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Unit count info */}
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800 flex items-start gap-2">
                      <BookOpen className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <span>
                        {headwayLevel === 'Beginner' ? '14 units' : '12 units'} modules will be created with the selected lesson types above.
                      </span>
                    </div>

                    {/* Progress bar — shown while importing */}
                    {headwayImporting && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-blue-800">
                          <span>
                            {headwayProgress
                              ? `Unit ${headwayProgress.unit} of ${headwayProgress.total}`
                              : 'Starting import…'}
                          </span>
                          {headwayProgress && (
                            <span className="text-blue-500">
                              {Math.round((headwayProgress.unit / headwayProgress.total) * 100)}%
                            </span>
                          )}
                        </div>
                        {/* Track */}
                        <div className="h-2 w-full rounded-full bg-blue-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: headwayProgress
                                ? `${Math.round((headwayProgress.unit / headwayProgress.total) * 100)}%`
                                : '4%',
                              background: 'linear-gradient(90deg,#1565c0,#42a5f5)',
                            }}
                          />
                        </div>
                        {/* Current unit title */}
                        {headwayProgress && (
                          <p className="text-xs text-blue-600 truncate">
                            {headwayProgress.phase === 'done'
                              ? `✓ ${headwayProgress.title}`
                              : headwayProgress.phase === 'lessons'
                              ? `Adding lessons — ${headwayProgress.title}`
                              : `Creating module — ${headwayProgress.title}`}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        disabled={headwayImporting}
                        onClick={() => setShowHeadwayModal(false)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={headwayImporting || !headwayCourseId}
                        onClick={() => void (importAllLevels ? handleImportAllLevels() : handleHeadwayImport())}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg,#1565c0,#42a5f5)' }}
                      >
                        {headwayImporting ? (
                          <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Importing…</>
                        ) : importAllLevels ? (
                          <><Download className="w-4 h-4" />Import All 6 Levels</>
                        ) : (
                          <><Download className="w-4 h-4" />Import</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 lg:left-60 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#ef4444,#f97316)' }} />
              <div className="p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)' }}>
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  </div>
                </div>
                <h3 className="text-center text-lg font-bold text-slate-900 mb-1">
                  {t('modules.deleteThisModuleQuestion')}
                </h3>
                <p className="text-center text-sm text-slate-500 mb-1">
                  <span className="font-semibold text-slate-700">"{deleteTarget.title}"</span>
                </p>
                <p className="text-center text-xs text-red-400 font-medium mb-6">
                  {t('modules.deleteModuleDesc')}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    {t('modules.cancelButtonText')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void confirmDelete()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting ? t('modules.deletingText') : t('modules.confirmDelete')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Completion Dashboard Modal */}
      {showCompletionDashboard && (
        <div className="fixed inset-0 lg:left-60 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <BarChart2 className="w-[18px] h-[18px] text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Completion Dashboard</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Per-unit student progress</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {courses.length > 1 && (
                  <select
                    value={completionCourseId}
                    onChange={e => handleOpenCompletionDashboard(e.target.value)}
                    className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 bg-slate-50"
                  >
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.title}</option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => setShowCompletionDashboard(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-6">
              {completionLoading ? (
                <div className="flex items-center justify-center h-40">
                  <span className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                </div>
              ) : !completionData || completionData.completion?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
                  <BarChart2 className="w-8 h-8 mb-2 opacity-30" />
                  {completionData?.studentCount === 0 ? 'No students enrolled in this course.' : 'No lesson progress recorded yet.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider rounded-l-lg border-b border-slate-100 sticky left-0 bg-slate-50 min-w-[160px]">Student</th>
                        {(completionData.modules || []).map((mod: any) => (
                          <th key={mod.id} className="text-center px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 min-w-[90px]">
                            <span className="line-clamp-2">{mod.title}</span>
                          </th>
                        ))}
                        <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider rounded-r-lg border-b border-slate-100 min-w-[80px]">Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(completionData.completion || []).map((row: any) => (
                        <tr key={row.studentId} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 sticky left-0 bg-white">
                            <div className="font-semibold text-slate-800 truncate max-w-[150px]">{row.studentName}</div>
                            <div className="text-xs text-slate-400 truncate max-w-[150px]">{row.studentEmail}</div>
                          </td>
                          {row.modules.map((mod: any) => (
                            <td key={mod.moduleId} className="px-3 py-3 text-center">
                              {mod.total === 0 ? (
                                <span className="text-slate-300 text-xs">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full', mod.percent === 100 ? 'bg-emerald-400' : mod.percent > 50 ? 'bg-indigo-400' : mod.percent > 0 ? 'bg-amber-400' : 'bg-slate-200')}
                                      style={{ width: `${mod.percent}%` }}
                                    />
                                  </div>
                                  <span className={cn('text-xs font-semibold', mod.percent === 100 ? 'text-emerald-600' : 'text-slate-500')}>{mod.percent}%</span>
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              'inline-flex items-center justify-center w-10 h-10 rounded-xl text-sm font-bold',
                              row.overallPercent === 100 ? 'bg-emerald-50 text-emerald-700' : row.overallPercent > 50 ? 'bg-indigo-50 text-indigo-700' : row.overallPercent > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400',
                            )}>
                              {row.overallPercent}%
                            </span>
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
      )}
    </TeacherLayout>
  );
}
