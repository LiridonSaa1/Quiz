import React, { useEffect, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_SELECT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';
import { supabase } from '../../supabase';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import {
  Megaphone, Plus, Search, Trash2, Pencil, X,
  Users, GraduationCap, Globe, AlertTriangle,
  Info, Zap, Send, FileText, Archive, Clock,
  Sparkles, RefreshCw, Calendar, Tag, ChevronDown,
  PartyPopper, Loader2, Mail, CheckCircle2, XCircle, WifiOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';

type Audience  = 'all' | 'students' | 'teachers';
type Priority  = 'normal' | 'important' | 'urgent';
type AnnStatus = 'draft' | 'published' | 'archived';
type AnnType   =
  | 'general'
  | 'holiday'
  | 'religious_holiday'
  | 'teacher_absence'
  | 'class_cancelled'
  | 'exam_reminder'
  | 'homework_reminder'
  | 'emergency'
  | 'event';

interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: string | null;
  target_audience: Audience;
  priority: Priority;
  status: AnnStatus;
  ann_type?: AnnType;
  scheduled_at?: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  author?: { id: string; display_name: string; email: string } | null;
}

const AUDIENCE_CFG: Record<Audience, { label: string; icon: React.ElementType; color: string }> = {
  all:      { label: 'Everyone', icon: Globe,         color: 'text-slate-600'  },
  students: { label: 'Students', icon: GraduationCap, color: 'text-blue-600'   },
  teachers: { label: 'Teachers', icon: Users,          color: 'text-violet-600' },
};

const PRIORITY_CFG: Record<Priority, { label: string; bg: string; text: string; icon: React.ElementType; border: string }> = {
  normal:    { label: 'Normal',    bg: 'bg-slate-100', text: 'text-slate-600', icon: Info,          border: 'border-slate-200' },
  important: { label: 'Important', bg: 'bg-amber-50',  text: 'text-amber-700', icon: AlertTriangle, border: 'border-amber-200' },
  urgent:    { label: 'Urgent',    bg: 'bg-rose-50',   text: 'text-rose-700',  icon: Zap,           border: 'border-rose-200'  },
};

const STATUS_CFG: Record<AnnStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: FileText },
  published: { label: 'Published', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: Send     },
  archived:  { label: 'Archived',  bg: 'bg-slate-100',  text: 'text-slate-400',   dot: 'bg-slate-300',   icon: Archive  },
};

const ANN_TYPE_CFG: Record<AnnType, { label: string; emoji: string }> = {
  general:          { label: 'General',           emoji: '📢' },
  holiday:          { label: 'School Holiday',    emoji: '🏖️' },
  religious_holiday:{ label: 'Religious Holiday', emoji: '🌙' },
  teacher_absence:  { label: 'Teacher Absence',   emoji: '🙏' },
  class_cancelled:  { label: 'Class Cancelled',   emoji: '❌' },
  exam_reminder:    { label: 'Exam Reminder',     emoji: '📝' },
  homework_reminder:{ label: 'Homework Reminder', emoji: '📚' },
  emergency:        { label: 'Emergency',         emoji: '🚨' },
  event:            { label: 'Event',             emoji: '🎉' },
};

interface Template {
  label: string; emoji: string; title: string; content: string;
  type: AnnType; priority: Priority; audience: Audience;
}

const TEMPLATES: Template[] = [
  {
    label: 'Bajram', emoji: '🌙',
    title: 'Bajram Holiday — Classes Suspended',
    content: 'Dear students,\n\nWe wish you a blessed Bajram! In celebration of this joyous holiday, all classes will be suspended. Enjoy this special time with your family and loved ones.\n\nClasses will resume as scheduled after the holiday period.\n\nWith warm wishes,\nYour Teacher',
    type: 'religious_holiday', priority: 'normal', audience: 'students',
  },
  {
    label: 'Christmas', emoji: '🎄',
    title: 'Christmas Holiday — School Closed',
    content: 'Dear students,\n\nWishing you a Merry Christmas and a Happy New Year! The school will be closed during the Christmas holiday period. Enjoy the festive season with your family.\n\nWe look forward to seeing you when classes resume.\n\nWarm wishes,\nYour Teacher',
    type: 'religious_holiday', priority: 'normal', audience: 'students',
  },
  {
    label: 'No School', emoji: '🏖️',
    title: 'School Holiday — No Classes Today',
    content: 'Dear students,\n\nThere will be no classes today due to a school holiday. All scheduled activities are postponed.\n\nClasses will resume on the next school day. Thank you for your understanding!\n\nBest regards,\nYour Teacher',
    type: 'holiday', priority: 'important', audience: 'students',
  },
  {
    label: 'I\'m Absent', emoji: '🙏',
    title: 'Teacher Absence — Class Rescheduled',
    content: 'Dear students,\n\nI will be absent today and our class has been rescheduled. I will notify you of the new time as soon as possible.\n\nI apologize for any inconvenience. Thank you for your patience and understanding.\n\nBest regards,\nYour Teacher',
    type: 'teacher_absence', priority: 'important', audience: 'students',
  },
  {
    label: 'Class Cancelled', emoji: '❌',
    title: 'Class Cancellation Notice',
    content: 'Dear students,\n\nToday\'s class has been cancelled. I apologize for the short notice.\n\nThe class will be rescheduled. Please check your notifications for updates on the new schedule.\n\nThank you for your understanding.',
    type: 'class_cancelled', priority: 'urgent', audience: 'students',
  },
  {
    label: 'Exam Reminder', emoji: '📝',
    title: 'Upcoming Exam — Don\'t Forget to Prepare!',
    content: 'Dear students,\n\nThis is a reminder that an important exam is coming up soon. Please make sure you:\n\n• Review all the material covered in class\n• Complete any practice exercises\n• Get a good night\'s sleep before the exam\n• Arrive on time with your required materials\n\nGood luck! I believe in all of you!\n\nYour Teacher',
    type: 'exam_reminder', priority: 'important', audience: 'students',
  },
  {
    label: 'Homework', emoji: '📚',
    title: 'Homework Reminder — Due Soon!',
    content: 'Dear students,\n\nThis is a friendly reminder that your homework assignment is due soon. Please make sure you have completed all the required exercises and submitted your work on time.\n\nIf you have any questions, feel free to reach out before the deadline.\n\nGood luck!\nYour Teacher',
    type: 'homework_reminder', priority: 'normal', audience: 'students',
  },
];

interface ClassOption { id: string; name: string; course_id?: string | null; student_ids: string[]; enrollment_count?: number; }
interface UserOption { id: string; display_name: string; email: string; }

const emptyForm = {
  title: '', content: '', author_id: '',
  target_audience: 'all' as Audience,
  priority: 'normal' as Priority,
  status: 'draft' as AnnStatus,
  ann_type: 'general' as AnnType,
  expires_at: '',
  scheduled_at: '',
  send_email: false,
};

interface BrevoStatus { configured: boolean; connected: boolean; reason?: string; email?: string; plan?: string; senderEmail?: string; senderName?: string; }

function BrevoStatusBanner() {
  const [status, setStatus] = useState<BrevoStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const check = async () => {
    setChecking(true);
    try {
      const res = await authFetch('/api/admin/brevo/status');
      const json = await res.json();
      setStatus(json);
    } catch { setStatus({ configured: false, connected: false, reason: 'Could not reach server' }); }
    finally { setChecking(false); }
  };

  useEffect(() => { check(); }, []);

  if (checking) return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 animate-pulse">
      <Mail className="w-4 h-4" /> Checking Brevo connection…
    </div>
  );

  if (!status) return null;

  if (status.connected) return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-bold text-emerald-700">Brevo i lidhur</span>
        <span className="text-emerald-600 ml-2">Email dërgohet nga <strong>{status.senderEmail}</strong> ({status.senderName})</span>
        {status.plan && <span className="ml-2 text-emerald-500">· Plan: {status.plan}</span>}
      </div>
      <button onClick={check} className="shrink-0 p-1 hover:bg-emerald-100 rounded-lg transition-all" title="Kontrollo sërisht">
        <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
      </button>
    </div>
  );

  if (status.configured && !status.connected) return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
      <WifiOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="font-bold text-amber-700">Brevo i konfiguruar por i bllokuar</span>
        <p className="text-amber-600 mt-0.5">{status.reason}</p>
        <p className="text-amber-500 mt-0.5">Shko te <strong>Brevo → Security → Authorised IPs</strong> dhe shto IP-në e serverit.</p>
      </div>
      <button onClick={check} className="shrink-0 p-1 hover:bg-amber-100 rounded-lg transition-all">
        <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
      </button>
    </div>
  );

  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
      <XCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="font-bold text-slate-600">Brevo nuk është konfiguruar</span>
        <p className="text-slate-400 mt-0.5">Shto <code className="bg-slate-100 px-1 rounded">BREVO_API_KEY</code>, <code className="bg-slate-100 px-1 rounded">BREVO_SENDER_EMAIL</code> dhe <code className="bg-slate-100 px-1 rounded">BREVO_SENDER_NAME</code> në Secrets.</p>
      </div>
    </div>
  );
}

export default function TeacherAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => { fetchAll(); fetchClasses(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/announcements');
      const json = await res.json();
      if (json.success) setAnnouncements(json.announcements || []);
      else toast.error(json.error || 'Failed to load announcements');
    } catch { toast.error('Failed to load announcements'); }
    finally { setLoading(false); }
  };

  const fetchClasses = async () => {
    try {
      const classesRes = await authFetch('/api/teacher/classes');
      const classesJson = await classesRes.json().catch(() => null);
      if (!classesRes.ok || !classesJson?.success || !Array.isArray(classesJson.classes)) return;

      const normalizedClasses: ClassOption[] = classesJson.classes.map((c: any) => ({
        id: String(c.id),
        name: String(c.name || 'Untitled class'),
        course_id: c.course_id ? String(c.course_id) : null,
        student_ids: Array.isArray(c.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [],
      }));

      let coursesWithStudents: Array<{ id: string; student_ids: string[] }> = [];
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (uid) {
          const coursesRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(uid)}`);
          const coursesJson = await coursesRes.json().catch(() => null);
          if (coursesRes.ok && coursesJson?.success && Array.isArray(coursesJson.courses)) {
            coursesWithStudents = coursesJson.courses.map((course: any) => ({
              id: String(course.id),
              student_ids: Array.isArray(course.student_ids) ? course.student_ids.map((sid: unknown) => String(sid)) : [],
            }));
          }
        }
      } catch { /* non-blocking */ }

      const courseStudentMap = new Map<string, string[]>(coursesWithStudents.map(c => [c.id, c.student_ids]));
      const classCountPerCourse = normalizedClasses.reduce((acc: Record<string, number>, cls) => {
        if (cls.course_id) acc[cls.course_id] = (acc[cls.course_id] || 0) + 1;
        return acc;
      }, {});

      const enriched = normalizedClasses.map(cls => {
        const hasSingle = cls.course_id ? (classCountPerCourse[cls.course_id] || 0) === 1 : false;
        const courseStudents = cls.course_id ? (courseStudentMap.get(cls.course_id) || []) : [];
        const count = cls.student_ids.length > 0 ? cls.student_ids.length : (hasSingle ? courseStudents.length : 0);
        return { ...cls, enrollment_count: count };
      });
      setClasses(enriched);
    } catch { /* non-blocking */ }
  };

  const searchUsers = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await authFetch(`/api/teacher/users/search?q=${encodeURIComponent(q)}&role=student`);
      const json = await res.json();
      if (json.success) setSearchResults(json.users || []);
    } finally { setSearching(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => { searchUsers(userSearch); }, 350);
    return () => clearTimeout(t);
  }, [userSearch]);

  const openCreate = () => {
    setEditing(null); setForm(emptyForm); setSelectedClassIds([]);
    setSelectedUsers([]); setUserSearch(''); setSearchResults([]);
    setShowTemplates(false); setShowModal(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title, content: a.content, author_id: a.author_id || '',
      target_audience: a.target_audience, priority: a.priority, status: a.status,
      ann_type: (a.ann_type || 'general') as AnnType,
      expires_at: a.expires_at ? a.expires_at.slice(0, 10) : '',
      scheduled_at: a.scheduled_at ? a.scheduled_at.slice(0, 16) : '',
      send_email: false,
    });
    setSelectedClassIds([]); setSelectedUsers([]); setUserSearch('');
    setSearchResults([]); setShowTemplates(false); setShowModal(true);
  };

  const applyTemplate = (t: Template) => {
    setForm(p => ({ ...p, title: t.title, content: t.content, ann_type: t.type, priority: t.priority, target_audience: t.audience }));
    setShowTemplates(false);
  };

  const generateWithAI = async () => {
    if (!form.title.trim() && !form.ann_type) { toast.error('Add a title or type first so AI has context'); return; }
    setAiGenerating(true);
    try {
      const prompt = `Write a professional school announcement for a teacher with the following details:
- Type: ${ANN_TYPE_CFG[form.ann_type]?.label || 'General'}
- Title: ${form.title || '(not specified)'}
- Audience: ${form.target_audience}
- Priority: ${form.priority}

Write a warm, professional message (2-3 paragraphs). Start with a friendly greeting, explain the situation clearly, give any instructions if needed, and end with an encouraging or warm closing. Write as if from a teacher to students. Do NOT include "Dear [Name]" — write the body only.`;
      const res = await authFetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, role: 'teacher', page: 'Announcements' }),
      });
      const json = await res.json();
      if (json.reply) { set('content', json.reply); toast.success('AI generated your announcement!'); }
      else toast.error(json.error || 'AI generation failed');
    } catch { toast.error('AI generation failed. Check your GEMINI_API_KEY.'); }
    finally { setAiGenerating(false); }
  };

  const handleSave = async (overrideStatus?: AnnStatus) => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.content.trim()) { toast.error('Content is required'); return; }
    setSaving(true);
    try {
      const status = overrideStatus ?? form.status;
      const payload = {
        ...form,
        status,
        author_id: form.author_id || null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        class_ids: selectedClassIds,
        student_ids: selectedUsers.map(u => u.id),
      };
      const url = editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements';
      const method = editing ? 'PATCH' : 'POST';
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Announcement updated' : status === 'published' ? 'Announcement published!' : 'Draft saved');
      setShowModal(false);
      fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    setDeleting(id);
    try {
      const res = await authFetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Announcement deleted');
      setAnnouncements(p => p.filter(x => x.id !== id));
    } catch (e: unknown) { toast.error((e as Error).message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const quickPublish = async (a: Announcement) => {
    try {
      const res = await authFetch(`/api/admin/announcements/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Published!');
      fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const handleResend = async (a: Announcement) => {
    if (!confirm('Resend notifications for this announcement?')) return;
    setResending(a.id);
    try {
      const res = await authFetch(`/api/admin/announcements/${a.id}/resend`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Notifications resent to ${json.count ?? 'all'} recipients`);
    } catch (e: unknown) { toast.error((e as Error).message || 'Resend failed'); }
    finally { setResending(null); }
  };

  const filtered = announcements.filter(a => {
    const q = search.toLowerCase();
    const matchQ = a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q);
    const matchP = priorityFilter === 'all' || a.priority === priorityFilter;
    const matchS = statusFilter === 'all' || a.status === statusFilter;
    return matchQ && matchP && matchS;
  });

  const statItems = [
    { label: 'Total',     value: announcements.length,                                                                  gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: Megaphone },
    { label: 'Published', value: announcements.filter(a => a.status === 'published').length,                            gradient: 'from-emerald-500 to-teal-600',  shadow: 'shadow-emerald-500/25', icon: Send      },
    { label: 'Drafts',    value: announcements.filter(a => a.status === 'draft').length,                                gradient: 'from-amber-500 to-orange-600',  shadow: 'shadow-amber-500/25',  icon: FileText  },
    { label: 'Urgent',    value: announcements.filter(a => a.priority === 'urgent' && a.status === 'published').length, gradient: 'from-rose-500 to-pink-600',     shadow: 'shadow-rose-500/25',   icon: Zap       },
  ];

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Announcements"
        title="Announcements"
        description="Broadcast messages to students, teachers, or everyone."
        statsGridClassName="grid grid-cols-2 sm:grid-cols-4 gap-4"
        stats={statItems}
        action={
          <motion.button type="button" onClick={openCreate}
            whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
            style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.45)' }}
          >
            <Plus className="w-4 h-4" /> New Announcement
          </motion.button>
        }
        filterBar={
          <div className="space-y-3">
            <BrevoStatusBanner />
            <AdminListFilterBar>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search announcements..." className={ADMIN_LIST_SEARCH_INPUT} />
              </div>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
                <option value="all">All Priorities</option>
                {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
                <option value="all">All Status</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </AdminListFilterBar>
          </div>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(6).fill(0).map((_, i) => <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Megaphone className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No announcements yet</p>
              <p className="text-sm mt-1">Create your first announcement to reach your students</p>
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(ann => {
                const priCfg = PRIORITY_CFG[ann.priority];
                const statCfg = STATUS_CFG[ann.status];
                const audCfg = AUDIENCE_CFG[ann.target_audience];
                const typeCfg = ANN_TYPE_CFG[ann.ann_type || 'general'];
                const PriIcon = priCfg.icon;
                const AudIcon = audCfg.icon;
                const isExpired = ann.expires_at && isPast(new Date(ann.expires_at));
                return (
                  <div key={ann.id} className={cn(ADMIN_LIST_ITEM_CARD, ann.priority === 'urgent' ? 'border-rose-200' : ann.priority === 'important' ? 'border-amber-200' : 'border-slate-100')}>
                    <div className="flex items-start gap-4">
                      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg', priCfg.bg)}>
                        {typeCfg.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', priCfg.bg, priCfg.text)}>
                              <PriIcon className="w-3 h-3" />{priCfg.label}
                            </span>
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', statCfg.bg, statCfg.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', statCfg.dot)} />{statCfg.label}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                              <AudIcon className="w-3.5 h-3.5" />{audCfg.label}
                            </span>
                            {ann.ann_type && ann.ann_type !== 'general' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                                <Tag className="w-3 h-3" />{typeCfg.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {ann.status === 'draft' && (
                              <button type="button" onClick={() => quickPublish(ann)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-all">
                                <Send className="w-3 h-3" /> Publish
                              </button>
                            )}
                            {ann.status === 'published' && (
                              <button type="button" onClick={() => handleResend(ann)} disabled={resending === ann.id}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all disabled:opacity-40">
                                {resending === ann.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Resend
                              </button>
                            )}
                            <button type="button" onClick={() => openEdit(ann)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => handleDelete(ann.id)} disabled={deleting === ann.id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-40">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold text-slate-900 mt-2 text-base">{ann.title}</h3>
                        <p className="text-slate-500 text-sm mt-1.5 line-clamp-2 leading-relaxed">{ann.content}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
                          {ann.author && <span className="font-medium text-slate-500">{ann.author.display_name}</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {ann.published_at ? `Published ${formatDistanceToNow(new Date(ann.published_at), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}`}
                          </span>
                          {ann.scheduled_at && !ann.published_at && (
                            <span className="flex items-center gap-1 text-indigo-500">
                              <Calendar className="w-3.5 h-3.5" />
                              Scheduled: {format(new Date(ann.scheduled_at), 'MMM d, HH:mm')}
                            </span>
                          )}
                          {ann.expires_at && (
                            <span className={cn('flex items-center gap-1', isExpired ? 'text-rose-400' : 'text-amber-500')}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {isExpired ? 'Expired' : `Expires ${format(new Date(ann.expires_at), 'MMM d, yyyy')}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AdminListPageShell>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Announcement' : 'New Announcement'}</h2>
                <p className="text-slate-400 text-sm">Broadcast a message to your students</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Templates */}
            <div className="px-5 pt-4">
              <button type="button" onClick={() => setShowTemplates(s => !s)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-all">
                <span className="flex items-center gap-2"><PartyPopper className="w-4 h-4" /> Quick Templates</span>
                <ChevronDown className={cn('w-4 h-4 transition-transform', showTemplates && 'rotate-180')} />
              </button>
              {showTemplates && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {TEMPLATES.map(t => (
                    <button key={t.label} type="button" onClick={() => applyTemplate(t)}
                      className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all text-left">
                      <span className="text-base">{t.emoji}</span><span>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-400">*</span></label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. No class tomorrow — Bajram Holiday" />
              </div>

              {/* Content + AI */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Content <span className="text-red-400">*</span></label>
                  <button type="button" onClick={generateWithAI} disabled={aiGenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-lg text-xs font-semibold hover:from-violet-600 hover:to-indigo-600 transition-all disabled:opacity-60">
                    {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {aiGenerating ? 'Generating…' : 'Generate with AI'}
                  </button>
                </div>
                <textarea rows={6} value={form.content} onChange={e => set('content', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                  placeholder="Write your announcement here, or use AI to generate it…" />
              </div>

              {/* Type + Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                  <select value={form.ann_type} onChange={e => set('ann_type', e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(ANN_TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e => set('priority', e.target.value as Priority)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Audience + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Audience</label>
                  <select value={form.target_audience} onChange={e => set('target_audience', e.target.value as Audience)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(AUDIENCE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value as AnnStatus)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Scheduled + Expires */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Schedule Send</span>
                  </label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expires On</label>
                  <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Email channel toggle */}
              <div className="flex items-center gap-3 p-3.5 bg-blue-50 border border-blue-100 rounded-xl">
                <Mail className="w-5 h-5 text-blue-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-800">Send via Email (Brevo)</p>
                  <p className="text-xs text-blue-500 mt-0.5">Sends email to all targeted students when published. Requires BREVO_API_KEY in Secrets.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" className="sr-only peer" checked={form.send_email} onChange={e => set('send_email', e.target.checked)} />
                  <div className="w-9 h-5 bg-slate-300 peer-checked:bg-blue-500 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-4 after:h-4 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>

              {/* Class targeting */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Targeting (Optional)</p>
                {classes.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target class(es)</label>
                    <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-36 overflow-y-auto">
                      {classes.map(c => {
                        const checked = selectedClassIds.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer">
                            <span className="flex items-center gap-2 min-w-0">
                              <input type="checkbox" checked={checked}
                                onChange={e => setSelectedClassIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                              <span className="text-sm text-slate-700 truncate">{c.name}</span>
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{c.enrollment_count ?? c.student_ids.length} students</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Student search */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Or specific students</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                    <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search student by name or email..."
                      className="w-full pl-11 pr-4 py-2.5 rounded-xl text-sm border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    {searching && <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-36 overflow-y-auto">
                      {searchResults.map(u => (
                        <button key={u.id} type="button"
                          onClick={() => { if (!selectedUsers.find(x => x.id === u.id)) setSelectedUsers(prev => [...prev, u]); setUserSearch(''); setSearchResults([]); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center gap-3 border-b border-slate-50 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                            {u.display_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{u.display_name}</p>
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedUsers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedUsers.map(u => (
                        <span key={u.id} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
                          {u.display_name}
                          <button type="button" onClick={() => setSelectedUsers(prev => prev.filter(s => s.id !== u.id))}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">Cancel</button>
              <button type="button" onClick={() => handleSave('draft')} disabled={saving} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">Save Draft</button>
              <button type="button" onClick={() => handleSave('published')} disabled={saving}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                {saving ? 'Saving…' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
