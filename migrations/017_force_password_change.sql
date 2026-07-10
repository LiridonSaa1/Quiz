-- Add force_password_change flag to profiles
-- Set to TRUE when admin creates a new teacher or student account.
-- Cleared to FALSE after the user successfully changes their password.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_force_pw ON public.profiles (force_password_change)
  WHERE force_password_change = true;
