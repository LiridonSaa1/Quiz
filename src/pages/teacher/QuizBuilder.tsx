import React, { useEffect, useState, useCallback } from 'react';
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
  FileText,
  ChevronRight,
  Link2,
  Upload,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Quiz, Question, Course, QuestionType } from '../../types';
import { cn } from '../../lib/utils';
import { apiUrl, authFetch, readApiError } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { updateCompatibleQuiz } from '../../lib/fetchTeacherQuizzes';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPageSkeleton } from '../../components/ui/Skeleton';
import { AIPanel, AITriggerButton } from '../../components/AIPanel';
import { generateQuizQuestions } from '../../lib/gemini';
import { motion } from 'motion/react';
import { isDirectVideoFileUrl, isLikelyVideoLink, toEmbedVideoUrl } from '../../lib/quizMedia';

const QUIZ_MEDIA_BUCKET = 'quiz-media';

type QuizSettingsExtended = NonNullable<Quiz['settings']> & {
  introMediaUrl?: string;
  introMediaType?: 'video' | 'image';
};

const defaultSettings = (): QuizSettingsExtended => ({
  shuffleQuestions: false,
  shuffleAnswers: false,
  allowRetry: true,
  passingScore: 70,
  introMediaUrl: '',
  introMediaType: 'video',
});

function QuizMediaPreview({ url, mediaType }: { url: string; mediaType?: string }) {
  const treatAsVideo = mediaType === 'video' || (mediaType !== 'image' && isLikelyVideoLink(url));
  if (!url?.trim()) {
    return (
      <div className="aspect-video rounded-xl bg-slate-100 border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm">
        Preview will appear here
      </div>
    );
  }
  if (treatAsVideo && isDirectVideoFileUrl(url)) {
    return (
      <video src={url} controls className="w-full max-h-56 rounded-xl bg-black" playsInline />
    );
  }
  if (treatAsVideo) {
    return (
      <iframe
        src={toEmbedVideoUrl(url)}
        className="w-full aspect-video rounded-xl border border-slate-200 bg-black"
        allowFullScreen
        title="Preview"
      />
    );
  }
  return (
    <img
      src={url}
      alt="Preview"
      className="max-h-56 w-full object-contain rounded-xl mx-auto bg-slate-50"
      referrerPolicy="no-referrer"
    />
  );
}

async function uploadQuizAsset(file: File, userId: string, folder: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const path = `${userId}/${folder}/${safe}`;
  const { error } = await supabase.storage.from(QUIZ_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) {
    throw new Error(
      error.message ||
        'Upload failed. In Supabase Dashboard → Storage, create a public bucket named "quiz-media" with read access for students.',
    );
  }
  const { data } = supabase.storage.from(QUIZ_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function mapCourseRows(rows: unknown[] | null | undefined): Course[] {
  if (!rows?.length) return [];
  return rows.map((d: any) => ({
    id: d.id,
    title: d.title,
    name: d.title,
    description: d.description,
    language: d.language,
    teacherId: d.teacher_id,
    studentIds: d.student_ids || [],
    createdAt: d.created_at,
  } as Course));
}

/** DB `questions.type` CHECK — map builder UI types to allowed values */
function toDbQuestionType(t: string | undefined): string {
  const x = (t || 'open-text').toLowerCase();
  const allowed = new Set([
    'multiple-choice', 'true-false', 'open-text', 'fill-in-the-blank', 'matching', 'ordering',
    'image', 'video', 'reading',
  ]);
  if (allowed.has(x)) return x;
  return 'open-text';
}

export default function QuizBuilder() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [introTab, setIntroTab] = useState<'url' | 'upload'>('url');
  const [questionMediaTab, setQuestionMediaTab] = useState<Record<number, 'url' | 'upload'>>({});
  const [uploading, setUploading] = useState<null | 'intro' | number>(null);

  const [quizData, setQuizData] = useState<Partial<Quiz>>({
    title: '',
    description: '',
    courseId: '',
    timeLimit: 30,
    published: false,
    settings: defaultSettings(),
  });

  const [questions, setQuestions] = useState<Partial<Question>[]>([]);

  const setSettings = useCallback((patch: Partial<QuizSettingsExtended>) => {
    setQuizData((prev) => ({
      ...prev,
      settings: { ...defaultSettings(), ...prev.settings, ...patch },
    }));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        let courseRows: unknown[] | null = null;
        const backendRes = await fetch(
          apiUrl(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`)
        );
        if (backendRes.ok) {
          const backendJson = await backendRes.json();
          if (backendJson?.success && Array.isArray(backendJson.courses)) {
            courseRows = backendJson.courses;
          }
        }
        if (courseRows === null) {
          const scopedIds = await resolveTeacherIdCandidates(session.user.id);
          const { data: coursesData } = await supabase
            .from('courses')
            .select('*')
            .in('teacher_id', scopedIds);
          courseRows = coursesData ?? [];
        }
        setCourses(mapCourseRows(courseRows));

        if (quizId) {
          const { data: quiz, error: quizError } = await supabase
            .from('quizzes')
            .select('*')
            .eq('id', quizId)
            .single();

          if (quizError) throw quizError;

          const row = quiz as Record<string, unknown>;
          const published =
            typeof row.published === 'boolean'
              ? row.published
              : row.status === 'published' || row.status === 'active';

          setQuizData({
            id: quiz.id,
            courseId: quiz.course_id,
            teacherId: quiz.teacher_id,
            title: quiz.title,
            description: quiz.description,
            timeLimit: quiz.time_limit,
            settings: { ...defaultSettings(), ...(quiz.settings || {}) },
            published,
            createdAt: quiz.created_at
          } as Quiz);

          const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .eq('quiz_id', quizId)
            .order('order', { ascending: true })
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
            explanation: q.explanation,
            orderIndex: (q as { order?: number; order_index?: number }).order_index ?? (q as { order?: number }).order,
          } as Question)));
        }
      } catch {
        toast.error('Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [quizId]);

  const handleAIGenerateQuestions = async (input: string) => {
    const generated = await generateQuizQuestions(input, 5);
    const mapped: Partial<Question>[] = generated.map(q => ({
      type: q.type as QuestionType,
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      points: q.points,
    }));
    setQuestions(prev => [...prev, ...mapped]);
    toast.success(`Added ${mapped.length} AI-generated questions!`);
  };

  const addQuestion = (type: QuestionType) => {
    const newQuestion: Partial<Question> = {
      type,
      text: '',
      points: 1,
      mediaType: type === 'video' ? 'video' : type === 'image' ? 'image' : undefined,
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
    setQuestionMediaTab({});
  };

  const updateQuestion = (index: number, data: Partial<Question>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...data };
    setQuestions(newQuestions);
  };

  const handleIntroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const introType = (quizData.settings as QuizSettingsExtended)?.introMediaType || 'video';
    if (introType === 'video' && !file.type.startsWith('video/')) {
      toast.error('Choose a video file for intro, or switch intro type to Image.');
      return;
    }
    if (introType === 'image' && !file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    setUploading('intro');
    try {
      const folder = quizId ? `quiz-${quizId}-intro` : `draft-intro`;
      const url = await uploadQuizAsset(file, session.user.id, folder);
      setSettings({ introMediaUrl: url });
      toast.success('Intro media uploaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleQuestionUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const q = questions[index];
    const expectVideo = q.type === 'video';
    if (expectVideo && !file.type.startsWith('video/')) {
      toast.error('Upload a video file, or paste a link instead.');
      return;
    }
    if (q.type === 'image' && !file.type.startsWith('image/')) {
      toast.error('Upload an image file, or paste an image URL.');
      return;
    }
    setUploading(index);
    try {
      const folder = quizId ? `quiz-${quizId}-q` : `draft-q`;
      const url = await uploadQuizAsset(file, session.user.id, `${folder}-${index}`);
      updateQuestion(index, {
        mediaUrl: url,
        mediaType: expectVideo ? 'video' : 'image',
      });
      toast.success('Media uploaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
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
      const settings = { ...defaultSettings(), ...quizData.settings } as QuizSettingsExtended;
      const basePayload: Record<string, unknown> = {
        title: quizData.title,
        description: quizData.description,
        course_id: quizData.courseId,
        time_limit: quizData.timeLimit,
        published: quizData.published,
        settings,
      };

      if (quizId) {
        const { error } = await updateCompatibleQuiz(supabase, quizId, basePayload);
        if (error) throw error;
      } else {
        const createRes = await authFetch('/api/teacher/quizzes', {
          method: 'POST',
          body: JSON.stringify({
            title: quizData.title,
            description: quizData.description,
            course_id: quizData.courseId,
            time_limit: quizData.timeLimit,
            published: quizData.published,
            settings,
          }),
        });
        if (!createRes.ok) throw new Error(await readApiError(createRes));
        const created = await createRes.json();
        const newId = created?.quiz?.id as string | undefined;
        if (!newId) throw new Error('Quiz save returned no id');
        currentQuizId = newId;
      }

      if (quizId) {
        await supabase.from('questions').delete().eq('quiz_id', quizId);
      }

      const questionsPayload = questions.map((q, idx) => ({
        quiz_id: currentQuizId,
        type: toDbQuestionType(q.type),
        text: (q.text || ' ').trim() || ' ',
        media_url: q.mediaUrl,
        media_type: q.mediaType,
        reading_passage: q.readingPassage,
        options: q.options,
        correct_answer: q.correctAnswer,
        points: q.points ?? 1,
        explanation: q.explanation,
        order: idx,
      }));

      if (questionsPayload.length > 0) {
        const { error: qError } = await supabase.from('questions').insert(questionsPayload);
        if (qError) throw qError;
      }

      toast.success('Quiz saved successfully');
      navigate('/teacher/quizzes');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to save quiz';
      toast.error(msg);
    }
  };

  const settings = (quizData.settings || defaultSettings()) as QuizSettingsExtended;

  if (loading) {
    return (
      <TeacherLayout>
        <FormPageSkeleton />
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />

          <div
            className="relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)',
            }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />

            <div className="relative px-6 sm:px-8 lg:px-10 py-8 sm:py-10">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="flex items-start gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate('/teacher/quizzes')}
                    className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all shrink-0"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <nav className="flex items-center gap-1.5 text-[11px] font-semibold mb-2 flex-wrap" aria-label="Breadcrumb">
                      <span className="text-indigo-300 uppercase tracking-wider">Teacher Portal</span>
                      <ChevronRight className="w-3 h-3 text-indigo-500/50" />
                      <button                        type="button"
                        onClick={() => navigate('/teacher/quizzes')}
                        className="text-indigo-200 uppercase tracking-wider hover:text-white transition-colors"
                      >
                        Quizzes
                      </button>
                      <ChevronRight className="w-3 h-3 text-indigo-500/50" />
                      <span className="text-white/90 uppercase tracking-wider">{quizId ? 'Edit' : 'New'}</span>
                    </nav>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                      {quizId ? 'Edit quiz' : 'Create quiz'}
                    </h1>
                    <p className="text-indigo-200 text-sm mt-2 max-w-xl">
                      Add instructions, optional intro video, and questions — including links or uploads for rich media.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <AITriggerButton onClick={() => setAiOpen(true)} label="AI Questions" />
                  <motion.button
                    type="button"
                    onClick={() => void handleSave()}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shadow-lg"
                    style={{
                      background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
                      boxShadow: '0 8px 32px rgba(139,92,246,0.4)',
                    }}
                  >
                    <Save className="w-4 h-4" />
                    Save quiz
                  </motion.button>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-10 py-8 bg-slate-50">
            <AIPanel
              open={aiOpen}
              onClose={() => setAiOpen(false)}
              label="AI Question Generator"
              description="Describe a topic — AI will generate 5 quiz questions"
              placeholder='e.g. "French Revolution — causes, timeline, and outcomes — mix MCQ and true/false"'
              buttonLabel="Generate Questions"
              onSubmit={handleAIGenerateQuestions}
            />

            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Sidebar */}
              <div className="lg:col-span-1 space-y-6">
                <div className="rounded-2xl border border-white/60 shadow-sm p-6 space-y-5 bg-white/90 backdrop-blur-md">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-violet-500" />
                    Quiz details
                  </h2>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title</label>
                    <input
                      type="text"
                      value={quizData.title}
                      onChange={(e) => setQuizData({ ...quizData, title: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="e.g. Unit 3 checkpoint"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                    <textarea
                      value={quizData.description || ''}
                      onChange={(e) => setQuizData({ ...quizData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                      placeholder="Shown to students with the intro media (optional)."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Course</label>
                    <select
                      value={quizData.courseId}
                      onChange={(e) => setQuizData({ ...quizData, courseId: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    >
                      <option value="">Select course</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Minutes
                      </label>
                      <input
                        type="number"
                        value={quizData.timeLimit}
                        onChange={(e) => setQuizData({ ...quizData, timeLimit: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Pass %
                      </label>
                      <input
                        type="number"
                        value={settings.passingScore}
                        onChange={(e) => setSettings({ passingScore: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 cursor-pointer rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                    <span className="text-sm font-medium text-slate-700">Publish quiz</span>
                    <input
                      type="checkbox"
                      checked={!!quizData.published}
                      onChange={(e) => setQuizData({ ...quizData, published: e.target.checked })}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
                        quizData.published ? 'bg-violet-600' : 'bg-slate-300'
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
                          quizData.published ? 'translate-x-5' : 'translate-x-0'
                        )}
                      />
                    </span>
                  </label>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Intro media (optional)
                    </p>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Shown on the first screen before question 1. Use a YouTube / Vimeo link or upload a file (requires Storage bucket <span className="font-mono text-slate-600">{QUIZ_MEDIA_BUCKET}</span>).
                    </p>
                    <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50">
                      {(['video', 'image'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSettings({ introMediaType: t })}
                          className={cn(
                            'flex-1 py-2 text-xs font-semibold rounded-lg transition-all',
                            settings.introMediaType === t
                              ? 'bg-white text-violet-700 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          )}
                        >
                          {t === 'video' ? 'Video' : 'Image'}
                        </button>
                      ))}
                    </div>
                    <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setIntroTab('url')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all',
                          introTab === 'url' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'
                        )}
                      >
                        <Link2 className="w-3.5 h-3.5" /> Link
                      </button>
                      <button
                        type="button"
                        onClick={() => setIntroTab('upload')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all',
                          introTab === 'upload' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'
                        )}
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload
                      </button>
                    </div>
                    {introTab === 'url' ? (
                      <input
                        type="url"
                        value={settings.introMediaUrl || ''}
                        onChange={(e) => setSettings({ introMediaUrl: e.target.value })}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                        placeholder={settings.introMediaType === 'video' ? 'https://youtube.com/watch?v=… or .mp4 URL' : 'https://…/image.jpg'}
                      />
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-violet-200 rounded-xl bg-violet-50/30 cursor-pointer hover:bg-violet-50/50 transition-colors">
                        <input
                          type="file"
                          accept={settings.introMediaType === 'video' ? 'video/*' : 'image/*'}
                          className="hidden"
                          onChange={(e) => void handleIntroUpload(e)}
                        />
                        {uploading === 'intro' ? (
                          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                        ) : (
                          <Upload className="w-8 h-8 text-violet-400" />
                        )}
                        <span className="text-xs font-semibold text-violet-700">
                          {settings.introMediaType === 'video' ? 'Drop or click to upload video' : 'Drop or click to upload image'}
                        </span>
                      </label>
                    )}
                    {(settings.introMediaUrl || '').trim() && (
                      <div className="pt-2">
                        <QuizMediaPreview url={settings.introMediaUrl || ''} mediaType={settings.introMediaType} />
                        <button
                          type="button"
                          onClick={() => setSettings({ introMediaUrl: '' })}
                          className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700"
                        >
                          Remove intro media
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {[
                      { key: 'shuffleQuestions' as const, label: 'Shuffle questions' },
                      { key: 'shuffleAnswers' as const, label: 'Shuffle answers' },
                      { key: 'allowRetry' as const, label: 'Allow retries' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!settings[key]}
                          onChange={(e) => setSettings({ [key]: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span className="text-sm text-slate-600">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-2xl p-5 text-white space-y-4"
                  style={{
                    background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 55%, #6d28d9 100%)',
                  }}
                >
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add questions
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { type: 'multiple-choice' as const, label: 'MCQ', icon: CheckSquare },
                      { type: 'true-false' as const, label: 'T / F', icon: Circle },
                      { type: 'open-text' as const, label: 'Open', icon: Type },
                      { type: 'image' as const, label: 'Image', icon: ImageIcon },
                      { type: 'video' as const, label: 'Video', icon: Video },
                      { type: 'reading' as const, label: 'Reading', icon: BookOpen },
                    ].map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => addQuestion(item.type)}
                        className="flex flex-col items-center gap-1.5 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wide border border-white/10"
                      >
                        <item.icon className="w-5 h-5" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Questions */}
              <div className="lg:col-span-2 space-y-5">
                {questions.length > 0 ? (
                  questions.map((q, index) => {
                    const tab = questionMediaTab[index] || 'url';
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                      >
                        <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-100 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                              {index + 1}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest truncate">
                              {String(q.type || '').replace(/-/g, ' ')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeQuestion(index)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="p-6 space-y-5">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Question</label>
                            <textarea
                              value={q.text}
                              onChange={(e) => updateQuestion(index, { text: e.target.value })}
                              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                              rows={2}
                              placeholder="Ask your question…"
                            />
                          </div>

                          {(q.type === 'image' || q.type === 'video') && (
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-4 space-y-3">
                              <p className="text-xs font-bold text-indigo-800 uppercase tracking-wider">
                                {q.type === 'video' ? 'Video' : 'Image'} for this question
                              </p>
                              <div className="flex rounded-xl border border-slate-200 p-0.5 bg-white">
                                <button
                                  type="button"
                                  onClick={() => setQuestionMediaTab((prev) => ({ ...prev, [index]: 'url' }))}
                                  className={cn(
                                    'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all',
                                    tab === 'url' ? 'bg-violet-100 text-violet-800' : 'text-slate-500'
                                  )}
                                >
                                  <Link2 className="w-3.5 h-3.5" /> Paste link
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuestionMediaTab((prev) => ({ ...prev, [index]: 'upload' }))}
                                  className={cn(
                                    'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all',
                                    tab === 'upload' ? 'bg-violet-100 text-violet-800' : 'text-slate-500'
                                  )}
                                >
                                  <Upload className="w-3.5 h-3.5" /> Upload file
                                </button>
                              </div>
                              {tab === 'url' ? (
                                <>
                                  <input
                                    type="url"
                                    value={q.mediaUrl || ''}
                                    onChange={(e) => {
                                      const url = e.target.value;
                                      const next: Partial<Question> = {
                                        mediaUrl: url,
                                        mediaType: q.type === 'video' ? 'video' : 'image',
                                      };
                                      updateQuestion(index, next);
                                    }}
                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    placeholder={
                                      q.type === 'video'
                                        ? 'YouTube, Vimeo, or direct .mp4 / .webm link'
                                        : 'https://…/photo.jpg'
                                    }
                                  />
                                  <p className="text-[11px] text-slate-500">
                                    Links are free; uploads use your Supabase Storage quota.
                                  </p>
                                </>
                              ) : (
                                <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-violet-200 rounded-xl bg-white cursor-pointer hover:bg-violet-50/30 transition-colors">
                                  <input
                                    type="file"
                                    accept={q.type === 'video' ? 'video/*' : 'image/*'}
                                    className="hidden"
                                    onChange={(e) => void handleQuestionUpload(index, e)}
                                  />
                                  {uploading === index ? (
                                    <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                                  ) : (
                                    <Upload className="w-8 h-8 text-violet-400" />
                                  )}
                                  <span className="text-xs font-semibold text-violet-700">
                                    {q.type === 'video' ? 'Upload video file' : 'Upload image file'}
                                  </span>
                                </label>
                              )}
                              {(q.mediaUrl || '').trim() && (
                                <QuizMediaPreview url={q.mediaUrl || ''} mediaType={q.mediaType} />
                              )}
                            </div>
                          )}

                          {q.type === 'reading' && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reading passage</label>
                              <textarea
                                value={q.readingPassage}
                                onChange={(e) => updateQuestion(index, { readingPassage: e.target.value })}
                                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                                rows={6}
                                placeholder="Paste the passage students should read before answering…"
                              />
                            </div>
                          )}

                          {(q.type === 'multiple-choice' || q.type === 'true-false' || q.type === 'image' || q.type === 'video' || q.type === 'reading') && (
                            <div className="space-y-3">
                              <label className="block text-xs font-semibold text-slate-600">Answer options</label>
                              <div className="space-y-2">
                                {q.options?.map((opt, optIndex) => (
                                  <div key={opt.id} className="flex items-center gap-2 group/opt">
                                    <button
                                      type="button"
                                      onClick={() => updateQuestion(index, { correctAnswer: opt.id })}
                                      className={cn(
                                        'w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
                                        q.correctAnswer === opt.id
                                          ? 'border-emerald-500 bg-emerald-500 text-white'
                                          : 'border-slate-200 hover:border-slate-400'
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
                                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    />
                                    {q.type === 'multiple-choice' && q.options!.length > 2 && (
                                      <button
                                        type="button"
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
                                    type="button"
                                    onClick={() => {
                                      const newOpts = [...q.options!, { id: Math.random().toString(36).slice(2, 11), text: `Option ${q.options!.length + 1}` }];
                                      updateQuestion(index, { options: newOpts });
                                    }}
                                    className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1.5 pl-9 pt-1"
                                  >
                                    <Plus className="w-4 h-4" /> Add option
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {q.type === 'open-text' && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Correct keywords (comma-separated)</label>
                              <input
                                type="text"
                                value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                                onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                                placeholder="e.g. photosynthesis, chlorophyll"
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Points</label>
                              <input
                                type="number"
                                value={q.points}
                                onChange={(e) => updateQuestion(index, { points: parseInt(e.target.value, 10) || 0 })}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Explanation (optional)</label>
                              <input
                                type="text"
                                value={typeof q.explanation === 'string' ? q.explanation : ''}
                                onChange={(e) => updateQuestion(index, { explanation: e.target.value })}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                                placeholder="Shown after submit (if enabled)"
                              />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="py-24 text-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm">
                    <FileText className="w-14 h-14 text-indigo-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-800 mb-1">No questions yet</h3>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto mb-6">
                      Use the panel on the left to add multiple-choice, video, image, and more. Video and image questions support both links and file uploads.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
