---
name: Render deployment for QuizMaster
description: How to correctly deploy this full-stack Express+Vite app on Render (and why static serve breaks it)
---

# Render Deployment Pattern

## The Rule
Use `npm run start` → `node scripts/start-dev.mjs` as the start command on Render. Do NOT use `npx serve -s dist`.

**Why:** This app has a full Express backend (`/api/*` routes). `dist/` is gitignored and the Vite production build (`npm run build`) hits an OOM on free-tier Render. When `dist/` doesn't exist, `npx serve -s dist` falls back to serving the project root, which exposes `artifacts/mockup-sandbox/` — showing "Component Preview Server" instead of the real app.

## Correct Render Config
- **Build Command**: `npm install`
- **Start Command**: `npm run start` (compiles server.ts with esbuild, starts Express which serves API + frontend via Vite middleware — no separate Vite build needed)
- **Port**: Set `PORT=10000` env var on Render if needed; server reads `process.env.PORT` with fallback to 5000

## How to apply
Any time this project is deployed to Render or any Node platform: use the Express server approach, not a static file server. The Express server handles both API routes and frontend in a single process.
