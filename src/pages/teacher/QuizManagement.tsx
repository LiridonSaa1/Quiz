import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { sendNotification } from '../../lib/utils';
import {
  Plus, Search, FileText, Trash2, Edit2,
  Clock, BookOpen, CheckCircle2, XCircle,
  HelpCircle, LayoutGrid, List, Shuffle, RotateCcw, Target
} from 'lucide-react';
import { toast } from 'sonner';
import { Quiz } from '../../types';
import { cn } from '../../lib/utils';
import { Link, useNavigate } from 'react-router-dom';

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

interface QuizWithCount extends Quiz {
  questionCount: number;
  courseName: string;
}

export default function QuizManagement() {
  const [quizzes, setQuizzes] = useState<QuizWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [courseOptions, setCourseOptions] = useState<{ id: string; name: string }[]>([]);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const [quizzesSnap, coursesSnap, questionsSnap] = await Promise.all([
        supabase.from('quizzes').select('*').eq('teacher_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('courses').select('id, name, title').eq('teacher_id', session.user.id),
        supabase.from('questions').select('quiz_id'),
      ]);

      if (quizzesSnap.error) throw quizzesSnap.error;
      if (coursesSnap.error) throw coursesSnap.error;

      const courseMap: Record<string, string> = {};
      const options: { id: string; name: string }[] = [];
      (coursesSnap.data || []).forEach(c => {
        courseMap[c.id] = c.name || c.title || 'Untitled';
        options.push({ id: c.id, name: c.name || c.title || 'Untitled' });
      });
      setCourseOptions(options);

      const questionCountMap: Record<string, number> = {};
      (questionsSnap.data || []).forEach(q => {
        questionCountMap[q.quiz_id] = (questionCountMap[q.quiz_id] || 0) + 1;
      });

      setQuizzes((quizzesSnap.data || []).map(d => ({
        id: d.id,
        courseId: d.course_id,
        teacherId: d.teacher_id,
        title: d.title,
        description: d.description,
        type: d.type || 'standard',
        timeLimit: d.time_limit,
        totalMarks: d.total_marks,
        passMark: d.pass_mark,
        maxAttempts: d.max_attempts,
        status: d.status,
        settings: d.settings,
        published: d.published,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        questionCount: questionCountMap[d.id] || 0,
        courseName: courseMap[d.course_id] || 'Unknown Course',
      })));
    } catch {
      toast.error('Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this quiz and all its questions? This cannot be undone.')) return;
    try {
      await supabase.from('questions').delete().eq('quiz_id', id);
      const { error } = await supabase.from('quizzes').delete().eq('id', id);
      if (error) throw error;
      toast.success('Quiz deleted');
      fetchData();
    } catch { toast.error('Failed to delete quiz'); }
  };

  const togglePublish = async (quiz: QuizWithCount) => {
    try {
      const { error } = await supabase
        .from('quizzes')
        .update({ published: !quiz.published })
        .eq('id', quiz.id);
      if (error) throw error;

      if (!quiz.published) {
        const { data: course } = await supabase
          .from('courses').select('student_ids').eq('id', quiz.courseId).single();
        if (course?.student_ids) {
          course.student_ids.forEach((sid: string) =>
            sendNotification(sid, 'New Quiz Available', `"${quiz.title}" is now available in your course.`, 'info')
          );
        }
      }
      toast.success(`Quiz ${!quiz.published ? 'published' : 'unpublished'}`);
      fetchData();
    } catch { toast.error('Failed to update status'); }
  };

  const filtered = quizzes.filter(q => {
    const matchSearch = q.title.toLowerCase().includes(search.toLowerCase()) ||
      (q.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || q.courseId === courseFilter;
    const matchStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'published' ? q.published : !q.published;
    return matchSearch && matchCourse && matchStatus;
  });

  const stats = [
    { label: 'Total Quizzes', value: quizzes.length, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
    { label: 'Published', value: quizzes.filter(q => q.published).length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Drafts', value: quizzes.filter(q => !q.published).length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Total Questions', value: quizzes.reduce((a, q) => a + q.questionCount, 0), color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Quizzes</h1>
            <p className="text-slate-500 text-sm mt-1">Build and manage quizzes to assess your students.</p>
          </div>
          <Link
            to="/teacher/quizzes/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Create Quiz
          </Link>
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
              placeholder="Search quizzes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
            />
          </div>
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          >
            <option value="all">All Courses</option>
            {courseOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 ml-auto">
            {(['grid', 'list'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`p-2 rounded-lg transition-all ${viewMode === mode ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}>
                {mode === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 h-56 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-violet-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No quizzes found</h3>
            <p className="text-slate-400 text-sm mb-6">
              {search || courseFilter !== 'all' || statusFilter !== 'all'
                ? 'No results match your filters.'
                : 'Create your first quiz to start assessing students.'}
            </p>
            <Link to="/teacher/quizzes/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all">
              <Plus className="w-4 h-4" /> Create Quiz
            </Link>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(quiz => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                gradient={getGradient(quiz.id)}
                onEdit={() => navigate(`/teacher/quizzes/edit/${quiz.id}`)}
                onDelete={() => handleDelete(quiz.id)}
                onTogglePublish={() => togglePublish(quiz)}
              />
            ))}
          </div>
        ) : (
          /* List view */
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Quiz</th>
                  <th className="px-5 py-3.5">Course</th>
                  <th className="px-5 py-3.5">Questions</th>
                  <th className="px-5 py-3.5">Time Limit</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(quiz => (
                  <tr key={quiz.id} className="hover:bg-slate-50/60 transition-all group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGradient(quiz.id)} flex items-center justify-center`}>
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 line-clamp-1">{quiz.title}</div>
                          <div className="text-xs text-slate-400">{new Date(quiz.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                        <BookOpen className="w-3 h-3" />
                        {quiz.courseName}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                        <HelpCircle className="w-3.5 h-3.5 text-slate-300" />
                        {quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        {quiz.timeLimit} min
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => togglePublish(quiz)}
                        className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all',
                          quiz.published
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', quiz.published ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {quiz.published ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => navigate(`/teacher/quizzes/edit/${quiz.id}`)}
                          className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(quiz.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}

function QuizCard({ quiz, gradient, onEdit, onDelete, onTogglePublish }: {
  quiz: QuizWithCount;
  gradient: string;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group overflow-hidden flex flex-col">
      {/* Card Header */}
      <div className={`relative h-32 bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between`}>
        <div className="flex items-start justify-between">
          <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <button
            onClick={onTogglePublish}
            className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg transition-all border',
              quiz.published
                ? 'bg-emerald-500/30 text-white border-emerald-400/30 hover:bg-emerald-500/50'
                : 'bg-white/20 text-white border-white/20 hover:bg-white/30'
            )}
          >
            {quiz.published ? 'Published' : 'Draft'}
          </button>
        </div>

        {/* Hover actions */}
        <div className="absolute top-3 right-14 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={onEdit} className="p-1.5 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-lg text-white transition-all">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 bg-red-500/30 hover:bg-red-500/60 backdrop-blur-sm rounded-lg text-white transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Settings badges */}
        <div className="flex gap-1.5 flex-wrap">
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

      {/* Card Body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1">{quiz.title}</h3>
        <p className="text-slate-400 text-xs line-clamp-2 mb-4 leading-relaxed flex-1">
          {quiz.description || 'No description provided.'}
        </p>

        {/* Meta row */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
          <div className="flex items-center gap-3 text-xs text-slate-400">
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
          <button
            onClick={onEdit}
            className="text-xs font-semibold text-violet-600 hover:text-violet-700 px-2.5 py-1.5 hover:bg-violet-50 rounded-lg transition-all"
          >
            Edit
          </button>
        </div>

        {/* Course badge */}
        <div className="mt-3 pt-3 border-t border-slate-50">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">
            <BookOpen className="w-3 h-3" />
            {quiz.courseName}
          </span>
        </div>
      </div>
    </div>
  );
}
