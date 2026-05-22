-- ============================================================
-- QuizMaster — Clear ALL data (keep schema & tables intact)
-- Paste into Supabase → SQL Editor → Run
-- WARNING: This permanently deletes every row in every table.
-- ============================================================

-- Disable triggers temporarily so updated_at doesn't fire
SET session_replication_role = 'replica';

-- ── Discussion system ─────────────────────────────────────────
TRUNCATE TABLE public.discussion_moderation_actions  CASCADE;
TRUNCATE TABLE public.discussion_user_badges         CASCADE;
TRUNCATE TABLE public.discussion_badges              CASCADE;
TRUNCATE TABLE public.discussion_user_stats          CASCADE;
TRUNCATE TABLE public.lesson_discussion_reports      CASCADE;
TRUNCATE TABLE public.lesson_discussion_reactions    CASCADE;
TRUNCATE TABLE public.lesson_discussion_replies      CASCADE;
TRUNCATE TABLE public.lesson_discussion_answers      CASCADE;
TRUNCATE TABLE public.lesson_discussion_questions    CASCADE;

-- ── Live session data ─────────────────────────────────────────
TRUNCATE TABLE public.session_reactions              CASCADE;
TRUNCATE TABLE public.session_chat_messages          CASCADE;
TRUNCATE TABLE public.session_participants           CASCADE;
TRUNCATE TABLE public.live_sessions                  CASCADE;

-- ── Community & announcements ─────────────────────────────────
TRUNCATE TABLE public.community_posts                CASCADE;
TRUNCATE TABLE public.announcements                  CASCADE;

-- ── Quiz data ────────────────────────────────────────────────
TRUNCATE TABLE public.quiz_runtime_state             CASCADE;
TRUNCATE TABLE public.quiz_attempts                  CASCADE;
TRUNCATE TABLE public.questions                      CASCADE;
TRUNCATE TABLE public.quizzes                        CASCADE;

-- ── Lesson content & progress ────────────────────────────────
TRUNCATE TABLE public.lesson_progress                CASCADE;
TRUNCATE TABLE public.lesson_contents                CASCADE;
TRUNCATE TABLE public.lessons                        CASCADE;

-- ── Assessments & academic records ──────────────────────────
TRUNCATE TABLE public.assignment_submissions         CASCADE;
TRUNCATE TABLE public.assignments                    CASCADE;
TRUNCATE TABLE public.attendance                     CASCADE;
TRUNCATE TABLE public.certificates                   CASCADE;

-- ── Finance ──────────────────────────────────────────────────
TRUNCATE TABLE public.invoices                       CASCADE;
TRUNCATE TABLE public.payments                       CASCADE;

-- ── Course structure ─────────────────────────────────────────
TRUNCATE TABLE public.modules                        CASCADE;
TRUNCATE TABLE public.courses                        CASCADE;
TRUNCATE TABLE public.classes                        CASCADE;

-- ── Users ────────────────────────────────────────────────────
TRUNCATE TABLE public.teachers                       CASCADE;
TRUNCATE TABLE public.students                       CASCADE;
TRUNCATE TABLE public.notifications                  CASCADE;

-- ── Config & monitoring ──────────────────────────────────────
TRUNCATE TABLE public.platform_config                CASCADE;
TRUNCATE TABLE public.error_alert_context            CASCADE;

-- ── Profiles last (referenced by everything else) ────────────
-- NOTE: This does NOT delete auth.users — only the profile rows.
-- Users will still be able to log in; their profiles will be
-- recreated on next sign-in if your trigger is set up.
TRUNCATE TABLE public.profiles                       CASCADE;

-- Re-enable triggers
SET session_replication_role = 'DEFAULT';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Done. All rows deleted; schema and policies are untouched.
-- Run sql/fresh_database.sql first if you also need the schema.
-- ============================================================
