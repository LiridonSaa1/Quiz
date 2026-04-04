import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { supabase } from '../../supabase';
import {
  Award, Plus, Search, CheckCircle2, XCircle,
  X, Pencil, Trash2, Eye, BookOpen,
  Hash, Calendar, RotateCcw, GraduationCap, Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

type CertStatus = 'issued' | 'revoked';

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

const STATUS_CFG: Record<CertStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  issued:  { label: 'Issued',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  revoked: { label: 'Revoked', bg: 'bg-rose-50',    text: 'text-rose-700',   dot: 'bg-rose-500',    icon: XCircle     },
};

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-700 bg-emerald-50', 'A': 'text-emerald-700 bg-emerald-50', 'A-': 'text-emerald-600 bg-emerald-50',
  'B+': 'text-blue-700 bg-blue-50',       'B': 'text-blue-700 bg-blue-50',       'B-': 'text-blue-600 bg-blue-50',
  'C+': 'text-amber-700 bg-amber-50',     'C': 'text-amber-700 bg-amber-50',
  'D':  'text-orange-700 bg-orange-50',   'F': 'text-rose-700 bg-rose-50',
};

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-indigo-600',
  'from-rose-500 to-pink-600',     'from-teal-500 to-cyan-600',
  'from-emerald-500 to-green-600', 'from-amber-500 to-orange-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};
const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const generateCertNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CERT-${year}-${rand}`;
};

const emptyForm = {
  student_id: '', course_id: '', title: '',
  issued_at: new Date().toISOString().substring(0, 10),
  certificate_number: generateCertNumber(),
  grade: '', score: '', status: 'issued' as CertStatus,
};

export default function TeacherCertificates() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('');
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

  const fetchData = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const [certsRes, coursesRes, studentsRes, profileRes] = await Promise.all([
        supabase.from('certificates').select('*').order('issued_at', { ascending: false }),
        supabase.from('courses').select('id,title').eq('teacher_id', tid),
        supabase.from('profiles').select('id,display_name,email').eq('teacher_id', tid).eq('role', 'student'),
        supabase.from('profiles').select('display_name').eq('id', tid).single(),
      ]);

      if (certsRes.error) throw certsRes.error;

      const courseIds = new Set((coursesRes.data || []).map((c: any) => c.id));
      const studentIds = new Set((studentsRes.data || []).map((s: any) => s.id));

      const courseMap: Record<string, string> = {};
      (coursesRes.data || []).forEach((c: any) => { courseMap[c.id] = c.title; });
      const studentMap: Record<string, { display_name: string; email: string }> = {};
      (studentsRes.data || []).forEach((p: any) => { studentMap[p.id] = { display_name: p.display_name, email: p.email }; });

      // Show certs that belong to this teacher's students or courses
      const enriched = (certsRes.data || [])
        .filter((cert: any) => studentIds.has(cert.student_id) || (cert.course_id && courseIds.has(cert.course_id)))
        .map((cert: any) => ({
          ...cert,
          student: cert.student_id ? (studentMap[cert.student_id] || null) : null,
          course: cert.course_id ? (courseMap[cert.course_id] ? { title: courseMap[cert.course_id] } : null) : null,
        }));

      setCerts(enriched);
      setCourses(coursesRes.data || []);
      setStudents(studentsRes.data || []);
      if (profileRes.data) setTeacherName(profileRes.data.display_name || '');
    } catch {
      toast.error('Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setTeacherId(session.user.id);
        fetchData(session.user.id);
      }
    });
  }, [fetchData]);

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
    { label: 'Total Issued', value: certs.length, icon: Award, iconBg: 'bg-violet-100 text-violet-600', grad: 'from-violet-500 to-purple-500', ring: 'ring-violet-100' },
    { label: 'Active', value: certs.filter(c => c.status === 'issued').length, icon: CheckCircle2, iconBg: 'bg-emerald-100 text-emerald-600', grad: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-100' },
    { label: 'Revoked', value: certs.filter(c => c.status === 'revoked').length, icon: XCircle, iconBg: 'bg-rose-100 text-rose-600', grad: 'from-rose-500 to-pink-500', ring: 'ring-rose-100' },
    {
      label: 'This Month',
      value: certs.filter(c => {
        const d = new Date(c.issued_at); const n = new Date();
        return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      }).length,
      icon: Calendar, iconBg: 'bg-sky-100 text-sky-600', grad: 'from-sky-500 to-cyan-500', ring: 'ring-sky-100'
    },
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
        const { error } = await supabase.from('certificates').insert(payload);
        if (error) throw error;
        toast.success('Certificate issued successfully');
      }
      setShowModal(false);
      if (teacherId) fetchData(teacherId);
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
      if (teacherId) fetchData(teacherId);
    } catch { toast.error('Failed to delete'); }
  };

  const toggleStatus = async (cert: Certificate) => {
    const newStatus: CertStatus = cert.status === 'issued' ? 'revoked' : 'issued';
    try {
      const { error } = await supabase.from('certificates').update({ status: newStatus }).eq('id', cert.id);
      if (error) throw error;
      toast.success(`Certificate ${newStatus}`);
      if (teacherId) fetchData(teacherId);
    } catch { toast.error('Failed to update status'); }
  };

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Certificates</h1>
            <p className="text-sm text-slate-500 mt-0.5">Issue and manage achievement certificates for your students</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-violet-200 transition-all"
          >
            <Plus className="w-4 h-4" />
            Issue Certificate
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search student, course, certificate #..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30">
            <option value="all">All Status</option>
            <option value="issued">Issued</option>
            <option value="revoked">Revoked</option>
          </select>
          <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30">
            <option value="all">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm bg-white rounded-xl border border-slate-200 gap-2">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
            Loading certificates...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 bg-white rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center">
              <Award className="w-8 h-8 text-violet-300" />
            </div>
            <p className="text-sm font-medium">No certificates found</p>
            <button onClick={openAdd} className="text-xs text-violet-600 hover:underline font-semibold">Issue the first certificate</button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Certificate</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Course</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Grade</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Issued</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(cert => {
                      const sc = STATUS_CFG[cert.status];
                      const name = cert.student?.display_name || 'Unknown';
                      const gradeColor = cert.grade ? (GRADE_COLORS[cert.grade] || 'text-slate-600 bg-slate-100') : null;
                      return (
                        <tr key={cert.id} className="hover:bg-slate-50/70 group transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(name))}>
                                {getInitials(name)}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 leading-tight">{name}</div>
                                <div className="text-xs text-slate-400">{cert.student?.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-slate-700">{cert.title}</div>
                            <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                              <Hash className="w-3 h-3" />{cert.certificate_number}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 text-sm">
                            {cert.course?.title || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {cert.grade && gradeColor && (
                                <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', gradeColor)}>{cert.grade}</span>
                              )}
                              {cert.score !== null && <span className="text-xs text-slate-500">{cert.score}%</span>}
                              {!cert.grade && cert.score === null && <span className="text-slate-300">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-slate-600 text-sm">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {format(new Date(cert.issued_at + 'T12:00:00'), 'MMM d, yyyy')}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <button onClick={() => toggleStatus(cert)}
                              className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity hover:opacity-75', sc.bg, sc.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                              {sc.label}
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setPreviewCert(cert)} className="p-1.5 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors" title="Preview">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => openEdit(cert)} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteId(cert.id)} className="p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
                Showing {filtered.length} of {certs.length} certificates
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map(cert => {
                const sc = STATUS_CFG[cert.status];
                const name = cert.student?.display_name || 'Unknown';
                return (
                  <div key={cert.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold shrink-0', getAvatarColor(name))}>
                        {getInitials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{name}</p>
                            <p className="text-xs text-slate-500">{cert.title}</p>
                          </div>
                          <button onClick={() => toggleStatus(cert)}
                            className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0', sc.bg, sc.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                            {sc.label}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
                          {cert.course?.title && <span className="flex items-center gap-0.5"><BookOpen className="w-3 h-3" />{cert.course.title}</span>}
                          <span className="flex items-center gap-0.5"><Hash className="w-3 h-3" />{cert.certificate_number}</span>
                          <span>{format(new Date(cert.issued_at + 'T12:00:00'), 'MMM d, yyyy')}</span>
                          {cert.grade && <span className="font-bold text-emerald-600">{cert.grade}</span>}
                          {cert.score !== null && <span>{cert.score}%</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-1 mt-3">
                      <button onClick={() => setPreviewCert(cert)} className="p-1.5 hover:bg-violet-50 rounded-lg"><Eye className="w-3.5 h-3.5 text-slate-400" /></button>
                      <button onClick={() => openEdit(cert)} className="p-1.5 hover:bg-blue-50 rounded-lg"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
                      <button onClick={() => setDeleteId(cert.id)} className="p-1.5 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-slate-400" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Issue / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                  <Award className="w-4 h-4 text-violet-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">{editId ? 'Edit Certificate' : 'Issue Certificate'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Student *</label>
                <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.display_name} ({s.email})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Certificate Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  placeholder="e.g. Certificate of Completion" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Course</label>
                <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                  <option value="">No course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Grade</label>
                  <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                    <option value="">No grade</option>
                    {['A+','A','A-','B+','B','B-','C+','C','D','F'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Score (%)</label>
                  <input type="number" min={0} max={100} value={form.score} onChange={e => setForm(f => ({ ...f, score: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    placeholder="0–100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Issue Date</label>
                  <input type="date" value={form.issued_at} onChange={e => setForm(f => ({ ...f, issued_at: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CertStatus }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                    <option value="issued">Issued</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Certificate Number *</label>
                <div className="flex gap-2 mt-1">
                  <input value={form.certificate_number} onChange={e => setForm(f => ({ ...f, certificate_number: e.target.value }))}
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                    placeholder="CERT-2025-XXXXXX" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, certificate_number: generateCertNumber() }))}
                    className="px-3 py-2.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors font-medium flex items-center gap-1">
                    <RotateCcw className="w-3.5 h-3.5" /> Generate
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-md shadow-violet-200">
                {saving ? 'Saving...' : editId ? 'Update' : 'Issue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Preview Modal */}
      {previewCert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-semibold text-slate-700">Certificate Preview</span>
              </div>
              <button onClick={() => setPreviewCert(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>

            {/* Certificate Design */}
            <div className="p-8 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 relative overflow-hidden">
              {/* Decorative borders */}
              <div className="absolute inset-3 border-2 border-violet-200 rounded-xl pointer-events-none" />
              <div className="absolute inset-4 border border-violet-100 rounded-xl pointer-events-none" />
              {/* Corner ornaments */}
              <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-violet-400 rounded-tl-lg" />
              <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-violet-400 rounded-tr-lg" />
              <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-violet-400 rounded-bl-lg" />
              <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-violet-400 rounded-br-lg" />
              {/* Subtle background decoration */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-violet-100/40 rounded-full blur-3xl pointer-events-none" />

              <div className="relative text-center py-4 px-6">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-300/50">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <p className="text-xs font-bold text-violet-600 uppercase tracking-[0.3em] mb-1">Certificate of Achievement</p>
                <p className="text-xs text-slate-400 mb-4">This is to certify that</p>
                <h2 className="text-3xl font-bold text-slate-800 mb-1">{previewCert.student?.display_name || 'Student Name'}</h2>
                <p className="text-xs text-slate-400 mb-4">has successfully completed</p>
                <h3 className="text-xl font-semibold text-violet-700 mb-2">{previewCert.title}</h3>
                {previewCert.course?.title && (
                  <p className="text-sm text-slate-500 mb-4 flex items-center justify-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />{previewCert.course.title}
                  </p>
                )}
                {(previewCert.grade || previewCert.score !== null) && (
                  <div className="flex items-center justify-center gap-8 mb-4">
                    {previewCert.grade && (
                      <div className="text-center">
                        <div className="text-3xl font-bold text-emerald-600">{previewCert.grade}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Grade</div>
                      </div>
                    )}
                    {previewCert.score !== null && (
                      <div className="text-center">
                        <div className="text-3xl font-bold text-violet-600">{previewCert.score}%</div>
                        <div className="text-xs text-slate-400 mt-0.5">Score</div>
                      </div>
                    )}
                  </div>
                )}
                <div className="border-t border-violet-200 pt-4 mt-2 space-y-1">
                  <p className="text-xs text-slate-500">
                    Issued on <span className="font-medium">{format(new Date(previewCert.issued_at + 'T12:00:00'), 'MMMM d, yyyy')}</span>
                  </p>
                  {teacherName && (
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5" /> by <span className="font-medium">{teacherName}</span>
                    </p>
                  )}
                  <p className="text-xs font-mono text-slate-400">{previewCert.certificate_number}</p>
                </div>
                {previewCert.status === 'revoked' && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-600 rounded-full text-xs font-bold uppercase tracking-wide">
                    <XCircle className="w-3.5 h-3.5" /> Revoked
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center p-4 border-t border-slate-100">
              <button onClick={() => { setPreviewCert(null); openEdit(previewCert); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => setPreviewCert(null)}
                className="px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors shadow-md shadow-violet-200">
                Close
              </button>
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
            <h3 className="text-lg font-bold text-slate-800 mb-1">Delete Certificate?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 px-4 py-2 text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
