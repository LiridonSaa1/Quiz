-- ============================================================
-- QuizMaster — Complete Fresh Database Setup
-- Paste this entire script into Supabase → SQL Editor → Run
-- Safe to run on a brand-new database.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- FUNCTION: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

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
CREATE INDEX IF NOT EXISTS idx_profiles_role        ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_teacher_id  ON profiles(teacher_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status      ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON profiles(role, status);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at  ON profiles(created_at DESC);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teachers_read_auth" ON teachers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teachers_write_own" ON teachers FOR ALL   USING (auth.uid() = user_id);

CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students_read_self" ON students FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "students_write_own" ON students FOR ALL   USING (auth.uid() = user_id);

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_status     ON courses(status);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses_read_all"      ON courses FOR SELECT USING (status = 'published' OR auth.uid() = teacher_id);
CREATE POLICY "courses_write_teacher" ON courses FOR ALL    USING (auth.uid() = teacher_id);

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'active', 'inactive')),
  publish_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modules_course_id ON modules(course_id);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules_read_all"      ON modules FOR SELECT USING (true);
CREATE POLICY "modules_write_teacher" ON modules FOR ALL    USING (
  EXISTS (SELECT 1 FROM courses WHERE courses.id = modules.course_id AND courses.teacher_id = auth.uid())
);

CREATE TRIGGER trg_modules_updated_at
  BEFORE UPDATE ON modules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. LESSONS
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID REFERENCES courses(id) ON DELETE CASCADE,
  module_id         UUID REFERENCES modules(id) ON DELETE SET NULL,
  title             TEXT NOT NULL DEFAULT '',
  slug              TEXT,
  short_description TEXT,
  content           TEXT,
  type              TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('video', 'text', 'quiz', 'document')),
  video_url         TEXT,
  duration_minutes  INTEGER NOT NULL DEFAULT 0,
  "order"           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_free_preview   BOOLEAN NOT NULL DEFAULT FALSE,
  publish_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_module_id ON lessons(module_id);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_read_all"      ON lessons FOR SELECT USING (true);
CREATE POLICY "lessons_write_teacher" ON lessons FOR ALL    USING (
  EXISTS (SELECT 1 FROM courses WHERE courses.id = lessons.course_id AND courses.teacher_id = auth.uid())
);

CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7. LESSON CONTENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_contents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type             TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('video', 'audio', 'pdf', 'text')),
  title            TEXT,
  description      TEXT,
  storage_path     TEXT,
  mime_type        TEXT,
  size_bytes       BIGINT,
  text_content     TEXT,
  pdf_page         INTEGER,
  duration_seconds INTEGER,
  position         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lesson_contents_lesson_id ON lesson_contents(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_contents_position  ON lesson_contents(lesson_id, position);

-- ============================================================
-- 8. LESSON PROGRESS
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_progress (
  student_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id           UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed           BOOLEAN NOT NULL DEFAULT FALSE,
  last_video_position NUMERIC NOT NULL DEFAULT 0,
  last_opened_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson  ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_student ON lesson_progress(student_id);

-- ============================================================
-- 9. CLASSES
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
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_course_id  ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_classes_status     ON classes(status);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classes_read_auth"     ON classes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "classes_write_teacher" ON classes FOR ALL    USING (
  auth.uid() = teacher_id OR
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE TRIGGER trg_classes_updated_at
  BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10. QUIZZES
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  time_limit  INTEGER DEFAULT 0,
  published   BOOLEAN DEFAULT FALSE,
  type        TEXT DEFAULT 'standard',
  pass_mark   INTEGER,
  max_attempts INTEGER,
  settings    JSONB DEFAULT '{
    "shuffleQuestions": false,
    "shuffleAnswers": false,
    "showCorrectAnswers": true,
    "passingScore": 50,
    "maxAttempts": 0
  }'::jsonb,
  publish_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quizzes_teacher_id ON quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course_id  ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_published  ON quizzes(published);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quizzes_read_published"  ON quizzes FOR SELECT USING (published = true OR auth.uid() = teacher_id);
CREATE POLICY "quizzes_write_teacher"   ON quizzes FOR ALL    USING (auth.uid() = teacher_id);

CREATE TRIGGER trg_quizzes_updated_at
  BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 11. QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id         UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'multiple-choice' CHECK (type IN (
                    'multiple-choice', 'true-false', 'open-text',
                    'fill-in-the-blank', 'matching', 'ordering',
                    'image', 'video', 'reading', 'instruction'
                  )),
  text            TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON questions(quiz_id);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_read_all"      ON questions FOR SELECT USING (true);
CREATE POLICY "questions_write_teacher" ON questions FOR ALL  USING (
  EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = questions.quiz_id AND quizzes.teacher_id = auth.uid())
);

-- ============================================================
-- 12. QUIZ ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id         UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score           NUMERIC(6, 2) DEFAULT 0,
  score_percent   NUMERIC(6, 2) DEFAULT 0,
  total_points    NUMERIC(6, 2) DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  passed          BOOLEAN DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  answers         JSONB DEFAULT '{}'::jsonb,
  time_taken      INTEGER,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id       ON quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id          ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_completed_at     ON quiz_attempts(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_student     ON quiz_attempts(quiz_id, student_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_completed ON quiz_attempts(student_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_status   ON quiz_attempts(student_id, status);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_attempts_read_own"     ON quiz_attempts FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "quiz_attempts_insert_own"   ON quiz_attempts FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "quiz_attempts_update_own"   ON quiz_attempts FOR UPDATE USING (auth.uid() = student_id);
CREATE POLICY "quiz_attempts_read_teacher" ON quiz_attempts FOR SELECT USING (
  EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = quiz_attempts.quiz_id AND quizzes.teacher_id = auth.uid())
);

-- ============================================================
-- 13. QUIZ RUNTIME STATE
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_runtime_state (
  quiz_id                UUID        NOT NULL,
  student_id             UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at             TIMESTAMPTZ,
  expires_at_ms          BIGINT,
  violation_count        INTEGER     NOT NULL DEFAULT 0,
  current_question_index INTEGER     NOT NULL DEFAULT 0,
  answers                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quiz_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_runtime_state_student ON quiz_runtime_state(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_runtime_state_quiz    ON quiz_runtime_state(quiz_id);

-- ============================================================
-- 14. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'quiz', 'course')),
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id      ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read    ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON notifications FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 15. ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  description TEXT,
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  teacher_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  class_id    UUID REFERENCES classes(id) ON DELETE SET NULL,
  type        TEXT NOT NULL DEFAULT 'homework' CHECK (type IN ('homework','project','essay','quiz','lab','other')),
  due_date    TIMESTAMPTZ,
  max_score   INTEGER NOT NULL DEFAULT 100,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  publish_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assignments_course_id  ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id   ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status     ON assignments(status);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments_read_auth"  ON assignments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "assignments_write_auth" ON assignments FOR ALL   USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 16. ASSIGNMENT SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       TEXT,
  file_url      TEXT,
  file_name     TEXT,
  file_size     BIGINT,
  score         NUMERIC(6,2),
  feedback      TEXT,
  status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','graded','returned','late')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student    ON assignment_submissions(student_id);

ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment_submissions_read_auth"  ON assignment_submissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "assignment_submissions_write_auth" ON assignment_submissions FOR ALL   USING (auth.role() = 'authenticated');

CREATE TRIGGER trg_assignment_submissions_updated_at
  BEFORE UPDATE ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 17. ATTENDANCE
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
-- 18. CERTIFICATES
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

-- ============================================================
-- 19. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount       NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency     TEXT NOT NULL DEFAULT 'USD',
  status       TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed', 'refunded')),
  method       TEXT NOT NULL DEFAULT 'bank' CHECK (method IN ('card', 'bank', 'paypal', 'cash')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT,
  reference    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_teacher_id   ON payments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id   ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_read_auth"           ON payments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "payments_write_admin_teacher" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 20. INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id       UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  invoice_number   TEXT NOT NULL UNIQUE,
  teacher_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  currency         TEXT NOT NULL DEFAULT 'USD',
  status           TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'draft')),
  issued_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_date        DATE,
  course_title     TEXT NOT NULL DEFAULT '',
  items            JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes            TEXT NOT NULL DEFAULT '',
  student_address  TEXT NOT NULL DEFAULT '',
  student_phone    TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id   ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student_id   ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_teacher_id   ON invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_date  ON invoices(issued_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_read_auth"           ON invoices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "invoices_write_admin_teacher" ON invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 21. PLATFORM CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_config (
  section    TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 22. LIVE SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS live_sessions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT NOT NULL,
  description      TEXT,
  host_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  course_id        UUID REFERENCES courses(id) ON DELETE SET NULL,
  class_id         UUID REFERENCES classes(id) ON DELETE SET NULL,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  meeting_url      TEXT,
  recording_url    TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  max_participants INTEGER DEFAULT 100,
  started_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status_scheduled ON live_sessions(status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_host_id          ON live_sessions(host_id);

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_sessions_read"  ON live_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "live_sessions_write" ON live_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

CREATE TRIGGER trg_live_sessions_updated_at
  BEFORE UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 23. SESSION PARTICIPANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS session_participants (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id     UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('host','student')),
  joined_at      TIMESTAMPTZ,
  left_at        TIMESTAMPTZ,
  is_muted       BOOLEAN DEFAULT FALSE,
  is_pinned      BOOLEAN DEFAULT FALSE,
  is_removed     BOOLEAN DEFAULT FALSE,
  is_hand_raised BOOLEAN DEFAULT FALSE,
  invited_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user    ON session_participants(user_id);

ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_participants_read" ON session_participants FOR SELECT USING (
  auth.uid() = user_id
  OR auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
  OR EXISTS (SELECT 1 FROM session_participants sp2 WHERE sp2.session_id = session_participants.session_id AND sp2.user_id = auth.uid())
);
CREATE POLICY "session_participants_insert" ON session_participants FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
);
CREATE POLICY "session_participants_update" ON session_participants FOR UPDATE USING (
  auth.uid() = user_id
  OR auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
);
CREATE POLICY "session_participants_delete" ON session_participants FOR DELETE USING (
  auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
);

-- ============================================================
-- 24. SESSION CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS session_chat_messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message             TEXT NOT NULL,
  sender_display_name TEXT,
  sender_avatar_url   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_chat_session         ON session_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_chat_sender          ON session_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_session_chat_session_created ON session_chat_messages(session_id, created_at ASC);

ALTER TABLE session_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_chat_read" ON session_chat_messages FOR SELECT USING (
  auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
  OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_chat_messages.session_id)
);
CREATE POLICY "session_chat_insert" ON session_chat_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND (
    auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
    OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_chat_messages.session_id)
  )
);

-- ============================================================
-- 25. SESSION REACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS session_reactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_reactions_session ON session_reactions(session_id);

ALTER TABLE session_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_reactions_read" ON session_reactions FOR SELECT USING (
  auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
  OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_reactions.session_id)
);
CREATE POLICY "session_reactions_insert" ON session_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (
    auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
    OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_reactions.session_id)
  )
);

-- ============================================================
-- 26. COMMUNITY POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS community_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  content       TEXT,
  author_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  class_id      UUID REFERENCES classes(id) ON DELETE SET NULL,
  category      TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','q_and_a','resources','showcase')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pinned','archived')),
  likes_count   INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_posts_class_id ON community_posts(class_id);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_read"  ON community_posts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "community_write" ON community_posts FOR ALL   USING (auth.role() = 'authenticated');

-- ============================================================
-- 27. ANNOUNCEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  author_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all','students','teachers')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_read"  ON announcements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "announcements_write" ON announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

-- ============================================================
-- 28. LESSON DISCUSSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_discussion_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  author_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  is_pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  best_answer_id   UUID NULL,
  answers_count    INTEGER NOT NULL DEFAULT 0,
  reactions_count  INTEGER NOT NULL DEFAULT 0,
  helpful_score    INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS lesson_discussion_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES lesson_discussion_questions(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  is_best         BOOLEAN NOT NULL DEFAULT FALSE,
  replies_count   INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  helpful_score   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'lesson_discussion_questions'
      AND constraint_name = 'fk_lesson_discussion_best_answer'
  ) THEN
    ALTER TABLE lesson_discussion_questions
      ADD CONSTRAINT fk_lesson_discussion_best_answer
      FOREIGN KEY (best_answer_id) REFERENCES lesson_discussion_answers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lesson_discussion_replies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id       UUID NOT NULL REFERENCES lesson_discussion_answers(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_reply_id UUID NULL REFERENCES lesson_discussion_replies(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  depth           SMALLINT NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 3),
  reactions_count INTEGER NOT NULL DEFAULT 0,
  helpful_score   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS lesson_discussion_reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK (target_type IN ('question', 'answer', 'reply')),
  target_id     UUID NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'helpful')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_type, target_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS lesson_discussion_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('question', 'answer', 'reply')),
  target_id    UUID NOT NULL,
  reason       TEXT NOT NULL,
  details      TEXT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by  UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discussion_user_stats (
  user_id                     UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  reputation                  INTEGER NOT NULL DEFAULT 0,
  answers_count               INTEGER NOT NULL DEFAULT 0,
  best_answers_count          INTEGER NOT NULL DEFAULT 0,
  helpful_reactions_received  INTEGER NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discussion_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT NOT NULL,
  threshold   INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discussion_user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES discussion_badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS discussion_moderation_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer', 'reply', 'report')),
  target_id   UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('delete', 'restore', 'lock', 'unlock', 'dismiss_report', 'resolve_report')),
  reason      TEXT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ldq_lesson_recent   ON lesson_discussion_questions(lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ldq_lesson_activity ON lesson_discussion_questions(lesson_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_ldq_lesson_helpful  ON lesson_discussion_questions(lesson_id, helpful_score DESC);
CREATE INDEX IF NOT EXISTS idx_lda_question        ON lesson_discussion_answers(question_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ldr_answer          ON lesson_discussion_replies(answer_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_reports_status      ON lesson_discussion_reports(status, created_at DESC);

INSERT INTO discussion_badges (key, label, description, threshold)
VALUES
  ('first_answer',       'First Answer',        'Posted your first answer',         1),
  ('helpful_contributor','Helpful Contributor',  'Received helpful reactions',       10),
  ('mentor',             'Mentor',               'Got multiple best answers',        5)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 29. ERROR ALERT CONTEXT
-- ============================================================
CREATE TABLE IF NOT EXISTS error_alert_context (
  fingerprint TEXT PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS error_alert_context_created_at_idx ON error_alert_context(created_at DESC);

-- ============================================================
-- NOTIFY PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
