---
name: Notification event system
description: How the in-app bell-notification fan-out works and how to extend it with new event types.
---

`src/lib/notifyEvents.ts` exports `notifyEvent()`, called from `server.ts` via a local `dispatchNotifyEvent(event, ctx)` wrapper. This is the single source of truth for all "bell" notifications (admin/teacher/student) — do not hand-roll a separate insert helper.

Each `NotifyEventKey` needs four config entries plus a `renderContent` case:
- `RECIPIENTS` — hard ceiling on which roles can ever receive it (admin settings toggles can only narrow this, never expand it)
- `TYPE_MAP` — maps to the `notifications.type` enum (info/success/warning/error/course/quiz)
- `SETTINGS_KEY` — key under `platform_config.settings.notifications` for the per-role admin toggle
- `ACTION_URLS` — per-role deep link
- `renderContent(role, event, ctx)` — Albanian and/or English copy per role

**Why:** before this was discovered, it would have been easy to duplicate a redundant notify-insert helper. The existing system already covers ~13 event types (new student/teacher, enrollment, quiz/assignment submitted+graded, certificate issued, payment received/reminder, maintenance alert, weekly digest, student transfer, discussion question asked, badge awarded).

**How to apply:** to add a new trigger, extend the four maps + renderContent switch in `notifyEvents.ts`, then call `void dispatchNotifyEvent('newKey', { ...ctx })` (fire-and-forget, wrapped in try/catch, non-blocking) at the point in `server.ts` where the underlying action happens.

**Gaps that need a scheduled job, not just an endpoint hook** (as of 2026-07-09): payment failure, payment-due-soon beyond the existing monthly reminder, attendance-missing/consecutive-absence alerts, schedule/class-time changes, teacher-didn't-mark-attendance nudges, grade-deadline reminders, parent-meeting/school-event reminders, document-request flows, generic admin↔teacher messaging, system error/backup alerts.
