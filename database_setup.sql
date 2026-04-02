-- ============================================================
-- QuizMaster — Complete Database Setup
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student')),
  teacher_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS teachers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name       TEXT NOT NULL DEFAULT '',
  last_name        TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL,
  phone            TEXT,
  specialization   TEXT,
  qualification    TEXT,
  experience_years INTEGER DEFAULT 0,
  bio              TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- 3. STUDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name         TEXT NOT NULL DEFAULT '',
  last_name          TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL,
  phone              TEXT,
  date_of_birth      DATE,
  gender             TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  preferred_language TEXT DEFAULT 'en',
  current_level      TEXT,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- 4. COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  slug                TEXT UNIQUE,
  description         TEXT,
  short_description   TEXT,
  language            TEXT DEFAULT 'en',
  level               TEXT DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  price               NUMERIC(10, 2) DEFAULT 0,
  is_free             BOOLEAN DEFAULT TRUE,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  thumbnail           TEXT,
  student_ids         UUID[] DEFAULT '{}',
  total_lessons       INTEGER DEFAULT 0,
  total_students      INTEGER DEFAULT 0,
  certificate_enabled BOOLEAN DEFAULT FALSE,
  gradient            TEXT DEFAULT 'from-indigo-500 to-violet-600',
  category            TEXT DEFAULT 'Other',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add gradient and category columns if they don't exist (for existing databases)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS gradient TEXT DEFAULT 'from-indigo-500 to-violet-600';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Other';

-- ============================================================
-- 5. MODULES
-- ============================================================
CREATE TABLE IF NOT EXISTS modules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  slug        TEXT,
  description TEXT,
  "order"     INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. LESSONS
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id         UUID REFERENCES modules(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  slug              TEXT,
  short_description TEXT,
  content           TEXT,
  type              TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('video', 'text', 'quiz', 'document')),
  video_url         TEXT,
  duration_minutes  INTEGER DEFAULT 0,
  "order"           INTEGER DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_free_preview   BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. CLASSES  ← NEW
-- Groups of students assigned to a teacher for a course session
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  teacher_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  student_ids UUID[] DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('active', 'upcoming', 'completed', 'archived')),
  start_date  DATE,
  end_date    DATE,
  capacity    INTEGER DEFAULT 30,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. QUIZZES
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  time_limit  INTEGER DEFAULT 0,
  published   BOOLEAN DEFAULT FALSE,
  settings    JSONB DEFAULT '{
    "shuffleQuestions": false,
    "shuffleAnswers": false,
    "showCorrectAnswers": true,
    "passingScore": 50,
    "maxAttempts": 0
  }'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id         UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'multiple-choice' CHECK (type IN (
                    'multiple-choice', 'true-false', 'open-text',
                    'fill-in-the-blank', 'matching', 'ordering'
                  )),
  text            TEXT NOT NULL,
  reading_passage TEXT,
  media_url       TEXT,
  media_type      TEXT CHECK (media_type IN ('image', 'video', 'audio')),
  options         JSONB DEFAULT '[]'::jsonb,
  correct_answer  JSONB,
  points          INTEGER DEFAULT 1,
  explanation     TEXT,
  "order"         INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS attempts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id         UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score           NUMERIC(6, 2) DEFAULT 0,
  total_points    NUMERIC(6, 2) DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  answers         JSONB DEFAULT '[]'::jsonb,
  time_taken      INTEGER,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'quiz', 'course')),
  read       BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role           ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_teacher_id     ON profiles(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id        ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id        ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id      ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_status          ON courses(status);
CREATE INDEX IF NOT EXISTS idx_modules_course_id       ON modules(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id       ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_module_id       ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id      ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_course_id       ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_classes_status          ON classes(status);
CREATE INDEX IF NOT EXISTS idx_quizzes_teacher_id      ON quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course_id       ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_published       ON quizzes(published);
CREATE INDEX IF NOT EXISTS idx_questions_quiz_id       ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student_id     ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz_id        ON attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read      ON notifications(user_id, read);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE students       ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_read_all"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Teachers
CREATE POLICY "teachers_read_auth"  ON teachers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teachers_write_own"  ON teachers FOR ALL   USING (auth.uid() = user_id);

-- Students
CREATE POLICY "students_read_self"  ON students FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "students_write_own"  ON students FOR ALL   USING (auth.uid() = user_id);

-- Courses
CREATE POLICY "courses_read_all"         ON courses FOR SELECT USING (status = 'published' OR auth.uid() = teacher_id);
CREATE POLICY "courses_write_teacher"    ON courses FOR ALL    USING (auth.uid() = teacher_id);

-- Modules
CREATE POLICY "modules_read_all"         ON modules FOR SELECT USING (true);
CREATE POLICY "modules_write_teacher"    ON modules FOR ALL    USING (
  EXISTS (SELECT 1 FROM courses WHERE courses.id = modules.course_id AND courses.teacher_id = auth.uid())
);

-- Lessons
CREATE POLICY "lessons_read_all"         ON lessons FOR SELECT USING (true);
CREATE POLICY "lessons_write_teacher"    ON lessons FOR ALL    USING (
  EXISTS (SELECT 1 FROM courses WHERE courses.id = lessons.course_id AND courses.teacher_id = auth.uid())
);

-- Classes: admins and assigned teachers can manage; students see their own
CREATE POLICY "classes_read_auth"        ON classes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "classes_write_teacher"    ON classes FOR ALL    USING (
  auth.uid() = teacher_id OR
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Quizzes
CREATE POLICY "quizzes_read_published"   ON quizzes FOR SELECT USING (published = true OR auth.uid() = teacher_id);
CREATE POLICY "quizzes_write_teacher"    ON quizzes FOR ALL    USING (auth.uid() = teacher_id);

-- Questions
CREATE POLICY "questions_read_all"       ON questions FOR SELECT USING (true);
CREATE POLICY "questions_write_teacher"  ON questions FOR ALL  USING (
  EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = questions.quiz_id AND quizzes.teacher_id = auth.uid())
);

-- Attempts
CREATE POLICY "attempts_read_own"        ON attempts FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "attempts_insert_own"      ON attempts FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "attempts_update_own"      ON attempts FOR UPDATE USING (auth.uid() = student_id);
CREATE POLICY "attempts_read_teacher"    ON attempts FOR SELECT USING (
  EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = attempts.quiz_id AND quizzes.teacher_id = auth.uid())
);

-- Notifications
CREATE POLICY "notifications_own"        ON notifications FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at  BEFORE UPDATE ON profiles  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_teachers_updated_at  BEFORE UPDATE ON teachers  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_students_updated_at  BEFORE UPDATE ON students  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_courses_updated_at   BEFORE UPDATE ON courses   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_modules_updated_at   BEFORE UPDATE ON modules   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_lessons_updated_at   BEFORE UPDATE ON lessons   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_classes_updated_at   BEFORE UPDATE ON classes   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_quizzes_updated_at   BEFORE UPDATE ON quizzes   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  description    TEXT,
  course_id      UUID REFERENCES courses(id) ON DELETE SET NULL,
  teacher_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  class_id       UUID REFERENCES classes(id) ON DELETE SET NULL,
  type           TEXT NOT NULL DEFAULT 'homework' CHECK (type IN ('homework','project','essay','quiz','lab','other')),
  due_date       TIMESTAMPTZ,
  max_score      INTEGER NOT NULL DEFAULT 100,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_course_id   ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id  ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id    ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status      ON assignments(status);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments_read_auth"  ON assignments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "assignments_write_auth" ON assignments FOR ALL   USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 13. ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id   UUID REFERENCES classes(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','excused')),
  notes      TEXT,
  marked_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_id   ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date       ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_status     ON attendance(status);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_read_auth"  ON attendance FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "attendance_write_auth" ON attendance FOR ALL   USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

-- ============================================================
-- 14. CERTIFICATES
-- ============================================================
CREATE TABLE IF NOT EXISTS certificates (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id          UUID REFERENCES courses(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  issued_at          DATE NOT NULL DEFAULT CURRENT_DATE,
  certificate_number TEXT NOT NULL UNIQUE,
  grade              TEXT,
  score              NUMERIC(5, 2),
  status             TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','revoked')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_student_id ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id  ON certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status     ON certificates(status);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certificates_read_auth"  ON certificates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "certificates_write_auth" ON certificates FOR ALL   USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);
