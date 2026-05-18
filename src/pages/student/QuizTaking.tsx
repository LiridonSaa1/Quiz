import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useVoiceReading } from '../../hooks/useVoiceReading';
import { supabase } from '../../supabase';
import { Quiz, Question, QuizAttempt } from '../../types';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { QuizPageSkeleton } from '../../components/ui/Skeleton';
import { insertAttemptWithFallback } from '../../lib/quizAttempts';
import { isDirectVideoFileUrl, isLikelyVideoLink, toEmbedVideoUrl } from '../../lib/quizMedia';
import { questionBodyFromRow } from '../../lib/questionText';
import { fetchStudentAccessibleQuizById } from '../../lib/studentQuizAccess';
import { authFetch } from '../../lib/apiUrl';

function VoiceButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const { isReading, isSupported, toggle } = useVoiceReading();
  if (!isSupported) return null;
  return (
    <button
      type="button"
      onClick={() => toggle(text)}
      title={isReading ? t('student.quizTaking.stopReading') : t('student.quizTaking.readAloud')}
      className={cn(
        'shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border-2 transition-all mt-1',
        isReading
          ? 'border-indigo-400 bg-indigo-50 text-indigo-600 shadow-md shadow-indigo-100 animate-pulse'
          : 'border-slate-200 bg-white text-slate-400 hover:border-indigo-300 hover:text-indigo-500'
      )}
    >
      {isReading ? <Volume2 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
    </button>
  );
}

function QuizMediaDisplay({ url, mediaType }: { url: string; mediaType?: string }) {
  const treatAsVideo = mediaType === 'video' || (mediaType !== 'image' && isLikelyVideoLink(url));
  if (!url?.trim()) return null;
  if (treatAsVideo && isDirectVideoFileUrl(url)) {
    return (
           <video src={url} controls className="w-full max-h-[min(360px,50vh)] rounded-xl bg-black" playsInline />
    );
  }
  if (treatAsVideo) {
    return (
      <iframe
        src={toEmbedVideoUrl(url)}
        className="w-full aspect-video rounded-xl border-0 bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        title="Question video"
      />
    );
  }
  return (
    <img
      src={url}
      alt="Question illustration"
      className="max-w-full max-h-[min(360px,50vh)] object-contain mx-auto rounded-xl"
      referrerPolicy="no-referrer"
    />
  );
}

const DEFAULT_QUIZ_SETTINGS = {
  shuffleQuestions: false,
  shuffleAnswers: false,
  showCorrectAnswers: true,
  passingScore: 50,
  maxAttempts: 0,
  allowRetry: false,
};

const QUIZ_VIOLATION_LIMIT = 3;
const QUESTION_SKIP_DELAY_SECONDS = 5;
const GRADABLE_QUESTION_TYPES = new Set([
  'multiple-choice',
  'true-false',
  'image',
  'video',
  'reading',
  'open-text',
  'fill-in-the-blank',
]);

type ViolationType = 'tab_switch' | 'window_blur' | 'copy' | 'cut' | 'paste';

type QuizProgressSnapshot = {
  quizId: string;
  userId: string;
  currentQuestionIndex: number;
  answers: Record<string, string>;
  questionOrder: string[];
  startedAt: string;
  expiresAtMs: number | null;
  violationCount: number;
};

type QuizTimerSnapshot = {
  quizId: string;
  userId: string;
  startedAt: string;
  expiresAtMs: number | null;
};

type QuizRuntimeDbState = {
  started_at: string | null;
  expires_at_ms: number | null;
  violation_count: number | null;
  current_question_index: number | null;
  answers?: Record<string, string> | null;
};

const getQuizProgressStorageKey = (userId: string, quizId: string) =>
  `quiz_progress:${userId}:${quizId}`;

const getQuizTimerStorageKey = (userId: string, quizId: string) =>
  `quiz_timer:${userId}:${quizId}`;

function QuizStateScreen({
  title,
  description,
  onBack,
}: {
  title: string;
  description: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        <button
          onClick={onBack}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('student.quizzes.myQuizzes')}
        </button>
      </div>
    </div>
  );
}

export default function QuizTaking() {
  const { t } = useTranslation();
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string>('');
  const [startedAt, setStartedAt] = useState<string>('');
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [questionEnteredAtMs, setQuestionEnteredAtMs] = useState<number>(Date.now());
  const [questionClockNowMs, setQuestionClockNowMs] = useState<number>(Date.now());
  const [runtimeHydrated, setRuntimeHydrated] = useState(false);
  const autoSubmittingRef = useRef(false);
  const lastViolationAtRef = useRef(0);
  const dbPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuiz = useCallback(async () => {
    if (!quizId) {
      setLoadError(t('student.quizTaking.errorIncomplete'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setQuiz(null);
    setQuestions([]);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setViolationCount(0);
    setStartedAt('');
    setExpiresAtMs(null);
    setSessionUserId('');
    setRuntimeHydrated(false);
    autoSubmittingRef.current = false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = String(session?.user?.id || '');
      setSessionUserId(userId);

      const quizData = await fetchStudentAccessibleQuizById(quizId);
      if (!quizData) {
        setLoadError(t('student.quizTaking.errorNotAvailable'));
        return;
      }

      const settings =
        quizData.settings && typeof quizData.settings === 'object'
          ? { ...DEFAULT_QUIZ_SETTINGS, ...quizData.settings }
          : { ...DEFAULT_QUIZ_SETTINGS };
      const passMark = Number(quizData.pass_mark ?? settings.passingScore ?? DEFAULT_QUIZ_SETTINGS.passingScore);
      const maxAttempts = Number(quizData.max_attempts ?? settings.maxAttempts ?? DEFAULT_QUIZ_SETTINGS.maxAttempts);

      const formattedQuiz = {
        id: quizData.id,
        title: String(quizData.title || 'Quiz'),
        description: String(quizData.description || ''),
        courseId: String(quizData.course_id || ''),
        teacherId: quizData.teacher_id ? String(quizData.teacher_id) : undefined,
        lessonId: quizData.lesson_id ? String(quizData.lesson_id) : undefined,
        type: String(quizData.type || 'standard'),
        timeLimit: Number(quizData.time_limit ?? 0),
        totalMarks: Number(quizData.total_marks ?? 0),
        passMark: Number.isFinite(passMark) ? passMark : DEFAULT_QUIZ_SETTINGS.passingScore,
        maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : DEFAULT_QUIZ_SETTINGS.maxAttempts,
        status: String(quizData.status || ''),
        published: typeof quizData.published === 'boolean' ? quizData.published : undefined,
        settings,
        createdAt: String(quizData.created_at || new Date().toISOString()),
        updatedAt: String(quizData.updated_at || quizData.created_at || new Date().toISOString()),
      } as Quiz;

      setQuiz(formattedQuiz);

      const questionsRes = await authFetch(`/api/student/quizzes/${encodeURIComponent(quizId)}/questions`);
      const questionsJson = await questionsRes.json().catch(() => ({}));
      if (!questionsRes.ok) {
        throw new Error(String(questionsJson?.error || 'Failed to load quiz questions'));
      }

      const builtQuestions = (((questionsJson as any)?.questions as any[]) || []).map((q) => ({
        id: q.id,
        quizId: q.quiz_id,
        text: questionBodyFromRow(q as Record<string, unknown>),
        type: q.type,
        options: q.options,
        correctAnswer: q.correct_answer,
        points: q.points,
        mediaUrl: q.media_url,
        mediaType: q.media_type,
        readingPassage: q.reading_passage,
        orderIndex: (q as { order?: number; order_index?: number }).order_index ?? (q as { order?: number }).order,
      } as Question));

      let savedSnapshot: QuizProgressSnapshot | null = null;
      let savedTimerSnapshot: QuizTimerSnapshot | null = null;
      let dbRuntimeSnapshot: QuizRuntimeDbState | null = null;
      if (quizId && userId) {
        try {
          const rawSnapshot = localStorage.getItem(getQuizProgressStorageKey(userId, quizId));
          if (rawSnapshot) {
            const parsed = JSON.parse(rawSnapshot) as QuizProgressSnapshot;
            if (parsed && parsed.quizId === quizId && parsed.userId === userId) {
              savedSnapshot = parsed;
            }
          }
        } catch {
          // Ignore invalid local snapshot and start fresh.
        }
        try {
          const rawTimerSnapshot = localStorage.getItem(getQuizTimerStorageKey(userId, quizId));
          if (rawTimerSnapshot) {
            const parsedTimer = JSON.parse(rawTimerSnapshot) as QuizTimerSnapshot;
            if (parsedTimer && parsedTimer.quizId === quizId && parsedTimer.userId === userId) {
              savedTimerSnapshot = parsedTimer;
            }
          }
        } catch {
          // Ignore invalid timer snapshot and continue.
        }
        try {
          const runtimeRes = await authFetch(`/api/student/quiz-runtime/${encodeURIComponent(quizId)}`);
          const runtimeJson = await runtimeRes.json().catch(() => ({}));
          if (runtimeRes.ok && runtimeJson?.runtime && typeof runtimeJson.runtime === 'object') {
            dbRuntimeSnapshot = runtimeJson.runtime as QuizRuntimeDbState;
          }
        } catch {
          // Best-effort read: local fallback still applies.
        }
      }

      // Check allow retries: if allowRetry is false and student already has a completed attempt, block
      if (settings.allowRetry === false && userId) {
        try {
          const { data: existingAttempts } = await supabase
            .from('quiz_attempts')
            .select('id')
            .eq('quiz_id', quizId)
            .eq('student_id', userId)
            .not('completed_at', 'is', null)
            .limit(1);
          if (existingAttempts && existingAttempts.length > 0) {
            setLoadError(t('student.quizTaking.errorAlreadyCompleted'));
            return;
          }
        } catch {
          // Best-effort — if check fails, allow the student in
        }
      }

      const questionById = new Map(builtQuestions.map((q) => [String(q.id), q] as const));
      let formattedQuestions: Question[] = builtQuestions;

      if (savedSnapshot?.questionOrder?.length) {
        const restored = savedSnapshot.questionOrder
          .map((id) => questionById.get(String(id)))
          .filter(Boolean) as Question[];
        if (restored.length === builtQuestions.length) {
          formattedQuestions = restored;
        }
      } else if (formattedQuiz.settings.shuffleQuestions) {
        formattedQuestions = [...builtQuestions].sort(() => Math.random() - 0.5);
      }

      // Shuffle answer options if enabled (shuffle once at load, not on every render)
      if (formattedQuiz.settings.shuffleAnswers) {
        formattedQuestions = formattedQuestions.map((q) => ({
          ...q,
          options: Array.isArray(q.options) && q.options.length > 1
            ? [...q.options].sort(() => Math.random() - 0.5)
            : q.options,
        }));
      }

      if (formattedQuestions.length === 0) {
        setLoadError(t('student.quizTaking.errorNoQuestions'));
      }

      const now = Date.now();
      const freshStartedAt = new Date().toISOString();
      const freshExpiresAt = formattedQuiz.timeLimit > 0 ? now + formattedQuiz.timeLimit * 60 * 1000 : null;

      // Coerce expires_at_ms: Supabase BIGINT may come back as a string in some configs.
      const dbExpiresAtMs = dbRuntimeSnapshot?.expires_at_ms != null
        ? Number(dbRuntimeSnapshot.expires_at_ms)
        : null;
      const restoredExpiresAt =
        (dbExpiresAtMs !== null && Number.isFinite(dbExpiresAtMs) ? dbExpiresAtMs : null) ??
        (typeof savedSnapshot?.expiresAtMs === 'number' ? savedSnapshot.expiresAtMs : null) ??
        (typeof savedTimerSnapshot?.expiresAtMs === 'number' ? savedTimerSnapshot.expiresAtMs : null);
      const resolvedExpiresAt = restoredExpiresAt && restoredExpiresAt > now ? restoredExpiresAt : freshExpiresAt;

      // Priority: DB answers (only if non-empty) merged with localStorage answers.
      // Bug fix: an empty DB `{}` (the column default) must NOT override localStorage
      // answers that were saved after the student started answering questions.
      const dbAnswersRaw =
        dbRuntimeSnapshot?.answers &&
        typeof dbRuntimeSnapshot.answers === 'object' &&
        !Array.isArray(dbRuntimeSnapshot.answers)
          ? (dbRuntimeSnapshot.answers as Record<string, string>)
          : null;
      const dbAnswers =
        dbAnswersRaw && Object.keys(dbAnswersRaw).length > 0 ? dbAnswersRaw : null;

      const lsAnswers =
        savedSnapshot?.answers &&
        typeof savedSnapshot.answers === 'object' &&
        !Array.isArray(savedSnapshot.answers)
          ? (savedSnapshot.answers as Record<string, string>)
          : {};

      // Merge: start with localStorage, then layer DB on top (DB wins on key conflicts).
      // This ensures neither source silently drops data the other has.
      const restoredAnswers: Record<string, string> = { ...lsAnswers, ...(dbAnswers || {}) };
      const hasRestoredState = Object.keys(restoredAnswers).length > 0 || (restoredExpiresAt !== null && restoredExpiresAt !== freshExpiresAt);

      const restoredIndex = Number.isFinite(Number(dbRuntimeSnapshot?.current_question_index ?? savedSnapshot?.currentQuestionIndex))
        ? Math.max(0, Math.min(formattedQuestions.length - 1, Number(dbRuntimeSnapshot?.current_question_index ?? savedSnapshot?.currentQuestionIndex ?? 0)))
        : 0;
      const restoredViolationCount = Number.isFinite(Number(savedSnapshot?.violationCount))
        ? Math.max(0, Number(savedSnapshot?.violationCount || 0))
        : 0;
      const dbViolationCount = Number.isFinite(Number(dbRuntimeSnapshot?.violation_count))
        ? Math.max(0, Number(dbRuntimeSnapshot?.violation_count || 0))
        : null;
      const resolvedViolationCount = dbViolationCount ?? restoredViolationCount;
      const resolvedStartedAt = dbRuntimeSnapshot?.started_at || savedSnapshot?.startedAt || savedTimerSnapshot?.startedAt || freshStartedAt;
      const dbQuestionIndex = Number.isFinite(Number(dbRuntimeSnapshot?.current_question_index))
        ? Math.max(0, Math.min(formattedQuestions.length - 1, Number(dbRuntimeSnapshot?.current_question_index || 0)))
        : null;
      const resolvedQuestionIndex = dbQuestionIndex ?? restoredIndex;

      if (hasRestoredState) {
        toast.info(t('student.quizTaking.resumedProgress'), { duration: 3000 });
      }

      setStartedAt(resolvedStartedAt);
      setExpiresAtMs(resolvedExpiresAt);
      setTimeLeft(resolvedExpiresAt ? Math.max(0, Math.ceil((resolvedExpiresAt - now) / 1000)) : null);
      setAnswers(restoredAnswers);
      setCurrentQuestionIndex(resolvedQuestionIndex);
      setQuestionEnteredAtMs(Date.now());
      setViolationCount(resolvedViolationCount);
      setQuestions(formattedQuestions);
      setRuntimeHydrated(true);
    } catch (error) {
      console.error('Failed to load quiz:', error);
      setLoadError(t('student.quizTaking.errorFailedLoad'));
      toast.error(t('student.quizTaking.errorFailedLoad'));
    } finally {
      setLoading(false);
    }
  }, [quizId, navigate]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  useEffect(() => {
    if (!quiz) return;
    if (expiresAtMs === null) {
      setTimeLeft(null);
      return;
    }

    const syncRemaining = () => {
      const next = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setTimeLeft(next);
      if (next === 0 && !autoSubmittingRef.current) {
        autoSubmittingRef.current = true;
        void handleSubmit();
      }
    };

    syncRemaining();
    const timer = setInterval(syncRemaining, 1000);
    return () => clearInterval(timer);
  }, [expiresAtMs, quiz]);

  useEffect(() => {
    if (!quiz || !quizId || !sessionUserId) return;
    const snapshot: QuizProgressSnapshot = {
      quizId,
      userId: sessionUserId,
      currentQuestionIndex,
      answers,
      questionOrder: questions.map((q) => String(q.id)),
      startedAt: startedAt || new Date().toISOString(),
      expiresAtMs,
      violationCount,
    };
    try {
      localStorage.setItem(getQuizProgressStorageKey(sessionUserId, quizId), JSON.stringify(snapshot));
    } catch {
      // Ignore storage write issues (private mode/quota).
    }
  }, [
    quiz,
    quizId,
    sessionUserId,
    currentQuestionIndex,
    answers,
    questions,
    startedAt,
    expiresAtMs,
    violationCount,
  ]);

  useEffect(() => {
    if (!quiz || !quizId || !sessionUserId) return;
    const timerSnapshot: QuizTimerSnapshot = {
      quizId,
      userId: sessionUserId,
      startedAt: startedAt || new Date().toISOString(),
      expiresAtMs,
    };
    try {
      localStorage.setItem(getQuizTimerStorageKey(sessionUserId, quizId), JSON.stringify(timerSnapshot));
    } catch {
      // Ignore storage write issues (private mode/quota).
    }
  }, [quiz, quizId, sessionUserId, startedAt, expiresAtMs]);

  useEffect(() => {
    if (!runtimeHydrated || !quiz || !quizId || !sessionUserId) return;
    // Debounce DB writes by 600 ms to avoid racing concurrent PUTs when the
    // student changes answers rapidly. The localStorage effect above fires
    // synchronously, so the student's progress is never lost between ticks.
    if (dbPersistTimerRef.current) clearTimeout(dbPersistTimerRef.current);
    dbPersistTimerRef.current = setTimeout(async () => {
      try {
        await authFetch(`/api/student/quiz-runtime/${encodeURIComponent(quizId)}`, {
          method: 'PUT',
          body: JSON.stringify({
            startedAt: startedAt || new Date().toISOString(),
            expiresAtMs,
            violationCount,
            currentQuestionIndex,
            answers,
          }),
        });
      } catch {
        // Best-effort persistence; local snapshot remains fallback.
      }
    }, 600);
    return () => {
      if (dbPersistTimerRef.current) clearTimeout(dbPersistTimerRef.current);
    };
  }, [runtimeHydrated, quiz, quizId, sessionUserId, startedAt, expiresAtMs, violationCount, currentQuestionIndex, answers]);

  // Force-save to localStorage synchronously just before the page unloads.
  // This covers the gap between a React re-render and the effect actually
  // flushing — without this, a very fast reload can drop the last answer.
  useEffect(() => {
    if (!quizId || !sessionUserId) return;
    const handleBeforeUnload = () => {
      try {
        const snapshot: QuizProgressSnapshot = {
          quizId,
          userId: sessionUserId,
          currentQuestionIndex,
          answers,
          questionOrder: questions.map((q) => String(q.id)),
          startedAt: startedAt || new Date().toISOString(),
          expiresAtMs,
          violationCount,
        };
        localStorage.setItem(getQuizProgressStorageKey(sessionUserId, quizId), JSON.stringify(snapshot));
        localStorage.setItem(
          getQuizTimerStorageKey(sessionUserId, quizId),
          JSON.stringify({ quizId, userId: sessionUserId, startedAt: snapshot.startedAt, expiresAtMs }),
        );
      } catch {
        // Ignore — storage unavailable.
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quizId, sessionUserId, currentQuestionIndex, answers, questions, startedAt, expiresAtMs, violationCount]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setQuestionClockNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setQuestionEnteredAtMs(Date.now());
  }, [currentQuestionIndex, quiz?.id]);

  const reportViolation = useCallback(async (type: ViolationType) => {
    if (!quiz || !quizId || submitting) return;
    const now = Date.now();
    if (now - lastViolationAtRef.current < 900) return;
    lastViolationAtRef.current = now;

    const nextCount = violationCount + 1;
    setViolationCount(nextCount);

    toast.warning(t('student.quizTaking.violationWarning', { count: nextCount, limit: QUIZ_VIOLATION_LIMIT }));

    try {
      await authFetch('/api/student/quiz-violation', {
        method: 'POST',
        body: JSON.stringify({
          quizId,
          type,
          questionIndex: currentQuestionIndex,
          remainingSeconds: timeLeft,
          violationCount: nextCount,
        }),
      });
    } catch {
      // Notification is best-effort; quiz flow should continue.
    }

    if (nextCount >= QUIZ_VIOLATION_LIMIT && !autoSubmittingRef.current) {
      autoSubmittingRef.current = true;
      toast.error(t('student.quizTaking.autoSubmittedViolations'));
      await handleSubmit();
    }
  }, [quiz, quizId, submitting, currentQuestionIndex, timeLeft, violationCount]);

  useEffect(() => {
    if (!quiz || loadError || submitting) return;

    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      void reportViolation('copy');
    };
    const onCut = (event: ClipboardEvent) => {
      event.preventDefault();
      void reportViolation('cut');
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      void reportViolation('paste');
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        void reportViolation('tab_switch');
      }
    };
    const onBlur = () => {
      void reportViolation('window_blur');
    };

    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [quiz, loadError, submitting, reportViolation]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: answer };
      // Save immediately — don't wait for the React effect to flush.
      // This guarantees the answer survives even an instant reload.
      if (quizId && sessionUserId) {
        try {
          const existing = localStorage.getItem(getQuizProgressStorageKey(sessionUserId, quizId));
          const base: Partial<QuizProgressSnapshot> = existing ? JSON.parse(existing) : {};
          localStorage.setItem(
            getQuizProgressStorageKey(sessionUserId, quizId),
            JSON.stringify({
              ...base,
              quizId,
              userId: sessionUserId,
              answers: next,
              currentQuestionIndex,
              expiresAtMs,
            }),
          );
        } catch {
          // Private / storage-full — effect-based save is still the safety net.
        }
      }
      return next;
    });
  };

  const normalizeComparableAnswer = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      if (value.length === 1) return normalizeComparableAnswer(value[0]);
      return value.map((item) => normalizeComparableAnswer(item)).join('|');
    }
    if (typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (candidate.id !== undefined) return normalizeComparableAnswer(candidate.id);
      if (candidate.value !== undefined) return normalizeComparableAnswer(candidate.value);
      if (candidate.answer !== undefined) return normalizeComparableAnswer(candidate.answer);
      return JSON.stringify(candidate);
    }

    const raw = String(value).trim();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      if (parsed !== raw) return normalizeComparableAnswer(parsed);
    } catch {
      // Keep raw string when not JSON.
    }
    return raw;
  };

  const isAnswerCorrect = (question: Question, studentAnswerRaw: unknown) => {
    const questionType = String(question.type || '').trim().toLowerCase();
    const normalizedStudentAnswer = normalizeComparableAnswer(studentAnswerRaw);
    const normalizedCorrectAnswer = normalizeComparableAnswer(question.correctAnswer);

    if (questionType === 'open-text' || questionType === 'fill-in-the-blank') {
      const raw = normalizedCorrectAnswer;
      const keywords = raw.toLowerCase().split(',').map((k) => k.trim()).filter(Boolean);
      const studentText = normalizedStudentAnswer.toLowerCase();
      return keywords.some((k) => studentText.includes(k));
    }

    if (Array.isArray(question.options) && question.options.length > 0) {
      const selectedOption = question.options.find(
        (opt) => normalizeComparableAnswer(opt.id) === normalizedStudentAnswer
      );
      const selectedText = selectedOption ? normalizeComparableAnswer(selectedOption.text) : normalizedStudentAnswer;

      const correctOption = question.options.find(
        (opt) => normalizeComparableAnswer(opt.id) === normalizedCorrectAnswer
      );
      const correctText = correctOption ? normalizeComparableAnswer(correctOption.text) : normalizedCorrectAnswer;

      return (
        normalizedStudentAnswer === normalizedCorrectAnswer ||
        selectedText === normalizedCorrectAnswer ||
        normalizedStudentAnswer === correctText ||
        selectedText === correctText
      );
    }

    return normalizedStudentAnswer === normalizedCorrectAnswer;
  };

  const handleSubmit = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!quiz || !session || submitting) return;
    setSubmitting(true);

    try {
      let score = 0;
      let totalPoints = 0;

      questions.forEach(q => {
        const questionType = String(q.type || '').trim().toLowerCase();
        if (!GRADABLE_QUESTION_TYPES.has(questionType)) return;
        const questionPoints = Number.isFinite(Number(q.points)) ? Number(q.points) : 0;
        totalPoints += questionPoints;
        const studentAnswer = answers[q.id];
        if (isAnswerCorrect(q, studentAnswer)) {
          score += questionPoints;
        }
      });

      const passingPercent = Number(quiz.settings?.passingScore ?? 50);
      const passingScore = ((Number.isFinite(passingPercent) ? passingPercent : 50) / 100) * totalPoints;
      const passed = score >= passingScore;

      const startedAtIso = startedAt || new Date().toISOString();
      const attempt = await insertAttemptWithFallback(supabase, {
        quiz_id: quiz.id,
        student_id: session.user.id,
        teacher_id: quiz.teacherId,
        score,
        total_points: totalPoints,
        passed,
        started_at: startedAtIso,
        completed_at: new Date().toISOString(),
        answers,
      });
      
      // Fan out an in-app notification to the student (themselves), the quiz's
      // teacher, and all admins — gated by the admin Settings → Email Notifications
      // → "Quiz Submitted" toggle. Best-effort; never blocks the submit flow.
      try {
        await authFetch('/api/notifications/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'quizSubmitted',
            ctx: {
              studentId: session.user.id,
              teacherId: quiz.teacherId,
              quizId: quiz.id,
              quizTitle: quiz.title,
              attemptId: attempt.id,
              score,
              totalPoints,
              passed,
            },
          }),
        });
      } catch {
        // Notifications are best-effort — don't fail the submission if dispatch fails.
      }

      toast.success(t('student.quizTaking.submittedSuccessToast'));
      if (quizId) {
        try {
          localStorage.removeItem(getQuizProgressStorageKey(session.user.id, quizId));
          localStorage.removeItem(getQuizTimerStorageKey(session.user.id, quizId));
        } catch {
          // ignore storage cleanup issues
        }
        try {
          await authFetch(`/api/student/quiz-runtime/${encodeURIComponent(quizId)}`, {
            method: 'DELETE',
          });
        } catch {
          // Ignore cleanup failures; result page navigation should continue.
        }
      }
      navigate(`/student/results/${attempt.id}`);
    } catch (error) {
      toast.error(t('student.quizTaking.errorSubmissionFailed'));
      setSubmitting(false);
    }
  };

  if (loading) return <QuizPageSkeleton />;
  if (loadError) {
    return (
      <QuizStateScreen
        title={t('student.quizTaking.quizUnavailable')}
        description={loadError}
        onBack={() => navigate('/student/quizzes')}
      />
    );
  }
  if (!quiz) {
    return (
      <QuizStateScreen
        title={t('student.quizTaking.quizUnavailable')}
        description={t('student.quizTaking.errorNotFound')}
        onBack={() => navigate('/student/quizzes')}
      />
    );
  }

  const currentQuestion = questions[currentQuestionIndex] ?? null;
  if (!currentQuestion) {
    return (
      <QuizStateScreen
        title={t('student.quizTaking.quizNotReady')}
        description={t('student.quizTaking.errorNoQuestions')}
        onBack={() => navigate('/student/quizzes')}
      />
    );
  }
  const quizSettingsRaw = quiz.settings as Record<string, unknown> | undefined;
  const introMediaUrl =
    typeof quizSettingsRaw?.introMediaUrl === 'string' ? quizSettingsRaw.introMediaUrl.trim() : '';
  const introMediaType =
    quizSettingsRaw?.introMediaType === 'image' ? 'image' : 'video';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const answerableQuestions = questions.filter((question) => question.type !== 'instruction');
  const answeredCount = answerableQuestions.filter((question) => {
    const rawAnswer = answers[question.id];
    return typeof rawAnswer === 'string' && rawAnswer.trim().length > 0;
  }).length;
  const currentAnswer = answers[currentQuestion.id];
  const currentQuestionNeedsAnswer = currentQuestion.type !== 'instruction';
  const hasCurrentAnswer = typeof currentAnswer === 'string' && currentAnswer.trim().length > 0;
  const elapsedOnCurrentQuestion = Math.max(0, Math.floor((questionClockNowMs - questionEnteredAtMs) / 1000));
  const remainingSkipDelay = Math.max(0, QUESTION_SKIP_DELAY_SECONDS - elapsedOnCurrentQuestion);
  const canSkipUnanswered = remainingSkipDelay === 0;
  const skipProgressPercent = Math.min(100, (elapsedOnCurrentQuestion / QUESTION_SKIP_DELAY_SECONDS) * 100);

  const handleNextQuestion = () => {
    if (currentQuestionNeedsAnswer && !hasCurrentAnswer && !canSkipUnanswered) {
      toast.warning(t('student.quizTaking.waitToSkip', { count: remainingSkipDelay }));
      return;
    }
    setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1));
    setQuestionEnteredAtMs(Date.now());
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
              {currentQuestionIndex + 1}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 truncate max-w-[200px] sm:max-w-md">
                {quiz.title}
              </h1>
              <p className="text-xs text-slate-400">{t('student.quizTaking.questionCount', { current: currentQuestionIndex + 1, total: questions.length })}</p>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold",
            timeLeft !== null && timeLeft < 60 ? "bg-red-50 text-red-600 animate-pulse" : "bg-slate-100 text-slate-600"
          )}>
            <Clock className="w-5 h-5" />
            {timeLeft !== null ? formatTime(timeLeft) : '--:--'}
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-slate-100">
        <div 
          className="h-full bg-slate-900 transition-all duration-300"
          style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 md:p-12"
            >
              <div className="space-y-8">
                {currentQuestionIndex === 0 && introMediaUrl && (
                  <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-5 space-y-3">
                    <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">{t('student.quizTaking.beforeYouStart')}</p>
                    <QuizMediaDisplay url={introMediaUrl} mediaType={introMediaType} />
                    {quiz.description && (
                      <p className="text-sm text-slate-600 leading-relaxed">{quiz.description}</p>
                    )}
                  </div>
                )}

                {/* Media */}
                {currentQuestion.mediaUrl && (
                  <div className="rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 p-3 flex items-center justify-center">
                    <QuizMediaDisplay url={currentQuestion.mediaUrl} mediaType={currentQuestion.mediaType} />
                  </div>
                )}

                {/* Reading Passage */}
                {currentQuestion.readingPassage && (
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-slate-700 leading-relaxed max-h-[300px] overflow-y-auto italic">
                    {currentQuestion.readingPassage}
                  </div>
                )}

                {/* Question text (or display-only passage for `instruction`) */}
                {currentQuestion.type === 'instruction' ? (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-6 md:p-8 text-slate-800 text-base leading-relaxed whitespace-pre-wrap">
                    {currentQuestion.text}
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <h2 className="flex-1 text-2xl font-bold text-slate-900 leading-tight">{currentQuestion.text}</h2>
                    <VoiceButton text={currentQuestion.text} />
                  </div>
                )}

                {/* Options or answer — skipped for display-only instruction blocks */}
                {currentQuestion.type === 'instruction' ? (
                  <p className="text-sm text-slate-500 italic">{t('student.quizTaking.instructionNote')}</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {Array.isArray(currentQuestion.options) && currentQuestion.options.length > 0 ? (
                      currentQuestion.options.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => handleAnswerChange(currentQuestion.id, option.id)}
                          className={cn(
                            "flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all",
                            answers[currentQuestion.id] === option.id
                              ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-200"
                              : "border-slate-100 bg-white hover:border-slate-200 text-slate-600"
                          )}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0",
                            answers[currentQuestion.id] === option.id ? "border-white" : "border-slate-200"
                          )}>
                            {answers[currentQuestion.id] === option.id && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                          </div>
                          <span className="font-semibold">{option.text}</span>
                        </button>
                      ))
                    ) : (
                      <textarea
                        value={answers[currentQuestion.id] || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                        className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-slate-900 focus:bg-white transition-all min-h-[150px] text-lg"
                        placeholder={t('student.quizTaking.typeAnswerPlaceholder')}
                      />
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="bg-white border-t border-slate-200 p-6 sticky bottom-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="flex items-center gap-2 px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all disabled:opacity-0"
          >
            <ChevronLeft className="w-5 h-5" /> {t('common.previous')}
          </button>

          <div className="hidden sm:flex items-center gap-2">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentQuestionIndex(i)}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all",
                  currentQuestionIndex === i ? "bg-slate-900 w-8" : "bg-slate-200 hover:bg-slate-300"
                )}
              />
            ))}
          </div>

          {currentQuestionIndex === questions.length - 1 ? (
            <button
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
            >
              <Send className="w-5 h-5" /> {submitting ? t('student.quizTaking.submitting') : t('student.quizTaking.submitQuiz')}
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            >
              {t('common.next')} <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
        {currentQuestionIndex < questions.length - 1 && currentQuestionNeedsAnswer && !hasCurrentAnswer && (
          <div className="max-w-4xl mx-auto mt-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center justify-between text-xs font-bold text-amber-700">
                <span>{t('student.quizTaking.selectToSkip')}</span>
                <span>{remainingSkipDelay > 0 ? t('student.quizTaking.secondsRemaining', { count: remainingSkipDelay }) : t('student.quizTaking.canSkipNow')}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${skipProgressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </footer>

      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertCircle className="h-7 w-7" />
              </div>
              <h3 className="text-center text-xl font-black text-slate-900">{t('student.quizTaking.submitConfirmTitle')}</h3>
              <p className="mt-3 text-center text-sm leading-6 text-slate-500">
                {t('student.quizTaking.submitConfirmDescription')}
              </p>
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
                {t('student.quizTaking.answeredSummary', { answered: answeredCount, total: answerableQuestions.length })}
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => setShowSubmitConfirm(false)}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {t('student.quizTaking.keepReviewing')}
                </button>
                <button
                  onClick={() => {
                    setShowSubmitConfirm(false);
                    void handleSubmit();
                  }}
                  disabled={submitting}
                  className="flex-1 rounded-2xl bg-green-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
                >
                  {submitting ? t('student.quizTaking.submitting') : t('student.quizTaking.yesSubmit')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
