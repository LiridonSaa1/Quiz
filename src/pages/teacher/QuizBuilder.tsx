import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { 
  Plus, 
  Trash2, 
  Save, 
  ChevronLeft, 
  Settings, 
  Type, 
  CheckSquare, 
  Circle, 
  Image as ImageIcon, 
  Video, 
  BookOpen,
  X,
  CheckCircle2,
  Clock,
  Shuffle,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { Quiz, Question, Course, QuestionType } from '../../types';
import { cn } from '../../lib/utils';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPageSkeleton } from '../../components/ui/Skeleton';

export default function QuizBuilder() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  
  const [quizData, setQuizData] = useState<Partial<Quiz>>({
    title: '',
    description: '',
    courseId: '',
    timeLimit: 30,
    published: false,
    settings: {
      shuffleQuestions: false,
      shuffleAnswers: false,
      allowRetry: true,
      passingScore: 70
    }
  });

  const [questions, setQuestions] = useState<Partial<Question>[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const { data: coursesData } = await supabase
          .from('courses')
          .select('*')
          .eq('teacher_id', session.user.id);
        
        setCourses(coursesData?.map(d => ({
          id: d.id,
          title: d.title,
          name: d.title,
          description: d.description,
          language: d.language,
          teacherId: d.teacher_id,
          studentIds: d.student_ids || [],
          createdAt: d.created_at
        } as Course)) || []);

        if (quizId) {
          const { data: quiz, error: quizError } = await supabase
            .from('quizzes')
            .select('*')
            .eq('id', quizId)
            .single();
          
          if (quizError) throw quizError;

          setQuizData({
            id: quiz.id,
            courseId: quiz.course_id,
            teacherId: quiz.teacher_id,
            title: quiz.title,
            description: quiz.description,
            timeLimit: quiz.time_limit,
            settings: quiz.settings,
            published: quiz.published,
            createdAt: quiz.created_at
          } as Quiz);

          const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .eq('quiz_id', quizId)
            .order('created_at', { ascending: true });
          
          if (questionsError) throw questionsError;
          setQuestions(questionsData.map(q => ({
            id: q.id,
            quizId: q.quiz_id,
            type: q.type,
            text: q.text,
            mediaUrl: q.media_url,
            mediaType: q.media_type,
            readingPassage: q.reading_passage,
            options: q.options,
            correctAnswer: q.correct_answer,
            points: q.points,
            explanation: q.explanation
          } as Question)));
        }
      } catch (error) {
        toast.error('Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [quizId]);

  const addQuestion = (type: QuestionType) => {
    const newQuestion: Partial<Question> = {
      type,
      text: '',
      points: 1,
      options: type === 'multiple-choice' ? [
        { id: '1', text: 'Option 1' },
        { id: '2', text: 'Option 2' }
      ] : type === 'true-false' ? [
        { id: '1', text: 'True' },
        { id: '2', text: 'False' }
      ] : []
    };
    setQuestions([...questions, newQuestion]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, data: Partial<Question>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...data };
    setQuestions(newQuestions);
  };

  const handleSave = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    if (!quizData.title || !quizData.courseId) {
      toast.error('Please fill in quiz title and select a course');
      return;
    }

    try {
      let currentQuizId = quizId;
      const quizPayload = {
        title: quizData.title,
        description: quizData.description,
        course_id: quizData.courseId,
        time_limit: quizData.timeLimit,
        published: quizData.published,
        settings: quizData.settings,
      };

      if (quizId) {
        const { error } = await supabase
          .from('quizzes')
          .update(quizPayload)
          .eq('id', quizId);
        if (error) throw error;
      } else {
        const { data: newQuiz, error } = await supabase
          .from('quizzes')
          .insert(quizPayload)
          .select()
          .single();
        if (error) throw error;
        currentQuizId = newQuiz.id;
      }

      // Save questions
      // For simplicity, we delete all existing questions and re-insert
      if (quizId) {
        await supabase.from('questions').delete().eq('quiz_id', quizId);
      }

      const questionsPayload = questions.map(q => ({
        quiz_id: currentQuizId,
        type: q.type,
        text: q.text,
        media_url: q.mediaUrl,
        media_type: q.mediaType,
        reading_passage: q.readingPassage,
        options: q.options,
        correct_answer: q.correctAnswer,
        points: q.points,
        explanation: q.explanation
      }));

      if (questionsPayload.length > 0) {
        const { error: qError } = await supabase.from('questions').insert(questionsPayload);
        if (qError) throw qError;
      }

      toast.success('Quiz saved successfully');
      navigate('/teacher/quizzes');
    } catch (error) {
      toast.error('Failed to save quiz');
    }
  };

  if (loading) {
    return (
      <TeacherLayout>
        <FormPageSkeleton />
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/teacher/quizzes')} className="p-2 hover:bg-white rounded-xl transition-all">
              <ChevronLeft className="w-6 h-6 text-slate-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{quizId ? 'Edit Quiz' : 'Create Quiz'}</h1>
              <p className="text-slate-500">Design your quiz and add questions.</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
          >
            <Save className="w-5 h-5" />
            Save Quiz
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Quiz Settings */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-400" />
                Quiz Settings
              </h2>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quiz Title</label>
                <input
                  type="text"
                  value={quizData.title}
                  onChange={(e) => setQuizData({ ...quizData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g. Midterm Exam"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Course</label>
                <select
                  value={quizData.courseId}
                  onChange={(e) => setQuizData({ ...quizData, courseId: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Time (min)
                  </label>
                  <input
                    type="number"
                    value={quizData.timeLimit}
                    onChange={(e) => setQuizData({ ...quizData, timeLimit: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Passing %
                  </label>
                  <input
                    type="number"
                    value={quizData.settings?.passingScore}
                    onChange={(e) => setQuizData({ 
                      ...quizData, 
                      settings: { ...quizData.settings!, passingScore: parseInt(e.target.value) } 
                    })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-50">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={quizData.settings?.shuffleQuestions}
                    onChange={(e) => setQuizData({
                      ...quizData,
                      settings: { ...quizData.settings!, shuffleQuestions: e.target.checked }
                    })}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-all">Shuffle Questions</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={quizData.settings?.shuffleAnswers}
                    onChange={(e) => setQuizData({
                      ...quizData,
                      settings: { ...quizData.settings!, shuffleAnswers: e.target.checked }
                    })}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-all">Shuffle Answers</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={quizData.settings?.allowRetry}
                    onChange={(e) => setQuizData({
                      ...quizData,
                      settings: { ...quizData.settings!, allowRetry: e.target.checked }
                    })}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-all">Allow Retries</span>
                </label>
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl text-white space-y-4">
              <h3 className="font-bold">Add Questions</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'multiple-choice', label: 'Multiple Choice', icon: CheckSquare },
                  { type: 'true-false', label: 'True/False', icon: Circle },
                  { type: 'open-text', label: 'Open Text', icon: Type },
                  { type: 'image', label: 'Image-based', icon: ImageIcon },
                  { type: 'video', label: 'Video-based', icon: Video },
                  { type: 'reading', label: 'Reading', icon: BookOpen },
                ].map((item) => (
                  <button
                    key={item.type}
                    onClick={() => addQuestion(item.type as QuestionType)}
                    className="flex flex-col items-center gap-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider"
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question List */}
          <div className="lg:col-span-2 space-y-6">
            {questions.length > 0 ? (
              questions.map((q, index) => (
                <div key={index} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group animate-in slide-in-from-bottom-4 duration-300">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        {q.type?.replace('-', ' ')}
                      </span>
                    </div>
                    <button
                      onClick={() => removeQuestion(index)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-8 space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Question Text</label>
                      <textarea
                        value={q.text}
                        onChange={(e) => updateQuestion(index, { text: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                        rows={2}
                        placeholder="Type your question here..."
                      />
                    </div>

                    {/* Media URL for Image/Video */}
                    {(q.type === 'image' || q.type === 'video') && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Media URL</label>
                        <input
                          type="text"
                          value={q.mediaUrl}
                          onChange={(e) => updateQuestion(index, { mediaUrl: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                          placeholder="https://example.com/image.jpg"
                        />
                      </div>
                    )}

                    {/* Reading Passage */}
                    {q.type === 'reading' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Reading Passage</label>
                        <textarea
                          value={q.readingPassage}
                          onChange={(e) => updateQuestion(index, { readingPassage: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                          rows={6}
                          placeholder="Paste the reading passage here..."
                        />
                      </div>
                    )}

                    {/* Options for MC/TF */}
                    {(q.type === 'multiple-choice' || q.type === 'true-false' || q.type === 'image' || q.type === 'video' || q.type === 'reading') && (
                      <div className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700">Options</label>
                        <div className="grid grid-cols-1 gap-3">
                          {q.options?.map((opt, optIndex) => (
                            <div key={opt.id} className="flex items-center gap-3 group/opt">
                              <button
                                onClick={() => updateQuestion(index, { correctAnswer: opt.id })}
                                className={cn(
                                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                  q.correctAnswer === opt.id
                                    ? "border-green-500 bg-green-500 text-white"
                                    : "border-slate-200 hover:border-slate-400"
                                )}
                              >
                                {q.correctAnswer === opt.id && <CheckCircle2 className="w-4 h-4" />}
                              </button>
                              <input
                                type="text"
                                value={opt.text}
                                onChange={(e) => {
                                  const newOpts = [...q.options!];
                                  newOpts[optIndex] = { ...opt, text: e.target.value };
                                  updateQuestion(index, { options: newOpts });
                                }}
                                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                              />
                              {q.type === 'multiple-choice' && q.options!.length > 2 && (
                                <button
                                  onClick={() => {
                                    const newOpts = q.options!.filter((_, i) => i !== optIndex);
                                    updateQuestion(index, { options: newOpts });
                                  }}
                                  className="p-2 text-slate-400 hover:text-red-600 opacity-0 group-hover/opt:opacity-100 transition-all"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          {q.type === 'multiple-choice' && (
                            <button
                              onClick={() => {
                                const newOpts = [...q.options!, { id: Math.random().toString(36).substr(2, 9), text: `Option ${q.options!.length + 1}` }];
                                updateQuestion(index, { options: newOpts });
                              }}
                              className="text-sm font-bold text-slate-400 hover:text-slate-900 flex items-center gap-2 px-9 transition-all"
                            >
                              <Plus className="w-4 h-4" /> Add Option
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Open Text Answer */}
                    {q.type === 'open-text' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Correct Answer (Keywords)</label>
                        <input
                          type="text"
                          value={q.correctAnswer}
                          onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                          placeholder="Enter keywords separated by commas..."
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-50">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Points</label>
                        <input
                          type="number"
                          value={q.points}
                          onChange={(e) => updateQuestion(index, { points: parseInt(e.target.value) })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Explanation (Optional)</label>
                        <input
                          type="text"
                          value={q.explanation}
                          onChange={(e) => updateQuestion(index, { explanation: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                          placeholder="Why is this the correct answer?"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-32 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900">No questions added</h3>
                <p className="text-slate-500">Choose a question type from the sidebar to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
