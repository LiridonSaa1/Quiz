-- ============================================================
-- QuizMaster — Clear ALL data (keep schema & tables intact)
-- Paste into Supabase → SQL Editor → Run
-- Safe: skips tables that don't exist in your database.
-- WARNING: Permanently deletes every row in every table.
-- ============================================================

SET session_replication_role = 'replica';

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    -- Discussion system (children first)
    'discussion_moderation_actions',
    'discussion_user_badges',
    'discussion_badges',
    'discussion_user_stats',
    'lesson_discussion_reports',
    'lesson_discussion_reactions',
    'lesson_discussion_replies',
    'lesson_discussion_answers',
    'lesson_discussion_questions',
    -- Live sessions
    'session_reactions',
    'session_chat_messages',
    'session_participants',
    'live_sessions',
    -- Community & announcements
    'community_posts',
    'announcements',
    -- Quiz data
    'quiz_runtime_state',
    'quiz_attempts',
    'attempts',
    'questions',
    'quizzes',
    -- Lesson content & progress
    'lesson_progress',
    'lesson_contents',
    'lessons',
    -- Academic records
    'assignment_submissions',
    'assignments',
    'attendance',
    'certificates',
    -- Finance
    'invoices',
    'payments',
    -- Course structure
    'modules',
    'courses',
    'classes',
    -- Users
    'teachers',
    'students',
    'notifications',
    -- Config & monitoring
    'platform_config',
    'error_alert_context',
    -- Profiles last
    'profiles'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', tbl);
      RAISE NOTICE 'Cleared: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (does not exist): %', tbl;
    END IF;
  END LOOP;
END $$;

SET session_replication_role = 'DEFAULT';

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Done. All existing rows deleted; schema and policies intact.
-- ============================================================
