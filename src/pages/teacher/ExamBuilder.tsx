import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { authFetch, readApiError } from '../../lib/apiUrl';
import {
  ChevronLeft, Sparkles, Loader2, Plus, Trash2, Save,
  FileText, Check, X, BookOpen, Clock, Target,
  CheckSquare, GraduationCap, Circle, Type, AlignLeft,
  TextCursorInput, Layers, Shuffle, GripVertical,
  Headphones, Mic, LayoutList, PenLine, Volume2,
  ChevronDown, ChevronUp,
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
  { type: 'multiple-choice', label: 'MCQ', icon: CheckSquare },
  { type: 'multiple-answer', label: 'Multi ✓', icon: CheckSquare },
  { type: 'true-false', label: 'True / False', icon: Circle },
  { type: 'fill-in-the-blank', label: 'Fill Blank', icon: TextCursorInput },
  { type: 'cloze', label: 'Cloze', icon: LayoutList },
  { type: 'short-answer', label: 'Short Answer', icon: Type },
  { type: 'long-answer', label: 'Essay', icon: AlignLeft },
  { type: 'open-text', label: 'Open Text', icon: Type },
  { type: 'matching', label: 'Matching', icon: Layers },
  { type: 'ordering', label: 'Ordering', icon: Shuffle },
  { type: 'drag-drop', label: 'Drag & Drop', icon: GripVertical },
  { type: 'word-bank', label: 'Word Bank', icon: FileText },
  { type: 'sentence-building', label: 'Sentence', icon: TextCursorInput },
  { type: 'reading-comprehension', label: 'Reading', icon: BookOpen },
  { type: 'listening', label: 'Listening', icon: Headphones },
  { type: 'audio-fill-blank', label: 'Audio Blank', icon: Volume2 },
  { type: 'dictation', label: 'Dictation', icon: PenLine },
  { type: 'speaking', label: 'Speaking', icon: Mic },
  { type: 'pronunciation', label: 'Pronunciation', icon: Mic },
  { type: 'instruction', label: 'Text / Note', icon: AlignLeft },
];

function makeBlankQuestion(type: QuestionType, order: number): ExamQuestion {
  const base: ExamQuestion = { type, text: '', correctAnswer: '', explanation: '', points: type === 'instruction' ? 0 : type === 'long-answer' ? 2 : type === 'matching' ? 3 : 1, order };
  switch (type) {
    case 'multiple-choice':
    case 'image':
      return { ...base, options: [{ id: '1', text: 'Option A' }, { id: '2', text: 'Option B' }, { id: '3', text: 'Option C' }, { id: '4', text: 'Option D' }] };
    case 'multiple-answer':
    case 'listening':
    case 'reading-comprehension':
      return { ...base, options: [{ id: '1', text: 'Option A' }, { id: '2', text: 'Option B' }, { id: '3', text: 'Option C' }, { id: '4', text: 'Option D' }], correctAnswer: '[]' };
    case 'true-false':
      return { ...base, options: [{ id: '1', text: 'True' }, { id: '2', text: 'False' }] };
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
    'drag-drop', 'cloze', 'listening', 'audio-fill-blank', 'dictation', 'speaking', 'pronunciation', 'reading-comprehension',
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
  const [showTypePicker, setShowTypePicker] = useState(false);

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
            typeof o === 'string' ? { id: String(idx + 1), text: o } : { id: String(o.id ?? idx + 1), text: String(o.text ?? o.label ?? o.value ?? '') }
          );
          return {
            id: q.id,
            type: (q.type || 'multiple-choice') as QuestionType,
            text: q.text || q.question_text || '',
            options: opts.length ? opts : undefined,
            correctAnswer: typeof q.correct_answer === 'string' ? q.correct_answer : JSON.stringify(q.correct_answer ?? ''),
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
          typeof o === 'string' ? { id: String(idx + 1), text: o } : { id: String(o.id ?? idx + 1), text: String(o.text ?? o.label ?? o.value ?? '') }
        );
        return {
          type: (q.type || 'multiple-choice') as QuestionType,
          text: q.text || q.question_text || '',
          options: opts.length ? opts : undefined,
          correctAnswer: typeof q.correct_answer === 'string' ? q.correct_answer : (typeof q.correctAnswer === 'string' ? q.correctAnswer : ''),
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
    setShowTypePicker(false);
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
          <button onClick={() => navigate('/teacher/exams')} className="text-indigo-600 text-sm font-semibold hover:underline">
            Back to Exams
          </button>
        </div>
      </TeacherLayout>
    );
  }

  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0);

  return (
    <TeacherLayout>
      <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7">
        {/* Header */}
        <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4f46e5 100%)' }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative px-6 sm:px-8 lg:px-10 py-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <button onClick={() => navigate('/teacher/exams')} className="flex items-center gap-2 text-indigo-200 hover:text-white text-sm font-medium transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back to Exams
              </button>
              <div className="flex items-center gap-3">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 16px rgba(245,158,11,0.4)' }}
                >
                  <Sparkles className="w-4 h-4" /> Generate with AI
                </motion.button>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={handleSave} disabled={saving}
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
                {exam.courseName && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{exam.courseName}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{exam.timeLimit} min</span>
                <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" />Pass mark: {exam.passMark}%</span>
                <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />{questions.length} questions · {totalPoints} pts</span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 lg:px-12 py-8" style={{ background: '#f1f5f9' }}>
          <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6">

            {/* Sidebar: add questions */}
            <div className="lg:w-56 shrink-0 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add Question</h3>
                <button
                  onClick={() => setShowTypePicker(v => !v)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #312e81, #4f46e5)' }}
                >
                  <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Choose type</span>
                  {showTypePicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                <AnimatePresence>
                  {showTypePicker && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
                          <button
                            key={type}
                            onClick={() => addQuestion(type)}
                            className="flex flex-col items-center gap-1 p-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wide bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-100 hover:border-indigo-200 transition-all"
                          >
                            <Icon className="w-4 h-4" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => setAiOpen(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  <Sparkles className="w-4 h-4" /> AI Generate
                </button>
              </div>

              {questions.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Questions</h3>
                  {questions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => document.getElementById(`q-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                      className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors group"
                    >
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-xs text-slate-500 truncate flex-1">{q.text || <em className="text-slate-400">Untitled</em>}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Exam paper */}
            <div className="flex-1 min-w-0">
              <div className="bg-white shadow-xl rounded-sm" style={{ boxShadow: '0 4px 40px rgba(0,0,0,0.12)' }}>
                {/* Paper header */}
                <div className="border-b-4 border-slate-900 px-8 py-8">
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
                    <div className="border-b border-slate-400 pb-1"><span className="text-xs uppercase tracking-wider text-slate-500">Candidate Name</span></div>
                    <div className="border-b border-slate-400 pb-1"><span className="text-xs uppercase tracking-wider text-slate-500">Date</span></div>
                  </div>
                </div>

                <div className="px-8 py-4 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Instructions</p>
                  <p className="text-sm text-slate-700">Answer all questions. Indicate the correct answer for each question using the provided space.</p>
                </div>

                {/* Questions */}
                <div className="px-8 py-8 space-y-10">
                  {questions.length === 0 ? (
                    <div className="py-20 text-center">
                      <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-500 mb-2">No questions yet</h3>
                      <p className="text-slate-400 text-sm mb-6">Use "Generate with AI" or add questions manually.</p>
                      <div className="flex justify-center gap-3">
                        <button onClick={() => setAiOpen(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                          <Sparkles className="w-4 h-4" /> Generate with AI
                        </button>
                        <button onClick={() => setShowTypePicker(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">
                          <Plus className="w-4 h-4" /> Add manually
                        </button>
                      </div>
                    </div>
                  ) : (
                    questions.map((q, idx) => (
                      <QuestionCard
                        key={idx}
                        idx={idx}
                        q={q}
                        total={questions.length}
                        onChange={(patch) => updateQuestion(idx, patch)}
                        onRemove={() => removeQuestion(idx)}
                      />
                    ))
                  )}

                  {questions.length > 0 && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => setShowTypePicker(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add question
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t-2 border-slate-900 px-8 py-4 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-widest">— End of Examination —</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Modal */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
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
                  <input type="text" value={aiTopic} onChange={e => setAiTopic(e.target.value)}
                    placeholder="e.g. English Grammar – Present Perfect Tense"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Difficulty</label>
                    <select value={aiLevel} onChange={e => setAiLevel(e.target.value)}
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
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Count</label>
                    <input type="number" min={1} max={30} value={aiCount}
                      onChange={e => setAiCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Language</label>
                  <select value={aiLang} onChange={e => setAiLang(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {['English', 'Albanian', 'German', 'French', 'Spanish', 'Italian', 'Arabic', 'Turkish'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Question Types</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: 'multiple-choice', label: 'Multiple Choice' },
                      { v: 'true-false', label: 'True / False' },
                      { v: 'short-answer', label: 'Short Answer' },
                      { v: 'fill-in-the-blank', label: 'Fill in the Blank' },
                      { v: 'matching', label: 'Matching' },
                      { v: 'ordering', label: 'Ordering' },
                    ].map(({ v, label }) => {
                      const on = aiTypes.includes(v);
                      return (
                        <button key={v} type="button"
                          onClick={() => setAiTypes(prev => on ? prev.filter(x => x !== v) : [...prev, v])}
                          className={cn('text-xs font-semibold px-3 py-2 rounded-lg border transition-all text-left', on ? 'bg-amber-50 border-amber-400 text-amber-800' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
                        >
                          {on && '✓ '}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleGenerate} disabled={generating || !aiTopic.trim() || !aiTypes.length}
                className="w-full py-4 rounded-2xl font-extrabold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 20px rgba(245,158,11,0.4)' }}
              >
                {generating ? <><Loader2 className="w-5 h-5 animate-spin" />Generating…</> : <><Sparkles className="w-5 h-5" />Generate Questions</>}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}

function QuestionCard({ idx, q, total, onChange, onRemove }: {
  idx: number;
  q: ExamQuestion;
  total: number;
  onChange: (patch: Partial<ExamQuestion>) => void;
  onRemove: () => void;
}) {
  const [showTypeMenu, setShowTypeMenu] = React.useState(false);

  const handleTypeChange = (newType: QuestionType) => {
    const blank = makeBlankQuestion(newType, idx);
    onChange({ ...blank, text: q.text, explanation: q.explanation, points: newType === 'instruction' ? 0 : q.points });
    setShowTypeMenu(false);
  };

  const currentTypeLabel = QUESTION_TYPES.find(t => t.type === q.type)?.label
    ?? (q.type || 'multiple-choice').replace(/-/g, ' ');
  const CurrentIcon = QUESTION_TYPES.find(t => t.type === q.type)?.icon ?? CheckSquare;

  return (
    <motion.div id={`q-${idx}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group">
      <div className="flex items-start gap-4">
        {/* Number badge + type selector */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 pt-1 relative">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #312e81, #4f46e5)' }}>
            {idx + 1}
          </span>
          <button
            type="button"
            onClick={() => setShowTypeMenu(v => !v)}
            title="Change question type"
            className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 uppercase tracking-wide text-center leading-tight bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-1.5 py-0.5 transition-colors"
          >
            <CurrentIcon className="w-2.5 h-2.5 shrink-0" />
            <span className="max-w-[52px] truncate">{currentTypeLabel}</span>
          </button>

          {/* Type dropdown */}
          <AnimatePresence>
            {showTypeMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTypeMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full left-0 mt-1 z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 p-3 w-52"
                >
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Change question type</p>
                  <div className="grid grid-cols-2 gap-1">
                    {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleTypeChange(type)}
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

        <div className="flex-1 space-y-4">
          {/* Question text */}
          <textarea
            value={q.text}
            onChange={e => onChange({ text: e.target.value })}
            rows={q.type === 'instruction' ? 5 : 2}
            placeholder={q.type === 'instruction' ? 'Write instructions or reading passage for students…' : 'Enter question text…'}
            className="w-full text-slate-900 font-medium text-[15px] leading-relaxed bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-400 focus:outline-none resize-none pb-1"
            style={{ fontFamily: 'Georgia, serif' }}
          />

          {/* Reading passage */}
          {q.type === 'reading-comprehension' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Reading Passage</label>
              <textarea
                value={q.readingPassage || ''}
                onChange={e => onChange({ readingPassage: e.target.value })}
                rows={5}
                placeholder="Paste the reading passage here…"
                className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>
          )}

          {/* MCQ / True-False / Listening / Reading-Comprehension */}
          {(q.type === 'multiple-choice' || q.type === 'true-false' || q.type === 'listening' || q.type === 'reading-comprehension') && (
            <OptionsEditor
              options={q.options || []}
              correctAnswer={q.correctAnswer}
              multiSelect={false}
              canAddRemove={q.type === 'multiple-choice' || q.type === 'listening' || q.type === 'reading-comprehension'}
              onChange={(opts, ca) => onChange({ options: opts, correctAnswer: ca })}
            />
          )}

          {/* Multiple Answer */}
          {q.type === 'multiple-answer' && (
            <MultiAnswerEditor
              options={q.options || []}
              correctAnswer={q.correctAnswer}
              onChange={(opts, ca) => onChange({ options: opts, correctAnswer: ca })}
            />
          )}

          {/* Fill blank / Open text */}
          {(q.type === 'fill-in-the-blank' || q.type === 'open-text') && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {q.type === 'fill-in-the-blank' ? 'Acceptable answers (comma-separated)' : 'Correct keywords (comma-separated)'}
              </label>
              <input type="text" value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                onChange={e => onChange({ correctAnswer: e.target.value })}
                placeholder="e.g. answer1, answer2"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}

          {/* Short / Long answer */}
          {(q.type === 'short-answer' || q.type === 'long-answer') && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {q.type === 'short-answer' ? 'Model answer / keywords' : 'Model answer or rubric hints'}
              </label>
              <textarea
                rows={q.type === 'long-answer' ? 4 : 2}
                value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                onChange={e => onChange({ correctAnswer: e.target.value })}
                placeholder={q.type === 'short-answer' ? 'Expected answer…' : 'Sample answer or rubric hints…'}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>
          )}

          {/* Cloze */}
          {q.type === 'cloze' && (
            <ClozeEditor correctAnswer={q.correctAnswer} onChange={ca => onChange({ correctAnswer: ca })} />
          )}

          {/* Matching */}
          {q.type === 'matching' && (
            <MatchingEditor correctAnswer={q.correctAnswer} onChange={(opts, ca) => onChange({ options: opts, correctAnswer: ca })} />
          )}

          {/* Ordering / Drag-Drop */}
          {(q.type === 'ordering' || q.type === 'drag-drop') && (
            <OrderingEditor correctAnswer={q.correctAnswer} onChange={(opts, ca) => onChange({ options: opts, correctAnswer: ca })} />
          )}

          {/* Word Bank */}
          {q.type === 'word-bank' && (
            <WordBankEditor
              options={q.options || []}
              correctAnswer={q.correctAnswer}
              onChange={(opts, ca) => onChange({ options: opts, correctAnswer: ca })}
            />
          )}

          {/* Sentence Building */}
          {q.type === 'sentence-building' && (
            <SentenceBuildingEditor
              options={q.options || []}
              correctAnswer={q.correctAnswer}
              onChange={(opts, ca) => onChange({ options: opts, correctAnswer: ca })}
            />
          )}

          {/* Listening / Dictation / Speaking / Pronunciation / Audio-Fill-Blank — audio URL */}
          {(q.type === 'listening' || q.type === 'dictation' || q.type === 'audio-fill-blank' || q.type === 'speaking' || q.type === 'pronunciation') && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Audio URL (optional)</label>
              <input type="url" value={q.mediaUrl || ''}
                onChange={e => onChange({ mediaUrl: e.target.value })}
                placeholder="https://… or leave blank"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}

          {/* Explanation + points row */}
          {q.type !== 'instruction' && (
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <input type="text" value={q.explanation}
                onChange={e => onChange({ explanation: e.target.value })}
                placeholder="Explanation (optional)"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-slate-500">Pts:</span>
                <input type="number" min={0} max={100} value={q.points}
                  onChange={e => onChange({ points: parseInt(e.target.value) || 0 })}
                  className="w-16 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Remove */}
        <button type="button" onClick={onRemove}
          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {idx < total - 1 && <div className="mt-10 border-b border-dashed border-slate-200" />}
    </motion.div>
  );
}

function OptionsEditor({ options, correctAnswer, multiSelect, canAddRemove, onChange }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  multiSelect: boolean;
  canAddRemove: boolean;
  onChange: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  const LETTERS = 'ABCDEFGH';
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500">Answer options</label>
      {options.map((opt, oi) => (
        <div key={opt.id ?? oi} className="flex items-center gap-3 group/opt">
          <button type="button"
            onClick={() => onChange(options, opt.id)}
            title="Mark as correct"
            className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
              correctAnswer === opt.id ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'
            )}
          >
            {correctAnswer === opt.id && <Check className="w-3 h-3" />}
          </button>
          <span className="text-sm font-bold text-slate-400 shrink-0 w-5">{LETTERS[oi]}.</span>
          <input type="text" value={opt.text}
            onChange={e => {
              const next = [...options];
              const wasCorrect = correctAnswer === next[oi].id;
              next[oi] = { ...next[oi], text: e.target.value };
              onChange(next, wasCorrect ? next[oi].id : correctAnswer);
            }}
            placeholder={`Option ${LETTERS[oi]}`}
            className="flex-1 text-sm text-slate-700 bg-transparent border-b border-dashed border-slate-200 focus:border-indigo-300 focus:outline-none py-0.5"
          />
          {canAddRemove && options.length > 2 && (
            <button type="button"
              onClick={() => {
                const next = options.filter((_, i) => i !== oi);
                onChange(next, correctAnswer === opt.id ? '' : correctAnswer);
              }}
              className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover/opt:opacity-100 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {canAddRemove && (
        <button type="button"
          onClick={() => onChange([...options, { id: Math.random().toString(36).slice(2, 10), text: `Option ${LETTERS[options.length] || (options.length + 1)}` }], correctAnswer)}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 pl-8 pt-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add option
        </button>
      )}
    </div>
  );
}

function MultiAnswerEditor({ options, correctAnswer, onChange }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  onChange: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  let correctIds: string[] = [];
  try { correctIds = JSON.parse(correctAnswer || '[]'); } catch { correctIds = []; }
  const LETTERS = 'ABCDEFGH';
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500">Answer options <span className="text-indigo-500">(check all correct)</span></label>
      {options.map((opt, oi) => {
        const isCorrect = correctIds.includes(opt.id);
        return (
          <div key={opt.id ?? oi} className="flex items-center gap-3 group/opt">
            <button type="button"
              onClick={() => {
                const next = isCorrect ? correctIds.filter(id => id !== opt.id) : [...correctIds, opt.id];
                onChange(options, JSON.stringify(next));
              }}
              className={cn('w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all',
                isCorrect ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'
              )}
            >
              {isCorrect && <Check className="w-3 h-3" />}
            </button>
            <span className="text-sm font-bold text-slate-400 shrink-0 w-5">{LETTERS[oi]}.</span>
            <input type="text" value={opt.text}
              onChange={e => {
                const next = [...options];
                next[oi] = { ...next[oi], text: e.target.value };
                onChange(next, correctAnswer);
              }}
              className="flex-1 text-sm text-slate-700 bg-transparent border-b border-dashed border-slate-200 focus:border-indigo-300 focus:outline-none py-0.5"
            />
            {options.length > 2 && (
              <button type="button"
                onClick={() => {
                  const next = options.filter((_, i) => i !== oi);
                  const newCorrect = correctIds.filter(id => id !== opt.id);
                  onChange(next, JSON.stringify(newCorrect));
                }}
                className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover/opt:opacity-100 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <button type="button"
        onClick={() => onChange([...options, { id: Math.random().toString(36).slice(2, 10), text: `Option ${LETTERS[options.length] || (options.length + 1)}` }], correctAnswer)}
        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 pl-8 pt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Add option
      </button>
    </div>
  );
}

function ClozeEditor({ correctAnswer, onChange }: { correctAnswer: string; onChange: (ca: string) => void }) {
  let blanks: string[] = [];
  try { blanks = JSON.parse(correctAnswer || '[]'); } catch { blanks = []; }
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500">Blank answers (in order)</label>
      {blanks.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 w-6 text-center">{i + 1}.</span>
          <input type="text" value={b}
            onChange={e => { const n = [...blanks]; n[i] = e.target.value; onChange(JSON.stringify(n)); }}
            placeholder={`Blank ${i + 1}`}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {blanks.length > 1 && (
            <button type="button" onClick={() => { const n = blanks.filter((_, j) => j !== i); onChange(JSON.stringify(n)); }}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ))}
      <button type="button"
        onClick={() => onChange(JSON.stringify([...blanks, '']))}
        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 pt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Add blank
      </button>
    </div>
  );
}

function MatchingEditor({ correctAnswer, onChange }: {
  correctAnswer: string;
  onChange: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  let pairs: { left: string; right: string }[] = [];
  try { pairs = JSON.parse(correctAnswer || '[]'); } catch { pairs = []; }
  if (!pairs.length) pairs = [{ left: '', right: '' }, { left: '', right: '' }];
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500">Matching pairs</label>
      {pairs.map((pair, pi) => (
        <div key={pi} className="flex items-center gap-2">
          <input type="text" value={pair.left}
            onChange={e => { const n = [...pairs]; n[pi] = { ...n[pi], left: e.target.value }; onChange(n.map((p, i) => ({ id: String(i + 1), text: p.left })), JSON.stringify(n)); }}
            placeholder="Left side"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <span className="text-slate-400 font-bold shrink-0">↔</span>
          <input type="text" value={pair.right}
            onChange={e => { const n = [...pairs]; n[pi] = { ...n[pi], right: e.target.value }; onChange(n.map((p, i) => ({ id: String(i + 1), text: p.left })), JSON.stringify(n)); }}
            placeholder="Right side"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {pairs.length > 2 && (
            <button type="button" onClick={() => { const n = pairs.filter((_, i) => i !== pi); onChange(n.map((p, i) => ({ id: String(i + 1), text: p.left })), JSON.stringify(n)); }}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ))}
      <button type="button"
        onClick={() => { const n = [...pairs, { left: '', right: '' }]; onChange(n.map((p, i) => ({ id: String(i + 1), text: p.left })), JSON.stringify(n)); }}
        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 pt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Add pair
      </button>
    </div>
  );
}

function OrderingEditor({ correctAnswer, onChange }: {
  correctAnswer: string;
  onChange: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  let items: string[] = [];
  try { items = JSON.parse(correctAnswer || '[]'); } catch { items = []; }
  if (!items.length) items = ['', '', ''];
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500">Items in correct order <span className="text-slate-400 text-[10px]">(students see shuffled)</span></label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
          <input type="text" value={item}
            onChange={e => { const n = [...items]; n[i] = e.target.value; onChange(n.map((t, j) => ({ id: String(j + 1), text: t })), JSON.stringify(n)); }}
            placeholder={`Item ${i + 1}`}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {items.length > 2 && (
            <button type="button" onClick={() => { const n = items.filter((_, j) => j !== i); onChange(n.map((t, j) => ({ id: String(j + 1), text: t })), JSON.stringify(n)); }}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ))}
      <button type="button"
        onClick={() => { const n = [...items, '']; onChange(n.map((t, j) => ({ id: String(j + 1), text: t })), JSON.stringify(n)); }}
        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 pt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Add item
      </button>
    </div>
  );
}

function WordBankEditor({ options, correctAnswer, onChange }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  onChange: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Correct answer</label>
        <input type="text" value={correctAnswer}
          onChange={e => onChange(options, e.target.value)}
          placeholder="The correct word/phrase"
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Word bank options <span className="text-slate-400 text-[10px]">(include the correct word)</span></label>
        <div className="space-y-2">
          {options.map((opt, oi) => (
            <div key={opt.id ?? oi} className="flex items-center gap-2">
              <input type="text" value={opt.text}
                onChange={e => { const n = [...options]; n[oi] = { ...n[oi], text: e.target.value }; onChange(n, correctAnswer); }}
                placeholder={`Word ${oi + 1}`}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {options.length > 2 && (
                <button type="button" onClick={() => onChange(options.filter((_, i) => i !== oi), correctAnswer)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          <button type="button"
            onClick={() => onChange([...options, { id: Math.random().toString(36).slice(2, 10), text: '' }], correctAnswer)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 pt-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add word
          </button>
        </div>
      </div>
    </div>
  );
}

function SentenceBuildingEditor({ options, correctAnswer, onChange }: {
  options: Array<{ id: string; text: string }>;
  correctAnswer: string;
  onChange: (opts: Array<{ id: string; text: string }>, ca: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-500">Words <span className="text-slate-400 text-[10px]">(students arrange into a sentence)</span></label>
      <div className="space-y-2">
        {options.map((opt, oi) => (
          <div key={opt.id ?? oi} className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 w-5 text-center">{oi + 1}</span>
            <input type="text" value={opt.text}
              onChange={e => { const n = [...options]; n[oi] = { ...n[oi], text: e.target.value }; onChange(n, n.map(w => w.text).join(' ')); }}
              placeholder={`Word ${oi + 1}`}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {options.length > 2 && (
              <button type="button" onClick={() => { const n = options.filter((_, i) => i !== oi); onChange(n, n.map(w => w.text).join(' ')); }}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button"
          onClick={() => { const n = [...options, { id: Math.random().toString(36).slice(2, 10), text: '' }]; onChange(n, n.map(w => w.text).join(' ')); }}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 pt-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add word
        </button>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Correct sentence</label>
        <input type="text" value={correctAnswer}
          onChange={e => onChange(options, e.target.value)}
          placeholder="The correct sentence"
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
    </div>
  );
}
