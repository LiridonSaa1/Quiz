import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { authFetch } from '../../lib/apiUrl';
import { cn } from '../../lib/utils';
import {
  BookOpen, ChevronRight, Clock, Target, Users, ListChecks,
  RefreshCw, Search, CheckCircle2, XCircle, RotateCcw, Trophy,
  Timer, AlertTriangle, ArrowLeft,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface Course { id: string; title: string; level?: string; }

interface Quiz {
  id: string;
  title: string;
  course_id?: string;
  course_title?: string;
  time_limit?: number;
  total_marks?: number;
  status?: string;
  published?: boolean | string | null;
  settings?: Record<string, unknown> | null;
}

interface Option { id: string; text: string; }

interface Question {
  id: string;
  text?: string;
  question_text?: string;
  type: string;
  options?: Option[] | null;
  correct_answer?: string | null;
  correctAnswer?: string | null;
  points?: number;
  order?: number;
}

// ── Level config ───────────────────────────────────────────────────────────
const LEVELS = [
  { key: 'all',                label: 'All Levels',       color: 'bg-slate-600',    text: 'text-slate-600',   border: 'border-slate-300' },
  { key: 'beginner',           label: 'Beginner',         color: 'bg-emerald-600',  text: 'text-emerald-700', border: 'border-emerald-300' },
  { key: 'elementary',         label: 'Elementary',       color: 'bg-sky-600',      text: 'text-sky-700',     border: 'border-sky-300' },
  { key: 'pre-intermediate',   label: 'Pre-Intermediate', color: 'bg-violet-600',   text: 'text-violet-700',  border: 'border-violet-300' },
  { key: 'intermediate',       label: 'Intermediate',     color: 'bg-orange-500',   text: 'text-orange-700',  border: 'border-orange-300' },
  { key: 'upper-intermediate', label: 'Upper-Int',        color: 'bg-rose-600',     text: 'text-rose-700',    border: 'border-rose-300' },
  { key: 'advanced',           label: 'Advanced',         color: 'bg-indigo-700',   text: 'text-indigo-700',  border: 'border-indigo-300' },
];

function normKey(level: string): string {
  return (level || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '');
}

function getLevelInfo(level: string) {
  const n = normKey(level);
  return LEVELS.find(l => l.key !== 'all' && n.includes(l.key.replace(/-/g, '').substring(0, 5))) ?? null;
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
function getText(q: Question): string { return String(q.question_text || q.text || '').trim(); }
function getCorrect(q: Question): string { return String(q.correct_answer ?? q.correctAnswer ?? '').trim(); }
function getOptions(q: Question): Option[] { return Array.isArray(q.options) ? q.options.filter(o => o?.id && o?.text) : []; }
function isGradable(q: Question): boolean {
  return ['multiple-choice', 'true-false', 'fill-in-the-blank', 'image', 'video', 'reading'].includes(q.type);
}
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function TeacherModuleTests() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState('all');
  const [search, setSearch] = useState('');

  // Preview mode
  const [preview, setPreview] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQ, setLoadingQ] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startTimer = (min: number) => {
    stopTimer();
    const total = min * 60;
    setTimeLeft(total);
    setTimedOut(false);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) { stopTimer(); setTimedOut(true); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => { if (timedOut && !checked) doCheck(); }, [timedOut]); // eslint-disable-line
  useEffect(() => { return () => stopTimer(); }, []);

  // ── Load teacher quizzes ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, qRes] = await Promise.all([
        authFetch('/api/teacher/courses'),
        authFetch('/api/teacher/quizzes'),
      ]);
      const cJson = await cRes.json().catch(() => ({}));
      const qJson = await qRes.json().catch(() => ({}));
      const loadedCourses: Course[] = Array.isArray(cJson?.courses) ? cJson.courses : [];
      setCourses(loadedCourses);
      const courseMap: Record<string, Course> = {};
      loadedCourses.forEach(c => { courseMap[c.id] = c; });
      const loadedQuizzes: Quiz[] = (Array.isArray(qJson?.quizzes) ? qJson.quizzes : []).map((q: any) => ({
        ...q,
        course_title: courseMap[q.course_id]?.title || q.course_title || 'Unknown Course',
        course_level: courseMap[q.course_id]?.level || q.course_level || '',
      }));
      setQuizzes(loadedQuizzes);
    } catch (e: any) {
      setError(e?.message || 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Open preview ─────────────────────────────────────────────────────────
  const openPreview = async (quiz: Quiz) => {
    setPreview(quiz);
    setLoadingQ(true);
    setAnswers({});
    setFillValues({});
    setChecked(false);
    setScore(0);
    setTimedOut(false);
    stopTimer();
    try {
      const res = await authFetch(`/api/teacher/quizzes/${encodeURIComponent(quiz.id)}/questions`);
      const json = await res.json().catch(() => ({}));
      const qs: Question[] = Array.isArray(json?.questions)
        ? json.questions.filter((q: Question) => q?.type !== 'instruction' && getText(q))
        : [];
      setQuestions(qs);
      if ((quiz.time_limit ?? 0) > 0) startTimer(quiz.time_limit!);
      else setTimeLeft(null);
    } catch {
      setQuestions([]);
      setTimeLeft(null);
    } finally {
      setLoadingQ(false);
    }
  };

  const closePreview = () => {
    stopTimer();
    setPreview(null);
    setQuestions([]);
    setAnswers({});
    setFillValues({});
    setChecked(false);
    setScore(0);
    setTimeLeft(null);
    setTimedOut(false);
  };

  const doCheck = useCallback(() => {
    stopTimer();
    const gradable = questions.filter(isGradable);
    let correct = 0;
    for (const q of gradable) {
      const right = getCorrect(q);
      if (q.type === 'fill-in-the-blank') {
        if ((fillValues[q.id] ?? '').trim().toLowerCase() === right.toLowerCase()) correct++;
      } else if (answers[q.id] === right) correct++;
    }
    setScore(correct);
    setChecked(true);
  }, [questions, answers, fillValues]); // eslint-disable-line

  const restart = () => {
    setAnswers({});
    setFillValues({});
    setChecked(false);
    setScore(0);
    setTimedOut(false);
    if ((preview?.time_limit ?? 0) > 0) startTimer(preview!.time_limit!);
    else setTimeLeft(null);
  };

  // ── Filtering ────────────────────────────────────────────────────────────
  const quizzesWithLevel = quizzes.map(q => {
    const course = courses.find(c => c.id === q.course_id);
    return { ...q, _level: course?.level || (q as any).course_level || '' };
  });

  const filtered = quizzesWithLevel.filter(q => {
    const lvl = normKey(q._level);
    const matchLevel = activeLevel === 'all' || lvl.replace(/-/g, '').includes(activeLevel.replace(/-/g, '').substring(0, 5));
    const matchSearch = !search || q.title.toLowerCase().includes(search.toLowerCase()) || (q.course_title || '').toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchSearch;
  });

  const availableLevels = new Set(quizzesWithLevel.map(q => {
    const n = normKey(q._level);
    return LEVELS.find(l => l.key !== 'all' && n.includes(l.key.replace(/-/g, '').substring(0, 5)))?.key ?? '';
  }).filter(Boolean));

  // ── Quiz list grouped by level ────────────────────────────────────────────
  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach(q => {
    const lvlInfo = getLevelInfo(q._level);
    const grpKey = lvlInfo?.key ?? 'other';
    if (!grouped[grpKey]) grouped[grpKey] = [];
    grouped[grpKey].push(q);
  });

  // ── RENDER: Preview mode ──────────────────────────────────────────────────
  if (preview) {
    const gradableQs = questions.filter(isGradable);
    const total = gradableQs.length;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const allAnswered = gradableQs.every(q =>
      q.type === 'fill-in-the-blank'
        ? (fillValues[q.id] ?? '').trim().length > 0
        : !!answers[q.id],
    );
    const timerWarning = timeLeft !== null && timeLeft <= 60 && !checked;
    const timerCritical = timeLeft !== null && timeLeft <= 30 && !checked;
    const previewLvl = getLevelInfo((preview as any)._level || '');

    return (
      <TeacherLayout>
        <div className="max-w-3xl mx-auto space-y-0">
          {/* Top bar */}
          <div className="bg-white border border-slate-200 rounded-t-2xl px-5 py-3 flex items-center gap-3">
            <button onClick={closePreview} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Module Tests</span>
            </button>
            <div className="h-4 w-px bg-slate-200 hidden sm:block" />
            {previewLvl && (
              <span className={cn('text-[10px] font-black px-2 py-1 rounded text-white flex-shrink-0', previewLvl.color)}>
                {previewLvl.label}
              </span>
            )}
            <h2 className="flex-1 text-sm font-bold text-slate-800 truncate">{preview.title}</h2>
            <span className="text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-1 rounded flex-shrink-0">TEACHER PREVIEW</span>

            {timeLeft !== null && !checked && (
              <div className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-black border flex-shrink-0',
                timerCritical ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                  : timerWarning ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700',
              )}>
                {timerCritical ? <AlertTriangle className="w-3.5 h-3.5" /> : <Timer className="w-3.5 h-3.5" />}
                {formatTime(timeLeft)}
              </div>
            )}
            {checked && (
              <span className={cn('text-sm font-black px-3 py-1 rounded-lg border flex-shrink-0',
                pct >= 80 ? 'bg-green-50 border-green-300 text-green-700'
                  : pct >= 60 ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                  : 'bg-red-50 border-red-300 text-red-600',
              )}>{score}/{total}</span>
            )}
          </div>

          {timedOut && checked && (
            <div className="border-x border-b border-amber-200 bg-amber-50 px-6 py-3 flex items-center gap-2 text-sm text-amber-800 font-semibold">
              <Timer className="w-4 h-4" /> Time's up! Answers submitted automatically.
            </div>
          )}

          {checked && (
            <div className={cn('border-x border-b px-6 py-5 text-center',
              pct >= 80 ? 'bg-green-50 border-green-200' : pct >= 60 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200',
            )}>
              <div className="flex items-center justify-center gap-2 mb-1">
                <Trophy className={cn('w-5 h-5', pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-500')} />
                <span className={cn('text-lg font-black', pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-yellow-700' : 'text-red-600')}>
                  Score: {score}/{total} ({pct}%)
                </span>
              </div>
              <button onClick={restart} className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Try Again
              </button>
            </div>
          )}

          <div className="bg-white border-x border-b border-slate-200 rounded-b-2xl divide-y divide-slate-100">
            {loadingQ ? (
              <div className="p-8 space-y-4 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 bg-slate-100 rounded w-2/3" />
                    {Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-3 bg-slate-100 rounded w-1/2" />)}
                  </div>
                ))}
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center gap-3">
                <BookOpen className="w-10 h-10 text-slate-300" />
                <p className="text-sm text-slate-500">No questions in this test.</p>
              </div>
            ) : (
              questions.map((q, idx) => {
                const opts = getOptions(q);
                const correctId = getCorrect(q);
                const selected = answers[q.id] ?? '';
                const fillVal = fillValues[q.id] ?? '';
                const isFill = q.type === 'fill-in-the-blank';
                const gradable = isGradable(q);
                let isCorrect = false;
                if (checked && gradable) {
                  isCorrect = isFill ? fillVal.trim().toLowerCase() === correctId.toLowerCase() : selected === correctId;
                }

                return (
                  <div key={q.id} className={cn('px-6 py-5 transition-colors',
                    checked && gradable ? isCorrect ? 'bg-green-50/60' : 'bg-red-50/40' : 'bg-white',
                  )}>
                    <div className="flex items-start gap-3 mb-3">
                      <span className={cn('flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-0.5',
                        checked && gradable ? isCorrect ? 'bg-green-500 text-white' : 'bg-red-400 text-white' : 'bg-violet-600 text-white',
                      )}>{idx + 1}</span>
                      <p className="text-sm font-semibold text-slate-800 leading-relaxed flex-1">{getText(q)}</p>
                      {checked && gradable && (
                        <span className="flex-shrink-0 mt-0.5">
                          {isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-400" />}
                        </span>
                      )}
                    </div>
                    {isFill ? (
                      <div className="ml-10 space-y-1.5">
                        <input type="text" value={fillVal} disabled={checked}
                          onChange={e => !checked && setFillValues(p => ({ ...p, [q.id]: e.target.value }))}
                          placeholder="Type your answer…"
                          className={cn('w-full sm:w-72 px-3 py-2 text-sm rounded-lg border-2 outline-none transition-all',
                            checked ? isCorrect ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
                              : 'border-slate-200 focus:border-violet-400 bg-white',
                          )}
                        />
                        {checked && !isCorrect && correctId && (
                          <p className="text-xs text-green-700 font-semibold">✓ Correct answer: <span className="font-bold">{correctId}</span></p>
                        )}
                      </div>
                    ) : (
                      <div className="ml-10 space-y-2">
                        {opts.map((opt, oi) => {
                          const letter = LETTERS[oi] ?? String(oi + 1);
                          const isSelected = selected === opt.id;
                          const isRight = opt.id === correctId;
                          let rowCls = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-all select-none';
                          let circleCls = 'flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all';
                          if (checked) {
                            if (isRight) { rowCls += ' bg-green-100 border border-green-300'; circleCls += ' border-green-500 bg-green-500 text-white'; }
                            else if (isSelected) { rowCls += ' bg-red-100 border border-red-300'; circleCls += ' border-red-400 bg-red-400 text-white'; }
                            else { rowCls += ' opacity-50'; circleCls += ' border-slate-300 text-slate-400'; }
                          } else {
                            if (isSelected) { rowCls += ' bg-violet-50 border border-violet-300'; circleCls += ' border-violet-500 bg-violet-600 text-white'; }
                            else { rowCls += ' border border-transparent hover:bg-violet-50/50 hover:border-violet-200'; circleCls += ' border-slate-300 text-slate-500'; }
                          }
                          return (
                            <label key={opt.id} className={rowCls} onClick={() => !checked && setAnswers(p => ({ ...p, [q.id]: opt.id }))}>
                              <span className={circleCls}>{letter}</span>
                              <span className={cn('font-medium',
                                checked && isRight ? 'text-green-800' : checked && isSelected && !isRight ? 'text-red-700' : 'text-slate-700',
                              )}>{opt.text}</span>
                            </label>
                          );
                        })}
                        {checked && !isCorrect && !opts.find(o => o.id === correctId) && correctId && (
                          <p className="text-xs text-green-700 font-semibold pl-1">✓ Correct answer: <span className="font-bold">{correctId}</span></p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {!loadingQ && questions.length > 0 && (
              <div className="px-6 py-5 flex items-center justify-between gap-4 bg-slate-50 rounded-b-2xl">
                <p className="text-xs text-slate-400">
                  {checked ? `${score} correct out of ${total}` : allAnswered ? 'All answered — ready to check!' : `${Object.keys(answers).length + Object.keys(fillValues).length}/${gradableQs.length} answered`}
                </p>
                {!checked ? (
                  <button onClick={doCheck} disabled={!allAnswered}
                    className={cn('inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all',
                      allAnswered ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed',
                    )}>
                    <ListChecks className="w-4 h-4" /> Check Answers
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={restart} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-white transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> Retry
                    </button>
                    <button onClick={closePreview} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
                      All Tests
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </TeacherLayout>
    );
  }

  // ── RENDER: List page ─────────────────────────────────────────────────────
  return (
    <TeacherLayout>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
              <ListChecks className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Module Tests</h1>
              <p className="text-sm text-slate-500 mt-0.5">Browse quizzes by level — preview them as students see them</p>
            </div>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Search + level filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or course…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 bg-white"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.filter(l => l.key === 'all' || availableLevels.has(l.key)).map(lvl => (
              <button
                key={lvl.key}
                onClick={() => setActiveLevel(lvl.key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all',
                  activeLevel === lvl.key
                    ? cn('text-white border-transparent', lvl.color)
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300',
                )}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-slate-100" />)}
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">
              {quizzes.length === 0 ? 'No quizzes yet — create some in Quiz Builder' : 'No tests match your filters'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {LEVELS.filter(l => l.key !== 'all' && grouped[l.key]).map(lvl => (
              <div key={lvl.key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className={cn('px-5 py-3 flex items-center gap-3 border-b', lvl.border)}>
                  <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', lvl.color)} />
                  <span className={cn('text-sm font-black', lvl.text)}>{lvl.label}</span>
                  <span className="text-xs text-slate-400 ml-auto">{grouped[lvl.key].length} tests</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {grouped[lvl.key].map(q => (
                    <button
                      key={q.id}
                      onClick={() => openPreview({ ...q, _level: (q as any)._level } as any)}
                      className="group w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', lvl.color)}>
                        <BookOpen className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{q.title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {q.course_title && <span className="text-xs text-slate-400 truncate">{q.course_title}</span>}
                          {(q.total_marks ?? 0) > 0 && (
                            <span className="text-xs text-slate-400 flex items-center gap-1"><Target className="w-3 h-3" />{q.total_marks}</span>
                          )}
                          {(q.time_limit ?? 0) > 0 && (
                            <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{q.time_limit}m</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
                        Preview <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Ungrouped (no level) */}
            {grouped['other'] && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
                  <span className="text-sm font-black text-slate-600">No Level Assigned</span>
                  <span className="text-xs text-slate-400 ml-auto">{grouped['other'].length} tests</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {grouped['other'].map(q => (
                    <button key={q.id} onClick={() => openPreview(q as any)}
                      className="group w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-500 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{q.title}</p>
                        {q.course_title && <p className="text-xs text-slate-400 truncate">{q.course_title}</p>}
                      </div>
                      <span className="text-xs font-semibold text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
                        Preview <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
