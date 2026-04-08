import React, { useEffect, useMemo, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { Award, Search, CheckCircle2, XCircle, BookOpen, Hash } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';

type CertStatus = 'issued' | 'revoked';

interface CertificateRow {
  id: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  title: string;
  certificateNumber: string;
  score: number | null;
  grade: string | null;
  issuedAt: string;
  status: CertStatus;
}

const STATUS_META: Record<CertStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  issued: { label: 'Issued', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  revoked: { label: 'Revoked', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', icon: XCircle },
};

export default function TeacherCertificates() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CertificateRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CertStatus>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const teacherId = session.user.id;

        const [coursesRes, studentsRes] = await Promise.all([
          supabase.from('courses').select('id,title').eq('teacher_id', teacherId),
          supabase.from('profiles').select('id,display_name,email').eq('role', 'student').eq('teacher_id', teacherId),
        ]);
        if (coursesRes.error) throw coursesRes.error;
        if (studentsRes.error) throw studentsRes.error;

        const courseMap: Record<string, string> = {};
        (coursesRes.data || []).forEach((c: any) => { courseMap[c.id] = c.title; });
        const courseIds = Object.keys(courseMap);

        const studentMap: Record<string, { name: string; email: string }> = {};
        (studentsRes.data || []).forEach((s: any) => {
          studentMap[s.id] = { name: s.display_name || 'Unknown Student', email: s.email || '' };
        });

        if (courseIds.length === 0) {
          setRows([]);
          return;
        }

        const certsRes = await supabase
          .from('certificates')
          .select('*')
          .in('course_id', courseIds)
          .order('issued_at', { ascending: false });
        if (certsRes.error) throw certsRes.error;

        const mapped = (certsRes.data || []).map((c: any) => ({
          id: c.id,
          studentName: studentMap[c.student_id]?.name || 'Unknown Student',
          studentEmail: studentMap[c.student_id]?.email || '',
          courseTitle: c.course_id ? (courseMap[c.course_id] || 'Unknown Course') : 'No Course',
          title: c.title,
          certificateNumber: c.certificate_number,
          score: c.score ?? null,
          grade: c.grade ?? null,
          issuedAt: c.issued_at,
          status: c.status as CertStatus,
        }));

        setRows(mapped);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load certificates');
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
        r.courseTitle.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.certificateNumber.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const stats = {
    total: rows.length,
    issued: rows.filter((r) => r.status === 'issued').length,
    revoked: rows.filter((r) => r.status === 'revoked').length,
    avgScore: rows.filter((r) => typeof r.score === 'number').length > 0
      ? Math.round(
          rows
            .filter((r) => typeof r.score === 'number')
            .reduce((acc, r) => acc + (r.score as number), 0) /
            rows.filter((r) => typeof r.score === 'number').length,
        )
      : 0,
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
          <h1 className="text-2xl font-bold text-slate-900">Certificates</h1>
          <p className="text-slate-500 text-sm mt-1">Review certificates issued across your courses.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total" value={stats.total} icon={Award} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Issued" value={stats.issued} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Revoked" value={stats.revoked} icon={XCircle} color="text-rose-600" bg="bg-rose-50" />
          <StatCard label="Avg Score" value={stats.avgScore} suffix="%" icon={BookOpen} color="text-blue-600" bg="bg-blue-50" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student, course, title, number..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | CertStatus)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            <option value="all">All Status</option>
            <option value="issued">Issued</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Award className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No certificates found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5">Course</th>
                    <th className="px-5 py-3.5">Certificate</th>
                    <th className="px-5 py-3.5">Issued</th>
                    <th className="px-5 py-3.5">Status</th>
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
                        <td className="px-5 py-4 text-slate-600">{row.courseTitle}</td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-800">{row.title}</div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {row.certificateNumber}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <div>{format(new Date(row.issuedAt), 'MMM dd, yyyy')}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {typeof row.score === 'number' ? `Score ${row.score}${row.grade ? ` • ${row.grade}` : ''}` : (row.grade || 'No grade')}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold', meta.bg, meta.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </td>
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
  suffix,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  suffix?: string;
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
      <div className={cn('text-2xl font-bold', color)}>
        {value}
        {suffix || ''}
      </div>
      <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
    </div>
  );
}
