import React, { useEffect, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_SELECT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';
import {
  ClipboardList, Plus, Search, Star,
  X, Pencil, Trash2, CheckCircle2, Archive, FileText, AlertCircle,
  Users, MessageSquare, ChevronDown, ChevronUp, Award, Clock,
  Paperclip, Link2, ExternalLink, File, Image, Video,
  Archive as ArchiveIcon, Code, FileSpreadsheet, Calendar,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import { authFetch } from '../../lib/apiUrl';
import { supabase } from '../../supabase';
import { LoadingButton } from '../../components/ui/LoadingButton';

type AssignmentStatus = 'draft' | 'published' | 'closed';
type AssignmentType = 'homework' | 'project' | 'essay' | 'quiz' | 'lab' | 'exercise' | 'research' | 'other';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  course_id: string | null;
  teacher_id: string | null;
  class_id: string | null;
  type: AssignmentType;
  due_date: string | null;
  max_score: number;
  status: AssignmentStatus;
  allow_late_submission: boolean;
  submission_config?: SubmissionConfig | null;
  publish_at?: string | null;
  created_at: string;
  course?: { title: string } | null;
  class_name?: string | null;
}

type FileEntry = { name: string; url: string; size: number; mime_type: string };
type LinkEntry = { url: string; label: string };

interface Submission {
  id: string;
  student_id: string;
  content: string;
  file_urls: FileEntry[];
  link_urls: LinkEntry[];
  status: 'submitted' | 'graded';
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  graded_at: string | null;
  is_late: boolean;
  student: { display_name: string; email: string; avatar_url?: string };
}

type SubmissionConfig = { allow_text: boolean; allow_files: boolean; allow_links: boolean; max_file_count: number; accepted_types: string[] };
const DEFAULT_CFG: SubmissionConfig = { allow_text: true, allow_files: false, allow_links: false, max_file_count: 5, accepted_types: [] };

function parseJsonField<T>(val: any, fallback: T): T {
  if (Array.isArray(val)) return val as unknown as T;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
  if (val && typeof val === 'object') return val as T;
  return fallback;
}

function getFileIcon(mime: string) {
  if (mime?.startsWith('image/')) return <Image className="w-4 h-4" />;
  if (mime?.startsWith('video/')) return <Video className="w-4 h-4" />;
  if (mime?.includes('pdf')) return <FileText className="w-4 h-4" />;
  if (mime?.includes('zip') || mime?.includes('archive')) return <ArchiveIcon className="w-4 h-4" />;
  if (mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv')) return <FileSpreadsheet className="w-4 h-4" />;
  if (mime?.includes('text') || mime?.includes('code')) return <Code className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}
function formatBytes(b: number) { if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`; return `${(b / 1048576).toFixed(1)} MB`; }

interface Course { id: string; title: string }
interface ClassRec { id: string; name: string }

const STATUS_CFG: Record<AssignmentStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',   text: 'text-slate-600',  dot: 'bg-slate-400',   icon: FileText     },
  published: { label: 'Published', bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  closed:    { label: 'Closed',    bg: 'bg-amber-50',    text: 'text-amber-700',  dot: 'bg-amber-500',   icon: Archive      },
};

const TYPE_CFG: Record<AssignmentType, { label: string; color: string; bg: string }> = {
  homework: { label: 'Homework',  color: 'text-blue-700',   bg: 'bg-blue-50'   },
  project:  { label: 'Project',   color: 'text-violet-700', bg: 'bg-violet-50' },
  essay:    { label: 'Essay',     color: 'text-rose-700',   bg: 'bg-rose-50'   },
  quiz:     { label: 'Quiz',      color: 'text-amber-700',  bg: 'bg-amber-50'  },
  lab:      { label: 'Lab',       color: 'text-teal-700',   bg: 'bg-teal-50'   },
  exercise: { label: 'Exercise',  color: 'text-cyan-700',   bg: 'bg-cyan-50'   },
  research: { label: 'Research',  color: 'text-indigo-700', bg: 'bg-indigo-50' },
  other:    { label: 'Other',     color: 'text-slate-600',  bg: 'bg-slate-100' },
};

const AVATAR_COLORS = [
  'from-amber-500 to-orange-600', 'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',  'from-rose-500 to-pink-600',
  'from-teal-500 to-cyan-600',    'from-emerald-500 to-green-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const emptyForm = {
  title: '', description: '', instructions: '', course_id: '', class_id: '',
  type: 'homework' as AssignmentType, due_date: '', max_score: 100,
  status: 'draft' as AssignmentStatus, allow_late_submission: false,
  submission_config: { ...DEFAULT_CFG },
  autoPublish: false,
  publishAt: '',
};

function SubmissionsPanel({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [grading, setGrading] = useState<Record<string, { grade: string; feedback: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    authFetch(`/api/teacher/assignments/${assignment.id}/submissions`)
      .then(r => r.json())
      .then(json => { if (json.success) setSubmissions(json.submissions || []); })
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => setLoading(false));
  }, [assignment.id]);

  const handleGrade = async (subId: string) => {
    const g = grading[subId];
    if (!g) return;
    setSaving(subId);
    try {
      const res = await authFetch(`/api/teacher/assignments/submissions/${subId}/grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: g.grade, feedback: g.feedback }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      toast.success('Graded successfully');
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, ...json.submission, student: s.student } : s));
      setExpanded(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const initGrading = (sub: Submission) => {
    setGrading(prev => ({
      ...prev,
      [sub.id]: { grade: sub.grade != null ? String(sub.grade) : '', feedback: sub.feedback || '' },
    }));
    setExpanded(expanded === sub.id ? null : sub.id);
  };

  const submitted = submissions.length;
  const graded = submissions.filter(s => s.status === 'graded').length;
  const late = submissions.filter(s => s.is_late).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Submissions — {assignment.title}</h2>
            <div className="flex gap-3 mt-1 text-xs text-slate-500">
              <span className="text-blue-600 font-semibold">{submitted} submitted</span>
              <span className="text-emerald-600 font-semibold">{graded} graded</span>
              {late > 0 && <span className="text-rose-500 font-semibold">{late} late</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Users className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm font-medium">No submissions yet</p>
            </div>
          ) : submissions.map(sub => (
            <div key={sub.id} className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(sub.student.display_name))}>
                  {sub.student.display_name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{sub.student.display_name}</p>
                  <p className="text-xs text-slate-400">{formatDistanceToNow(new Date(sub.submitted_at), { addSuffix: true })}</p>
                </div>
                <div className="flex items-center gap-2">
                  {sub.is_late && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-semibold">Late</span>}
                  {sub.status === 'graded' && sub.grade != null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center gap-1">
                      <Award className="w-3 h-3" />{sub.grade}/{assignment.max_score}
                    </span>
                  )}
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', sub.status === 'graded' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700')}>
                    {sub.status === 'graded' ? 'Graded' : 'Submitted'}
                  </span>
                  <button onClick={() => initGrading(sub)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    {expanded === sub.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {expanded === sub.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                      {sub.content && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Text Answer</p>
                          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto">{sub.content}</div>
                        </div>
                      )}
                      {parseJsonField<FileEntry[]>(sub.file_urls, []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Paperclip className="w-3 h-3" />Attached Files</p>
                          <div className="space-y-1.5">
                            {parseJsonField<FileEntry[]>(sub.file_urls, []).map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group">
                                <span className="text-slate-500 group-hover:text-blue-500">{getFileIcon(f.mime_type)}</span>
                                <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-slate-700 truncate">{f.name}</p><p className="text-[10px] text-slate-400">{formatBytes(f.size)}</p></div>
                                <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {parseJsonField<LinkEntry[]>(sub.link_urls, []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Link2 className="w-3 h-3" />Submitted Links</p>
                          <div className="space-y-1">
                            {parseJsonField<LinkEntry[]>(sub.link_urls, []).map((l, i) => (
                              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-violet-600 hover:text-violet-800 font-medium truncate">
                                <ExternalLink className="w-3 h-3 shrink-0" />{l.label || l.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {!sub.content && parseJsonField<FileEntry[]>(sub.file_urls, []).length === 0 && parseJsonField<LinkEntry[]>(sub.link_urls, []).length === 0 && (
                        <p className="text-xs text-slate-400 italic">No submission content</p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Grade (/{assignment.max_score})</label>
                          <input
                            type="number" min={0} max={assignment.max_score}
                            value={grading[sub.id]?.grade ?? ''}
                            onChange={e => setGrading(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], grade: e.target.value } }))}
                            className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Feedback</label>
                          <input
                            value={grading[sub.id]?.feedback ?? ''}
                            onChange={e => setGrading(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], feedback: e.target.value } }))}
                            className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                            placeholder="Write feedback..."
                          />
                        </div>
                      </div>
                      <LoadingButton
                        onClick={() => handleGrade(sub.id)}
                        loading={saving === sub.id}
                        icon={<Award className="w-3.5 h-3.5" />}
                        size="sm"
                        className="rounded-lg"
                      >
                        Save Grade
                      </LoadingButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function TeacherAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<ClassRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submissionsFor, setSubmissionsFor] = useState<Assignment | null>(null);

  useEffect(() => {
    // Trigger server-side auto-publish check immediately on page load
    authFetch('/api/teacher/assignments/trigger-autopublish', { method: 'POST' }).catch(() => {});
    fetchData();

    // Poll every 30s to pick up auto-published status changes
    const interval = setInterval(() => {
      authFetch('/api/teacher/assignments/trigger-autopublish', { method: 'POST' }).catch(() => {});
      fetchData();
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || '';
      const [aRes, cRes, clRes] = await Promise.all([
        authFetch('/api/teacher/assignments'),
        authFetch(userId ? `/api/teacher/courses?userId=${encodeURIComponent(userId)}` : '/api/teacher/courses'),
        authFetch('/api/teacher/classes'),
      ]);
      const aJson = aRes.ok ? await aRes.json() : { assignments: [] };
      const cJson = cRes.ok ? await cRes.json() : { courses: [] };
      const clJson = clRes.ok ? await clRes.json() : { classes: [] };

      const coursesData: Course[] = (cJson.courses || []).map((c: any) => ({ id: String(c.id), title: String(c.title || 'Untitled') }));
      const classesData: ClassRec[] = (clJson.classes || []).map((c: any) => ({ id: String(c.id), name: String(c.name || 'Untitled') }));
      const courseMap: Record<string, string> = {};
      coursesData.forEach(c => { courseMap[c.id] = c.title; });
      const classMap: Record<string, string> = {};
      classesData.forEach(c => { classMap[c.id] = c.name; });

      setAssignments((aJson.assignments || []).map((a: any) => ({
        ...a,
        allow_late_submission: Boolean(a.allow_late_submission),
        submission_config: a.submission_config ? parseJsonField<SubmissionConfig>(a.submission_config, { ...DEFAULT_CFG }) : null,
        course: a.course_id ? { title: courseMap[a.course_id] || 'Unknown' } : null,
        class_name: a.class_id ? (classMap[a.class_id] || null) : null,
      })));
      setCourses(coursesData);
      setClasses(classesData);
    } catch {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const filtered = assignments.filter(a => {
    const q = search.toLowerCase();
    return (
      (a.title.toLowerCase().includes(q) || (a.course?.title || '').toLowerCase().includes(q) || (a.class_name || '').toLowerCase().includes(q)) &&
      (statusFilter === 'all' || a.status === statusFilter) &&
      (typeFilter === 'all' || a.type === typeFilter) &&
      (courseFilter === 'all' || a.course_id === courseFilter)
    );
  });

  const stats = [
    { label: 'Total',     value: assignments.length,                                                                                    gradient: 'from-indigo-500 to-indigo-600',   shadow: 'shadow-indigo-500/25',   icon: ClipboardList },
    { label: 'Published', value: assignments.filter(a => a.status === 'published').length,                                              gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: CheckCircle2  },
    { label: 'Draft',     value: assignments.filter(a => a.status === 'draft').length,                                                  gradient: 'from-slate-500 to-slate-600',     shadow: 'shadow-slate-500/25',   icon: FileText      },
    { label: 'Overdue',   value: assignments.filter(a => a.due_date && isPast(new Date(a.due_date)) && !isToday(new Date(a.due_date)) && a.status === 'published').length, gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/25', icon: AlertCircle },
  ];

  const openAdd = () => { setEditId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (a: Assignment) => {
    setEditId(a.id);
    const cfg = a.submission_config ? parseJsonField<SubmissionConfig>(a.submission_config, { ...DEFAULT_CFG }) : { ...DEFAULT_CFG };
    const hasPublishAt = !!a.publish_at;
    const publishAtLocal = hasPublishAt ? (() => {
      const d = new Date(a.publish_at!);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    })() : '';
    setForm({
      title: a.title, description: a.description || '', instructions: a.instructions || '',
      course_id: a.course_id || '', class_id: a.class_id || '', type: a.type,
      due_date: a.due_date ? a.due_date.substring(0, 10) : '', max_score: a.max_score,
      status: hasPublishAt ? 'draft' : a.status,
      allow_late_submission: a.allow_late_submission || false,
      submission_config: cfg,
      autoPublish: hasPublishAt,
      publishAt: publishAtLocal,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (form.autoPublish && !form.publishAt) { toast.error('Please select a date and time for auto-publish'); return; }
    setSaving(true);
    try {
      const effectiveStatus = form.autoPublish ? 'draft' : form.status;
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description || null,
        instructions: form.instructions || null,
        course_id: form.course_id || null,
        class_id: form.class_id || null,
        type: form.type,
        due_date: form.due_date || null,
        max_score: Number(form.max_score),
        status: effectiveStatus,
        allow_late_submission: form.allow_late_submission,
        submission_config: form.submission_config,
        publish_at: form.autoPublish && form.publishAt ? new Date(form.publishAt).toISOString() : null,
      };

      const url = editId ? `/api/teacher/assignments/${editId}` : '/api/teacher/assignments';
      const method = editId ? 'PATCH' : 'POST';
      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || 'Failed to save');
      }
      toast.success(editId ? 'Assignment updated' : 'Assignment created');
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/teacher/assignments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Assignment deleted');
      setDeleteId(null);
      fetchData();
    } catch { toast.error('Failed to delete'); }
    finally { setDeleting(false); }
  };

  const getDueBadge = (due: string | null, status: AssignmentStatus) => {
    if (!due || status === 'closed') return null;
    const d = new Date(due);
    if (isPast(d) && !isToday(d)) return <span className="text-xs text-rose-600 font-medium">Overdue</span>;
    if (isToday(d)) return <span className="text-xs text-amber-600 font-medium">Due today</span>;
    return null;
  };

  const set = <K extends keyof typeof emptyForm>(key: K, val: typeof emptyForm[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Assignments"
        title="Assignments"
        description="Create and manage your course assignments."
        action={
          <motion.button type="button" onClick={openAdd} whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#818cf8 0%,#a78bfa 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.45)' }}>
            <Plus className="w-4 h-4" />New Assignment
          </motion.button>
        }
        stats={stats}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assignments..." className={ADMIN_LIST_SEARCH_INPUT} />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Types</option>
              {Object.entries(TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </AdminListFilterBar>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(6).fill(0).map((_, i) => <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <ClipboardList className="w-10 h-10 opacity-30" />
              <p className="text-sm">No assignments found</p>
              <button type="button" onClick={openAdd} className="text-xs text-indigo-600 font-semibold hover:underline">Create one now</button>
            </div>
          ) : (
            <>
              <div className={ADMIN_LIST_CARD_GRID}>
                {filtered.map(a => {
                  const sc = STATUS_CFG[a.status];
                  const tc = TYPE_CFG[a.type] || TYPE_CFG.other;
                  const initials = a.title.substring(0, 2).toUpperCase();
                  const dueBadge = getDueBadge(a.due_date, a.status);
                  return (
                    <div key={a.id} className={ADMIN_LIST_ITEM_CARD}>
                      <div className="flex items-start gap-3">
                        <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(a.title))}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-sm leading-snug">{a.title}</p>
                          {a.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{a.description}</p>}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', tc.bg, tc.color)}>{tc.label}</span>
                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium', sc.bg, sc.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />{sc.label}
                            </span>
                            {a.publish_at && a.status === 'draft' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-600">
                                <Calendar className="w-2.5 h-2.5" />Scheduled
                              </span>
                            )}
                            {a.allow_late_submission && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600">
                                <Clock className="w-2.5 h-2.5 mr-1" />Late OK
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button type="button" onClick={() => openEdit(a)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteId(a.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Course</span>
                          <span className="text-right truncate">{a.course?.title || '—'}</span>
                        </div>
                        {a.class_name && (
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider">Class</span>
                            <span className="text-right truncate">{a.class_name}</span>
                          </div>
                        )}
                        <div className="flex justify-between gap-2 items-start">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">Due</span>
                          <span className="text-right">
                            {a.due_date ? <><span className="block">{format(new Date(a.due_date), 'MMM d, yyyy')}</span>{dueBadge}</> : '—'}
                          </span>
                        </div>
                        {a.publish_at && a.status === 'draft' && (
                          <div className="flex justify-between gap-2 items-center">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">Auto-publish</span>
                            <span className="text-right text-violet-600 font-medium">{format(new Date(a.publish_at), 'MMM d, HH:mm')}</span>
                          </div>
                        )}
                        <div className="flex justify-between gap-2 items-center">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Score</span>
                          <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                            <Star className="w-3.5 h-3.5 text-amber-400" />{a.max_score} pts
                          </span>
                        </div>
                      </div>
                      {a.status === 'published' && (
                        <button
                          type="button"
                          onClick={() => setSubmissionsFor(a)}
                          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />View Submissions
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
                Showing {filtered.length} of {assignments.length} assignments
              </div>
            </>
          )}
        </div>
      </AdminListPageShell>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{editId ? 'Edit Assignment' : 'New Assignment'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Title *</label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="Assignment title" />
              </div>
              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  rows={2} className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
                  placeholder="Brief overview..." />
              </div>
              {/* Instructions */}
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Instructions</label>
                <textarea value={form.instructions} onChange={e => set('instructions', e.target.value)}
                  rows={4} className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
                  placeholder="Detailed step-by-step instructions for students..." />
              </div>
              {/* Type + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Type</label>
                  <select value={form.type} onChange={e => set('type', e.target.value as AssignmentType)}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    {Object.entries(TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as AssignmentStatus)}
                    disabled={form.autoPublish}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
              {/* Due Date + Max Score */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Max Score</label>
                  <input type="number" min={0} value={form.max_score} onChange={e => set('max_score', Number(e.target.value) as any)}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
              </div>
              {/* Course + Class */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Course</label>
                  <select value={form.course_id} onChange={e => set('course_id', e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    <option value="">No course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Class</label>
                  <select value={form.class_id} onChange={e => set('class_id', e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    <option value="">No class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Allow late submission */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => set('allow_late_submission', !form.allow_late_submission as any)}
                  className={cn('relative w-10 h-5 rounded-full transition-colors', form.allow_late_submission ? 'bg-amber-500' : 'bg-slate-200')}
                >
                  <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.allow_late_submission ? 'translate-x-5' : '')} />
                </div>
                <span className="text-sm font-medium text-slate-700">Allow late submission</span>
              </label>

              {/* Auto-publish */}
              <div className={cn('rounded-xl border transition-all duration-200', form.autoPublish ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-slate-50/60')}>
                <div
                  role="switch"
                  aria-checked={form.autoPublish}
                  onClick={() => {
                    const next = !form.autoPublish;
                    setForm(f => ({
                      ...f,
                      autoPublish: next,
                      status: next ? 'draft' : f.status,
                      publishAt: next ? f.publishAt : '',
                    }));
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
                >
                  <div className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', form.autoPublish ? 'bg-violet-500' : 'bg-slate-300')}>
                    <div className={cn('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.autoPublish ? 'translate-x-5' : 'translate-x-0')} />
                  </div>
                  <div>
                    <span className={cn('text-sm font-semibold', form.autoPublish ? 'text-violet-700' : 'text-slate-600')}>Auto-publish</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">Schedule a future publish date</p>
                  </div>
                </div>
                {form.autoPublish && (
                  <div className="px-3 pb-3 pt-1">
                    <label className="block text-xs font-semibold text-violet-600 mb-1.5">
                      <Calendar className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                      Publish date &amp; time
                    </label>
                    <input
                      type="datetime-local"
                      value={form.publishAt}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={e => set('publishAt', e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-violet-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-slate-700"
                    />
                    {form.publishAt && (
                      <p className="text-[11px] text-violet-500 mt-1.5 font-medium">
                        ✓ {new Date(form.publishAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Submission Methods */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Submission Methods</p>
                <p className="text-xs text-slate-400">Choose which methods students can use to submit their work.</p>
                <div className="space-y-2">
                  {[
                    { key: 'allow_text' as const,  label: 'Text answer',       desc: 'Students can type a written response',            color: 'bg-blue-500'   },
                    { key: 'allow_files' as const,  label: 'File uploads',      desc: 'Students can upload documents, images, etc.',     color: 'bg-teal-500'   },
                    { key: 'allow_links' as const,  label: 'Link submissions',  desc: 'Students can submit URLs (GitHub, Drive, etc.)',  color: 'bg-violet-500' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-start gap-3 cursor-pointer group">
                      <div
                        onClick={() => setForm(f => ({ ...f, submission_config: { ...f.submission_config, [opt.key]: !f.submission_config[opt.key] } }))}
                        className={cn('mt-0.5 relative w-9 h-5 rounded-full transition-colors shrink-0', form.submission_config[opt.key] ? opt.color : 'bg-slate-200')}
                      >
                        <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.submission_config[opt.key] ? 'translate-x-4' : '')} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{opt.label}</p>
                        <p className="text-xs text-slate-400">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {form.submission_config.allow_files && (
                  <div className="pt-2 border-t border-slate-100">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Max files per submission</label>
                    <input
                      type="number" min={1} max={20}
                      value={form.submission_config.max_file_count}
                      onChange={e => setForm(f => ({ ...f, submission_config: { ...f.submission_config, max_file_count: Math.min(20, Math.max(1, Number(e.target.value))) } }))}
                      className="mt-1 w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <LoadingButton
                onClick={handleSave}
                loading={saving}
                className="rounded-lg"
                style={{ background: saving ? '#f59e0b99' : '#f59e0b' }}
              >
                {editId ? 'Update' : 'Create'}
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Delete Assignment?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button type="button" onClick={() => setDeleteId(null)} disabled={deleting} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">Cancel</button>
              <LoadingButton
                loading={deleting}
                onClick={() => handleDelete(deleteId)}
                variant="danger"
                className="rounded-lg"
              >
                Delete
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Submissions Panel */}
      <AnimatePresence>
        {submissionsFor && (
          <SubmissionsPanel assignment={submissionsFor} onClose={() => setSubmissionsFor(null)} />
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}
