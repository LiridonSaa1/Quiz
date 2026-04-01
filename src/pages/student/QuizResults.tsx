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
import { motion } from 'motion/react';

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
        const { data: attemptData, error: attemptError } = await supabase
          .from('attempts')
          .select('*')
          .eq('id', attemptId)
          .single();

        if (attemptError || !attemptData) {
          navigate('/student');
          return;
        }

        const formattedAttempt = {
          id: attemptData.id,
          quizId: attemptData.quiz_id,
          studentId: attemptData.student_id,
          teacherId: attemptData.teacher_id,
          score: attemptData.score,
          totalPoints: attemptData.total_points,
          passed: attemptData.passed,
          startedAt: attemptData.started_at,
          completedAt: attemptData.completed_at,
          answers: attemptData.answers,
          createdAt: attemptData.created_at
        };
        setAttempt(formattedAttempt);

        const { data: quizData, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', attemptData.quiz_id)
          .single();

        if (quizError || !quizData) throw quizError;

        setQuiz({
          id: quizData.id,
          title: quizData.title,
          description: quizData.description,
          courseId: quizData.course_id,
          teacherId: quizData.teacher_id,
          timeLimit: quizData.time_limit,
          published: quizData.published,
          settings: quizData.settings,
          createdAt: quizData.created_at
        } as Quiz);

        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', attemptData.quiz_id)
          .order('order_index', { ascending: true });

        if (questionsError) throw questionsError;

        setQuestions(questionsData.map(q => ({
          id: q.id,
          quizId: q.quiz_id,
          text: q.text,
          type: q.type,
          options: q.options,
          correctAnswer: q.correct_answer,
          points: q.points,
          mediaUrl: q.media_url,
          mediaType: q.media_type,
          readingPassage: q.reading_passage,
          orderIndex: q.order_index
        } as Question)));
      } catch (error) {
        console.error('Error fetching results:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [attemptId, navigate]);

  if (loading) return <div className="p-10 text-center">Loading results...</div>;
  if (!attempt || !quiz) return null;

  const scorePercentage = Math.round((attempt.score / attempt.totalPoints) * 100);

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
              You scored <span className="font-bold text-slate-900">{attempt.score}</span> out of <span className="font-bold text-slate-900">{attempt.totalPoints}</span> points.
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
                <div className="text-2xl font-black text-slate-900">{quiz.settings.passingScore}%</div>
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
          <div className="space-y-6">
            {questions.map((q, index) => {
              const studentAnswer = attempt.answers[q.id];
              const isCorrect = q.type === 'open-text' 
                ? q.correctAnswer.toLowerCase().split(',').some(k => studentAnswer?.toLowerCase().includes(k.trim()))
                : studentAnswer === q.correctAnswer;

              return (
                <div key={q.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <span className={cn(
                        "text-xs font-bold px-3 py-1 rounded-full",
                        isCorrect ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                        {isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {q.points} Points
                    </span>
                  </div>
                  <div className="p-8 space-y-6">
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">{q.text}</h3>
                    
                    <div className="space-y-3">
                      {q.options ? (
                        q.options.map((opt) => (
                          <div 
                            key={opt.id}
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-xl border-2 transition-all",
                              opt.id === q.correctAnswer 
                                ? "border-green-500 bg-green-50" 
                                : opt.id === studentAnswer && !isCorrect
                                ? "border-red-500 bg-red-50"
                                : "border-slate-50 bg-slate-50/50"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                              opt.id === q.correctAnswer ? "border-green-500 bg-green-500" : "border-slate-200"
                            )}>
                              {opt.id === q.correctAnswer && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <span className={cn(
                              "font-semibold",
                              opt.id === q.correctAnswer ? "text-green-700" : "text-slate-600"
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
                            <div className="text-xs font-bold text-green-400 uppercase tracking-widest mb-2">Correct Keywords</div>
                            <div className="text-green-700 font-semibold">{q.correctAnswer}</div>
                          </div>
                        </div>
                      )}
                    </div>

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
