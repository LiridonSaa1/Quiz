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

-- Refresh PostgREST so the API sees new columns (Supabase).
NOTIFY pgrst, 'reload schema';
