import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Trophy, Clock, CheckCircle2, XCircle, Crown,
  Loader2, ChevronLeft, Radio, Users, Star, Volume2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import StudentLayout from '../../components/layout/StudentLayout';
import { useVoiceReading } from '../../hooks/useVoiceReading';

interface CurrentQuestion {
  index: number; body: string; options: string[];
  points: number; timerSeconds: number; remainingSeconds: number; type: string;
}
interface LeaderboardEntry { rank: number; userId: string; displayName: string; score: number; }
interface SessionState {
  sessionId: string; quizTitle: string; status: string;
  totalQuestions: number;
}
type PlayView = 'pin' | 'lobby' | 'question' | 'feedback' | 'ended';

const OPTION_COLORS = [
  { bg: 'bg-gradient-to-br from-blue-500 to-blue-600', hover: 'hover:from-blue-400 hover:to-blue-500', ring: 'ring-blue-300' },
  { bg: 'bg-gradient-to-br from-red-500 to-red-600', hover: 'hover:from-red-400 hover:to-red-500', ring: 'ring-red-300' },
  { bg: 'bg-gradient-to-br from-yellow-500 to-yellow-600', hover: 'hover:from-yellow-400 hover:to-yellow-500', ring: 'ring-yellow-300' },
  { bg: 'bg-gradient-to-br from-green-500 to-green-600', hover: 'hover:from-green-400 hover:to-green-500', ring: 'ring-green-300' },
];
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export default function RealtimeQuizPlay() {
  const navigate = useNavigate();

  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [view, setView] = useState<PlayView>('pin');

  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');

  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<{ isCorrect: boolean; pointsEarned: number; correctAnswer: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [questionKey, setQuestionKey] = useState(0);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamsEnabled, setTeamsEnabledState] = useState(false);
  const voice = useVoiceReading();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmitRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id);
        const meta = session.user.user_metadata;
        const name = meta?.display_name || meta?.full_name || session.user.email?.split('@')[0] || 'Student';
        setDisplayName(name);
      }
    });
  }, []);

  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(Math.max(0, Math.round(seconds)));
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const subscribeToSession = useCallback((sid: string) => {
    if (realtimeRef.current) realtimeRef.current.unsubscribe();
    const ch = supabase.channel(`quiz:${sid}`)
      .on('broadcast', { event: 'question_started' }, (p: any) => {
        const q = p.payload;
        const elapsed = q.startedAt ? (Date.now() - q.startedAt) / 1000 : 0;
        const remaining = Math.max(0, q.timerSeconds - elapsed);
        const question: CurrentQuestion = {
          index: q.index, body: q.body, options: q.options ?? [],
          points: q.points, timerSeconds: q.timerSeconds, remainingSeconds: remaining, type: 'multiple-choice',
        };
        setCurrentQuestion(question);
        setSelectedOption(null);
        setFeedbackResult(null);
        autoSubmitRef.current = false;
        setQuestionKey(prev => prev + 1);
        setView('question');
        startTimer(remaining);
      })
      .on('broadcast', { event: 'leaderboard_updated' }, (p: any) => {
        if (p.payload?.leaderboard) setLeaderboard(p.payload.leaderboard);
      })
      .on('broadcast', { event: 'session_ended' }, (p: any) => {
        if (p.payload?.leaderboard) setLeaderboard(p.payload.leaderboard);
        setView('ended');
        if (timerRef.current) clearInterval(timerRef.current);
        if (pollRef.current) clearInterval(pollRef.current);
      })
      .subscribe();
    realtimeRef.current = ch;
  }, [startTimer]);

  const pollState = useCallback(async (sid: string) => {
    try {
      const res = await authFetch(`/api/student/realtime-quiz/${sid}/state`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;
      setSessionState({ sessionId: sid, quizTitle: json.quizTitle, status: json.status, totalQuestions: json.totalQuestions });
      setScore(json.score ?? 0);
      if (json.submittedAnswers) setSubmittedAnswers(json.submittedAnswers);
      if (json.status === 'ended') {
        if (json.leaderboard) setLeaderboard(json.leaderboard);
        setView('ended');
      } else if (json.status === 'active' && json.currentQuestion) {
        const q = json.currentQuestion as CurrentQuestion;
        setCurrentQuestion(q);
        setQuestionKey(prev => prev + 1);
        startTimer(q.remainingSeconds ?? q.timerSeconds);
        const alreadyAnswered = json.submittedAnswers?.[q.index] !== undefined;
        setSelectedOption(alreadyAnswered ? json.submittedAnswers[q.index] : null);
        if (!alreadyAnswered) setView('question');
      }
    } catch (_) {}
  }, [startTimer]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (realtimeRef.current) realtimeRef.current.unsubscribe();
    };
  }, []);

  // Auto-submit when timer reaches 0
  useEffect(() => {
    if (timeLeft === 0 && view === 'question' && currentQuestion && !selectedOption && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      setView('feedback');
      setFeedbackResult({ isCorrect: false, pointsEarned: 0, correctAnswer: '' });
    }
  }, [timeLeft, view, currentQuestion, selectedOption]);

  const handleJoin = async () => {
    if (!pin.trim()) { toast.error('Enter a PIN.'); return; }
    if (!displayName.trim()) { toast.error('Enter your display name.'); return; }
    setJoining(true);
    try {
      const res = await authFetch('/api/student/realtime-quiz/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim(), displayName: displayName.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { toast.error(json.error || 'Failed to join.'); return; }

      setSessionId(json.sessionId);
      setSessionState({ sessionId: json.sessionId, quizTitle: json.quizTitle, status: json.status, totalQuestions: json.totalQuestions });
      setScore(json.score ?? 0);
      if (json.submittedAnswers) setSubmittedAnswers(json.submittedAnswers);
      if (json.teamName) setTeamName(json.teamName);
      if (json.teamsEnabled) setTeamsEnabledState(json.teamsEnabled);
      subscribeToSession(json.sessionId);

      if (json.status === 'waiting') {
        setView('lobby');
        pollRef.current = setInterval(() => pollState(json.sessionId), 3000);
      } else if (json.status === 'active' && json.currentQuestion) {
        const q = json.currentQuestion as CurrentQuestion;
        setCurrentQuestion(q);
        setQuestionKey(prev => prev + 1);
        startTimer(q.remainingSeconds ?? q.timerSeconds);
        setView('question');
      } else if (json.status === 'ended') {
        setView('ended');
      }
    } catch (e) { toast.error('Network error.'); }
    finally { setJoining(false); }
  };

  const handleSelectOption = async (opt: string) => {
    if (selectedOption || !currentQuestion || submitting) return;
    if (submittedAnswers[currentQuestion.index] !== undefined) return;
    setSelectedOption(opt);
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/student/realtime-quiz/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIndex: currentQuestion.index, optionText: opt }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setScore(json.score);
        setSubmittedAnswers(prev => ({ ...prev, [currentQuestion.index]: opt }));
        setFeedbackResult({ isCorrect: json.isCorrect, pointsEarned: json.pointsEarned, correctAnswer: json.correctAnswer });
        setView('feedback');
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        toast.error(json.error || 'Failed to submit.');
        setSelectedOption(null);
      }
    } catch (e) { toast.error('Network error.'); setSelectedOption(null); }
    finally { setSubmitting(false); }
  };

  const myRank = leaderboard.find(e => e.userId === currentUserId)?.rank ?? null;

  return (
    <StudentLayout>
      <div className="min-h-full bg-gradient-to-br from-violet-900 via-indigo-900 to-slate-900 p-4 sm:p-8">
        <AnimatePresence mode="wait">

          {/* ── PIN ENTRY ── */}
          {view === 'pin' && (
            <motion.div key="pin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="mx-auto max-w-md pt-10">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-2xl shadow-violet-500/40">
                  <Zap className="h-10 w-10 text-white" />
                </div>
                <h1 className="text-4xl font-black text-white">Live Quiz</h1>
                <p className="mt-2 text-violet-300">Enter the PIN shown by your teacher</p>
              </div>

              <div className="rounded-3xl bg-white/10 p-8 backdrop-blur-sm border border-white/20">
                <div className="mb-5">
                  <label className="mb-2 block text-sm font-semibold text-violet-200">Your Name</label>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Enter your display name"
                    className="w-full rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-white placeholder-violet-300 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50 text-lg"
                  />
                </div>
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-semibold text-violet-200">Quiz PIN</label>
                  <input
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-center text-white placeholder-violet-300 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50 font-mono text-4xl font-black tracking-widest"
                  />
                </div>
                <button onClick={handleJoin} disabled={joining || pin.length < 6}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 py-4 text-lg font-bold text-white shadow-xl shadow-violet-500/40 hover:shadow-2xl transition disabled:opacity-50">
                  {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
                  {joining ? 'Joining…' : 'Join Quiz!'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── LOBBY ── */}
          {view === 'lobby' && sessionState && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mx-auto max-w-md pt-10 text-center">
              <div className="rounded-3xl bg-white/10 p-10 backdrop-blur-sm border border-white/20">
                <div className="mb-4 flex items-center justify-center">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-500/40">
                      <Users className="h-10 w-10 text-white" />
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-5 w-5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-5 w-5 bg-emerald-500" />
                    </span>
                  </div>
                </div>
                <h2 className="text-2xl font-black text-white">{sessionState.quizTitle}</h2>
                <p className="mt-2 text-violet-300">{sessionState.totalQuestions} questions</p>
                <div className="mt-6 rounded-2xl bg-white/10 px-6 py-4">
                  <p className="text-violet-300 text-sm">Playing as</p>
                  <p className="text-xl font-bold text-white">{displayName}</p>
                </div>
                {teamsEnabled && teamName && (
                  <div className="mt-3 rounded-2xl bg-white/10 px-5 py-3">
                    <p className="text-xs text-violet-300 mb-1">Your Team</p>
                    <p className="text-lg font-black text-white">🛡 Team {teamName}</p>
                  </div>
                )}
                <div className="mt-6 flex items-center justify-center gap-2 text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-medium">Waiting for teacher to start…</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── QUESTION ── */}
          {view === 'question' && currentQuestion && (
            <motion.div key={`q-${questionKey}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              className="mx-auto max-w-2xl">
              {/* Timer bar */}
              <div className="mb-4 flex items-center gap-4">
                <div className="flex-1 h-3 rounded-full bg-white/20 overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full transition-colors', timeLeft > currentQuestion.timerSeconds * 0.3 ? 'bg-emerald-400' : 'bg-red-400')}
                    animate={{ width: `${Math.max(0, (timeLeft / currentQuestion.timerSeconds) * 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black',
                  timeLeft > currentQuestion.timerSeconds * 0.3 ? 'bg-emerald-400 text-emerald-900' : 'bg-red-400 text-red-900 animate-pulse'
                )}>
                  {timeLeft}
                </div>
              </div>

              {/* Question info */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-violet-300">
                  Question {currentQuestion.index + 1} / {sessionState?.totalQuestions ?? '?'}
                </span>
                <span className="flex items-center gap-1 text-sm font-bold text-amber-300">
                  <Star className="h-4 w-4" /> {currentQuestion.points} pts
                </span>
              </div>

              {teamsEnabled && teamName && (
                <div className="mb-3 flex items-center justify-center">
                  <span className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white">
                    🛡 Team {teamName}
                  </span>
                </div>
              )}

              {/* Question body */}
              <div className="mb-6 rounded-3xl bg-white/10 p-6 backdrop-blur-sm border border-white/10 relative">
                <p className="text-xl font-bold text-white leading-relaxed text-center pr-10">{currentQuestion.body}</p>
                {voice.isSupported && (
                  <button
                    type="button"
                    onClick={() => voice.toggle(currentQuestion.body)}
                    className={cn(
                      'absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                      voice.isReading ? 'bg-violet-400 text-white animate-pulse' : 'bg-white/20 text-white/70 hover:bg-white/30'
                    )}
                    title={voice.isReading ? 'Stop reading' : 'Read question'}
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {currentQuestion.options.map((opt, i) => {
                  const color = OPTION_COLORS[i % OPTION_COLORS.length];
                  return (
                    <motion.button key={i} whileTap={{ scale: 0.97 }}
                      onClick={() => handleSelectOption(opt)}
                      disabled={!!selectedOption || submitting}
                      className={cn(
                        'relative flex items-center gap-3 rounded-3xl p-5 text-white font-bold text-left transition shadow-xl',
                        color.bg, color.hover,
                        selectedOption === opt && 'ring-4 ring-white ring-offset-2 ring-offset-transparent',
                        selectedOption && selectedOption !== opt && 'opacity-50',
                        'disabled:cursor-not-allowed'
                      )}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black/20 text-xl font-black">
                        {OPTION_LETTERS[i]}
                      </span>
                      <span className="leading-snug">{opt}</span>
                      {submitting && selectedOption === opt && (
                        <Loader2 className="ml-auto h-5 w-5 animate-spin shrink-0" />
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Score */}
              <div className="mt-4 text-center">
                <span className="text-sm font-bold text-violet-300">Score: <span className="text-white">{score}</span></span>
              </div>
            </motion.div>
          )}

          {/* ── FEEDBACK ── */}
          {view === 'feedback' && feedbackResult && (
            <motion.div key="feedback" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="mx-auto max-w-md pt-10 text-center">
              <div className={cn(
                'rounded-3xl p-10 border',
                feedbackResult.isCorrect
                  ? 'bg-emerald-500/20 border-emerald-400/30'
                  : 'bg-red-500/20 border-red-400/30'
              )}>
                <div className={cn('mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-3xl shadow-2xl',
                  feedbackResult.isCorrect ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/40' : 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-500/40'
                )}>
                  {feedbackResult.isCorrect
                    ? <CheckCircle2 className="h-12 w-12 text-white" />
                    : <XCircle className="h-12 w-12 text-white" />}
                </div>
                <h2 className={cn('text-4xl font-black', feedbackResult.isCorrect ? 'text-emerald-300' : 'text-red-300')}>
                  {feedbackResult.isCorrect ? 'Correct!' : timeLeft === 0 ? "Time's Up!" : 'Wrong!'}
                </h2>
                {feedbackResult.isCorrect ? (
                  <p className="mt-3 text-2xl font-bold text-white">+{feedbackResult.pointsEarned} points</p>
                ) : feedbackResult.correctAnswer ? (
                  <p className="mt-3 text-violet-200 text-sm">Correct answer: <strong className="text-white">{feedbackResult.correctAnswer}</strong></p>
                ) : null}
                <div className="mt-6 rounded-2xl bg-white/10 px-6 py-4">
                  <p className="text-sm text-violet-300">Total Score</p>
                  <p className="text-3xl font-black text-white">{score}</p>
                </div>
                <p className="mt-4 text-sm text-violet-300 animate-pulse">Waiting for next question…</p>
              </div>
            </motion.div>
          )}

          {/* ── ENDED ── */}
          {view === 'ended' && (
            <motion.div key="ended" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="mx-auto max-w-lg pt-6">
              <div className="rounded-3xl bg-white/10 p-8 backdrop-blur-sm border border-white/20 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-2xl shadow-amber-500/40">
                  <Trophy className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-3xl font-black text-white">Quiz Complete!</h2>
                {sessionState && <p className="mt-1 text-violet-300">{sessionState.quizTitle}</p>}

                {myRank && (
                  <div className={cn(
                    'mt-5 rounded-2xl p-4',
                    myRank === 1 ? 'bg-amber-500/20 border border-amber-400/30' : 'bg-white/10 border border-white/20'
                  )}>
                    <p className="text-sm text-violet-300">Your Final Result</p>
                    <p className="mt-1 text-2xl font-black text-white">
                      {myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`} — {score} pts
                    </p>
                  </div>
                )}

                {/* Leaderboard */}
                <div className="mt-6 space-y-2 text-left">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-violet-300">Leaderboard</h3>
                  {leaderboard.slice(0, 8).map((e, i) => (
                    <motion.div key={e.userId}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-4 py-3',
                        e.userId === currentUserId ? 'bg-violet-500/30 border border-violet-400/40' : 'bg-white/10',
                      )}>
                      <span className="w-7 text-center font-black text-lg">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${e.rank}`}
                      </span>
                      {i === 0 && <Crown className="h-4 w-4 text-amber-400 shrink-0" />}
                      <span className={cn('flex-1 font-bold truncate', e.userId === currentUserId ? 'text-violet-200' : 'text-white')}>
                        {e.displayName} {e.userId === currentUserId ? '(You)' : ''}
                      </span>
                      <span className="font-black text-violet-300">{e.score} pts</span>
                    </motion.div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="py-4 text-center text-sm text-violet-300">No results available.</p>
                  )}
                </div>

                <button onClick={() => navigate('/student')}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 py-3 text-sm font-bold text-white shadow-xl shadow-violet-500/40 hover:shadow-2xl transition">
                  <ChevronLeft className="h-4 w-4" /> Back to Dashboard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StudentLayout>
  );
}
