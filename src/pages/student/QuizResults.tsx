import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import {
  Trophy, CheckCircle2, XCircle, ChevronLeft, ArrowRight,
  AlertCircle, HelpCircle, Info, Clock, Target, TrendingUp, BarChart2, Layers, Award,
} from 'lucide-react';
import { QuizAttempt, Quiz, Question } from '../../types';
import { cn } from '../../lib/utils';
import { questionBodyFromRow } from '../../lib/questionText';
import { motion, AnimatePresence } from 'motion/react';
import BlankText from '../../components/BlankText';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';
import { fetchAttemptRowById, normalizeAttempts } from '../../lib/quizAttempts';
import { fetchStudentAccessibleQuizById } from '../../lib/studentQuizAccess';
import { authFetch } from '../../lib/apiUrl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  RadialBarChart, RadialBar, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const DEFAULT_QUIZ_SETTINGS = {
  shuffleQuestions: false,
  shuffleAnswers: false,
  showCorrectAnswers: true,
  passingScore: 50,
  maxAttempts: 0,
  allowRetry: false,
};

const GRADABLE_QUESTION_TYPES = new Set([
  'multiple-choice', 'true-false', 'image', 'video',
  'reading', 'open-text', 'fill-in-the-blank',
]);

function ScoreRing({ pct, passed }: { pct: number; passed: boolean }) {
  const { t } = useTranslation();
  const data = [
    { name: t('common.score'), value: pct, fill: passed ? '#10b981' : '#ef4444' },
    { name: 'Rest', value: 100 - pct, fill: '#f1f5f9' },
  ];
  return (
    <div className="relative w-32 h-32 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={90}
          endAngle={-270}
          barSize={12}
        >
          <RadialBar dataKey="value" cornerRadius={8} background={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-3xl font-black', passed ? 'text-emerald-600' : 'text-red-500')}>{pct}%</span>
        <span className={cn('text-xs font-bold', passed ? 'text-emerald-500' : 'text-red-400')}>
          {passed ? t('student.quizResults.passedStatus') : t('student.quizResults.failedStatus')}
        </span>
      </div>
    </div>
  );
}

function CorrectnessPie({ correct, incorrect, skipped }: { correct: number; incorrect: number; skipped: number }) {
  const { t } = useTranslation();
  const data = [
    { name: t('student.quizResults.correctLabel'), value: correct, color: '#10b981' },
    { name: t('student.quizResults.incorrectLabel'), value: incorrect, color: '#ef4444' },
    ...(skipped > 0 ? [{ name: t('student.quizResults.skippedLabel'), value: skipped, color: '#94a3b8' }] : []),
  ].filter(d => d.value > 0);

  return (
    <div className="w-full h-36">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={60}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(val: any, name: any) => [`${val} questions`, name]}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function PerQuestionBar({ questions, isCorrectFn, answers }: {
  questions: Question[];
  isCorrectFn: (q: Question, ans: unknown) => boolean;
  answers: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const gradable = questions.filter(q => GRADABLE_QUESTION_TYPES.has(String(q.type).toLowerCase()));
  if (gradable.length === 0) return null;

  const data = gradable.map((q, i) => ({
    name: `Q${i + 1}`,
    total: Number(q.points) || 0,
    earned: isCorrectFn(q, answers[q.id]) ? (Number(q.points) || 0) : 0,
  }));

  return (
    <div className="w-full h-40">
      <ResponsiveContainer>
        <BarChart data={data} barSize={14} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11 }}
            formatter={(val: any, name: string) => [val, name === 'total' ? t('common.score') : t('student.quizResults.pointsEarned')]}
          />
          <Bar dataKey="total" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
          <Bar dataKey="earned" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CertData {
  id: string;
  grade: string;
  score: number;
  certificateNumber: string;
  title: string;
  issuedAt: string;
  level: string | null;
  totalPoints: number | null;
  earnedPoints: number | null;
}

export default function QuizResults() {
  const { t } = useTranslation();
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<any>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'review'>('overview');
  const [quizSections, setQuizSections] = useState<any[]>([]);
  const [certData, setCertData] = useState<CertData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!attemptId) return;
      try {
        const attemptData = await fetchAttemptRowById(supabase, attemptId);
        if (!attemptData) { navigate('/student/results'); return; }
        const norm = normalizeAttempts([attemptData])[0];

        setAttempt({
          id: norm.id,
          quizId: norm.quiz_id,
          studentId: norm.student_id,
          teacherId: norm.teacher_id,
          score: norm.score,
          totalPoints: norm.total_points,
          passed: norm.passed,
          startedAt: norm.started_at,
          completedAt: norm.completed_at,
          answers: norm.answers,
          createdAt: norm.created_at,
        });

        const quizData = await fetchStudentAccessibleQuizById(norm.quiz_id);
        const settings = quizData?.settings && typeof quizData.settings === 'object'
          ? { ...DEFAULT_QUIZ_SETTINGS, ...quizData.settings }
          : { ...DEFAULT_QUIZ_SETTINGS };
        const passMark = Number(quizData?.pass_mark ?? settings.passingScore ?? 50);
        const maxAttempts = Number(quizData?.max_attempts ?? settings.maxAttempts ?? 0);

        setQuiz({
          id: quizData?.id || norm.quiz_id,
          title: String(quizData?.title || 'Kuiz'),
          description: String(quizData?.description || ''),
          courseId: String(quizData?.course_id || ''),
          teacherId: quizData?.teacher_id ? String(quizData.teacher_id) : undefined,
          lessonId: quizData?.lesson_id ? String(quizData.lesson_id) : undefined,
          type: String(quizData?.type || 'standard'),
          timeLimit: Number(quizData?.time_limit ?? 0),
          totalMarks: Number(quizData?.total_marks ?? norm.total_points ?? 0),
          passMark: Number.isFinite(passMark) ? passMark : 50,
          maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : 0,
          status: String(quizData?.status || ''),
          published: typeof quizData?.published === 'boolean' ? quizData.published : undefined,
          settings,
          createdAt: String(quizData?.created_at || norm.created_at || new Date().toISOString()),
          updatedAt: String(quizData?.updated_at || quizData?.created_at || norm.created_at || new Date().toISOString()),
        } as Quiz);

        const qRes = await authFetch(`/api/student/quizzes/${encodeURIComponent(norm.quiz_id)}/questions`);
        const qJson = await qRes.json().catch(() => ({}));
        if (qRes.ok) {
          setQuestions(((qJson as any)?.questions || []).map((q: any) => ({
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
            orderIndex: q.order_index ?? q.order,
            sectionId: q.section_id ?? null,
          } as Question & { sectionId: string | null })));
        }

        // Fetch sections (graceful — table may not exist yet)
        try {
          const secRes = await authFetch(`/api/student/quizzes/${encodeURIComponent(norm.quiz_id)}/sections`);
          if (secRes.ok) {
            const secJson = await secRes.json().catch(() => ({}));
            if (Array.isArray(secJson?.sections)) setQuizSections(secJson.sections);
          }
        } catch { /* quiz_sections table may not exist */ }

        // Fetch certificate data for this quiz (if one was auto-issued)
        if (norm.passed) {
          try {
            const certRes = await authFetch(`/api/student/certificate/by-quiz?quizId=${encodeURIComponent(norm.quiz_id)}`);
            if (certRes.ok) {
              const certJson = await certRes.json().catch(() => ({}));
              if (certJson?.cert) setCertData(certJson.cert);
            }
          } catch { /* best-effort */ }
        }
      } catch (err) {
        console.error('Error fetching results:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [attemptId, navigate]);

  if (loading) {
    return <StudentLayout><LayoutPageSkeleton cards={3} rows={5} /></StudentLayout>;
  }
  if (!attempt || !quiz) return null;

  const normalizeAns = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      if (value.length === 1) return normalizeAns(value[0]);
      return value.map(normalizeAns).join('|');
    }
    if (typeof value === 'object') {
      const c = value as Record<string, unknown>;
      if (c.id !== undefined) return normalizeAns(c.id);
      if (c.value !== undefined) return normalizeAns(c.value);
      if (c.answer !== undefined) return normalizeAns(c.answer);
      return JSON.stringify(c);
    }
    const raw = String(value).trim();
    try { const p = JSON.parse(raw); if (p !== raw) return normalizeAns(p); } catch { }
    return raw;
  };

  const isAnswerCorrect = (question: Question, studentAnswerRaw: unknown): boolean => {
    const qType = String(question.type || '').trim().toLowerCase();
    const student = normalizeAns(studentAnswerRaw);
    const correct = normalizeAns(question.correctAnswer);
    if (qType === 'open-text' || qType === 'fill-in-the-blank') {
      const keywords = correct.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
      return keywords.some(k => student.toLowerCase().includes(k));
    }
    if (Array.isArray(question.options) && question.options.length > 0) {
      const selOpt = question.options.find(o => normalizeAns(o.id) === student);
      const selText = selOpt ? normalizeAns(selOpt.text) : student;
      const corrOpt = question.options.find(o => normalizeAns(o.id) === correct);
      const corrText = corrOpt ? normalizeAns(corrOpt.text) : correct;
      return student === correct || selText === correct || student === corrText || selText === corrText;
    }
    return student === correct;
  };

  const resolveText = (question: Question, val: unknown): string => {
    if (val === null || val === undefined || String(val).trim() === '') return t('student.quizResults.noAnswer');
    const norm = String(val);
    if (Array.isArray(question.options)) {
      const found = question.options.find(o => String(o.id) === norm);
      if (found) return found.text;
    }
    return norm;
  };

  const gradable = questions.filter(q => GRADABLE_QUESTION_TYPES.has(String(q.type).toLowerCase()));
  const effectiveScore = gradable.reduce((acc, q) => {
    return acc + (isAnswerCorrect(q, attempt.answers?.[q.id]) ? (Number(q.points) || 0) : 0);
  }, 0);
  const effectiveTotal = gradable.reduce((acc, q) => acc + (Number(q.points) || 0), 0);
  const scorePercent = effectiveTotal > 0 ? Math.round((effectiveScore / effectiveTotal) * 100) : 0;
  const passMark = Number(quiz.settings?.passingScore ?? 50);
  const passed = attempt.passed;

  const correctCount = gradable.filter(q => isAnswerCorrect(q, attempt.answers?.[q.id])).length;
  const incorrectCount = gradable.filter(q => !isAnswerCorrect(q, attempt.answers?.[q.id]) && attempt.answers?.[q.id] !== undefined && attempt.answers?.[q.id] !== null && String(attempt.answers?.[q.id]).trim() !== '').length;
  const skippedCount = gradable.length - correctCount - incorrectCount;

  const duration = attempt.startedAt && attempt.completedAt
    ? Math.round((new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime()) / 60000)
    : null;

  return (
    <StudentLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Link
            to="/student/results"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
          >
            <ChevronLeft className="w-5 h-5 text-slate-500" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-900">{quiz.title}</h1>
            {attempt.completedAt && (
              <p className="text-xs text-slate-400">
                {t('student.quizResults.completedAt', { time: formatDistanceToNow(new Date(attempt.completedAt), { addSuffix: true }) })}
              </p>
            )}
          </div>
        </div>

        {/* Hero result card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'rounded-2xl p-6 border-2',
            passed ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100' : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-100',
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-2">
              <ScoreRing pct={scorePercent} passed={passed} />
              <div className="text-xs text-slate-500 font-medium">
                {t('student.quizResults.pointsDisplay', { score: effectiveScore, total: effectiveTotal })}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              {[
                {
                  icon: passed ? Trophy : XCircle,
                  label: t('student.quizResults.resultLabel'),
                  value: passed ? t('student.quizResults.passedStatus') : t('student.quizResults.failedStatus'),
                  color: passed ? 'text-emerald-700' : 'text-red-600',
                  bg: passed ? 'bg-emerald-100' : 'bg-red-100',
                },
                {
                  icon: Target,
                  label: t('student.quizResults.passMarkLabel'),
                  value: `${passMark}%`,
                  color: 'text-slate-700',
                  bg: 'bg-slate-100',
                },
                {
                  icon: CheckCircle2,
                  label: t('student.quizResults.correctLabel'),
                  value: `${correctCount} / ${gradable.length}`,
                  color: 'text-emerald-700',
                  bg: 'bg-emerald-100',
                },
                {
                  icon: Clock,
                  label: t('student.quizResults.durationLabel'),
                  value: duration != null ? t('student.quizResults.durationValue', { count: duration }) : '—',
                  color: 'text-slate-700',
                  bg: 'bg-slate-100',
                },
              ].map((s) => (
                <div key={s.label} className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border border-white">
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center mb-2', s.bg)}>
                    <s.icon className={cn('w-4 h-4', s.color)} />
                  </div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{s.label}</div>
                  <div className={cn('text-base font-black mt-0.5', s.color)}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Certificate earned banner */}
        {passed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-200 rounded-2xl overflow-hidden shadow-sm"
          >
            {/* Top strip */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-amber-100">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Award className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-900">🎓 Certificate automatically issued!</p>
                {certData?.certificateNumber && (
                  <p className="text-xs text-amber-600 font-mono mt-0.5">{certData.certificateNumber}</p>
                )}
              </div>
              <Link
                to="/student/certificates"
                className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors whitespace-nowrap"
              >
                View →
              </Link>
            </div>
            {/* Details row */}
            <div className="grid grid-cols-3 divide-x divide-amber-100 px-1 py-2">
              {/* Grade */}
              <div className="flex flex-col items-center py-2 px-3">
                <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Grade</span>
                <span className="text-2xl font-black text-amber-800 leading-tight">
                  {certData?.grade ?? (
                    scorePercent >= 97 ? 'A+' : scorePercent >= 93 ? 'A' : scorePercent >= 90 ? 'A-' :
                    scorePercent >= 87 ? 'B+' : scorePercent >= 83 ? 'B' : scorePercent >= 80 ? 'B-' :
                    scorePercent >= 77 ? 'C+' : scorePercent >= 73 ? 'C' : scorePercent >= 70 ? 'C-' : 'D'
                  )}
                </span>
              </div>
              {/* Level */}
              <div className="flex flex-col items-center py-2 px-3">
                <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Level</span>
                <span className="text-sm font-bold text-amber-800 text-center leading-snug mt-0.5">
                  {certData?.level ?? (
                    scorePercent >= 97 ? 'Outstanding' : scorePercent >= 90 ? 'Excellent' :
                    scorePercent >= 83 ? 'Very Good' : scorePercent >= 73 ? 'Good' :
                    scorePercent >= 70 ? 'Satisfactory' : 'Pass'
                  )}
                </span>
              </div>
              {/* Points */}
              <div className="flex flex-col items-center py-2 px-3">
                <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Points</span>
                <span className="text-sm font-bold text-amber-800 text-center leading-snug mt-0.5">
                  {certData?.earnedPoints != null && certData?.totalPoints != null
                    ? `${certData.earnedPoints} / ${certData.totalPoints}`
                    : `${effectiveScore} / ${effectiveTotal}`}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Charts row */}
        {gradable.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <BarChart2 className="w-4 h-4 text-indigo-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-700">{t('student.quizResults.correctVsIncorrect')}</h3>
              </div>
              <CorrectnessPie correct={correctCount} incorrect={incorrectCount} skipped={skippedCount} />
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-700">{t('student.quizResults.pointsPerQuestion')}</h3>
              </div>
              <PerQuestionBar
                questions={gradable}
                isCorrectFn={isAnswerCorrect}
                answers={attempt.answers || {}}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {((['overview', ...(quizSections.length > 0 ? ['sections'] : []), 'review']) as Array<'overview' | 'sections' | 'review'>).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-semibold transition-all border',
                activeTab === tab
                  ? 'bg-slate-900 text-white border-transparent'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400',
              )}
            >
              {tab === 'overview'
                ? t('student.quizResults.overviewTab')
                : tab === 'sections'
                  ? <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />Sections</span>
                  : t('student.quizResults.reviewTab')}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4"
            >
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-slate-400" />
                {t('student.quizResults.quizInfo')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: t('student.quizResults.totalQuestions'), value: questions.length },
                  { label: t('student.quizResults.gradableQuestions'), value: gradable.length },
                  { label: t('student.quizResults.totalPoints'), value: effectiveTotal },
                  { label: t('student.quizResults.pointsEarned'), value: effectiveScore },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <div className="text-lg font-black text-slate-900">{s.value}</div>
                    <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              {attempt.completedAt && (
                <p className="text-xs text-slate-400">
                  {t('student.quizResults.completionDate', { date: format(new Date(attempt.completedAt), 'dd MMM yyyy, HH:mm') })}
                </p>
              )}
            </motion.div>
          )}

          {/* Sections breakdown tab */}
          {activeTab === 'sections' && (
            <motion.div
              key="sections"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {quizSections.map((sec) => {
                const secQuestions = (questions as any[]).filter(
                  (q) => q.sectionId === sec.id && GRADABLE_QUESTION_TYPES.has(String(q.type).toLowerCase())
                );
                const secTotal = secQuestions.reduce((a: number, q: Question) => a + (Number(q.points) || 0), 0);
                const secEarned = secQuestions.reduce((a: number, q: Question) =>
                  a + (isAnswerCorrect(q, attempt.answers?.[q.id]) ? (Number(q.points) || 0) : 0), 0);
                const secPct = secTotal > 0 ? Math.round((secEarned / secTotal) * 100) : null;
                const secCorrect = secQuestions.filter((q: Question) => isAnswerCorrect(q, attempt.answers?.[q.id])).length;
                const secIncorrect = secQuestions.length - secCorrect;

                const typeColors: Record<string, string> = {
                  grammar: 'bg-violet-100 text-violet-700',
                  listening: 'bg-amber-100 text-amber-700',
                  reading: 'bg-blue-100 text-blue-700',
                  writing: 'bg-emerald-100 text-emerald-700',
                  vocabulary: 'bg-pink-100 text-pink-700',
                  general: 'bg-slate-100 text-slate-600',
                };
                const colorClass = typeColors[sec.type] || typeColors.general;
                const barColor = secPct === null ? '#94a3b8' : secPct >= 70 ? '#10b981' : secPct >= 40 ? '#f59e0b' : '#ef4444';

                return (
                  <motion.div
                    key={sec.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                  >
                    {/* Section header */}
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900">{sec.title}</h3>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full capitalize', colorClass)}>
                            {sec.type}
                          </span>
                        </div>
                        {sec.instructions && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{sec.instructions}</p>
                        )}
                      </div>
                      {secPct !== null && (
                        <div className="text-right shrink-0">
                          <div className="text-xl font-black" style={{ color: barColor }}>{secPct}%</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{secEarned}/{secTotal} pts</div>
                        </div>
                      )}
                    </div>

                    {/* Progress bar + stats */}
                    <div className="px-5 py-4 space-y-3">
                      {secPct !== null && (
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${secPct}%`, background: barColor }}
                          />
                        </div>
                      )}

                      {secQuestions.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No gradable questions assigned to this section.</p>
                      ) : (
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                            <span className="text-xs font-semibold text-slate-600">{secCorrect} correct</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                            <span className="text-xs font-semibold text-slate-600">{secIncorrect} incorrect</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                            <span className="text-xs font-semibold text-slate-600">{secQuestions.length} questions</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Unsectioned questions summary */}
              {(() => {
                const unsectioned = (questions as any[]).filter(
                  (q) => !q.sectionId && GRADABLE_QUESTION_TYPES.has(String(q.type).toLowerCase())
                );
                if (unsectioned.length === 0) return null;
                const usTotal = unsectioned.reduce((a: number, q: Question) => a + (Number(q.points) || 0), 0);
                const usEarned = unsectioned.reduce((a: number, q: Question) =>
                  a + (isAnswerCorrect(q, attempt.answers?.[q.id]) ? (Number(q.points) || 0) : 0), 0);
                const usPct = usTotal > 0 ? Math.round((usEarned / usTotal) * 100) : null;
                return (
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-600">Other questions</div>
                      <div className="text-xs text-slate-400">{unsectioned.length} questions not assigned to a section</div>
                    </div>
                    {usPct !== null && (
                      <div className="text-right">
                        <div className="text-lg font-black text-slate-700">{usPct}%</div>
                        <div className="text-[10px] text-slate-400">{usEarned}/{usTotal} pts</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* Review tab */}
          {activeTab === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {questions.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
                  {t('student.quizResults.errorNoDetails')}
                </div>
              )}
              {questions.map((q, index) => {
                const studentAns = attempt.answers?.[q.id];
                const normStudent = normalizeAns(studentAns);
                const normCorrect = normalizeAns(q.correctAnswer);
                const qType = String(q.type || '').toLowerCase();
                const isInstruction = qType === 'instruction';
                const isCorrect = isInstruction ? true : isAnswerCorrect(q, studentAns);
                const studentText = resolveText(q, studentAns);
                const correctText = resolveText(q, q.correctAnswer);

                return (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                  >
                    {/* Question header */}
                    <div className={cn(
                      'px-5 py-3 flex items-center justify-between border-b',
                      isInstruction
                        ? 'bg-slate-50 border-slate-100'
                        : isCorrect
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-red-50 border-red-100',
                    )}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                          {index + 1}
                        </span>
                        {!isInstruction && (
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full',
                            isCorrect
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-600',
                          )}>
                            {isCorrect
                              ? <><CheckCircle2 className="w-3 h-3" />{t('student.quizResults.correctLabel')}</>
                              : <><XCircle className="w-3 h-3" />{t('student.quizResults.incorrectLabel')}</>}
                          </span>
                        )}
                      </div>
                      {!isInstruction && (
                        <span className="text-xs font-bold text-slate-400">
                          {t('student.quizResults.pointsDisplayShort', { score: isCorrect ? q.points : 0, total: q.points })}
                        </span>
                      )}
                    </div>

                    {/* Question body */}
                    <div className="p-5 space-y-4">
                      <p className={cn(
                        'leading-snug',
                        isInstruction ? 'text-slate-700 whitespace-pre-wrap text-sm' : 'text-sm font-semibold text-slate-900',
                      )}>
                        <BlankText text={q.text} />
                      </p>

                      {/* Options */}
                      {!isInstruction && Array.isArray(q.options) && q.options.length > 0 && (
                        <div className="space-y-2">
                          {q.options.map(opt => {
                            const optNorm = normalizeAns(opt.id);
                            const isThisCorrect = optNorm === normCorrect;
                            const isSelected = optNorm === normStudent && !isCorrect;
                            return (
                              <div
                                key={opt.id}
                                className={cn(
                                  'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm',
                                  isThisCorrect
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                    : isSelected
                                      ? 'border-red-300 bg-red-50 text-red-700'
                                      : 'border-slate-100 bg-slate-50 text-slate-600',
                                )}
                              >
                                <div className={cn(
                                  'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                                  isThisCorrect ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300',
                                )}>
                                  {isThisCorrect && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <span className="font-medium">{opt.text}</span>
                                {isSelected && (
                                  <span className="ml-auto text-xs font-semibold text-red-500">{t('student.quizResults.yourChoice')}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Open/fill answers */}
                      {!isInstruction && !(Array.isArray(q.options) && q.options.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className={cn(
                            'p-3 rounded-xl border',
                            isCorrect ? 'bg-slate-50 border-slate-100' : 'bg-red-50 border-red-100',
                          )}>
                            <div className={cn('text-[10px] font-bold uppercase tracking-wider mb-1', isCorrect ? 'text-slate-400' : 'text-red-500')}>
                              {t('student.quizResults.yourAnswer')}
                            </div>
                            <div className={cn('text-sm font-semibold', isCorrect ? 'text-slate-800' : 'text-red-700')}>
                              {studentText}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50">
                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-emerald-500">
                              {t('student.quizResults.correctAnswer')}
                            </div>
                            <div className="text-sm font-semibold text-emerald-800">{correctText}</div>
                          </div>
                        </div>
                      )}

                      {/* Explanation */}
                      {!isInstruction && (q as any).explanation && (
                        <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700 leading-relaxed">
                            <span className="font-bold">{t('quizzes.explanation')}: </span>
                            {(q as any).explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom nav */}
        <div className="flex justify-center pt-4 pb-8">
          <Link
            to="/student/results"
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('student.quizResults.backToResults')}
          </Link>
        </div>
      </div>
    </StudentLayout>
  );
}
