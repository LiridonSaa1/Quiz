-- ============================================================
-- Migration 018: platform_config — create table + RLS policies
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- 1. Create the table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS platform_config (
  section    TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- 3. Drop old policies if they exist (safe to re-run)
DROP POLICY IF EXISTS "platform_config_select_auth"        ON platform_config;
DROP POLICY IF EXISTS "platform_config_write_service_role" ON platform_config;
DROP POLICY IF EXISTS "platform_config_write_own_settings" ON platform_config;
DROP POLICY IF EXISTS "platform_config_all_service"        ON platform_config;

-- 4. SELECT: any authenticated user can read config
--    (settings, branding, etc. are not secret)
CREATE POLICY "platform_config_select_auth"
  ON platform_config
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 5. INSERT / UPDATE / DELETE: only the service role (used by the Express
--    backend with SUPABASE_SERVICE_ROLE_KEY) may write.
--    The frontend never writes directly — it calls /api/teacher/config/settings
--    or /api/admin/config/:section which use supabaseAdmin (service role).
CREATE POLICY "platform_config_write_service_role"
  ON platform_config
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. Safety fallback: allow a teacher/admin to write ONLY their own personal
--    settings row (section = 'teacher_settings:<their-uuid>').
--    This covers any edge-case where a direct client call is still made.
CREATE POLICY "platform_config_write_own_settings"
  ON platform_config
  FOR ALL
  USING  (section = 'teacher_settings:' || auth.uid()::text)
  WITH CHECK (section = 'teacher_settings:' || auth.uid()::text);
