import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  Search, FileText, BookOpen, Clock, HelpCircle,
  CheckCircle2, XCircle, Target, Shuffle, RotateCcw, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import StyledSelect from '../../components/ui/StyledSelect';

interface QuizRow {
  id: string;
  title: string;
  description?: string;
  courseId: string;
  courseName: string;
  teacherName: string;
  questionCount: number;
  timeLimit: number;
  published: boolean;
  settings?: any;
  createdAt: string;
}

const GRADIENT_PALETTES = [
  'from-violet-500 to-purple-600',
  'from-indigo-500 to-blue-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-fuchsia-500 to-violet-600',
  'from-sky-500 to-indigo-600',
];
const getGradient = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];
};

export default function AdminQuizzes() {
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseOptions, setCourseOptions] = useState<{ id: string; name: string }[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [quizzesSnap, coursesSnap, teachersSnap, questionsSnap] = await Promise.all([
        supabase.from('quizzes').select('*').order('created_at', { ascending: false }),
        supabase.from('courses').select('id, title, teacher_id'),
        supabase.from('teachers').select('user_id, first_name, last_name'),
        supabase.from('questions').select('quiz_id'),
      ]);

      if (quizzesSnap.error) throw quizzesSnap.error;

      const teacherMap: Record<string, string> = {};
      (teachersSnap.data || []).forEach(t => {
        teacherMap[t.user_id] = `${t.first_name} ${t.last_name}`;
      });

      const courseMap: Record<string, { name: string; teacher: string }> = {};
      const options: { id: string; name: string }[] = [];
      (coursesSnap.data || []).forEach(c => {
        const name = c.title || 'Untitled';
        courseMap[c.id] = { name, teacher: teacherMap[c.teacher_id] || '—' };
        options.push({ id: c.id, name });
      });
      setCourseOptions(options);

      const questionCountMap: Record<string, number> = {};
      (questionsSnap.data || []).forEach(q => {
        questionCountMap[q.quiz_id] = (questionCountMap[q.quiz_id] || 0) + 1;
      });

      setQuizzes((quizzesSnap.data || []).map(d => ({
        id: d.id,
        title: d.title,
        description: d.description,
        courseId: d.course_id,
        courseName: courseMap[d.course_id]?.name || 'Unknown',
        teacherName: courseMap[d.course_id]?.teacher || '—',
        questionCount: questionCountMap[d.id] || 0,
        timeLimit: d.time_limit || 0,
        published: d.published ?? false,
        settings: d.settings,
        createdAt: d.created_at,
      })));
    } catch {
      toast.error('Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = quizzes.filter(q => {
    const matchSearch =
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.teacherName.toLowerCase().includes(search.toLowerCase()) ||
      q.courseName.toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || q.courseId === courseFilter;
    const matchStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'published' ? q.published : !q.published;
    return matchSearch && matchCourse && matchStatus;
  });

  const totalQuestions = quizzes.reduce((a, q) => a + q.questionCount, 0);
  const avgTime = quizzes.length
    ? Math.round(quizzes.reduce((a, q) => a + q.timeLimit, 0) / quizzes.length)
    : 0;

  const stats = [
    { label: 'Total Quizzes', value: quizzes.length, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
    { label: 'Published', value: quizzes.filter(q => q.published).length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Total Questions', value: totalQuestions, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
    { label: 'Avg. Time Limit', value: `${avgTime} min`, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quizzes</h1>
          <p className="text-slate-500 text-sm mt-1">Platform-wide overview of all quizzes and assessments.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`bg-white border ${s.border} rounded-2xl p-4 shadow-sm`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by title, teacher or course..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="all">All Courses</option>
            {courseOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* Quiz Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 h-56 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-700 font-semibold">No quizzes found</p>
            <p className="text-slate-400 text-sm mt-1">
              {search || courseFilter !== 'all' || statusFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Quizzes created by teachers will appear here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(quiz => (
              <AdminQuizCard key={quiz.id} quiz={quiz as QuizRow} gradient={getGradient(quiz.id)} />
            ))}
          </div>
        )}

        {/* Summary table below cards */}
        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700">All Quizzes — Detail View</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Quiz</th>
                    <th className="px-5 py-3.5">Course</th>
                    <th className="px-5 py-3.5">Teacher</th>
                    <th className="px-5 py-3.5">Questions</th>
                    <th className="px-5 py-3.5">Time</th>
                    <th className="px-5 py-3.5">Pass %</th>
                    <th className="px-5 py-3.5">Options</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(quiz => (
                    <tr key={quiz.id} className="hover:bg-slate-50/60 transition-all">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getGradient(quiz.id)} flex items-center justify-center shrink-0`}>
                            <FileText className="w-4 h-4 text-white" />
                          </div>
                          <div className="text-sm font-semibold text-slate-900 line-clamp-1 max-w-[160px]">{quiz.title}</div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium whitespace-nowrap">
                          <BookOpen className="w-3 h-3" />
                          {quiz.courseName}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{quiz.teacherName}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-300" />
                          {quiz.questionCount}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 whitespace-nowrap">
                          <Clock className="w-3.5 h-3.5 text-slate-300" />
                          {quiz.timeLimit} min
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {quiz.settings?.passingScore ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                            <Target className="w-3.5 h-3.5 text-slate-300" />
                            {quiz.settings.passingScore}%
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          {quiz.settings?.shuffleQuestions && (
                            <span title="Shuffle Questions" className="p-1 bg-indigo-50 text-indigo-500 rounded-lg">
                              <Shuffle className="w-3 h-3" />
                            </span>
                          )}
                          {quiz.settings?.allowRetry && (
                            <span title="Retry Allowed" className="p-1 bg-violet-50 text-violet-500 rounded-lg">
                              <RotateCcw className="w-3 h-3" />
                            </span>
                          )}
                          {!quiz.settings?.shuffleQuestions && !quiz.settings?.allowRetry && (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg',
                          quiz.published
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', quiz.published ? 'bg-emerald-500' : 'bg-amber-500')} />
                          {quiz.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(quiz.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function AdminQuizCard({ quiz, gradient }: { quiz: QuizRow; gradient: string; key?: React.Key }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col">
      {/* Card header */}
      <div className={`relative h-28 bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between`}>
        <div className="flex items-start justify-between">
          <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border',
            quiz.published
              ? 'bg-emerald-500/30 text-white border-emerald-400/30'
              : 'bg-white/20 text-white border-white/20'
          )}>
            {quiz.published ? 'Published' : 'Draft'}
          </span>
        </div>
        <div className="flex gap-1.5">
          {quiz.settings?.shuffleQuestions && (
            <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Shuffle className="w-2.5 h-2.5" /> Shuffle
            </span>
          )}
          {quiz.settings?.allowRetry && (
            <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <RotateCcw className="w-2.5 h-2.5" /> Retry
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1">{quiz.title}</h3>
        <p className="text-slate-400 text-xs line-clamp-2 mb-4 leading-relaxed flex-1">
          {quiz.description || 'No description provided.'}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-slate-400 pt-4 border-t border-slate-50">
          <span className="flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            {quiz.questionCount} Q
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {quiz.timeLimit}m
          </span>
          {quiz.settings?.passingScore && (
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              {quiz.settings.passingScore}%
            </span>
          )}
        </div>

        {/* Course + Teacher */}
        <div className="mt-3 pt-3 border-t border-slate-50 space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">
            <BookOpen className="w-3 h-3" />
            {quiz.courseName}
          </span>
          <div className="text-xs text-slate-400">by {quiz.teacherName}</div>
        </div>
      </div>
    </div>
  );
}
