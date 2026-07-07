-- Migration 010: Denormalize sender info in session_chat_messages
-- Eliminates per-message profile lookup (N+1) when delivering via Supabase Realtime

ALTER TABLE session_chat_messages
  ADD COLUMN IF NOT EXISTS sender_display_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_avatar_url    TEXT;

-- Backfill existing rows from profiles
UPDATE session_chat_messages scm
SET
  sender_display_name = p.display_name,
  sender_avatar_url   = p.avatar_url
FROM profiles p
WHERE p.id = scm.sender_id
  AND scm.sender_display_name IS NULL;

-- Index for fast channel + time ordering
CREATE INDEX IF NOT EXISTS idx_session_chat_session_created
  ON session_chat_messages (session_id, created_at ASC);
