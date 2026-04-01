import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { Quiz, Question, QuizAttempt } from '../../types';
import { sendNotification } from '../../lib/utils';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  AlertCircle,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function QuizTaking() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchQuiz = useCallback(async () => {
    if (!quizId) return;
    try {
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (quizError || !quizData) {
        toast.error('Quiz not found');
        navigate('/student');
        return;
      }

      const formattedQuiz = {
        id: quizData.id,
        title: quizData.title,
        description: quizData.description,
        courseId: quizData.course_id,
        teacherId: quizData.teacher_id,
        timeLimit: quizData.time_limit,
        published: quizData.published,
        settings: quizData.settings,
        createdAt: quizData.created_at
      } as Quiz;

      setQuiz(formattedQuiz);
      setTimeLeft(formattedQuiz.timeLimit * 60);

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true });

      if (questionsError) throw questionsError;

      let formattedQuestions = questionsData.map(q => ({
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
      } as Question));
      
      if (formattedQuiz.settings.shuffleQuestions) {
        formattedQuestions = formattedQuestions.sort(() => Math.random() - 0.5);
      }
      
      setQuestions(formattedQuestions);
    } catch (error) {
      toast.error('Failed to load quiz');
    } finally {
      setLoading(false);
    }
  }, [quizId, navigate]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) {
      if (timeLeft === 0) handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!quiz || !session || submitting) return;
    setSubmitting(true);

    try {
      let score = 0;
      let totalPoints = 0;

      questions.forEach(q => {
        totalPoints += q.points;
        const studentAnswer = answers[q.id];
        if (q.type === 'multiple-choice' || q.type === 'true-false' || q.type === 'image' || q.type === 'video' || q.type === 'reading') {
          if (studentAnswer === q.correctAnswer) {
            score += q.points;
          }
        } else if (q.type === 'open-text') {
          const keywords = q.correctAnswer.toLowerCase().split(',').map(k => k.trim());
          const studentText = studentAnswer?.toLowerCase() || '';
          if (keywords.some(k => studentText.includes(k))) {
            score += q.points;
          }
        }
      });

      const passingScore = (quiz.settings.passingScore / 100) * totalPoints;
      const passed = score >= passingScore;

      const { data: attempt, error: attemptError } = await supabase
        .from('attempts')
        .insert({
          quiz_id: quiz.id,
          student_id: session.user.id,
          teacher_id: quiz.teacherId,
          score,
          total_points: totalPoints,
          passed,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          answers
        })
        .select()
        .single();

      if (attemptError) throw attemptError;
      
      // Notify teacher
      sendNotification(
        quiz.teacherId,
        'Quiz Attempt Completed',
        `${session.user.user_metadata.display_name || session.user.email} has completed the quiz "${quiz.title}" with a score of ${score}/${totalPoints}.`,
        passed ? 'success' : 'warning'
      );

      toast.success('Quiz submitted successfully');
      navigate(`/student/results/${attempt.id}`);
    } catch (error) {
      toast.error('Failed to submit quiz');
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading quiz...</div>;
  if (!quiz) return null;

  const currentQuestion = questions[currentQuestionIndex];
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
              <p className="text-xs text-slate-400">Question {currentQuestionIndex + 1} of {questions.length}</p>
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
                {/* Media */}
                {currentQuestion.mediaUrl && (
                  <div className="rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 aspect-video flex items-center justify-center">
                    {currentQuestion.mediaType === 'video' ? (
                      <iframe 
                        src={currentQuestion.mediaUrl.replace('watch?v=', 'embed/')} 
                        className="w-full h-full"
                        allowFullScreen
                      />
                    ) : (
                      <img 
                        src={currentQuestion.mediaUrl} 
                        alt="Question media" 
                        className="max-w-full max-h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                )}

                {/* Reading Passage */}
                {currentQuestion.readingPassage && (
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-slate-700 leading-relaxed max-h-[300px] overflow-y-auto italic">
                    {currentQuestion.readingPassage}
                  </div>
                )}

                {/* Question Text */}
                <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                  {currentQuestion.text}
                </h2>

                {/* Options */}
                <div className="grid grid-cols-1 gap-4">
                  {currentQuestion.options ? (
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
                      placeholder="Type your answer here..."
                    />
                  )}
                </div>
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
            <ChevronLeft className="w-5 h-5" /> Previous
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
              onClick={() => {
                if (confirm('Are you sure you want to submit your quiz?')) {
                  handleSubmit();
                }
              }}
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
            >
              <Send className="w-5 h-5" /> {submitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          ) : (
            <button
              onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
              className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            >
              Next <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
