import React, { useState, useEffect } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { authFetch } from '../../lib/apiUrl';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import {
  FileBarChart2, Users, HelpCircle, Trophy, ArrowLeft,
  CheckCircle2, XCircle, Target, Clock, ChevronRight, Loader2,
  Medal, BarChart3, Zap,
} from 'lucide-react';

interface ReportSummary {
  id: string; quizTitle: string; pin: string;
  totalQuestions: number; participantCount: number;
  endedAt: number; createdAt: number;
  avgScore: number; avgAccuracy: number;
}

interface ReportParticipant {
  rank: number; userId: string; displayName: string;
  score: number; correctAnswers: number; totalAnswers: number; accuracy: number;
}

interface ReportQuestion {
  index: number; body: string; correctAnswer: string; options: string[];
  totalAnswered: number; correctCount: number; accuracy: number;
}

interface ReportDetail {
  id: string; quizTitle: string; pin: string;
  totalQuestions: number; participantCount: number;
  endedAt: number; createdAt: number;
  leaderboard: ReportParticipant[];
  questionStats: ReportQuestion[];
}

const RANK_COLORS = ['from-amber-400 to-yellow-500', 'from-slate-300 to-slate-400', 'from-orange-400 to-amber-500'];
const RANK_ICONS = ['🥇', '🥈', '🥉'];

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(startTs: number, endTs: number) {
  const mins = Math.round((endTs - startTs) / 60000);
  return mins < 1 ? '< 1 min' : `${mins} min`;
}

export default function RealtimeQuizReports() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/teacher/rq-reports');
        const json = await res.json();
        if (json.success) setReports(json.reports);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/teacher/rq-reports/${id}`);
      const json = await res.json();
      if (json.success) setSelected(json.report);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <TeacherLayout>
      <div className="min-h-full bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key="detail"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              {/* Detail header */}
              <div className="mb-6 flex items-center gap-4">
                <button onClick={() => setSelected(null)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div>
                  <h1 className="text-2xl font-black text-slate-900">{selected.quizTitle}</h1>
                  <p className="text-sm text-slate-500">
                    {formatDate(selected.endedAt)} · PIN {selected.pin} · {formatDuration(selected.createdAt, selected.endedAt)} duration
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { icon: Users, label: 'Participants', value: selected.participantCount, color: 'text-violet-600', bg: 'bg-violet-50' },
                  { icon: HelpCircle, label: 'Questions', value: selected.totalQuestions, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { icon: Trophy, label: 'Top Score', value: selected.leaderboard[0]?.score ?? 0, color: 'text-amber-600', bg: 'bg-amber-50' },
                  {
                    icon: Target, label: 'Avg Accuracy',
                    value: selected.leaderboard.length > 0
                      ? `${Math.round(selected.leaderboard.reduce((s, p) => s + p.accuracy, 0) / selected.leaderboard.length)}%`
                      : '0%',
                    color: 'text-emerald-600', bg: 'bg-emerald-50',
                  },
                ].map(({ icon: Icon, label, value, color, bg }) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className={cn('mb-2 flex h-9 w-9 items-center justify-center rounded-xl', bg)}>
                      <Icon className={cn('h-5 w-5', color)} />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="text-2xl font-black text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {/* Leaderboard table */}
              <div className="mb-6 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl shadow-slate-100/60">
                <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-black text-slate-900">Leaderboard</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="px-6 py-3 text-left">Rank</th>
                        <th className="px-6 py-3 text-left">Student</th>
                        <th className="px-6 py-3 text-center">Score</th>
                        <th className="px-6 py-3 text-center">Correct</th>
                        <th className="px-6 py-3 text-center">Answered</th>
                        <th className="px-6 py-3 text-center">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.leaderboard.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No participants recorded</td></tr>
                      ) : selected.leaderboard.map((p, i) => (
                        <motion.tr key={p.userId}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className={cn('border-b border-slate-50 transition-colors hover:bg-slate-50/50',
                            i === 0 && 'bg-amber-50/40',
                            i === 1 && 'bg-slate-50/40',
                            i === 2 && 'bg-orange-50/40',
                          )}
                        >
                          <td className="px-6 py-4">
                            {p.rank <= 3 ? (
                              <span className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-sm font-black text-white shadow',
                                RANK_COLORS[p.rank - 1],
                              )}>
                                {RANK_ICONS[p.rank - 1]}
                              </span>
                            ) : (
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">
                                {p.rank}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-900">{p.displayName}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                              <Zap className="h-3 w-3" />{p.score}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="flex items-center justify-center gap-1 font-semibold text-emerald-700">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />{p.correctAnswers}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-slate-500">{p.totalAnswers}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="mx-auto flex max-w-[80px] flex-col items-center gap-1">
                              <span className={cn('text-xs font-bold',
                                p.accuracy >= 70 ? 'text-emerald-600' : p.accuracy >= 40 ? 'text-amber-600' : 'text-red-500'
                              )}>{p.accuracy}%</span>
                              <div className="h-1.5 w-full rounded-full bg-slate-100">
                                <div className={cn('h-full rounded-full',
                                  p.accuracy >= 70 ? 'bg-emerald-500' : p.accuracy >= 40 ? 'bg-amber-400' : 'bg-red-400'
                                )} style={{ width: `${p.accuracy}%` }} />
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Question breakdown */}
              <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl shadow-slate-100/60">
                <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  <h2 className="text-lg font-black text-slate-900">Question Breakdown</h2>
                </div>
                <div className="divide-y divide-slate-50">
                  {selected.questionStats.map((q, i) => (
                    <div key={i} className="px-6 py-5">
                      <div className="mb-3 flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-xs font-black text-violet-700">
                          {q.index + 1}
                        </span>
                        <p className="text-sm font-semibold text-slate-800 leading-relaxed">{q.body}</p>
                      </div>
                      <div className="ml-10 flex flex-wrap items-center gap-4 text-xs">
                        <span className="flex items-center gap-1 text-slate-400">
                          <Users className="h-3.5 w-3.5" />{q.totalAnswered} answered
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" />{q.correctCount} correct
                        </span>
                        <span className="flex items-center gap-1 text-red-500 font-semibold">
                          <XCircle className="h-3.5 w-3.5" />{q.totalAnswered - q.correctCount} wrong
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 rounded-full bg-slate-100 overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all',
                              q.accuracy >= 70 ? 'bg-emerald-500' : q.accuracy >= 40 ? 'bg-amber-400' : 'bg-red-400'
                            )} style={{ width: `${q.accuracy}%` }} />
                          </div>
                          <span className={cn('font-bold',
                            q.accuracy >= 70 ? 'text-emerald-600' : q.accuracy >= 40 ? 'text-amber-600' : 'text-red-500'
                          )}>{q.accuracy}%</span>
                        </div>
                      </div>
                      <div className="ml-10 mt-3 flex flex-wrap gap-2">
                        {q.options.map((opt, oi) => (
                          <span key={oi} className={cn(
                            'rounded-lg border px-3 py-1 text-xs font-semibold',
                            opt === q.correctAnswer
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-100 bg-slate-50 text-slate-500'
                          )}>
                            {opt === q.correctAnswer && '✓ '}{opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="list"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              {/* Header */}
              <div className="mb-8 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-200">
                  <FileBarChart2 className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-slate-900">Live Quiz Reports</h1>
                  <p className="text-slate-500">Session history and student rankings</p>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                </div>
              ) : reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white py-24 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                    <FileBarChart2 className="h-8 w-8 text-slate-400" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-700">No reports yet</h2>
                  <p className="mt-2 max-w-xs text-sm text-slate-400">
                    Reports are generated automatically when a Live Quiz session ends. Start a session to see results here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reports.map((r, i) => {
                    const avgAcc = r.avgAccuracy;
                    return (
                      <motion.div key={r.id}
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        onClick={() => openDetail(r.id)}
                        className="group cursor-pointer overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-md shadow-slate-100/60 transition hover:shadow-xl hover:shadow-violet-100/40 hover:-translate-y-0.5"
                      >
                        {/* Card top gradient bar */}
                        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-indigo-500" />
                        <div className="p-5">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow">
                              <Zap className="h-5 w-5" />
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-bold text-slate-500">
                              PIN {r.pin}
                            </span>
                          </div>

                          <h3 className="mb-1 text-base font-black text-slate-900 leading-tight line-clamp-2">
                            {r.quizTitle}
                          </h3>
                          <p className="mb-4 flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDate(r.endedAt)}
                          </p>

                          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-slate-50 px-2 py-2.5">
                              <p className="text-lg font-black text-slate-900">{r.participantCount}</p>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Players</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-2 py-2.5">
                              <p className="text-lg font-black text-slate-900">{r.totalQuestions}</p>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Questions</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-2 py-2.5">
                              <p className={cn('text-lg font-black',
                                avgAcc >= 70 ? 'text-emerald-600' : avgAcc >= 40 ? 'text-amber-600' : 'text-red-500'
                              )}>{avgAcc}%</p>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Accuracy</p>
                            </div>
                          </div>

                          {/* Top 3 mini podium */}
                          {r.avgScore > 0 && (
                            <div className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
                              <Medal className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span>Avg score <strong className="text-slate-800">{r.avgScore} pts</strong></span>
                            </div>
                          )}

                          <button
                            onClick={e => { e.stopPropagation(); openDetail(r.id); }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-md shadow-violet-200 transition group-hover:shadow-lg"
                          >
                            {detailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            View Details
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TeacherLayout>
  );
}
