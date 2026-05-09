import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import {
  ArrowLeft, Calendar, BookOpen, ClipboardList, CheckCircle2,
  Clock, AlertCircle, Send, Award, MessageSquare, RefreshCw, FileText,
  Upload, Link2, X, Paperclip, ExternalLink, Save, File, Image,
  Video, Archive, Code, FileSpreadsheet, Presentation,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

type AssignmentStatus = 'draft' | 'published' | 'closed';

type SubmissionConfig = {
  allow_text: boolean;
  allow_files: boolean;
  allow_links: boolean;
  max_file_count: number;
  accepted_types: string[];
};

const DEFAULT_CONFIG: SubmissionConfig = {
  allow_text: true,
  allow_files: false,
  allow_links: false,
  max_file_count: 5,
  accepted_types: [],
};

type FileEntry = { name: string; url: string; size: number; mime_type: string };
type LinkEntry = { url: string; label: string };

type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  max_score: number | null;
  status: AssignmentStatus;
  course_id: string | null;
  course_title: string;
  allow_late_submission: boolean;
  submission_config: SubmissionConfig | null;
  created_at: string | null;
};

type Submission = {
  id: string;
  content: string | null;
  file_urls: FileEntry[];
  link_urls: LinkEntry[];
  draft_content: string | null;
  draft_file_urls: FileEntry[];
  draft_link_urls: LinkEntry[];
  draft_saved_at: string | null;
  status: 'submitted' | 'graded';
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  graded_at: string | null;
  is_late: boolean;
};

function parseJsonField<T>(val: any, fallback: T): T {
  if (Array.isArray(val)) return val as unknown as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}

function useCountdown(dueDate: string | null) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number; expired: boolean } | null>(null);
  useEffect(() => {
    if (!dueDate) return;
    const tick = () => {
      const diff = new Date(dueDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }); return; }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        expired: false,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dueDate]);
  return timeLeft;
}

function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image className="w-4 h-4" />;
  if (mime.startsWith('video/')) return <Video className="w-4 h-4" />;
  if (mime.includes('pdf')) return <FileText className="w-4 h-4" />;
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('archive')) return <Archive className="w-4 h-4" />;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return <FileSpreadsheet className="w-4 h-4" />;
  if (mime.includes('presentation') || mime.includes('powerpoint')) return <Presentation className="w-4 h-4" />;
  if (mime.includes('text') || mime.includes('code') || mime.includes('javascript') || mime.includes('python')) return <Code className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isValidUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

const DRAFT_LS_KEY = (id: string) => `assignment_draft_${id}`;

export default function StudentAssignmentDetail() {
  const { assignmentId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Submission method state
  const [activeTab, setActiveTab] = useState<'text' | 'files' | 'links'>('text');
  const [answer, setAnswer] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [links, setLinks] = useState<LinkEntry[]>([{ url: '', label: '' }]);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countdown = useCountdown(assignment?.due_date ?? null);
  const config: SubmissionConfig = assignment?.submission_config ?? DEFAULT_CONFIG;

  // Load assignment + submission
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !assignmentId) { setLoading(false); return; }
      setUserId(session.user.id);

      const { data: enrolledCourses } = await supabase
        .from('courses').select('id,title,status,student_ids').contains('student_ids', [session.user.id]);

      const courses = (enrolledCourses || [])
        .filter((c: any) => { const s = String(c?.status || '').toLowerCase(); return s === '' || s === 'published' || s === 'active'; })
        .map((c: any) => ({ id: String(c.id), title: String(c.title || 'Course') }));

      if (!courses.length) { setLoading(false); return; }
      const courseIds = courses.map((c: any) => c.id);
      const courseMap: Record<string, string> = {};
      courses.forEach((c: any) => { courseMap[c.id] = c.title; });

      const { data: rows } = await supabase
        .from('assignments').select('*').in('course_id', courseIds)
        .eq('status', 'published').eq('id', assignmentId).limit(1);

      const found = rows?.[0];
      if (!found) { setLoading(false); return; }

      let parsedConfig: SubmissionConfig | null = null;
      if (found.submission_config) {
        try {
          parsedConfig = typeof found.submission_config === 'string'
            ? JSON.parse(found.submission_config)
            : found.submission_config;
        } catch { parsedConfig = null; }
      }

      setAssignment({
        id: String(found.id), title: String(found.title || 'Untitled'),
        description: found.description || null, instructions: found.instructions || null,
        due_date: found.due_date || null, max_score: found.max_score == null ? null : Number(found.max_score),
        status: found.status || 'published', course_id: found.course_id ? String(found.course_id) : null,
        course_title: courseMap[found.course_id] || 'Course',
        allow_late_submission: Boolean(found.allow_late_submission),
        submission_config: parsedConfig,
        created_at: found.created_at || null,
      });

      try {
        const subRes = await authFetch(`/api/student/assignments/${assignmentId}/submission`);
        const subJson = await subRes.json();
        if (subJson.success && subJson.submission) {
          const s = subJson.submission;
          const sub: Submission = {
            ...s,
            file_urls: parseJsonField<FileEntry[]>(s.file_urls, []),
            link_urls: parseJsonField<LinkEntry[]>(s.link_urls, []),
            draft_file_urls: parseJsonField<FileEntry[]>(s.draft_file_urls, []),
            draft_link_urls: parseJsonField<LinkEntry[]>(s.draft_link_urls, []),
          };
          setSubmission(sub);
          setAnswer(sub.content || '');
          if (sub.file_urls?.length) setFiles(sub.file_urls);
          if (sub.link_urls?.length) setLinks(sub.link_urls.length ? sub.link_urls : [{ url: '', label: '' }]);
        } else {
          // Restore from localStorage draft
          const stored = localStorage.getItem(DRAFT_LS_KEY(assignmentId));
          if (stored) {
            try {
              const draft = JSON.parse(stored);
              if (draft.answer) setAnswer(draft.answer);
              if (draft.files?.length) setFiles(draft.files);
              if (draft.links?.length) setLinks(draft.links);
              setDraftSavedAt(draft.savedAt ? new Date(draft.savedAt) : null);
            } catch { }
          }
        }
      } catch { }

      setLoading(false);
    };
    void load();
  }, [assignmentId]);

  // Set initial active tab based on config
  useEffect(() => {
    if (!assignment) return;
    const cfg = assignment.submission_config ?? DEFAULT_CONFIG;
    if (cfg.allow_text) setActiveTab('text');
    else if (cfg.allow_files) setActiveTab('files');
    else if (cfg.allow_links) setActiveTab('links');
  }, [assignment]);

  // Auto-save draft to localStorage
  const scheduleDraftSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const draft = { answer, files, links, savedAt: new Date().toISOString() };
      localStorage.setItem(DRAFT_LS_KEY(assignmentId), JSON.stringify(draft));
      setDraftSavedAt(new Date());
    }, 3000);
  }, [answer, files, links, assignmentId]);

  useEffect(() => {
    if (showForm) scheduleDraftSave();
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [answer, files, links, showForm, scheduleDraftSave]);

  // Prevent accidental page close when form is open with content
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (showForm && (answer.trim() || files.length || links.some(l => l.url.trim()))) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [showForm, answer, files, links]);

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    if (!userId || !assignmentId) return;
    const arr = Array.from(fileList);
    const maxCount = config.max_file_count || 5;
    if (files.length + arr.length > maxCount) {
      toast.error(`Maximum ${maxCount} files allowed`);
      return;
    }

    for (const file of arr) {
      if (file.size > 52428800) { toast.error(`${file.name} exceeds 50 MB limit`); continue; }

      setUploadingFiles(prev => [...prev, { name: file.name, progress: 0 }]);

      try {
        const path = `${assignmentId}/${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { data, error } = await supabase.storage
          .from('assignment-files')
          .upload(path, file, { upsert: false });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('assignment-files')
          .getPublicUrl(data.path);

        const entry: FileEntry = { name: file.name, url: publicUrl, size: file.size, mime_type: file.type };
        setFiles(prev => [...prev, entry]);
        toast.success(`${file.name} uploaded`);
      } catch (e: any) {
        toast.error(`Failed to upload ${file.name}: ${e.message}`);
      } finally {
        setUploadingFiles(prev => prev.filter(u => u.name !== file.name));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleUploadFiles(e.dataTransfer.files);
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const draft = { answer, files, links, savedAt: new Date().toISOString() };
      localStorage.setItem(DRAFT_LS_KEY(assignmentId), JSON.stringify(draft));

      await authFetch(`/api/student/assignments/${assignmentId}/save-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_content: answer, draft_file_urls: files, draft_link_urls: links }),
      });
      setDraftSavedAt(new Date());
      toast.success('Draft saved');
    } catch {
      setDraftSavedAt(new Date());
      toast.success('Draft saved locally');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    const hasText = answer.trim().length > 0;
    const hasFiles = files.length > 0;
    const hasLinks = links.some(l => l.url.trim());

    if (!hasText && !hasFiles && !hasLinks) {
      toast.error('Please add at least one type of submission content');
      return;
    }

    const validLinks = links.filter(l => l.url.trim()).map(l => ({
      url: l.url.trim(),
      label: l.label.trim() || l.url.trim(),
    }));

    for (const l of validLinks) {
      if (!isValidUrl(l.url)) { toast.error(`Invalid URL: ${l.url}`); return; }
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/student/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: answer || null, file_urls: files, link_urls: validLinks }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Submission failed');
      const s = json.submission;
      setSubmission({
        ...s,
        file_urls: parseJsonField<FileEntry[]>(s.file_urls, files),
        link_urls: parseJsonField<LinkEntry[]>(s.link_urls, validLinks),
        draft_file_urls: [],
        draft_link_urls: [],
      });
      localStorage.removeItem(DRAFT_LS_KEY(assignmentId));
      setShowForm(false);
      toast.success(submission ? 'Submission updated!' : 'Assignment submitted!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const dueLabel = useMemo(() => {
    if (!assignment?.due_date) return 'No due date';
    const d = new Date(assignment.due_date);
    if (isToday(d)) return 'Due today';
    if (isPast(d)) return 'Overdue';
    return `Due ${format(d, 'MMM d, yyyy')}`;
  }, [assignment]);

  const isExpired = assignment?.due_date ? isPast(new Date(assignment.due_date)) : false;
  const canSubmit = !isExpired || assignment?.allow_late_submission;

  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const charCount = answer.length;

  const availableTabs = [
    config.allow_text && { key: 'text' as const, label: 'Text', icon: FileText },
    config.allow_files && { key: 'files' as const, label: 'Files', icon: Paperclip },
    config.allow_links && { key: 'links' as const, label: 'Links', icon: Link2 },
  ].filter(Boolean) as { key: 'text' | 'files' | 'links'; label: string; icon: any }[];

  // If no config set, default to text only
  if (availableTabs.length === 0) availableTabs.push({ key: 'text', label: 'Text', icon: FileText });

  const openEditForm = () => {
    if (submission) {
      setAnswer(submission.content || '');
      setFiles(submission.file_urls || []);
      const existingLinks = submission.link_urls?.length ? submission.link_urls : [{ url: '', label: '' }];
      setLinks(existingLinks);
    }
    setShowForm(true);
  };

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        <Link to="/student/assignments" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to assignments
        </Link>

        {loading ? (
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6">
                <div className="h-5 w-56 bg-slate-100 rounded animate-pulse mb-3" />
                <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : !assignment ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Assignment not available</h2>
            <p className="text-sm text-slate-500 mt-1">You do not have access to this assignment.</p>
          </div>
        ) : (
          <>
            {/* Header card */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-teal-600 to-cyan-600 px-6 pt-6 pb-8">
                <p className="text-teal-200 text-xs font-semibold uppercase tracking-wider mb-1">{assignment.course_title}</p>
                <h1 className="text-2xl font-black text-white leading-tight">{assignment.title}</h1>
                {assignment.description && (
                  <p className="text-teal-100 text-sm mt-2 leading-relaxed">{assignment.description}</p>
                )}
                {/* Submission method badges */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {config.allow_text && <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-medium flex items-center gap-1"><FileText className="w-3 h-3" />Text</span>}
                  {config.allow_files && <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-medium flex items-center gap-1"><Paperclip className="w-3 h-3" />Files</span>}
                  {config.allow_links && <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-medium flex items-center gap-1"><Link2 className="w-3 h-3" />Links</span>}
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-100">
                <div className="px-4 py-4 text-center">
                  <div className={cn('text-xs font-bold uppercase tracking-wide mb-1', isExpired ? 'text-rose-500' : 'text-slate-400')}>
                    {isExpired ? 'OVERDUE' : 'DUE'}
                  </div>
                  <div className={cn('text-sm font-bold', isExpired ? 'text-rose-600' : 'text-slate-800')}>
                    {assignment.due_date ? format(new Date(assignment.due_date), 'MMM d, yyyy') : '—'}
                  </div>
                </div>
                <div className="px-4 py-4 text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Max Score</div>
                  <div className="text-sm font-bold text-slate-800">{assignment.max_score ?? 0} pts</div>
                </div>
                <div className="px-4 py-4 text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Status</div>
                  <div className={cn('text-sm font-bold',
                    submission?.status === 'graded' ? 'text-emerald-600' :
                    submission ? 'text-blue-600' : 'text-slate-500')}>
                    {submission?.status === 'graded' ? 'Graded' : submission ? 'Submitted' : 'Not submitted'}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Countdown */}
            {assignment.due_date && countdown && !countdown.expired && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-teal-500" />
                  <h3 className="text-sm font-bold text-slate-700">Time remaining</h3>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[{ label: 'Days', value: countdown.days }, { label: 'Hours', value: countdown.hours }, { label: 'Minutes', value: countdown.minutes }, { label: 'Seconds', value: countdown.seconds }].map(({ label, value }) => (
                    <div key={label} className={cn('rounded-xl p-3 text-center', countdown.days === 0 && countdown.hours < 2 ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50 border border-slate-100')}>
                      <div className={cn('text-2xl font-black tabular-nums', countdown.days === 0 && countdown.hours < 2 ? 'text-rose-600' : 'text-slate-900')}>{String(value).padStart(2, '0')}</div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {countdown?.expired && (
              <div className={cn('rounded-2xl border px-5 py-4 flex items-center gap-3', assignment.allow_late_submission ? 'bg-orange-50 border-orange-200' : 'bg-rose-50 border-rose-200')}>
                <AlertCircle className={cn('w-5 h-5 shrink-0', assignment.allow_late_submission ? 'text-orange-500' : 'text-rose-500')} />
                <p className={cn('text-sm font-medium', assignment.allow_late_submission ? 'text-orange-700' : 'text-rose-700')}>
                  {assignment.allow_late_submission ? 'The deadline has passed — late submissions are still accepted.' : 'The deadline has passed. Submissions are no longer accepted.'}
                </p>
              </div>
            )}

            {/* Instructions */}
            {assignment.instructions && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-500" /></div>
                  <h2 className="text-base font-bold text-slate-800">Instructions</h2>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{assignment.instructions}</p>
              </motion.div>
            )}

            {/* Grade & Feedback */}
            {submission?.status === 'graded' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><Award className="w-4 h-4 text-emerald-600" /></div>
                  <h2 className="text-base font-bold text-slate-800">Your Grade</h2>
                </div>
                <div className="flex items-center gap-6">
                  {submission.grade != null && (
                    <div className="text-center">
                      <div className="text-4xl font-black text-emerald-600">{submission.grade}</div>
                      <div className="text-xs text-slate-400 font-semibold">out of {assignment.max_score ?? 0}</div>
                    </div>
                  )}
                  {submission.feedback && (
                    <div className="flex-1 bg-emerald-50 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Teacher's feedback</span>
                      </div>
                      <p className="text-sm text-emerald-800 leading-relaxed">{submission.feedback}</p>
                    </div>
                  )}
                </div>
                {submission.graded_at && (
                  <p className="text-xs text-slate-400 mt-3">Graded {formatDistanceToNow(new Date(submission.graded_at), { addSuffix: true })}</p>
                )}
              </motion.div>
            )}

            {/* Submission Area */}
            {canSubmit && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center"><Send className="w-4 h-4 text-indigo-500" /></div>
                    <h2 className="text-base font-bold text-slate-800">{submission ? 'Your Submission' : 'Submit Your Work'}</h2>
                  </div>
                  {submission && !showForm && (
                    <button onClick={openEditForm} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                      <RefreshCw className="w-3 h-3" />Edit
                    </button>
                  )}
                </div>

                {/* Existing submission view */}
                {submission && !showForm ? (
                  <div className="space-y-3">
                    {submission.content && (
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Text answer</span>
                          {submission.is_late && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold">Late</span>}
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{submission.content}</p>
                      </div>
                    )}
                    {submission.file_urls?.length > 0 && (
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Paperclip className="w-4 h-4 text-blue-500" />
                          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">{submission.file_urls.length} file{submission.file_urls.length !== 1 ? 's' : ''} attached</span>
                        </div>
                        <div className="space-y-2">
                          {submission.file_urls.map((f, i) => (
                            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-lg bg-white border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group">
                              <span className="text-slate-500 group-hover:text-blue-500">{getFileIcon(f.mime_type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">{f.name}</p>
                                <p className="text-[10px] text-slate-400">{formatBytes(f.size)}</p>
                              </div>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {submission.link_urls?.length > 0 && (
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Link2 className="w-4 h-4 text-violet-500" />
                          <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">{submission.link_urls.length} link{submission.link_urls.length !== 1 ? 's' : ''} submitted</span>
                        </div>
                        <div className="space-y-1.5">
                          {submission.link_urls.map((l, i) => (
                            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 font-medium truncate">
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              {l.label || l.url}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-slate-400">
                      Submitted {formatDistanceToNow(new Date(submission.submitted_at), { addSuffix: true })}
                      {submission.is_late && ' · Marked as late'}
                    </p>
                  </div>
                ) : (
                  /* Submission form */
                  <div className="space-y-4">
                    {submission && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 font-medium">
                        Editing will replace your previous submission.
                      </div>
                    )}

                    {/* Draft saved indicator */}
                    {draftSavedAt && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Save className="w-3 h-3" />
                        Draft saved {formatDistanceToNow(draftSavedAt, { addSuffix: true })}
                      </div>
                    )}

                    {/* Tabs — only show if multiple methods enabled */}
                    {availableTabs.length > 1 && (
                      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                        {availableTabs.map(tab => (
                          <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
                              activeTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                          >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                            {tab.key === 'files' && files.length > 0 && (
                              <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{files.length}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Text tab */}
                    <AnimatePresence mode="wait">
                      {(activeTab === 'text' || availableTabs.length === 1 && config.allow_text) && (
                        <motion.div key="text" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                          <textarea
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            rows={8}
                            placeholder="Write your answer here..."
                            className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 resize-none leading-relaxed"
                          />
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                            <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
                            <span>·</span>
                            <span>{charCount} characters</span>
                          </div>
                        </motion.div>
                      )}

                      {/* Files tab */}
                      {activeTab === 'files' && (
                        <motion.div key="files" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                          {/* Drop zone */}
                          <div
                            onDragOver={e => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                              'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
                              dragging ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                            )}
                          >
                            <Upload className={cn('w-8 h-8 mx-auto mb-3', dragging ? 'text-teal-500' : 'text-slate-300')} />
                            <p className="text-sm font-semibold text-slate-600">Drag & drop files here</p>
                            <p className="text-xs text-slate-400 mt-1">or click to browse · max {config.max_file_count || 5} files · 50 MB each</p>
                            {config.accepted_types?.length > 0 && (
                              <p className="text-xs text-slate-400 mt-1">Accepted: {config.accepted_types.join(', ')}</p>
                            )}
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            accept={config.accepted_types?.join(',') || undefined}
                            onChange={e => { if (e.target.files) handleUploadFiles(e.target.files); e.target.value = ''; }}
                          />

                          {/* Upload progress */}
                          {uploadingFiles.map(u => (
                            <div key={u.name} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="w-4 h-4 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                              <span className="text-xs text-slate-600 flex-1 truncate">Uploading {u.name}…</span>
                            </div>
                          ))}

                          {/* Uploaded files */}
                          {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100">
                              <span className="text-slate-500">{getFileIcon(f.mime_type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">{f.name}</p>
                                <p className="text-[10px] text-slate-400">{formatBytes(f.size)}</p>
                              </div>
                              <a href={f.url} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-blue-500">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-rose-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}

                          {files.length === 0 && uploadingFiles.length === 0 && (
                            <p className="text-xs text-slate-400 text-center">No files added yet</p>
                          )}
                        </motion.div>
                      )}

                      {/* Links tab */}
                      {activeTab === 'links' && (
                        <motion.div key="links" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                          <p className="text-xs text-slate-500">Add URLs to GitHub, Figma, Google Drive, YouTube, or any other link.</p>
                          {links.map((l, i) => (
                            <div key={i} className="flex gap-2">
                              <div className="flex-1 space-y-1.5">
                                <div className="relative">
                                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                  <input
                                    value={l.url}
                                    onChange={e => setLinks(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                                    placeholder="https://..."
                                    className={cn('w-full pl-9 pr-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400',
                                      l.url && !isValidUrl(l.url) ? 'border-rose-300 bg-rose-50' : 'border-slate-200')}
                                  />
                                </div>
                                <input
                                  value={l.label}
                                  onChange={e => setLinks(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                                  placeholder="Label (optional)"
                                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                />
                              </div>
                              {links.length > 1 && (
                                <button onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))} className="p-2 self-start mt-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50">
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => setLinks(prev => [...prev, { url: '', label: '' }])} className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1">
                            + Add another link
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex gap-2">
                        {submission && (
                          <button onClick={() => { setShowForm(false); setAnswer(submission.content || ''); setFiles(submission.file_urls || []); setLinks(submission.link_urls?.length ? submission.link_urls : [{ url: '', label: '' }]); }}
                            className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={handleSaveDraft}
                          disabled={savingDraft}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingDraft ? 'Saving…' : 'Save Draft'}
                        </button>
                      </div>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:opacity-90 transition-opacity disabled:opacity-40 shadow-md shadow-teal-200/50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {submitting ? 'Submitting…' : submission ? 'Update Submission' : 'Submit Assignment'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Not submitted — show start button */}
            {canSubmit && !submission && !showForm && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:opacity-90 shadow-lg shadow-teal-200/50 transition-opacity flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />Start Submission
                </button>
              </motion.div>
            )}

            {/* Action links */}
            <div className="flex flex-wrap gap-3 pb-6">
              {assignment.course_id && (
                <Link to={`/student/courses/${assignment.course_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm">
                  <BookOpen className="w-4 h-4" />Open course
                </Link>
              )}
              <Link to="/student/assignments"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm">
                <Calendar className="w-4 h-4" />All assignments
              </Link>
            </div>
          </>
        )}
      </div>
    </StudentLayout>
  );
}
