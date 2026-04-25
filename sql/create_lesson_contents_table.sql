-- Run in Supabase → SQL Editor when lesson_contents does not exist yet.
-- Requires public.lessons(id) to exist first (run the "Lessons" section of run_in_supabase_editor.sql first).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS idx_lesson_contents_lesson_id ON public.lesson_contents (lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_contents_position ON public.lesson_contents (lesson_id, position);
