-- Run in Supabase SQL Editor if you see: column courses.student_ids does not exist
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS student_ids UUID[] DEFAULT '{}';
