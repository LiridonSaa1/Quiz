import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { authFetch, readApiError } from '../../lib/apiUrl';
import {
  ChevronLeft, Sparkles, Loader2, Plus, Trash2, Save,
  FileText, Check, X, RefreshCw, BookOpen, Clock, Target,
  CheckSquare, GraduationCap,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ExamQuestion {
  id?: string;
  text: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  points: number;
  order: number;
}

interface ExamData {
  id: string;
  title: string;
  description: string;
  timeLimit: number;
  passMark: number;
  courseId: string;
  courseName: string;
  published: boolean;
}

export default function ExamBuilder() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  const [aiTopic, setAiTopic] = useState('');
  const [aiLevel, setAiLevel] = useState('intermediate');
  const [aiCount, setAiCount] = useState(10);
  const [aiLang, setAiLang] = useState('English');
  const [generating, setGenerating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!examId) return;
      setLoading(true);
      try {
        const res = await authFetch(`/api/teacher/quizzes/${examId}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Exam not found');

        const qz = json.quiz;
        setExam({
          id: qz.id,
          title: qz.title || 'Untitled Exam',
          description: qz.description || '',
          timeLimit: qz.time_limit || 60,
          passMark: qz.pass_mark || 70,
          courseId: qz.course_id || '',
          courseName: qz.courseName || '',
          published: typeof qz.published === 'boolean' ? qz.published : qz.status === 'published',
        });

        setQuestions((json.questions || []).map((q: any, i: number) => ({
          id: q.id,
          text: q.text || q.question_text || '',
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswer: q.correct_answer || '',
          explanation: q.explanation || '',
          points: q.points ?? 1,
          order: q.order ?? i,
        })));
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load exam');
      }
      setLoading(false);
    };
    load();
  }, [examId]);

  const handleGenerate = async () => {
    if (!aiTopic.trim()) { toast.error('Enter a topic first'); return; }
    if (!examId) return;
    setGenerating(true);
    try {
      const res = await authFetch(`/api/teacher/exams/${encodeURIComponent(examId)}/generate-ai-questions`, {
        method: 'POST',
        body: JSON.stringify({ topic: aiTopic, level: aiLevel, count: aiCount, language: aiLang }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      const newQs: ExamQuestion[] = (json.questions || []).map((q: any, i: number) => ({
        text: q.text || q.question_text || '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correct_answer || '',
        explanation: q.explanation || '',
        points: 1,
        order: questions.length + i,
      }));
      setQuestions(prev => [...prev, ...newQs]);
      toast.success(`Added ${newQs.length} AI-generated questions`);
      setAiOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate questions');
    }
    setGenerating(false);
  };

  const updateQuestion = (idx: number, patch: Partial<ExamQuestion>) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const removeQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const addBlank = () => {
    setQuestions(prev => [...prev, {
      text: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      explanation: '',
      points: 1,
      order: prev.length,
    }]);
  };

  const handleSave = async () => {
    if (!examId) return;
    setSaving(true);
    try {
      const rows = questions.map((q, i) => ({
        text: q.text,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation || null,
        points: q.points,
        order: i,
      }));
      const res = await authFetch(`/api/teacher/exams/${encodeURIComponent(examId)}/save-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: rows }),
      });
      if (!res.ok) {
        const err = await readApiError(res);
        throw new Error(err);
      }
      toast.success('Exam saved successfully!');
      navigate('/teacher/exams');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save exam');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      </TeacherLayout>
    );
  }

  if (!exam) {
    return (
      <TeacherLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <FileText className="w-16 h-16 text-slate-200" />
          <p className="text-slate-500 font-medium">Exam not found</p>
          <button onClick={() => navigate('/teacher/exams')} className="text-indigo-600 text-sm font-semibold hover:underline">
            Back to Exams
          </button>
        </div>
      </TeacherLayout>
    );
  }

  const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      >
        {/* Header */}
        <div
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4f46e5 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />
          <div className="relative px-6 sm:px-8 lg:px-10 py-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate('/teacher/exams')}
                  className="flex items-center gap-2 text-indigo-200 hover:text-white text-sm font-medium transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back to Exams
                </button>
              </div>
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 16px rgba(245,158,11,0.4)' }}
                >
                  <Sparkles className="w-4 h-4" /> Generate with AI
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)', boxShadow: '0 4px 16px rgba(139,92,246,0.4)' }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Save Exam'}
                </motion.button>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{exam.title}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-indigo-200">
                {exam.courseName && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {exam.courseName}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {exam.timeLimit} min</span>
                <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Pass mark: {exam.passMark}%</span>
                <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" /> {questions.length} questions · {totalPoints} pts</span>
              </div>
            </div>
          </div>
        </div>

        {/* Exam Paper */}
        <div className="px-4 sm:px-8 lg:px-16 py-10" style={{ background: '#f1f5f9' }}>
          <div
            className="max-w-4xl mx-auto bg-white shadow-xl rounded-sm"
            style={{ boxShadow: '0 4px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)' }}
          >
            {/* Paper header */}
            <div className="border-b-4 border-slate-900 px-10 py-8">
              <div className="text-center space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Official Examination</p>
                <h1 className="text-3xl font-extrabold text-slate-900" style={{ fontFamily: 'Georgia, serif' }}>{exam.title}</h1>
                {exam.description && <p className="text-sm text-slate-600 italic">{exam.description}</p>}
                <div className="flex justify-center gap-8 mt-4 text-sm text-slate-700">
                  <span><strong>Time Allowed:</strong> {exam.timeLimit} minutes</span>
                  <span><strong>Total Marks:</strong> {totalPoints}</span>
                  <span><strong>Pass Mark:</strong> {exam.passMark}%</span>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                <div className="border-b border-slate-400 pb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500">Candidate Name</span>
                </div>
                <div className="border-b border-slate-400 pb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500">Date</span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="px-10 py-5 bg-slate-50 border-b border-slate-200">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Instructions</p>
              <p className="text-sm text-slate-700">Answer all questions. Circle or clearly indicate the correct option for each multiple-choice question.</p>
            </div>

            {/* Questions */}
            <div className="px-10 py-8 space-y-8">
              {questions.length === 0 ? (
                <div className="py-20 text-center">
                  <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-500 mb-2">No questions yet</h3>
                  <p className="text-slate-400 text-sm mb-6">Use "Generate with AI" to create questions, or add them manually below.</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setAiOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                    >
                      <Sparkles className="w-4 h-4" /> Generate with AI
                    </button>
                    <button
                      onClick={addBlank}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add manually
                    </button>
                  </div>
                </div>
              ) : (
                questions.map((q, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative"
                  >
                    <div className="flex items-start gap-4">
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0 mt-0.5"
                        style={{ background: 'linear-gradient(135deg, #312e81, #4f46e5)' }}
                      >
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-3">
                        <textarea
                          value={q.text}
                          onChange={e => updateQuestion(idx, { text: e.target.value })}
                          rows={2}
                          placeholder="Enter question text…"
                          className="w-full text-slate-900 font-medium text-[15px] leading-relaxed bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-400 focus:outline-none resize-none pb-1"
                          style={{ fontFamily: 'Georgia, serif' }}
                        />

                        <div className="space-y-2 pl-4">
                          {['A', 'B', 'C', 'D'].map((letter, oi) => (
                            <div key={oi} className="flex items-center gap-3 group/opt">
                              <button
                                type="button"
                                onClick={() => updateQuestion(idx, { correctAnswer: q.options[oi] || '' })}
                                title="Mark as correct"
                                className={cn(
                                  'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                                  q.correctAnswer === q.options[oi] && q.options[oi]
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-slate-300 hover:border-emerald-400'
                                )}
                              >
                                {q.correctAnswer === q.options[oi] && q.options[oi] && <Check className="w-3 h-3" />}
                              </button>
                              <span className="text-sm font-bold text-slate-500 shrink-0 w-5">{letter}.</span>
                              <input
                                type="text"
                                value={q.options[oi] || ''}
                                onChange={e => {
                                  const next = [...q.options];
                                  while (next.length <= oi) next.push('');
                                  const wasCorrect = q.correctAnswer === next[oi];
                                  next[oi] = e.target.value;
                                  updateQuestion(idx, {
                                    options: next,
                                    ...(wasCorrect ? { correctAnswer: e.target.value } : {}),
                                  });
                                }}
                                placeholder={`Option ${letter}`}
                                className="flex-1 text-sm text-slate-700 bg-transparent border-b border-dashed border-slate-200 focus:border-indigo-300 focus:outline-none py-0.5"
                              />
                            </div>
                          ))}
                        </div>

                        {q.explanation && (
                          <p className="text-xs text-slate-400 italic pl-4 border-l-2 border-slate-200">
                            Note: {q.explanation}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeQuestion(idx)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {idx < questions.length - 1 && (
                      <div className="mt-8 border-b border-dashed border-slate-200" />
                    )}
                  </motion.div>
                ))
              )}

              {questions.length > 0 && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={addBlank}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add question manually
                  </button>
                </div>
              )}
            </div>

            {/* Paper footer */}
            <div className="border-t-2 border-slate-900 px-10 py-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-widest">— End of Examination —</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Generation Modal */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setAiOpen(false)}
            />
            <motion.div
              className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 space-y-6"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-extrabold text-slate-900">Generate with AI</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Gemini AI will create exam questions for you</p>
                </div>
                <button onClick={() => setAiOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Topic / Subject *</label>
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    placeholder="e.g. English Grammar – Present Perfect Tense"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Difficulty Level</label>
                    <select
                      value={aiLevel}
                      onChange={e => setAiLevel(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="beginner">Beginner (A1)</option>
                      <option value="elementary">Elementary (A2)</option>
                      <option value="intermediate">Intermediate (B1)</option>
                      <option value="upper-intermediate">Upper-Intermediate (B2)</option>
                      <option value="advanced">Advanced (C1)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Number of Questions</label>
                    <input
                      type="number"
                      min={1} max={30}
                      value={aiCount}
                      onChange={e => setAiCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Language</label>
                  <select
                    value={aiLang}
                    onChange={e => setAiLang(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="English">English</option>
                    <option value="Albanian">Albanian</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Spanish">Spanish</option>
                    <option value="Italian">Italian</option>
                    <option value="Turkish">Turkish</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setAiOpen(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !aiTopic.trim()}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 16px rgba(245,158,11,0.35)' }}
                >
                  {generating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generate Questions</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}
