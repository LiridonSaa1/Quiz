import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { authFetch, readApiError } from '../../lib/apiUrl';
import {
  ChevronLeft, ChevronRight, Sparkles, Loader2, Plus, Trash2, Save,
  FileText, Check, X, BookOpen, Clock, Target,
  CheckSquare, GraduationCap, Circle, Type, AlignLeft,
  TextCursorInput, Layers, Shuffle, GripVertical,
  Headphones, Mic, LayoutList, PenLine, Volume2, Settings,
} from 'lucide-react';
import { cn } from '../../lib/utils';

type QuestionType =
  | 'multiple-choice' | 'multiple-answer' | 'true-false'
  | 'short-answer' | 'long-answer' | 'fill-in-the-blank' | 'open-text'
  | 'matching' | 'ordering' | 'drag-drop' | 'word-bank' | 'sentence-building'
  | 'cloze' | 'reading-comprehension' | 'listening' | 'audio-fill-blank'
  | 'dictation' | 'speaking' | 'pronunciation' | 'instruction';

interface ExamQuestion {
  id?: string;
  type: QuestionType;
  text: string;
  options?: Array<{ id: string; text: string }>;
  correctAnswer: string;
  explanation: string;
  points: number;
  order: number;
  readingPassage?: string;
  mediaUrl?: string;
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

const QUESTION_TYPES: Array<{ type: QuestionType; label: string; icon: React.ElementType }> = [
  { type: 'multiple-choice',      label: 'MCQ',           icon: CheckSquare },
  { type: 'multiple-answer',      label: 'Multi ✓',       icon: CheckSquare },
  { type: 'true-false',           label: 'T / F',         icon: Circle },
  { type: 'fill-in-the-blank',    label: 'Fill Blank',    icon: TextCursorInput },
  { type: 'cloze',                label: 'Cloze',         icon: LayoutList },
  { type: 'short-answer',         label: 'Short Ans',     icon: Type },
  { type: 'long-answer',          label: 'Essay',         icon: AlignLeft },
  { type: 'open-text',            label: 'Open',          icon: Type },
  { type: 'matching',             label: 'Matching',      icon: Layers },
  { type: 'ordering',             label: 'Ordering',      icon: Shuffle },
  { type: 'drag-drop',            label: 'Drag & Drop',   icon: GripVertical },
  { type: 'word-bank',            label: 'Word Bank',     icon: FileText },
  { type: 'sentence-building',    label: 'Sentence',      icon: TextCursorInput },
  { type: 'reading-comprehension',label: 'Reading',       icon: BookOpen },
  { type: 'listening',            label: 'Listening',     icon: Headphones },
  { type: 'audio-fill-blank',     label: 'Audio Blank',   icon: Volume2 },
  { type: 'dictation',            label: 'Dictation',     icon: PenLine },
  { type: 'speaking',             label: 'Speaking',      icon: Mic },
  { type: 'pronunciation',        label: 'Pronunciat.',   icon: Mic },
  { type: 'instruction',          label: 'Text only',     icon: AlignLeft },
];

function makeBlankQuestion(type: QuestionType, order: number): ExamQuestion {
  const base: ExamQuestion = {
    type,
    text: '',
    correctAnswer: '',
    explanation: '',
    points: type === 'instruction' ? 0 : type === 'long-answer' ? 2 : type === 'matching' ? 3 : 1,
    order,
  };
  switch (type) {
    case 'multiple-choice':
      return { ...base, options: [{ id: '1', text: 'Option 1' }, { id: '2', text: 'Option 2' }, { id: '3', text: 'Option 3' }, { id: '4', text: 'Option 4' }] };
    case 'true-false':
      return { ...base, options: [{ id: '1', text: 'True' }, { id: '2', text: 'False' }] };
    case 'multiple-answer':
    case 'listening':
    case 'reading-comprehension':
      return { ...base, options: [{ id: '1', text: 'Option A' }, { id: '2', text: 'Option B' }, { id: '3', text: 'Option C' }, { id: '4', text: 'Option D' }], correctAnswer: '[]' };
    case 'matching':
      return { ...base, options: [{ id: '1', text: 'Item 1' }, { id: '2', text: 'Item 2' }, { id: '3', text: 'Item 3' }], correctAnswer: JSON.stringify([{ left: 'Item 1', right: '' }, { left: 'Item 2', right: '' }, { left: 'Item 3', right: '' }]) };
    case 'ordering':
    case 'drag-drop':
      return { ...base, options: [{ id: '1', text: 'Step 1' }, { id: '2', text: 'Step 2' }, { id: '3', text: 'Step 3' }], correctAnswer: JSON.stringify(['Step 1', 'Step 2', 'Step 3']) };
    case 'word-bank':
      return { ...base, options: [{ id: '1', text: 'word1' }, { id: '2', text: 'word2' }, { id: '3', text: 'word3' }, { id: '4', text: 'word4' }] };
    case 'sentence-building':
      return { ...base, options: [{ id: '1', text: 'Word' }, { id: '2', text: 'two' }, { id: '3', text: 'three' }] };
    case 'cloze':
      return { ...base, correctAnswer: JSON.stringify(['answer1']) };
    default:
      return base;
  }
}

function toDbQuestionType(t: string | undefined): string {
  const x = (t || 'open-text').toLowerCase();
  const allowed = new Set([
    'multiple-choice', 'multiple-answer', 'true-false', 'open-text', 'fill-in-the-blank',
    'short-answer', 'long-answer', 'matching', 'ordering', 'word-bank', 'sentence-building',
    'image', 'video', 'reading', 'instruction',
    'drag-drop', 'cloze', 'listening', 'audio-fill-blank', 'dictation', 'speaking',
    'pronunciation', 'reading-comprehension',
  ]);
  return allowed.has(x) ? x : 'open-text';
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
  const [aiTypes, setAiTypes] = useState<string[]>(['multiple-choice']);
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

        setQuestions((json.questions || []).map((q: any, i: number) => {
          const rawOpts = Array.isArray(q.options) ? q.options : [];
          const opts: Array<{ id: string; text: string }> = rawOpts.map((o: any, idx: number) =>
            typeof o === 'string'
              ? { id: String(idx + 1), text: o }
              : { id: String(o.id ?? idx + 1), text: String(o.text ?? o.label ?? o.value ?? '') }
          );
          return {
            id: q.id,
            type: (q.type || 'multiple-choice') as QuestionType,
            text: q.text || q.question_text || '',
            options: opts.length ? opts : undefined,
            correctAnswer: typeof q.correct_answer === 'string' ? q.correct_answer
              : (q.correct_answer != null ? JSON.stringify(q.correct_answer) : ''),
            explanation: q.explanation || '',
            points: q.points ?? 1,
            order: q.order ?? i,
            readingPassage: q.reading_passage || '',
            mediaUrl: q.media_url || '',
          };
        }));
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: aiTopic, level: aiLevel, count: aiCount, language: aiLang, questionTypes: aiTypes }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      const newQs: ExamQuestion[] = (json.questions || []).map((q: any, i: number) => {
        const rawOpts = Array.isArray(q.options) ? q.options : [];
        const opts: Array<{ id: string; text: string }> = rawOpts.map((o: any, idx: number) =>
          typeof o === 'string' ? { id: String(idx + 1), text: o } : { id: String(o.id ?? idx + 1), text: String(o.text ?? '') }
        );
        return {
          type: (q.type || 'multiple-choice') as QuestionType,
          text: q.text || q.question_text || '',
          options: opts.length ? opts : undefined,
          correctAnswer: typeof q.correct_answer === 'string' ? q.correct_answer
            : (typeof q.correctAnswer === 'string' ? q.correctAnswer : ''),
          explanation: q.explanation || '',
          points: 1,
          order: questions.length + i,
        };
      });
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

  const addQuestion = (type: QuestionType) => {
    setQuestions(prev => [...prev, makeBlankQuestion(type, prev.length)]);
  };

  const changeType = (idx: number, newType: QuestionType) => {
    const old = questions[idx];
    const blank = makeBlankQuestion(newType, idx);
    setQuestions(prev => prev.map((q, i) =>
      i === idx ? { ...blank, id: old.id, text: old.text, explanation: old.explanation } : q
    ));
  };

  const handleSave = async () => {
    if (!examId) return;
    setSaving(true);
    try {
      const rows = questions.map((q, i) => ({
        type: toDbQuestionType(q.type),
        text: q.text || ' ',
        options: q.options ?? null,
        correct_answer: q.correctAnswer,
        explanation: q.explanation || null,
        points: q.type === 'instruction' ? 0 : (q.points ?? 1),
        reading_passage: q.readingPassage || null,
        media_url: q.mediaUrl || null,
        order: i,
      }));
      const res = await authFetch(`/api/teacher/exams/${encodeURIComponent(examId)}/save-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: rows }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
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
          <button onClick={() => navigate('/teacher/exams')} className="text-indigo-600 text-sm font-semibold hover:underline">Back to Exams</button>
        </div>
      </TeacherLayout>
    );
  }

  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0);

  return (
    <TeacherLayout>
      <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7">

        {/* ── Header ── */}
        <div
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4f46e5 100%)' }}
        >
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative px-6 sm:px-8 lg:px-10 py-8">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="flex items-start gap-4 min-w-0">
                <button
                  onClick={() => navigate('/teacher/exams')}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all shrink-0"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <nav className="flex items-center gap-1.5 text-[11px] font-semibold mb-2 flex-wrap">
                    <span className="text-indigo-300 uppercase tracking-wider">Teacher Portal</span>
                    <ChevronRight className="w-3 h-3 text-indigo-500/50" />
                    <button onClick={() => navigate('/teacher/exams')} className="text-indigo-200 uppercase tracking-wider hover:text-white transition-colors">Exams</button>
                    <ChevronRight className="w-3 h-3 text-indigo-500/50" />
                    <span className="text-white/90 uppercase tracking-wider">Edit</span>
                  </nav>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                    <GraduationCap className="w-7 h-7 text-indigo-300 shrink-0" />
                    {exam.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-xs font-semibold text-indigo-200">
                    {exam.courseName && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{exam.courseName}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{exam.timeLimit} min</span>
                    <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" />Pass: {exam.passMark}%</span>
                    <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />{questions.length} questions · {totalPoints} pts</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-xl border border-white/20"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}
                >
                  <Sparkles className="w-4 h-4" /> Generate Questions
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-60 transition-all"
                  style={{ background: saving ? 'rgba(129,140,248,0.7)' : 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.4)' }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Save Exam'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 sm:px-8 lg:px-10 py-8 bg-slate-50">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ── Sidebar ── */}
            <div className="lg:col-span-1 space-y-6">
              {/* Add questions */}
              <div
                className="rounded-2xl p-5 text-white space-y-4"
                style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 55%, #6d28d9 100%)' }}
              >
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add question manually
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addQuestion(type)}
                      className="flex flex-col items-center gap-1.5 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wide border border-white/10"
                    >
                      <Icon className="w-5 h-5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Generate card */}
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="w-full rounded-2xl p-5 text-white text-left space-y-2 transition-all hover:opacity-90 active:scale-[0.98] shadow-lg"
                style={{ background: 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 60%,#2563eb 100%)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-base">Generate with AI</span>
                </div>
                <p className="text-white/70 text-xs leading-relaxed">
                  Select question types → enter topic → AI builds the exam for you.
                </p>
                <div className="inline-flex items-center gap-1.5 bg-white/20 rounded-lg px-3 py-1.5 text-xs font-bold mt-1">
                  <Sparkles className="w-3.5 h-3.5" /> Open AI Generator
                </div>
              </button>

              {/* Exam info */}
              <div className="rounded-2xl border border-white/60 shadow-sm p-5 space-y-3 bg-white/90 backdrop-blur-md">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-500" /> Exam info
                </h3>
                <div className="text-sm text-slate-600 space-y-1.5">
                  <p><span className="font-semibold">Title:</span> {exam.title}</p>
                  {exam.courseName && <p><span className="font-semibold">Course:</span> {exam.courseName}</p>}
                  <p><span className="font-semibold">Duration:</span> {exam.timeLimit} min</p>
                  <p><span className="font-semibold">Pass mark:</span> {exam.passMark}%</p>
                  <p><span className="font-semibold">Total points:</span> {totalPoints}</p>
                </div>
              </div>
            </div>

            {/* ── Questions ── */}
            <div className="lg:col-span-2 space-y-5">
              {questions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
                  <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-500 mb-2">No questions yet</h3>
                  <p className="text-slate-400 text-sm mb-6">Use the sidebar to add questions manually or generate them with AI.</p>
                  <button
                    onClick={() => setAiOpen(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                  >
                    <Sparkles className="w-4 h-4" /> Generate with AI
                  </button>
                </div>
              ) : (
                questions.map((q, index) => (
                  <QuestionCard
                    key={`${index}-${q.type}`}
                    index={index}
                    q={q}
                    onUpdate={(patch) => updateQuestion(index, patch)}
                    onRemove={() => removeQuestion(index)}
                    onChangeType={(type) => changeType(index, type)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Modal ── */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div
            className="fixed inset-0 lg:left-60 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAiOpen(false)} />
            <motion.div
              className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 space-y-6 max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-extrabold text-slate-900">Generate Exam Questions</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Gemini AI will create questions for you</p>
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
                    placeholder="e.g. Present Perfect Tense — Unit 5"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Difficulty</label>
                    <select value={aiLevel} onChange={e => setAiLevel(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                      <option value="beginner">Beginner (A1)</option>
                      <option value="elementary">Elementary (A2)</option>
                      <option value="intermediate">Intermediate (B1)</option>
                      <option value="upper-intermediate">Upper-Intermediate (B2)</option>
                      <option value="advanced">Advanced (C1)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Count</label>
                    <input
                      type="number" min={1} max={30} value={aiCount}
                      onChange={e => setAiCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Language</label>
                  <select value={aiLang} onChange={e => setAiLang(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    {['English', 'Albanian', 'German', 'French', 'Spanish', 'Italian', 'Arabic', 'Turkish'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Question Types</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: 'multiple-choice',   label: 'Multiple Choice' },
                      { v: 'true-false',         label: 'True / False' },
                      { v: 'short-answer',       label: 'Short Answer' },
                      { v: 'fill-in-the-blank',  label: 'Fill in the Blank' },
                      { v: 'matching',           label: 'Matching' },
                      { v: 'ordering',           label: 'Ordering' },
                    ].map(({ v, label }) => {
                      const on = aiTypes.includes(v);
                      return (
                        <button key={v} type="button"
                          onClick={() => setAiTypes(prev => on ? prev.filter(x => x !== v) : [...prev, v])}
                          className={cn('text-xs font-semibold px-3 py-2 rounded-lg border transition-all text-left',
                            on ? 'bg-violet-50 border-violet-400 text-violet-800' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
                        >
                          {on && '✓ '}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !aiTopic.trim() || !aiTypes.length}
                className="w-full py-4 rounded-2xl font-extrabold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}
              >
                {generating
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Generating…</>
                  : <><Sparkles className="w-5 h-5" />Generate Questions</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}

/* ─────────────────────────────────────────────────────────
   QuestionCard — identical layout to QuizBuilder
───────────────────────────────────────────────────────── */
function QuestionCard({
  index, q, onUpdate, onRemove, onChangeType,
}: {
  index: number;
  q: ExamQuestion;
  onUpdate: (patch: Partial<ExamQuestion>) => void;
  onRemove: () => void;
  onChangeType: (type: QuestionType) => void;
}) {
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
    >
      {/* Card header */}
      <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-100 flex items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            {index + 1}
          </span>

          {/* Type selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setTypeMenuOpen(v => !v)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 transition-all"
            >
              {String(q.type || '').replace(/-/g, ' ')}
              <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            <AnimatePresence>
              {typeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setTypeMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full left-0 mt-1 z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 p-3 w-56"
                  >
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Change type</p>
                    <div className="grid grid-cols-2 gap-1">
                      {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => { onChangeType(type); setTypeMenuOpen(false); }}
                          className={cn(
                            'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all text-left',
                            q.type === type
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                          )}
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span className="truncate">{label}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Card body */}
      <div className="p-6 space-y-5">
        {/* Question text */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            {q.type === 'instruction' ? 'Text (directions, passage, or context)' : 'Question'}
          </label>
          <textarea
            value={q.text}
            onChange={e => onUpdate({ text: e.target.value })}
            rows={q.type === 'instruction' ? 6 : 2}
            placeholder={q.type === 'instruction'
              ? 'Paste or write the text students should read.'
              : 'Ask your question…'}
            className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          />
          {q.type === 'instruction' && (
            <p className="text-[11px] text-slate-500 mt-1.5">Display-only: no answer box shown to students.</p>
          )}
        </div>

        {/* Reading passage */}
        {q.type === 'reading-comprehension' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reading passage</label>
            <textarea
              value={q.readingPassage || ''}
              onChange={e => onUpdate({ readingPassage: e.target.value })}
              rows={6}
              placeholder="Paste the passage students should read before answering…"
              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>
        )}

        {/* MCQ / True-False */}
        {(q.type === 'multiple-choice' || q.type === 'true-false') && (
          <SingleChoiceEditor
            options={q.options || []}
            correctAnswer={q.correctAnswer}
            canAdd={q.type === 'multiple-choice'}
            onUpdate={(opts, ca) => onUpdate({ options: opts, correctAnswer: ca })}
          />
        )}

        {/* Multiple answer */}
        {q.type === 'multiple-answer' && (
          <MultiAnswerEditor
            options={q.options || []}
            correctAnswer={q.correctAnswer}
            onUpdate={(opts, ca) => onUpdate({ options: opts, correctAnswer: ca })}
          />
        )}

        {/* Listening / Reading-comprehension with options */}
        {(q.type === 'listening' || q.type === 'reading-comprehension') && (
          <SingleChoiceEditor
            options={q.options || []}
            correctAnswer={q.correctAnswer}
            canAdd={true}
            onUpdate={(opts, ca) => onUpdate({ options: opts, correctAnswer: ca })}
          />
        )}

        {/* Fill in blank / Open text */}
        {(q.type === 'fill-in-the-blank' || q.type === 'open-text') && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {q.type === 'fill-in-the-blank' ? 'Acceptable answers (comma-separated)' : 'Correct keywords (comma-separated)'}
            </label>
            <input
              type="text"
              value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
              onChange={e => onUpdate({ correctAnswer: e.target.value })}
              placeholder={q.type === 'fill-in-the-blank' ? 'e.g. mitochondria, Mitochondria' : 'e.g. photosynthesis, chlorophyll'}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
        )}

        {/* Short / Long answer */}
        {(q.type === 'short-answer' || q.type === 'long-answer') && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {q.type === 'short-answer' ? 'Model answer / keywords' : 'Model answer or rubric hints'}
            </label>
            <textarea
              rows={q.type === 'long-answer' ? 4 : 2}
              value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
              onChange={e => onUpdate({ correctAnswer: e.target.value })}
              placeholder={q.type === 'short-answer' ? 'Expected answer...' : 'Sample answer or grading rubric hints...'}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>
        )}

        {/* Cloze */}
        {q.type === 'cloze' && (
          <ClozeEditor
            correctAnswer={q.correctAnswer}
            onUpdate={ca => onUpdate({ correctAnswer: ca })}
          />
        )}

        {/* Matching */}
        {q.type === 'matching' && (
          <MatchingEditor
            correctAnswer={q.correctAnswer}
            onUpdate={(opts, ca) => onUpdate({ options: opts, correctAnswer: ca })}
          />
        )}

        {/* Ordering / Drag-drop */}
        {(q.type === 'ordering' || q.type === 'drag-drop') && (
          <OrderingEditor
            correctAnswer={q.correctAnswer}
            onUpdate={(opts, ca) => onUpdate({ options: opts, correctAnswer: ca })}
          />
        )}

        {/* Word bank */}
        {q.type === 'word-bank' && (
          <WordBankEditor
            options={q.options || []}
            correctAnswer={q.correctAnswer}
            onUpdate={(opts, ca) => onUpdate({ options: opts, correctAnswer: ca })}
          />
        )}

        {/* Sentence building */}
        {q.type === 'sentence-building' && (
          <SentenceBuildingEditor
            options={q.options || []}
            correctAnswer={q.correctAnswer}
            onUpdate={(opts, ca) => onUpdate({ options: opts, correctAnswer: ca })}
          />
        )}

        {/* Audio URL for listening/speaking/dictation etc. */}
        {(q.type === 'listening' || q.type === 'dictation' || q.type === 'audio-fill-blank' || q.type === 'speaking' || q.type === 'pronunciation') && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Audio URL (optional)</label>
            <input
              type="url"
              value={q.mediaUrl || ''}
              onChange={e => onUpdate({ mediaUrl: e.target.value })}
              placeholder="https://… direct audio link"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
        )}

        {/* Explanation + points */}
        {q.type !== 'instruction' && (
          <div className="flex flex-col sm:flex-row gap-3 pt-1 border-t border-slate-50">
            <input
              type="text"
              value={q.explanation}
              onChange={e => onUpdate({ explanation: e.target.value })}
              placeholder="Explanation (optional, shown after submission)"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-slate-500">Points:</span>
              <input
                type="number" min={0} max={100} value={q.points}
                onChange={e => onUpdate({ points: parseInt(e.target.value) || 0 })}
                className="w-16 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-center focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Sub-editors ── */

function SingleChoiceEditor({ options, correctAnswer, canAdd, onUpdate }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  canAdd: boolean;
  onUpdate: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-600">Answer options</label>
      <div className="space-y-2">
        {options.map((opt, oi) => (
          <div key={opt.id ?? oi} className="flex items-center gap-2 group/opt">
            <button
              type="button"
              onClick={() => onUpdate(options, opt.id)}
              className={cn(
                'w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
                correctAnswer === opt.id ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 hover:border-slate-400'
              )}
            >
              {correctAnswer === opt.id && <Check className="w-4 h-4" />}
            </button>
            <input
              type="text"
              value={opt.text ?? ''}
              onChange={e => {
                const next = [...options];
                next[oi] = { ...next[oi], text: e.target.value };
                onUpdate(next, correctAnswer);
              }}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            {canAdd && options.length > 2 && (
              <button
                type="button"
                onClick={() => {
                  const next = options.filter((_, i) => i !== oi);
                  onUpdate(next, correctAnswer === opt.id ? '' : correctAnswer);
                }}
                className="p-2 text-slate-400 hover:text-red-600 opacity-0 group-hover/opt:opacity-100 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => onUpdate([...options, { id: Math.random().toString(36).slice(2, 11), text: `Option ${options.length + 1}` }], correctAnswer)}
            className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pl-9 pt-1"
          >
            <Plus className="w-4 h-4" /> Add option
          </button>
        )}
      </div>
    </div>
  );
}

function MultiAnswerEditor({ options, correctAnswer, onUpdate }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  onUpdate: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  let correctIds: string[] = [];
  try { correctIds = JSON.parse(String(correctAnswer || '[]')); } catch { correctIds = []; }
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-600">Answer options <span className="text-violet-600">(tick all correct)</span></label>
      <div className="space-y-2">
        {options.map((opt, oi) => {
          const isCorrect = correctIds.includes(opt.id);
          return (
            <div key={opt.id ?? oi} className="flex items-center gap-2 group/opt">
              <button
                type="button"
                onClick={() => {
                  const next = isCorrect ? correctIds.filter(id => id !== opt.id) : [...correctIds, opt.id];
                  onUpdate(options, JSON.stringify(next.length ? next : [opt.id]));
                }}
                className={cn(
                  'w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                  isCorrect ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 hover:border-slate-400'
                )}
              >
                {isCorrect && <Check className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={opt.text ?? ''}
                onChange={e => {
                  const next = [...options];
                  next[oi] = { ...next[oi], text: e.target.value };
                  onUpdate(next, correctAnswer);
                }}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = options.filter((_, i) => i !== oi);
                    onUpdate(next, JSON.stringify(correctIds.filter(id => id !== opt.id)));
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 opacity-0 group-hover/opt:opacity-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onUpdate([...options, { id: Math.random().toString(36).slice(2, 11), text: `Option ${options.length + 1}` }], correctAnswer)}
          className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pl-9 pt-1"
        >
          <Plus className="w-4 h-4" /> Add option
        </button>
      </div>
    </div>
  );
}

function ClozeEditor({ correctAnswer, onUpdate }: { correctAnswer: string; onUpdate: (ca: string) => void }) {
  let blanks: string[] = [];
  try { blanks = JSON.parse(correctAnswer || '[]'); } catch { blanks = []; }
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-600">Blank answers <span className="text-slate-400 text-[10px]">(in order of appearance)</span></label>
      {blanks.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
          <input
            type="text" value={b}
            onChange={e => { const n = [...blanks]; n[i] = e.target.value; onUpdate(JSON.stringify(n)); }}
            placeholder={`Blank ${i + 1}`}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {blanks.length > 1 && (
            <button type="button" onClick={() => onUpdate(JSON.stringify(blanks.filter((_, j) => j !== i)))}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onUpdate(JSON.stringify([...blanks, '']))}
        className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pt-1">
        <Plus className="w-4 h-4" /> Add blank
      </button>
    </div>
  );
}

function MatchingEditor({ correctAnswer, onUpdate }: {
  correctAnswer: string;
  onUpdate: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  let pairs: { left: string; right: string }[] = [];
  try { pairs = JSON.parse(correctAnswer || '[]'); } catch { pairs = []; }
  if (!pairs.length) pairs = [{ left: '', right: '' }, { left: '', right: '' }];
  const save = (p: typeof pairs) => onUpdate(p.map((x, i) => ({ id: String(i + 1), text: x.left })), JSON.stringify(p));
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-600">Matching pairs</label>
      <div className="space-y-2">
        {pairs.map((pair, pi) => (
          <div key={pi} className="flex items-center gap-2">
            <input type="text" value={pair.left}
              onChange={e => { const n = [...pairs]; n[pi] = { ...n[pi], left: e.target.value }; save(n); }}
              placeholder="Left side"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <span className="text-slate-400 font-bold shrink-0">↔</span>
            <input type="text" value={pair.right}
              onChange={e => { const n = [...pairs]; n[pi] = { ...n[pi], right: e.target.value }; save(n); }}
              placeholder="Right side"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            {pairs.length > 2 && (
              <button type="button" onClick={() => save(pairs.filter((_, i) => i !== pi))}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => save([...pairs, { left: '', right: '' }])}
          className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pt-1">
          <Plus className="w-4 h-4" /> Add pair
        </button>
      </div>
    </div>
  );
}

function OrderingEditor({ correctAnswer, onUpdate }: {
  correctAnswer: string;
  onUpdate: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  let items: string[] = [];
  try { items = JSON.parse(correctAnswer || '[]'); } catch { items = []; }
  if (!items.length) items = ['', '', ''];
  const save = (n: string[]) => onUpdate(n.map((t, i) => ({ id: String(i + 1), text: t })), JSON.stringify(n));
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-600">Items in correct order <span className="text-slate-400 text-[10px]">(students see them shuffled)</span></label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <input type="text" value={item}
              onChange={e => { const n = [...items]; n[i] = e.target.value; save(n); }}
              placeholder={`Item ${i + 1}`}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            {items.length > 2 && (
              <button type="button" onClick={() => save(items.filter((_, j) => j !== i))}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => save([...items, ''])}
          className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pt-1">
          <Plus className="w-4 h-4" /> Add item
        </button>
      </div>
    </div>
  );
}

function WordBankEditor({ options, correctAnswer, onUpdate }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  onUpdate: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Correct answer <span className="text-slate-400 text-[10px]">(the blank should be filled with this)</span></label>
        <input type="text" value={correctAnswer}
          onChange={e => onUpdate(options, e.target.value)}
          placeholder="Correct word"
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Word bank options <span className="text-slate-400 text-[10px]">(include the correct word)</span></label>
        <div className="space-y-2">
          {options.map((opt, oi) => (
            <div key={opt.id ?? oi} className="flex items-center gap-2">
              <input type="text" value={opt.text}
                onChange={e => { const n = [...options]; n[oi] = { ...n[oi], text: e.target.value }; onUpdate(n, correctAnswer); }}
                placeholder={`Word ${oi + 1}`}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              {options.length > 2 && (
                <button type="button" onClick={() => onUpdate(options.filter((_, i) => i !== oi), correctAnswer)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          <button type="button"
            onClick={() => onUpdate([...options, { id: Math.random().toString(36).slice(2, 11), text: '' }], correctAnswer)}
            className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pt-1">
            <Plus className="w-4 h-4" /> Add word
          </button>
        </div>
      </div>
    </div>
  );
}

function SentenceBuildingEditor({ options, correctAnswer, onUpdate }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  onUpdate: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-600">Words <span className="text-slate-400 text-[10px]">(students arrange into a sentence)</span></label>
      <div className="space-y-2">
        {options.map((opt, oi) => (
          <div key={opt.id ?? oi} className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 w-5 text-center">{oi + 1}</span>
            <input type="text" value={opt.text}
              onChange={e => {
                const n = [...options];
                n[oi] = { ...n[oi], text: e.target.value };
                onUpdate(n, n.map(w => w.text).join(' '));
              }}
              placeholder={`Word ${oi + 1}`}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            {options.length > 2 && (
              <button type="button" onClick={() => { const n = options.filter((_, i) => i !== oi); onUpdate(n, n.map(w => w.text).join(' ')); }}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button"
          onClick={() => { const n = [...options, { id: Math.random().toString(36).slice(2, 11), text: '' }]; onUpdate(n, n.map(w => w.text).join(' ')); }}
          className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pt-1">
          <Plus className="w-4 h-4" /> Add word
        </button>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Correct sentence</label>
        <input type="text" value={correctAnswer}
          onChange={e => onUpdate(options, e.target.value)}
          placeholder="The correct full sentence"
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>
    </div>
  );
}
