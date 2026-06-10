import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { HEADWAY_FULL_DATA } from '../../lib/headwayData';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  ChevronRight, ChevronLeft, Sparkles, Check,
  Clock, Target, Layers, Loader2, X, ArrowRight,
  GraduationCap, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AI_QUESTION_TYPE_LABELS } from '../../lib/gemini';
import type { AIQuestionType } from '../../lib/gemini';

const LEVELS = [
  { key: 'Beginner',          label: 'Beginner',           color: 'from-emerald-500 to-teal-600',    ring: 'ring-emerald-300', badge: 'bg-emerald-100 text-emerald-700', cefr: 'A1' },
  { key: 'Elementary',        label: 'Elementary',         color: 'from-sky-500 to-blue-600',        ring: 'ring-sky-300',     badge: 'bg-sky-100 text-sky-700',         cefr: 'A2' },
  { key: 'Pre-Intermediate',  label: 'Pre-Intermediate',   color: 'from-violet-500 to-purple-600',   ring: 'ring-violet-300',  badge: 'bg-violet-100 text-violet-700',   cefr: 'B1' },
  { key: 'Intermediate',      label: 'Intermediate',       color: 'from-orange-500 to-amber-600',    ring: 'ring-orange-300',  badge: 'bg-orange-100 text-orange-700',   cefr: 'B1+' },
  { key: 'Upper-Intermediate',label: 'Upper-Intermediate', color: 'from-rose-500 to-pink-600',       ring: 'ring-rose-300',    badge: 'bg-rose-100 text-rose-700',       cefr: 'B2' },
  { key: 'Advanced',          label: 'Advanced',           color: 'from-indigo-600 to-blue-700',     ring: 'ring-indigo-300',  badge: 'bg-indigo-100 text-indigo-700',   cefr: 'C1' },
];

interface Section {
  id: string;
  unitNum: number;
  unitTitle: string;
  topic: string;
  type: 'grammar' | 'vocabulary';
}

interface Course { id: string; title?: string; name?: string; }

const STEPS = ['Level', 'Sections', 'Settings'];

export default function SmartTestBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<typeof LEVELS[0] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState(30);
  const [passmark, setPassmark] = useState(70);
  const [questionsPerSection, setQuestionsPerSection] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<'grammar' | 'vocabulary' | 'both'>('grammar');
  const [questionTypes, setQuestionTypes] = useState<AIQuestionType[]>(['multiple-choice', 'true-false', 'fill-in-the-blank']);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await authFetch(`/api/teacher/courses?userId=${session.user.id}`);
      if (res.ok) {
        const json = await res.json();
        setCourses(Array.isArray(json) ? json : (json.courses ?? []));
      }
    };
    load();
  }, []);

  const sections: Section[] = useMemo(() => {
    if (!selectedLevel) return [];
    const levelData = HEADWAY_FULL_DATA[selectedLevel.key];
    if (!levelData) return [];
    const result: Section[] = [];
    for (const unit of levelData.units) {
      for (const gr of unit.grammar) {
        result.push({
          id: `g-${unit.num}-${gr.topic}`,
          unitNum: unit.num,
          unitTitle: unit.title,
          topic: gr.topic,
          type: 'grammar',
        });
      }
      for (const vc of unit.vocabulary) {
        result.push({
          id: `v-${unit.num}-${vc.topic}`,
          unitNum: unit.num,
          unitTitle: unit.title,
          topic: vc.topic,
          type: 'vocabulary',
        });
      }
    }
    return result;
  }, [selectedLevel]);

  const visibleSections = useMemo(() => {
    if (sectionFilter === 'grammar') return sections.filter(s => s.type === 'grammar');
    if (sectionFilter === 'vocabulary') return sections.filter(s => s.type === 'vocabulary');
    return sections;
  }, [sections, sectionFilter]);

  const halfIdx = Math.ceil(visibleSections.length / 2);
  const leftCol = visibleSections.slice(0, halfIdx);
  const rightCol = visibleSections.slice(halfIdx);

  const toggleSection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(prev => new Set([...prev, ...visibleSections.map(s => s.id)]));
  const clearAll = () => setSelectedIds(prev => {
    const next = new Set(prev);
    visibleSections.forEach(s => next.delete(s.id));
    return next;
  });

  const handleLevelSelect = (level: typeof LEVELS[0]) => {
    setSelectedLevel(level);
    setSelectedIds(new Set());
    const lvlName = `Headway ${level.label} Test`;
    setTitle(lvlName);
    setStep(1);
  };

  const handleMakeTest = async () => {
    if (selectedIds.size === 0) {
      toast.error('Please select at least one section');
      return;
    }
    if (!courseId) {
      toast.error('Please select a course');
      return;
    }
    if (!title.trim()) {
      toast.error('Please enter a quiz title');
      return;
    }

    setGenerating(true);
    try {
      const selectedSections = sections.filter(s => selectedIds.has(s.id));
      const res = await authFetch('/api/teacher/smart-quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel!.key,
          selectedSections: selectedSections.map(s => ({
            id: s.id,
            topic: s.topic,
            type: s.type,
            unitTitle: s.unitTitle,
          })),
          courseId,
          title: title.trim(),
          timeLimit,
          passmark,
          questionsPerSection,
          questionTypes,
        }),
      });
      if (!res.ok) {
        const err = await readApiError(res);
        throw new Error(err);
      }
      const json = await res.json();
      toast.success('Test created successfully!');
      navigate(`/teacher/quizzes/edit/${json.quizId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to generate quiz';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <TeacherLayout>
      <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div
          className="relative overflow-hidden px-6 sm:px-8 lg:px-10 py-10"
          style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)' }}
        >
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3">
                <span className="text-indigo-400 tracking-wider uppercase cursor-pointer hover:text-indigo-300" onClick={() => navigate('/teacher/quizzes')}>Quizzes</span>
                <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                <span className="text-indigo-200 tracking-wider uppercase">Test Builder</span>
              </nav>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Smart Test Builder</h1>
                  <p className="text-indigo-200 text-sm mt-0.5">Headway-style · Select sections · AI generates your test</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/teacher/quizzes')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-indigo-200 hover:text-white hover:bg-white/10 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Quizzes
            </button>
          </div>

          {/* Step indicator */}
          <div className="relative mt-8 flex items-center gap-0">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    i < step ? "bg-white text-indigo-700" :
                    i === step ? "bg-amber-400 text-slate-900" :
                    "bg-white/20 text-white/60"
                  )}>
                    {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn("text-xs font-semibold", i === step ? "text-white" : "text-indigo-300")}>{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className={cn("flex-1 h-px mx-3", i < step ? "bg-white/60" : "bg-white/20")} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 sm:px-8 lg:px-10 py-8 bg-slate-50 min-h-[600px]">
          <AnimatePresence mode="wait">

            {/* Step 0: Level Selection */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25 }}>
                <div className="max-w-4xl mx-auto">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-slate-800">Select a Level</h2>
                    <p className="text-slate-500 mt-1.5 text-sm">Choose the English proficiency level for your test</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {LEVELS.map(level => (
                      <motion.button
                        key={level.key}
                        whileHover={{ scale: 1.03, y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleLevelSelect(level)}
                        className="relative overflow-hidden rounded-2xl p-6 text-left shadow-md hover:shadow-xl transition-all group"
                        style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }}
                      >
                        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90 group-hover:opacity-100 transition-opacity", level.color)} />
                        <div className="relative">
                          <div className="flex items-start justify-between mb-4">
                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                              <GraduationCap className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                              {level.cefr}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-white">{level.label}</h3>
                          <p className="text-white/70 text-xs mt-1">
                            {HEADWAY_FULL_DATA[level.key]?.units.length ?? 0} units available
                          </p>
                          <div className="flex items-center gap-1 mt-4 text-white/80 text-xs font-medium group-hover:text-white transition-colors">
                            Select <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 1: Section Selection (Headway Style) */}
            {step === 1 && selectedLevel && (
              <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25 }}>
                <div className="max-w-3xl mx-auto">

                  {/* Headway-style card */}
                  <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
                    {/* Card header — orange like OUP Headway */}
                    <div className="px-6 py-4 border-b-4 border-orange-500 bg-slate-50">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <h2 className="text-base font-bold text-orange-600">Headway {selectedLevel.label}</h2>
                          <p className="text-sm font-medium text-slate-700 mt-0.5">Select your sections and make your test</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Grammar / Vocabulary / Both tabs */}
                          <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-semibold">
                            {(['grammar', 'vocabulary', 'both'] as const).map((f, i) => (
                              <button
                                key={f}
                                onClick={() => setSectionFilter(f)}
                                className={cn(
                                  "px-3 py-1.5 transition-colors capitalize",
                                  i > 0 && "border-l border-slate-200",
                                  sectionFilter === f
                                    ? f === 'grammar' ? "bg-indigo-600 text-white"
                                      : f === 'vocabulary' ? "bg-orange-500 text-white"
                                      : "bg-slate-700 text-white"
                                    : "text-slate-500 hover:bg-slate-50"
                                )}
                              >
                                {f === 'both' ? 'Both' : f.charAt(0).toUpperCase() + f.slice(1)}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={selectAll}
                            className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium transition-colors border border-teal-200"
                          >
                            Select All
                          </button>
                          <button
                            onClick={clearAll}
                            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Section grid — 2 columns, Headway style */}
                    <div className="p-1">
                      <div className="grid grid-cols-2">
                        {/* Left column */}
                        <div className="border-r border-slate-100">
                          {leftCol.map((sec, i) => {
                            const checked = selectedIds.has(sec.id);
                            return (
                              <motion.button
                                key={sec.id}
                                onClick={() => toggleSection(sec.id)}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-all border-b border-slate-100 last:border-b-0",
                                  "hover:bg-teal-50 focus:outline-none",
                                  checked ? "bg-teal-500/10" : "bg-white",
                                  i % 2 === 0 && !checked ? "bg-white" : ""
                                )}
                                whileTap={{ scale: 0.99 }}
                              >
                                <div className="flex-1 min-w-0 pr-3">
                                  <span className={cn(
                                    "text-sm font-medium truncate block",
                                    checked ? "text-teal-800" : "text-slate-700"
                                  )}>
                                    {sec.topic}
                                  </span>
                                  {sectionFilter === 'both' && (
                                    <span className={cn("text-[10px] font-medium", sec.type === 'grammar' ? "text-indigo-400" : "text-orange-400")}>
                                      {sec.type === 'grammar' ? 'Grammar' : 'Vocabulary'}
                                    </span>
                                  )}
                                </div>
                                <div className={cn(
                                  "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                                  checked
                                    ? "bg-teal-500 border-teal-500"
                                    : "bg-white border-slate-300 hover:border-teal-400"
                                )}>
                                  {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>

                        {/* Right column */}
                        <div>
                          {rightCol.map((sec) => {
                            const checked = selectedIds.has(sec.id);
                            return (
                              <motion.button
                                key={sec.id}
                                onClick={() => toggleSection(sec.id)}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-all border-b border-slate-100 last:border-b-0",
                                  "hover:bg-teal-50 focus:outline-none",
                                  checked ? "bg-teal-500/10" : "bg-white"
                                )}
                                whileTap={{ scale: 0.99 }}
                              >
                                <div className="flex-1 min-w-0 pr-3">
                                  <span className={cn(
                                    "text-sm font-medium truncate block",
                                    checked ? "text-teal-800" : "text-slate-700"
                                  )}>
                                    {sec.topic}
                                  </span>
                                  {sectionFilter === 'both' && (
                                    <span className={cn("text-[10px] font-medium", sec.type === 'grammar' ? "text-indigo-400" : "text-orange-400")}>
                                      {sec.type === 'grammar' ? 'Grammar' : 'Vocabulary'}
                                    </span>
                                  )}
                                </div>
                                <div className={cn(
                                  "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                                  checked
                                    ? "bg-teal-500 border-teal-500"
                                    : "bg-white border-slate-300 hover:border-teal-400"
                                )}>
                                  {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Footer — Headway style */}
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                      <div className="text-sm text-slate-600">
                        {selectedIds.size > 0 ? (
                          <span>
                            You have chosen <span className="font-bold text-orange-600">{selectedIds.size}</span> section{selectedIds.size !== 1 ? 's' : ''} with approximately{' '}
                            <span className="font-bold text-orange-600">{selectedIds.size * questionsPerSection}</span> questions
                          </span>
                        ) : (
                          <span className="text-slate-400">Select sections to build your test</span>
                        )}
                      </div>
                      <motion.button
                        whileHover={selectedIds.size > 0 ? { scale: 1.04 } : {}}
                        whileTap={selectedIds.size > 0 ? { scale: 0.97 } : {}}
                        onClick={() => selectedIds.size > 0 && setStep(2)}
                        disabled={selectedIds.size === 0}
                        className={cn(
                          "px-6 py-2.5 rounded-xl font-bold text-sm transition-all",
                          selectedIds.size > 0
                            ? "bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-200 cursor-pointer"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        )}
                      >
                        Make my test →
                      </motion.button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-start">
                    <button onClick={() => setStep(0)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition-colors">
                      <ChevronLeft className="w-4 h-4" /> Change level
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Settings + Generate */}
            {step === 2 && selectedLevel && (
              <motion.div key="step2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25 }}>
                <div className="max-w-2xl mx-auto">
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                    {/* Card header */}
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <Layers className="w-4.5 h-4.5 text-indigo-600" />
                      </div>
                      <div>
                        <h2 className="font-bold text-slate-800">Configure Your Test</h2>
                        <p className="text-xs text-slate-400">{selectedIds.size} section{selectedIds.size !== 1 ? 's' : ''} · ~{selectedIds.size * questionsPerSection} questions</p>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {/* Title */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quiz Title <span className="text-red-400">*</span></label>
                        <input
                          type="text"
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                          placeholder="e.g. Headway Pre-Intermediate Grammar Test"
                        />
                      </div>

                      {/* Course */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assign to Course <span className="text-red-400">*</span></label>
                        <select
                          value={courseId}
                          onChange={e => setCourseId(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all bg-white"
                        >
                          <option value="">— Select a course —</option>
                          {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.title ?? c.name ?? c.id}</option>
                          ))}
                        </select>
                      </div>

                      {/* Questions per section */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                          Questions per Section <span className="text-slate-400 font-normal">({questionsPerSection})</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={2}
                            max={8}
                            value={questionsPerSection}
                            onChange={e => setQuestionsPerSection(Number(e.target.value))}
                            className="flex-1 accent-indigo-500"
                          />
                          <div className="flex gap-1">
                            {[2, 3, 5, 8].map(n => (
                              <button
                                key={n}
                                onClick={() => setQuestionsPerSection(n)}
                                className={cn(
                                  "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                                  questionsPerSection === n
                                    ? "bg-indigo-500 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                              >{n}</button>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Total: ~{selectedIds.size * questionsPerSection} questions</p>
                      </div>

                      {/* Question Types */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setTypePickerOpen(v => !v)}
                          className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 mb-1.5 hover:text-indigo-600 transition-colors group"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            Question Types
                            <span className="ml-1 text-xs font-normal text-slate-400">({questionTypes.length} selected)</span>
                          </span>
                          {typePickerOpen
                            ? <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                            : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />}
                        </button>
                        {typePickerOpen && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {(Object.entries(AI_QUESTION_TYPE_LABELS) as [AIQuestionType, string][]).map(([type, label]) => {
                              const active = questionTypes.includes(type);
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setQuestionTypes(prev =>
                                    active
                                      ? prev.length > 1 ? prev.filter(t => t !== type) : prev
                                      : [...prev, type]
                                  )}
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                    active
                                      ? "bg-indigo-500 text-white border-indigo-500 shadow-sm"
                                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                                  )}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {!typePickerOpen && (
                          <div className="flex flex-wrap gap-1.5">
                            {questionTypes.map(t => (
                              <span key={t} className="px-2.5 py-1 rounded-md text-xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {AI_QUESTION_TYPE_LABELS[t]}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-slate-400 mt-1.5">AI will generate a mix of these types across your selected sections.</p>
                      </div>

                      {/* Time & Pass */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" /> Time Limit (min)
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={180}
                            value={timeLimit}
                            onChange={e => setTimeLimit(Number(e.target.value))}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-emerald-500" /> Pass Mark (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={passmark}
                            onChange={e => setPassmark(Number(e.target.value))}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                          />
                        </div>
                      </div>

                      {/* Selected sections summary */}
                      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                        <p className="text-xs font-bold text-indigo-700 mb-2 uppercase tracking-wide">Selected Sections ({selectedIds.size})</p>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                          {sections.filter(s => selectedIds.has(s.id)).map(sec => (
                            <span key={sec.id} className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                              sec.type === 'grammar'
                                ? "bg-violet-100 text-violet-700"
                                : "bg-amber-100 text-amber-700"
                            )}>
                              {sec.topic}
                              <button onClick={() => toggleSection(sec.id)} className="hover:text-red-500 transition-colors">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() => setStep(1)}
                        disabled={generating}
                        className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" /> Back to sections
                      </button>

                      <motion.button
                        whileHover={!generating ? { scale: 1.04, y: -1 } : {}}
                        whileTap={!generating ? { scale: 0.97 } : {}}
                        onClick={handleMakeTest}
                        disabled={generating || !courseId || !title.trim()}
                        className={cn(
                          "inline-flex items-center gap-2.5 px-7 py-3 rounded-xl font-bold text-sm transition-all",
                          generating || !courseId || !title.trim()
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                            : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200 hover:shadow-xl cursor-pointer"
                        )}
                      >
                        {generating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating with AI…
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            Generate Test
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </TeacherLayout>
  );
}
