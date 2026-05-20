-- Performance indexes for frequent role-based lookups and dashboard filters.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'teacher_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_teacher_id ON public.profiles(teacher_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'teacher_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON public.courses(teacher_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_courses_created_at ON public.courses(created_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'course_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON public.lessons(course_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_lessons_created_at ON public.lessons(created_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'course_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON public.quizzes(course_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_classes_created_at ON public.classes(created_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attempts' AND column_name = 'quiz_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_attempts_quiz_id ON public.attempts(quiz_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attempts' AND column_name = 'student_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_attempts_student_id ON public.attempts(student_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attempts' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON public.attempts(created_at DESC);
  END IF;
END $$;
