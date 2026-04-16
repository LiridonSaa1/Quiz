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

-- ============================================================
-- 15. PAYMENTS
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

-- ============================================================
-- 16. PLATFORM CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_config (
  section    TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_teacher_id   ON payments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id   ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_read_auth" ON payments FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY "payments_write_admin_teacher" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
);

CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 16. INVOICES (linked to payments; one invoice per payment)
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
CREATE POLICY "invoices_read_auth" ON invoices FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY "invoices_write_admin_teacher" ON invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
);

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_certificates_student_id ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id  ON certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status     ON certificates(status);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certificates_read_auth"  ON certificates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "certificates_write_auth" ON certificates FOR ALL   USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

-- ============================================================
-- INTERACTION TABLES (Live Sessions, Community, Announcements)
-- Run these in your Supabase SQL Editor
-- ============================================================

-- Live Sessions
CREATE TABLE IF NOT EXISTS live_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  description       TEXT,
  host_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  course_id         UUID REFERENCES courses(id) ON DELETE SET NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 60,
  meeting_url       TEXT,
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  max_participants  INTEGER DEFAULT 100,
  started_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_sessions_read"  ON live_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "live_sessions_write" ON live_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

-- Community Posts
CREATE TABLE IF NOT EXISTS community_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  content       TEXT,
  author_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category      TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','q_and_a','resources','showcase')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pinned','archived')),
  likes_count   INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_read"  ON community_posts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "community_write" ON community_posts FOR ALL USING (auth.role() = 'authenticated');

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT NOT NULL,
  content          TEXT NOT NULL,
  author_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_audience  TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all','students','teachers')),
  priority         TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_read"  ON announcements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "announcements_write" ON announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','teacher'))
);

-- Add recording_url to live_sessions (run if table already exists)
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Add started_at to live_sessions
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Add class_id to live_sessions
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

-- ============================================================
-- SESSION PARTICIPANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS session_participants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('host','student')),
  joined_at  TIMESTAMPTZ,
  left_at    TIMESTAMPTZ,
  is_muted       BOOLEAN DEFAULT FALSE,
  is_pinned      BOOLEAN DEFAULT FALSE,
  is_removed     BOOLEAN DEFAULT FALSE,
  is_hand_raised BOOLEAN DEFAULT FALSE,
  invited_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user    ON session_participants(user_id);
-- Forward-compatible column migrations (no-op if column already exists)
ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS is_removed     BOOLEAN DEFAULT FALSE;
ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS is_hand_raised BOOLEAN DEFAULT FALSE;

ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
-- Only the host of the session or an invited participant can read participant records for that session
CREATE POLICY "session_participants_read" ON session_participants FOR SELECT USING (
  auth.uid() = user_id
  OR auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
  OR EXISTS (SELECT 1 FROM session_participants sp2 WHERE sp2.session_id = session_participants.session_id AND sp2.user_id = auth.uid())
);
-- Participants can insert their own row (join); host can insert/update any row
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
-- SESSION CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS session_chat_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_chat_session ON session_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_chat_sender  ON session_chat_messages(sender_id);
ALTER TABLE session_chat_messages ENABLE ROW LEVEL SECURITY;
-- Only participants or the host of the session can read chat
CREATE POLICY "session_chat_read" ON session_chat_messages FOR SELECT USING (
  auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
  OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_chat_messages.session_id)
);
-- Only participants or host can send messages; sender_id must match own user id
CREATE POLICY "session_chat_insert" ON session_chat_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND (
    auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
    OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_chat_messages.session_id)
  )
);

-- ============================================================
-- SESSION REACTIONS
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
-- Only participants or host can read reactions for a session
CREATE POLICY "session_reactions_read" ON session_reactions FOR SELECT USING (
  auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
  OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_reactions.session_id)
);
-- Only participants or host can insert their own reactions
CREATE POLICY "session_reactions_insert" ON session_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (
    auth.uid() IN (SELECT host_id FROM live_sessions WHERE id = session_id)
    OR auth.uid() IN (SELECT user_id FROM session_participants WHERE session_id = session_reactions.session_id)
  )
);

-- ============================================================
-- Compatibility (run on existing DBs): certificates status
-- ============================================================
-- Older installs may omit status; admin reports and analytics filter on issued/revoked.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'issued';

-- ============================================================
-- Compatibility (run on existing DBs): quizzes extras + question types
-- ============================================================
-- Older installs may have `quizzes` without teacher_id; API and RLS expect it.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
-- Older installs may omit `published`; admin analytics filters on it.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE;
UPDATE quizzes q SET teacher_id = c.teacher_id FROM courses c
  WHERE q.teacher_id IS NULL AND q.course_id IS NOT NULL AND q.course_id = c.id;
CREATE INDEX IF NOT EXISTS idx_quizzes_teacher_id ON quizzes(teacher_id);

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'standard';
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS pass_mark INTEGER;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS max_attempts INTEGER;

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
  'multiple-choice', 'true-false', 'open-text', 'fill-in-the-blank', 'matching', 'ordering',
  'image', 'video', 'reading'
));
