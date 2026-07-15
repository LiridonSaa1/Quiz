-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  content         text NOT NULL DEFAULT '',
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_audience text NOT NULL DEFAULT 'all',
  priority        text NOT NULL DEFAULT 'normal',
  status          text NOT NULL DEFAULT 'draft',
  ann_type        text NOT NULL DEFAULT 'general',
  scheduled_at    timestamptz NULL,
  published_at    timestamptz NULL,
  expires_at      timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NULL
);

CREATE INDEX IF NOT EXISTS announcements_status_idx          ON public.announcements(status);
CREATE INDEX IF NOT EXISTS announcements_target_audience_idx ON public.announcements(target_audience);
CREATE INDEX IF NOT EXISTS announcements_created_at_idx      ON public.announcements(created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by Express backend)
CREATE POLICY IF NOT EXISTS "service_role_all" ON public.announcements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow authenticated users to read published announcements
CREATE POLICY IF NOT EXISTS "authenticated_read_published" ON public.announcements
  FOR SELECT TO authenticated
  USING (status = 'published');
