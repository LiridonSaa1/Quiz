/**
 * Server-side fan-out helper for in-app notifications (the bell in the header).
 *
 * Each high-level platform event (enrollment, quiz submission, certificate issue,
 * payment) is dispatched here. The helper:
 *   1. Checks the corresponding admin toggle in settings.notifications (gated)
 *   2. Resolves recipients per the role matrix below
 *   3. Inserts one row per recipient into the `notifications` table
 *
 * Recipient matrix (per the product spec):
 *   newEnrollment      → student (themselves), course teacher, all admins
 *   quizSubmitted      → student (themselves), quiz teacher,   all admins
 *   certificateIssued  → student (themselves), issuing teacher, all admins
 *   paymentReceived    → student (themselves),                  all admins
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type NotifyEventKey =
  | "newEnrollment"
  | "quizSubmitted"
  | "certificateIssued"
  | "paymentReceived";

export interface NotifyContext {
  studentId: string;
  studentName?: string;
  teacherId?: string;
  courseId?: string;
  courseTitle?: string;
  quizId?: string;
  quizTitle?: string;
  attemptId?: string;
  score?: number;
  totalPoints?: number;
  passed?: boolean;
  certificateId?: string;
  certificateNumber?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
}

type Role = "student" | "teacher" | "admin";

const RECIPIENTS: Record<NotifyEventKey, Record<Role, boolean>> = {
  newEnrollment:     { student: true, teacher: true,  admin: true },
  quizSubmitted:     { student: true, teacher: true,  admin: true },
  certificateIssued: { student: true, teacher: true,  admin: true },
  paymentReceived:   { student: true, teacher: false, admin: true },
};

/** Maps an event to the existing notifications.type enum. */
const TYPE_MAP: Record<NotifyEventKey, string> = {
  newEnrollment: "course",
  quizSubmitted: "quiz",
  certificateIssued: "success",
  paymentReceived: "success",
};

/** Maps the admin "Email Notifications" toggle key to our event key. */
export const SETTINGS_KEY: Record<NotifyEventKey, string> = {
  newEnrollment: "email_new_enrollment",
  quizSubmitted: "email_quiz_submitted",
  certificateIssued: "email_certificate_issued",
  paymentReceived: "email_payment_received",
};

const ACTION_URLS: Record<NotifyEventKey, Record<Role, string>> = {
  newEnrollment: {
    student: "/student/courses",
    teacher: "/teacher/courses",
    admin:   "/admin/courses",
  },
  quizSubmitted: {
    student: "/student/results",
    teacher: "/teacher/quizzes",
    admin:   "/admin/quizzes",
  },
  certificateIssued: {
    student: "/student/certificates",
    teacher: "/teacher/certificates",
    admin:   "/admin/certificates",
  },
  paymentReceived: {
    student: "/student/payments",
    teacher: "/teacher/payments",
    admin:   "/admin/payments",
  },
};

function formatMoney(amount?: number, currency?: string): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  const cur = (currency || "").toUpperCase().trim();
  try {
    if (cur && /^[A-Z]{3}$/.test(cur)) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(amount);
    }
  } catch { /* fallthrough */ }
  return `${cur ? cur + " " : ""}${amount.toFixed(2)}`;
}

function renderContent(role: Role, event: NotifyEventKey, ctx: NotifyContext): { title: string; message: string } {
  const courseTitle = ctx.courseTitle || "a course";
  const quizTitle = ctx.quizTitle || "a quiz";
  const studentName = ctx.studentName || "A student";

  switch (event) {
    case "newEnrollment":
      if (role === "student") {
        return {
          title: "Enrollment confirmed",
          message: `You're now enrolled in "${courseTitle}". Start learning anytime from your courses page.`,
        };
      }
      if (role === "teacher") {
        return {
          title: "New course enrollment",
          message: `${studentName} just enrolled in "${courseTitle}".`,
        };
      }
      return {
        title: "New course enrollment",
        message: `${studentName} enrolled in "${courseTitle}".`,
      };

    case "quizSubmitted": {
      const scoreText =
        typeof ctx.score === "number" && typeof ctx.totalPoints === "number"
          ? ` — scored ${ctx.score}/${ctx.totalPoints}${ctx.passed ? " (passed)" : ""}`
          : "";
      if (role === "student") {
        return {
          title: "Quiz submitted",
          message: `Your attempt at "${quizTitle}"${scoreText} was recorded.`,
        };
      }
      if (role === "teacher") {
        return {
          title: "New quiz attempt",
          message: `${studentName} submitted "${quizTitle}"${scoreText}.`,
        };
      }
      return {
        title: "Quiz submitted",
        message: `${studentName} submitted "${quizTitle}"${scoreText}.`,
      };
    }

    case "certificateIssued": {
      const numberText = ctx.certificateNumber ? ` (#${ctx.certificateNumber})` : "";
      if (role === "student") {
        return {
          title: "Certificate issued",
          message: `Your certificate for "${courseTitle}"${numberText} is ready to view and download.`,
        };
      }
      if (role === "teacher") {
        return {
          title: "Certificate issued",
          message: `Certificate issued to ${studentName} for "${courseTitle}"${numberText}.`,
        };
      }
      return {
        title: "Certificate issued",
        message: `${studentName} received a certificate for "${courseTitle}"${numberText}.`,
      };
    }

    case "paymentReceived": {
      const moneyText = formatMoney(ctx.amount, ctx.currency);
      const amountText = moneyText ? ` of ${moneyText}` : "";
      if (role === "student") {
        return {
          title: "Payment received",
          message: `Your payment${amountText} was processed successfully. A receipt is available in your billing history.`,
        };
      }
      return {
        title: "Payment received",
        message: `Payment${amountText} from ${studentName} was processed successfully.`,
      };
    }
  }
}

export interface NotifyDeps {
  /**
   * Reads the admin's notifications toggle from `platform_config.settings.notifications[settingsKey]`.
   * Should default to `true` when the section doesn't exist yet (so events fire out of the box).
   */
  isEventEnabled: (settingsKey: string) => Promise<boolean>;
}

export async function notifyEvent(
  admin: SupabaseClient,
  deps: NotifyDeps,
  event: NotifyEventKey,
  ctx: NotifyContext,
): Promise<void> {
  try {
    const enabled = await deps.isEventEnabled(SETTINGS_KEY[event]);
    if (!enabled) return;

    const recipients = RECIPIENTS[event];
    const seen = new Set<string>();
    const rows: Array<Record<string, unknown>> = [];

    const push = (uid: string | undefined | null, role: Role) => {
      if (!uid) return;
      const id = String(uid);
      if (seen.has(id)) return;
      seen.add(id);
      const { title, message } = renderContent(role, event, ctx);
      rows.push({
        user_id: id,
        title,
        message,
        type: TYPE_MAP[event],
        action_url: ACTION_URLS[event][role],
        read: false,
      });
    };

    // Resolve the student's display name once (used by all recipient strings).
    if (!ctx.studentName && ctx.studentId) {
      try {
        const { data } = await admin
          .from("profiles")
          .select("display_name, email")
          .eq("id", ctx.studentId)
          .maybeSingle();
        if (data) {
          ctx.studentName = String(data.display_name || data.email || "A student");
        }
      } catch { /* best-effort */ }
    }

    if (recipients.student) push(ctx.studentId, "student");
    if (recipients.teacher) push(ctx.teacherId, "teacher");

    if (recipients.admin) {
      try {
        const { data: admins } = await admin
          .from("profiles")
          .select("id, status")
          .eq("role", "admin");
        const adminIds = (admins || [])
          .filter((a: any) => !a.status || String(a.status).toLowerCase() === "active")
          .map((a: any) => String(a.id))
          .filter(Boolean);
        for (const uid of adminIds) push(uid, "admin");
      } catch (adminErr: any) {
        console.warn(`[notify:${event}] failed to load admins:`, adminErr?.message || adminErr);
      }
    }

    if (rows.length === 0) return;

    const { error } = await admin.from("notifications").insert(rows);
    if (error) {
      console.warn(`[notify:${event}] insert failed:`, error.message);
    }
  } catch (err: any) {
    console.warn(`[notify:${event}] dispatch failed:`, err?.message || err);
  }
}
