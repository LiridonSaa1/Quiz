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
import {
  Award, Plus, Search, CheckCircle2, XCircle,
  X, Pencil, Trash2, Eye,
  Hash, Calendar, Download,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { format } from 'date-fns';

type CertStatus = 'issued' | 'revoked';
type CertTemplate = 'classic' | 'modern' | 'minimal';

interface Certificate {
  id: string;
  student_id: string;
  course_id: string | null;
  title: string;
  issued_at: string;
  certificate_number: string;
  grade: string | null;
  score: number | null;
  status: CertStatus;
  created_at: string;
  student?: { display_name: string; email: string } | null;
  course?: { title: string } | null;
}

interface Course { id: string; title: string }
interface StudentRec { id: string; display_name: string; email: string }
interface StudentApiRow { uid?: string; id?: string; displayName?: string; display_name?: string; email?: string; teacherId?: string }

const STATUS_CFG: Record<CertStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  issued:  { label: 'Issued',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  revoked: { label: 'Revoked', bg: 'bg-rose-50',    text: 'text-rose-700',   dot: 'bg-rose-500',    icon: XCircle     },
};

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-700 bg-emerald-50',
  'A':  'text-emerald-700 bg-emerald-50',
  'A-': 'text-emerald-600 bg-emerald-50',
  'B+': 'text-blue-700 bg-blue-50',
  'B':  'text-blue-700 bg-blue-50',
  'B-': 'text-blue-600 bg-blue-50',
  'C+': 'text-amber-700 bg-amber-50',
  'C':  'text-amber-700 bg-amber-50',
  'D':  'text-orange-700 bg-orange-50',
  'F':  'text-rose-700 bg-rose-50',
};

const AVATAR_COLORS = [
  'from-yellow-400 to-amber-500',
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-teal-500 to-cyan-600',
  'from-emerald-500 to-green-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const generateCertNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CERT-${year}-${rand}`;
};

const emptyForm = {
  student_id: '', course_id: '', title: '', issued_at: new Date().toISOString().substring(0, 10),
  certificate_number: generateCertNumber(), grade: '', score: '', status: 'issued' as CertStatus,
  template: 'classic' as CertTemplate,
};

export default function TeacherCertificates() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<StudentRec[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<CertTemplate>('classic');

  const TEMPLATE_OPTIONS: Array<{ id: CertTemplate; label: string }> = [
    { id: 'classic', label: 'Classic Gold' },
    { id: 'modern', label: 'Modern Indigo' },
    { id: 'minimal', label: 'Minimal Clean' },
  ];

  const templateClass = (t: CertTemplate) => {
    if (t === 'modern') return 'from-indigo-100 via-violet-50 to-fuchsia-100';
    if (t === 'minimal') return 'from-slate-100 via-white to-slate-50';
    return 'from-amber-100 via-yellow-50 to-orange-100';
  };

  const renderCertificateHtml = (cert: Certificate, template: CertTemplate) => {
    const gradeHtml = cert.grade
      ? `<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#059669;">${cert.grade}</div><div style="font-size:12px;color:#64748b;">Grade</div></div>`
      : '';
    const scoreHtml = cert.score !== null
      ? `<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#2563eb;">${cert.score}%</div><div style="font-size:12px;color:#64748b;">Score</div></div>`
      : '';

    const bg =
      template === 'modern'
        ? 'linear-gradient(135deg, #e0e7ff 0%, #f5f3ff 45%, #fae8ff 100%)'
        : template === 'minimal'
          ? 'linear-gradient(135deg, #f1f5f9 0%, #ffffff 55%, #f8fafc 100%)'
          : 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 45%, #fde68a 100%)';

    const accent = template === 'modern' ? '#4f46e5' : template === 'minimal' ? '#334155' : '#d97706';
    const subtitle = template === 'modern' ? 'Excellence Recognition' : template === 'minimal' ? 'Official Completion Record' : 'Certificate of Achievement';
    const titleLen = String(cert.title || '').trim().length;
    const titleSize = titleLen > 58 ? 42 : titleLen > 44 ? 50 : 58;
    const studentLen = String(cert.student?.display_name || '').trim().length;
    const studentSize = studentLen > 24 ? 44 : 50;

    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Certificate ${cert.certificate_number}</title>
    <style>
      @page { size: A4 landscape; margin: 0; }
      html, body { margin: 0; padding: 0; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
      .toolbar {
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 10;
        display: flex;
        gap: 8px;
      }
      .toolbar button {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #0f172a;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .toolbar button.primary {
        background: #16a34a;
        color: #ffffff;
        border-color: #16a34a;
      }
      @media print {
        .toolbar { display: none !important; }
      }
    </style>
  </head>
  <body style="padding:18px;background:#e2e8f0;font-family:Inter,Arial,sans-serif;">
    <div class="toolbar">
      <button class="primary" onclick="window.print()">Print / Save PDF</button>
      <button onclick="window.close()">Close</button>
    </div>
    <div style="max-width:960px;margin:0 auto;background:${bg};border:2px solid ${accent};border-radius:20px;padding:48px;position:relative;box-shadow:0 24px 60px rgba(15,23,42,0.18);">
      <div style="position:absolute;inset:10px;border:1px solid ${accent};opacity:0.35;border-radius:16px;pointer-events:none;"></div>
      <div style="position:absolute;top:18px;left:18px;width:42px;height:42px;border-top:3px solid ${accent};border-left:3px solid ${accent};border-radius:10px;"></div>
      <div style="position:absolute;top:18px;right:18px;width:42px;height:42px;border-top:3px solid ${accent};border-right:3px solid ${accent};border-radius:10px;"></div>
      <div style="position:absolute;bottom:18px;left:18px;width:42px;height:42px;border-bottom:3px solid ${accent};border-left:3px solid ${accent};border-radius:10px;"></div>
      <div style="position:absolute;bottom:18px;right:18px;width:42px;height:42px;border-bottom:3px solid ${accent};border-right:3px solid ${accent};border-radius:10px;"></div>
      <div style="text-align:center;position:relative;">
        <div style="display:inline-flex;align-items:center;gap:10px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.75);border:1px solid rgba(15,23,42,0.12);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${accent};font-weight:800;">${subtitle}</div>
        <div style="margin-top:14px;font-size:12px;color:#475569;letter-spacing:0.08em;text-transform:uppercase;">Presented To</div>
        <h1 style="margin:10px 0 0 0;font-size:${studentSize}px;line-height:1.08;color:#0f172a;font-family:Georgia,'Times New Roman',serif;">${cert.student?.display_name || 'Student Name'}</h1>
        <div style="margin-top:14px;font-size:13px;color:#64748b;">for outstanding performance and successful completion of</div>
        <h2 style="margin:10px auto 0 auto;font-size:${titleSize}px;line-height:1.15;color:${accent};font-family:Georgia,'Times New Roman',serif;max-width:1080px;word-break:break-word;overflow-wrap:anywhere;">${cert.title}</h2>
        ${cert.course?.title ? `<div style="margin-top:8px;color:#475569;">${cert.course.title}</div>` : ''}
        <div style="display:flex;gap:32px;justify-content:center;margin-top:24px;">${gradeHtml}${scoreHtml}</div>
        <div style="display:flex;align-items:end;justify-content:space-between;margin-top:34px;padding-top:18px;border-top:1px solid #cbd5e1;">
          <div style="text-align:left;font-size:12px;color:#64748b;">
            Issued on ${format(new Date(cert.issued_at), 'MMMM d, yyyy')}<br/>
            <span style="font-family:ui-monospace,Menlo,Consolas,monospace;">${cert.certificate_number}</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
            <div style="width:84px;height:84px;border-radius:999px;background:radial-gradient(circle at 30% 30%, ${template === 'modern' ? '#818cf8,#4f46e5' : template === 'minimal' ? '#94a3b8,#334155' : '#f59e0b,#b45309'});box-shadow:inset 0 0 0 3px rgba(255,255,255,0.55),0 10px 24px rgba(15,23,42,0.22);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;font-weight:800;">★</div>
            <div style="font-size:11px;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;">Verified</div>
          </div>
          <div style="text-align:right;">
            <div style="width:180px;border-top:2px solid #94a3b8;margin-left:auto;"></div>
            <div style="font-size:11px;color:#64748b;margin-top:6px;">Authorized Signature</div>
          </div>
        </div>
      </div>
    </div>
    <script>window.focus();</script>
  </body>
</html>`;
  };

  const downloadCertificate = (cert: Certificate, template: CertTemplate) => {
    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups for print preview.');
      return;
    }
    win.document.open();
    win.document.write(renderCertificateHtml(cert, template));
    win.document.close();
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setCerts([]);
        setCourses([]);
        setStudents([]);
        return;
      }
      const tid = session.user.id;
      const teacherIds = await resolveTeacherIdCandidates(tid);

      const [{ data: rawCerts, error }, { data: c }, teacherStudentsPayload] = await Promise.all([
        supabase.from('certificates').select('*').order('issued_at', { ascending: false }),
        supabase.from('courses').select('id,title,status').in('teacher_id', teacherIds),
        authFetch(`/api/teacher/students?userId=${encodeURIComponent(tid)}`).then(async (r) => {
          const json = await r.json().catch(() => null);
          return r.ok && json?.success && Array.isArray(json.students) ? json.students : null;
        }).catch(() => null),
      ]);
      if (error) throw error;

      let s: StudentRec[] = [];
      if (Array.isArray(teacherStudentsPayload) && teacherStudentsPayload.length > 0) {
        s = teacherStudentsPayload.map((row: StudentApiRow) => ({
          id: String(row.uid || row.id || ''),
          display_name: String(row.displayName || row.display_name || ''),
          email: String(row.email || ''),
        })).filter((row) => row.id && row.display_name);
      } else {
        const { data: directStudents } = await supabase
          .from('profiles')
          .select('id,display_name,email')
          .eq('role', 'student')
          .eq('teacher_id', tid);
        s = (directStudents || []) as StudentRec[];
      }

      let courseList = (c || []) as Array<{ id: string; title: string; status?: string }>;
      if (courseList.length === 0) {
        const coursesRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(tid)}`);
        if (coursesRes.ok) {
          const json = await coursesRes.json().catch(() => null);
          if (json?.success && Array.isArray(json.courses)) {
            courseList = json.courses.map((row: any) => ({
              id: String(row.id),
              title: String(row.title || row.name || 'Untitled'),
              status: row.status ? String(row.status) : undefined,
            }));
          }
        }
      }
      const courseOptions = courseList.filter((course) => course.status !== 'archived');
      const courseIdSet = new Set(courseList.map((course: any) => course.id));
      const studentIdSet = new Set(s.map((p) => p.id));

      const scoped = (rawCerts || []).filter((cert: any) => {
        if (cert.course_id) return courseIdSet.has(cert.course_id);
        return !cert.course_id && studentIdSet.has(cert.student_id);
      });

      const courseMap: Record<string, string> = {};
      courseList.forEach((course: any) => { courseMap[course.id] = course.title; });

      const studentMap: Record<string, { display_name: string; email: string }> = {};
      (s || []).forEach((p: any) => { studentMap[p.id] = { display_name: p.display_name, email: p.email }; });

      const enriched = scoped.map((cert: any) => ({
        ...cert,
        student: cert.student_id ? (studentMap[cert.student_id] || null) : null,
        course: cert.course_id ? (courseMap[cert.course_id] ? { title: courseMap[cert.course_id] } : null) : null,
      }));

      setCerts(enriched);
      setCourses(courseOptions.map((course) => ({ id: course.id, title: course.title })));
      setStudents(s || []);
    } catch {
      toast.error('Failed to load certificates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = certs.filter(c => {
    const q = search.toLowerCase();
    const name = c.student?.display_name || '';
    const course = c.course?.title || '';
    const certNum = c.certificate_number || '';
    const matchSearch = name.toLowerCase().includes(q) || course.toLowerCase().includes(q) || certNum.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchCourse = courseFilter === 'all' || c.course_id === courseFilter;
    return matchSearch && matchStatus && matchCourse;
  });

  const stats = [
    { label: 'Total Issued', value: certs.length, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25', icon: Award },
    { label: 'Active', value: certs.filter(c => c.status === 'issued').length, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: CheckCircle2 },
    { label: 'Revoked', value: certs.filter(c => c.status === 'revoked').length, gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/25', icon: XCircle },
    { label: 'This Month', value: certs.filter(c => { const d = new Date(c.issued_at); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length, gradient: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25', icon: Calendar },
  ];

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, certificate_number: generateCertNumber() });
    setShowModal(true);
  };

  const openEdit = (c: Certificate) => {
    setEditId(c.id);
    setForm({
      student_id: c.student_id,
      course_id: c.course_id || '',
      title: c.title,
      issued_at: c.issued_at.substring(0, 10),
      certificate_number: c.certificate_number,
      grade: c.grade || '',
      score: c.score !== null ? String(c.score) : '',
      status: c.status,
      template: 'classic',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.student_id) { toast.error('Student is required'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.certificate_number.trim()) { toast.error('Certificate number is required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        student_id: form.student_id,
        course_id: form.course_id || null,
        title: form.title.trim(),
        issued_at: form.issued_at,
        certificate_number: form.certificate_number.trim(),
        grade: form.grade || null,
        score: form.score !== '' ? Number(form.score) : null,
        status: form.status,
      };
      if (editId) {
        const { error } = await supabase.from('certificates').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('Certificate updated');
      } else {
        payload.created_at = new Date().toISOString();
        const { data: inserted, error } = await supabase
          .from('certificates')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        toast.success('Certificate issued');

        // Fan out an in-app notification to the student, this teacher (issuer),
        // and all admins — gated by the admin Settings → "Certificate Issued" toggle.
        try {
          const courseTitle = courses.find(c => c.id === form.course_id)?.title;
          await authFetch('/api/notifications/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'certificateIssued',
              ctx: {
                studentId: form.student_id,
                courseId: form.course_id || undefined,
                courseTitle,
                certificateId: inserted?.id,
                certificateNumber: payload.certificate_number,
              },
            }),
          });
        } catch {
          // Notifications are best-effort — don't fail issuance if dispatch fails.
        }
      }
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('certificates').delete().eq('id', id);
      if (error) throw error;
      toast.success('Certificate deleted');
      setDeleteId(null);
      fetchData();
    } catch { toast.error('Failed to delete'); }
  };

  const toggleStatus = async (cert: Certificate) => {
    const newStatus: CertStatus = cert.status === 'issued' ? 'revoked' : 'issued';
    try {
      const { error } = await supabase.from('certificates').update({ status: newStatus }).eq('id', cert.id);
      if (error) throw error;
      toast.success(`Certificate ${newStatus}`);
      fetchData();
    } catch { toast.error('Failed to update status'); }
  };

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Certificates"
        title="Certificates"
        description="Issue and manage student achievement certificates."
        action={
          <motion.button
            type="button"
            onClick={openAdd}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
              boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Plus className="w-4 h-4" />
            Issue Certificate
          </motion.button>
        }
        stats={stats}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search student, course, certificate #..."
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Status</option>
              <option value="issued">Issued</option>
              <option value="revoked">Revoked</option>
            </select>
            <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </AdminListFilterBar>
        }
      >
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <Award className="w-10 h-10 opacity-30" />
            <p className="text-sm">No certificates found</p>
            <button type="button" onClick={openAdd} className="text-xs text-indigo-600 font-semibold hover:underline">Issue the first one</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(cert => {
                const sc = STATUS_CFG[cert.status];
                const name = cert.student?.display_name || 'Unknown';
                const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                const gradeColor = cert.grade ? (GRADE_COLORS[cert.grade] || 'text-slate-600 bg-slate-100') : null;
                return (
                  <div key={cert.id} className={ADMIN_LIST_ITEM_CARD}>
                    <div className="flex items-start gap-3">
                      <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold shrink-0', getAvatarColor(name))}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm">{name}</p>
                        <p className="text-xs text-slate-400 truncate">{cert.student?.email}</p>
                        <p className="text-sm font-medium text-slate-800 mt-2">{cert.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => toggleStatus(cert)}
                            className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity hover:opacity-80', sc.bg, sc.text)}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                            {sc.label}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">Number</span>
                        <span className="flex items-center gap-1 text-right font-mono text-[11px]"><Hash className="w-3 h-3 shrink-0" />{cert.certificate_number}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Course</span>
                        <span className="text-right truncate">{cert.course?.title || '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2 items-center">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Grade</span>
                        <span className="flex items-center gap-2">
                          {cert.grade && gradeColor && (
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', gradeColor)}>{cert.grade}</span>
                          )}
                          {cert.score !== null && <span>{cert.score}%</span>}
                          {!cert.grade && cert.score === null ? '—' : null}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 items-center">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider">Issued</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {format(new Date(cert.issued_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-1 mt-4 pt-3 border-t border-slate-50">
                      <button type="button" onClick={() => setPreviewCert(cert)} className="p-2 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Preview">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => downloadCertificate(cert, 'classic')} className="p-2 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" title="Download / Print">
                        <Download className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => openEdit(cert)} className="p-2 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setDeleteId(cert.id)} className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
              Showing {filtered.length} of {certs.length} certificates
            </div>
          </div>
        )}
      </AdminListPageShell>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Award className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">{editId ? 'Edit Certificate' : 'Issue Certificate'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Student *</label>
                <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.display_name} ({s.email})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Certificate Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="e.g. Certificate of Completion" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Course</label>
                <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                  <option value="">No course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Design Template</label>
                <select
                  value={form.template}
                  onChange={e => setForm(f => ({ ...f, template: e.target.value as CertTemplate }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  {TEMPLATE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Grade</label>
                  <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    <option value="">No grade</option>
                    {['A+','A','A-','B+','B','B-','C+','C','D','F'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Score (%)</label>
                  <input type="number" min={0} max={100} value={form.score} onChange={e => setForm(f => ({ ...f, score: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    placeholder="0–100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Issue Date</label>
                  <input type="date" value={form.issued_at} onChange={e => setForm(f => ({ ...f, issued_at: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CertStatus }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    <option value="issued">Issued</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Certificate Number *</label>
                <div className="flex gap-2 mt-1">
                  <input value={form.certificate_number} onChange={e => setForm(f => ({ ...f, certificate_number: e.target.value }))}
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 font-mono"
                    placeholder="CERT-2026-XXXXXX" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, certificate_number: generateCertNumber() }))}
                    className="px-3 py-2.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors font-medium">
                    Generate
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button type="button" onClick={() => {
                const cert: Certificate = {
                  id: 'preview',
                  student_id: form.student_id,
                  course_id: form.course_id || null,
                  title: form.title || 'Certificate of Completion',
                  issued_at: form.issued_at || new Date().toISOString().substring(0, 10),
                  certificate_number: form.certificate_number || generateCertNumber(),
                  grade: form.grade || null,
                  score: form.score !== '' ? Number(form.score) : null,
                  status: form.status,
                  created_at: new Date().toISOString(),
                  student: students.find(s => s.id === form.student_id) || null,
                  course: form.course_id ? ({ title: (courses.find(c => c.id === form.course_id)?.title || '') }) : null,
                };
                downloadCertificate(cert, form.template);
              }}
                className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
              >
                Download Sample
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editId ? 'Update' : 'Issue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewCert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-600">Certificate Preview</span>
              <button onClick={() => setPreviewCert(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className={cn("p-8 bg-gradient-to-br relative overflow-hidden", templateClass(previewTemplate))}>
              <div className="absolute inset-3 border-2 border-amber-200 rounded-xl pointer-events-none" />
              <div className="absolute inset-4 border border-amber-100 rounded-xl pointer-events-none" />
              <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-amber-400 rounded-tl-lg" />
              <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-amber-400 rounded-tr-lg" />
              <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-amber-400 rounded-bl-lg" />
              <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-amber-400 rounded-br-lg" />

              <div className="relative text-center py-4 px-6">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-200 ring-4 ring-white/70">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-[0.28em] mb-1">Certificate of Excellence</p>
                <p className="text-xs text-slate-500 mb-3">Presented to</p>
                <h2 className="text-4xl font-bold text-slate-800 mb-2 tracking-tight" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{previewCert.student?.display_name || 'Student Name'}</h2>
                <p className="text-xs text-slate-500 mb-3">for outstanding completion of</p>
                <h3 className="text-2xl font-semibold text-amber-700 mb-2" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{previewCert.title}</h3>
                {previewCert.course?.title && (
                  <p className="text-sm text-slate-500 mb-4">{previewCert.course.title}</p>
                )}
                <div className="flex items-center justify-center gap-6 mb-4">
                  {previewCert.grade && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-600">{previewCert.grade}</div>
                      <div className="text-xs text-slate-400">Grade</div>
                    </div>
                  )}
                  {previewCert.score !== null && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{previewCert.score}%</div>
                      <div className="text-xs text-slate-400">Score</div>
                    </div>
                  )}
                </div>
                <div className="border-t border-amber-200 pt-4 mt-2">
                  <p className="text-xs text-slate-400">
                    Issued on {format(new Date(previewCert.issued_at), 'MMMM d, yyyy')}
                  </p>
                  <p className="text-xs font-mono text-slate-400 mt-1">{previewCert.certificate_number}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border-t border-slate-100">
              <select
                value={previewTemplate}
                onChange={(e) => setPreviewTemplate(e.target.value as CertTemplate)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {TEMPLATE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => downloadCertificate(previewCert, previewTemplate)} className="px-4 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg inline-flex items-center gap-1.5">
                  <Download className="w-4 h-4" /> Download
                </button>
              <button onClick={() => setPreviewCert(null)} className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Delete Certificate?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
