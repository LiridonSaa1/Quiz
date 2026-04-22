import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { 
  Trophy, 
  CheckCircle2, 
  XCircle, 
  ChevronLeft, 
  ArrowRight,
  AlertCircle,
  HelpCircle,
  Info
} from 'lucide-react';
import { QuizAttempt, Quiz, Question } from '../../types';
import { cn } from '../../lib/utils';
import { questionBodyFromRow } from '../../lib/questionText';
import { motion } from 'motion/react';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';
import { fetchAttemptRowById, normalizeAttempts } from '../../lib/quizAttempts';
import { fetchStudentAccessibleQuizById } from '../../lib/studentQuizAccess';
import { authFetch } from '../../lib/apiUrl';

const DEFAULT_QUIZ_SETTINGS = {
  shuffleQuestions: false,
  shuffleAnswers: false,
  showCorrectAnswers: true,
  passingScore: 50,
  maxAttempts: 0,
  allowRetry: false,
};

const GRADABLE_QUESTION_TYPES = new Set([
  'multiple-choice',
  'true-false',
  'image',
  'video',
  'reading',
  'open-text',
  'fill-in-the-blank',
]);

export default function QuizResults() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<any>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!attemptId) return;
      try {
        const attemptData = await fetchAttemptRowById(supabase, attemptId);
        if (!attemptData) {
          navigate('/student');
          return;
        }
        const normalizedAttempt = normalizeAttempts([attemptData])[0];

        const formattedAttempt = {
          id: normalizedAttempt.id,
          quizId: normalizedAttempt.quiz_id,
          studentId: normalizedAttempt.student_id,
          teacherId: normalizedAttempt.teacher_id,
          score: normalizedAttempt.score,
          totalPoints: normalizedAttempt.total_points,
          passed: normalizedAttempt.passed,
          startedAt: normalizedAttempt.started_at,
          completedAt: normalizedAttempt.completed_at,
          answers: normalizedAttempt.answers,
          createdAt: normalizedAttempt.created_at
        };
        setAttempt(formattedAttempt);

        const quizData = await fetchStudentAccessibleQuizById(normalizedAttempt.quiz_id);
        const settings =
          quizData?.settings && typeof quizData.settings === 'object'
            ? { ...DEFAULT_QUIZ_SETTINGS, ...quizData.settings }
            : { ...DEFAULT_QUIZ_SETTINGS };
        const passMark = Number(quizData?.pass_mark ?? settings.passingScore ?? DEFAULT_QUIZ_SETTINGS.passingScore);
        const maxAttempts = Number(quizData?.max_attempts ?? settings.maxAttempts ?? DEFAULT_QUIZ_SETTINGS.maxAttempts);

        setQuiz({
          id: quizData?.id || normalizedAttempt.quiz_id,
          title: String(quizData?.title || 'Quiz'),
          description: String(quizData?.description || ''),
          courseId: String(quizData?.course_id || ''),
          teacherId: quizData?.teacher_id ? String(quizData.teacher_id) : undefined,
          lessonId: quizData?.lesson_id ? String(quizData.lesson_id) : undefined,
          type: String(quizData?.type || 'standard'),
          timeLimit: Number(quizData?.time_limit ?? 0),
          totalMarks: Number(quizData?.total_marks ?? normalizedAttempt.total_points ?? 0),
          passMark: Number.isFinite(passMark) ? passMark : DEFAULT_QUIZ_SETTINGS.passingScore,
          maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : DEFAULT_QUIZ_SETTINGS.maxAttempts,
          status: String(quizData?.status || ''),
          published: typeof quizData?.published === 'boolean' ? quizData.published : undefined,
          settings,
          createdAt: String(quizData?.created_at || normalizedAttempt.created_at || new Date().toISOString()),
          updatedAt: String(quizData?.updated_at || quizData?.created_at || normalizedAttempt.created_at || new Date().toISOString()),
        } as Quiz);

        const questionsRes = await authFetch(`/api/student/quizzes/${encodeURIComponent(normalizedAttempt.quiz_id)}/questions`);
        const questionsJson = await questionsRes.json().catch(() => ({}));
        if (!questionsRes.ok) {
          throw new Error(String(questionsJson?.error || 'Failed to load quiz questions'));
        }
        const questionsData = (((questionsJson as any)?.questions as any[]) || []);
        setQuestions(questionsData.map((q) => ({
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
        } as Question)));
      } catch (error) {
        console.error('Error fetching results:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [attemptId, navigate]);

  if (loading) {
    return (
      <StudentLayout>
        <LayoutPageSkeleton cards={3} rows={5} />
      </StudentLayout>
    );
  }
  if (!attempt || !quiz) return null;

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

  const recomputedFromAnswers = questions.reduce((acc, q) => {
    const questionType = String(q.type || '').trim().toLowerCase();
    if (!GRADABLE_QUESTION_TYPES.has(questionType)) return acc;
    const questionPoints = Number.isFinite(Number(q.points)) ? Number(q.points) : 0;
    const studentAnswer = attempt.answers?.[q.id];
    const isCorrect = isAnswerCorrect(q, studentAnswer);
    return acc + (isCorrect ? questionPoints : 0);
  }, 0);
  const recomputedTotalPoints = questions.reduce((acc, q) => {
    const questionType = String(q.type || '').trim().toLowerCase();
    if (!GRADABLE_QUESTION_TYPES.has(questionType)) return acc;
    const questionPoints = Number.isFinite(Number(q.points)) ? Number(q.points) : 0;
    return acc + questionPoints;
  }, 0);
  const effectiveScore = recomputedTotalPoints > 0 ? recomputedFromAnswers : Number(attempt.score ?? 0);
  const effectiveTotalPoints = recomputedTotalPoints > 0 ? recomputedTotalPoints : Number(attempt.totalPoints ?? 0);
  const scorePercentage = effectiveTotalPoints > 0 ? Math.round((effectiveScore / effectiveTotalPoints) * 100) : 0;
  const passingPercent = Number(quiz.settings?.passingScore ?? 50);
  const resolveAnswerText = (question: Question, answerValue: unknown) => {
    if (answerValue === null || answerValue === undefined || String(answerValue).trim() === '') {
      return 'No answer provided';
    }
    const normalized = String(answerValue);
    if (Array.isArray(question.options) && question.options.length > 0) {
      const selected = question.options.find((opt) => String(opt.id) === normalized);
      if (selected) return selected.text;
    }
    return normalized;
  };

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex items-center gap-4">
          <Link to="/student" className="p-2 hover:bg-white rounded-xl transition-all">
            <ChevronLeft className="w-6 h-6 text-slate-400" />
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Quiz Results</h1>
        </div>

        {/* Result Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "p-10 rounded-3xl border-2 flex flex-col md:flex-row items-center gap-10 shadow-2xl shadow-slate-200/50",
            attempt.passed ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
          )}
        >
          <div className={cn(
            "w-32 h-32 rounded-full flex items-center justify-center shrink-0",
            attempt.passed ? "bg-green-500 text-white" : "bg-red-500 text-white"
          )}>
            {attempt.passed ? <Trophy className="w-16 h-16" /> : <XCircle className="w-16 h-16" />}
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-4xl font-black text-slate-900 mb-2">
              {attempt.passed ? 'Congratulations!' : 'Keep Practicing!'}
            </h2>
            <p className="text-slate-600 text-lg">
              You scored <span className="font-bold text-slate-900">{effectiveScore}</span> out of <span className="font-bold text-slate-900">{effectiveTotalPoints}</span> points.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 justify-center md:justify-start">
              <div className="bg-white/50 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/50">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Score</div>
                <div className="text-2xl font-black text-slate-900">{scorePercentage}%</div>
              </div>
              <div className="bg-white/50 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/50">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status</div>
                <div className={cn("text-2xl font-black", attempt.passed ? "text-green-600" : "text-red-600")}>
                  {attempt.passed ? 'PASSED' : 'FAILED'}
                </div>
              </div>
              <div className="bg-white/50 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/50">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Passing Score</div>
                <div className="text-2xl font-black text-slate-900">{Number.isFinite(passingPercent) ? passingPercent : 50}%</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Review Section */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-slate-400" />
            Review Your Answers
          </h2>
          {questions.length === 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
              We could not load question review details for this attempt yet.
            </div>
          )}
          <div className="space-y-6">
            {questions.map((q, index) => {
              const studentAnswer = attempt.answers[q.id];
              const normalizedStudentAnswer = normalizeComparableAnswer(studentAnswer);
              const normalizedCorrectAnswer = normalizeComparableAnswer(q.correctAnswer);
              const questionType = String(q.type || '').trim().toLowerCase();
              const isInstruction = questionType === 'instruction';
              const isCorrect = isInstruction ? true : isAnswerCorrect(q, studentAnswer);
              const studentAnswerText = resolveAnswerText(q, studentAnswer);
              const correctAnswerText = resolveAnswerText(q, q.correctAnswer);

              return (
                <div key={q.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <span className={cn(
                        "text-xs font-bold px-3 py-1 rounded-full",
                        isInstruction
                          ? "bg-slate-100 text-slate-600"
                          : isCorrect ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                        {isInstruction ? 'Text' : isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {isInstruction ? '—' : `${q.points} Points`}
                    </span>
                  </div>
                  <div className="p-8 space-y-6">
                    <h3 className={cn(
                      "leading-tight",
                      isInstruction ? "text-slate-800 font-normal text-base whitespace-pre-wrap" : "text-xl font-bold text-slate-900"
                    )}>{q.text}</h3>
                    
                    <div className="space-y-3">
                      {isInstruction ? (
                        <p className="text-sm text-slate-500">Display-only content (not scored).</p>
                      ) : Array.isArray(q.options) && q.options.length > 0 ? (
                        q.options.map((opt) => (
                          <div 
                            key={opt.id}
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-xl border-2 transition-all",
                              normalizeComparableAnswer(opt.id) === normalizedCorrectAnswer
                                ? "border-green-500 bg-green-50" 
                                : normalizeComparableAnswer(opt.id) === normalizedStudentAnswer && !isCorrect
                                ? "border-red-500 bg-red-50"
                                : "border-slate-50 bg-slate-50/50"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                              normalizeComparableAnswer(opt.id) === normalizedCorrectAnswer ? "border-green-500 bg-green-500" : "border-slate-200"
                            )}>
                              {normalizeComparableAnswer(opt.id) === normalizedCorrectAnswer && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <span className={cn(
                              "font-semibold",
                              normalizeComparableAnswer(opt.id) === normalizedCorrectAnswer ? "text-green-700" : "text-slate-600"
                            )}>
                              {opt.text}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="space-y-4">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Your Answer</div>
                            <div className="text-slate-900 font-semibold">{studentAnswer || 'No answer provided'}</div>
                          </div>
                          <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                            <div className="text-xs font-bold text-green-400 uppercase tracking-widest mb-2">
                              {q.type === 'fill-in-the-blank' ? 'Acceptable answers' : 'Correct Keywords'}
                            </div>
                            <div className="text-green-700 font-semibold">{String(q.correctAnswer ?? '')}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {!isInstruction && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={cn(
                          "p-4 rounded-xl border",
                          isCorrect ? "bg-slate-50 border-slate-100" : "bg-red-50 border-red-100"
                        )}>
                          <div className={cn(
                            "text-xs font-bold uppercase tracking-widest mb-2",
                            isCorrect ? "text-slate-400" : "text-red-500"
                          )}>
                            Your Answer
                          </div>
                          <div className={cn("font-semibold", isCorrect ? "text-slate-800" : "text-red-700")}>
                            {studentAnswerText}
                          </div>
                        </div>
                        <div className="p-4 rounded-xl border border-green-100 bg-green-50">
                          <div className="text-xs font-bold text-green-500 uppercase tracking-widest mb-2">Correct Answer</div>
                          <div className="text-green-700 font-semibold">{correctAnswerText}</div>
                        </div>
                      </div>
                    )}

                    {q.explanation && (
                      <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-700 leading-relaxed italic">
                          <span className="font-bold block mb-1">Explanation:</span>
                          {q.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center pt-10">
          <Link
            to="/student"
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            Back to Dashboard <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </StudentLayout>
  );
}
