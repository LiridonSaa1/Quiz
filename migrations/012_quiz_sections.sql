-- Migration 012: Quiz Sections
-- Adds quiz_sections table and section_id to questions.
-- Run this manually in Supabase SQL Editor if the auto-migration failed.

CREATE TABLE IF NOT EXISTS public.quiz_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Section',
  type TEXT NOT NULL DEFAULT 'general',   -- grammar | listening | reading | writing | vocabulary | general
  instructions TEXT,
  audio_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_sections_quiz_id ON public.quiz_sections(quiz_id);

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS section_id UUID
  REFERENCES public.quiz_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_section_id ON public.questions(section_id);
