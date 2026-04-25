-- Stores error context by fingerprint so "Fix now" works on serverless (Vercel) where in-memory maps are lost.
create table if not exists public.error_alert_context (
  fingerprint text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists error_alert_context_created_at_idx
  on public.error_alert_context (created_at desc);

comment on table public.error_alert_context is 'Temporary error payloads for Telegram Fix now / AI flow; service role only.';
