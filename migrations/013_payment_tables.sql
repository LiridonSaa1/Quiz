-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
CREATE TABLE IF NOT EXISTS student_monthly_payments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL,
  month_year  TEXT        NOT NULL,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_by     UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_smp_student ON student_monthly_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_smp_month   ON student_monthly_payments (month_year);

CREATE TABLE IF NOT EXISTS teacher_hours (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     UUID        NOT NULL,
  work_date      DATE        NOT NULL,
  hours          NUMERIC(5,2) NOT NULL,
  rate_per_hour  NUMERIC(10,2) NOT NULL DEFAULT 40,
  notes          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_th_teacher ON teacher_hours (teacher_id);
CREATE INDEX IF NOT EXISTS idx_th_date    ON teacher_hours (work_date DESC);
