import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, ChevronLeft, ChevronRight, Send, CheckCircle2, BookOpen,
  Volume2, VolumeX, Headphones, PenTool, List, FileText,
  AlertCircle, Play, Pause, Check, X, CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Quiz, Question } from '../../types';
import { authFetch } from '../../lib/apiUrl';
import { supabase } from '../../supabase';
import { fetchStudentAccessibleQuizById } from '../../lib/studentQuizAccess';
import { insertAttemptWithFallback } from '../../lib/quizAttempts';
import { isDirectVideoFileUrl, isLikelyVideoLink, toEmbedVideoUrl } from '../../lib/quizMedia';
import BlankText from '../../components/BlankText';
import { questionBodyFromRow } from '../../lib/questionText';

interface QuizSection {
  id: string;
  title: string;
  type: string;
  instructions?: string;
  audio_url?: string;
  order_index: number;
  questions: (Question & { section_id?: string; globalIndex: number })[];
}

const SECTION_STYLE: Record<string, { label: string; color: string; bg: string; border: string; gradient: string }> = {
  grammar:    { label: 'Grammar',    color: 'text-violet-700',  bg: 'bg-violet-100', border: 'border-violet-200', gradient: 'from-violet-700 to-purple-600' },
  listening:  { label: 'Listening',  color: 'text-amber-700',   bg: 'bg-amber-100',  border: 'border-amber-200',  gradient: 'from-amber-600 to-orange-500' },
  reading:    { label: 'Reading',    color: 'text-emerald-700', bg: 'bg-emerald-100',border: 'border-emerald-200',gradient: 'from-emerald-700 to-teal-600' },
  writing:    { label: 'Writing',    color: 'text-rose-700',    bg: 'bg-rose-100',   border: 'border-rose-200',   gradient: 'from-rose-700 to-red-600' },
  vocabulary: { label: 'Vocabulary', color: 'text-teal-700',    bg: 'bg-teal-100',   border: 'border-teal-200',   gradient: 'from-teal-700 to-cyan-600' },
  general:    { label: 'General',    color: 'text-blue-700',    bg: 'bg-blue-100',   border: 'border-blue-200',   gradient: 'from-blue-700 to-indigo-600' },
};
const sectionStyle = (type: string) => SECTION_STYLE[type] || SECTION_STYLE.general;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { void audioRef.current.play(); }
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <Headphones className="w-5 h-5 text-amber-600 shrink-0" />
      <audio
        ref={audioRef}
        src={url}
        muted={muted}
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-600 text-white hover:bg-amber-700 transition-colors shrink-0"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="text-xs font-semibold text-amber-700 mb-1">Audio</div>
        <div className="relative h-1.5 rounded-full bg-amber-200 cursor-pointer" onClick={(e) => {
          if (!audioRef.current || !duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          audioRef.current.currentTime = pct * duration;
        }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-amber-600 transition-all"
            style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
          />
        </div>
        {duration > 0 && (
          <div className="text-[10px] text-amber-600 mt-1">
            {formatTime(Math.floor(progress))} / {formatTime(Math.floor(duration))}
          </div>
        )}
      </div>
      <button onClick={() => setMuted(!muted)} className="text-amber-600 hover:text-amber-800 transition-colors">
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </div>
  );
}

function MediaDisplay({ url, mediaType }: { url: string; mediaType?: string }) {
  if (!url?.trim()) return null;
  const isVideo = mediaType === 'video' || (mediaType !== 'image' && isLikelyVideoLink(url));
  if (isVideo && isDirectVideoFileUrl(url)) {
    return <video src={url} controls className="w-full max-h-64 rounded-xl bg-black" playsInline />;
  }
  if (isVideo) {
    return (
      <iframe
        src={toEmbedVideoUrl(url)}
        className="w-full aspect-video rounded-xl border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <img src={url} alt="" className="w-full max-h-64 object-contain rounded-xl" />;
}

type AnsweredQ = Question & { section_id?: string; globalIndex: number };

function QuestionItem({
  q,
  answer,
  onAnswer,
}: {
  q: AnsweredQ;
  answer: string;
  onAnswer: (id: string, value: string) => void;
}) {
  const isInstruction = q.type === 'instruction';
  const opts = Array.isArray(q.options) ? q.options : [];

  return (
    <div
      id={`q-${q.id}`}
      className={cn(
        'rounded-2xl border bg-white shadow-sm overflow-hidden',
        isInstruction ? 'border-slate-100' : 'border-slate-200',
      )}
    >
      <div className={cn(
        'px-5 py-3 flex items-center gap-3',
        isInstruction ? 'bg-slate-50' : 'bg-white border-b border-slate-100',
      )}>
        {!isInstruction && (
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
            {q.globalIndex}
          </span>
        )}
        <span className={cn(
          'text-[11px] font-bold uppercase tracking-widest',
          isInstruction ? 'text-slate-400' : 'text-slate-500',
        )}>
          {String(q.type).replace(/-/g, ' ')}
        </span>
        {!isInstruction && answer && (
          <Check className="w-4 h-4 text-emerald-500 ml-auto" />
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Question / passage text */}
        {q.type === 'reading' && q.readingPassage && (
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {q.readingPassage}
          </div>
        )}

        {q.mediaUrl && <MediaDisplay url={q.mediaUrl} mediaType={q.mediaType} />}

        <p className={cn(
          'leading-relaxed',
          isInstruction ? 'text-slate-600 text-sm italic' : 'text-slate-800 font-medium',
        )}>
          <BlankText text={q.text} />
        </p>

        {/* Answer UI */}
        {(q.type === 'multiple-choice' || q.type === 'true-false' || q.type === 'image' || q.type === 'video' || q.type === 'reading') && (
          <div className="space-y-2">
            {opts.map((opt) => {
              const selected = answer === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onAnswer(q.id, selected ? '' : opt.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm font-medium transition-all duration-150',
                    selected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40',
                  )}
                >
                  <span className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    selected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300',
                  )}>
                    {selected && <Check className="w-3.5 h-3.5" />}
                  </span>
                  {opt.text}
                </button>
              );
            })}
          </div>
        )}

        {q.type === 'fill-in-the-blank' && (
          <input
            type="text"
            value={answer}
            onChange={(e) => onAnswer(q.id, e.target.value)}
            placeholder="Type your answer…"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
          />
        )}

        {q.type === 'open-text' && (
          <textarea
            value={answer}
            onChange={(e) => onAnswer(q.id, e.target.value)}
            placeholder="Write your answer…"
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition resize-none"
          />
        )}
      </div>
    </div>
  );
}

export default function QuizExperience() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [sections, setSections] = useState<QuizSection[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [userId, setUserId] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const autoSubmitRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleAnswer = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const buildSections = useCallback((
    rawSections: { id: string; title: string; type: string; instructions?: string; audio_url?: string; order_index: number }[],
    rawQuestions: (Question & { section_id?: string })[],
  ): QuizSection[] => {
    let globalIndex = 1;
    if (rawSections.length === 0) {
      return [{
        id: '__default__',
        title: 'Questions',
        type: 'general',
        order_index: 0,
        questions: rawQuestions.map((q) => ({ ...q, globalIndex: globalIndex++ })),
      }];
    }

    const sectioned = rawSections
      .sort((a, b) => a.order_index - b.order_index)
      .map((sec) => {
        const qs = rawQuestions
          .filter((q) => q.section_id === sec.id)
          .map((q) => ({ ...q, globalIndex: globalIndex++ }));
        return { ...sec, questions: qs };
      });

    const unassigned = rawQuestions.filter((q) => !q.section_id || !rawSections.find((s) => s.id === q.section_id));
    if (unassigned.length > 0) {
      sectioned.push({
        id: '__other__',
        title: 'Other Questions',
        type: 'general',
        order_index: 9999,
        questions: unassigned.map((q) => ({ ...q, globalIndex: globalIndex++ })),
      });
    }

    return sectioned;
  }, []);

  useEffect(() => {
    if (!quizId) {
      setLoadError('Quiz ID is missing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id || '';
        setUserId(uid);

        const quizData = await fetchStudentAccessibleQuizById(quizId);
        if (!quizData) { setLoadError('This quiz is not available.'); return; }
        setQuiz(quizData);

        const now = new Date().toISOString();
        setStartedAt(now);

        if (quizData.timeLimit && quizData.timeLimit > 0) {
          setTimeLeft(quizData.timeLimit * 60);
        }

        // Fetch sections (graceful — table may not exist yet)
        let rawSections: { id: string; title: string; type: string; instructions?: string; audio_url?: string; order_index: number }[] = [];
        try {
          const secRes = await authFetch(`/api/student/quizzes/${encodeURIComponent(quizId)}/sections`);
          if (secRes.ok) {
            const secJson = await secRes.json().catch(() => ({}));
            rawSections = Array.isArray(secJson?.sections) ? secJson.sections : [];
          }
        } catch { /* sections table may not exist yet */ }

        // Fetch questions
        const qRes = await authFetch(`/api/student/quizzes/${encodeURIComponent(quizId)}/questions`);
        const qJson = await qRes.json().catch(() => ({}));
        if (!qRes.ok) throw new Error(String(qJson?.error || 'Failed to load questions'));

        const rawQuestions: (Question & { section_id?: string })[] = (qJson?.questions || [])
          .filter((row: any) => row != null)
          .map((row: Record<string, unknown>, _rowIdx: number) => {
            // Normalize options: ensure they are always {id, text} objects for QuestionItem
            const rawOpts = Array.isArray(row.options) ? row.options : [];
            const normalizedOpts = rawOpts.map((o: any, i: number) =>
              typeof o === 'string'
                ? { id: `opt_${i}`, text: o }
                : { id: String(o?.id ?? `opt_${i}`), text: String(o?.text ?? o?.label ?? o ?? '') }
            );
            return {
              id: String(row.id || ''),
              quizId: String(row.quiz_id || ''),
              type: row.type as Question['type'],
              text: questionBodyFromRow(row),
              options: normalizedOpts.length > 0 ? normalizedOpts : undefined,
              correctAnswer: String(row.correct_answer ?? ''),
              points: Number(row.points || 1),
              explanation: row.explanation as string | undefined,
              mediaUrl: row.media_url as string | undefined,
              mediaType: row.media_type as string | undefined,
              readingPassage: row.reading_passage as string | undefined,
              orderIndex: row.order_index as number | undefined,
              section_id: row.section_id as string | undefined,
            };
          });

        if (rawQuestions.length === 0) {
          setLoadError('This quiz has no questions yet.');
          return;
        }

        setSections(buildSections(rawSections, rawQuestions));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load quiz';
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [quizId, buildSections]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          if (!autoSubmitRef.current) {
            autoSubmitRef.current = true;
            toast.info('Time is up! Submitting your quiz…');
            void handleSubmit(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft !== null && timeLeft > 0]);

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
  const answeredCount = sections.reduce(
    (sum, s) => sum + s.questions.filter((q) => q.type !== 'instruction' && answers[q.id]).length,
    0,
  );
  const scorableTotal = sections.reduce(
    (sum, s) => sum + s.questions.filter((q) => q.type !== 'instruction').length,
    0,
  );

  const handleSubmit = async (autoSubmit = false) => {
    if (!quiz || !quizId) return;
    if (submitting) return;
    setSubmitting(true);
    setShowConfirm(false);
    try {
      // Calculate score
      const allQuestions = sections.flatMap((s) => s.questions);
      let earned = 0;
      let possible = 0;
      for (const q of allQuestions) {
        if (q.type === 'instruction') continue;
        const pts = q.points || 1;
        possible += pts;
        const userAns = (answers[q.id] || '').trim().toLowerCase();
        const correct = String(q.correctAnswer || '').trim().toLowerCase();
        let isCorrect = false;
        if (q.type === 'multiple-choice' || q.type === 'true-false' || q.type === 'image' || q.type === 'video' || q.type === 'reading') {
          isCorrect = userAns === correct;
        } else if (q.type === 'fill-in-the-blank' || q.type === 'open-text') {
          isCorrect = correct.split(',').map((s) => s.trim()).some((k) => k && userAns.includes(k));
        }
        if (isCorrect) earned += pts;
      }

      const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
      const answersArray = allQuestions
        .filter((q) => q.type !== 'instruction')
        .map((q) => ({
          questionId: q.id,
          answer: answers[q.id] || '',
          isCorrect: (() => {
            const ua = (answers[q.id] || '').trim().toLowerCase();
            const ca = String(q.correctAnswer || '').trim().toLowerCase();
            if (q.type === 'fill-in-the-blank' || q.type === 'open-text') {
              return ca.split(',').map((s) => s.trim()).some((k) => k && ua.includes(k));
            }
            return ua === ca;
          })(),
          timeSpent: 0,
        }));

      const attemptId = await insertAttemptWithFallback({
        quizId,
        studentId: userId,
        answers: answersArray,
        score,
        timeTaken: quiz.timeLimit ? (quiz.timeLimit * 60) - (timeLeft || 0) : 0,
        startedAt: startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'completed',
      });

      if (attemptId) {
        toast.success('Quiz submitted!');
        navigate(`/student/results/${attemptId}`);
      } else {
        toast.success(`Quiz completed! Score: ${score}%`);
        navigate('/student/quizzes');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit quiz');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading quiz…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Quiz Unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{loadError}</p>
          <button
            onClick={() => navigate('/student/quizzes')}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Quizzes
          </button>
        </div>
      </div>
    );
  }

  const activeSection = sections[activeSectionIdx];
  const progressPct = scorableTotal > 0 ? Math.round((answeredCount / scorableTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── HEADER ── */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-slate-200 bg-white/95 backdrop-blur-sm z-20 shrink-0">
        <button
          onClick={() => navigate('/student/quizzes')}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Quiz</p>
          <p className="text-sm font-bold text-slate-800 truncate">{quiz?.title}</p>
        </div>

        {/* Progress */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
          <span className="font-bold text-indigo-700">{answeredCount}</span>
          <span className="text-slate-400">/</span>
          <span>{scorableTotal} answered</span>
        </div>

        {/* Timer */}
        {timeLeft !== null && (
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold',
            timeLeft <= 60 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-slate-100 text-slate-700',
          )}>
            <Clock className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>
        )}

        <button
          onClick={() => setShowConfirm(true)}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Submit</span>
        </button>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100 shrink-0">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT SIDEBAR */}
        <aside className="w-64 xl:w-72 shrink-0 flex flex-col bg-slate-900 text-white overflow-y-auto">
          <div className="p-4 border-b border-white/10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Sections</p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CircleDot className="w-3.5 h-3.5" />
              <span>{progressPct}% complete</span>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {sections.map((sec, idx) => {
              const style = sectionStyle(sec.type);
              const secAnswered = sec.questions.filter(
                (q) => q.type !== 'instruction' && answers[q.id],
              ).length;
              const secTotal = sec.questions.filter((q) => q.type !== 'instruction').length;
              const isActive = idx === activeSectionIdx;
              const isComplete = secTotal > 0 && secAnswered === secTotal;

              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSectionIdx(idx)}
                  className={cn(
                    'w-full text-left rounded-xl px-3 py-2.5 transition-all duration-150',
                    isActive
                      ? 'bg-white/15 ring-1 ring-white/20'
                      : 'hover:bg-white/8',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0',
                      isActive ? 'bg-white/20' : 'bg-white/10',
                    )}>
                      {isComplete ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <span>{idx + 1}</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-sm font-semibold truncate',
                        isActive ? 'text-white' : 'text-slate-300',
                      )}>
                        {sec.title}
                      </p>
                      {sec.type !== 'general' && (
                        <p className="text-[10px] text-slate-500 font-medium capitalize">{sec.type}</p>
                      )}
                    </div>
                    {secTotal > 0 && (
                      <span className={cn(
                        'text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-md',
                        isComplete
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-white/10 text-slate-400',
                      )}>
                        {secAnswered}/{secTotal}
                      </span>
                    )}
                  </div>

                  {/* Question dots */}
                  {sec.questions.filter((q) => q.type !== 'instruction').length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 ml-8">
                      {sec.questions
                        .filter((q) => q.type !== 'instruction')
                        .map((q) => (
                          <span
                            key={q.id}
                            className={cn(
                              'w-2 h-2 rounded-full transition-colors',
                              answers[q.id] ? 'bg-emerald-400' : 'bg-white/20',
                            )}
                          />
                        ))}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar submit */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Submit Quiz
            </button>
          </div>
        </aside>

        {/* RIGHT CONTENT */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {activeSection && (
            <>
              {/* Section header */}
              <div
                className="px-6 pt-6 pb-5"
                style={{
                  background: `linear-gradient(135deg, ${
                    sectionStyle(activeSection.type).gradient.replace('from-', '').replace(' to-', ', ')
                  })`,
                }}
              >
                <div className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest mb-2 bg-white/20 text-white',
                )}>
                  {activeSection.type.toUpperCase()}
                </div>
                <h2 className="text-xl font-extrabold text-white">{activeSection.title}</h2>
                <p className="text-white/70 text-sm mt-1">
                  {activeSection.questions.filter((q) => q.type !== 'instruction').length} question
                  {activeSection.questions.filter((q) => q.type !== 'instruction').length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="px-6 py-6 space-y-4">
                {/* Audio */}
                {activeSection.audio_url && (
                  <AudioPlayer url={activeSection.audio_url} />
                )}


                {/* Questions */}
                {activeSection.questions.map((q) => (
                  <QuestionItem
                    key={q.id}
                    q={q}
                    answer={answers[q.id] || ''}
                    onAnswer={handleAnswer}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── SECTION NAV FOOTER ── */}
      <footer className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-200 bg-white shrink-0 z-20">
        <button
          onClick={() => setActiveSectionIdx((i) => Math.max(0, i - 1))}
          disabled={activeSectionIdx === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" /> Previous Section
        </button>

        <div className="flex items-center gap-1.5">
          {sections.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSectionIdx(idx)}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                idx === activeSectionIdx ? 'bg-indigo-600 w-4' : 'bg-slate-300 hover:bg-slate-400',
              )}
            />
          ))}
        </div>

        {activeSectionIdx < sections.length - 1 ? (
          <button
            onClick={() => setActiveSectionIdx((i) => Math.min(sections.length - 1, i + 1))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Next Section <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            <Send className="w-4 h-4" /> Finish
          </button>
        )}
      </footer>

      {/* ── SUBMIT CONFIRM MODAL ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 mx-auto">
              <Send className="w-6 h-6 text-indigo-600" />
            </div>
            <h2 className="text-center text-lg font-bold text-slate-900">Submit Quiz?</h2>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm text-center text-slate-600">
              You've answered <span className="font-bold text-indigo-700">{answeredCount}</span> of{' '}
              <span className="font-bold">{scorableTotal}</span> questions.
              {answeredCount < scorableTotal && (
                <p className="mt-1 text-amber-600 font-medium">
                  {scorableTotal - answeredCount} unanswered — these will be marked as incorrect.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Keep Going
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
