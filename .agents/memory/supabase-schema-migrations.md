---
name: Supabase schema migrations require manual SQL
description: Why server-side auto-migration of Supabase-managed tables (profiles, quizzes, etc.) fails in this project, and the pattern to follow when adding columns.
---

This project's Supabase instance does not have a `public.exec_sql(sql)` RPC function installed, and the `DATABASE_URL` env var (used by `poolQuery` in `server.ts`) points to a separate Postgres database that does not contain the core Supabase-managed tables (`profiles`, `quizzes`, etc.) — only newer feature tables created directly via `poolQuery` migrations (e.g. `student_monthly_payments`, `teacher_hours`).

**Why:** Confirmed via server logs — `poolQuery('ALTER TABLE public.profiles ...')` fails with `relation "public.profiles" does not exist`, and the RPC fallback fails with `Could not find the function public.exec_sql(sql) in the schema cache`. This means any ALTER TABLE targeting a core Supabase table cannot be auto-applied at server startup.

**How to apply:** When adding a column to a core Supabase table (profiles, quizzes, courses, etc.):
1. Write the migration function with the 3-step fallback already established in `server.ts` (try `poolQuery` → probe via `supabaseAdmin.from(table).select(col)` → `supabaseAdmin.rpc('exec_sql', ...)`), and track success in a module-level boolean flag (e.g. `profilesHasTrialColumns`).
2. Gate any code that reads/writes the new column behind that flag so the feature degrades gracefully (no crash) instead of silently writing bad data when the column is missing.
3. Create a `migrations/0NN_description.sql` file and tell the user to run it manually in the Supabase SQL editor — this mirrors the existing `migrations/012_quiz_sections.sql` precedent in this repo for the same limitation.
