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

## Running the App
- **Production (default)**: `npm start` — serves built `dist/` via Express on port 5000. This is what the workflow runs.
- **Build**: `npm run build` — builds frontend to `dist/` (required before starting in production mode)
- **Dev mode note**: `npm run dev` (Vite middleware) is NOT used in Replit because Vite's HMR WebSocket server on port 24678 conflicts with Replit's proxy routing, causing 502/426 errors externally. After code changes, run `npm run build` then restart the workflow.

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

## Notes
- Port 5000 is used for both frontend and backend (Express serves Vite middleware)
- Vite is configured with `allowedHosts: true` for Replit proxy compatibility
- The server listens on `0.0.0.0` to be accessible in the Replit environment

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
