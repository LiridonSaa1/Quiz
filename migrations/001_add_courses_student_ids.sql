-- Safe to run on existing databases. Matches database_setup.sql.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS student_ids UUID[] DEFAULT '{}';
