import React, { useEffect, useMemo, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { CalendarCheck, Search, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceRow {
  id: string;
  student_id: string;
  class_id: string | null;
  date: string;
  status: AttendanceStatus;
  notes: string | null;
  className: string;
  studentName: string;
  studentEmail: string;
}

const STATUS_META: Record<AttendanceStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  present: { label: 'Present', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  absent: { label: 'Absent', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', icon: XCircle },
  late: { label: 'Late', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', icon: Clock },
  excused: { label: 'Excused', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', icon: AlertTriangle },
};

export default function TeacherAttendance() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const teacherId = session.user.id;

        const [classesRes, studentsRes] = await Promise.all([
          supabase.from('classes').select('id,name').eq('teacher_id', teacherId),
          supabase.from('profiles').select('id,display_name,email').eq('role', 'student').eq('teacher_id', teacherId),
        ]);

        if (classesRes.error) throw classesRes.error;
        if (studentsRes.error) throw studentsRes.error;

        const classMap: Record<string, string> = {};
        (classesRes.data || []).forEach((c: any) => { classMap[c.id] = c.name; });
        const classIds = Object.keys(classMap);

        const studentMap: Record<string, { name: string; email: string }> = {};
        (studentsRes.data || []).forEach((s: any) => {
          studentMap[s.id] = { name: s.display_name || 'Unknown Student', email: s.email || '' };
        });

        if (classIds.length === 0) {
          setRows([]);
          return;
        }

        const attendanceRes = await supabase
          .from('attendance')
          .select('*')
          .in('class_id', classIds)
          .order('date', { ascending: false });

        if (attendanceRes.error) throw attendanceRes.error;

        const mapped = (attendanceRes.data || []).map((a: any) => ({
          id: a.id,
          student_id: a.student_id,
          class_id: a.class_id,
          date: a.date,
          status: a.status as AttendanceStatus,
          notes: a.notes || null,
          className: a.class_id ? (classMap[a.class_id] || 'Unknown Class') : 'No Class',
          studentName: studentMap[a.student_id]?.name || 'Unknown Student',
          studentEmail: studentMap[a.student_id]?.email || '',
        }));

        setRows(mapped);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load attendance');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch =
        r.studentName.toLowerCase().includes(q) ||
        r.studentEmail.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const stats = {
    total: rows.length,
    present: rows.filter((r) => r.status === 'present').length,
    absent: rows.filter((r) => r.status === 'absent').length,
    late: rows.filter((r) => r.status === 'late').length,
  };

  if (loading) {
    return (
      <TeacherLayout>
        <LayoutPageSkeleton cards={4} rows={7} />
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-slate-500 text-sm mt-1">Track attendance for your classes.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Records" value={stats.total} icon={CalendarCheck} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Present" value={stats.present} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Absent" value={stats.absent} icon={XCircle} color="text-rose-600" bg="bg-rose-50" />
          <StatCard label="Late" value={stats.late} icon={Clock} color="text-amber-600" bg="bg-amber-50" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student or class..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AttendanceStatus)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            <option value="all">All Status</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="excused">Excused</option>
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No attendance records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5">Class</th>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((row) => {
                    const meta = STATUS_META[row.status];
                    const Icon = meta.icon;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-800">{row.studentName}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{row.studentEmail}</div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{row.className}</td>
                        <td className="px-5 py-4 text-slate-600">{format(new Date(row.date), 'MMM dd, yyyy')}</td>
                        <td className="px-5 py-4">
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold', meta.bg, meta.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-500">{row.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className={cn('p-2 rounded-xl', bg)}>
          <Icon className={cn('w-4 h-4', color)} />
        </div>
      </div>
      <div className={cn('text-2xl font-bold', color)}>{value}</div>
      <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
    </div>
  );
}
