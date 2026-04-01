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
  - `pages/admin/` — Admin pages: Courses, Teachers, Students, Modules, Lessons
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

## Running the App
- **Dev**: `npm run dev` — starts Express + Vite dev server on port 5000
- **Build**: `npm run build` — builds to `dist/`

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

## Notes
- Port 5000 is used for both frontend and backend (Express serves Vite middleware)
- Vite is configured with `allowedHosts: true` for Replit proxy compatibility
- The server listens on `0.0.0.0` to be accessible in the Replit environment
