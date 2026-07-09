# AI-Powered Educational Platform

## Overview
A multi-role educational platform for quiz management, course tracking, and result analysis. Supports Admin, Teacher, and Student roles with AI-powered features via Google Gemini.

## Architecture
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + React Router DOM 7
- **Backend**: Express (Node.js) integrated with Vite middleware
- **Database/Auth**: Supabase (PostgreSQL)
- **AI**: Google Gemini API (`@google/genai`)
- **Build Tool**: Vite 6
- **Package Manager**: npm

## Project Structure
- `server.ts` — Express server entry point (serves API routes + Vite frontend)
- `src/` — React frontend source
  - `App.tsx` — Main app with RBAC routing
  - `supabase.ts` — Supabase client
  - `types.ts` — Shared TypeScript types
  - `pages/admin/` — Admin pages: Courses, Teachers, Students, Modules, Lessons, Classes, Quizzes, Assignments, Attendance, Certificates
  - `pages/teacher/` — Teacher pages: Courses, Modules, Lessons, Quizzes, Students, Results
  - `pages/student/` — Student pages: Dashboard, Quiz Taking, Results, Profile
  - `components/` — Shared UI components (layouts, NotificationCenter)
- `vite.config.ts` — Vite configuration
- `index.html` — SPA entry template

## Implemented Features
- **Courses**: Full CRUD for admin and teacher, grid/list view
- **Modules**: Full CRUD for teacher (with modal form), read-only overview for admin. Linked to courses with order/status management.
- **Lessons**: Full CRUD for teacher (with modal form), read-only overview for admin. Types: Video/Text/Quiz. Supports duration, order, status, free preview toggle. Linked to course + module.
- **Quizzes**: Full builder with multiple question types (MC, T/F, short/long answer, file upload)
- **Students**: Teacher can manage enrolled students; Admin views all students
- **Results**: Teacher views quiz attempt results per student
- **Assignments**: Admin creates and manages assignments (type, due date, max score, status) linked to courses/classes
- **Attendance**: Admin marks and tracks student attendance (present/absent/late/excused) per class and date
- **Certificates**: Admin issues certificates to students with grade, score, cert number, and a visual preview modal
- **Live Sessions (Teacher)**: Full virtual classroom system at `/teacher/live-sessions` — dashboard with stats, tabs (Upcoming/Live/Past), New Session modal with participant inviter (by student search or class), start/end sessions, navigate to room. Room at `/teacher/live-sessions/:id/room` — full-screen Jitsi iframe, collapsible sidebar with Participants + Chat tabs, control bar (mic, camera, screen share, record, raise hand, reactions, end session), recording via MediaRecorder API uploaded to Supabase Storage
- **Live Sessions (Student)**: Student join page at `/student/live-sessions/:id` — session info, Join button, Jitsi room embed, raise hand, emoji reactions, group chat via Supabase Realtime, attendance logging, recording playback for ended sessions

## Known Schema Constraints
The live Supabase DB has schema differences from what some pages expect. All affected pages now handle these gracefully (empty state, no crash):
- `attempts` table does not exist → all attempt/result pages show empty state
- `quizzes.teacher_id` column does not exist → quiz count shows 0, quiz lists show empty
- `courses.teacher_id` column does not exist → course lists show empty for teacher filter
- `courses.student_ids` column does not exist → enrolled courses show empty for students
- `Notification` type now includes `title: string` and `read: boolean` fields

## Navigation Hierarchy (Teacher)
- `/teacher/modules` → **Course Cards** — shows all teacher courses as cards with module/lesson counts; clicking "View Modules" navigates to `/teacher/courses/:courseId/modules`
- `/teacher/courses/:courseId/modules` → **Module Manager** — full CRUD for modules within that course; includes Back to Courses button
- `/teacher/lessons` → **Module Cards** — shows all modules as cards; clicking "View Lessons" navigates to `/teacher/modules/:moduleId` (ModuleDetail with lessons)
- `/teacher/lessons/:id/content` → **Lesson Content Manager** — now includes collapsible **Headway Resources panel** (level selector + links to Test Builder, Audio, Video, Grammar) and a new **Link** content type for embedding external URLs
- `/teacher/headway-tests` → **Headway Tests & Resources** — browse and open OUP Test Builder, audio, video, grammar and vocabulary for all 6 Headway levels (Beginner → Advanced); embedded Test Builder iframe + unit quick-links
- `/teacher/lessons` → **OUP Headway Library tab** — tab switcher between "My Lessons" and "OUP Headway Library". The library shows all 6 levels with a unit accordion; each unit lists Grammar, Vocabulary, Everyday English, Audio, Video, and Test Builder lesson cards. Clicking a card opens a detail modal with OUP exercise link, audio/video download buttons, and a "Save as Quiz" flow for Test Builder entries (course picker → saves quiz + questions to Supabase).

## Running the App
- **Production (workflow)**: `npm start` — serves built `dist/` via Express on port 5000. **This is what the workflow runs.**
- **Build**: `npm run build` — builds frontend to `dist/` (required before starting). After any frontend code change: run `npm run build`, then restart the workflow.
- **Dev mode note**: `npm run dev` (Vite middleware with HMR) must NOT be used in Replit. Vite's HMR WebSocket on port 24678 cannot connect through Replit's proxy, causing the page to get stuck on reload whenever any file in the workspace changes. Always use `npm start` after a build.

## Required Environment Variables
Set these in Replit Secrets:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (for admin operations)
- `GEMINI_API_KEY` — Google Gemini API key

## Key API Routes
- `GET /api/health` — Health check with Supabase status
- `GET /api/admin/seed` — Seeds initial super admin account
- `POST /api/admin/create-teacher` — Creates a teacher account
- `POST /api/admin/create-student` — Creates a student account
- `GET /api/teacher/live-sessions` — List sessions (filter by host_id)
- `POST /api/teacher/live-sessions` — Create session with participant invites
- `PATCH /api/teacher/live-sessions/:id` — Update session (triggers notifications on live)
- `DELETE /api/teacher/live-sessions/:id` — Delete session
- `GET /api/teacher/live-sessions/:id/participants` — Get session participants
- `POST /api/teacher/live-sessions/:id/invite` — Invite additional participants
- `PATCH /api/teacher/live-sessions/:id/participants/:userId` — Update participant status
- `POST /api/teacher/live-sessions/:id/join` — Log attendance join
- `POST /api/teacher/live-sessions/:id/leave` — Log attendance leave
- `GET /api/teacher/live-sessions/:id/chat` — Get chat messages
- `POST /api/teacher/live-sessions/:id/chat` — Send chat message
- `POST /api/teacher/live-sessions/:id/upload-url` — Get signed URL for recording upload
- `GET /api/teacher/users/search` — Search users for invitation
- `GET /api/teacher/classes` — List classes for session creation

## New Database Tables
- `session_participants` — Tracks invited/joined participants per session with mute/pin status
- `session_chat_messages` — Group chat messages per session with Realtime support
- `session_reactions` — Emoji reactions per session
- `live_sessions.class_id` — Added column linking sessions to classes

## Performance & Scalability Fixes (May 2026)
- **Live quiz badge state** persisted to Supabase `platform_config` (section `rq_badge:{userId}`), restored on server start
- **Frontend polling** reduced from 2–3s → 20s fallback; primary delivery via Supabase Realtime broadcast
- **Realtime subscription** in `RealtimeQuizHost` now covers lobby view as well as active quiz
- **Admin student/teacher routes** paginated — query params `page` (0-indexed) + `limit` (10–200, default 100); response includes `total`, `page`, `limit`
- **Admin analytics cache** TTL increased from 20s → 5 min (300s)
- **Admin reports/students + reports/roles** now have 3-minute route-level cache
- **Chat messages** denormalized: `sender_display_name` stored in the row; `getAuthUser` now returns `displayName` from profile cache
- **`migrations/010_chat_sender_denorm.sql`** — adds `sender_display_name`, `sender_avatar_url` to `session_chat_messages`
- **`migrations/011_extra_indexes.sql`** — adds indexes on `quiz_attempts(student_id,status)`, `notifications(user_id,read)`, `profiles(status)`, `profiles(role,status)`, `profiles(created_at)`, `courses(status)`, `classes(status)`

## Assignment Email Notifications
When a teacher (or admin, via the same `/api/teacher/assignments` endpoint) creates an assignment linked to a class, every active student in that class is automatically emailed (Albanian template) about the new assignment — title, course, due date, max score, description, and a login link.

- **Trigger**: `POST /api/teacher/assignments` — fire-and-forget call to `notifyClassOfNewAssignment()` in `server.ts` right after the assignment row is inserted (both the `poolQuery` and `supabaseAdmin` fallback paths). Never blocks or fails the API response — errors are only logged.
- **Recipient resolution**: `resolveClassStudentProfiles()` reuses the same fallback chain as `GET /api/teacher/classes/students`: `classes.student_ids` → `courses.student_ids` (via `class.course_id`) → students linked to the teacher via `profiles.teacher_id`. Only active students with an email are emailed.
- **Requires** `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` configured (`isEmailConfigured()`); silently skipped if email isn't set up, or if the assignment has no `class_id`.
- **Template**: `renderAssignmentEmail()` in `src/lib/email.ts`.

## Notes
- Port 5000 is used for both frontend and backend (Express serves Vite middleware)
- Vite is configured with `allowedHosts: true` for Replit proxy compatibility
- The server listens on `0.0.0.0` to be accessible in the Replit environment

## Render Deployment
This is a full-stack app (Express backend + React frontend). Do NOT deploy as a static site.

**Correct Render settings:**
- **Environment**: Node
- **Build Command**: `npm install` (skip `npm run build` — Vite production build OOMs on free tier)
- **Start Command**: `npm run start` (runs `node scripts/start-dev.mjs` — uses esbuild to compile the server, then Express serves the API + frontend via Vite middleware)
- **Environment Variables**: Add all secrets from Replit Secrets panel (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, SESSION_SECRET). Set `PORT=10000` if Render requires a specific port.

**Why NOT `npx serve -s dist`:** `dist/` is gitignored and the Vite build OOMs on Render's free tier, so `dist/` is never created. `serve` without a valid directory falls back to serving the project root, which exposes the `artifacts/mockup-sandbox/` Component Preview Server page instead of the real app.

**Why the Express server works:** `scripts/start-dev.mjs` uses esbuild to bundle `server.ts` (very fast, low memory), then runs the Express server which handles all `/api/*` routes AND serves the React frontend via Vite middleware — no separate build step needed.

## Student Free Trial Period
Teachers/admins can grant a new student N free trial days when creating their account. While the trial is active, the student can log in without needing a monthly payment on record; once it expires, login is blocked exactly like the existing unpaid-month gate (until a payment or a new trial is set).

- **Create**: `AddStudentModal.tsx` has an optional "Free trial days" field → sent as `trialDays` to `POST /api/admin/create-student`, which computes `trial_ends_at = now + trialDays` on the `profiles` row.
- **Edit**: `PATCH /api/admin/students/:id` and `PATCH /api/teacher/students/:id` accept `trialDays` to set/replace/clear (`0` or omitted-with-falsy clears) the trial.
- **Login gate**: `GET /api/auth/check-student-payment` returns `trialActive: true` (skips payment check) while `trial_ends_at` is in the future; once past, `trialExpired: true` is returned and `Login.tsx` shows an Albanian "trial ended" message instead of the generic unpaid message.
- **Required manual DB step**: this Supabase project has no `exec_sql` RPC function, so the server cannot auto-add columns to `profiles` (same limitation as the existing `quiz_sections` migration). Run `migrations/015_student_trial.sql` once in the Supabase SQL editor to add `trial_days` / `trial_ends_at` to `profiles`. Until that's done, the server logs `[migration] Student trial feature will be disabled until migrations/015_student_trial.sql is run manually` at startup and the trial UI/logic is a no-op (create-student ignores `trialDays`, check-student-payment falls back to the normal monthly-payment gate).

## In-App Notification System
Server-side fan-out helper `src/lib/notifyEvents.ts` (`notifyEvent()`, invoked via `dispatchNotifyEvent()` in `server.ts`) is the single source of truth for bell notifications. Each `NotifyEventKey` defines: which roles receive it (`RECIPIENTS`), the `notifications.type` badge, the per-role admin toggle key (`SETTINGS_KEY`, under Settings → Notifications), the `action_url` per role, and Albanian/English copy per role (`renderContent`). Adding a new notification type means: add the key, its 4 config entries, a `renderContent` case, then call `dispatchNotifyEvent(key, ctx)` (fire-and-forget, wrapped in try/catch) at the triggering mutation.

**Already wired triggers:** new student/teacher created, student transferred between teachers, course enrollment, quiz submitted, assignment submitted/graded/created, certificate issued, payment received/reminder, maintenance mode toggle, weekly admin digest, discussion question asked (notifies course teacher), badge/achievement awarded (notifies student).

**Known gaps (not wired — would need new detection logic, not just a new endpoint hook):** payment failure, payment-due-soon reminders beyond the existing monthly reminder, attendance-missing / consecutive-absence alerts, schedule/class-time changes, teacher-did-not-mark-attendance nudges, grade-deadline reminders, parent-meeting/event reminders, document-request flows, generic admin↔teacher messaging, system error/backup alerts. These all require either a cron/scheduled job or a feature that doesn't exist yet in the app.

## Two-Factor Authentication (2FA)
Per-role 2FA toggle in `/admin/settings` → Security tab. Admin can enable separately for Student / Teacher / Admin.

**Email delivery — Brevo (manual integration, NOT via Replit connectors)**
- The user dismissed the Resend/SendGrid integration flow and chose to provide a Brevo API key directly.
- Required secrets: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (must be verified in Brevo's Senders panel), `BREVO_SENDER_NAME`.
- Helper: `src/lib/email.ts` exports `isEmailConfigured()`, `sendEmail()`, `renderVerificationEmail()`. Uses `https://api.brevo.com/v3/smtp/email`.
- If secrets are missing, server falls back to returning `devCode` in the challenge response (only in non-prod) so the flow stays testable.

**Endpoints (in `server.ts` ~line 1614):**
- `GET /api/auth/2fa/required` — returns whether 2FA is required for the caller's role
- `POST /api/auth/2fa/challenge` — generates a 6-digit code (5-min TTL), emails it via Brevo, falls back to `devCode` in dev
- `POST /api/auth/2fa/verify` — validates the code (max 5 attempts)
- In-memory `twoFactorCodes` Map — codes don't survive a server restart (acceptable for now)

**Client flow:**
- `src/pages/Login.tsx` — after password sign-in, calls `/2fa/challenge`; if `required`, swaps the form for a 6-digit code panel (emerald accent). On verify success, sets `sessionStorage.quizmaster_2fa_ok = '1'` and navigates.
- `src/App.tsx` — `fetchProfile` re-checks `/2fa/required` on every load; if required and the session flag is missing, signs the user out (prevents refresh-bypass).
