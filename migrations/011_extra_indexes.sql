-- Migration 011: Extra performance indexes

-- Student dashboard: filter attempts by student + status
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_status
  ON quiz_attempts (student_id, status);

-- Notification badge (unread count per user)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, read);

-- Profiles status filter (admin active users count)
CREATE INDEX IF NOT EXISTS idx_profiles_status
  ON profiles (status);

-- Profiles role + status composite (admin analytics GROUP BY)
CREATE INDEX IF NOT EXISTS idx_profiles_role_status
  ON profiles (role, status);

-- Profiles created_at for 30-day trend queries
CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON profiles (created_at DESC);

-- Courses status for active-course counts
CREATE INDEX IF NOT EXISTS idx_courses_status
  ON courses (status);

-- Classes status for analytics
CREATE INDEX IF NOT EXISTS idx_classes_status
  ON classes (status);
