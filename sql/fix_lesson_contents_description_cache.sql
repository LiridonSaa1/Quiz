-- Fix: "Could not find the 'description' column of 'lesson_contents' in the schema cache"
-- Run once in Supabase → SQL Editor, then wait ~30s or run NOTIFY below.

ALTER TABLE public.lesson_contents ADD COLUMN IF NOT EXISTS description TEXT;

-- Refresh PostgREST schema cache (Supabase official troubleshooting)
NOTIFY pgrst, 'reload schema';
