import React, { useState, useCallback, useRef, useEffect } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { FlaskConical, CheckCircle2, XCircle, ChevronRight, RotateCcw, Trophy, BookOpen, Clock } from 'lucide-react';
import { supabase } from '../../supabase';
import { HEADWAY_QUESTIONS, getQuestionsForSection } from '../../lib/headwayQuestions';

const LEVEL = 'Pre-Intermediate';
const QUESTIONS_PER_TOPIC = 5;

interface ActiveQuestion {
  text: string;
  options: string[];
  correct: number;
  explanation: string;
  topic: string;
}

type Phase = 'select' | 'quiz' | 'results';

export default function TestBuilder() {
  const [userEmail, setUserEmail] = useState<string>('');
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? '');
    });
  }, []);

  const allTopics = HEADWAY_QUESTIONS[LEVEL] ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>('select');
  const [questions, setQuestions] = useState<ActiveQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const startRef = useRef<number>(Date.now());

  const toggleTopic = (topic: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(topic) ? next.delete(topic) : next.add(topic);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allTopics.map(t => t.topic)));
  const clearAll = () => setSelected(new Set());

  const startQuiz = useCallback(() => {
    if (selected.size === 0) return;
    const qs: ActiveQuestion[] = [];
    for (const topic of selected) {
      const raw = getQuestionsForSection(LEVEL, topic, QUESTIONS_PER_TOPIC);
      for (const q of raw) {
        qs.push({ ...q, topic });
      }
    }
    setQuestions(qs);
    setAnswers({});
    setSubmitted(false);
    setSaveMsg('');
    startRef.current = Date.now();
    setPhase('quiz');
  }, [selected]);

  const score = submitted
    ? questions.filter((q, i) => answers[i] === q.options[q.correct]).length
    : 0;

  const submitQuiz = async () => {
    setSubmitted(true);
    setSaving(true);

    const answerRows = questions.map((q, i) => ({
      questionIdx: i,
      topic: q.topic,
      chosen: answers[i] ?? '',
      correct: q.options[q.correct],
    }));

    const sc = questions.filter((q, i) => answers[i] === q.options[q.correct]).length;
    const timeTakenSeconds = Math.round((Date.now() - startRef.current) / 1000);

    try {
      const resp = await fetch('/api/student/headway-test/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          level: LEVEL,
          selectedTopics: Array.from(selected),
          answers: answerRows,
          score: sc,
          total: questions.length,
          timeTakenSeconds,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        setSaveMsg(data.stored ? '✓ Result saved' : '✓ Result calculated');
      } else {
        setSaveMsg('Could not save result');
      }
    } catch {
      setSaveMsg('Could not save result');
    } finally {
      setSaving(false);
      setPhase('results');
    }
  };

  const restart = () => {
    setPhase('select');
    setSelected(new Set());
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setSaveMsg('');
  };

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length && questions.length > 0;

  return (
    <StudentLayout>
      <div className="space-y-5 max-w-3xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Headway {LEVEL}</p>
              <h1 className="text-2xl font-black text-slate-900">Grammar Test Builder</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {userEmail && <span className="text-slate-400">Logged in as <strong className="text-slate-600">{userEmail}</strong> · </span>}
                Fill-in-the-blank grammar practice
              </p>
            </div>
          </div>
        </div>

        {/* ─── Phase: SELECT TOPICS ─── */}
        {phase === 'select' && (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" /> Select Grammar Topics
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{selected.size} of {allTopics.length} selected · {selected.size * QUESTIONS_PER_TOPIC} questions total</p>
              </div>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors">All</button>
                <button onClick={clearAll} className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors">Clear</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allTopics.map((t, i) => {
                const checked = selected.has(t.topic);
                return (
                  <button
                    key={t.topic}
                    onClick={() => toggleTopic(t.topic)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                      checked
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-50 border-slate-100 text-slate-700 hover:border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                    }`}>
                      {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold block truncate">{t.topic}</span>
                      <span className="text-xs text-slate-400">{t.questions.length} questions</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={startQuiz}
              disabled={selected.size === 0}
              className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              Start Test — {selected.size * QUESTIONS_PER_TOPIC} Questions <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ─── Phase: QUIZ ─── */}
        {phase === 'quiz' && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="bg-white rounded-2xl border border-slate-100 px-5 py-3 flex items-center gap-4">
              <span className="text-xs font-semibold text-slate-500 flex-shrink-0 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {answeredCount}/{questions.length} answered
              </span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                />
              </div>
              <button onClick={restart} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {/* Questions grouped by topic */}
            {(() => {
              const grouped: Record<string, Array<{ q: ActiveQuestion; idx: number }>> = {};
              questions.forEach((q, idx) => {
                if (!grouped[q.topic]) grouped[q.topic] = [];
                grouped[q.topic].push({ q, idx });
              });
              return Object.entries(grouped).map(([topic, items]) => (
                <div key={topic} className="bg-white rounded-3xl border border-slate-100 p-5 space-y-4">
                  <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider border-b border-slate-100 pb-3">{topic}</h3>
                  {items.map(({ q, idx }) => {
                    const chosen = answers[idx];
                    return (
                      <div key={idx} className="space-y-2">
                        <p className="text-sm font-medium text-slate-800 leading-relaxed">
                          <span className="text-slate-400 font-bold mr-2">{idx + 1}.</span>
                          {q.text.split('_____').map((part, pi, arr) => (
                            <React.Fragment key={pi}>
                              {part}
                              {pi < arr.length - 1 && (
                                <span className="inline-block mx-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-bold text-xs">
                                  {chosen ?? '________'}
                                </span>
                              )}
                            </React.Fragment>
                          ))}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {q.options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => setAnswers(prev => ({ ...prev, [idx]: opt }))}
                              className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                                chosen === opt
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}

            {/* Submit button */}
            <button
              onClick={submitQuiz}
              disabled={!allAnswered || saving}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
              ) : (
                <>Submit Test <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
            {!allAnswered && questions.length > 0 && (
              <p className="text-center text-xs text-slate-400">Answer all {questions.length} questions to submit</p>
            )}
          </div>
        )}

        {/* ─── Phase: RESULTS ─── */}
        {phase === 'results' && (
          <div className="space-y-4">
            {/* Score card */}
            <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-4xl font-black text-slate-900">{score}<span className="text-xl text-slate-400 font-semibold">/{questions.length}</span></p>
                <p className="text-lg font-bold text-emerald-600 mt-1">{Math.round((score / questions.length) * 100)}%</p>
                <p className="text-sm text-slate-500 mt-1">
                  {score === questions.length ? '🎉 Perfect score!' :
                   score >= questions.length * 0.8 ? '⭐ Excellent work!' :
                   score >= questions.length * 0.6 ? '👍 Good effort!' :
                   '📚 Keep practising!'}
                </p>
              </div>
              {saveMsg && <p className="text-xs text-emerald-600 font-medium">{saveMsg}</p>}
            </div>

            {/* Answer review */}
            {questions.map((q, idx) => {
              const chosen = answers[idx] ?? '';
              const isCorrect = chosen === q.options[q.correct];
              return (
                <div key={idx} className={`bg-white rounded-2xl border p-4 space-y-2 ${isCorrect ? 'border-emerald-100' : 'border-red-100'}`}>
                  <div className="flex items-start gap-3">
                    {isCorrect
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 leading-relaxed">
                        <span className="text-slate-400 font-bold mr-2">{idx + 1}.</span>
                        {q.text.split('_____').map((part, pi, arr) => (
                          <React.Fragment key={pi}>
                            {part}
                            {pi < arr.length - 1 && (
                              <span className={`inline mx-1 px-1.5 py-0.5 rounded font-bold text-xs ${
                                isCorrect
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700 line-through'
                              }`}>{chosen || '—'}</span>
                            )}
                          </React.Fragment>
                        ))}
                      </p>
                      {!isCorrect && (
                        <p className="text-xs text-slate-500 mt-1">
                          ✓ Correct: <strong className="text-emerald-700">{q.options[q.correct]}</strong>
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-1 italic">{q.explanation}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={restart}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Take Another Test
            </button>
          </div>
        )}

      </div>
    </StudentLayout>
  );
}
