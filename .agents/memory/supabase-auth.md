---
name: Supabase Auth kept intentionally
description: This project uses Supabase Auth instead of Replit Auth — an explicit decision.
---

This is a multi-role LMS (Admin/Teacher/Student). Supabase Auth was chosen intentionally and must NOT be replaced with Replit Auth.

**Why:** The app has complex role-based routing, profile tables linked to Supabase user IDs, and RLS policies. Migrating to Replit Auth would break all of this.

**How to apply:** Ignore the migration-guardrails rule about replacing Supabase Auth. The auth flow lives in `src/pages/Login.tsx` and the Supabase client is in `src/supabase.ts`.
