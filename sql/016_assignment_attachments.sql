-- Add attachments column to assignments table
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_assignments_attachments ON public.assignments USING GIN (attachments);
