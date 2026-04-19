-- ============================================================
-- QuizMaster — RESET PUBLIC DATA (destructive)
-- ============================================================
-- Deletes ALL rows from application tables in `public` that exist.
-- Missing tables (older / partial installs) are skipped — no error.
-- Schema, RLS policies, and triggers are kept.
--
-- Does NOT delete auth.users (Supabase login accounts). After this
-- run, profile rows are gone; users in Authentication may still
-- exist — remove them in Dashboard → Authentication if you want
-- a full account reset.
--
-- Run in Supabase SQL Editor (or psql) on the target project.
-- ============================================================

DO $$
DECLARE
  -- Prefer child/session tables first; CASCADE still resolves FKs.
  ordered_tables text[] := ARRAY[
    'session_reactions',
    'session_chat_messages',
    'session_participants',
    'live_sessions',
    'announcements',
    'community_posts',
    'notifications',
    'quiz_attempts',
    'attempts',
    'questions',
    'quizzes',
    'assignments',
    'attendance',
    'certificates',
    'invoices',
    'payments',
    'lessons',
    'modules',
    'classes',
    'courses',
    'students',
    'teachers',
    'profiles',
    'platform_config'
  ];
  existing text[] := '{}';
  t text;
  stmt text;
  sep text := '';
BEGIN
  FOREACH t IN ARRAY ordered_tables
  LOOP
    IF to_regclass(format('%I.%I', 'public', t)) IS NOT NULL THEN
      existing := array_append(existing, t);
    END IF;
  END LOOP;

  IF coalesce(array_length(existing, 1), 0) = 0 THEN
    RAISE NOTICE 'No QuizMaster tables found in public — nothing truncated.';
    RETURN;
  END IF;

  stmt := 'TRUNCATE TABLE ';
  FOREACH t IN ARRAY existing
  LOOP
    stmt := stmt || sep || format('%I.%I', 'public', t);
    sep := ', ';
  END LOOP;
  stmt := stmt || ' RESTART IDENTITY CASCADE';

  EXECUTE stmt;
END $$;
