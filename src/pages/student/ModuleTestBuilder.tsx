import React, { useEffect, useState, useCallback, useRef } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { cn } from '../../lib/utils';
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Trophy,
  BookOpen,
  Layers,
  Clock,
  Target,
  ArrowLeft,
  PlayCircle,
  CheckCheck,
  Circle,
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

interface Question {
  id: string;
  text?: string;
  question_text?: string;
  type: string;
  options?: { id: string; text: string }[] | null;
  correct_answer?: string | null;
  correctAnswer?: string | null;
  points?: number;
  media_url?: string;
  order?: number;
  section_id?: string | null;
}

type Phase = 'select' | 'quiz' | 'results';

interface AnswerState {
  selected: string;
  checked: boolean;
  correct: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getQuestionText(q: Question): string {
  return String(q.question_text || q.text || '').trim();
}

function getCorrectAnswer(q: Question): string {
  return String(q.correct_answer ?? q.correctAnswer ?? '').trim();
}

function parseOptions(q: Question): { id: string; text: string }[] {
  if (Array.isArray(q.options)) return q.options.filter(o => o?.id && o?.text);
  return [];
}

function isGradable(q: Question): boolean {
  return ['multiple-choice', 'true-false', 'image', 'video', 'reading', 'fill-in-the-blank'].includes(q.type);
}

function scoreColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(pct: number): string {
  if (pct >= 80) return 'bg-emerald-50 border-emerald-200';
  if (pct >= 60) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

// ── Sub-components ──────────────────────────────────────────────────────────

function QuizCard({ quiz, onSelect }: { quiz: QuizSummary; onSelect: () => void }) {
  const marks = quiz.total_marks ?? 0;
  const timeLimit = quiz.time_limit ?? 0;
  return (
    <button
      onClick={onSelect}
      className="group w-full text-left bg-white border border-slate-100 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50 transition-all duration-200 flex items-start gap-4"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
        <BookOpen className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-slate-900 truncate">{quiz.title}</h3>
        {quiz.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{quiz.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {marks > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Target className="w-3 h-3" /> {marks} pts
            </span>
          )}
          {timeLimit > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Clock className="w-3 h-3" /> {timeLimit} min
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-0.5" />
    </button>
  );
}

function OptionButton({
  option,
  state,
  isCorrect,
  onSelect,
}: {
  option: { id: string; text: string };
  state: AnswerState | undefined;
  isCorrect: boolean;
  onSelect: () => void;
}) {
  const selected = state?.selected === option.id;
  const checked = state?.checked ?? false;

  let base =
    'w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-150 flex items-center gap-3';

  if (checked) {
    if (isCorrect) {
      base += ' border-emerald-400 bg-emerald-50 text-emerald-900';
    } else if (selected) {
      base += ' border-red-400 bg-red-50 text-red-900';
    } else {
      base += ' border-slate-100 bg-white text-slate-400 cursor-default';
    }
  } else {
    if (selected) {
      base += ' border-indigo-400 bg-indigo-50 text-indigo-900 shadow-sm shadow-indigo-100';
    } else {
      base += ' border-slate-150 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/40 cursor-pointer';
    }
  }

  return (
    <button className={base} onClick={onSelect} disabled={checked}>
      <span
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold',
          checked && isCorrect
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : checked && selected
            ? 'border-red-500 bg-red-500 text-white'
            : selected
            ? 'border-indigo-500 bg-indigo-500 text-white'
            : 'border-slate-300',
        )}
      >
        {checked && isCorrect ? (
          <CheckCheck className="w-3 h-3" />
        ) : checked && selected ? (
          <XCircle className="w-3 h-3" />
        ) : selected ? (
          <Circle className="w-3 h-3 fill-current" />
        ) : null}
      </span>
      <span>{option.text}</span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ModuleTestBuilder() {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('select');
  const [activeQuiz, setActiveQuiz] = useState<QuizSummary | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [fillValue, setFillValue] = useState('');
  const [fillChecked, setFillChecked] = useState(false);

  const questionRef = useRef<HTMLDivElement>(null);

  // ── Fetch quiz list ────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch('/api/student/quizzes');
        const json = await res.json().catch(() => ({}));
        const list: QuizSummary[] = Array.isArray(json?.quizzes) ? json.quizzes : [];
        setQuizzes(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to load quizzes.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // ── Select a quiz ──────────────────────────────────────────────────────
  const handleSelectQuiz = useCallback(async (quiz: QuizSummary) => {
    setActiveQuiz(quiz);
    setQuestionsLoading(true);
    setPhase('quiz');
    setCurrentIdx(0);
    setAnswers({});
    setFillValue('');
    setFillChecked(false);

    try {
      const res = await authFetch(`/api/student/quizzes/${encodeURIComponent(quiz.id)}/questions`);
      const json = await res.json().catch(() => ({}));
      const qs: Question[] = Array.isArray(json?.questions)
        ? json.questions.filter((q: Question) => q?.type !== 'instruction' && getQuestionText(q))
        : [];
      setQuestions(qs);
    } catch {
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  }, []);

  // ── Scroll to top of question on change ───────────────────────────────
  useEffect(() => {
    questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentIdx]);

  const gradableQuestions = questions.filter(isGradable);
  const currentQuestion = questions[currentIdx] ?? null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isFill = currentQuestion?.type === 'fill-in-the-blank';

  // ── Answer selection ──────────────────────────────────────────────────
  const handleSelect = (optionId: string) => {
    if (!currentQuestion || currentAnswer?.checked) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: { selected: optionId, checked: false, correct: false },
    }));
  };

  // ── Check answer ───────────────────────────────────────────────────────
  const handleCheck = () => {
    if (!currentQuestion) return;
    const correct = getCorrectAnswer(currentQuestion);

    if (isFill) {
      const isCorrect = fillValue.trim().toLowerCase() === correct.toLowerCase();
      setAnswers(prev => ({
        ...prev,
        [currentQuestion.id]: { selected: fillValue.trim(), checked: true, correct: isCorrect },
      }));
      setFillChecked(true);
      return;
    }

    const sel = currentAnswer?.selected ?? '';
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: { selected: sel, checked: true, correct: sel === correct },
    }));
  };

  // ── Navigate ───────────────────────────────────────────────────────────
  const handleNext = () => {
    setFillValue('');
    setFillChecked(false);
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      setPhase('results');
    }
  };

  const handlePrev = () => {
    setFillValue('');
    setFillChecked(false);
    if (currentIdx > 0) setCurrentIdx(i => i - 1);
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setAnswers({});
    setFillValue('');
    setFillChecked(false);
    setPhase('quiz');
  };

  const handleBack = () => {
    setPhase('select');
    setActiveQuiz(null);
    setQuestions([]);
    setCurrentIdx(0);
    setAnswers({});
  };

  // ── Compute score ──────────────────────────────────────────────────────
  const correctCount = gradableQuestions.filter(q => answers[q.id]?.correct).length;
  const totalGradable = gradableQuestions.length;
  const scorePct = totalGradable > 0 ? Math.round((correctCount / totalGradable) * 100) : 0;
  const answeredCount = Object.values(answers).filter(a => a.checked).length;

  // ── Can check / can next ───────────────────────────────────────────────
  const canCheck =
    currentQuestion && !currentAnswer?.checked
      ? isFill
        ? fillValue.trim().length > 0
        : !!currentAnswer?.selected
      : false;

  const canNext = currentQuestion
    ? currentAnswer?.checked || !isGradable(currentQuestion)
    : false;

  // ── Render: Select phase ──────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <StudentLayout>
        <div className="space-y-5 max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-0.5">
                  Interactive Practice
                </p>
                <h1 className="text-2xl font-black text-slate-900">Test Builder</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Choose a test — answer questions and get instant feedback
                </p>
              </div>
            </div>
          </div>

          {/* Quiz grid */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center py-12 gap-3 text-center">
                <XCircle className="w-10 h-10 text-red-400" />
                <p className="text-sm text-slate-500">{error}</p>
              </div>
            ) : quizzes.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <BookOpen className="w-7 h-7 text-slate-400" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">No tests available yet</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Ask your teacher to publish some quizzes for you.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quizzes.map(q => (
                  <QuizCard key={q.id} quiz={q} onSelect={() => handleSelectQuiz(q)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </StudentLayout>
    );
  }

  // ── Render: Results phase ─────────────────────────────────────────────
  if (phase === 'results') {
    return (
      <StudentLayout>
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Score card */}
          <div className={cn('rounded-3xl border-2 p-8 text-center', scoreBg(scorePct))}>
            <div className="flex items-center justify-center mb-4">
              <Trophy className={cn('w-12 h-12', scoreColor(scorePct))} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-1">{activeQuiz?.title}</h1>
            <p className="text-sm text-slate-500 mb-6">Test complete!</p>

            <div className={cn('text-6xl font-black mb-1', scoreColor(scorePct))}>
              {scorePct}%
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {correctCount} / {totalGradable} correct
            </p>

            <div className="mt-6 h-3 rounded-full bg-white/70 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  scorePct >= 80
                    ? 'bg-emerald-500'
                    : scorePct >= 60
                    ? 'bg-amber-400'
                    : 'bg-red-400',
                )}
                style={{ width: `${scorePct}%` }}
              />
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-700">
              {scorePct >= 80
                ? '🎉 Excellent work!'
                : scorePct >= 60
                ? '👍 Good effort — keep going!'
                : '📚 Keep practising — you\'ll get there!'}
            </p>
          </div>

          {/* Per-question review */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
              Answer Review
            </h2>
            {questions.map((q, idx) => {
              if (!isGradable(q)) return null;
              const ans = answers[q.id];
              const opts = parseOptions(q);
              const correctId = getCorrectAnswer(q);
              const selectedOpt = opts.find(o => o.id === ans?.selected);
              const correctOpt = opts.find(o => o.id === correctId);
              return (
                <div
                  key={q.id}
                  className={cn(
                    'rounded-2xl border-2 p-4',
                    ans?.correct
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-red-200 bg-red-50/50',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {ans?.correct ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        <span className="text-slate-400 mr-1">Q{idx + 1}.</span>
                        {getQuestionText(q)}
                      </p>
                      {!ans?.correct && (
                        <div className="mt-1 space-y-0.5">
                          {selectedOpt && (
                            <p className="text-xs text-red-600">
                              Your answer: <span className="font-semibold">{selectedOpt.text}</span>
                            </p>
                          )}
                          {correctOpt && (
                            <p className="text-xs text-emerald-700">
                              Correct: <span className="font-semibold">{correctOpt.text}</span>
                            </p>
                          )}
                          {!correctOpt && correctId && (
                            <p className="text-xs text-emerald-700">
                              Correct: <span className="font-semibold">{correctId}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> All Tests
            </button>
            <button
              onClick={handleRetry}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
          </div>
        </div>
      </StudentLayout>
    );
  }

  // ── Render: Quiz phase ─────────────────────────────────────────────────
  const progressPct =
    questions.length > 0 ? Math.round(((currentIdx + 1) / questions.length) * 100) : 0;

  return (
    <StudentLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Top bar */}
        <div className="bg-white rounded-3xl border border-slate-100 px-5 py-4 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider truncate">
              {activeQuiz?.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-500 flex-shrink-0">
                {currentIdx + 1}/{questions.length}
              </span>
            </div>
          </div>

          {/* Live score badge */}
          <div className="flex-shrink-0 text-center">
            <div
              className={cn(
                'text-lg font-black',
                answeredCount > 0 ? scoreColor(scorePct) : 'text-slate-300',
              )}
            >
              {answeredCount > 0 ? `${scorePct}%` : '—'}
            </div>
            <div className="text-xs text-slate-400 font-medium">score</div>
          </div>
        </div>

        {/* Question card */}
        <div ref={questionRef} className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8">
          {questionsLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 bg-slate-100 rounded-xl w-3/4" />
              <div className="h-4 bg-slate-100 rounded-xl w-1/2" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl" />
              ))}
            </div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <BookOpen className="w-10 h-10 text-slate-300" />
              <p className="text-sm text-slate-500">No questions found in this test.</p>
              <button
                onClick={handleBack}
                className="mt-2 px-5 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
              >
                Back to tests
              </button>
            </div>
          ) : currentQuestion ? (
            <div className="space-y-5">
              {/* Question number + text */}
              <div>
                <span className="inline-block text-xs font-bold text-indigo-500 bg-indigo-50 rounded-lg px-2.5 py-1 mb-3 uppercase tracking-wider">
                  Question {currentIdx + 1}
                </span>
                <p className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
                  {getQuestionText(currentQuestion)}
                </p>
              </div>

              {/* Options */}
              {isFill ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={fillValue}
                    onChange={e => !fillChecked && setFillValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && canCheck) handleCheck();
                    }}
                    disabled={fillChecked}
                    placeholder="Type your answer…"
                    className={cn(
                      'w-full px-4 py-3 rounded-xl border-2 text-sm font-medium outline-none transition-all',
                      fillChecked && answers[currentQuestion.id]?.correct
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                        : fillChecked && !answers[currentQuestion.id]?.correct
                        ? 'border-red-400 bg-red-50 text-red-900'
                        : 'border-slate-200 focus:border-indigo-400 bg-white text-slate-800',
                    )}
                  />
                  {fillChecked && !answers[currentQuestion.id]?.correct && (
                    <p className="text-xs font-semibold text-emerald-700 pl-1">
                      Correct answer: {getCorrectAnswer(currentQuestion)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {parseOptions(currentQuestion).map(option => {
                    const correctId = getCorrectAnswer(currentQuestion);
                    return (
                      <OptionButton
                        key={option.id}
                        option={option}
                        state={currentAnswer}
                        isCorrect={option.id === correctId}
                        onSelect={() => handleSelect(option.id)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Feedback banner */}
              {currentAnswer?.checked && (
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 border',
                    currentAnswer.correct
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200',
                  )}
                >
                  {currentAnswer.correct ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  )}
                  <p
                    className={cn(
                      'text-sm font-bold',
                      currentAnswer.correct ? 'text-emerald-800' : 'text-red-700',
                    )}
                  >
                    {currentAnswer.correct ? 'Correct! Well done.' : 'Not quite — check the answer above.'}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Navigation */}
        {!questionsLoading && questions.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              disabled={currentIdx === 0}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            <div className="flex-1 flex justify-center">
              {!currentAnswer?.checked && isGradable(currentQuestion!) ? (
                <button
                  onClick={handleCheck}
                  disabled={!canCheck}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-200"
                >
                  <CheckCheck className="w-4 h-4" /> Check Answer
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all shadow-md shadow-slate-200"
                >
                  {currentIdx === questions.length - 1 ? (
                    <>
                      <Trophy className="w-4 h-4" /> Finish & See Results
                    </>
                  ) : (
                    <>
                      Next <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={currentIdx === questions.length - 1 && !canNext}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Question dots */}
        {questions.length > 0 && questions.length <= 30 && (
          <div className="flex flex-wrap justify-center gap-1.5 pb-2">
            {questions.map((q, idx) => {
              const ans = answers[q.id];
              const isActive = idx === currentIdx;
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    setFillValue('');
                    setFillChecked(false);
                    setCurrentIdx(idx);
                  }}
                  className={cn(
                    'w-7 h-7 rounded-lg text-xs font-bold transition-all',
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : ans?.checked && ans?.correct
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : ans?.checked && !ans?.correct
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
