-- Migration 013: Student transfer history log

CREATE TABLE IF NOT EXISTS student_transfers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL,
  student_name    TEXT        NOT NULL DEFAULT '',
  student_email   TEXT        NOT NULL DEFAULT '',
  from_teacher_id UUID        NOT NULL,
  from_teacher_name TEXT      NOT NULL DEFAULT '',
  to_teacher_id   UUID        NOT NULL,
  to_teacher_name TEXT        NOT NULL DEFAULT '',
  transferred_by  UUID        NOT NULL,
  note            TEXT,
  transferred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_transfers_student      ON student_transfers (student_id);
CREATE INDEX IF NOT EXISTS idx_student_transfers_from_teacher ON student_transfers (from_teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_transfers_to_teacher   ON student_transfers (to_teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_transfers_at           ON student_transfers (transferred_at DESC);
