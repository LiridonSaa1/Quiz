import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { toast } from 'sonner';
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
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          student:profiles!student_id(display_name, email),
          class:classes!class_id(name),
          marker:profiles!marked_by(display_name)
        `)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRecords(data || []);

      const [{ data: cls }, { data: stu }, { data: tch }] = await Promise.all([
        supabase.from('classes').select('id,name'),
        supabase.from('profiles').select('id,display_name,email').eq('role', 'student'),
        supabase.from('profiles').select('id,display_name,email').in('role', ['teacher', 'admin']),
      ]);
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

  const stats = [
    { label: 'Total Records', value: records.length, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
    { label: 'Present', value: records.filter(r => r.status === 'present').length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Absent', value: records.filter(r => r.status === 'absent').length, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
    { label: 'Late / Excused', value: records.filter(r => r.status === 'late' || r.status === 'excused').length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  ];

  const attendanceRate = records.length > 0
    ? Math.round((records.filter(r => r.status === 'present').length / records.length) * 100)
    : 0;

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Attendance</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track and manage student attendance records</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-sky-200 transition-all"
          >
            <Plus className="w-4 h-4" />
            Mark Attendance
          </button>
        </div>

        {/* Stats + Rate */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {stats.map(s => (
            <div key={s.label} className={cn('rounded-xl border p-4', s.bg, s.border)}>
              <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold text-indigo-600">{attendanceRate}%</div>
            <div className="text-xs text-slate-500 mt-0.5">Attendance Rate</div>
            <div className="w-full mt-2 bg-indigo-100 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${attendanceRate}%` }} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search students or classes..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30">
            <option value="all">All Status</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="excused">Excused</option>
          </select>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30">
            <option value="all">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading records...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <CalendarCheck className="w-10 h-10 opacity-30" />
              <p className="text-sm">No attendance records found</p>
              <button onClick={openAdd} className="text-xs text-sky-600 hover:underline">Mark attendance now</button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Class</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Marked By</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(r => {
                      const sc = STATUS_CFG[r.status];
                      const name = r.student?.display_name || 'Unknown';
                      const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70 group transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(name))}>
                                {initials}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 leading-tight">{name}</div>
                                <div className="text-xs text-slate-400">{r.student?.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600">{r.class?.name || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {format(new Date(r.date), 'MMM d, yyyy')}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', sc.bg, sc.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 text-xs max-w-[160px] truncate">{r.notes || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3.5 text-slate-500 text-xs">{r.marker?.display_name || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-sky-50 hover:text-sky-600 rounded-lg transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteId(r.id)} className="p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors">
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

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filtered.map(r => {
                  const sc = STATUS_CFG[r.status];
                  const name = r.student?.display_name || 'Unknown';
                  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                  return (
                    <div key={r.id} className="p-4 flex items-start gap-3">
                      <div className={cn('w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(name))}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-800 text-sm">{name}</p>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0', sc.bg, sc.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                            {sc.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                          {r.class?.name && <span>{r.class.name}</span>}
                          <span>{format(new Date(r.date), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-sky-50 rounded-lg"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
                        <button onClick={() => setDeleteId(r.id)} className="p-1.5 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-slate-400" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
              Showing {filtered.length} of {records.length} records
            </div>
          )}
        </div>
      </div>

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
