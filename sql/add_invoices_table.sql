-- Invoices table (one row per payment). Run in Supabase SQL Editor after payments exists.
-- Safe to run multiple times (uses IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.invoices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id       UUID NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_number   TEXT NOT NULL UNIQUE,
  teacher_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_invoices_payment_id   ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student_id   ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_teacher_id   ON public.invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_date  ON public.invoices(issued_date);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_read_auth" ON public.invoices;
CREATE POLICY "invoices_read_auth" ON public.invoices
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "invoices_write_admin_teacher" ON public.invoices;
CREATE POLICY "invoices_write_admin_teacher" ON public.invoices
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'teacher')
  )
);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
