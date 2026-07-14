-- Add parent_email column to profiles table
-- Run this in Supabase SQL editor if the server cannot auto-apply it.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_email TEXT NULL;
NOTIFY pgrst, 'reload schema';
