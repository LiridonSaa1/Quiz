-- Creates the quiz_runtime_state table (quiz progress / timer persistence).
-- Also adds missing columns to notifications that older deployments may lack.

-- ── quiz_runtime_state ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quiz_runtime_state (
  quiz_id                UUID        NOT NULL,
  student_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at             TIMESTAMPTZ,
  expires_at_ms          BIGINT,
  violation_count        INTEGER     NOT NULL DEFAULT 0,
  current_question_index INTEGER     NOT NULL DEFAULT 0,
  answers                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quiz_id, student_id)
);

-- Add answers column to existing tables that were created before this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quiz_runtime_state'
      AND column_name  = 'answers'
  ) THEN
    ALTER TABLE public.quiz_runtime_state
      ADD COLUMN answers JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ── notifications — backfill missing columns ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notifications'
      AND column_name  = 'read'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN read BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notifications'
      AND column_name  = 'action_url'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN action_url TEXT;
  END IF;
END $$;

-- Index for efficient student-quiz lookups.
CREATE INDEX IF NOT EXISTS idx_quiz_runtime_state_student
  ON public.quiz_runtime_state (student_id);
