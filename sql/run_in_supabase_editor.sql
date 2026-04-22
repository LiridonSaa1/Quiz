-- =============================================================================
-- QuizMaster — paste this entire file into Supabase → SQL Editor → Run
-- Safe to re-run (idempotent ADD COLUMN / IF NOT EXISTS).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Courses (app expects these on older DBs) ─────────────────────────────────
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS gradient TEXT DEFAULT 'from-indigo-500 to-violet-600';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Other';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS student_ids UUID[] DEFAULT '{}';

-- ── Classes (drifted schemas) ────────────────────────────────────────────────
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS student_ids UUID[] DEFAULT '{}';
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'upcoming';
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 30;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── Questions (core + extras — fixes "could not find text / correct_answer / … in schema cache") ──
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS text TEXT NOT NULL DEFAULT '';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'multiple-choice';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 1;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS reading_passage TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS correct_answer JSONB;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS explanation TEXT;

-- Question types the app uses (includes image/video/reading/instruction)
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check CHECK (type IN (
  'multiple-choice', 'true-false', 'open-text', 'fill-in-the-blank', 'matching', 'ordering',
  'image', 'video', 'reading', 'instruction'
));

-- ── Quizzes (teacher_id, published, settings, etc.) ─────────────────────────
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
UPDATE public.quizzes q SET teacher_id = c.teacher_id FROM public.courses c
  WHERE q.teacher_id IS NULL AND q.course_id IS NOT NULL AND q.course_id = c.id;
CREATE INDEX IF NOT EXISTS idx_quizzes_teacher_id ON public.quizzes(teacher_id);

ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'standard';
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS pass_mark INTEGER;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS max_attempts INTEGER;

-- ── Quiz attempts (schema drift fix for submit/results flows) ─────────────────
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS score NUMERIC(6,2) DEFAULT 0;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS total_points NUMERIC(6,2) DEFAULT 0;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS passed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz_attempts_read_own" ON public.quiz_attempts;
DROP POLICY IF EXISTS "quiz_attempts_insert_own" ON public.quiz_attempts;
DROP POLICY IF EXISTS "quiz_attempts_update_own" ON public.quiz_attempts;
DROP POLICY IF EXISTS "quiz_attempts_read_teacher" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_read_own" ON public.quiz_attempts
  FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "quiz_attempts_insert_own" ON public.quiz_attempts
  FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "quiz_attempts_update_own" ON public.quiz_attempts
  FOR UPDATE USING (auth.uid() = student_id);
CREATE POLICY "quiz_attempts_read_teacher" ON public.quiz_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.quizzes q
      WHERE q.id = quiz_attempts.quiz_id
        AND q.teacher_id = auth.uid()
    )
  );

-- ── Quiz runtime state (timer + integrity warnings persistence) ──────────────
CREATE TABLE IF NOT EXISTS public.quiz_runtime_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  expires_at_ms BIGINT,
  violation_count INTEGER NOT NULL DEFAULT 0,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quiz_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_runtime_state_student ON public.quiz_runtime_state(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_runtime_state_quiz ON public.quiz_runtime_state(quiz_id);

-- Refresh PostgREST so the API sees new columns (Supabase).
NOTIFY pgrst, 'reload schema';

-- ── Lesson discussion system (lesson-only community replacement) ─────────────
CREATE TABLE IF NOT EXISTS public.lesson_discussion_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  best_answer_id UUID NULL,
  answers_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  helpful_score INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS public.lesson_discussion_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.lesson_discussion_questions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_best BOOLEAN NOT NULL DEFAULT FALSE,
  replies_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  helpful_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS public.lesson_discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL REFERENCES public.lesson_discussion_answers(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_reply_id UUID NULL REFERENCES public.lesson_discussion_replies(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  depth SMALLINT NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 3),
  reactions_count INTEGER NOT NULL DEFAULT 0,
  helpful_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS public.lesson_discussion_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer', 'reply')),
  target_id UUID NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'helpful')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_type, target_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS public.lesson_discussion_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer', 'reply')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.discussion_user_stats (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reputation INTEGER NOT NULL DEFAULT 0,
  answers_count INTEGER NOT NULL DEFAULT 0,
  best_answers_count INTEGER NOT NULL DEFAULT 0,
  helpful_reactions_received INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.discussion_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.discussion_user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.discussion_badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS public.discussion_moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer', 'reply', 'report')),
  target_id UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('delete', 'restore', 'lock', 'unlock', 'dismiss_report', 'resolve_report')),
  reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ldq_lesson_recent ON public.lesson_discussion_questions (lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ldq_lesson_activity ON public.lesson_discussion_questions (lesson_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_ldq_lesson_helpful ON public.lesson_discussion_questions (lesson_id, helpful_score DESC);
CREATE INDEX IF NOT EXISTS idx_lda_question ON public.lesson_discussion_answers (question_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ldr_answer ON public.lesson_discussion_replies (answer_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.lesson_discussion_reports (status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'lesson_discussion_questions'
      AND constraint_name = 'fk_lesson_discussion_best_answer'
  ) THEN
    ALTER TABLE public.lesson_discussion_questions
      ADD CONSTRAINT fk_lesson_discussion_best_answer
      FOREIGN KEY (best_answer_id) REFERENCES public.lesson_discussion_answers(id) ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO public.discussion_badges (key, label, description, threshold)
VALUES
  ('first_answer', 'First Answer', 'Posted your first answer', 1),
  ('helpful_contributor', 'Helpful Contributor', 'Received helpful reactions', 10),
  ('mentor', 'Mentor', 'Got multiple best answers', 5)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
