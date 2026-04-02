import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  GraduationCap, BookOpen, FileText, Download,
  Search, RefreshCw, ChevronUp, ChevronDown,
  CheckCircle2, XCircle, Clock, TrendingUp,
  Award, Users, BarChart3, Minus
} from 'lucide-react';
import { cn } from '../../lib/utils';

type ReportType = 'students' | 'courses' | 'quizzes';

interface StudentRow {
  id: string; name: string; email: string; status: string; joinedAt: string;
  enrolledCourses: number; totalAttempts: number; completedQuizzes: number;
  avgScore: number | null; certificates: number;
}
interface CourseRow {
  id: string; title: string; category: string; level: string; status: string;
  createdAt: string; enrolledStudents: number; totalLessons: number; certificatesIssued: number;
}
interface QuizRow {
  id: string; title: string; published: boolean; createdAt: string; passingScore: number;
  totalAttempts: number; completedAttempts: number; passedAttempts: number;
  passRate: number | null; avgScore: number | null; uniqueStudents: number;
}

type SortDir = 'asc' | 'desc';

const REPORT_TABS: { id: ReportType; label: string; icon: React.ElementType }[] = [
  { id: 'students', label: 'Student Performance', icon: GraduationCap },
  { id: 'courses', label: 'Course Overview', icon: BookOpen },
  { id: 'quizzes', label: 'Quiz Statistics', icon: FileText },
];

const ScoreBadge = ({ value }: { value: number | null }) => {
  if (value === null) return <span className="text-slate-300 text-sm">—</span>;
  const color = value >= 80 ? 'bg-emerald-50 text-emerald-700' : value >= 60 ? 'bg-blue-50 text-blue-700' : value >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';
  return <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold', color)}>{value}%</span>;
};

export default function AdminReports() {
  const [reportType, setReportType] = useState<ReportType>('students');
  const [studentData, setStudentData] = useState<StudentRow[]>([]);
  const [courseData, setCourseData] = useState<CourseRow[]>([]);
  const [quizData, setQuizData] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => { fetchReport(reportType); }, [reportType]);

  const fetchReport = async (type: ReportType) => {
    setLoading(true);
    setSearch('');
    setSortKey('');
    try {
      const res = await fetch(`/api/admin/reports/${type}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (type === 'students') setStudentData(json.report);
      if (type === 'courses') setCourseData(json.report);
      if (type === 'quizzes') setQuizData(json.report);
    } catch (e: any) { toast.error(e.message || 'Failed to load report'); }
    finally { setLoading(false); }
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <Minus className="w-3 h-3 text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-500" /> : <ChevronDown className="w-3 h-3 text-indigo-500" />;
  };

  const TH = ({ label, col, className }: { label: string; col?: string; className?: string }) => (
    <th className={cn('text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap', className)}>
      {col ? (
        <button onClick={() => handleSort(col)} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
          {label} <SortIcon col={col} />
        </button>
      ) : label}
    </th>
  );

  const sortAndFilter = <T extends Record<string, any>>(data: T[], searchKeys: (keyof T)[]): T[] => {
    let out = data.filter(row => {
      if (!search) return true;
      const q = search.toLowerCase();
      return searchKeys.some(k => String(row[k] || '').toLowerCase().includes(q));
    });
    if (sortKey) {
      out = [...out].sort((a, b) => {
        const av = a[sortKey] ?? -1;
        const bv = b[sortKey] ?? -1;
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return out;
  };

  const exportCSV = () => {
    let rows: string[][] = [];
    let filename = 'report.csv';

    if (reportType === 'students') {
      rows = [
        ['Name', 'Email', 'Status', 'Joined', 'Enrolled Courses', 'Total Attempts', 'Completed Quizzes', 'Avg Score %', 'Certificates'],
        ...studentData.map(r => [r.name, r.email, r.status, r.joinedAt?.slice(0,10), String(r.enrolledCourses), String(r.totalAttempts), String(r.completedQuizzes), r.avgScore !== null ? String(r.avgScore) : '', String(r.certificates)]),
      ];
      filename = 'student-report.csv';
    } else if (reportType === 'courses') {
      rows = [
        ['Title', 'Category', 'Level', 'Status', 'Created', 'Students', 'Lessons', 'Certificates'],
        ...courseData.map(r => [r.title, r.category, r.level, r.status, r.createdAt?.slice(0,10), String(r.enrolledStudents), String(r.totalLessons), String(r.certificatesIssued)]),
      ];
      filename = 'course-report.csv';
    } else {
      rows = [
        ['Title', 'Published', 'Attempts', 'Completed', 'Passed', 'Pass Rate %', 'Avg Score %', 'Unique Students'],
        ...quizData.map(r => [r.title, r.published ? 'Yes' : 'No', String(r.totalAttempts), String(r.completedAttempts), String(r.passedAttempts), r.passRate !== null ? String(r.passRate) : '', r.avgScore !== null ? String(r.avgScore) : '', String(r.uniqueStudents)]),
      ];
      filename = 'quiz-report.csv';
    }

    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filename} downloaded`);
  };

  const students = sortAndFilter(studentData, ['name', 'email']);
  const courses  = sortAndFilter(courseData,  ['title', 'category']);
  const quizzes  = sortAndFilter(quizData,    ['title']);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <p className="text-slate-500 text-sm mt-0.5">Detailed data exports and performance breakdowns</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchReport(reportType)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        {/* Report Type Tabs */}
        <div className="flex gap-2 flex-wrap">
          {REPORT_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setReportType(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                  reportType === tab.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                )}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search + Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Search bar */}
          <div className="p-4 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={reportType === 'students' ? 'Search by name or email…' : reportType === 'courses' ? 'Search by title or category…' : 'Search by quiz title…'}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">

              {/* ── STUDENTS TABLE ── */}
              {reportType === 'students' && (
                <>
                  {students.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                      <GraduationCap className="w-10 h-10 mb-2 opacity-40" />
                      <p className="font-medium">No students found</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100">
                          <TH label="Student" col="name" />
                          <TH label="Status" />
                          <TH label="Joined" col="joinedAt" />
                          <TH label="Courses" col="enrolledCourses" />
                          <TH label="Attempts" col="totalAttempts" />
                          <TH label="Completed" col="completedQuizzes" />
                          <TH label="Avg Score" col="avgScore" />
                          <TH label="Certs" col="certificates" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {students.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3.5">
                              <div>
                                <p className="font-semibold text-slate-900">{s.name}</p>
                                <p className="text-xs text-slate-400">{s.email}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-500 text-xs">
                              {s.joinedAt ? format(new Date(s.joinedAt), 'MMM d, yyyy') : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold text-slate-700">{s.enrolledCourses}</td>
                            <td className="px-4 py-3.5 text-center font-semibold text-slate-700">{s.totalAttempts}</td>
                            <td className="px-4 py-3.5 text-center font-semibold text-slate-700">{s.completedQuizzes}</td>
                            <td className="px-4 py-3.5 text-center"><ScoreBadge value={s.avgScore} /></td>
                            <td className="px-4 py-3.5 text-center">
                              {s.certificates > 0 ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-xs">
                                  <Award className="w-3.5 h-3.5" />{s.certificates}
                                </span>
                              ) : <span className="text-slate-300 text-sm">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* ── COURSES TABLE ── */}
              {reportType === 'courses' && (
                <>
                  {courses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                      <BookOpen className="w-10 h-10 mb-2 opacity-40" />
                      <p className="font-medium">No courses found</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100">
                          <TH label="Course" col="title" />
                          <TH label="Category" col="category" />
                          <TH label="Level" col="level" />
                          <TH label="Status" col="status" />
                          <TH label="Created" col="createdAt" />
                          <TH label="Students" col="enrolledStudents" />
                          <TH label="Lessons" col="totalLessons" />
                          <TH label="Certificates" col="certificatesIssued" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {courses.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-slate-900 max-w-[220px] truncate">{c.title}</p>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">{c.category}</span>
                            </td>
                            <td className="px-4 py-3.5 capitalize">
                              <span className="text-slate-600 text-xs font-medium">{c.level}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold capitalize', c.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                                {c.status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                              {c.createdAt ? format(new Date(c.createdAt), 'MMM d, yyyy') : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 text-xs">
                                <Users className="w-3.5 h-3.5 text-slate-400" />{c.enrolledStudents}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold text-slate-700">{c.totalLessons}</td>
                            <td className="px-4 py-3.5 text-center">
                              {c.certificatesIssued > 0 ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-xs">
                                  <Award className="w-3.5 h-3.5" />{c.certificatesIssued}
                                </span>
                              ) : <span className="text-slate-300 text-sm">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* ── QUIZZES TABLE ── */}
              {reportType === 'quizzes' && (
                <>
                  {quizzes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                      <FileText className="w-10 h-10 mb-2 opacity-40" />
                      <p className="font-medium">No quizzes found</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100">
                          <TH label="Quiz" col="title" />
                          <TH label="Status" col="published" />
                          <TH label="Passing Score" col="passingScore" />
                          <TH label="Attempts" col="totalAttempts" />
                          <TH label="Completed" col="completedAttempts" />
                          <TH label="Pass Rate" col="passRate" />
                          <TH label="Avg Score" col="avgScore" />
                          <TH label="Students" col="uniqueStudents" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {quizzes.map(q => (
                          <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-slate-900 max-w-[220px] truncate">{q.title}</p>
                              <p className="text-xs text-slate-400">{q.createdAt ? format(new Date(q.createdAt), 'MMM d, yyyy') : ''}</p>
                            </td>
                            <td className="px-4 py-3.5">
                              {q.published ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                                  <CheckCircle2 className="w-3 h-3" /> Published
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-bold">
                                  <Clock className="w-3 h-3" /> Draft
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="text-slate-600 font-semibold">{q.passingScore}%</span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold text-slate-700">{q.totalAttempts}</td>
                            <td className="px-4 py-3.5 text-center font-semibold text-slate-700">{q.completedAttempts}</td>
                            <td className="px-4 py-3.5 text-center">
                              {q.passRate !== null ? (
                                <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold',
                                  q.passRate >= 70 ? 'bg-emerald-50 text-emerald-700' : q.passRate >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700')}>
                                  {q.passRate >= 70 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                  {q.passRate}%
                                </span>
                              ) : <span className="text-slate-300 text-sm">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-center"><ScoreBadge value={q.avgScore} /></td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 text-xs">
                                <Users className="w-3.5 h-3.5 text-slate-400" />{q.uniqueStudents}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}

          {/* Footer row count */}
          {!loading && (
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {reportType === 'students' && `${students.length} student${students.length !== 1 ? 's' : ''}`}
                {reportType === 'courses' && `${courses.length} course${courses.length !== 1 ? 's' : ''}`}
                {reportType === 'quizzes' && `${quizzes.length} quiz${quizzes.length !== 1 ? 'zes' : ''}`}
                {search && ` matching "${search}"`}
              </p>
              <p className="text-xs text-slate-400">Click any column header to sort</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
