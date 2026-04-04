import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { supabase } from '../../supabase';
import {
  CalendarCheck, Plus, Search, CheckCircle2,
  XCircle, Clock, AlertTriangle, X, Pencil, Trash2,
  Calendar, ChevronLeft, ChevronRight, Users, BarChart3,
  ListChecks, Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, subDays, addDays, isToday } from 'date-fns';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
type ViewMode = 'list' | 'bulk';

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
}

interface ClassRec { id: string; name: string }
interface StudentRec { id: string; display_name: string; email: string }

interface BulkEntry {
  student_id: string;
  status: AttendanceStatus;
  notes: string;
}

const STATUS_CFG: Record<AttendanceStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType; border: string }> = {
  present: { label: 'Present', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2, border: 'border-emerald-200' },
  absent:  { label: 'Absent',  bg: 'bg-rose-50',    text: 'text-rose-700',   dot: 'bg-rose-500',    icon: XCircle,      border: 'border-rose-200'    },
  late:    { label: 'Late',    bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500',   icon: Clock,        border: 'border-amber-200'   },
  excused: { label: 'Excused', bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',    icon: AlertTriangle,border: 'border-blue-200'    },
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
const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const emptyForm = {
  class_id: '', student_id: '', date: new Date().toISOString().substring(0, 10),
  status: 'present' as AttendanceStatus, notes: '',
};

export default function TeacherAttendance() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Bulk marking state
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().substring(0, 10));
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Date navigator
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const fetchData = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const [{ data: rawData, error }, { data: cls }, { data: stu }] = await Promise.all([
        supabase.from('attendance').select('*').eq('marked_by', tid).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
        supabase.from('classes').select('id,name').eq('teacher_id', tid),
        supabase.from('profiles').select('id,display_name,email').eq('teacher_id', tid).eq('role', 'student'),
      ]);
      if (error) throw error;

      const classMap: Record<string, string> = {};
      (cls || []).forEach((c: any) => { classMap[c.id] = c.name; });
      const studentMap: Record<string, { display_name: string; email: string }> = {};
      (stu || []).forEach((p: any) => { studentMap[p.id] = { display_name: p.display_name, email: p.email }; });

      setRecords((rawData || []).map((r: any) => ({
        ...r,
        student: r.student_id ? (studentMap[r.student_id] || null) : null,
        class: r.class_id ? { name: classMap[r.class_id] } : null,
      })));
      setClasses(cls || []);
      setStudents(stu || []);
    } catch {
      toast.error('Failed to load attendance records');
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

  // Populate bulk entries when class/date changes
  useEffect(() => {
    if (viewMode !== 'bulk') return;
    const classStudents = bulkClassId
      ? students.filter(s => {
          const cls = classes.find(c => c.id === bulkClassId);
          return cls ? true : false;
        })
      : students;
    setBulkEntries(classStudents.map(s => ({ student_id: s.id, status: 'present', notes: '' })));
  }, [bulkClassId, students, viewMode, classes]);

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
    { label: 'Total Records', value: records.length, icon: CalendarCheck, iconBg: 'bg-sky-100 text-sky-600', grad: 'from-sky-500 to-cyan-500', ring: 'ring-sky-100' },
    { label: 'Present', value: records.filter(r => r.status === 'present').length, icon: CheckCircle2, iconBg: 'bg-emerald-100 text-emerald-600', grad: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-100' },
    { label: 'Absent', value: records.filter(r => r.status === 'absent').length, icon: XCircle, iconBg: 'bg-rose-100 text-rose-600', grad: 'from-rose-500 to-pink-500', ring: 'ring-rose-100' },
    { label: 'Late / Excused', value: records.filter(r => r.status === 'late' || r.status === 'excused').length, icon: Clock, iconBg: 'bg-amber-100 text-amber-600', grad: 'from-amber-500 to-orange-500', ring: 'ring-amber-100' },
  ];

  const attendanceRate = records.length > 0
    ? Math.round((records.filter(r => r.status === 'present').length / records.length) * 100)
    : 0;

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, marked_by: teacherId || '' } as any);
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
        marked_by: teacherId,
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
      if (teacherId) fetchData(teacherId);
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
      if (teacherId) fetchData(teacherId);
    } catch { toast.error('Failed to delete'); }
  };

  const handleBulkSave = async () => {
    if (bulkEntries.length === 0) { toast.error('No students to mark'); return; }
    setBulkSaving(true);
    try {
      const now = new Date().toISOString();
      const rows = bulkEntries.map(e => ({
        class_id: bulkClassId || null,
        student_id: e.student_id,
        date: bulkDate,
        status: e.status,
        notes: e.notes || null,
        marked_by: teacherId,
        created_at: now,
      }));
      const { error } = await supabase.from('attendance').insert(rows);
      if (error) throw error;
      toast.success(`Marked attendance for ${rows.length} student${rows.length !== 1 ? 's' : ''}`);
      setViewMode('list');
      if (teacherId) fetchData(teacherId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save bulk attendance');
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkSetAll = (status: AttendanceStatus) => {
    setBulkEntries(prev => prev.map(e => ({ ...e, status })));
  };

  // Date navigator helpers
  const goToPrevDay = () => setSelectedDate(d => subDays(d, 1));
  const goToNextDay = () => setSelectedDate(d => addDays(d, 1));
  const todayRecords = records.filter(r => r.date.substring(0, 10) === format(selectedDate, 'yyyy-MM-dd'));

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Attendance</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track and manage attendance for your students</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setViewMode('list')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', viewMode === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700')}
              >
                <ListChecks className="w-3.5 h-3.5" /> List
              </button>
              <button
                onClick={() => setViewMode('bulk')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', viewMode === 'bulk' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700')}
              >
                <Users className="w-3.5 h-3.5" /> Bulk Mark
              </button>
            </div>
            {viewMode === 'list' && (
              <button
                onClick={openAdd}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-violet-200 transition-all"
              >
                <Plus className="w-4 h-4" />
                Mark Attendance
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="w-4 h-4 text-violet-500" />
              <div className="text-2xl font-bold text-violet-600">{attendanceRate}%</div>
            </div>
            <div className="text-xs text-slate-500">Attendance Rate</div>
            <div className="w-full mt-2 bg-violet-100 rounded-full h-1.5">
              <div className="bg-violet-500 h-1.5 rounded-full transition-all" style={{ width: `${attendanceRate}%` }} />
            </div>
          </div>
        </div>

        {viewMode === 'bulk' ? (
          /* ── BULK MARK VIEW ─────────────────────────────────── */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className="font-semibold text-slate-800 text-sm">Bulk Mark Attendance</span>
              </div>
              <div className="flex flex-wrap gap-3 ml-auto">
                <input
                  type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <select value={bulkClassId} onChange={e => setBulkClassId(e.target.value)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                  <option value="">All Students</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Quick set all */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">Set all:</span>
              {(Object.keys(STATUS_CFG) as AttendanceStatus[]).map(s => {
                const sc = STATUS_CFG[s];
                return (
                  <button key={s} onClick={() => bulkSetAll(s)}
                    className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:opacity-80', sc.bg, sc.text, sc.border)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                    {sc.label}
                  </button>
                );
              })}
            </div>

            {students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <Users className="w-10 h-10 opacity-30" />
                <p className="text-sm">No students assigned to you yet</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-50">
                  {(bulkClassId ? students : students).map((student, idx) => {
                    const entry = bulkEntries.find(e => e.student_id === student.id);
                    if (!entry) return null;
                    const sc = STATUS_CFG[entry.status];
                    const initials = getInitials(student.display_name);
                    return (
                      <div key={student.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/70 transition-colors">
                        <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(student.display_name))}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 text-sm leading-tight">{student.display_name}</div>
                          <div className="text-xs text-slate-400">{student.email}</div>
                        </div>
                        {/* Status buttons */}
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {(Object.keys(STATUS_CFG) as AttendanceStatus[]).map(s => (
                            <button key={s}
                              onClick={() => setBulkEntries(prev => prev.map(e => e.student_id === student.id ? { ...e, status: s } : e))}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                                entry.status === s
                                  ? cn(STATUS_CFG[s].bg, STATUS_CFG[s].text, STATUS_CFG[s].border, 'ring-2 ring-offset-1', s === 'present' ? 'ring-emerald-400' : s === 'absent' ? 'ring-rose-400' : s === 'late' ? 'ring-amber-400' : 'ring-blue-400')
                                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                              )}>
                              {STATUS_CFG[s].label}
                            </button>
                          ))}
                        </div>
                        {/* Notes */}
                        <input
                          value={entry.notes}
                          onChange={e => setBulkEntries(prev => prev.map(en => en.student_id === student.id ? { ...en, notes: e.target.value } : en))}
                          placeholder="Notes..."
                          className="hidden sm:block w-32 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="p-5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{bulkEntries.length} student{bulkEntries.length !== 1 ? 's' : ''} · {format(new Date(bulkDate + 'T12:00:00'), 'MMM d, yyyy')}</span>
                  <div className="flex gap-3">
                    <button onClick={() => setViewMode('list')} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleBulkSave} disabled={bulkSaving}
                      className="px-5 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-md shadow-violet-200">
                      {bulkSaving ? 'Saving...' : 'Save All'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── LIST VIEW ──────────────────────────────────────── */
          <>
            {/* Date Navigator */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Calendar className="w-4 h-4 text-violet-500" />
                  Day View
                  {isToday(selectedDate) && (
                    <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full">Today</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={goToPrevDay} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                    <ChevronLeft className="w-4 h-4 text-slate-500" />
                  </button>
                  <span className="text-sm font-semibold text-slate-700 min-w-[130px] text-center">
                    {format(selectedDate, 'EEE, MMM d, yyyy')}
                  </span>
                  <button onClick={goToNextDay} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </button>
                  <button onClick={() => setSelectedDate(new Date())} className="ml-1 px-2.5 py-1 text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg transition-colors">
                    Today
                  </button>
                </div>
              </div>
              {todayRecords.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">No attendance records for this day</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {todayRecords.map(r => {
                    const sc = STATUS_CFG[r.status];
                    const name = r.student?.display_name || 'Unknown';
                    return (
                      <span key={r.id} className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', sc.bg, sc.text, sc.border)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                        {name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search students or classes..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                <option value="all">All Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="excused">Excused</option>
              </select>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                <option value="all">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
                  Loading records...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <CalendarCheck className="w-10 h-10 opacity-30" />
                  <p className="text-sm font-medium">No attendance records found</p>
                  <button onClick={openAdd} className="text-xs text-violet-600 hover:underline font-semibold">Mark attendance now</button>
                </div>
              ) : (
                <>
                  {/* Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Student</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Class</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filtered.map(r => {
                          const sc = STATUS_CFG[r.status];
                          const name = r.student?.display_name || 'Unknown';
                          const initials = getInitials(name);
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
                              <td className="px-4 py-3.5 text-slate-600 text-sm">
                                {r.class?.name || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-1.5 text-slate-600 text-sm">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  {format(new Date(r.date + 'T12:00:00'), 'MMM d, yyyy')}
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', sc.bg, sc.text)}>
                                  <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                                  {sc.label}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-slate-500 text-xs max-w-[180px] truncate">
                                {r.notes || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors">
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
                      const initials = getInitials(name);
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
                              <span>{format(new Date(r.date + 'T12:00:00'), 'MMM d, yyyy')}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-violet-50 rounded-lg"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
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
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
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
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.display_name} ({s.email})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Class</label>
                <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                  <option value="">No class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Date *</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AttendanceStatus }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30">
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
                  rows={2} className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  placeholder="Optional notes..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-md shadow-violet-200">
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
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 px-4 py-2 text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
