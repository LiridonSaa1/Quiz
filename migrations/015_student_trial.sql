-- Adds free-trial period support for students.
-- Run this manually in the Supabase SQL editor if the server log shows:
-- "[migration] profiles.trial_days could not be auto-created" / "profiles.trial_ends_at could not be auto-created"

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_days INTEGER NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL;

NOTIFY pgrst, 'reload schema';
