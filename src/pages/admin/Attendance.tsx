import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { toast } from 'sonner';
import GenderAvatar from '../../components/ui/GenderAvatar';
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
  CalendarCheck, Plus, Search, CheckCircle2,
  XCircle, Clock, AlertTriangle, X, Pencil, Trash2, Calendar
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceRecord {
  id: string;
  class_id: string | null;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  notes: string | null;
  marked_by: string | null;
  created_at: string;
  student?: { display_name: string; email: string } | null;
  class?: { name: string } | null;
  marker?: { display_name: string } | null;
}

interface ClassRec { id: string; name: string }
interface StudentRec { id: string; display_name: string; email: string }

const STATUS_CFG: Record<AttendanceStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  present: { label: 'Present', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  absent:  { label: 'Absent',  bg: 'bg-rose-50',    text: 'text-rose-700',   dot: 'bg-rose-500',    icon: XCircle     },
  late:    { label: 'Late',    bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500',   icon: Clock       },
  excused: { label: 'Excused', bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',    icon: AlertTriangle },
};

const AVATAR_COLORS = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const emptyForm = {
  class_id: '', student_id: '', date: new Date().toISOString().substring(0, 10),
  status: 'present' as AttendanceStatus, notes: '', marked_by: '',
};

export default function AdminAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassRec[]>([]);
  const [students, setStudents] = useState<StudentRec[]>([]);
  const [teachers, setTeachers] = useState<StudentRec[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: rawData, error }, { data: cls }, { data: stu }, { data: tch }, { data: studentRows }] = await Promise.all([
        supabase.from('attendance').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(200),
        supabase.from('classes').select('id,name'),
        supabase.from('profiles').select('id,display_name,email').eq('role', 'student'),
        supabase.from('profiles').select('id,display_name,email').in('role', ['teacher', 'admin']),
        supabase.from('students').select('id,user_id'),
      ]);
      if (error) throw error;

      const classMap: Record<string, string> = {};
      (cls || []).forEach((c: any) => { classMap[c.id] = c.name; });
      const studentMap: Record<string, { display_name: string; email: string }> = {};
      (stu || []).forEach((p: any) => { studentMap[p.id] = { display_name: p.display_name, email: p.email }; });
      const studentProfileIdByStudentId: Record<string, string> = {};
      (studentRows || []).forEach((s: any) => {
        if (s.id && s.user_id) studentProfileIdByStudentId[s.id] = s.user_id;
      });
      const teacherMap: Record<string, string> = {};
      (tch || []).forEach((p: any) => { teacherMap[p.id] = p.display_name; });

      setRecords((rawData || []).map((r: any) => ({
        ...r,
        student: (() => {
          if (!r.student_id) return null;
          const profileId = studentMap[r.student_id] ? r.student_id : studentProfileIdByStudentId[r.student_id];
          return profileId ? (studentMap[profileId] || null) : null;
        })(),
        class: r.class_id ? { name: classMap[r.class_id] } : null,
        marker: r.marked_by ? { display_name: teacherMap[r.marked_by] } : null,
      })));

      setClasses(cls || []);
      setStudents(stu || []);
      setTeachers(tch || []);
    } catch {
      toast.error('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const name = r.student?.display_name || '';
    const email = r.student?.email || '';
    const cls = r.class?.name || '';
    const matchSearch = name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || cls.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchClass = classFilter === 'all' || r.class_id === classFilter;
    return matchSearch && matchStatus && matchClass;
  });

  const attendanceRate = records.length > 0
    ? Math.round((records.filter(r => r.status === 'present').length / records.length) * 100)
    : 0;

  const stats = [
    { label: 'Total Records', value: records.length, gradient: 'from-sky-500 to-cyan-600', shadow: 'shadow-sky-500/25', icon: CalendarCheck },
    { label: 'Present', value: records.filter(r => r.status === 'present').length, gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: CheckCircle2 },
    { label: 'Absent', value: records.filter(r => r.status === 'absent').length, gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/25', icon: XCircle },
    { label: 'Late / Excused', value: records.filter(r => r.status === 'late' || r.status === 'excused').length, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25', icon: Clock },
  ];

  const rateAppend = (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
      }}
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/25"
      style={{ boxShadow: '0 8px 24px var(--tw-shadow-color, rgba(0,0,0,0.12))' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-extrabold tracking-tight">{attendanceRate}%</div>
          <div className="text-xs font-semibold text-white/75 mt-1">Attendance rate</div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
          <CalendarCheck className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="w-full mt-3 bg-white/20 rounded-full h-1.5 overflow-hidden">
        <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${attendanceRate}%` }} />
      </div>
      <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
    </motion.div>
  );

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (r: AttendanceRecord) => {
    setEditId(r.id);
    setForm({
      class_id: r.class_id || '',
      student_id: r.student_id,
      date: r.date.substring(0, 10),
      status: r.status,
      notes: r.notes || '',
      marked_by: r.marked_by || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.student_id) { toast.error('Student is required'); return; }
    if (!form.date) { toast.error('Date is required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        class_id: form.class_id || null,
        student_id: form.student_id,
        date: form.date,
        status: form.status,
        notes: form.notes || null,
        marked_by: form.marked_by || null,
      };
      if (editId) {
        const { error } = await supabase.from('attendance').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('Attendance updated');
      } else {
        payload.created_at = new Date().toISOString();
        const { error } = await supabase.from('attendance').insert(payload);
        if (error) throw error;
        toast.success('Attendance marked');
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
      const { error } = await supabase.from('attendance').delete().eq('id', id);
      if (error) throw error;
      toast.success('Record deleted');
      setDeleteId(null);
      fetchData();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <AdminLayout>
      <AdminListPageShell
        breadcrumbLabel="Attendance"
        title="Attendance"
        description="Track and manage student attendance records."
        statsGridClassName="grid grid-cols-2 lg:grid-cols-5 gap-4"
        stats={stats}
        statsAppend={rateAppend}
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
            Mark Attendance
          </motion.button>
        }
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students or classes..."
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="excused">Excused</option>
            </select>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className={ADMIN_LIST_SELECT}>
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </AdminListFilterBar>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <CalendarCheck className="w-10 h-10 opacity-30" />
              <p className="text-sm">No attendance records found</p>
              <button type="button" onClick={openAdd} className="text-xs text-indigo-600 font-semibold hover:underline">Mark attendance now</button>
            </div>
          ) : (
            <>
              <div className={ADMIN_LIST_CARD_GRID}>
                {filtered.map(r => {
                  const sc = STATUS_CFG[r.status];
                  const name = r.student?.display_name || 'Unknown';
                  return (
                    <div key={r.id} className={ADMIN_LIST_ITEM_CARD} style={{ borderLeftWidth: '4px', borderLeftColor: r.status === 'present' ? '#10b981' : r.status === 'absent' ? '#f43f5e' : r.status === 'late' ? '#f59e0b' : '#6366f1' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <GenderAvatar name={name} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
                            <p className="text-xs text-slate-400 truncate">{r.student?.email}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button type="button" onClick={() => openEdit(r)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteId(r.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', sc.bg, sc.text)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                          {sc.label}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 text-xs border-t border-slate-100 pt-3 text-slate-600">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Class</span>
                          <span className="text-right truncate">{r.class?.name || '—'}</span>
                        </div>
                        <div className="flex justify-between gap-2 items-center">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Date</span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {format(new Date(r.date), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Marked by</span>
                          <span className="text-right truncate">{r.marker?.display_name || '—'}</span>
                        </div>
                        {r.notes && (
                          <div className="text-slate-500 pt-1 border-t border-slate-50">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">Notes</span>
                            {r.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
                Showing {filtered.length} of {records.length} records
              </div>
            </>
          )}
        </div>
      </AdminListPageShell>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{editId ? 'Edit Record' : 'Mark Attendance'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Student *</label>
                <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30">
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.display_name} ({s.email})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Class</label>
                <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30">
                  <option value="">No class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Date *</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AttendanceStatus }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30">
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                    <option value="excused">Excused</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30 resize-none"
                  placeholder="Optional notes..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Marked By (Teacher)</label>
                <select value={form.marked_by} onChange={e => setForm(f => ({ ...f, marked_by: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30">
                  <option value="">Not specified</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editId ? 'Update' : 'Mark'}
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
            <h3 className="text-lg font-bold text-slate-800 mb-1">Delete Record?</h3>
            <p className="text-sm text-slate-500 mb-5">This attendance record will be permanently removed.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
