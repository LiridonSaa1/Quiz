import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Users, Trophy, ChevronRight, Square, Play,
  Copy, Check, Loader2, Crown, Wifi, WifiOff, Clock,
  BarChart3, Radio, AlertCircle, ChevronLeft, RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Quiz { id: string; title: string; questionCount?: number; }
interface Participant { userId: string; displayName: string; score: number; status: string; answeredCurrent: boolean; }
interface LeaderboardEntry { rank: number; userId: string; displayName: string; score: number; }
interface CurrentQuestion {
  index: number; body: string; options: string[]; correctAnswer: string;
  points: number; timerSeconds: number; remainingSeconds: number; type: string;
}
interface SessionState {
  id: string; quizTitle: string; pin: string; status: string;
  currentQuestionIndex: number; totalQuestions: number; participantCount: number;
  questionStartedAt: number | null;
}

const normalizeOption = (opt: any): string =>
  opt && typeof opt === 'object' ? String(opt.text ?? opt.label ?? '') : String(opt ?? '');

// Resolve correctAnswer from option ID → text (quiz builder stores IDs like "opt_abc")
const resolveCorrectAnswer = (rawOptions: any[], correctAnswer: string): string => {
  const match = rawOptions.find((o: any) => o && typeof o === 'object' && o.id === correctAnswer);
  return match ? normalizeOption(match) : normalizeOption(correctAnswer);
};

type HostView = 'setup' | 'lobby' | 'active' | 'ended';

export default function RealtimeQuizHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [timerPerQuestion, setTimerPerQuestion] = useState(30);
  const [starting, setStarting] = useState(false);
  const [teamsEnabled, setTeamsEnabled] = useState(false);
  const [teamCount, setTeamCount] = useState(2);

  const [view, setView] = useState<HostView>('setup');
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [pinCopied, setPinCopied] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchQuizzes = async () => {
      setLoadingQuizzes(true);
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) return;
        const res = await authFetch(`/api/teacher/quizzes?userId=${encodeURIComponent(s.user.id)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.quizzes)) {
            setQuizzes(json.quizzes.map((q: any) => ({ id: q.id, title: q.title || 'Untitled Quiz' })));
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoadingQuizzes(false); }
    };
    fetchQuizzes();
  }, []);

  const pollSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await authFetch(`/api/teacher/realtime-quiz/${sessionId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;
      setSession(json.session);
      setParticipants(json.participants ?? []);
      setLeaderboard(json.leaderboard ?? []);
      if (json.currentQuestion) {
        const q = json.currentQuestion;
        const rawOptions = q.options ?? [];
        setCurrentQuestion({
          ...q,
          options: rawOptions.map(normalizeOption),
          correctAnswer: resolveCorrectAnswer(rawOptions, String(q.correctAnswer ?? '')),
        });
      }
      if (json.session.status === 'ended' && view !== 'ended') {
        setView('ended');
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch (_) {}
  }, [sessionId, view]);

  useEffect(() => {
    if (!sessionId) return;
    pollSession();
    pollRef.current = setInterval(pollSession, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, pollSession]);

  useEffect(() => {
    if (!sessionId || view !== 'active') return;
    if (realtimeRef.current) { realtimeRef.current.unsubscribe(); }
    const ch = supabase.channel(`quiz:${sessionId}`)
      .on('broadcast', { event: 'participant_joined' }, () => { pollSession(); })
      .on('broadcast', { event: 'leaderboard_updated' }, (p: any) => {
        if (p.payload?.leaderboard) setLeaderboard(p.payload.leaderboard);
        pollSession();
      })
      .on('broadcast', { event: 'question_started' }, () => { pollSession(); })
      .on('broadcast', { event: 'session_ended' }, (p: any) => {
        setView('ended');
        if (p.payload?.leaderboard) setLeaderboard(p.payload.leaderboard);
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
      })
      .subscribe();
    realtimeRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [sessionId, view, pollSession]);

  useEffect(() => {
    if (view !== 'active' || !currentQuestion) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(Math.max(0, Math.round(currentQuestion.remainingSeconds)));
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentQuestion?.index, view]);

  const handleStart = async () => {
    if (!selectedQuizId) { toast.error(t('realtimeQuiz.selectQuizRequired')); return; }
    setStarting(true);
    try {
      const res = await authFetch('/api/teacher/realtime-quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: selectedQuizId, timerPerQuestion, teamsEnabled, teamCount }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { toast.error(json.error || t('realtimeQuiz.failedToStart')); return; }
      setSessionId(json.sessionId);
      setView('lobby');
      toast.success(t('dashboard.quizStarted') + ` ${json.pin}`);
    } catch (e) { toast.error(t('realtimeQuiz.networkError')); }
    finally { setStarting(false); }
  };

  const handleNext = async () => {
    if (!sessionId) return;
    setAdvancing(true);
    try {
      const res = await authFetch(`/api/teacher/realtime-quiz/${sessionId}/next`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok || !json.success) { toast.error(json.error || 'Failed.'); return; }
      if (json.status === 'active') setView('active');
      if (json.status === 'ended') { setView('ended'); if (json.leaderboard) setLeaderboard(json.leaderboard); }
      await pollSession();
    } catch (e) { toast.error('Network error.'); }
    finally { setAdvancing(false); }
  };

  const handleEnd = async () => {
    if (!sessionId) return;
    if (!confirm(t('realtimeQuiz.endQuizConfirm'))) return;
    try {
      const res = await authFetch(`/api/teacher/realtime-quiz/${sessionId}/end`, { method: 'POST' });
      const json = await res.json();
      if (json.success) { setView('ended'); if (json.leaderboard) setLeaderboard(json.leaderboard); }
    } catch (_) {}
  };

  const copyPin = () => {
    if (!session?.pin) return;
    navigator.clipboard.writeText(session.pin).then(() => {
      setPinCopied(true); setTimeout(() => setPinCopied(false), 2000);
    });
  };

  const answeredCount = participants.filter(p => p.answeredCurrent).length;
  const pct = currentQuestion ? Math.round((timeLeft / currentQuestion.timerSeconds) * 100) : 0;

  return (
    <TeacherLayout>
      <div className="min-h-full bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-200">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">{t('realtimeQuiz.title')}</h1>
            <p className="text-sm text-slate-500">{t('realtimeQuiz.description')}</p>
          </div>
        </div>

        <AnimatePresence mode="wait">

          {/* ── SETUP VIEW ── */}
          {view === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="mx-auto max-w-xl">
              <div className="rounded-3xl border border-violet-100 bg-white p-8 shadow-xl shadow-violet-100/50">
                <h2 className="mb-6 text-xl font-bold text-slate-900">{t('realtimeQuiz.setupYourLiveQuiz')}</h2>

                <div className="mb-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">{t('realtimeQuiz.selectQuiz')}</label>
                  {loadingQuizzes ? (
                    <div className="flex items-center gap-2 py-4 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> {t('realtimeQuiz.loadingQuizzes')}</div>
                  ) : quizzes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
                      {t('realtimeQuiz.noQuizzesFound')}
                    </div>
                  ) : (
                    <select
                      value={selectedQuizId}
                      onChange={e => setSelectedQuizId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    >
                      <option value="">{t('realtimeQuiz.chooseQuiz')}</option>
                      {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                    </select>
                  )}
                </div>

                <div className="mb-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    {t('realtimeQuiz.timerPerQuestion')}: <span className="text-violet-600 font-bold">{t('realtimeQuiz.secondsLabel', { seconds: timerPerQuestion })}</span>
                  </label>
                  <input type="range" min={10} max={120} step={5} value={timerPerQuestion}
                    onChange={e => setTimerPerQuestion(Number(e.target.value))}
                    className="w-full accent-violet-600" />
                  <div className="mt-1 flex justify-between text-xs text-slate-400">
                    <span>{t('realtimeQuiz.seconds10')}</span><span>{t('realtimeQuiz.seconds60')}</span><span>{t('realtimeQuiz.seconds120')}</span>
                  </div>
                </div>

                <div className="mb-8 rounded-2xl border border-violet-100 bg-violet-50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{t('realtimeQuiz.teamVsTeamMode')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t('realtimeQuiz.splitStudents')}</p>
                    </div>
                    <button type="button"
                      onClick={() => setTeamsEnabled(v => !v)}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                        teamsEnabled ? 'bg-violet-600' : 'bg-slate-200'
                      )}
                    >
                      <span className={cn(
                        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
                        teamsEnabled ? 'translate-x-5' : 'translate-x-0'
                      )} />
                    </button>
                  </div>
                  {teamsEnabled && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        {t('realtimeQuiz.numberOfTeams')}: <span className="text-violet-600 font-bold">{t('realtimeQuiz.numberOfTeams_value', { count: teamCount })}</span>
                      </label>
                      <div className="flex gap-2">
                        {[2, 3, 4, 5, 6].map(n => (
                          <button key={n} type="button"
                            onClick={() => setTeamCount(n)}
                            className={cn(
                              'flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all',
                              teamCount === n ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
                            )}
                          >{n}</button>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {['Red','Blue','Green','Yellow','Purple','Orange'].slice(0, teamCount).map(colorName => (
                          <span key={colorName} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 border border-slate-200 shadow-sm">
                            {t('realtimeQuiz.teamLabel', { name: colorName })}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleStart}
                  disabled={!selectedQuizId || starting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-200 transition hover:shadow-xl disabled:opacity-50"
                >
                  {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
                  {starting ? t('realtimeQuiz.starting') : t('realtimeQuiz.startLiveQuiz')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── LOBBY VIEW ── */}
          {view === 'lobby' && session && (
            <motion.div key="lobby" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="mx-auto max-w-2xl">
              <div className="rounded-3xl border border-violet-100 bg-white p-8 shadow-xl shadow-violet-100/50">
                <div className="mb-6 text-center">
                  <p className="text-sm font-semibold uppercase tracking-widest text-violet-500">{t('realtimeQuiz.waitingForStudents')}</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">{session.quizTitle}</h2>
                  <p className="mt-1 text-sm text-slate-400">{t('realtimeQuiz.totalQuestions', { total: session.totalQuestions, timer: timerPerQuestion })}</p>
                </div>

                {/* PIN Display */}
                <div className="mb-6 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 p-6 text-center">
                  <p className="text-sm font-bold uppercase tracking-widest text-violet-200">{t('realtimeQuiz.quizPin')}</p>
                  <p className="mt-1 font-mono text-6xl font-black tracking-wider text-white">{session.pin}</p>
                  <button onClick={copyPin}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30 transition">
                    {pinCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {pinCopied ? t('realtimeQuiz.copied') : t('realtimeQuiz.copyPin')}
                  </button>
                </div>

                {/* Participants */}
                <div className="mb-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                      <Users className="h-4 w-4" /> {t('realtimeQuiz.playersJoined')}
                    </h3>
                    <span className="rounded-full bg-violet-100 px-3 py-0.5 text-sm font-bold text-violet-700">
                      {t('realtimeQuiz.players', { count: participants.length })}
                    </span>
                  </div>
                  {participants.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                      {t('realtimeQuiz.waitingForStudentsMsg', { pin: session.pin })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {participants.map(p => (
                        <motion.div key={p.userId} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                          className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                          <div className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="truncate">{p.displayName}</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={handleNext} disabled={advancing}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-200 transition hover:shadow-xl disabled:opacity-50">
                  {advancing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                  {advancing ? t('realtimeQuiz.starting') : t('realtimeQuiz.startQuiz')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── ACTIVE VIEW ── */}
          {view === 'active' && session && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid gap-6 lg:grid-cols-3">
              {/* Left: Question + Controls */}
              <div className="lg:col-span-2 space-y-4">
                {/* Session header */}
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                      <Radio className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{session.quizTitle}</p>
                      <p className="text-xs text-slate-400">PIN: <strong className="text-violet-600">{session.pin}</strong></p>
                    </div>
                  </div>
                  <button onClick={handleEnd}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition">
                    <Square className="h-3 w-3" /> End Quiz
                  </button>
                </div>

                {/* Question card */}
                {currentQuestion && (
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
                        Question {currentQuestion.index + 1} / {session.totalQuestions}
                      </span>
                      <div className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold',
                        timeLeft > 10 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'
                      )}>
                        <Clock className="h-4 w-4" />
                        {timeLeft}s
                      </div>
                    </div>

                    {/* Timer bar */}
                    <div className="mb-5 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full transition-colors', timeLeft > 10 ? 'bg-emerald-500' : 'bg-red-500')}
                        style={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>

                    <h3 className="mb-5 text-xl font-bold text-slate-900 leading-relaxed">{currentQuestion.body}</h3>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {currentQuestion.options.map((opt, i) => {
                        const baseColors = ['from-blue-500 to-blue-600', 'from-red-500 to-red-600', 'from-yellow-500 to-yellow-600', 'from-slate-500 to-slate-600'];
                        const isCorrect = opt === currentQuestion.correctAnswer;
                        return (
                          <div key={i} className={cn(
                            'flex items-center gap-3 rounded-2xl p-4 font-semibold transition-all',
                            isCorrect
                              ? 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-white ring-4 ring-emerald-300 ring-offset-2 shadow-lg shadow-emerald-200'
                              : cn('bg-gradient-to-r text-white opacity-60', baseColors[i % baseColors.length])
                          )}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 text-sm font-black">
                              {['A','B','C','D'][i]}
                            </span>
                            <span className="text-sm leading-snug flex-1">{opt}</span>
                            {isCorrect && (
                              <span className="ml-auto flex items-center gap-1 bg-white/30 rounded-lg px-2 py-0.5 text-xs font-black shrink-0">
                                <Check className="h-3.5 w-3.5" /> CORRECT
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Time's up banner */}
                    {timeLeft === 0 && (
                      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        <span className="text-sm font-semibold text-amber-700">Time's up — advancing to next question…</span>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-slate-500">
                        <span className="font-bold text-slate-800">{answeredCount}</span> / {participants.length} answered
                      </p>
                      <button onClick={handleNext} disabled={advancing}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50 transition">
                        {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                        {currentQuestion.index + 1 >= session.totalQuestions ? 'Finish' : 'Next Question'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Participants + Leaderboard */}
              <div className="space-y-4">
                {/* Live participants */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Users className="h-4 w-4" /> Players ({participants.length})
                  </h3>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {participants.map(p => (
                      <div key={p.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                        {p.status === 'connected' ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-slate-300" />}
                        <span className="flex-1 truncate text-slate-700">{p.displayName}</span>
                        {p.answeredCurrent && <Check className="h-3 w-3 text-emerald-500" />}
                        <span className="text-xs font-bold text-violet-600">{p.score}pt</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Leaderboard */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Trophy className="h-4 w-4 text-amber-500" /> Live Leaderboard
                  </h3>
                  <div className="space-y-2">
                    {leaderboard.slice(0, 8).map((e, i) => (
                      <div key={e.userId} className={cn(
                        'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                        i === 0 && 'bg-amber-50',
                        i === 1 && 'bg-slate-50',
                        i === 2 && 'bg-orange-50',
                      )}>
                        <span className={cn('w-5 text-center font-black text-xs',
                          i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'
                        )}>#{e.rank}</span>
                        {i === 0 && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                        <span className="flex-1 truncate font-medium text-slate-700">{e.displayName}</span>
                        <span className="font-bold text-violet-600">{e.score}</span>
                      </div>
                    ))}
                    {leaderboard.length === 0 && (
                      <p className="py-3 text-center text-xs text-slate-400">{t('realtimeQuiz.noAnswersYet')}</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ENDED VIEW ── */}
          {view === 'ended' && (
            <motion.div key="ended" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="mx-auto max-w-2xl">
              <div className="rounded-3xl border border-violet-100 bg-white p-8 shadow-xl shadow-violet-100/50 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-200">
                  <Trophy className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-3xl font-black text-slate-900">{t('realtimeQuiz.quizComplete')}</h2>
                {session && <p className="mt-1 text-slate-500">{session.quizTitle}</p>}

                <div className="my-8 space-y-3">
                  <h3 className="text-left text-sm font-bold uppercase tracking-wider text-slate-400">{t('realtimeQuiz.finalLeaderboard')}</h3>
                  {leaderboard.slice(0, 10).map((e, i) => (
                    <motion.div key={e.userId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-4 py-3 text-left',
                        i === 0 ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200' :
                        i === 1 ? 'bg-slate-50 border border-slate-200' :
                        i === 2 ? 'bg-orange-50 border border-orange-200' : 'bg-slate-50'
                      )}>
                      <span className={cn('w-8 text-center text-xl font-black',
                        i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'
                      )}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${e.rank}`}
                      </span>
                      <span className="flex-1 font-bold text-slate-800">{e.displayName}</span>
                      <span className="rounded-xl bg-violet-100 px-3 py-1 text-sm font-black text-violet-700">{e.score} pts</span>
                    </motion.div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="py-4 text-slate-400 text-sm">{t('realtimeQuiz.noParticipantsCompleted')}</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => { setView('setup'); setSessionId(''); setSession(null); setParticipants([]); setLeaderboard([]); setCurrentQuestion(null); }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition">
                    <RefreshCw className="h-4 w-4" /> {t('realtimeQuiz.newQuiz')}
                  </button>
                  <button onClick={() => navigate('/teacher/quizzes')}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 hover:shadow-xl transition">
                    <ChevronLeft className="h-4 w-4" /> {t('realtimeQuiz.backToQuizzes')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TeacherLayout>
  );
}
