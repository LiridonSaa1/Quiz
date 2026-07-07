-- Additional hot-path indexes identified in the performance audit.
-- All statements are idempotent (CREATE INDEX IF NOT EXISTS) and wrapped in
-- existence checks so they degrade gracefully on databases that are missing
-- the underlying tables/columns.
DO $$
BEGIN
  -- quiz_attempts composite: dashboard/results filtering by quiz + student
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'quiz_attempts'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id
      ON public.quiz_attempts(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id
      ON public.quiz_attempts(student_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_completed_at
      ON public.quiz_attempts(completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_student
      ON public.quiz_attempts(quiz_id, student_id, completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_completed
      ON public.quiz_attempts(student_id, completed_at DESC);
  END IF;

  -- session_chat_messages: cursor-based history pagination
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'session_chat_messages'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_session_chat_messages_session_created
      ON public.session_chat_messages(session_id, created_at ASC);
  END IF;

  -- live_sessions: status-based tab filtering (upcoming / live / past)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'live_sessions'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_live_sessions_status_scheduled
      ON public.live_sessions(status, scheduled_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_sessions_host_id
      ON public.live_sessions(host_id);
  END IF;

  -- notifications: unread badge + per-user list
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON public.notifications(user_id, created_at DESC);
  END IF;

  -- classes: teacher-scoped lookup
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'teacher_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_classes_teacher_id
      ON public.classes(teacher_id);
  END IF;

  -- quizzes: course-scoped status filtering
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_quizzes_course_status
      ON public.quizzes(course_id, status);
  END IF;
END $$;
