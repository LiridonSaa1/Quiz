import React, { useEffect, useState, useCallback } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { cn } from '../../lib/utils';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  BookOpen,
  ChevronRight,
  Clock,
  Target,
  ArrowLeft,
  ListChecks,
  Trophy,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface QuizSummary {
  id: string;
  title: string;
  description?: string;
  course_id?: string;
  time_limit?: number;
  total_marks?: number;
  pass_mark?: number;
  status?: string;
  published?: boolean | string | null;
  settings?: Record<string, unknown> | null;
}

interface Option {
  id: string;
  text: string;
}

interface Question {
  id: string;
  text?: string;
  question_text?: string;
  type: string;
  options?: Option[] | null;
  correct_answer?: string | null;
  correctAnswer?: string | null;
  points?: number;
  media_url?: string;
  order?: number;
  section_id?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

function getText(q: Question): string {
  return String(q.question_text || q.text || '').trim();
}

function getCorrect(q: Question): string {
  return String(q.correct_answer ?? q.correctAnswer ?? '').trim();
}

function getOptions(q: Question): Option[] {
  return Array.isArray(q.options) ? q.options.filter(o => o?.id && o?.text) : [];
}

function isGradable(q: Question): boolean {
  return ['multiple-choice', 'true-false', 'image', 'video', 'reading', 'fill-in-the-blank'].includes(q.type);
}

// ── Quiz selector card ─────────────────────────────────────────────────────
function QuizCard({ quiz, onSelect }: { quiz: QuizSummary; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="group w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3"
    >
      <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
        <BookOpen className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{quiz.title}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {(quiz.total_marks ?? 0) > 0 && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Target className="w-3 h-3" /> {quiz.total_marks} pts
            </span>
          )}
          {(quiz.time_limit ?? 0) > 0 && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {quiz.time_limit} min
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function ModuleTestBuilder() {
  // ── State: quiz list ───────────────────────────────────────────────────
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // ── State: active test ─────────────────────────────────────────────────
  const [activeQuiz, setActiveQuiz] = useState<QuizSummary | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQ, setLoadingQ] = useState(false);

  // ── State: answers & results ───────────────────────────────────────────
  // answers: questionId → selected option id (or fill text)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);   // true after "Check Answers"
  const [score, setScore] = useState(0);

  // ── Fetch quiz list ────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingList(true);
      setListError(null);
      try {
        const res = await authFetch('/api/student/quizzes');
        const json = await res.json().catch(() => ({}));
        setQuizzes(Array.isArray(json?.quizzes) ? json.quizzes : []);
      } catch (e: any) {
        setListError(e?.message || 'Failed to load tests.');
      } finally {
        setLoadingList(false);
      }
    };
    void load();
  }, []);

  // ── Open a quiz ────────────────────────────────────────────────────────
  const openQuiz = useCallback(async (quiz: QuizSummary) => {
    setActiveQuiz(quiz);
    setLoadingQ(true);
    setAnswers({});
    setFillValues({});
    setChecked(false);
    setScore(0);
    try {
      const res = await authFetch(`/api/student/quizzes/${encodeURIComponent(quiz.id)}/questions`);
      const json = await res.json().catch(() => ({}));
      const qs: Question[] = Array.isArray(json?.questions)
        ? json.questions.filter((q: Question) => q?.type !== 'instruction' && getText(q))
        : [];
      setQuestions(qs);
    } catch {
      setQuestions([]);
    } finally {
      setLoadingQ(false);
    }
  }, []);

  // ── Select option ──────────────────────────────────────────────────────
  const selectOption = (qId: string, optId: string) => {
    if (checked) return;
    setAnswers(prev => ({ ...prev, [qId]: optId }));
  };

  // ── Fill-in change ─────────────────────────────────────────────────────
  const changeFill = (qId: string, val: string) => {
    if (checked) return;
    setFillValues(prev => ({ ...prev, [qId]: val }));
  };

  // ── Check all answers ──────────────────────────────────────────────────
  const checkAnswers = () => {
    const gradable = questions.filter(isGradable);
    let correct = 0;
    for (const q of gradable) {
      const rightAns = getCorrect(q);
      if (q.type === 'fill-in-the-blank') {
        if ((fillValues[q.id] ?? '').trim().toLowerCase() === rightAns.toLowerCase()) correct++;
      } else {
        if (answers[q.id] === rightAns) correct++;
      }
    }
    setScore(correct);
    setChecked(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Restart same quiz ──────────────────────────────────────────────────
  const restart = () => {
    setAnswers({});
    setFillValues({});
    setChecked(false);
    setScore(0);
  };

  // ── Back to quiz list ──────────────────────────────────────────────────
  const backToList = () => {
    setActiveQuiz(null);
    setQuestions([]);
    setAnswers({});
    setFillValues({});
    setChecked(false);
    setScore(0);
  };

  const gradableQs = questions.filter(isGradable);
  const total = gradableQs.length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const allAnswered = gradableQs.every(q =>
    q.type === 'fill-in-the-blank'
      ? (fillValues[q.id] ?? '').trim().length > 0
      : !!answers[q.id],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Quiz list
  // ─────────────────────────────────────────────────────────────────────────
  if (!activeQuiz) {
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                <ListChecks className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">Test Builder</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Select a test — answer all questions, then press <strong>Check Answers</strong>
                </p>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            {loadingList ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : listError ? (
              <p className="text-sm text-red-500 py-6 text-center">{listError}</p>
            ) : quizzes.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center gap-3">
                <BookOpen className="w-10 h-10 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">No tests available yet</p>
                <p className="text-xs text-slate-400">Ask your teacher to publish some quizzes.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {quizzes.map(q => (
                  <QuizCard key={q.id} quiz={q} onSelect={() => openQuiz(q)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </StudentLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Test page  (Headway-style: all questions on one page)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-0">

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-t-2xl px-5 py-4 flex items-center gap-3">
          <button
            onClick={backToList}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">All Tests</span>
          </button>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <h2 className="flex-1 text-sm font-bold text-slate-800 truncate">{activeQuiz.title}</h2>
          {checked && (
            <span
              className={cn(
                'text-sm font-black px-3 py-1 rounded-lg border',
                pct >= 80
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : pct >= 60
                  ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                  : 'bg-red-50 border-red-300 text-red-600',
              )}
            >
              {score}/{total}
            </span>
          )}
        </div>

        {/* ── Score banner (shown after Check) ────────────────────────── */}
        {checked && (
          <div
            className={cn(
              'border-x border-b px-6 py-5 text-center',
              pct >= 80
                ? 'bg-green-50 border-green-200'
                : pct >= 60
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-red-50 border-red-200',
            )}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <Trophy
                className={cn(
                  'w-5 h-5',
                  pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-500',
                )}
              />
              <span
                className={cn(
                  'text-lg font-black',
                  pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-yellow-700' : 'text-red-600',
                )}
              >
                Your score: {score}/{total} &nbsp;({pct}%)
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {pct >= 80
                ? 'Excellent! 🎉'
                : pct >= 60
                ? 'Good effort! Keep practising.'
                : 'Keep going — review the answers and try again.'}
            </p>
            <button
              onClick={restart}
              className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try Again
            </button>
          </div>
        )}

        {/* ── Question list ────────────────────────────────────────────── */}
        <div className="bg-white border-x border-b border-slate-200 rounded-b-2xl divide-y divide-slate-100">
          {loadingQ ? (
            <div className="p-8 space-y-6 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="h-4 bg-slate-100 rounded w-2/3" />
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="h-3 bg-slate-100 rounded w-1/2" />
                  ))}
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

              // Per-question result after checking
              let isCorrect = false;
              if (checked && gradable) {
                isCorrect = isFill
                  ? fillVal.trim().toLowerCase() === correctId.toLowerCase()
                  : selected === correctId;
              }

              return (
                <div
                  key={q.id}
                  className={cn(
                    'px-6 py-5 transition-colors',
                    checked && gradable
                      ? isCorrect
                        ? 'bg-green-50/60'
                        : 'bg-red-50/40'
                      : 'bg-white hover:bg-slate-50/50',
                  )}
                >
                  {/* Question text */}
                  <div className="flex items-start gap-3 mb-3">
                    {/* Question number bubble */}
                    <span
                      className={cn(
                        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-0.5',
                        checked && gradable
                          ? isCorrect
                            ? 'bg-green-500 text-white'
                            : 'bg-red-400 text-white'
                          : 'bg-blue-600 text-white',
                      )}
                    >
                      {idx + 1}
                    </span>
                    <p className="text-sm font-semibold text-slate-800 leading-relaxed flex-1">
                      {getText(q)}
                    </p>
                    {/* Correct/wrong icon */}
                    {checked && gradable && (
                      <span className="flex-shrink-0 mt-0.5">
                        {isCorrect ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400" />
                        )}
                      </span>
                    )}
                  </div>

                  {/* ── Fill-in-the-blank ──────────────────────────────── */}
                  {isFill ? (
                    <div className="ml-10 space-y-1.5">
                      <input
                        type="text"
                        value={fillVal}
                        disabled={checked}
                        onChange={e => changeFill(q.id, e.target.value)}
                        placeholder="Type your answer…"
                        className={cn(
                          'w-full sm:w-72 px-3 py-2 text-sm rounded-lg border-2 outline-none transition-all',
                          checked
                            ? isCorrect
                              ? 'border-green-400 bg-green-50 text-green-800'
                              : 'border-red-300 bg-red-50 text-red-800'
                            : 'border-slate-200 focus:border-blue-400 bg-white',
                        )}
                      />
                      {checked && !isCorrect && correctId && (
                        <p className="text-xs text-green-700 font-semibold">
                          ✓ Correct answer: <span className="font-bold">{correctId}</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    /* ── Multiple choice / true-false ──────────────────── */
                    <div className="ml-10 space-y-2">
                      {opts.map((opt, oi) => {
                        const letter = LETTERS[oi] ?? String(oi + 1);
                        const isSelected = selected === opt.id;
                        const isRight = opt.id === correctId;

                        let rowCls =
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-all select-none';
                        let circleCls =
                          'flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all';

                        if (checked) {
                          if (isRight) {
                            rowCls += ' bg-green-100 border border-green-300';
                            circleCls += ' border-green-500 bg-green-500 text-white';
                          } else if (isSelected && !isRight) {
                            rowCls += ' bg-red-100 border border-red-300';
                            circleCls += ' border-red-400 bg-red-400 text-white';
                          } else {
                            rowCls += ' opacity-50';
                            circleCls += ' border-slate-300 text-slate-400';
                          }
                        } else {
                          if (isSelected) {
                            rowCls += ' bg-blue-50 border border-blue-300';
                            circleCls += ' border-blue-500 bg-blue-600 text-white';
                          } else {
                            rowCls += ' border border-transparent hover:bg-blue-50/50 hover:border-blue-200';
                            circleCls += ' border-slate-300 text-slate-500';
                          }
                        }

                        return (
                          <label key={opt.id} className={rowCls} onClick={() => selectOption(q.id, opt.id)}>
                            <span className={circleCls}>{letter}</span>
                            <span
                              className={cn(
                                'font-medium',
                                checked && isRight
                                  ? 'text-green-800'
                                  : checked && isSelected && !isRight
                                  ? 'text-red-700'
                                  : 'text-slate-700',
                              )}
                            >
                              {opt.text}
                            </span>
                          </label>
                        );
                      })}

                      {/* Show correct answer if got wrong and no opts have matching id */}
                      {checked && !isCorrect && !opts.find(o => o.id === correctId) && correctId && (
                        <p className="text-xs text-green-700 font-semibold pl-1">
                          ✓ Correct answer: <span className="font-bold">{correctId}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* ── Check Answers button ─────────────────────────────────── */}
          {!loadingQ && questions.length > 0 && (
            <div className="px-6 py-5 flex items-center justify-between gap-4 bg-slate-50 rounded-b-2xl">
              <p className="text-xs text-slate-400">
                {checked
                  ? `${score} correct out of ${total} questions`
                  : allAnswered
                  ? 'All questions answered — ready to check!'
                  : `${Object.keys(answers).length + Object.keys(fillValues).length}/${gradableQs.length} answered`}
              </p>
              {!checked ? (
                <button
                  onClick={checkAnswers}
                  disabled={!allAnswered}
                  className={cn(
                    'inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all',
                    allAnswered
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed',
                  )}
                >
                  <ListChecks className="w-4 h-4" />
                  Check Answers
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={restart}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-white transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retry
                  </button>
                  <button
                    onClick={backToList}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Other Tests
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
}
