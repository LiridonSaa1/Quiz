-- Align lesson_contents with app + migration 003 (fixes PGRST204 on description, etc.)
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.lesson_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'text',
  title text,
  description text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  text_content text,
  pdf_page integer,
  duration_seconds integer,
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS text_content text;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS pdf_page integer;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS position integer;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_lesson_contents_lesson_id ON public.lesson_contents (lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_contents_position ON public.lesson_contents (lesson_id, position);
