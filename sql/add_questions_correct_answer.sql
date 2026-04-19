-- Fix PostgREST: missing columns on public.questions (text, correct_answer, explanation, …)
-- Run the whole script in Supabase → SQL Editor. Re-run NOTIFY if the app still errors.

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

-- Ask PostgREST to pick up the new columns (Supabase / self-hosted PostgREST).
NOTIFY pgrst, 'reload schema';
