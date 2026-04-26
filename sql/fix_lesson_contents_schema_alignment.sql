-- Fix legacy lesson_contents schemas that are missing columns like:
--   position, type, description, storage_path, text_content, created_at, updated_at
--
-- Run in Supabase -> SQL Editor -> Run.
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.lesson_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text',
  title TEXT,
  description TEXT,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  text_content TEXT,
  pdf_page INTEGER,
  duration_seconds INTEGER,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text';
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS text_content TEXT;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS pdf_page INTEGER;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS position INTEGER;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.lesson_contents ALTER COLUMN type SET DEFAULT 'text';
ALTER TABLE public.lesson_contents ALTER COLUMN position SET DEFAULT 1;
ALTER TABLE public.lesson_contents ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.lesson_contents ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE public.lesson_contents
SET
  type = COALESCE(NULLIF(type, ''), 'text'),
  position = COALESCE(position, 1),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

CREATE INDEX IF NOT EXISTS idx_lesson_contents_lesson_id
  ON public.lesson_contents (lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_contents_position
  ON public.lesson_contents (lesson_id, position);
