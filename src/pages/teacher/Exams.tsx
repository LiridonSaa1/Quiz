import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap, Plus, Search, Edit2, Trash2, Eye, EyeOff,
  Clock, Users, Target, CheckCircle2, XCircle, BarChart3,
  BookOpen, FileText, Trophy, Zap, X, ChevronRight, AlertCircle,
  Star, Shield, Timer, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

interface Exam {
  id: string;
  title: string;
  description: string;
  courseId: string;
  courseName: string;
  timeLimit: number;
  passMark: number;
  maxAttempts: number;
  published: boolean;
  questionCount: number;
  totalAttempts: number;
  passRate: number;
  avgScore: number;
  createdAt: string;
  settings: any;
}

interface Course { id: string; title: string; }

const STAT_ORBS = [
  { cx: '10%', cy: '20%', r: 180, color: 'rgba(244,63,94,0.12)' },
  { cx: '85%', cy: '60%', r: 220, color: 'rgba(251,113,133,0.08)' },
  { cx: '55%', cy: '85%', r: 140, color: 'rgba(159,18,57,0.15)' },
];

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', courseId: '',
    timeLimit: 60, passMark: 70, maxAttempts: 1,
    shuffleQuestions: true, shuffleAnswers: true,
  });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [examsSnap, coursesSnap, questionsSnap, attemptsSnap] = await Promise.all([
      supabase.from('quizzes').select('*').eq('teacher_id', session.user.id).eq('type', 'exam').order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title').eq('teacher_id', session.user.id),
      supabase.from('questions').select('quiz_id'),
      supabase.from('quiz_attempts').select('quiz_id, score, passed'),
    ]);

    const courseMap: Record<string, string> = {};
    (coursesSnap.data || []).forEach(c => { courseMap[c.id] = c.title; });
    setCourses(coursesSnap.data || []);

    const qCount: Record<string, number> = {};
    (questionsSnap.data || []).forEach(q => { qCount[q.quiz_id] = (qCount[q.quiz_id] || 0) + 1; });

    const attempts: Record<string, { total: number; passed: number; scores: number[] }> = {};
    (attemptsSnap.data || []).forEach(a => {
      if (!attempts[a.quiz_id]) attempts[a.quiz_id] = { total: 0, passed: 0, scores: [] };
      attempts[a.quiz_id].total++;
      if (a.passed) attempts[a.quiz_id].passed++;
      if (a.score != null) attempts[a.quiz_id].scores.push(a.score);
    });

    setExams((examsSnap.data || []).map(d => {
      const att = attempts[d.id] || { total: 0, passed: 0, scores: [] };
      const avgScore = att.scores.length ? Math.round(att.scores.reduce((a, b) => a + b, 0) / att.scores.length) : 0;
      const passRate = att.total ? Math.round((att.passed / att.total) * 100) : 0;
      return {
        id: d.id,
        title: d.title,
        description: d.description,
        courseId: d.course_id,
        courseName: courseMap[d.course_id] || 'Unknown Course',
        timeLimit: d.time_limit || 60,
        passMark: d.pass_mark || d.settings?.passingScore || 70,
        maxAttempts: d.max_attempts || 1,
        published: d.published || false,
        questionCount: qCount[d.id] || 0,
        totalAttempts: att.total,
        passRate,
        avgScore,
        createdAt: d.created_at,
        settings: d.settings || {},
      };
    }));

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.courseId) {
      toast.error('Title and course are required');
      return;
    }
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data, error } = await supabase.from('quizzes').insert({
        title: form.title.trim(),
        description: form.description.trim(),
        course_id: form.courseId,
        teacher_id: session.user.id,
        type: 'exam',
        time_limit: form.timeLimit,
        pass_mark: form.passMark,
        max_attempts: form.maxAttempts,
        published: false,
        settings: {
          passingScore: form.passMark,
          shuffleQuestions: form.shuffleQuestions,
          shuffleAnswers: form.shuffleAnswers,
          allowRetry: form.maxAttempts > 1,
        },
      }).select().single();
      if (error) throw error;
      toast.success('Exam created! Add questions in the builder.');
      setShowCreate(false);
      setForm({ title: '', description: '', courseId: '', timeLimit: 60, passMark: 70, maxAttempts: 1, shuffleQuestions: true, shuffleAnswers: true });
      navigate(`/teacher/quizzes/edit/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create exam');
    } finally {
      setCreating(false);
    }
  };

  const togglePublish = async (exam: Exam) => {
    setToggling(exam.id);
    try {
      const { error } = await supabase.from('quizzes').update({ published: !exam.published }).eq('id', exam.id);
      if (error) throw error;
      setExams(prev => prev.map(e => e.id === exam.id ? { ...e, published: !exam.published } : e));
      toast.success(exam.published ? 'Exam unpublished' : 'Exam published — students can now see it!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setToggling(null);
    }
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this exam? All attempts will also be deleted.')) return;
    setDeleting(id);
    try {
      await supabase.from('quiz_attempts').delete().eq('quiz_id', id);
      await supabase.from('questions').delete().eq('quiz_id', id);
      const { error } = await supabase.from('quizzes').delete().eq('id', id);
      if (error) throw error;
      setExams(prev => prev.filter(e => e.id !== id));
      toast.success('Exam deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const filtered = exams.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.courseName.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: exams.length,
    published: exams.filter(e => e.published).length,
    totalAttempts: exams.reduce((s, e) => s + e.totalAttempts, 0),
    avgPassRate: exams.length ? Math.round(exams.reduce((s, e) => s + e.passRate, 0) / exams.length) : 0,
  };

  return (
    <TeacherLayout>
      {/* Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-rose-900 via-slate-900 to-slate-900 min-h-[200px] flex flex-col justify-end p-8">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {STAT_ORBS.map((orb, i) => (
            <motion.circle key={i} cx={orb.cx} cy={orb.cy} r={orb.r} fill={orb.color}
              animate={{ r: [orb.r, orb.r + 20, orb.r], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 4 + i * 1.5, repeat: Infinity, ease: 'easeInOut' }} />
          ))}
        </svg>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-rose-500/20 border border-rose-500/30 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-rose-300" />
            </div>
            <span className="text-rose-300 text-sm font-semibold uppercase tracking-widest">Exam Center</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">Course Exams</h1>
          <p className="text-slate-400 text-sm max-w-xl">Create and manage formal assessments for your courses. Set time limits, passing scores, and track student performance.</p>
          <div className="flex flex-wrap gap-6 mt-5">
            {[
              { label: 'Total Exams', value: stats.total, icon: FileText, color: 'text-rose-300' },
              { label: 'Published', value: stats.published, icon: Eye, color: 'text-emerald-300' },
              { label: 'Total Attempts', value: stats.totalAttempts, icon: Users, color: 'text-blue-300' },
              { label: 'Avg Pass Rate', value: `${stats.avgPassRate}%`, icon: Trophy, color: 'text-amber-300' },
            ].map((s) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5">
                <s.icon className={cn('w-4 h-4', s.color)} />
                <div>
                  <div className={cn('text-xl font-black', s.color)}>{s.value}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search exams or courses..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400" />
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-500/20 shrink-0">
          <Plus className="w-4 h-4" /> New Exam
        </button>
      </div>

      {/* Exam Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 animate-pulse h-52" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-rose-300" />
          </div>
          <h3 className="text-slate-700 font-bold text-lg mb-1">{search ? 'No exams found' : 'No exams yet'}</h3>
          <p className="text-slate-400 text-sm mb-4">{search ? 'Try a different search.' : 'Create your first course exam to get started.'}</p>
          {!search && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all">
              <Plus className="w-4 h-4" /> Create Exam
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((exam, i) => (
              <motion.div key={exam.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden group">
                {/* Card Top */}
                <div className={cn('h-2 w-full', exam.published ? 'bg-gradient-to-r from-rose-500 to-pink-500' : 'bg-slate-200')} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', exam.published
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200')}>
                          {exam.published ? '● LIVE' : '○ DRAFT'}
                        </span>
                      </div>
                      <h3 className="text-slate-900 font-bold text-base leading-tight truncate">{exam.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <BookOpen className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400 truncate">{exam.courseName}</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5 text-rose-500" />
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { icon: FileText, label: 'Questions', value: exam.questionCount },
                      { icon: Timer, label: 'Minutes', value: exam.timeLimit },
                      { icon: Target, label: 'Pass Mark', value: `${exam.passMark}%` },
                    ].map(m => (
                      <div key={m.label} className="bg-slate-50 rounded-xl p-2.5 text-center">
                        <m.icon className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
                        <div className="text-sm font-black text-slate-800">{m.value}</div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-wide">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Attempt Stats */}
                  {exam.totalAttempts > 0 && (
                    <div className="flex items-center gap-3 mb-4 p-2.5 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-600">{exam.totalAttempts} attempts</span>
                      </div>
                      <div className="w-px h-4 bg-slate-200" />
                      <div className="flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-semibold text-slate-600">{exam.passRate}% pass rate</span>
                      </div>
                      <div className="w-px h-4 bg-slate-200" />
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-xs font-semibold text-slate-600">avg {exam.avgScore}%</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/teacher/quizzes/edit/${exam.id}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2 rounded-xl transition-all">
                      <Edit2 className="w-3.5 h-3.5" /> Edit Questions
                    </button>
                    <button onClick={() => togglePublish(exam)} disabled={toggling === exam.id}
                      className={cn('flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border',
                        exam.published
                          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100')}>
                      {toggling === exam.id ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : exam.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => deleteExam(exam.id)} disabled={deleting === exam.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 transition-all">
                      {deleting === exam.id ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create Exam Modal */}
      <AnimatePresence>
        {showCreate && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowCreate(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto overflow-hidden">
                <div className="bg-gradient-to-r from-rose-600 to-pink-600 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                        <GraduationCap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-white font-bold text-lg">Create New Exam</h2>
                        <p className="text-rose-100 text-xs">Set up exam details, then add questions</p>
                      </div>
                    </div>
                    <button onClick={() => setShowCreate(false)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Exam Title *</label>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Final Exam – Unit 4"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400" />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Course *</label>
                    <select value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 bg-white">
                      <option value="">Select a course...</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Description</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Brief instructions or overview for students..."
                      rows={2}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 resize-none" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                        <Timer className="w-3 h-3" /> Time (min)
                      </label>
                      <input type="number" min={5} max={480} value={form.timeLimit} onChange={e => setForm(f => ({ ...f, timeLimit: Number(e.target.value) }))}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 text-center font-bold" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                        <Target className="w-3 h-3" /> Pass (%)
                      </label>
                      <input type="number" min={1} max={100} value={form.passMark} onChange={e => setForm(f => ({ ...f, passMark: Number(e.target.value) }))}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 text-center font-bold" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" /> Attempts
                      </label>
                      <input type="number" min={1} max={10} value={form.maxAttempts} onChange={e => setForm(f => ({ ...f, maxAttempts: Number(e.target.value) }))}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 text-center font-bold" />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-1">
                    {[
                      { key: 'shuffleQuestions', label: 'Shuffle Questions' },
                      { key: 'shuffleAnswers', label: 'Shuffle Answers' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form[opt.key as keyof typeof form] as boolean}
                          onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))}
                          className="w-4 h-4 accent-rose-600 rounded" />
                        <span className="text-xs text-slate-600 font-medium">{opt.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowCreate(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-all">
                      Cancel
                    </button>
                    <button onClick={handleCreate} disabled={creating}
                      className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-rose-500/20">
                      {creating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                      {creating ? 'Creating...' : 'Create & Add Questions'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}
