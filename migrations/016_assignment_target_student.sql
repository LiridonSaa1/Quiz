-- Migration 016: add target_student_id to assignments
-- Run once in the Supabase SQL editor.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS target_student_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assignments_target_student_id_idx ON assignments(target_student_id);
