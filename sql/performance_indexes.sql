-- Performance Indexes — run in Supabase SQL Editor

-- Presentations
CREATE INDEX IF NOT EXISTS idx_presentations_user_id
  ON presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_created_at
  ON presentations(created_at DESC);

-- Assignment Submissions
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id
  ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id
  ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status
  ON assignment_submissions(status);

-- Session Participants
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id
  ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user_id
  ON session_participants(user_id);

-- Session Chat
CREATE INDEX IF NOT EXISTS idx_session_chat_session_id
  ON session_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_chat_created_at
  ON session_chat_messages(created_at DESC);

-- Notifications — composite for unread queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read) WHERE read = false;

-- Courses — composite for student-visible published courses
CREATE INDEX IF NOT EXISTS idx_courses_status_teacher
  ON courses(status, teacher_id);

-- Certificates
CREATE INDEX IF NOT EXISTS idx_certificates_student_id
  ON certificates(student_id);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_class_date
  ON attendance(class_id, date);

-- Live Sessions
CREATE INDEX IF NOT EXISTS idx_live_sessions_host_status
  ON live_sessions(host_id, status);
