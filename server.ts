import "dotenv/config";
import { isMissingCoursesStudentIdsError } from "./src/lib/schemaErrors.js";
import { canAccessTeacherCourses, isAdmin, isAdminSeedAllowed } from "./src/lib/routeAuth.js";
import { generateFixSuggestion } from "./src/lib/ai/generateFixSuggestion.js";
import { isEmailConfigured, sendEmail, renderVerificationEmail } from "./src/lib/email.js";
import { notifyEvent, type NotifyContext, type NotifyEventKey } from "./src/lib/notifyEvents.js";
import express, { Request, Response } from "express";
import { appendFile, mkdir, readFile as readFileFs, writeFile } from "fs/promises";
import http from "http";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
let poolPromise: Promise<any> | null = null;
const stripProfilesJoin = (sql: string): string =>
  sql.replace(
    /LEFT JOIN profiles (\w+) ON \1\.id = \w+\.\w+/gi,
    (_match, alias) =>
      `LEFT JOIN (SELECT NULL::uuid AS id, NULL::text AS display_name, NULL::text AS email) ${alias} ON false`,
  );

const getPool = async () => {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;

  if (!poolPromise) {
    poolPromise = Promise.resolve().then(() => {
      const pgModule = require("pg");
      const Pool = pgModule?.Pool ?? pgModule?.default?.Pool;
      if (!Pool) {
        throw new Error("pg Pool export not available");
      }
      return new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
      });
    });
  }

  try {
    return await poolPromise;
  } catch (error) {
    poolPromise = null;
    throw error;
  }
};

const poolQuery = async (sql: string, params?: any[]) => {
  const pool = await getPool();
  if (!pool) throw new Error('Database pool not available');
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO public');
    try {
      return await client.query(sql, params);
    } catch (e: any) {
      // If the profiles table doesn't exist in the direct DB connection,
      // retry with dummy null-returning subqueries instead of the JOIN.
      if (
        typeof e?.message === 'string' &&
        e.message.includes('relation') &&
        e.message.includes('profiles')
      ) {
        const safeSql = stripProfilesJoin(sql);
        if (safeSql !== sql) return await client.query(safeSql, params);
      }
      throw e;
    }
  } finally {
    client.release();
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim() || "";
const TELEGRAM_ALERT_FIX_URL = process.env.TELEGRAM_ALERT_FIX_URL?.trim() || "";

/** Never use Telegram sendMessage as open-link URL (empty text breaks; wrong UX). Use callback or your app URL. */
function resolveTelegramFixButtonUrl(): string {
  const raw = TELEGRAM_ALERT_FIX_URL;
  if (!raw) return "";
  if (/api\.telegram\.org\/bot[^/]+\/sendMessage/i.test(raw)) {
    console.warn(
      "[alerts] TELEGRAM_ALERT_FIX_URL points to api.telegram.org sendMessage; ignoring. " +
        "Remove it in Vercel env, or set it to your app URL (e.g. https://YOUR.vercel.app/api/fix-now).",
    );
    return "";
  }
  return raw;
}
const TELEGRAM_ALERT_COOLDOWN_MS = Math.max(
  Number(process.env.TELEGRAM_ALERT_COOLDOWN_MS || 120000),
  10000,
);
const TELEGRAM_RETRY_INTERVAL_MS = Math.max(
  Number(process.env.TELEGRAM_RETRY_INTERVAL_MS || 30000),
  5000,
);
const ERROR_ALERTS_ENABLED = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
const TELEGRAM_ALERTS_SETTINGS_CACHE_TTL_MS = 15000;
let telegramAlertsSettingsCache: { value: boolean; expiresAt: number } = {
  value: true,
  expiresAt: 0,
};
const recentErrorAlerts = new Map<string, number>();
const recentLoggedErrors = new Map<
  string,
  {
    message: string;
    stack?: string;
    file?: string;
    line?: number;
    url?: string;
    userAgent?: string;
    source?: string;
    userId?: string;
    timestamp: string;
    layer: ErrorLayer;
  }
>();
type ErrorLayer = "FRONTEND" | "BACKEND" | "DATABASE";

type StoredErrorContext = {
  layer: ErrorLayer;
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  url?: string;
  userAgent?: string;
  source?: string;
  userId?: string;
  timestamp: string;
};
type TelegramPayload = {
  chat_id: string;
  text: string;
  parse_mode?: string;
  disable_web_page_preview?: boolean;
  reply_markup?: any;
};
type QueuedTelegramAlert = {
  type: "error" | "text";
  payload: TelegramPayload;
  fingerprint?: string;
  createdAt: string;
  attempts: number;
};
const TELEGRAM_QUEUE_PATH = path.join(process.cwd(), "logs", "telegram-failed.log");
let flushingTelegramQueue = false;

function escapeTelegramText(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function serializeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ""}`.trim();
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function sendTelegramErrorAlert(params: {
  title: string;
  summary: string;
  fingerprintSource: string;
  details?: string;
  fixUrl?: string;
  /** When set, must match the fingerprint used for persist (same hash as fingerprintSource). */
  fingerprint?: string;
}): Promise<string | null> {
  const fingerprint = params.fingerprint ?? stableHash(params.fingerprintSource);
  if (!(await isTelegramErrorAlertsEnabled())) {
    console.warn(
      "[alerts] Telegram error alerts disabled (env or admin settings); skip send. fingerprint=",
      fingerprint,
    );
    return fingerprint;
  }
  const now = Date.now();
  const lastSentAt = recentErrorAlerts.get(fingerprint) || 0;
  if (now - lastSentAt < TELEGRAM_ALERT_COOLDOWN_MS) return fingerprint;
  recentErrorAlerts.set(fingerprint, now);

  const escapedTitle = escapeTelegramText(params.title);
  const escapedSummary = escapeTelegramText(params.summary);
  const escapedDetails = params.details
    ? `\n\n${escapeTelegramText(params.details.slice(0, 1200))}`
    : "";
  const body =
    `🚨 *${escapedTitle}*\n` +
    `${escapedSummary}\n` +
    `fingerprint: \`${escapeTelegramText(fingerprint)}\`${escapedDetails}`;

  const buttonUrlBase = params.fixUrl || resolveTelegramFixButtonUrl();
  const buttonUrl = buttonUrlBase
    ? `${buttonUrlBase}${buttonUrlBase.includes("?") ? "&" : "?"}fingerprint=${encodeURIComponent(fingerprint)}`
    : "";
  const payload: TelegramPayload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: body,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    ...(!buttonUrl
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: "Fix now", callback_data: `fix:${fingerprint}` }]],
          },
        }
      : buttonUrl
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: "Fix now", url: buttonUrl }]],
          },
        }
      : {}),
  };

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const responseText = await response.text();
      console.warn("[alerts] Telegram send failed:", response.status, responseText);
      void enqueueFailedTelegramAlert({
        type: "error",
        payload,
        fingerprint,
        createdAt: new Date().toISOString(),
        attempts: 1,
      });
    }
  } catch (error) {
    console.warn("[alerts] Telegram request failed:", error);
    console.warn("[alerts] Run GET /api/telegram/diagnostics on this server to verify Telegram connectivity.");
    void enqueueFailedTelegramAlert({
      type: "error",
      payload,
      fingerprint,
      createdAt: new Date().toISOString(),
      attempts: 1,
    });
  }
  return fingerprint;
}

async function isTelegramErrorAlertsEnabled(): Promise<boolean> {
  if (!ERROR_ALERTS_ENABLED) return false;

  const now = Date.now();
  if (now < telegramAlertsSettingsCache.expiresAt) {
    return telegramAlertsSettingsCache.value;
  }

  let enabled = true;
  try {
    const settingsRes = await supabaseAdmin
      .from("platform_config")
      .select("value")
      .eq("section", "settings")
      .maybeSingle();
    if (!settingsRes.error) {
      const settings = settingsRes.data?.value as any;
      if (typeof settings?.advanced?.telegramErrorAlerts === "boolean") {
        enabled = settings.advanced.telegramErrorAlerts;
      }
    }
  } catch {
    // keep fail-open behavior so critical alerts still send if config lookup fails
  }

  telegramAlertsSettingsCache = {
    value: enabled,
    expiresAt: now + TELEGRAM_ALERTS_SETTINGS_CACHE_TTL_MS,
  };
  return enabled;
}

async function sendTelegramTextMessage(text: string): Promise<void> {
  if (!ERROR_ALERTS_ENABLED) return;
  const payload: TelegramPayload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text.slice(0, 3900),
    disable_web_page_preview: true,
  };
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const responseText = await response.text();
      console.warn("[alerts] Telegram text send failed:", response.status, responseText);
      void enqueueFailedTelegramAlert({
        type: "text",
        payload,
        createdAt: new Date().toISOString(),
        attempts: 1,
      });
    }
  } catch (error) {
    console.warn("[alerts] Telegram text request failed:", error);
    void enqueueFailedTelegramAlert({
      type: "text",
      payload,
      createdAt: new Date().toISOString(),
      attempts: 1,
    });
  }
}

async function callTelegramApi(method: string, payload: Record<string, unknown>): Promise<void> {
  if (!ERROR_ALERTS_ENABLED) return;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const txt = await response.text();
      console.warn(`[alerts] Telegram API ${method} failed:`, response.status, txt);
    }
  } catch (error) {
    console.warn(`[alerts] Telegram API ${method} request failed:`, error);
  }
}

async function ensureTelegramQueueDir(): Promise<void> {
  const dir = path.dirname(TELEGRAM_QUEUE_PATH);
  await mkdir(dir, { recursive: true });
}

async function enqueueFailedTelegramAlert(item: QueuedTelegramAlert): Promise<void> {
  try {
    await ensureTelegramQueueDir();
    await appendFile(TELEGRAM_QUEUE_PATH, `${JSON.stringify(item)}\n`, "utf8");
  } catch (error) {
    console.warn("[alerts] Failed to enqueue telegram alert:", error);
  }
}

async function readQueuedTelegramAlerts(): Promise<QueuedTelegramAlert[]> {
  try {
    const raw = await readFileFs(TELEGRAM_QUEUE_PATH, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as QueuedTelegramAlert;
        } catch {
          return null;
        }
      })
      .filter((x): x is QueuedTelegramAlert => Boolean(x));
  } catch {
    return [];
  }
}

async function overwriteQueuedTelegramAlerts(items: QueuedTelegramAlert[]): Promise<void> {
  await ensureTelegramQueueDir();
  const content = items.length ? `${items.map((x) => JSON.stringify(x)).join("\n")}\n` : "";
  await writeFile(TELEGRAM_QUEUE_PATH, content, "utf8");
}

async function sendTelegramPayload(payload: TelegramPayload): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const responseText = await response.text();
      console.warn("[alerts] Retry telegram send failed:", response.status, responseText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[alerts] Retry telegram request failed:", error);
    return false;
  }
}

async function flushFailedTelegramAlerts(): Promise<void> {
  if (!ERROR_ALERTS_ENABLED || flushingTelegramQueue) return;
  flushingTelegramQueue = true;
  try {
    const queued = await readQueuedTelegramAlerts();
    if (!queued.length) return;
    const pending: QueuedTelegramAlert[] = [];
    for (const item of queued) {
      const sent = await sendTelegramPayload(item.payload);
      if (!sent) pending.push({ ...item, attempts: item.attempts + 1 });
    }
    await overwriteQueuedTelegramAlerts(pending);
    if (pending.length < queued.length) {
      console.log(
        `[alerts] Flushed ${queued.length - pending.length}/${queued.length} queued Telegram alert(s).`,
      );
    }
  } catch (error) {
    console.warn("[alerts] Failed to flush queued Telegram alerts:", error);
  } finally {
    flushingTelegramQueue = false;
  }
}

function detectErrorLayer(input: string, fallback: ErrorLayer = "BACKEND"): ErrorLayer {
  const hay = String(input || "").toLowerCase();
  if (
    /sql|postgres|postgrest|supabase|migration|relation|column|table|constraint|42p|pgrst|query/i.test(
      hay,
    )
  ) {
    return "DATABASE";
  }
  return fallback;
}

/** 5xx response logger: persists fingerprint for Fix button without duplicating full logSystemError() when routes already log. */
async function recordApi5xxAlertForFix(
  req: Request,
  statusCode: number,
  durationMs: number,
  requestId: string,
): Promise<void> {
  const layer: ErrorLayer = "BACKEND";
  const message = `${req.method} ${req.path} -> ${statusCode} in ${durationMs}ms`;
  const fingerprintSource = `${layer}:${message}::${req.originalUrl}`;
  const fingerprint = stableHash(fingerprintSource);
  const ctx: StoredErrorContext = {
    layer,
    message,
    stack: `request_id=${requestId}`,
    url: req.originalUrl,
    userAgent: req.headers["user-agent"] as string | undefined,
    source: "middleware.api-5xx",
    timestamp: new Date().toISOString(),
  };
  recentLoggedErrors.set(fingerprint, ctx);
  void persistErrorAlertContext(fingerprint, ctx);
  await sendTelegramErrorAlert({
    title: "API 5xx Error",
    summary: message,
    fingerprintSource,
    fingerprint,
    details: `request_id=${requestId}`,
  });
}

async function logSystemError(
  event: {
    layer?: ErrorLayer;
    message: string;
    stack?: string;
    file?: string;
    line?: number;
    url?: string;
    userAgent?: string;
    source?: string;
    userId?: string;
    timestamp?: string;
  },
  /** When set, marks the response so the 5xx middleware skips a duplicate "API 5xx" Telegram alert. */
  res?: Response,
) {
  const timestamp = event.timestamp || new Date().toISOString();
  const layer = event.layer || detectErrorLayer(`${event.message}\n${event.stack || ""}`);
  const fingerprintSource = `${layer}:${event.message}:${event.file || ""}:${event.line || ""}:${event.url || ""}`;
  const fingerprint = stableHash(fingerprintSource);
  if (res) {
    (res.locals as any).errorAlertEmitted = true;
  }
  const details = [
    `Layer: ${layer}`,
    `Message: ${event.message}`,
    `File: ${event.file || "N/A"}`,
    `Line: ${Number.isFinite(Number(event.line)) ? String(event.line) : "N/A"}`,
    `URL: ${event.url || "N/A"}`,
    `Time: ${timestamp}`,
    `UserAgent: ${event.userAgent || "N/A"}`,
    `User: ${event.userId || "N/A"}`,
    event.stack ? `Stack: ${event.stack}` : "Stack: N/A",
    event.source ? `Source: ${event.source}` : "",
    `LikelyReason: ${guessLikelyReason(layer, event.message, event.stack)}`,
  ]
    .filter(Boolean)
    .join("\n");

  console.error(`[alerts] logSystemError fingerprint=${fingerprint} layer=${layer} source=${event.source || "n/a"}`);
  console.error(`[${layer}] ${event.message}`);
  if (event.stack) console.error(event.stack);

  const ctx: StoredErrorContext = {
    layer,
    message: event.message,
    stack: event.stack,
    file: event.file,
    line: event.line,
    url: event.url,
    userAgent: event.userAgent,
    source: event.source,
    userId: event.userId,
    timestamp,
  };
  recentLoggedErrors.set(fingerprint, ctx);
  void persistErrorAlertContext(fingerprint, ctx);
  if (recentLoggedErrors.size > 300) {
    const first = recentLoggedErrors.keys().next().value;
    if (first) recentLoggedErrors.delete(first);
  }

  await sendTelegramErrorAlert({
    title: "ERROR ALERT",
    summary: `Layer: ${layer} | ${event.message}`,
    fingerprintSource,
    fingerprint,
    details: details.slice(0, 2000),
  });
}

function guessLikelyReason(layer: ErrorLayer, message: string, stack?: string): string {
  const hay = `${message}\n${stack || ""}`.toLowerCase();
  if (layer === "DATABASE") {
    if (hay.includes("column")) return "Schema mismatch (missing/renamed column) or stale schema cache.";
    if (hay.includes("relation") || hay.includes("table"))
      return "Missing table/relation or migration not applied.";
    return "Query or migration issue in database layer.";
  }
  if (hay.includes("unauthorized") || hay.includes("forbidden"))
    return "Authentication or role/permission mismatch.";
  if (hay.includes("network") || hay.includes("timeout"))
    return "Network connectivity issue or downstream service timeout.";
  if (hay.includes("undefined") || hay.includes("null"))
    return "Unexpected null/undefined value in runtime path.";
  return "Unhandled edge-case in current execution path.";
}

let supabaseAdminInstance: any = null;

const getSupabaseAdmin = () => {
  if (!supabaseAdminInstance) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in environment variables.');
    }

    supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseAdminInstance;
};

// Proxy for supabaseAdmin
const supabaseAdmin = new Proxy({} as any, {
  get: (target, prop, receiver) => {
    const instance = getSupabaseAdmin();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

async function persistErrorAlertContext(fingerprint: string, ctx: StoredErrorContext): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("error_alert_context").upsert(
      {
        fingerprint,
        payload: ctx,
      },
      { onConflict: "fingerprint" },
    );
    if (error) {
      console.warn(
        "[alerts] persist error_alert_context failed:",
        error.message,
        error.code || "",
        "| Run migrations (error_alert_context) in Supabase if table is missing.",
      );
    } else {
      console.log("[alerts] persisted error_alert_context fingerprint=", fingerprint);
    }
  } catch (e: any) {
    console.warn("[alerts] persist error_alert_context exception:", e?.message || e);
  }
}

async function loadErrorAlertContext(fingerprint: string): Promise<StoredErrorContext | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("error_alert_context")
      .select("payload")
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (error) {
      console.warn("[alerts] load error_alert_context:", error.message, error.code || "");
      return null;
    }
    if (!data?.payload) return null;
    return data.payload as StoredErrorContext;
  } catch (e: any) {
    console.warn("[alerts] load error_alert_context exception:", e?.message || e);
    return null;
  }
}

function buildFallbackErrorContext(fingerprint: string): StoredErrorContext {
  const ts = new Date().toISOString();
  return {
    layer: "BACKEND",
    message: [
      `No stored error context for fingerprint ${fingerprint}.`,
      "Typical causes: table public.error_alert_context missing (run migration), Supabase write failed,",
      "or this alert was sent from a code path before persistence was enabled (e.g. API 5xx middleware only).",
      "An AI analysis will still run using this limited information.",
    ].join(" "),
    stack: undefined,
    file: undefined,
    line: undefined,
    url: undefined,
    userAgent: undefined,
    source: "fix.fallback-missing-context",
    userId: undefined,
    timestamp: ts,
  };
}

type FixSuggestionPayload = Awaited<ReturnType<typeof generateFixSuggestion>>;

async function triggerFixSuggestionForFingerprint(
  fingerprint: string,
  opts?: { messageHint?: string },
): Promise<{ ctx: StoredErrorContext; suggestion: FixSuggestionPayload; usedFallback: boolean }> {
  const fp = String(fingerprint || "").trim();
  if (!fp) {
    const err: any = new Error("fingerprint is required");
    err.status = 400;
    throw err;
  }
  let ctx =
    (await loadErrorAlertContext(fp)) || recentLoggedErrors.get(fp) || null;
  let usedFallback = false;
  if (!ctx) {
    console.warn("[alerts] triggerFix: no row/memory for fingerprint=", fp, "- using fallback context");
    ctx = buildFallbackErrorContext(fp);
    if (opts?.messageHint) {
      ctx = {
        ...ctx,
        message: `${ctx.message}\nExtra hint: ${opts.messageHint}`,
      };
    }
    usedFallback = true;
    void persistErrorAlertContext(fp, ctx);
  }
  const suggestion = await generateFixSuggestion({
    message: ctx.message,
    stack: ctx.stack,
    fileName: ctx.file,
    lineNumber: ctx.line,
    currentUrl: ctx.url,
    rawLog: `Layer=${ctx.layer}; Source=${ctx.source || "n/a"}; UserAgent=${ctx.userAgent || "n/a"}; User=${ctx.userId || "n/a"}; usedFallback=${usedFallback}`,
  });
  await sendTelegramTextMessage(
    [
      `🤖 FIX RESULT`,
      `Fingerprint: ${fp}`,
      `Layer: ${ctx.layer}`,
      usedFallback ? "(limited context — see analysis)" : "",
      "",
      suggestion.formatted,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return { ctx, suggestion, usedFallback };
}

function escapeHtmlBasic(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addDaysToYmd(ymd: string, days: number): string {
  const parts = ymd.split("-").map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const [y, m, day] = parts;
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function paymentStatusToInvoiceRowStatus(
  paymentStatus: string,
): "paid" | "pending" | "draft" {
  if (paymentStatus === "completed") return "paid";
  if (paymentStatus === "pending") return "pending";
  return "draft";
}

function resolveInvoiceDisplayStatus(
  dbStatus: string,
  dueYmd: string,
): "paid" | "pending" | "overdue" | "draft" {
  if (dbStatus === "draft") return "draft";
  if (dbStatus === "paid") return "paid";
  const due = new Date(`${dueYmd}T12:00:00Z`);
  const today = new Date();
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const tDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dueDay < tDay) return "overdue";
  return "pending";
}

async function nextInvoiceNumberForPaymentDate(paymentDateYmd: string): Promise<string> {
  const yStr = (paymentDateYmd || "").slice(0, 4);
  const year =
    yStr.length === 4 && /^\d{4}$/.test(yStr) ? parseInt(yStr, 10) : new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  const re = new RegExp(`^INV-${year}-(\\d+)$`);
  for (const row of data || []) {
    const m = String((row as any).invoice_number || "").match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

type CreateAppOptions = {
  includeFrontend?: boolean;
  httpServer?: http.Server;
};

export async function createApp(options: CreateAppOptions = {}) {
  const includeFrontend = options.includeFrontend ?? true;
  const app = express();

  app.use(express.json());
  app.post("/api/log-error", async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as any;
      const message = String(body.message || "").trim();
      if (!message) return res.status(400).json({ error: "message is required" });

      const inferredLayer = body.layer === "FRONTEND" || body.layer === "BACKEND" || body.layer === "DATABASE"
        ? (body.layer as ErrorLayer)
        : detectErrorLayer(`${message}\n${String(body.stack || "")}`, "FRONTEND");

      void logSystemError(
        {
          layer: inferredLayer,
          message,
          stack: body.stack ? String(body.stack) : undefined,
          file: body.file ? String(body.file) : undefined,
          line:
            Number.isFinite(Number(body.line)) && Number(body.line) > 0
              ? Number(body.line)
              : undefined,
          url: body.currentUrl ? String(body.currentUrl) : undefined,
          userAgent: body.userAgent ? String(body.userAgent) : req.headers["user-agent"],
          source: body.source ? String(body.source) : "api.log-error",
          userId: body.userId ? String(body.userId) : undefined,
          timestamp: body.timestamp ? String(body.timestamp) : undefined,
        },
        res,
      );

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to log error" });
    }
  });

  app.get("/api/test-telegram", async (req: Request, res: Response) => {
    try {
      const message =
        typeof req.query.message === "string" && req.query.message.trim()
          ? req.query.message.trim()
          : "Manual Telegram pipeline test";
      await logSystemError(
        {
          layer: "BACKEND",
          message,
          stack: "Triggered by /api/test-telegram",
          url: req.originalUrl,
          userAgent: req.headers["user-agent"] as string | undefined,
          source: "api.test-telegram",
        },
        res,
      );
      return res.json({ success: true, message: "Test alert sent to Telegram (if configured)." });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to send test Telegram alert" });
    }
  });

  app.get("/api/telegram/diagnostics", async (_req: Request, res: Response) => {
    if (!ERROR_ALERTS_ENABLED) {
      return res.json({
        ok: false,
        configured: false,
        telegramReachable: false,
        hint: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env, then restart the server.",
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/getMe`,
        { signal: controller.signal },
      );
      const json = (await response.json().catch(() => ({}))) as any;
      clearTimeout(timer);
      const reachable = response.ok && json?.ok === true;
      return res.json({
        ok: reachable,
        configured: true,
        telegramReachable: reachable,
        botUsername: json?.result?.username,
        hint: reachable
          ? "This machine can reach Telegram; alerts should work if the server process is the one sending them."
          : `Telegram API responded but not OK: ${JSON.stringify(json).slice(0, 300)}`,
      });
    } catch (error: any) {
      clearTimeout(timer);
      return res.json({
        ok: false,
        configured: true,
        telegramReachable: false,
        error: String(error?.message || error),
        hint:
          "Cannot reach https://api.telegram.org from this PC (firewall, ISP block, or corporate network). " +
          "Error alerts will not arrive in Telegram until outbound HTTPS to Telegram works (try another network or VPN). " +
          "Queued alerts are still written to logs/telegram-failed.log when sends fail.",
      });
    }
  });

  app.get("/api/fix-now", async (req: Request, res: Response) => {
    try {
      const fingerprint = String(req.query.fingerprint || "").trim();
      const hint =
        typeof req.query.hint === "string" && req.query.hint.trim() ? req.query.hint.trim() : undefined;
      const { ctx, suggestion, usedFallback } = await triggerFixSuggestionForFingerprint(fingerprint, {
        messageHint: hint,
      });
      return res.json({
        success: true,
        fingerprint,
        note: "Fix suggestion generated and sent to Telegram.",
        result: suggestion,
        layer: ctx.layer,
        usedFallback,
      });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ error: error?.message || "Bad request" });
      }
      return res.status(500).json({ error: error?.message || "Failed to generate fix suggestion" });
    }
  });

  /**
   * Public HTTPS URL for Telegram "Fix now" link button (TELEGRAM_ALERT_FIX_URL).
   * Example: https://YOUR_DOMAIN.vercel.app/api/alerts/trigger-fix
   * Telegram appends ?fingerprint=...
   */
  app.get("/api/alerts/trigger-fix", async (req: Request, res: Response) => {
    try {
      const fingerprint = String(req.query.fingerprint || "").trim();
      const hint =
        typeof req.query.hint === "string" && req.query.hint.trim() ? req.query.hint.trim() : undefined;
      const wantHtml =
        String(req.query.format || "").toLowerCase() === "html" ||
        String(req.get("accept") || "").includes("text/html");
      const { ctx, suggestion, usedFallback } = await triggerFixSuggestionForFingerprint(fingerprint, {
        messageHint: hint,
      });
      if (wantHtml) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Fix triggered</title></head><body style="font-family:system-ui;padding:24px;max-width:640px">` +
            `<h1>Fix suggestion sent</h1>` +
            `<p>A detailed AI analysis was sent to your Telegram chat.</p>` +
            `<p><strong>Layer:</strong> ${escapeHtmlBasic(ctx.layer)}</p>` +
            `<p><strong>Fingerprint:</strong> <code>${escapeHtmlBasic(fingerprint)}</code></p>` +
            `<p style="color:#555;font-size:14px">You can close this tab.</p>` +
            `</body></html>`,
        );
      }
      return res.json({
        success: true,
        fingerprint,
        note: "Fix suggestion generated and sent to Telegram.",
        result: suggestion,
        layer: ctx.layer,
        usedFallback,
      });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ error: error?.message || "Bad request" });
      }
      return res.status(500).json({ error: error?.message || "Failed to generate fix suggestion" });
    }
  });

  const parseTelegramErrorMessage = (text: string) => {
    const normalized = String(text || "");
    const getLine = (label: string) => {
      const re = new RegExp(`^${label}:\\s*(.*)$`, "im");
      const m = normalized.match(re);
      return m?.[1]?.trim() || "";
    };
    const currentUrl = getLine("URL");
    const message = getLine("Message") || normalized || "Unknown telegram error payload";
    const stack = getLine("Stack");
    return { message, stack: stack === "N/A" ? "" : stack, currentUrl };
  };

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const body = req.body || {};
      const message = String(body.message || "").trim();
      const role = String(body.role || "student").trim();
      const page = String(body.page || "Platform").trim();
      const path = String(body.path || "").trim();
      const history: { role: string; content: string }[] = Array.isArray(body.history) ? body.history : [];

      if (!message) return res.status(400).json({ error: "message is required" });

      const apiKey = (process.env.GEMINI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ error: "AI not configured. Add GEMINI_API_KEY to Secrets." });

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });

      const roleContext: Record<string, string> = {
        teacher: `You are an expert teaching assistant for an online educational platform. The teacher is currently on the "${page}" page (path: ${path || "unknown"}).
You help teachers:
- Create and manage quizzes, courses, modules, and lessons
- Start live quiz sessions and live video sessions
- Track student progress and view results
- Manage assignments, attendance, and certificates
- Use platform features effectively
When giving step-by-step instructions, number each step clearly. Be concise but thorough. Use a warm, professional tone.`,
        student: `You are a friendly learning assistant for an online educational platform. The student is currently on the "${page}" page (path: ${path || "unknown"}).
You help students:
- Take quizzes and understand their scores
- Join live classes and live quiz sessions
- Track their learning progress
- Submit assignments and view certificates
- Navigate and use the platform effectively
When giving instructions, number each step clearly. Be encouraging and supportive. Use simple, clear language.`,
        admin: `You are an expert platform administrator assistant for an online educational platform. The admin is currently on the "${page}" page (path: ${path || "unknown"}).
You help admins:
- Manage students, teachers, courses, and classes
- Configure platform settings, branding, and features
- Understand analytics and reports
- Set up roles, permissions, and security (including 2FA)
- Handle payments, invoices, and certificates
When giving instructions, number each step clearly. Be precise and technical when needed.`,
      };

      const systemPrompt = roleContext[role] || roleContext.student;

      const historyText = history
        .slice(-8)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const fullPrompt = `${systemPrompt}

${historyText ? `Conversation so far:\n${historyText}\n\n` : ""}User: ${message}
Assistant:`;

      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: fullPrompt,
      });

      const reply = (result.text || "").trim() || "I'm sorry, I couldn't generate a response. Please try again.";
      res.json({ success: true, reply });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to process chat message" });
    }
  });

  app.post("/api/ai/fix-suggestion", async (req, res) => {
    try {
      const body = req.body || {};
      const message = String(body.message || "").trim();
      if (!message) return res.status(400).json({ error: "message is required" });

      const result = await generateFixSuggestion({
        message,
        stack: body.stack ? String(body.stack) : undefined,
        fileName: body.fileName ? String(body.fileName) : undefined,
        lineNumber:
          Number.isFinite(Number(body.lineNumber)) && Number(body.lineNumber) > 0
            ? Number(body.lineNumber)
            : undefined,
        currentUrl: body.currentUrl ? String(body.currentUrl) : undefined,
        rawLog: body.rawLog ? String(body.rawLog) : undefined,
      });

      res.json({ success: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to generate fix suggestion" });
    }
  });

  app.post("/api/telegram/error-webhook", async (req, res) => {
    try {
      const callbackQuery = req.body?.callback_query;
      if (callbackQuery) {
        const callbackId = String(callbackQuery.id || "");
        const callbackData = String(callbackQuery.data || "");
        const chatId =
          callbackQuery?.message?.chat?.id !== undefined
            ? String(callbackQuery.message.chat.id)
            : TELEGRAM_CHAT_ID;
        if (callbackId) {
          await callTelegramApi("answerCallbackQuery", {
            callback_query_id: callbackId,
            text: "Fix started",
            show_alert: false,
          });
        }
        if (callbackData.startsWith("fix:")) {
          const fingerprint = callbackData.slice(4).trim();
          await callTelegramApi("sendMessage", {
            chat_id: chatId,
            text: `AI fix analysis started for ${fingerprint}. You will get another message when finished.`,
          });
          void (async () => {
            try {
              const { suggestion, usedFallback } = await triggerFixSuggestionForFingerprint(fingerprint);
              await callTelegramApi("sendMessage", {
                chat_id: chatId,
                text: [
                  `Fix analysis completed for ${fingerprint}.`,
                  usedFallback ? "(used limited context — ensure error_alert_context migration on Supabase)" : "",
                  "",
                  suggestion.formatted,
                ]
                  .filter(Boolean)
                  .join("\n")
                  .slice(0, 3900),
              });
            } catch (err: any) {
              console.error("[alerts] callback fix pipeline failed:", err);
              await callTelegramApi("sendMessage", {
                chat_id: chatId,
                text: `Fix pipeline failed for ${fingerprint}: ${String(err?.message || err).slice(0, 500)}`,
              });
            }
          })();
          return res.json({ success: true, handled: "callback.fix-started", fingerprint });
        }
        return res.json({ success: true, handled: "callback.ignored" });
      }

      const text = String(req.body?.message?.text || req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "telegram message text is required" });
      const parsed = parseTelegramErrorMessage(text);

      const result = await generateFixSuggestion({
        message: parsed.message,
        stack: parsed.stack || undefined,
        currentUrl: parsed.currentUrl || undefined,
        rawLog: text,
      });

      res.json({ success: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to process telegram webhook" });
    }
  });
  app.use((req: Request, res: Response, next) => {
    const startedAt = Date.now();
    const requestId = stableHash(
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${req.method}-${req.path}`,
    );

    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      if (res.statusCode < 500 || !req.path.startsWith("/api")) return;
      if ((res.locals as any).errorAlertEmitted) {
        console.log(
          "[alerts] skip middleware API 5xx Telegram (route already called logSystemError)",
          req.method,
          req.path,
        );
        return;
      }
      const durationMs = Date.now() - startedAt;
      void recordApi5xxAlertForFix(req, res.statusCode, durationMs, requestId);
    });
    next();
  });

  // Allow SPA + API on different origins (Authorization header + preflight).
  app.use((req: Request, res: Response, next) => {
    // Allow camera/mic/screen-capture in iframes (needed for Jitsi embeds)
    res.setHeader("Permissions-Policy", "camera=*, microphone=*, display-capture=*, fullscreen=*");
    const origin = req.headers.origin as string | undefined;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Requested-With",
      );
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  const normalizeRole = (r: string | undefined | null) =>
    String(r || "student").toLowerCase().trim();

  const getAuthUser = async (req: Request): Promise<{ userId: string; role: string } | null> => {
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return null;
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[getAuthUser] auth.getUser failed:", error?.message || "no user");
      }
      return null;
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { userId: user.id, role: normalizeRole(profile?.role) };
  };

  const assertSessionHost = async (req: Request, res: Response, sessionId: string): Promise<string | null> => {
    const caller = await getAuthUser(req);
    if (!caller) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    if (caller.role !== "teacher" && caller.role !== "admin") {
      res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      return null;
    }
    if (caller.role === "admin") return caller.userId;
    const { data: session } = await supabaseAdmin.from("live_sessions").select("host_id").eq("id", sessionId).single();
    if (!session || session.host_id !== caller.userId) {
      res.status(403).json({ error: "Forbidden: you are not the host of this session" });
      return null;
    }
    return caller.userId;
  };

  const assertAuthenticated = async (
    req: Request,
    res: Response,
  ): Promise<{ userId: string; role: string } | null> => {
    const caller = await getAuthUser(req);
    if (!caller) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return caller;
  };

  app.get("/favicon.ico", (_req, res) => {
    res.redirect(302, "/favicon.svg");
  });

  const COURSE_MUTABLE_KEYS = new Set([
    "teacher_id",
    "title",
    "description",
    "short_description",
    "language",
    "level",
    "price",
    "is_free",
    "status",
    "thumbnail",
    "student_ids",
    "total_lessons",
    "total_students",
    "certificate_enabled",
    "gradient",
    "category",
    "updated_at",
  ]);

  const sanitizeCoursePayload = (payload: any) => {
    const sanitized: Record<string, any> = {};
    if (!payload || typeof payload !== "object") return sanitized;

    Object.keys(payload).forEach((key) => {
      if (COURSE_MUTABLE_KEYS.has(key) && payload[key] !== undefined) {
        sanitized[key] = payload[key];
      }
    });

    return sanitized;
  };

  const normalizeTeacherId = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";

  const toFiniteNumber = (value: unknown, fallback = 0) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const ADMIN_PROFILE_MUTABLE_KEYS = new Set([
    "display_name",
    "email",
    "phone",
    "location",
    "website",
    "bio",
    "avatar_url",
    "title",
    "department",
    "twitter",
    "linkedin",
    "github",
  ]);

  const sanitizeAdminProfilePayload = (payload: any) => {
    const out: Record<string, any> = {};
    if (!payload || typeof payload !== "object") return out;
    Object.keys(payload).forEach((key) => {
      if (ADMIN_PROFILE_MUTABLE_KEYS.has(key)) out[key] = payload[key];
    });
    return out;
  };

  const saveAdminProfileWithFallback = async (userId: string, payload: Record<string, any>) => {
    const fullUpdate = await supabaseAdmin.from("profiles").update(payload).eq("id", userId);
    if (!fullUpdate.error) return;
    if (!isRecoverableSchemaColumnError(fullUpdate.error)) throw fullUpdate.error;

    const midPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) =>
        ["display_name", "email", "phone", "location", "website", "bio", "avatar_url"].includes(key),
      ),
    );
    if (Object.keys(midPayload).length) {
      const midUpdate = await supabaseAdmin.from("profiles").update(midPayload).eq("id", userId);
      if (!midUpdate.error) return;
      if (!isRecoverableSchemaColumnError(midUpdate.error)) throw midUpdate.error;
    }

    const minPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => ["display_name", "email", "avatar_url"].includes(key)),
    );
    if (!Object.keys(minPayload).length) throw fullUpdate.error;
    const minUpdate = await supabaseAdmin.from("profiles").update(minPayload).eq("id", userId);
    if (minUpdate.error) throw minUpdate.error;
  };

  const toAttemptPercent = (scoreValue: unknown, totalPointsValue: unknown) => {
    const score = toFiniteNumber(scoreValue, 0);
    const totalPoints = toFiniteNumber(totalPointsValue, 0);
    if (totalPoints > 0) return clamp(Math.round((score / totalPoints) * 100), 0, 100);
    if (score >= 0 && score <= 1) return clamp(Math.round(score * 100), 0, 100);
    return clamp(Math.round(score), 0, 100);
  };

  const isAttemptsTableMissing = (error: any) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return (
      (error?.code === "PGRST205" && haystack.includes("public.attempts")) ||
      (error?.code === "42P01" && haystack.includes("attempts")) ||
      haystack.includes("could not find the table 'public.attempts'") ||
      (haystack.includes("public.attempts") && haystack.includes("schema cache")) ||
      (haystack.includes("perhaps you meant") && haystack.includes("quiz_attempts"))
    );
  };

  const isSessionParticipantsTableMissing = (error: any) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return (
      (error?.code === "PGRST205" && haystack.includes("public.session_participants")) ||
      (error?.code === "42P01" && haystack.includes("session_participants")) ||
      haystack.includes("could not find the table 'public.session_participants'")
    );
  };

  const isSessionChatTableMissing = (error: any) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return (
      (error?.code === "PGRST205" && haystack.includes("session_chat_messages")) ||
      (error?.code === "42P01" && haystack.includes("session_chat_messages")) ||
      haystack.includes("could not find the table 'public.session_chat_messages'")
    );
  };

  const isSessionReactionsTableMissing = (error: any) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return (
      (error?.code === "PGRST205" && haystack.includes("session_reactions")) ||
      (error?.code === "42P01" && haystack.includes("session_reactions")) ||
      haystack.includes("could not find the table 'public.session_reactions'")
    );
  };

  const isClassesTableMissing = (error: any) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return (
      (error?.code === "PGRST205" && haystack.includes("public.classes")) ||
      (error?.code === "42P01" && haystack.includes("classes")) ||
      haystack.includes("could not find the table 'public.classes'")
    );
  };

  const normalizeAttempts = (rows: any[], passingScoreByQuiz: Record<string, number> = {}) => {
    return (rows || []).map((row: any) => {
      const rawScore = toFiniteNumber(row?.score, 0);
      const totalPointsRaw = toFiniteNumber(row?.total_points, 0);
      const totalPoints = totalPointsRaw > 0 ? totalPointsRaw : 100;
      const scorePercent = toAttemptPercent(rawScore, totalPointsRaw);
      const score = totalPointsRaw > 0 ? rawScore : Math.round((scorePercent / 100) * totalPoints);
      const quizId = row?.quiz_id ? String(row.quiz_id) : "";
      const passingScore = passingScoreByQuiz[quizId] ?? 50;
      const passed = typeof row?.passed === "boolean" ? row.passed : scorePercent >= passingScore;
      return {
        ...row,
        id: row?.id ? String(row.id) : "",
        quiz_id: quizId,
        student_id: row?.student_id ? String(row.student_id) : "",
        score,
        total_points: totalPoints,
        score_percent: scorePercent,
        passed,
        status: row?.status || ((row?.completed_at || row?.created_at) ? "completed" : "in_progress"),
        started_at: row?.started_at || row?.created_at || null,
        completed_at: row?.completed_at || row?.created_at || row?.started_at || null,
        created_at: row?.created_at || row?.completed_at || row?.started_at || null,
      };
    });
  };

  const isAnyTableMissingError = (error: any) => {
    if (!error) return false;
    if (error.code === "PGRST205" || error.code === "42P01") return true;
    const hay = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    return (
      hay.includes("does not exist") ||
      hay.includes("schema cache") ||
      hay.includes("could not find the table") ||
      hay.includes("relation") && hay.includes("does not exist")
    );
  };

  const fetchAllAttemptRows = async () => {
    const modern = await supabaseAdmin.from("quiz_attempts").select("*");
    if (!modern.error) return modern.data || [];
    if (!isAttemptsTableMissing(modern.error) && !isAnyTableMissingError(modern.error)) throw modern.error;

    const legacy = await supabaseAdmin.from("attempts").select("*");
    if (!legacy.error) return legacy.data || [];
    // Both quiz_attempts and attempts tables are absent — return empty gracefully
    if (isAnyTableMissingError(legacy.error)) return [];
    throw legacy.error;
  };

  /** Missing-column errors from Postgres/PostgREST; retry with a narrower select. */
  const isRecoverableSchemaColumnError = (error: any) => {
    if (!error) return false;
    if (error.code === "42703" || error.code === 42703) return true;
    if (error.code === "PGRST204") return true;
    const hay = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    if (hay.includes("does not exist") && hay.includes("column")) return true;
    if (hay.includes("schema cache") && hay.includes("column")) return true;
    return hay.includes("could not find") && hay.includes("column");
  };

  /** Older DBs may omit columns referenced in the select list. */
  const fetchCertificatesSelectWithFallback = async (selects: string[]): Promise<any[]> => {
    for (const sel of selects) {
      const res = await supabaseAdmin.from("certificates").select(sel as any);
      if (!res.error) return res.data || [];
      if (!isRecoverableSchemaColumnError(res.error)) throw res.error;
    }
    return [];
  };

  /** Analytics needs quiz counts only; avoid depending on `quizzes.published`. */
  const loadQuizzesRowsForAnalytics = async (): Promise<any[]> => {
    const selects = [
      "id, title, created_at",
      "id, created_at",
      "id",
      "*",
    ];
    for (const sel of selects) {
      const res = await supabaseAdmin.from("quizzes").select(sel as any);
      if (!res.error) return res.data || [];
      if (!isRecoverableSchemaColumnError(res.error)) throw res.error;
    }
    return [];
  };

  const loadCertificateRowsForReports = async (): Promise<
    Array<{ student_id: string | null; course_id: string | null; status: string }>
  > => {
    const rows = await fetchCertificatesSelectWithFallback([
      "student_id, course_id, status",
      "student_id, course_id",
      "student_id, status",
      "course_id, status",
      "student_id",
      "course_id",
      "*",
    ]);
    return rows.map((c: any) => ({
      student_id: c.student_id != null ? String(c.student_id) : null,
      course_id: c.course_id != null ? String(c.course_id) : null,
      status: c.status != null && String(c.status) !== "" ? String(c.status) : "issued",
    }));
  };

  const getTeacherIdCandidates = async (teacherId: string) => {
    const candidates = new Set<string>();
    if (teacherId) candidates.add(teacherId);

    const { data: teacherRows, error: teacherLookupError } = await supabaseAdmin
      .from("teachers")
      .select("id, user_id")
      .or(`id.eq.${teacherId},user_id.eq.${teacherId}`)
      .limit(20);

    if (teacherLookupError) throw teacherLookupError;

    (teacherRows || []).forEach((row: any) => {
      if (row?.id) candidates.add(String(row.id));
      if (row?.user_id) candidates.add(String(row.user_id));
    });

    return [...candidates];
  };

  const missingQuizzesTeacherIdColumn = (error: any) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    const low = hay.toLowerCase();
    if (error?.code === "PGRST204" && low.includes("teacher_id")) return true;
    if (/quizzes\.?teacher_id/i.test(hay) && /does not exist|42703|undefined column/i.test(hay)) return true;
    return false;
  };

  const missingQuizzesPublishedColumn = (error: any) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    const low = hay.toLowerCase();
    if (error?.code === "PGRST204" && low.includes("published")) return true;
    if (/published/i.test(hay) && /schema cache|could not find|does not exist|42703|undefined column/i.test(low)) {
      return true;
    }
    return false;
  };

  const missingQuizzesSettingsColumn = (error: any) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    const low = hay.toLowerCase();
    if (!low.includes("settings") || !/quiz/i.test(low)) return false;
    if (error?.code === "PGRST204" || error?.code === "42703") return true;
    if (/schema cache|could not find|does not exist|undefined column|column/i.test(low)) return true;
    return false;
  };

  /** Service-role insert with the same column fallbacks as the client {@link insertCompatibleQuiz}. */
  const insertCompatibleQuizAdmin = async (
    basePayload: Record<string, unknown>,
    sessionUserId: string,
  ): Promise<{ data: { id: string } | null; error: unknown }> => {
    let payload: Record<string, unknown> = { ...basePayload };
    if (payload.teacher_id === undefined || payload.teacher_id === null) {
      payload.teacher_id = sessionUserId;
    }
    for (let i = 0; i < 12; i++) {
      const res = await supabaseAdmin.from("quizzes").insert(payload).select("id").single();
      if (!res.error && res.data?.id) {
        return { data: { id: String(res.data.id) }, error: null };
      }
      const err = res.error;
      if (!err) {
        return { data: null, error: new Error("Quiz insert returned no id") };
      }
      if (missingQuizzesSettingsColumn(err) && "settings" in payload) {
        const { settings: _s, ...rest } = payload;
        void _s;
        payload = rest;
        continue;
      }
      if (missingQuizzesPublishedColumn(err) && "published" in payload) {
        const { published: _p, ...rest } = payload;
        void _p;
        payload = rest;
        continue;
      }
      if (missingQuizzesTeacherIdColumn(err) && "teacher_id" in payload) {
        const { teacher_id: _tid, ...rest } = payload;
        void _tid;
        payload = rest;
        continue;
      }
      if ("settings" in payload && /settings/i.test(String((err as { message?: string })?.message || ""))) {
        const { settings: _s, ...rest } = payload;
        void _s;
        payload = rest;
        continue;
      }
      return { data: null, error: err };
    }
    return { data: null, error: new Error("Quiz insert: max compatibility retries") };
  };

  const loadTeacherQuizzesForScopedIds = async (scopedIds: string[], sessionUserId: string) => {
    const sortRows = (rows: any[]) => {
      rows.sort((a: any, b: any) => {
        const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      return rows;
    };

    const tryByCourseIds = async () => {
      const { data: crs, error: ce } = await supabaseAdmin
        .from("courses")
        .select("id")
        .in("teacher_id", scopedIds);
      if (ce) throw ce;
      const courseIds = (crs || []).map((c: any) => c?.id).filter(Boolean);
      if (courseIds.length === 0) return [];
      let q2 = await supabaseAdmin
        .from("quizzes")
        .select("*")
        .in("course_id", courseIds)
        .order("created_at", { ascending: false });
      if (q2.error) {
        q2 = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
      }
      if (q2.error) throw q2.error;
      return sortRows(q2.data || []);
    };

    let { data, error } = await supabaseAdmin
      .from("quizzes")
      .select("*")
      .in("teacher_id", scopedIds)
      .order("created_at", { ascending: false });

    if (error && missingQuizzesTeacherIdColumn(error)) {
      return tryByCourseIds();
    }
    if (error) {
      const retry = await supabaseAdmin.from("quizzes").select("*").in("teacher_id", scopedIds);
      if (retry.error && missingQuizzesTeacherIdColumn(retry.error)) {
        return tryByCourseIds();
      }
      if (retry.error) throw error;
      data = retry.data;
      error = null;
    }
    if (error) {
      const eqRes = await supabaseAdmin.from("quizzes").select("*").eq("teacher_id", sessionUserId);
      if (eqRes.error && missingQuizzesTeacherIdColumn(eqRes.error)) {
        return tryByCourseIds();
      }
      if (eqRes.error) throw error;
      data = eqRes.data;
      error = null;
    }
    if (error) throw error;
    return sortRows(data || []);
  };

  const CONFIG_SECTIONS = new Set(["settings", "branding", "domain", "roles"]);

  const getConfigSection = async (section: string) => {
    const res = await supabaseAdmin
      .from("platform_config")
      .select("section, value, updated_at")
      .eq("section", section)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data?.value ?? null;
  };

  const upsertConfigSection = async (section: string, value: unknown) => {
    const res = await supabaseAdmin
      .from("platform_config")
      .upsert({ section, value, updated_at: new Date().toISOString() }, { onConflict: "section" })
      .select("section, value, updated_at")
      .single();
    if (res.error) throw res.error;
    return res.data;
  };

  const isPlatformConfigMissing = (error: any) => {
    const hay = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return error?.code === "42P01" || (error?.code === "PGRST205" && hay.includes("platform_config"));
  };

  /**
   * Reads `platform_config.settings.notifications[settingsKey]` to decide whether
   * an event-driven notification should fire. Defaults to `true` when no settings
   * row exists yet so events fan out on a fresh install.
   */
  const isNotificationEnabled = async (settingsKey: string): Promise<boolean> => {
    try {
      const settings: any = await getConfigSection("settings");
      const notifs = settings?.notifications;
      if (!notifs || typeof notifs !== "object") return true;
      const v = notifs[settingsKey];
      return v === undefined ? true : Boolean(v);
    } catch {
      return false;
    }
  };

  const dispatchNotifyEvent = async (event: NotifyEventKey, ctx: NotifyContext): Promise<void> => {
    await notifyEvent(supabaseAdmin, { isEventEnabled: isNotificationEnabled }, event, ctx);
  };

  // ── Weekly summary report ─────────────────────────────────────────────
  // Computes a 7-day digest and fires `weeklyReport` to all admins. It is
  // gated by the same `weekly_report` toggle in admin → notifications and
  // self-throttles via the most recent stored notification.
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const safeCountSince = async (table: string, column: string, sinceIso: string): Promise<number | undefined> => {
    try {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .gte(column, sinceIso);
      if (error) return undefined;
      return typeof count === "number" ? count : undefined;
    } catch {
      return undefined;
    }
  };

  const safeSumSince = async (
    table: string,
    column: string,
    sinceIso: string,
    sumField: string,
    currencyField?: string,
  ): Promise<{ count: number; sum: number; currency?: string } | undefined> => {
    try {
      const select = currencyField ? `${sumField}, ${currencyField}` : sumField;
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(select)
        .gte(column, sinceIso);
      if (error || !Array.isArray(data)) return undefined;
      let sum = 0;
      let currency: string | undefined;
      for (const row of data as any[]) {
        const v = Number(row?.[sumField]);
        if (Number.isFinite(v)) sum += v;
        if (!currency && currencyField && typeof row?.[currencyField] === "string") {
          currency = row[currencyField];
        }
      }
      return { count: data.length, sum, currency };
    } catch {
      return undefined;
    }
  };

  const runWeeklyReportIfDue = async (): Promise<void> => {
    try {
      const enabled = await isNotificationEnabled("weekly_report");
      if (!enabled) return;

      // Throttle: skip when a weekly report was already sent in the last 7 days.
      const { data: lastRows } = await supabaseAdmin
        .from("notifications")
        .select("created_at")
        .eq("title", "Weekly summary report")
        .order("created_at", { ascending: false })
        .limit(1);
      const lastAt = lastRows && lastRows[0]?.created_at ? Date.parse(lastRows[0].created_at) : 0;
      if (lastAt && Date.now() - lastAt < WEEK_MS) return;

      const sinceIso = new Date(Date.now() - WEEK_MS).toISOString();

      const [enrollments, quizAttempts, certificates, payments] = await Promise.all([
        safeCountSince("course_enrollments", "created_at", sinceIso),
        safeCountSince("attempts", "submitted_at", sinceIso),
        safeCountSince("certificates", "created_at", sinceIso),
        safeSumSince("payments", "created_at", sinceIso, "amount", "currency"),
      ]);

      await dispatchNotifyEvent("weeklyReport", {
        reportPeriodStart: sinceIso,
        reportPeriodEnd: new Date().toISOString(),
        reportTotals: {
          enrollments,
          quizAttempts,
          certificatesIssued: certificates,
          payments: payments?.count,
          revenue: payments?.sum,
          currency: payments?.currency,
        },
      });
    } catch (err: any) {
      console.warn("[notify:weeklyReport] check failed:", err?.message || err);
    }
  };

  // Run an initial check shortly after boot, then every 6 hours.
  setTimeout(() => { void runWeeklyReportIfDue(); }, 30_000);
  setInterval(() => { void runWeeklyReportIfDue(); }, 6 * 60 * 60 * 1000);

  const extractPublicFeatureFlags = (settingsValue: any) => {
    const features = settingsValue?.features || {};
    return {
      communityEnabled:
        typeof features.communityEnabled === "boolean" ? features.communityEnabled : true,
      liveSessionsEnabled:
        typeof features.liveSessionsEnabled === "boolean" ? features.liveSessionsEnabled : true,
      announcementsEnabled:
        typeof features.announcementsEnabled === "boolean" ? features.announcementsEnabled : true,
      paymentsEnabled:
        typeof features.paymentsEnabled === "boolean" ? features.paymentsEnabled : true,
    };
  };

  // API routes FIRST
  app.get("/api/health", async (req, res) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    let supabaseStatus = 'unknown';
    let supabaseError = null;

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const { error } = await supabaseAdmin.from('profiles').select('count').limit(1);
        if (error) {
          supabaseStatus = 'error';
          supabaseError = error.message;
        } else {
          supabaseStatus = 'connected';
        }
      } catch (err: any) {
        supabaseStatus = 'failed';
        supabaseError = err.message;
      }
    }

    res.json({ 
      status: "ok",
      config: {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
        urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 15) + '...' : null
      },
      supabase: {
        status: supabaseStatus,
        error: supabaseError
      }
    });
  });

  app.get("/api/platform/features", async (_req, res) => {
    try {
      const settings = await getConfigSection("settings");
      res.json({ success: true, features: extractPublicFeatureFlags(settings) });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        return res.json({
          success: true,
          features: extractPublicFeatureFlags(null),
        });
      }
      res.status(500).json({ error: e?.message || "Failed to load feature flags" });
    }
  });

  // Public branding payload — no auth required so every panel (admin, teacher,
  // student) and the login screen can render the same logo, colors, fonts and
  // copy that the admin configures at /admin/branding.
  app.get("/api/platform/branding", async (_req, res) => {
    const fallback = {
      success: true as const,
      logoUrl: null as string | null,
      faviconUrl: null as string | null,
      schoolName: "QuizMaster",
      colors: null as Record<string, string> | null,
      typography: null as Record<string, string> | null,
      copy: null as Record<string, string> | null,
      darkMode: false,
    };
    try {
      const [branding, settings] = await Promise.all([
        getConfigSection("branding").catch(() => null),
        getConfigSection("settings").catch(() => null),
      ]);
      const b: any = branding || {};
      const s: any = settings || {};
      const schoolName =
        (typeof s?.general?.school_name === "string" && s.general.school_name.trim()) ||
        (typeof b?.schoolName === "string" && b.schoolName.trim()) ||
        "QuizMaster";
      res.json({
        success: true,
        logoUrl: typeof b.logoUrl === "string" ? b.logoUrl : null,
        faviconUrl: typeof b.faviconUrl === "string" ? b.faviconUrl : null,
        schoolName,
        colors: b.colors && typeof b.colors === "object" ? b.colors : null,
        typography: b.typography && typeof b.typography === "object" ? b.typography : null,
        copy: b.copy && typeof b.copy === "object" ? b.copy : null,
        darkMode: Boolean(b.darkMode),
      });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) return res.json(fallback);
      res.status(500).json({ error: e?.message || "Failed to load branding" });
    }
  });

  app.get("/api/platform/runtime", async (_req, res) => {
    try {
      const settings = await getConfigSection("settings");
      const features = extractPublicFeatureFlags(settings);
      const maintenanceMode = Boolean(
        settings &&
        typeof settings === "object" &&
        settings.advanced &&
        typeof settings.advanced === "object" &&
        settings.advanced.maintenance
      );
      const schoolName =
        settings &&
        typeof settings === "object" &&
        settings.general &&
        typeof settings.general === "object" &&
        typeof settings.general.school_name === "string"
          ? settings.general.school_name
          : "QuizMaster";
      res.json({
        success: true,
        features,
        maintenanceMode,
        schoolName,
      });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        return res.json({
          success: true,
          features: extractPublicFeatureFlags(null),
          maintenanceMode: false,
          schoolName: "QuizMaster",
        });
      }
      res.status(500).json({ error: e?.message || "Failed to load platform runtime config" });
    }
  });

  // ─── Two-Factor Authentication ──────────────────────────────────────────
  const twoFactorCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();
  const TWOFA_TTL_MS = 5 * 60 * 1000;
  const TWOFA_MAX_ATTEMPTS = 5;

  // Fast in-memory verification cache.  { expiry, verifiedAt } lets the
  // /required endpoint compare verifiedAt against the JWT iat so that an old
  // verification from a previous login session is rejected on a fresh sign-in.
  const twoFaVerifiedUsers = new Map<string, { expiry: number; verifiedAt: number }>();
  const TWOFA_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  /** Extract the JWT iat claim (issued-at) in milliseconds from a Bearer token. */
  const jwtIatMs = (token: string): number => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return 0;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return ((payload.iat as number) || 0) * 1000;
    } catch { return 0; }
  };

  // 2FA has been removed from the platform — this always returns false.
  const isTwoFactorRequiredForRole = async (_role: string): Promise<boolean> => false;

  app.get("/api/auth/2fa/required", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });

      // If the role doesn't require 2FA at all, skip immediately.
      const required = await isTwoFactorRequiredForRole(caller.role);
      if (!required) return res.json({ success: true, required: false });

      // Extract the JWT iat so we can verify the 2FA was completed in THIS
      // session (not a previous one).  A fresh signInWithPassword creates a new
      // token with a new iat, so any twofa_verified_at that pre-dates iat means
      // the user must re-verify on this login.
      const bearerToken = (req.headers["authorization"] || "").replace(/^Bearer /, "");
      const sessionStartMs = jwtIatMs(bearerToken);

      // 1. Check the fast in-memory cache first (valid within this server process).
      const cached = twoFaVerifiedUsers.get(caller.userId);
      if (cached && cached.expiry > Date.now() && cached.verifiedAt >= sessionStartMs) {
        return res.json({ success: true, required: false });
      }
      // Stale or pre-session entry — evict it.
      if (cached !== undefined) twoFaVerifiedUsers.delete(caller.userId);

      // 2. Fall back to Supabase user metadata — survives server restarts /
      //    process recycling so a reload after a server restart doesn't log
      //    the user out.
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(caller.userId);
        const meta: any = authData?.user?.user_metadata || {};
        const verifiedAt: number =
          typeof meta.twofa_verified_at === "number" ? meta.twofa_verified_at : 0;
        if (
          verifiedAt &&
          verifiedAt >= sessionStartMs &&
          Date.now() - verifiedAt < TWOFA_SESSION_TTL_MS
        ) {
          // Repopulate the in-memory cache so the next request is fast.
          twoFaVerifiedUsers.set(caller.userId, { expiry: verifiedAt + TWOFA_SESSION_TTL_MS, verifiedAt });
          return res.json({ success: true, required: false });
        }
      } catch {
        // Non-critical — fall through to "required: true" below.
      }

      res.json({ success: true, required: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to check 2FA requirement" });
    }
  });

  app.post("/api/auth/2fa/challenge", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });

      const required = await isTwoFactorRequiredForRole(caller.role);
      if (!required) return res.json({ success: true, required: false });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      twoFactorCodes.set(caller.userId, {
        code,
        expiresAt: Date.now() + TWOFA_TTL_MS,
        attempts: 0,
      });

      let email = "";
      let displayName = "";
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(caller.userId);
        email = data?.user?.email || "";
        const meta: any = data?.user?.user_metadata || {};
        displayName = String(meta.display_name || meta.full_name || "").trim();
      } catch {
        // ignore — email lookup is non-critical
      }

      // A fresh challenge means the user is in the middle of a new login.
      // Clear any previously stored 2FA verification so they must re-verify.
      twoFaVerifiedUsers.delete(caller.userId);
      try {
        await supabaseAdmin.auth.admin.updateUserById(caller.userId, {
          user_metadata: { twofa_verified_at: null },
        });
      } catch { /* ignore — non-critical */ }

      const maskedEmail = email
        ? email.replace(/(.{1,2})([^@]*)(@.*)/, (_m, a, b, c) => `${a}${"*".repeat(Math.max(b.length, 3))}${c}`)
        : "your email";

      // Code is shown directly in the app UI — no email is sent.
      console.log(`[2FA] code for ${email || caller.userId}: ${code}`);

      res.json({
        success: true,
        required: true,
        maskedEmail,
        delivered: false,
        devCode: code,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to issue 2FA challenge" });
    }
  });

  app.post("/api/auth/2fa/verify", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });

      const code = String(req.body?.code || "").trim();
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "Code must be 6 digits" });
      }

      const entry = twoFactorCodes.get(caller.userId);
      if (!entry) {
        return res.status(400).json({ error: "No active code — please request a new one" });
      }
      if (entry.expiresAt < Date.now()) {
        twoFactorCodes.delete(caller.userId);
        return res.status(400).json({ error: "Code expired — please request a new one" });
      }
      if (entry.attempts >= TWOFA_MAX_ATTEMPTS) {
        twoFactorCodes.delete(caller.userId);
        return res.status(429).json({ error: "Too many attempts — please request a new code" });
      }

      entry.attempts += 1;

      if (entry.code !== code) {
        const remaining = TWOFA_MAX_ATTEMPTS - entry.attempts;
        return res
          .status(400)
          .json({ error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
      }

      twoFactorCodes.delete(caller.userId);

      const verifiedAt = Date.now();

      // Mark as verified in the fast in-memory cache.
      twoFaVerifiedUsers.set(caller.userId, { expiry: verifiedAt + TWOFA_SESSION_TTL_MS, verifiedAt });

      // Also persist to Supabase user metadata so the verification survives
      // server restarts — a page reload after a restart will no longer log the
      // user out as long as the 12-hour window hasn't expired.
      try {
        await supabaseAdmin.auth.admin.updateUserById(caller.userId, {
          user_metadata: { twofa_verified_at: verifiedAt },
        });
      } catch (metaErr: any) {
        // Non-critical — the in-memory cache still works for this process lifetime.
        console.warn("[2FA] Could not persist verified_at to user metadata:", metaErr?.message);
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to verify 2FA code" });
    }
  });

  app.get("/api/teacher/permissions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const roles = await getConfigSection("roles");
      const perms =
        roles &&
        typeof roles === "object" &&
        roles.perms &&
        typeof roles.perms === "object" &&
        roles.perms[caller.role] &&
        typeof roles.perms[caller.role] === "object"
          ? roles.perms[caller.role]
          : {};

      res.json({
        success: true,
        role: caller.role,
        permissions: perms,
      });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        return res.json({ success: true, permissions: {} });
      }
      res.status(500).json({ error: e?.message || "Failed to load permissions" });
    }
  });

  app.get("/api/admin/config/:section", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });

      const section = String(req.params.section || "").trim();
      if (!CONFIG_SECTIONS.has(section)) {
        return res.status(400).json({ error: "Unsupported config section" });
      }
      const value = await getConfigSection(section);
      res.json({ success: true, section, value });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        return res.status(400).json({
          error: "platform_config table is missing. Please run the updated database_setup.sql script.",
        });
      }
      res.status(500).json({ error: e.message || "Failed to load config" });
    }
  });

  app.put("/api/admin/config/:section", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });

      const section = String(req.params.section || "").trim();
      if (!CONFIG_SECTIONS.has(section)) {
        return res.status(400).json({ error: "Unsupported config section" });
      }
      const value = req.body?.value;
      if (value === undefined) {
        return res.status(400).json({ error: "value is required" });
      }

      // Detect a maintenance-mode flip so we can fan out an admin bell alert.
      let prevMaintenance: boolean | null = null;
      let nextMaintenance: boolean | null = null;
      if (section === "settings") {
        try {
          const prev: any = await getConfigSection("settings");
          prevMaintenance = Boolean(prev?.advanced?.maintenance);
        } catch { /* first save — treat as unchanged */ }
        if (value && typeof value === "object" && (value as any).advanced && typeof (value as any).advanced === "object") {
          nextMaintenance = Boolean((value as any).advanced.maintenance);
        }
      }

      const data = await upsertConfigSection(section, value);

      if (
        section === "settings" &&
        prevMaintenance !== null &&
        nextMaintenance !== null &&
        prevMaintenance !== nextMaintenance
      ) {
        void dispatchNotifyEvent("maintenanceAlert", {
          maintenanceEnabled: nextMaintenance,
        });
      }

      res.json({ success: true, config: data });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        return res.status(400).json({
          error: "platform_config table is missing. Please run the updated database_setup.sql script.",
        });
      }
      res.status(500).json({ error: e.message || "Failed to save config" });
    }
  });

  app.get("/api/admin/profile", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", caller.userId)
        .maybeSingle();
      if (error) throw error;
      res.json({ success: true, profile: data || null });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load profile" });
    }
  });

  app.put("/api/admin/profile", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });

      const payload = sanitizeAdminProfilePayload(req.body || {});
      if (!Object.keys(payload).length) {
        return res.status(400).json({ error: "No updatable profile fields provided" });
      }

      await saveAdminProfileWithFallback(caller.userId, payload);

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", caller.userId)
        .maybeSingle();
      if (error) throw error;
      res.json({ success: true, profile: data || null });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to save profile" });
    }
  });

  // Route to fetch all students (bypasses RLS using service role) — admin only
  app.get("/api/admin/students", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });

      const [profilesRes, teachersRes, coursesRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*').eq('role', 'student'),
        supabaseAdmin.from('teachers').select('user_id, first_name, last_name'),
        supabaseAdmin.from('courses').select('id, student_ids, teacher_id'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (teachersRes.error) throw teachersRes.error;

      const teacherMap: Record<string, string> = {};
      const teacherOptions: { id: string; name: string }[] = [];
      (teachersRes.data || []).forEach((t: any) => {
        const name = `${t.first_name} ${t.last_name}`.trim();
        teacherMap[t.user_id] = name;
        teacherOptions.push({ id: t.user_id, name });
      });

      const enrolledCountMap: Record<string, number> = {};
      if (coursesRes.error) {
        if (!isMissingCoursesStudentIdsError(coursesRes.error)) throw coursesRes.error;
        const { data: classRows, error: classesErr } = await supabaseAdmin
          .from('classes')
          .select('course_id, student_ids');
        if (classesErr) throw classesErr;
        const perStudent = new Map<string, Set<string>>();
        (classRows || []).forEach((cl: any) => {
          const cid = cl.course_id != null ? String(cl.course_id) : '';
          (Array.isArray(cl.student_ids) ? cl.student_ids : []).forEach((sid: unknown) => {
            const s = String(sid || '');
            if (!s || !cid) return;
            if (!perStudent.has(s)) perStudent.set(s, new Set());
            perStudent.get(s)!.add(cid);
          });
        });
        perStudent.forEach((set, sid) => {
          enrolledCountMap[sid] = set.size;
        });
      } else {
        (coursesRes.data || []).forEach((c: any) => {
          (c.student_ids || []).forEach((sid: string) => {
            enrolledCountMap[sid] = (enrolledCountMap[sid] || 0) + 1;
          });
        });
      }

      const students = (profilesRes.data || []).map((p: any) => ({
        uid: p.id,
        email: p.email,
        displayName: p.display_name,
        role: p.role,
        teacherId: p.teacher_id,
        status: p.status || 'active',
        createdAt: p.created_at,
        teacherName: p.teacher_id ? (teacherMap[p.teacher_id] || '—') : '—',
        enrolledCourseCount: enrolledCountMap[p.id] || 0,
      }));

      res.json({ success: true, students, teacherOptions });
    } catch (error: any) {
      console.error('Error fetching students:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to fetch all teachers (bypasses RLS using service role)
  app.get("/api/admin/teachers", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });

      const [profilesRes, teachersRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("role", "teacher"),
        supabaseAdmin.from("teachers").select("id, user_id"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (teachersRes.error) throw teachersRes.error;

      const teacherIdByUserId: Record<string, string> = {};
      (teachersRes.data || []).forEach((t: any) => {
        if (t?.user_id && t?.id) {
          teacherIdByUserId[t.user_id] = t.id;
        }
      });

      const teachers = (profilesRes.data || []).map((p: any) => ({
        uid: p.id,
        teacherId: teacherIdByUserId[p.id] || null,
        email: p.email,
        displayName: p.display_name,
        role: p.role,
        status: p.status || 'active',
        createdAt: p.created_at,
      }));
      res.json({ success: true, teachers });
    } catch (error: any) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to seed the initial admin account
  app.get("/api/admin/seed", async (req, res) => {
    const adminEmail = "liridon.salihi123@gmail.com";
    const adminPassword = "Admin123!";
    
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });
      if (!isAdminSeedAllowed(process.env.NODE_ENV)) {
        return res.status(403).json({ error: "Forbidden: admin seed is disabled outside development" });
      }

      // 1. Check if profiles table exists
      const { error: tableCheckError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .limit(1);
      
      if (tableCheckError && tableCheckError.code === 'PGRST116') {
        // This is fine, it just means the table is empty
      } else if (tableCheckError && tableCheckError.message.includes('does not exist')) {
        return res.status(400).send(`
          <h1>Database Table Missing</h1>
          <p>The <b>profiles</b> table does not exist in your Supabase database.</p>
          <p>Please go to your Supabase SQL Editor and run the SQL script provided in the chat to create the tables.</p>
        `);
      }

      // 2. Create or find user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { displayName: 'Super Admin', role: 'admin' }
      });

      let userId = authData.user?.id;

      // If creation failed, try to find the user by email
      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find(u => u.email === adminEmail);
          if (existingUser) {
            userId = existingUser.id;
            
            // Update password to ensure it matches Admin123!
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              password: adminPassword,
              user_metadata: { displayName: 'Super Admin', role: 'admin' }
            });
          }
        }
      }

      if (!userId) {
        // If we still don't have a userId, throw the original creation error if it exists
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }

      // 4. Create profile in public.profiles table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          email: adminEmail,
          display_name: 'Super Admin',
          role: 'admin',
          status: 'active',
          created_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // 5. Also create a teacher record for the admin
      await supabaseAdmin
        .from('teachers')
        .upsert({
          user_id: userId,
          first_name: 'Super',
          last_name: 'Admin',
          email: adminEmail,
          specialization: 'System Administration',
          status: 'active'
        });

      res.send(`
        <h1>Success!</h1>
        <p>Admin account seeded successfully.</p>
        <ul>
          <li><b>Email:</b> ${adminEmail}</li>
          <li><b>Password:</b> ${adminPassword}</li>
        </ul>
        <p><a href="/">Go to Login</a></p>
      `);
    } catch (error: any) {
      console.error('Error seeding admin:', error);
      res.status(500).send(`
        <h1>Seed Failed</h1>
        <p>Error: ${error.message}</p>
        <p>Please check your Supabase URL and Service Role Key in the Secrets menu.</p>
      `);
    }
  });

  // Route to create a course (bypasses RLS using service role)
  app.post("/api/admin/create-course", async (req, res) => {
    try {
      const requestedTeacherId = normalizeTeacherId(req.body.teacher_id);
      if (!requestedTeacherId) {
        return res.status(400).json({ error: "teacher_id is required." });
      }

      const teacherIdCandidates = await getTeacherIdCandidates(requestedTeacherId);
      if (teacherIdCandidates.length === 0) {
        return res.status(400).json({ error: "Selected teacher was not found." });
      }

      const baseSlug = (req.body.title || 'course')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const slug = `${baseSlug}-${Date.now()}`;
      const payloadBase = {
        ...sanitizeCoursePayload(req.body),
        slug,
        created_at: new Date().toISOString(),
      };

      let createdCourse: any = null;
      let lastForeignKeyError: any = null;

      for (const teacherId of teacherIdCandidates) {
        const payload = { ...payloadBase, teacher_id: teacherId };
        const { data, error } = await supabaseAdmin.from("courses").insert(payload).select().single();
        if (!error) {
          createdCourse = data;
          break;
        }

        const isTeacherFkError =
          error.code === "23503" &&
          typeof error.message === "string" &&
          error.message.includes("courses_teacher_id_fkey");

        if (!isTeacherFkError) {
          throw error;
        }

        lastForeignKeyError = error;
      }

      if (!createdCourse) {
        if (lastForeignKeyError) {
          return res.status(400).json({
            error: "Selected teacher is invalid for courses. Please re-select a teacher and try again.",
          });
        }
        throw new Error("Could not create course for the selected teacher.");
      }

      const selectedClassId = typeof req.body?.class_id === "string" ? req.body.class_id.trim() : "";
      if (selectedClassId) {
        const { data: classRow, error: classErr } = await supabaseAdmin
          .from("classes")
          .select("id, teacher_id, student_ids")
          .eq("id", selectedClassId)
          .maybeSingle();
        if (classErr) throw classErr;
        if (!classRow) {
          return res.status(400).json({ error: "Selected class was not found." });
        }
        const classTeacherId = String((classRow as any).teacher_id || "");
        if (!teacherIdCandidates.includes(classTeacherId)) {
          return res.status(403).json({ error: "Selected class is not owned by this teacher." });
        }
        const classStudentIds = Array.isArray((classRow as any).student_ids)
          ? (classRow as any).student_ids.map((sid: unknown) => String(sid)).filter(Boolean)
          : [];
        const uniqueStudentIds = Array.from(new Set(classStudentIds));
        const { data: updatedCourse, error: visibilityErr } = await supabaseAdmin
          .from("courses")
          .update({
            student_ids: uniqueStudentIds,
            total_students: uniqueStudentIds.length,
            updated_at: new Date().toISOString(),
          })
          .eq("id", createdCourse.id)
          .select()
          .single();
        if (visibilityErr) throw visibilityErr;
        createdCourse = updatedCourse || createdCourse;
      }

      res.json({ success: true, course: createdCourse });
    } catch (error: any) {
      console.error('Error creating course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to update a course (bypasses RLS using service role)
  app.patch("/api/admin/update-course/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = sanitizeCoursePayload(req.body);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid course fields provided for update." });
      }

      if (Object.prototype.hasOwnProperty.call(updates, "teacher_id")) {
        const requestedTeacherId = normalizeTeacherId(updates.teacher_id);
        if (!requestedTeacherId) {
          return res.status(400).json({ error: "teacher_id cannot be empty." });
        }

        const teacherIdCandidates = await getTeacherIdCandidates(requestedTeacherId);
        if (teacherIdCandidates.length === 0) {
          return res.status(400).json({ error: "Selected teacher was not found." });
        }

        let updatedCourse: any = null;
        let lastForeignKeyError: any = null;

        for (const teacherId of teacherIdCandidates) {
          const candidateUpdates = { ...updates, teacher_id: teacherId };
          const { data, error } = await supabaseAdmin
            .from("courses")
            .update(candidateUpdates)
            .eq("id", id)
            .select()
            .single();

          if (!error) {
            updatedCourse = data;
            break;
          }

          const isTeacherFkError =
            error.code === "23503" &&
            typeof error.message === "string" &&
            error.message.includes("courses_teacher_id_fkey");

          if (!isTeacherFkError) {
            throw error;
          }

          lastForeignKeyError = error;
        }

        if (!updatedCourse) {
          if (lastForeignKeyError) {
            return res.status(400).json({
              error: "Selected teacher is invalid for courses. Please re-select a teacher and try again.",
            });
          }
          throw new Error("Could not update course teacher.");
        }

        return res.json({ success: true, course: updatedCourse });
      }

      const { data, error } = await supabaseAdmin
        .from("courses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json({ success: true, course: data });
    } catch (error: any) {
      console.error('Error updating course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to create a teacher (Admin only)
  app.post("/api/admin/create-teacher", async (req, res) => {
    const { name, email, password, phone, specialization } = req.body;
    
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });

      // 1. Create or find user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: name, role: 'teacher' }
      });

      let userId = authData.user?.id;

      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find(u => u.email === email);
          if (existingUser) {
            userId = existingUser.id;
            // Update metadata to ensure role is teacher
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: { displayName: name, role: 'teacher' }
            });
          }
        }
      }

      if (!userId) {
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }

      // 2. Create profile in public.profiles table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          email,
          display_name: name,
          role: 'teacher',
          status: 'active',
          created_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // 3. Create teacher record
      const names = name.split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ') || 'Teacher';

      const teacherPayload: any = {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        status: 'active',
      };
      if (phone) teacherPayload.phone = phone;
      if (specialization) teacherPayload.specialization = specialization;

      const { error: teacherError } = await supabaseAdmin
        .from('teachers')
        .upsert(teacherPayload);

      if (teacherError) throw teacherError;

      res.json({ success: true, uid: userId });
    } catch (error: any) {
      console.error('Error creating teacher:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to create a student
  app.post("/api/admin/create-student", async (req, res) => {
    const {
      name, email, password, teacherId,
      phone, dateOfBirth, gender, preferredLanguage, currentLevel, notes, classId
    } = req.body;
    
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin" && caller.role !== "teacher") {
        return res.status(403).json({ error: "Forbidden: admin or teacher role required" });
      }

      // Teacher-created students are always bound to the authenticated teacher.
      // Admin-created students require an explicit teacher assignment.
      const resolvedTeacherId: string | undefined =
        caller.role === "teacher" ? caller.userId : typeof teacherId === "string" ? teacherId.trim() : "";
      if (!resolvedTeacherId) throw new Error('Could not determine teacher identity.');

      // 1. Create or find user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: name, role: 'student' }
      });

      let userId = authData.user?.id;

      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find((u: any) => u.email === email);
          if (existingUser) {
            userId = existingUser.id;
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: { displayName: name, role: 'student' }
            });
          }
        }
      }

      if (!userId) {
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }

      // 2. Upsert profile — insert if new, update all key fields if the row already exists
      // (Supabase Auth may auto-create a bare profile row via trigger; the update ensures
      //  teacher_id and role are always written correctly.)
      const profilePayload = {
        id: userId,
        email,
        display_name: name,
        role: 'student',
        teacher_id: resolvedTeacherId,
        status: 'active',
      };

      const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      // If the upsert silently skipped (e.g. existing row with different owner), force an update
      if (!upsertError) {
        await supabaseAdmin
          .from('profiles')
          .update({ teacher_id: resolvedTeacherId, role: 'student', display_name: name, status: 'active', email })
          .eq('id', userId);
      } else {
        throw upsertError;
      }

      // 3. Create student record with all available fields
      const names = name.trim().split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ') || '';

      const studentPayload: any = {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        status: 'active',
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (phone) studentPayload.phone = phone;
      if (dateOfBirth) studentPayload.date_of_birth = dateOfBirth;
      if (gender) studentPayload.gender = gender;
      if (preferredLanguage) studentPayload.preferred_language = preferredLanguage;
      if (currentLevel) studentPayload.current_level = currentLevel;

      const { error: studentError } = await supabaseAdmin
        .from('students')
        .upsert(studentPayload);

      if (studentError) throw studentError;

      // 4. Optional class assignment (and keep related course enrollment in sync).
      const normalizedClassId = typeof classId === 'string' ? classId.trim() : '';
      if (normalizedClassId) {
        const teacherIdCandidates = await getTeacherIdCandidates(resolvedTeacherId);
        const scopedTeacherIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [resolvedTeacherId];
        const classSnap = await supabaseAdmin
          .from('classes')
          .select('id, teacher_id, student_ids, course_id')
          .eq('id', normalizedClassId)
          .maybeSingle();
        if (classSnap.error) throw classSnap.error;
        const cls = classSnap.data as any;
        if (!cls) throw new Error('Selected class was not found.');
        const classTeacherId = String(cls.teacher_id || '').trim();
        if (classTeacherId && !scopedTeacherIds.includes(classTeacherId)) {
          throw new Error('You cannot assign this student to the selected class.');
        }

        const classStudentIds = Array.isArray(cls.student_ids) ? cls.student_ids.map((sid: unknown) => String(sid)) : [];
        if (!classStudentIds.includes(userId)) {
          const nextClassStudentIds = [...new Set([...classStudentIds, userId])];
          const classUpdate = await supabaseAdmin
            .from('classes')
            .update({ student_ids: nextClassStudentIds })
            .eq('id', normalizedClassId);
          if (classUpdate.error) throw classUpdate.error;
        }

        const classCourseId = String(cls.course_id || '').trim();
        if (classCourseId) {
          const courseSnap = await supabaseAdmin
            .from('courses')
            .select('id, student_ids, total_students')
            .eq('id', classCourseId)
            .maybeSingle();
          if (!courseSnap.error && courseSnap.data) {
            const course = courseSnap.data as any;
            const courseStudentIds = Array.isArray(course.student_ids) ? course.student_ids.map((sid: unknown) => String(sid)) : [];
            if (!courseStudentIds.includes(userId)) {
              const nextCourseStudentIds = [...new Set([...courseStudentIds, userId])];
              const nextTotalStudents = Math.max(nextCourseStudentIds.length, Number(course.total_students || 0));
              const courseUpdate = await supabaseAdmin
                .from('courses')
                .update({ student_ids: nextCourseStudentIds, total_students: nextTotalStudents })
                .eq('id', classCourseId);
              if (courseUpdate.error) throw courseUpdate.error;
            }
          }
        }
      }

      res.json({ success: true, uid: userId });
    } catch (error: any) {
      console.error('Error creating student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Courses list (for dropdowns)
  app.get('/api/admin/courses', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: 'Forbidden: admin role required' });

      const { data, error } = await supabaseAdmin
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, courses: data || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/courses-list', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('courses').select('id, title').order('title');
      if (error) throw error;
      res.json({ success: true, courses: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ANALYTICS ──────────────────────────────────────────────
    // Teacher courses (service-role query to avoid RLS/ID-mapping mismatches)
  app.get('/api/teacher/courses', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      const { data, error } = await supabaseAdmin
        .from('courses')
        .select('*')
        .in('teacher_id', scopedIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, courses: data || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Teacher students (service role) — scoped to the authenticated teacher only (not global admin list).
  app.get(["/api/teacher/students", "/api/teacher/students/"], async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      if (caller.role !== "teacher") {
        return res.status(403).json({ error: "Forbidden: teacher role required" });
      }

      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (caller.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      let courseRows: any[] = [];
      const coursesWithIdsRes = await supabaseAdmin
        .from("courses")
        .select("id, title, student_ids")
        .in("teacher_id", scopedIds)
        .order("created_at", { ascending: false });

      if (coursesWithIdsRes.error) {
        if (!isMissingCoursesStudentIdsError(coursesWithIdsRes.error)) throw coursesWithIdsRes.error;
        const fallback = await supabaseAdmin
          .from("courses")
          .select("id, title")
          .in("teacher_id", scopedIds)
          .order("created_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        courseRows = fallback.data || [];
      } else {
        courseRows = coursesWithIdsRes.data || [];
      }

      const coursesData = (courseRows || []).map((c: any) => ({
        id: String(c.id),
        name: (c.title != null && String(c.title).trim() !== "" ? String(c.title) : "Untitled") as string,
        studentIds: Array.isArray(c.student_ids) ? c.student_ids.map((x: unknown) => String(x)) : [],
      }));

      const courseTitleById: Record<string, string> = {};
      coursesData.forEach((c) => {
        courseTitleById[c.id] = c.name;
      });

      const enrolledIds = new Set<string>();
      coursesData.forEach((c) => {
        c.studentIds.forEach((sid) => {
          if (sid) enrolledIds.add(sid);
        });
      });

      // Legacy DBs without courses.student_ids: enrollments may live on classes.student_ids only
      const { data: classRows, error: classesErr } = await supabaseAdmin
        .from("classes")
        .select("id, name, course_id, student_ids")
        .in("teacher_id", scopedIds);
      if (!classesErr && Array.isArray(classRows) && classRows.length > 0) {
        classRows.forEach((cl: any) => {
          const cid = cl.course_id != null ? String(cl.course_id) : "";
          const linkedTitle = cid ? courseTitleById[cid] : "";
          const className =
            typeof cl.name === "string" && cl.name.trim() !== "" ? String(cl.name).trim() : "Class";
          (Array.isArray(cl.student_ids) ? cl.student_ids : []).forEach((sid: unknown) => {
            const s = String(sid || "");
            if (!s) return;
            enrolledIds.add(s);
            if (cid && linkedTitle) {
              const cdata = coursesData.find((x) => x.id === cid);
              if (cdata && !cdata.studentIds.includes(s)) cdata.studentIds.push(s);
              return;
            }
            const displayName = linkedTitle || className;
            const syntheticId = `__class_${String(cl.id || "")}`;
            let row = coursesData.find((x) => x.id === syntheticId);
            if (!row) {
              row = { id: syntheticId, name: displayName, studentIds: [] as string[] };
              coursesData.push(row);
            }
            if (!row.studentIds.includes(s)) row.studentIds.push(s);
          });
        });
      }

      const [linkedRes, enrolledRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("*")
          .in("teacher_id", scopedIds)
          .eq("role", "student")
          .order("created_at", { ascending: false }),
        enrolledIds.size > 0
          ? supabaseAdmin.from("profiles").select("*").in("id", [...enrolledIds])
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (linkedRes.error) throw linkedRes.error;
      if (enrolledRes.error) throw enrolledRes.error;

      const byId = new Map<string, any>();
      (linkedRes.data || []).forEach((d: any) => {
        if (d?.id) byId.set(String(d.id), d);
      });
      (enrolledRes.data || []).forEach((d: any) => {
        if (d?.id && !byId.has(String(d.id))) byId.set(String(d.id), d);
      });

      const coursesByStudent: Record<string, string[]> = {};
      coursesData.forEach((c) => {
        c.studentIds.forEach((sid) => {
          if (!coursesByStudent[sid]) coursesByStudent[sid] = [];
          coursesByStudent[sid].push(c.name);
        });
      });

      const merged = [...byId.values()].sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );

      const students = merged.map((d: any) => ({
        uid: String(d.id),
        email: d.email,
        displayName: d.display_name,
        role: d.role,
        teacherId: d.teacher_id,
        status: d.status || "active",
        createdAt: d.created_at,
        enrolledCourses: coursesByStudent[String(d.id)] || [],
      }));

      res.json({ success: true, students, courses: coursesData });
    } catch (e: any) {
      console.error("GET /api/teacher/students", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Teacher can update only students linked to them.
  app.patch('/api/teacher/students/:studentId', async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: 'Unauthorized' });
      if (caller.role !== 'teacher') return res.status(403).json({ error: 'Forbidden: teacher role required' });

      const studentId = String(req.params.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId is required' });

      const teacherIds = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];

      const { data: student, error: sErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role, teacher_id')
        .eq('id', studentId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (student.role !== 'student') return res.status(400).json({ error: 'Target user is not a student' });
      if (!student.teacher_id || !scopedIds.includes(String(student.teacher_id))) {
        return res.status(403).json({ error: 'Forbidden: student is not linked to your account' });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      if (typeof body.display_name === 'string') update.display_name = body.display_name.trim();
      if (typeof body.email === 'string') update.email = body.email.trim();
      if (body.status === 'active' || body.status === 'inactive') update.status = body.status;
      if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(update)
        .eq('id', studentId)
        .select('id, email, display_name, role, teacher_id, status, created_at')
        .single();
      if (error) throw error;
      res.json({ success: true, student: data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to update student' });
    }
  });

  // Teacher can delete only students linked to them.
  app.delete('/api/teacher/students/:studentId', async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: 'Unauthorized' });
      if (caller.role !== 'teacher') return res.status(403).json({ error: 'Forbidden: teacher role required' });

      const studentId = String(req.params.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId is required' });

      const teacherIds = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];
      const { data: student, error: sErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role, teacher_id')
        .eq('id', studentId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (student.role !== 'student') return res.status(400).json({ error: 'Target user is not a student' });
      if (!student.teacher_id || !scopedIds.includes(String(student.teacher_id))) {
        return res.status(403).json({ error: 'Forbidden: student is not linked to your account' });
      }

      const { error } = await supabaseAdmin.from('profiles').delete().eq('id', studentId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to delete student' });
    }
  });

  // Teacher quizzes (service role) — same scoping as courses; avoids PostgREST 400s when RLS/schema differ.
  const teacherQuizzesGetHandler = async (req: Request, res: Response) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      const rows = await loadTeacherQuizzesForScopedIds(scopedIds, userId);
      res.json({ success: true, quizzes: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };
  app.get("/api/teacher/quizzes", teacherQuizzesGetHandler);
  app.get("/api/teacher/quizzes/", teacherQuizzesGetHandler);

  // Teacher progress (service role) — scoped strictly to authenticated teacher ownership.
  app.get("/api/teacher/progress", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }

      const requestedUserId =
        typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!requestedUserId) {
        return res.status(400).json({ error: "userId is required" });
      }
      if (caller.role !== "admin" && caller.userId !== requestedUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];

      const coursesRes = await supabaseAdmin
        .from("courses")
        .select("id,title,student_ids")
        .in("teacher_id", scopedIds);
      if (coursesRes.error) throw coursesRes.error;
      const courseRows = coursesRes.data || [];
      const coursesCount = courseRows.length;
      const teacherCourseIds = courseRows.map((c: any) => String(c.id || "")).filter(Boolean);

      const enrolledIds = new Set<string>();
      courseRows.forEach((c: any) => {
        (Array.isArray(c.student_ids) ? c.student_ids : []).forEach((sid: unknown) => {
          const s = String(sid || "").trim();
          if (s) enrolledIds.add(s);
        });
      });

      // Legacy compatibility: classes.student_ids may contain enrollments.
      const classRowsRes = await supabaseAdmin
        .from("classes")
        .select("student_ids")
        .in("teacher_id", scopedIds);
      if (!classRowsRes.error) {
        (classRowsRes.data || []).forEach((cl: any) => {
          (Array.isArray(cl.student_ids) ? cl.student_ids : []).forEach((sid: unknown) => {
            const s = String(sid || "").trim();
            if (s) enrolledIds.add(s);
          });
        });
      } else if (!isClassesTableMissing(classRowsRes.error)) {
        throw classRowsRes.error;
      }

      const [linkedStudentsRes, enrolledStudentsRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id,display_name,email,teacher_id,role,status,created_at")
          .in("teacher_id", scopedIds)
          .eq("role", "student"),
        enrolledIds.size > 0
          ? supabaseAdmin
              .from("profiles")
              .select("id,display_name,email,teacher_id,role,status,created_at")
              .in("id", [...enrolledIds])
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (linkedStudentsRes.error) throw linkedStudentsRes.error;
      if (enrolledStudentsRes.error) throw enrolledStudentsRes.error;

      const studentById = new Map<string, any>();
      (linkedStudentsRes.data || []).forEach((s: any) => s?.id && studentById.set(String(s.id), s));
      (enrolledStudentsRes.data || []).forEach((s: any) => {
        const sid = String(s?.id || "");
        if (sid && !studentById.has(sid)) studentById.set(sid, s);
      });
      const allowedStudentIds = new Set([...studentById.keys()]);

      let quizRows: any[] = [];
      if (teacherCourseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", teacherCourseIds);
        if (quizzesRes.error) throw quizzesRes.error;
        quizRows = quizzesRes.data || [];
      }
      const quizzesCount = quizRows.length;
      const quizIds = new Set(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q: any) => {
        const raw =
          q?.settings?.passingScore ??
          q?.passing_score ??
          q?.pass_mark ??
          q?.passMark;
        const n = Number(raw);
        acc[String(q.id)] = Number.isFinite(n) ? n : 50;
        return acc;
      }, {});

      const attemptsRows = normalizeAttempts(await fetchAllAttemptRows(), passingScoreByQuiz).filter((a: any) => {
        if (!quizIds.has(String(a.quiz_id || ""))) return false;
        return allowedStudentIds.has(String(a.student_id || ""));
      });

      const attemptsByStudent: Record<string, { attempts: number; passed: number; scoreSum: number }> = {};
      attemptsRows.forEach((a: any) => {
        const sid = String(a.student_id || "");
        if (!sid) return;
        if (!attemptsByStudent[sid]) attemptsByStudent[sid] = { attempts: 0, passed: 0, scoreSum: 0 };
        attemptsByStudent[sid].attempts += 1;
        if (a.passed) attemptsByStudent[sid].passed += 1;
        attemptsByStudent[sid].scoreSum += toFiniteNumber(a.score_percent, 0);
      });

      const rows = [...studentById.values()].map((s: any) => {
        const sid = String(s.id);
        const aggr = attemptsByStudent[sid] || { attempts: 0, passed: 0, scoreSum: 0 };
        const avgScore = aggr.attempts > 0 ? Math.round(aggr.scoreSum / aggr.attempts) : 0;
        const passRate = aggr.attempts > 0 ? Math.round((aggr.passed / aggr.attempts) * 100) : 0;
        return {
          studentId: sid,
          studentName: String(s.display_name || "Unknown Student"),
          studentEmail: String(s.email || ""),
          attempts: aggr.attempts,
          passed: aggr.passed,
          passRate,
          avgScore,
        };
      });

      res.json({ success: true, rows, coursesCount, quizzesCount });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load teacher progress" });
    }
  });

  // Teacher results (service role) — scoped strictly to authenticated teacher ownership.
  app.get("/api/teacher/results", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }

      const requestedUserId =
        typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!requestedUserId) {
        return res.status(400).json({ error: "userId is required" });
      }
      if (caller.role !== "admin" && caller.userId !== requestedUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];

      const coursesRes = await supabaseAdmin.from("courses").select("id").in("teacher_id", scopedIds);
      if (coursesRes.error) throw coursesRes.error;
      const teacherCourseIds = (coursesRes.data || []).map((c: any) => String(c.id || "")).filter(Boolean);

      let quizRows: any[] = [];
      if (teacherCourseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", teacherCourseIds);
        if (quizzesRes.error) throw quizzesRes.error;
        quizRows = quizzesRes.data || [];
      }
      const quizIds = new Set(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
      const quizzes: Record<string, string> = {};
      const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q: any) => {
        const qid = String(q.id || "");
        quizzes[qid] = String(q.title || "Quiz");
        const raw =
          q?.settings?.passingScore ??
          q?.passing_score ??
          q?.pass_mark ??
          q?.passMark;
        const parsed = Number(raw);
        acc[qid] = Number.isFinite(parsed) ? parsed : 50;
        return acc;
      }, {});

      const studentsRes = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,email,teacher_id,role")
        .in("teacher_id", scopedIds)
        .eq("role", "student");
      if (studentsRes.error) throw studentsRes.error;
      const studentRows = studentsRes.data || [];
      const allowedStudentIds = new Set(studentRows.map((s: any) => String(s.id || "")).filter(Boolean));
      const students: Record<string, { name: string; email: string }> = {};
      studentRows.forEach((s: any) => {
        const sid = String(s.id || "");
        if (!sid) return;
        students[sid] = {
          name: String(s.display_name || "Unknown"),
          email: String(s.email || ""),
        };
      });

      const attempts = normalizeAttempts(await fetchAllAttemptRows(), passingScoreByQuiz)
        .filter((a: any) => quizIds.has(String(a.quiz_id || "")) && allowedStudentIds.has(String(a.student_id || "")))
        .map((a: any) => ({
          id: String(a.id || ""),
          quizId: String(a.quiz_id || ""),
          studentId: String(a.student_id || ""),
          scorePercent: toFiniteNumber(a.score_percent, 0),
          passed: Boolean(a.passed),
          status: String(a.status || "completed"),
          startedAt: a.started_at || null,
          completedAt: a.completed_at || null,
          score: toFiniteNumber(a.score, 0),
          totalPoints: toFiniteNumber(a.total_points, 0),
          correctAnswers:
            a.correct_answers == null ? null : toFiniteNumber(a.correct_answers, 0),
          totalQuestions:
            a.total_questions == null ? null : toFiniteNumber(a.total_questions, 0),
        }));

      res.json({ success: true, attempts, quizzes, students });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load teacher results" });
    }
  });

  // Teacher dashboard summary — scoped strictly to authenticated teacher ownership.
  app.get("/api/teacher/dashboard", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }

      const requestedUserId =
        typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!requestedUserId) {
        return res.status(400).json({ error: "userId is required" });
      }
      if (caller.role !== "admin" && caller.userId !== requestedUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];

      const coursesRes = await supabaseAdmin.from("courses").select("id").in("teacher_id", scopedIds);
      if (coursesRes.error) throw coursesRes.error;
      const courseIds = (coursesRes.data || []).map((c: any) => String(c.id || "")).filter(Boolean);

      const studentsRes = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("teacher_id", scopedIds)
        .eq("role", "student");
      if (studentsRes.error) throw studentsRes.error;
      const studentIds = new Set((studentsRes.data || []).map((s: any) => String(s.id || "")).filter(Boolean));

      let quizRows: any[] = [];
      if (courseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
        if (quizzesRes.error) throw quizzesRes.error;
        quizRows = quizzesRes.data || [];
      }
      const quizIds = new Set(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q: any) => {
        const raw =
          q?.settings?.passingScore ??
          q?.passing_score ??
          q?.pass_mark ??
          q?.passMark;
        const n = Number(raw);
        acc[String(q.id)] = Number.isFinite(n) ? n : 50;
        return acc;
      }, {});

      const attempts = normalizeAttempts(await fetchAllAttemptRows(), passingScoreByQuiz).filter((a: any) => {
        return quizIds.has(String(a.quiz_id || "")) && studentIds.has(String(a.student_id || ""));
      });
      const completedAttempts = attempts.filter((a: any) => String(a.status || "").toLowerCase() === "completed");
      const avgScore = completedAttempts.length
        ? Math.round(
            completedAttempts.reduce((sum: number, a: any) => sum + toFiniteNumber(a.score_percent, 0), 0) /
              completedAttempts.length,
          )
        : 0;
      const passRate = completedAttempts.length
        ? Math.round(
            (completedAttempts.filter((a: any) => Boolean(a.passed)).length / completedAttempts.length) * 100,
          )
        : 0;

      const durationRows = completedAttempts.filter((a: any) => a.started_at && a.completed_at);
      const avgDuration = durationRows.length
        ? Math.round(
            durationRows.reduce((sum: number, a: any) => {
              const s = new Date(String(a.started_at)).getTime();
              const e = new Date(String(a.completed_at)).getTime();
              if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return sum;
              return sum + Math.round((e - s) / 60000);
            }, 0) / durationRows.length,
          )
        : 0;

      let certificatesCount = 0;
      if (studentIds.size > 0) {
        const certsRes = await supabaseAdmin.from("certificates").select("student_id").in("student_id", [...studentIds]);
        if (!certsRes.error) certificatesCount = (certsRes.data || []).length;
      }

      const now = new Date();
      const trend = Array.from({ length: 7 }).map((_, idx) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (6 - idx));
        const isoDay = d.toISOString().slice(0, 10);
        const attemptsForDay = completedAttempts.filter((a: any) =>
          String(a.completed_at || a.created_at || "").slice(0, 10) === isoDay,
        );
        return {
          day: d.toLocaleDateString("en-US", { weekday: "short" }),
          attempts: attemptsForDay.length,
        };
      });

      res.json({
        success: true,
        stats: {
          courses: courseIds.length,
          students: studentIds.size,
          quizzes: quizIds.size,
          avgScore,
          passRate,
          avgDuration,
          certificates: certificatesCount,
        },
        trend,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load teacher dashboard" });
    }
  });

  // Teacher profile summary — scoped to authenticated teacher.
  app.get("/api/teacher/profile", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }

      const requestedUserId =
        typeof req.query.userId === "string" && req.query.userId.trim()
          ? req.query.userId.trim()
          : caller.userId;
      if (caller.role !== "admin" && requestedUserId !== caller.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];

      const [profileRes, studentsRes, coursesRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", requestedUserId).maybeSingle(),
        supabaseAdmin.from("profiles").select("id").in("teacher_id", scopedIds).eq("role", "student"),
        supabaseAdmin.from("courses").select("id").in("teacher_id", scopedIds),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (studentsRes.error) throw studentsRes.error;
      if (coursesRes.error) throw coursesRes.error;

      const profileRow = (profileRes.data || {}) as Record<string, unknown>;
      const courseIds = (coursesRes.data || []).map((c: any) => String(c.id || "")).filter(Boolean);
      const studentIds = new Set((studentsRes.data || []).map((s: any) => String(s.id || "")).filter(Boolean));

      let quizRows: any[] = [];
      if (courseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
        if (quizzesRes.error) throw quizzesRes.error;
        quizRows = quizzesRes.data || [];
      }

      const quizIds = new Set(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q: any) => {
        const raw =
          q?.settings?.passingScore ??
          q?.passing_score ??
          q?.pass_mark ??
          q?.passMark;
        const n = Number(raw);
        acc[String(q.id)] = Number.isFinite(n) ? n : 50;
        return acc;
      }, {});

      const attempts = normalizeAttempts(await fetchAllAttemptRows(), passingScoreByQuiz).filter((a: any) => {
        return quizIds.has(String(a.quiz_id || "")) && studentIds.has(String(a.student_id || ""));
      });
      const completedAttempts = attempts.filter((a: any) => String(a.status || "").toLowerCase() === "completed");
      const passRate = completedAttempts.length
        ? Math.round((completedAttempts.filter((a: any) => Boolean(a.passed)).length / completedAttempts.length) * 100)
        : 0;

      return res.json({
        success: true,
        profile: {
          displayName: String(profileRow.display_name || ""),
          bio: String(profileRow.bio || ""),
          subject: String(profileRow.subject || ""),
          institution: String(profileRow.institution || ""),
          phone: String(profileRow.phone || ""),
          website: String(profileRow.website || ""),
          avatarUrl: String(profileRow.avatar_url || ""),
          email: String(profileRow.email || ""),
          createdAt: String(profileRow.created_at || ""),
        },
        stats: {
          students: studentIds.size,
          courses: courseIds.length,
          quizzes: quizIds.size,
          passRate,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load teacher profile" });
    }
  });

  // Teacher quiz question counts (service role) — avoids RLS issues when counting from browser.
  app.get("/api/teacher/quizzes/question-counts", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }

      const requestedUserId =
        typeof req.query.userId === "string" && req.query.userId.trim()
          ? req.query.userId.trim()
          : caller.userId;
      const baseUserId = caller.role === "admin" ? requestedUserId : caller.userId;

      const teacherIds = await getTeacherIdCandidates(baseUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [baseUserId];
      const quizRows = await loadTeacherQuizzesForScopedIds(scopedIds, baseUserId);
      const quizIds = (quizRows || []).map((q: any) => String(q?.id || "")).filter(Boolean);

      if (quizIds.length === 0) {
        return res.json({ success: true, counts: {} });
      }

      const { data, error } = await supabaseAdmin
        .from("questions")
        .select("quiz_id")
        .in("quiz_id", quizIds);
      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        const qid = row?.quiz_id ? String(row.quiz_id) : "";
        if (!qid) return;
        counts[qid] = (counts[qid] || 0) + 1;
      });

      return res.json({ success: true, counts });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to load quiz question counts" });
    }
  });

  // Teacher modules (service role) — same scoping as POST /api/teacher/modules so rows always
  // show after create even when RLS differs between environments.
  app.get("/api/teacher/modules", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      const { data: courseRows, error: coursesError } = await supabaseAdmin
        .from("courses")
        .select("id")
        .in("teacher_id", scopedIds);
      if (coursesError) throw coursesError;

      const courseIds = (courseRows || []).map((c: any) => c?.id).filter(Boolean);
      if (courseIds.length === 0) {
        return res.json({ success: true, modules: [] });
      }

      const { data, error } = await supabaseAdmin.from("modules").select("*").in("course_id", courseIds);
      if (error) throw error;

      const rows = data || [];
      const moduleIds = rows.map((m: any) => String(m?.id || "")).filter(Boolean);

      const lessonCountByModule: Record<string, number> = {};
      const quizCountByModule: Record<string, number> = {};
      if (moduleIds.length > 0) {
        const { data: lessonRows, error: lessonErr } = await supabaseAdmin
          .from("lessons")
          .select("id,module_id")
          .in("module_id", moduleIds);
        if (lessonErr) throw lessonErr;

        const lessonIds: string[] = [];
        const moduleByLessonId: Record<string, string> = {};
        (lessonRows || []).forEach((l: any) => {
          const moduleId = String(l?.module_id || "");
          const lessonId = String(l?.id || "");
          if (!moduleId || !lessonId) return;
          lessonCountByModule[moduleId] = (lessonCountByModule[moduleId] || 0) + 1;
          moduleByLessonId[lessonId] = moduleId;
          lessonIds.push(lessonId);
        });

        if (lessonIds.length > 0) {
          const fetchQuizRows = async () => {
            const withStatus = await supabaseAdmin
              .from("quizzes")
              .select("id,lesson_id,status")
              .in("lesson_id", lessonIds);
            if (!withStatus.error) return withStatus.data || [];
            const fallback = await supabaseAdmin
              .from("quizzes")
              .select("id,lesson_id")
              .in("lesson_id", lessonIds);
            if (fallback.error) throw fallback.error;
            return fallback.data || [];
          };

          const quizRows = await fetchQuizRows();
          const isAvailable = (q: any) => {
            const status = String(q?.status || "").toLowerCase();
            if (status) return status === "published" || status === "active";
            return true;
          };

          (quizRows || []).forEach((q: any) => {
            if (!isAvailable(q)) return;
            const lessonId = String(q?.lesson_id || "");
            const moduleId = moduleByLessonId[lessonId];
            if (!moduleId) return;
            quizCountByModule[moduleId] = (quizCountByModule[moduleId] || 0) + 1;
          });
        }
      }

      const enrichedRows = rows.map((m: any) => {
        const moduleId = String(m?.id || "");
        return {
          ...m,
          total_lessons: lessonCountByModule[moduleId] ?? m?.total_lessons ?? 0,
          total_quizzes: quizCountByModule[moduleId] ?? 0,
        };
      });
      enrichedRows.sort((a: any, b: any) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
      res.json({ success: true, modules: enrichedRows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const teacherCourseDeleteHandler = async (req: any, res: any) => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!id) return res.status(400).json({ error: "Course id is required" });
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedArr = teacherIds.length > 0 ? teacherIds : [userId];

      const { data: deleted, error: delError } = await supabaseAdmin
        .from("courses")
        .delete()
        .eq("id", id)
        .in("teacher_id", scopedArr)
        .select("id");

      if (delError) {
        if (delError.code === "23503") {
          return res.status(409).json({
            error:
              "This course cannot be deleted because other data still references it. Remove linked quizzes, classes, or enrollments first.",
          });
        }
        throw delError;
      }
      if (!deleted || deleted.length === 0) {
        return res.status(404).json({
          error:
            "Course not found or you do not have permission to delete it. Use the app URL printed when you run npm run dev (Express + API on the same port).",
        });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("/api/teacher/courses delete", e);
      res.status(500).json({ error: e.message });
    }
  };

  app.delete("/api/teacher/courses/:id", teacherCourseDeleteHandler);
  app.post("/api/teacher/courses/:id/delete", teacherCourseDeleteHandler);

  const assertTeacherOwnsCourse = async (userId: string, courseId: string) => {
    const teacherIds = await getTeacherIdCandidates(userId);
    const scoped = new Set((teacherIds.length > 0 ? teacherIds : [userId]).map((x) => String(x)));
    const { data: course, error } = await supabaseAdmin
      .from("courses")
      .select("id, teacher_id")
      .eq("id", courseId)
      .maybeSingle();
    if (error) throw error;
    if (!course) return { ok: false as const, reason: "not_found" as const };
    if (!scoped.has(String(course.teacher_id ?? ""))) {
      return { ok: false as const, reason: "forbidden" as const };
    }
    return { ok: true as const, course };
  };

  app.patch("/api/teacher/courses/:id/status", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher") {
        return res.status(403).json({ error: "Forbidden: teacher role required" });
      }

      const courseId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!courseId) return res.status(400).json({ error: "Course id is required" });

      const statusRaw = String(req.body?.status || "").trim().toLowerCase();
      const nextStatus = statusRaw === "published" ? "published" : statusRaw === "draft" ? "draft" : "";
      if (!nextStatus) {
        return res.status(400).json({ error: "status must be 'published' or 'draft'" });
      }

      const ownership = await assertTeacherOwnsCourse(caller.userId, courseId);
      if (!ownership.ok) {
        if (ownership.reason === "not_found") {
          return res.status(404).json({ error: "Course not found" });
        }
        return res.status(403).json({ error: "Forbidden: you do not own this course" });
      }

      const { data, error } = await supabaseAdmin
        .from("courses")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", courseId)
        .select("*")
        .single();
      if (error) throw error;

      return res.json({ success: true, course: data });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to update course status" });
    }
  });

  app.post("/api/teacher/modules", async (req, res) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const course_id = req.body?.course_id;
      const title = req.body?.title;
      if (!course_id || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "course_id and title are required" });
      }

      const gate = await assertTeacherOwnsCourse(userId, String(course_id));
      if (!gate.ok) {
        return res.status(422).json({
          error:
            gate.reason === "not_found"
              ? "Course not found (check that this course exists in Supabase and matches your account)."
              : "You do not have access to this course.",
          code: gate.reason,
        });
      }

      const slugIn =
        typeof req.body.slug === "string" && req.body.slug.trim() ? req.body.slug.trim() : String(title)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .trim();
      const description =
        req.body.description === null || req.body.description === undefined || req.body.description === ""
          ? null
          : String(req.body.description);
      const order = Number(req.body.order) || 1;
      const status =
        req.body.status === "inactive" || req.body.status === "active" ? req.body.status : "active";

      const insertRow: Record<string, unknown> = {
        course_id: String(course_id),
        title: title.trim(),
        slug: slugIn || null,
        description,
        status,
      };
      insertRow["order"] = order;

      const { data, error } = await supabaseAdmin.from("modules").insert(insertRow).select().single();
      if (error) {
        console.error("POST /api/teacher/modules insert", error);
        const msg = [error.message, error.details, error.hint].filter((x) => typeof x === "string" && x).join(" — ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, module: data });
    } catch (e: any) {
      console.error("POST /api/teacher/modules", e);
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : String(e?.details || e || "Server error");
      res.status(500).json({ error: msg });
    }
  });

  app.patch("/api/teacher/modules/:id", async (req, res) => {
    try {
      const moduleId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!moduleId) return res.status(400).json({ error: "Module id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const { data: mod, error: mErr } = await supabaseAdmin
        .from("modules")
        .select("id, course_id")
        .eq("id", moduleId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!mod) return res.status(404).json({ error: "Module not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(mod.course_id));
      if (!gate.ok) {
        return res.status(403).json({ error: "You do not have access to this module." });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof req.body.title === "string") updates.title = req.body.title.trim();
      if (req.body.description !== undefined) {
        updates.description =
          req.body.description === null || req.body.description === "" ? null : String(req.body.description);
      }
      if (typeof req.body.slug === "string") updates.slug = req.body.slug.trim() || null;
      if (req.body.order !== undefined) updates["order"] = Number(req.body.order) || 1;
      if (req.body.status === "active" || req.body.status === "inactive") updates.status = req.body.status;
      if (typeof req.body.course_id === "string") {
        const cg = await assertTeacherOwnsCourse(userId, req.body.course_id);
        if (!cg.ok) return res.status(403).json({ error: "Invalid course for this module." });
        updates.course_id = req.body.course_id;
      }

      const { data, error } = await supabaseAdmin.from("modules").update(updates).eq("id", moduleId).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e: any) {
      console.error("PATCH /api/teacher/modules/:id", e);
      res.status(500).json({ error: e.message });
    }
  });

  const teacherModuleDeleteHandler = async (req: any, res: any) => {
    try {
      const moduleId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!moduleId) return res.status(400).json({ error: "Module id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const { data: mod, error: mErr } = await supabaseAdmin
        .from("modules")
        .select("id, course_id")
        .eq("id", moduleId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!mod) return res.status(404).json({ error: "Module not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(mod.course_id));
      if (!gate.ok) {
        return res.status(403).json({ error: "You do not have access to this module." });
      }

      const { error: dErr } = await supabaseAdmin.from("modules").delete().eq("id", moduleId);
      if (dErr) throw dErr;
      res.json({ success: true });
    } catch (e: any) {
      console.error("DELETE /api/teacher/modules/:id", e);
      res.status(500).json({ error: e.message });
    }
  };

  app.delete("/api/teacher/modules/:id", teacherModuleDeleteHandler);
  app.post("/api/teacher/modules/:id/delete", teacherModuleDeleteHandler);

  // ── Teacher Lesson routes (service-role, bypasses RLS) ──────────────────
  app.get("/api/teacher/lessons", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const userId = typeof req.query.userId === "string" && req.query.userId.trim()
        ? req.query.userId.trim()
        : caller.userId;
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];

      const { data: courseRows, error: coursesError } = await supabaseAdmin
        .from("courses").select("id").in("teacher_id", scopedIds);
      if (coursesError) throw coursesError;

      const courseIds = (courseRows || []).map((c: any) => c?.id).filter(Boolean);
      if (courseIds.length === 0) return res.json({ success: true, lessons: [] });

      const { data, error } = await supabaseAdmin
        .from("lessons").select("*").in("course_id", courseIds).order("order", { ascending: true });
      if (error) throw error;
      res.json({ success: true, lessons: data || [] });
    } catch (e: any) {
      console.error("GET /api/teacher/lessons", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.post("/api/teacher/lessons", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { course_id, module_id, title, slug, short_description, type, duration_minutes, order, status, is_free_preview } = req.body;
      if (!course_id || !module_id || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "course_id, module_id and title are required" });
      }
      const gate = await assertTeacherOwnsCourse(userId, String(course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this course." });

      const payload: Record<string, unknown> = {
        course_id: String(course_id),
        module_id: String(module_id),
        title: title.trim(),
        slug: typeof slug === "string" && slug.trim() ? slug.trim() : title.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-"),
        short_description: short_description || null,
        type: type || "video",
        duration_minutes: Number(duration_minutes) || 0,
        order: Number(order) || 1,
        status: status || "published",
        is_free_preview: Boolean(is_free_preview),
      };

      const { data, error } = await supabaseAdmin.from("lessons").insert(payload).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" — ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      console.error("POST /api/teacher/lessons", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.patch("/api/teacher/lessons/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const lessonId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!lessonId) return res.status(400).json({ error: "Lesson id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { data: lesson, error: lErr } = await supabaseAdmin
        .from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
      if (lErr) throw lErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this lesson." });

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof req.body.title === "string") updates.title = req.body.title.trim();
      if (req.body.slug !== undefined) updates.slug = req.body.slug || null;
      if (req.body.short_description !== undefined) updates.short_description = req.body.short_description || null;
      if (req.body.type !== undefined) updates.type = req.body.type;
      if (req.body.duration_minutes !== undefined) updates.duration_minutes = Number(req.body.duration_minutes) || 0;
      if (req.body.order !== undefined) updates.order = Number(req.body.order) || 1;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.is_free_preview !== undefined) updates.is_free_preview = Boolean(req.body.is_free_preview);
      if (req.body.module_id !== undefined) updates.module_id = req.body.module_id;
      if (req.body.course_id !== undefined) {
        const cg = await assertTeacherOwnsCourse(userId, req.body.course_id);
        if (!cg.ok) return res.status(403).json({ error: "Invalid course for this lesson." });
        updates.course_id = req.body.course_id;
      }

      const { data, error } = await supabaseAdmin.from("lessons").update(updates).eq("id", lessonId).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" — ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      console.error("PATCH /api/teacher/lessons/:id", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  const teacherLessonDeleteHandler = async (req: any, res: any) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const lessonId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof (req.query.userId ?? req.body?.userId) === "string"
        ? String(req.query.userId ?? req.body?.userId).trim() : "";
      if (!lessonId) return res.status(400).json({ error: "Lesson id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { data: lesson, error: lErr } = await supabaseAdmin
        .from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
      if (lErr) throw lErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found." });

      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this lesson." });

      const { error } = await supabaseAdmin.from("lessons").delete().eq("id", lessonId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      console.error("DELETE /api/teacher/lessons/:id", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  };

  app.delete("/api/teacher/lessons/:id", teacherLessonDeleteHandler);
  app.post("/api/teacher/lessons/:id/delete", teacherLessonDeleteHandler);

  const isLessonContentsTableMissing = (error: any) => {
    const hay = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      (error?.code === 'PGRST205' && hay.includes('lesson_contents')) ||
      (error?.code === '42P01' && hay.includes('lesson_contents')) ||
      hay.includes("could not find the table 'public.lesson_contents'")
    );
  };

  /** PostgREST schema cache not yet refreshed after ALTER TABLE (common right after migrations). */
  const getMissingLessonContentsColumn = (error: any): string | null => {
    const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;

    let m = msg.match(/column\s+(?:"([^"]+)"|'([^']+)'|(\w+))\s+of\s+relation\s+(?:"lesson_contents"|'lesson_contents'|lesson_contents)/i);
    if (m?.[1] || m?.[2] || m?.[3]) return String(m[1] || m[2] || m[3] || '').toLowerCase();

    m = msg.match(/\blesson_contents\.([a-zA-Z_][\w]*)\s+does\s+not\s+exist/i);
    if (m?.[1]) return String(m[1]).toLowerCase();

    m = msg.match(/column\s+\w+\.([a-zA-Z_][\w]*)\s+does\s+not\s+exist/i);
    if (m?.[1]) return String(m[1]).toLowerCase();

    m = msg.match(/Could not find the '([^']+)' column of 'lesson_contents'/i);
    if (m?.[1]) return String(m[1]).toLowerCase();

    m = msg.match(/find\s+the\s+['"]([a-zA-Z_][\w]*)['"]\s+column/i);
    if (m?.[1]) return String(m[1]).toLowerCase();

    return null;
  };

  const normalizeLessonContentRow = (row: any, index: number) => {
    const rawType = String(row?.type || row?.content_type || '').toLowerCase();
    const type =
      rawType === 'video' || rawType === 'audio' || rawType === 'pdf' || rawType === 'text'
        ? rawType
        : 'text';

    const positionCandidates = [row?.position, row?.sort_order, row?.order, row?.position_index];
    const firstPosition = positionCandidates.find((value) => Number.isFinite(Number(value)));

    const durationCandidates = [row?.duration_seconds, row?.duration];
    const firstDuration = durationCandidates.find((value) => Number.isFinite(Number(value)));

    const pageCandidates = [row?.pdf_page, row?.page];
    const firstPage = pageCandidates.find((value) => Number.isFinite(Number(value)));

    const sizeCandidates = [row?.size_bytes, row?.file_size];
    const firstSize = sizeCandidates.find((value) => Number.isFinite(Number(value)));

    return {
      ...row,
      type,
      title: row?.title ?? null,
      description: row?.description ?? row?.summary ?? null,
      storage_path: row?.storage_path ?? row?.file_path ?? row?.file_url ?? row?.content_url ?? null,
      mime_type: row?.mime_type ?? null,
      size_bytes: firstSize !== undefined ? Number(firstSize) : null,
      text_content: row?.text_content ?? row?.content_text ?? row?.content ?? null,
      pdf_page: firstPage !== undefined ? Math.max(1, Number(firstPage)) : null,
      duration_seconds: firstDuration !== undefined ? Math.max(0, Number(firstDuration)) : null,
      position: firstPosition !== undefined ? Math.max(1, Number(firstPosition)) : index + 1,
      created_at: row?.created_at ?? null,
      updated_at: row?.updated_at ?? null,
    };
  };

  const normalizeLessonContentRows = (rows: any[]) =>
    (rows || []).map((row: any, index: number) => normalizeLessonContentRow(row, index));

  const mutateLessonContentsWithFallback = async (
    execute: (payload: Record<string, unknown>) => Promise<any>,
    basePayload: Record<string, unknown>,
  ) => {
    let payload = { ...basePayload };
    let result = await execute(payload);
    for (let attempts = 0; result.error && attempts < 12; attempts += 1) {
      const missingColumn = getMissingLessonContentsColumn(result.error);
      if (!missingColumn || !Object.prototype.hasOwnProperty.call(payload, missingColumn)) break;
      const { [missingColumn]: _omit, ...nextPayload } = payload;
      payload = nextPayload;
      result = await execute(payload);
    }
    return { result, payload };
  };

  const fetchLessonContentsWithFallbackOrder = async (lessonId: string) => {
    let orderColumn: 'position' | 'created_at' | null = 'position';
    for (let attempts = 0; attempts < 4; attempts += 1) {
      let query = supabaseAdmin
        .from('lesson_contents')
        .select('*')
        .eq('lesson_id', lessonId);
      if (orderColumn) {
        query = query.order(orderColumn, { ascending: true });
      }
      const contentsRes = await query;
      if (!contentsRes.error) return contentsRes;
      if (isLessonContentsTableMissing(contentsRes.error)) return contentsRes;
      const missingColumn = getMissingLessonContentsColumn(contentsRes.error);
      if (orderColumn === 'position' && missingColumn === 'position') {
        orderColumn = 'created_at';
        continue;
      }
      if (orderColumn === 'created_at' && missingColumn === 'created_at') {
        orderColumn = null;
        continue;
      }
      return contentsRes;
    }
    return await supabaseAdmin
      .from('lesson_contents')
      .select('*')
      .eq('lesson_id', lessonId);
  };

  const isLessonProgressTableMissing = (error: any) => {
    const hay = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      (error?.code === 'PGRST205' && hay.includes('lesson_progress')) ||
      (error?.code === '42P01' && hay.includes('lesson_progress')) ||
      hay.includes("could not find the table 'public.lesson_progress'")
    );
  };

  const toLessonCompleted = (row: any) => {
    if (typeof row?.completed === 'boolean') return row.completed;
    const progressPercent = Number(row?.progress_percent);
    if (Number.isFinite(progressPercent)) return progressPercent >= 100;
    const status = String(row?.status || '').toLowerCase();
    if (status) return status === 'completed' || status === 'done';
    return false;
  };

  const fetchLessonProgressRows = async (studentId: string, lessonIds: string[]) => {
    if (!lessonIds.length) return { rows: [], storage: 'database' as const };
    const primary = await supabaseAdmin
      .from('lesson_progress')
      .select('student_id,lesson_id,completed,last_video_position,last_opened_at,updated_at')
      .eq('student_id', studentId)
      .in('lesson_id', lessonIds);
    if (!primary.error) {
      return {
        rows: (primary.data || []).map((row: any) => ({ ...row, completed: toLessonCompleted(row) })),
        storage: 'database' as const,
      };
    }
    if (isLessonProgressTableMissing(primary.error)) {
      return { rows: [], storage: 'table_missing' as const };
    }
    if (!isRecoverableSchemaColumnError(primary.error)) throw primary.error;

    const fallback = await supabaseAdmin
      .from('lesson_progress')
      .select('student_id,lesson_id,last_video_position,last_opened_at,updated_at,progress_percent,status')
      .eq('student_id', studentId)
      .in('lesson_id', lessonIds);
    if (fallback.error) {
      if (isLessonProgressTableMissing(fallback.error)) {
        return { rows: [], storage: 'table_missing' as const };
      }
      throw fallback.error;
    }
    return {
      rows: (fallback.data || []).map((row: any) => ({ ...row, completed: toLessonCompleted(row) })),
      storage: 'database' as const,
    };
  };

  const fetchLessonProgressSingle = async (studentId: string, lessonId: string) => {
    const many = await fetchLessonProgressRows(studentId, [lessonId]);
    return { row: many.rows[0] || null, storage: many.storage };
  };

  const upsertLessonProgressWithFallback = async (
    studentId: string,
    lessonId: string,
    completed: boolean,
    lastVideoPosition: number
  ) => {
    const nowIso = new Date().toISOString();
    const primary = await supabaseAdmin
      .from('lesson_progress')
      .upsert(
        {
          student_id: studentId,
          lesson_id: lessonId,
          completed,
          last_video_position: lastVideoPosition,
          last_opened_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'student_id,lesson_id' }
      )
      .select('student_id,lesson_id,completed,last_video_position,last_opened_at,updated_at')
      .single();
    if (!primary.error) {
      return { row: { ...primary.data, completed: toLessonCompleted(primary.data) }, storage: 'database' as const };
    }
    if (isLessonProgressTableMissing(primary.error)) {
      return { row: null, storage: 'table_missing' as const };
    }
    if (!isRecoverableSchemaColumnError(primary.error)) throw primary.error;

    const fallback = await supabaseAdmin
      .from('lesson_progress')
      .upsert(
        {
          student_id: studentId,
          lesson_id: lessonId,
          last_video_position: lastVideoPosition,
          progress_percent: completed ? 100 : 0,
          status: completed ? 'completed' : 'in_progress',
          last_opened_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'student_id,lesson_id' }
      )
      .select('student_id,lesson_id,last_video_position,last_opened_at,updated_at,progress_percent,status')
      .single();
    if (fallback.error) {
      if (isLessonProgressTableMissing(fallback.error)) {
        return { row: null, storage: 'table_missing' as const };
      }
      throw fallback.error;
    }
    return { row: { ...fallback.data, completed: toLessonCompleted(fallback.data) }, storage: 'database' as const };
  };

  const ensureLessonMediaBucket = async () => {
    await supabaseAdmin.storage.createBucket('lesson-media', { public: false }).catch(() => {});
  };

  // Teacher lesson content CRUD
  app.get('/api/teacher/lessons/:lessonId/contents', async (req, res) => {
    try {
      const lessonId = typeof req.params.lessonId === 'string' ? req.params.lessonId.trim() : '';
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const { data: lesson, error: lessonErr } = await supabaseAdmin
        .from('lessons')
        .select('id,course_id')
        .eq('id', lessonId)
        .maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

      const gate = await assertTeacherOwnsCourse(userId, String((lesson as any).course_id || ''));
      if (!gate.ok) return res.status(403).json({ error: 'Forbidden: no access to this lesson' });

      const contentsRes = await fetchLessonContentsWithFallbackOrder(lessonId);
      if (contentsRes.error) {
        if (isLessonContentsTableMissing(contentsRes.error)) {
          return res.json({ success: true, contents: [], storage: 'table_missing' });
        }
        throw contentsRes.error;
      }
      return res.json({
        success: true,
        contents: normalizeLessonContentRows(contentsRes.data || []),
        storage: 'database',
      });
    } catch (e: any) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ''}\n${e?.stack || ''}`),
          message: e?.message || 'Failed to load lesson contents',
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"] as string | undefined,
          source: 'api.teacher.lesson-contents.list',
        },
        res,
      );
      return res.status(500).json({ error: e?.message || 'Failed to load lesson contents' });
    }
  });

  app.post('/api/teacher/lessons/:lessonId/contents', async (req, res) => {
    try {
      const lessonId = typeof req.params.lessonId === 'string' ? req.params.lessonId.trim() : '';
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const { data: lesson, error: lessonErr } = await supabaseAdmin
        .from('lessons')
        .select('id,course_id')
        .eq('id', lessonId)
        .maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
      const gate = await assertTeacherOwnsCourse(userId, String((lesson as any).course_id || ''));
      if (!gate.ok) return res.status(403).json({ error: 'Forbidden: no access to this lesson' });

      const normalizedType = String(req.body?.type || req.body?.content_type || 'text');
      const normalizedStoragePath =
        typeof req.body?.storage_path === 'string'
          ? req.body.storage_path.trim() || null
          : typeof req.body?.file_url === 'string'
            ? req.body.file_url.trim() || null
            : null;
      const normalizedTextContent =
        typeof req.body?.text_content === 'string'
          ? req.body.text_content
          : typeof req.body?.content === 'string'
            ? req.body.content
            : null;

      const payload: Record<string, unknown> = {
        lesson_id: lessonId,
        type: normalizedType,
        content_type: normalizedType,
        title: typeof req.body?.title === 'string' ? req.body.title.trim() || null : null,
        description: typeof req.body?.description === 'string' ? req.body.description.trim() || null : null,
        storage_path: normalizedStoragePath,
        file_url: normalizedStoragePath,
        mime_type: typeof req.body?.mime_type === 'string' ? req.body.mime_type.trim() || null : null,
        size_bytes: Number.isFinite(Number(req.body?.size_bytes)) ? Number(req.body.size_bytes) : null,
        text_content: normalizedTextContent,
        content: normalizedTextContent,
        pdf_page: Number.isFinite(Number(req.body?.pdf_page)) ? Math.max(1, Number(req.body.pdf_page)) : null,
        duration_seconds: Number.isFinite(Number(req.body?.duration_seconds)) ? Math.max(0, Number(req.body.duration_seconds)) : null,
        position: Number.isFinite(Number(req.body?.position)) ? Math.max(1, Number(req.body.position)) : 1,
        updated_at: new Date().toISOString(),
      };

      const { result: ins } = await mutateLessonContentsWithFallback(
        (insPayload) => supabaseAdmin.from('lesson_contents').insert(insPayload).select('*').single(),
        payload,
      );
      if (ins.error) {
        if (isLessonContentsTableMissing(ins.error)) {
          return res.status(501).json({ error: 'lesson_contents table is not available in this database yet.' });
        }
        throw ins.error;
      }
      return res.json({ success: true, content: normalizeLessonContentRow(ins.data, 0) });
    } catch (e: any) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ''}\n${e?.stack || ''}`),
          message: e?.message || 'Failed to create lesson content',
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"] as string | undefined,
          source: 'api.teacher.lesson-contents.create',
        },
        res,
      );
      return res.status(500).json({ error: e?.message || 'Failed to create lesson content' });
    }
  });

  app.patch('/api/teacher/lessons/:lessonId/contents/:contentId', async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || '').trim();
      const contentId = String(req.params.contentId || '').trim();
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      if (!lessonId || !contentId) return res.status(400).json({ error: 'lessonId and contentId are required' });
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const { data: lesson, error: lessonErr } = await supabaseAdmin
        .from('lessons')
        .select('id,course_id')
        .eq('id', lessonId)
        .maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
      const gate = await assertTeacherOwnsCourse(userId, String((lesson as any).course_id || ''));
      if (!gate.ok) return res.status(403).json({ error: 'Forbidden: no access to this lesson' });

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (req.body?.type !== undefined || req.body?.content_type !== undefined) {
        const normalizedType = String(req.body?.type || req.body?.content_type || 'text');
        updates.type = normalizedType;
        updates.content_type = normalizedType;
      }
      if (req.body?.title !== undefined) updates.title = typeof req.body.title === 'string' ? req.body.title.trim() || null : null;
      if (req.body?.description !== undefined) updates.description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;
      if (req.body?.storage_path !== undefined || req.body?.file_url !== undefined) {
        const normalizedStoragePath =
          typeof req.body?.storage_path === 'string'
            ? req.body.storage_path.trim() || null
            : typeof req.body?.file_url === 'string'
              ? req.body.file_url.trim() || null
              : null;
        updates.storage_path = normalizedStoragePath;
        updates.file_url = normalizedStoragePath;
      }
      if (req.body?.mime_type !== undefined) updates.mime_type = typeof req.body.mime_type === 'string' ? req.body.mime_type.trim() || null : null;
      if (req.body?.size_bytes !== undefined) updates.size_bytes = Number.isFinite(Number(req.body.size_bytes)) ? Number(req.body.size_bytes) : null;
      if (req.body?.text_content !== undefined || req.body?.content !== undefined) {
        const normalizedTextContent =
          typeof req.body?.text_content === 'string'
            ? req.body.text_content
            : typeof req.body?.content === 'string'
              ? req.body.content
              : null;
        updates.text_content = normalizedTextContent;
        updates.content = normalizedTextContent;
      }
      if (req.body?.pdf_page !== undefined) updates.pdf_page = Number.isFinite(Number(req.body.pdf_page)) ? Math.max(1, Number(req.body.pdf_page)) : null;
      if (req.body?.duration_seconds !== undefined) updates.duration_seconds = Number.isFinite(Number(req.body.duration_seconds)) ? Math.max(0, Number(req.body.duration_seconds)) : null;
      if (req.body?.position !== undefined) updates.position = Number.isFinite(Number(req.body.position)) ? Math.max(1, Number(req.body.position)) : 1;

      const { result: upd } = await mutateLessonContentsWithFallback(
        (updPayload) => supabaseAdmin
          .from('lesson_contents')
          .update(updPayload)
          .eq('id', contentId)
          .eq('lesson_id', lessonId)
          .select('*')
          .single(),
        updates,
      );
      if (upd.error) {
        if (isLessonContentsTableMissing(upd.error)) {
          return res.status(501).json({ error: 'lesson_contents table is not available in this database yet.' });
        }
        throw upd.error;
      }
      return res.json({ success: true, content: normalizeLessonContentRow(upd.data, 0) });
    } catch (e: any) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ''}\n${e?.stack || ''}`),
          message: e?.message || 'Failed to update lesson content',
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"] as string | undefined,
          source: 'api.teacher.lesson-contents.update',
        },
        res,
      );
      return res.status(500).json({ error: e?.message || 'Failed to update lesson content' });
    }
  });

  app.delete('/api/teacher/lessons/:lessonId/contents/:contentId', async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || '').trim();
      const contentId = String(req.params.contentId || '').trim();
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
      if (!lessonId || !contentId) return res.status(400).json({ error: 'lessonId and contentId are required' });
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const { data: lesson, error: lessonErr } = await supabaseAdmin
        .from('lessons')
        .select('id,course_id')
        .eq('id', lessonId)
        .maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
      const gate = await assertTeacherOwnsCourse(userId, String((lesson as any).course_id || ''));
      if (!gate.ok) return res.status(403).json({ error: 'Forbidden: no access to this lesson' });

      const del = await supabaseAdmin
        .from('lesson_contents')
        .delete()
        .eq('id', contentId)
        .eq('lesson_id', lessonId);
      if (del.error) {
        if (isLessonContentsTableMissing(del.error)) {
          return res.status(501).json({ error: 'lesson_contents table is not available in this database yet.' });
        }
        throw del.error;
      }
      return res.json({ success: true });
    } catch (e: any) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ''}\n${e?.stack || ''}`),
          message: e?.message || 'Failed to delete lesson content',
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"] as string | undefined,
          source: 'api.teacher.lesson-contents.delete',
        },
        res,
      );
      return res.status(500).json({ error: e?.message || 'Failed to delete lesson content' });
    }
  });

  app.put('/api/teacher/lessons/:lessonId/contents/reorder', async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || '').trim();
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map((x: unknown) => String(x)) : [];
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (!orderedIds.length) return res.status(400).json({ error: 'orderedIds is required' });

      const { data: lesson, error: lessonErr } = await supabaseAdmin
        .from('lessons')
        .select('id,course_id')
        .eq('id', lessonId)
        .maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
      const gate = await assertTeacherOwnsCourse(userId, String((lesson as any).course_id || ''));
      if (!gate.ok) return res.status(403).json({ error: 'Forbidden: no access to this lesson' });

      for (let i = 0; i < orderedIds.length; i += 1) {
        const id = orderedIds[i];
        let reorderPayload: Record<string, unknown> = { position: i + 1, updated_at: new Date().toISOString() };
        let upd = await supabaseAdmin
          .from('lesson_contents')
          .update(reorderPayload)
          .eq('id', id)
          .eq('lesson_id', lessonId);
        for (let attempts = 0; upd.error && attempts < 4; attempts += 1) {
          const missingColumn = getMissingLessonContentsColumn(upd.error);
          if (missingColumn === 'position') {
            return res.json({ success: true, storage: 'legacy_no_position' });
          }
          if (!missingColumn || !Object.prototype.hasOwnProperty.call(reorderPayload, missingColumn)) break;
          const { [missingColumn]: _omit, ...nextPayload } = reorderPayload;
          reorderPayload = nextPayload;
          upd = await supabaseAdmin
            .from('lesson_contents')
            .update(reorderPayload)
            .eq('id', id)
            .eq('lesson_id', lessonId);
        }
        if (upd.error) {
          if (isLessonContentsTableMissing(upd.error)) {
            return res.status(501).json({ error: 'lesson_contents table is not available in this database yet.' });
          }
          throw upd.error;
        }
      }
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to reorder lesson contents' });
    }
  });

  // Signed upload URL for lesson media
  app.post('/api/teacher/lessons/:lessonId/contents/upload-url', async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || '').trim();
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
      const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType.trim() : 'application/octet-stream';
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (!fileName) return res.status(400).json({ error: 'fileName is required' });

      const { data: lesson, error: lessonErr } = await supabaseAdmin
        .from('lessons')
        .select('id,course_id')
        .eq('id', lessonId)
        .maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
      const gate = await assertTeacherOwnsCourse(userId, String((lesson as any).course_id || ''));
      if (!gate.ok) return res.status(403).json({ error: 'Forbidden: no access to this lesson' });

      const cleanName = fileName.replace(/[^\w.\-]/g, '_');
      const storagePath = `lesson/${lessonId}/${Date.now()}_${cleanName}`;
      await ensureLessonMediaBucket();
      const signed = await supabaseAdmin.storage.from('lesson-media').createSignedUploadUrl(storagePath);
      if (signed.error) throw signed.error;
      return res.json({
        success: true,
        bucket: 'lesson-media',
        storagePath,
        signedUrl: signed.data.signedUrl,
        token: signed.data.token,
        contentType,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to create upload URL' });
    }
  });

  app.get('/api/admin/analytics', async (req, res) => {
    try {
      const certsPromise = (async () => {
        const certRows = await fetchCertificatesSelectWithFallback([
          "id, status, created_at",
          "id, status",
          "id, created_at",
          "id",
        ]);
        return {
          data: certRows.map((c: any) => ({
            id: c.id,
            status: c.status ?? "issued",
            created_at: c.created_at ?? null,
          })),
          error: null,
        } as any;
      })();
      const classesPromise = (async () => {
        const selects = [
          'id, status, created_at, student_ids, capacity',
          'id, created_at, student_ids, capacity',
          'id, created_at, student_ids',
          'id, created_at',
        ];
        for (const sel of selects) {
          const res = await supabaseAdmin.from('classes').select(sel as any);
          if (!res.error) {
            return {
              data: (res.data || []).map((c: any) => ({
                id: c.id,
                status: c.status ?? 'active',
                created_at: c.created_at ?? null,
                student_ids: Array.isArray(c.student_ids) ? c.student_ids : [],
                capacity: typeof c.capacity === 'number' ? c.capacity : 0,
              })),
              error: null,
            } as any;
          }
          // Missing column in older schema; retry with a narrower select.
          if (res.error.code !== '42703') return res as any;
        }
        return { data: [], error: null } as any;
      })();
      const quizzesPromise = (async () => ({
        data: await loadQuizzesRowsForAnalytics(),
        error: null,
      }))();

      const [profilesRes, coursesRes, classesRes, quizzesRes, certsRes, assignmentsRes, lessonsRes, attendanceRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, role, created_at, status'),
        supabaseAdmin.from('courses').select('id, category, status, created_at, total_students, level'),
        classesPromise,
        quizzesPromise,
        certsPromise,
        supabaseAdmin.from('assignments').select('id, status, created_at'),
        supabaseAdmin.from('lessons').select('id, created_at, type'),
        supabaseAdmin.from('attendance').select('id, status, date'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (classesRes.error) throw classesRes.error;
      if (quizzesRes.error) throw quizzesRes.error;
      if (certsRes.error) throw certsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const profiles = profilesRes.data || [];
      const courses = coursesRes.data || [];
      const classes = classesRes.data || [];
      const quizzes = quizzesRes.data || [];
      const certs = certsRes.data || [];
      const assignments = assignmentsRes.data || [];
      const lessons = lessonsRes.data || [];
      const attendance = attendanceRes.data || [];
      const activeClasses = classes.filter((c: any) => c.status === 'active').length;
      const upcomingClasses = classes.filter((c: any) => c.status === 'upcoming').length;
      const totalClassEnrollments = classes.reduce((sum: number, c: any) => sum + ((c.student_ids || []).length || 0), 0);
      const avgClassFillRate = classes.length > 0
        ? Math.round(classes.reduce((sum: number, c: any) => {
            const enrolled = (c.student_ids || []).length || 0;
            const capacity = Number(c.capacity) > 0 ? Number(c.capacity) : 0;
            if (!capacity) return sum;
            return sum + Math.min((enrolled / capacity) * 100, 100);
          }, 0) / classes.length)
        : 0;

      const attempts = normalizeAttempts(await fetchAllAttemptRows());

      const completedAttempts = attempts.filter(a => a.status === 'completed');
      const passedAttempts = completedAttempts.filter(a => a.passed);
      const passRate = completedAttempts.length > 0 ? Math.round((passedAttempts.length / completedAttempts.length) * 100) : 0;
      const avgScore = completedAttempts.length > 0
        ? Math.round(completedAttempts.reduce((sum, a) => sum + a.score_percent, 0) / completedAttempts.length)
        : 0;

      // Last 30 days trend
      const now = new Date();
      const days30: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        days30.push(d.toISOString().slice(0, 10));
      }

      const signupMap: Record<string, number> = Object.fromEntries(days30.map(d => [d, 0]));
      profiles.filter(p => p.role === 'student').forEach(p => {
        const day = (p.created_at || '').slice(0, 10);
        if (signupMap[day] !== undefined) signupMap[day]++;
      });

      const attemptsMap: Record<string, number> = Object.fromEntries(days30.map(d => [d, 0]));
      attempts.forEach(a => {
        const day = (a.started_at || '').slice(0, 10);
        if (attemptsMap[day] !== undefined) attemptsMap[day]++;
      });

      const trend = days30.map(date => ({
        date: date.slice(5), // MM-DD
        signups: signupMap[date],
        attempts: attemptsMap[date],
      }));

      // Course by category
      const catMap: Record<string, number> = {};
      courses.forEach(c => { catMap[c.category || 'Other'] = (catMap[c.category || 'Other'] || 0) + 1; });
      const courseByCategory = Object.entries(catMap).map(([name, value]) => ({ name, value }));

      // Course by level
      const lvlMap: Record<string, number> = {};
      courses.forEach(c => { lvlMap[c.level || 'beginner'] = (lvlMap[c.level || 'beginner'] || 0) + 1; });
      const courseByLevel = Object.entries(lvlMap).map(([name, value]) => ({ name, value }));

      // Score distribution
      const buckets: Record<string, number> = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
      completedAttempts.forEach(a => {
        const pct = a.score_percent;
        if (pct <= 20) buckets['0-20']++;
        else if (pct <= 40) buckets['21-40']++;
        else if (pct <= 60) buckets['41-60']++;
        else if (pct <= 80) buckets['61-80']++;
        else buckets['81-100']++;
      });
      const scoreDistribution = Object.entries(buckets).map(([range, count]) => ({ range, count }));

      // Attendance rate
      const presentCount = attendance.filter(a => a.status === 'present').length;
      const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

      res.json({
        success: true,
        overview: {
          totalStudents: profiles.filter(p => p.role === 'student').length,
          activeStudents: profiles.filter(p => p.role === 'student' && p.status === 'active').length,
          totalTeachers: profiles.filter(p => p.role === 'teacher').length,
          totalClasses: classes.length,
          activeClasses,
          upcomingClasses,
          totalClassEnrollments,
          avgClassFillRate,
          totalCourses: courses.length,
          publishedCourses: courses.filter(c => c.status === 'published').length,
          totalQuizzes: quizzes.length,
          // Legacy DBs may not have quizzes.published; avoid column dependency.
          publishedQuizzes: quizzes.length,
          totalAttempts: attempts.length,
          completedAttempts: completedAttempts.length,
          totalCertificates: certs.filter(c => c.status === 'issued').length,
          totalLessons: lessons.length,
          totalAssignments: assignments.length,
          passRate,
          avgScore,
          attendanceRate,
          totalAttendance: attendance.length,
        },
        trend,
        courseByCategory,
        courseByLevel,
        scoreDistribution,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── REPORTS ─────────────────────────────────────────────────
  app.get('/api/admin/reports/students', async (req, res) => {
    try {
      const [studentsRes, enrollmentsResWithIds, certs] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, display_name, email, status, created_at').eq('role', 'student'),
        supabaseAdmin.from('courses').select('id, student_ids'),
        loadCertificateRowsForReports(),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      let courses: any[] = [];
      if (enrollmentsResWithIds.error) {
        if (!isMissingCoursesStudentIdsError(enrollmentsResWithIds.error)) {
          throw enrollmentsResWithIds.error;
        }
      } else {
        courses = enrollmentsResWithIds.data || [];
      }

      const students = studentsRes.data || [];
      const attempts = normalizeAttempts(await fetchAllAttemptRows());

      const enrollmentMap: Record<string, number> = {};
      courses.forEach((c: any) => {
        (c.student_ids || []).forEach((sid: string) => {
          enrollmentMap[sid] = (enrollmentMap[sid] || 0) + 1;
        });
      });

      const report = students.map(s => {
        const myAttempts = attempts.filter(a => a.student_id === s.id && a.status === 'completed');
        const avgScore = myAttempts.length > 0
          ? Math.round(myAttempts.reduce((sum, a) => sum + a.score_percent, 0) / myAttempts.length)
          : null;
        return {
          id: s.id,
          name: s.display_name,
          email: s.email,
          status: s.status,
          joinedAt: s.created_at,
          enrolledCourses: enrollmentMap[s.id] || 0,
          totalAttempts: attempts.filter(a => a.student_id === s.id).length,
          completedQuizzes: myAttempts.length,
          avgScore,
          certificates: certs.filter((c) => c.student_id === s.id && c.status === 'issued').length,
        };
      });

      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/reports/courses', async (req, res) => {
    try {
      const [coursesResWithIds, lessonsRes, certs] = await Promise.all([
        supabaseAdmin.from('courses').select('id, title, category, level, status, created_at, total_students, teacher_id, student_ids'),
        supabaseAdmin.from('lessons').select('course_id'),
        loadCertificateRowsForReports(),
      ]);

      if (lessonsRes.error) throw lessonsRes.error;
      let courses: any[] = [];
      let usesStudentIds = true;
      if (coursesResWithIds.error) {
        if (!isMissingCoursesStudentIdsError(coursesResWithIds.error)) throw coursesResWithIds.error;
        const coursesResFallback = await supabaseAdmin
          .from('courses')
          .select('id, title, category, level, status, created_at, total_students, teacher_id');
        if (coursesResFallback.error) throw coursesResFallback.error;
        courses = coursesResFallback.data || [];
        usesStudentIds = false;
      } else {
        courses = coursesResWithIds.data || [];
      }

      const lessonsList = lessonsRes.data || [];

      const report = courses.map(c => ({
        id: c.id,
        title: c.title,
        category: c.category || 'Other',
        level: c.level || 'beginner',
        status: c.status,
        createdAt: c.created_at,
        enrolledStudents: usesStudentIds
          ? (c.student_ids || []).length
          : Number(c.total_students || 0),
        totalLessons: lessonsList.filter((l: any) => l.course_id === c.id).length,
        certificatesIssued: certs.filter((cert) => cert.course_id === c.id && cert.status === 'issued').length,
      }));

      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/quizzes', async (req, res) => {
    try {
      const [quizzesRes, coursesRes, teachersRes, questionsRes] = await Promise.all([
        supabaseAdmin.from('quizzes').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.from('courses').select('id,title,teacher_id'),
        supabaseAdmin.from('teachers').select('user_id,first_name,last_name'),
        supabaseAdmin.from('questions').select('quiz_id'),
      ]);

      if (quizzesRes.error) throw quizzesRes.error;
      if (coursesRes.error) throw coursesRes.error;

      const teacherMap: Record<string, string> = {};
      if (!teachersRes.error) {
        (teachersRes.data || []).forEach((t: any) => {
          const fullName = `${String(t?.first_name || '').trim()} ${String(t?.last_name || '').trim()}`.trim();
          teacherMap[String(t?.user_id || '')] = fullName || '—';
        });
      }

      const courseMap: Record<string, { name: string; teacher: string }> = {};
      const courseOptions: { id: string; name: string }[] = [];
      (coursesRes.data || []).forEach((c: any) => {
        const cid = String(c?.id || '');
        if (!cid) return;
        const name = String(c?.title || 'Untitled');
        courseMap[cid] = { name, teacher: teacherMap[String(c?.teacher_id || '')] || '—' };
        courseOptions.push({ id: cid, name });
      });

      const questionCountMap: Record<string, number> = {};
      if (!questionsRes.error) {
        (questionsRes.data || []).forEach((q: any) => {
          const qid = String(q?.quiz_id || '');
          if (!qid) return;
          questionCountMap[qid] = (questionCountMap[qid] || 0) + 1;
        });
      }

      const quizzes = (quizzesRes.data || []).map((q: any) => {
        const qid = String(q?.id || '');
        const courseId = String(q?.course_id || '');
        return {
          id: qid,
          title: String(q?.title || 'Untitled Quiz'),
          description: typeof q?.description === 'string' ? q.description : undefined,
          courseId,
          courseName: courseMap[courseId]?.name || 'Unknown',
          teacherName: courseMap[courseId]?.teacher || '—',
          questionCount: questionCountMap[qid] || 0,
          timeLimit: Number(q?.time_limit || 0),
          published: Boolean(q?.published),
          settings: (q?.settings && typeof q.settings === 'object') ? q.settings : {},
          createdAt: String(q?.created_at || ''),
        };
      });

      return res.json({ success: true, quizzes, courses: courseOptions });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load admin quizzes' });
    }
  });

  app.get('/api/admin/reports/quizzes', async (req, res) => {
    try {
      const { data: quizzesData, error: quizzesError } = await supabaseAdmin
        .from('quizzes')
        .select('*');
      if (quizzesError) throw quizzesError;

      const quizzes = quizzesData || [];
      const passingScoreByQuiz = quizzes.reduce((acc: Record<string, number>, q: any) => {
        const value = Number(q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark);
        acc[q.id] = Number.isFinite(value) ? value : 50;
        return acc;
      }, {});
      const attempts = normalizeAttempts(await fetchAllAttemptRows(), passingScoreByQuiz);

      const report = quizzes.map(q => {
        const myAttempts = attempts.filter(a => a.quiz_id === q.id);
        const completed = myAttempts.filter(a => a.status === 'completed');
        const passed = completed.filter(a => a.passed);
        const avgScore = completed.length > 0
          ? Math.round(completed.reduce((sum, a) => sum + a.score_percent, 0) / completed.length)
          : null;
        const uniqueStudents = new Set(myAttempts.map(a => a.student_id)).size;
        return {
          id: q.id,
          title: q.title,
          published: q.published,
          createdAt: q.created_at,
          passingScore: Number(q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark) || 50,
          totalAttempts: myAttempts.length,
          completedAttempts: completed.length,
          passedAttempts: passed.length,
          passRate: completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : null,
          avgScore,
          uniqueStudents,
        };
      });

      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/reports/roles', async (req, res) => {
    try {
      const [profilesRes, coursesRes, quizzesRes, certs] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, role, status, created_at'),
        supabaseAdmin.from('courses').select('teacher_id'),
        supabaseAdmin.from('quizzes').select('teacher_id'),
        loadCertificateRowsForReports(),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (quizzesRes.error) throw quizzesRes.error;

      const profiles = profilesRes.data || [];
      const courses = coursesRes.data || [];
      const quizzes = quizzesRes.data || [];
      const attempts = normalizeAttempts(await fetchAllAttemptRows());

      const roleByUserId: Record<string, 'admin' | 'teacher' | 'student'> = {};
      profiles.forEach((p: any) => {
        const role = p?.role === 'admin' || p?.role === 'teacher' ? p.role : 'student';
        roleByUserId[p.id] = role;
      });

      const roleStats: Record<'admin' | 'teacher' | 'student', {
        role: 'admin' | 'teacher' | 'student';
        users: number;
        activeUsers: number;
        newUsers30d: number;
        coursesCreated: number;
        quizzesCreated: number;
        attempts: number;
        certificates: number;
      }> = {
        admin: { role: 'admin', users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
        teacher: { role: 'teacher', users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
        student: { role: 'student', users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
      };

      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      profiles.forEach((p: any) => {
        const role = p?.role === 'admin' || p?.role === 'teacher' ? p.role : 'student';
        roleStats[role].users += 1;
        if (p?.status === 'active') roleStats[role].activeUsers += 1;
        const created = p?.created_at ? new Date(p.created_at).getTime() : 0;
        if (created > 0 && now - created <= thirtyDaysMs) roleStats[role].newUsers30d += 1;
      });

      courses.forEach((c: any) => {
        const ownerRole = roleByUserId[c?.teacher_id] || 'teacher';
        roleStats[ownerRole].coursesCreated += 1;
      });

      quizzes.forEach((q: any) => {
        const ownerRole = roleByUserId[q?.teacher_id] || 'teacher';
        roleStats[ownerRole].quizzesCreated += 1;
      });

      attempts.forEach((a: any) => {
        const role = roleByUserId[a?.student_id] || 'student';
        roleStats[role].attempts += 1;
      });

      certs.forEach((c: any) => {
        if (c?.status !== 'issued') return;
        const role = roleByUserId[c?.student_id] || 'student';
        roleStats[role].certificates += 1;
      });

      const report = [roleStats.admin, roleStats.teacher, roleStats.student];
      res.json({ success: true, report });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PAYMENTS ────────────────────────────────────────────────
  app.get('/api/admin/payments', async (req, res) => {
    try {
      const [teachersRes, studentsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, display_name, email').eq('role', 'teacher'),
        supabaseAdmin.from('profiles').select('id, display_name, email, teacher_id').eq('role', 'student'),
      ]);

      if (teachersRes.error) throw teachersRes.error;
      if (studentsRes.error) throw studentsRes.error;

      const paymentsRes = await supabaseAdmin
        .from('payments')
        .select('id, teacher_id, student_id, amount, currency, status, method, payment_date, description, reference, created_at')
        .order('payment_date', { ascending: false });

      let paymentsRows: any[] = [];
      if (paymentsRes.error) {
        const message = String(paymentsRes.error?.message || '');
        const isMissingPaymentsTable =
          paymentsRes.error?.code === '42P01' ||
          message.includes("Could not find the table 'public.payments'") ||
          message.includes("Could not find the table 'payments'");
        if (!isMissingPaymentsTable) throw paymentsRes.error;
      } else {
        paymentsRows = paymentsRes.data || [];
      }

      const teacherMap: Record<string, { name: string; email: string }> = {};
      (teachersRes.data || []).forEach((t: any) => {
        teacherMap[t.id] = {
          name: t.display_name || t.email || 'Unknown teacher',
          email: t.email || '',
        };
      });

      const studentMap: Record<string, { name: string; email: string; teacher_id: string | null }> = {};
      (studentsRes.data || []).forEach((s: any) => {
        studentMap[s.id] = {
          name: s.display_name || s.email || 'Unknown student',
          email: s.email || '',
          teacher_id: s.teacher_id || null,
        };
      });

      const payments = paymentsRows.map((p: any) => ({
        ...p,
        teacher_name: p.teacher_id ? (teacherMap[p.teacher_id]?.name || '—') : '—',
        student_name: p.student_id ? (studentMap[p.student_id]?.name || '—') : '—',
        student_email: p.student_id ? (studentMap[p.student_id]?.email || '') : '',
      }));

      const teacherOptions = (teachersRes.data || []).map((t: any) => ({
        id: t.id,
        name: t.display_name || t.email || 'Unnamed teacher',
      }));
      const studentOptions = (studentsRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.display_name || s.email || 'Unnamed student',
        email: s.email || '',
        teacherId: s.teacher_id || null,
      }));

      res.json({ success: true, payments, teacherOptions, studentOptions });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load payments' });
    }
  });

  app.post('/api/admin/payments', async (req, res) => {
    try {
      const {
        teacher_id,
        student_id,
        amount,
        currency = 'USD',
        status = 'completed',
        method = 'bank',
        payment_date,
        description = '',
        reference = '',
      } = req.body || {};

      if (!teacher_id) return res.status(400).json({ error: 'Teacher is required' });
      if (!student_id) return res.status(400).json({ error: 'Student is required' });
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero' });
      }
      if (!payment_date) return res.status(400).json({ error: 'Payment date is required' });

      const { data: studentProfile, error: studentErr } = await supabaseAdmin
        .from('profiles')
        .select('id, teacher_id')
        .eq('id', student_id)
        .eq('role', 'student')
        .single();
      if (studentErr || !studentProfile) return res.status(400).json({ error: 'Invalid student selected' });
      if (studentProfile.teacher_id !== teacher_id) {
        return res.status(400).json({ error: 'Selected student does not belong to this teacher' });
      }

      const { data, error } = await supabaseAdmin
        .from('payments')
        .insert({
          teacher_id,
          student_id,
          amount: numericAmount,
          currency,
          status,
          method,
          payment_date,
          description,
          reference,
        })
        .select('id')
        .single();
      if (error) throw error;

      const paymentId = data?.id as string | undefined;
      if (paymentId) {
        const invStatus = paymentStatusToInvoiceRowStatus(String(status));
        const issued = String(payment_date).slice(0, 10);
        let due = issued;
        if (invStatus === 'paid') due = issued;
        else if (invStatus === 'pending') due = addDaysToYmd(issued, 14);
        else due = addDaysToYmd(issued, 30);

        const paidDate = invStatus === 'paid' ? issued : null;
        const lineDesc =
          String(description || '').trim() ||
          `Payment — ${String(method).replace(/_/g, ' ')}`;
        const courseTitle =
          String(description || '').trim().slice(0, 160) || 'Program / services';
        const items = [{ description: lineDesc, qty: 1, unit_price: numericAmount }];
        const noteLines = ['Auto-generated from payment registration.'];
        if (String(reference || '').trim()) noteLines.push(`Reference: ${String(reference).trim()}`);
        if (String(status) !== 'completed') noteLines.push(`Payment record status: ${String(status)}.`);

        let invoiceNumber: string;
        try {
          invoiceNumber = await nextInvoiceNumberForPaymentDate(issued);
        } catch (invNumErr: any) {
          await supabaseAdmin.from('payments').delete().eq('id', paymentId);
          throw invNumErr;
        }

        const invInsert = await supabaseAdmin
          .from('invoices')
          .insert({
            payment_id: paymentId,
            invoice_number: invoiceNumber,
            teacher_id,
            student_id,
            currency,
            status: invStatus,
            issued_date: issued,
            due_date: due,
            paid_date: paidDate,
            course_title: courseTitle,
            items,
            notes: noteLines.join('\n'),
            student_address: '',
            student_phone: '',
          })
          .select('id, invoice_number')
          .single();

        if (invInsert.error) {
          await supabaseAdmin.from('payments').delete().eq('id', paymentId);
          const im = String(invInsert.error?.message || '');
          if (
            invInsert.error?.code === '42P01' ||
            im.includes("Could not find the table 'public.invoices'")
          ) {
            return res.status(400).json({
              error:
                "Could not create invoice: table 'invoices' is missing. Run sql/add_invoices_table.sql in Supabase, then try again.",
            });
          }
          throw invInsert.error;
        }

        await dispatchNotifyEvent('paymentReceived', {
          studentId: String(student_id),
          teacherId: String(teacher_id),
          paymentId: String(paymentId),
          amount: numericAmount,
          currency,
        });

        return res.json({
          success: true,
          id: paymentId,
          invoice_id: invInsert.data?.id,
          invoice_number: invInsert.data?.invoice_number,
        });
      }

      await dispatchNotifyEvent('paymentReceived', {
        studentId: String(student_id),
        teacherId: String(teacher_id),
        paymentId: data?.id ? String(data.id) : undefined,
        amount: numericAmount,
        currency,
      });

      res.json({ success: true, id: data?.id });
    } catch (e: any) {
      const message = String(e?.message || '');
      if (
        e?.code === '42P01' ||
        message.includes("Could not find the table 'public.payments'") ||
        message.includes("Could not find the table 'payments'")
      ) {
        return res.status(400).json({
          error:
            "Payments are not available yet because table 'payments' is missing. Run sql/add_payments_table.sql in Supabase, then try again.",
        });
      }
      res.status(500).json({ error: e.message || 'Failed to create payment' });
    }
  });

  app.get('/api/admin/invoices', async (req, res) => {
    try {
      const invRes = await supabaseAdmin
        .from('invoices')
        .select(
          'id, payment_id, invoice_number, teacher_id, student_id, currency, status, issued_date, due_date, paid_date, course_title, items, notes, student_address, student_phone, created_at',
        )
        .order('issued_date', { ascending: false });

      if (invRes.error) {
        const msg = String(invRes.error?.message || '');
        if (
          invRes.error?.code === '42P01' ||
          msg.includes("Could not find the table 'public.invoices'")
        ) {
          return res.json({ success: true, invoices: [] });
        }
        throw invRes.error;
      }

      const rows = invRes.data || [];
      const ids = new Set<string>();
      rows.forEach((r: any) => {
        if (r.student_id) ids.add(r.student_id);
        if (r.teacher_id) ids.add(r.teacher_id);
      });
      const idList = [...ids];
      let profMap: Record<string, { name: string; email: string }> = {};
      if (idList.length) {
        const { data: profs, error: pErr } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name, email')
          .in('id', idList);
        if (pErr) throw pErr;
        (profs || []).forEach((p: any) => {
          profMap[p.id] = {
            name: p.display_name || p.email || 'Unknown',
            email: p.email || '',
          };
        });
      }

      const invoices = rows.map((r: any) => {
        const dueYmd = String(r.due_date || '').slice(0, 10);
        const displayStatus = resolveInvoiceDisplayStatus(String(r.status || 'draft'), dueYmd);
        const rawItems = Array.isArray(r.items) ? r.items : [];
        const items = rawItems.map((it: any) => ({
          description: String(it?.description ?? ''),
          qty: Math.max(1, Number(it?.qty) || 1),
          unit_price: Number(it?.unit_price) || 0,
        }));
        const stu = profMap[r.student_id] || { name: '—', email: '' };
        const tea = profMap[r.teacher_id] || { name: '—', email: '' };
        return {
          id: r.id,
          payment_id: r.payment_id,
          invoice_number: r.invoice_number,
          student_name: stu.name,
          student_email: stu.email,
          student_address: r.student_address || '',
          student_phone: r.student_phone || '',
          teacher_name: tea.name,
          teacher_email: tea.email,
          course_title: r.course_title || '',
          status: displayStatus,
          currency: r.currency || 'USD',
          issued_date: String(r.issued_date || '').slice(0, 10),
          due_date: dueYmd,
          paid_date: r.paid_date ? String(r.paid_date).slice(0, 10) : null,
          items,
          notes: r.notes || '',
        };
      });

      res.json({ success: true, invoices });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load invoices' });
    }
  });

  // ── TEACHER LIVE SESSIONS ───────────────────────────────────

  // Create quiz (service role) — bypasses RLS; caller must own the course.
  const teacherQuizzesPostHandler = async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const courseId = typeof body.course_id === "string" ? body.course_id.trim() : "";
      const title = typeof body.title === "string" ? body.title.trim() : String(body.title ?? "").trim();
      if (!courseId) return res.status(400).json({ error: "course_id is required" });
      if (!title) return res.status(400).json({ error: "title is required" });

      const { data: course, error: cErr } = await supabaseAdmin
        .from("courses")
        .select("id, teacher_id")
        .eq("id", courseId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!course?.id) return res.status(404).json({ error: "Course not found" });

      if (caller.role !== "admin") {
        const scopedIds = await getTeacherIdCandidates(caller.userId);
        const tid = course.teacher_id != null ? String(course.teacher_id) : "";
        if (!tid || (!scopedIds.includes(tid) && tid !== caller.userId)) {
          return res.status(403).json({ error: "Forbidden: you do not own this course" });
        }
      }

      const description =
        typeof body.description === "string"
          ? body.description
          : body.description != null
            ? String(body.description)
            : "";
      const payload: Record<string, unknown> = {
        title,
        description,
        course_id: courseId,
        teacher_id: course.teacher_id != null ? String(course.teacher_id) : caller.userId,
        time_limit:
          typeof body.time_limit === "number" && !Number.isNaN(body.time_limit)
            ? body.time_limit
            : Number(body.time_limit) || 0,
      };
      if (body.type !== undefined && body.type !== null) payload.type = String(body.type);
      if (body.pass_mark !== undefined && body.pass_mark !== null && !Number.isNaN(Number(body.pass_mark))) {
        payload.pass_mark = Number(body.pass_mark);
      }
      if (body.max_attempts !== undefined && body.max_attempts !== null && !Number.isNaN(Number(body.max_attempts))) {
        payload.max_attempts = Number(body.max_attempts);
      }
      if (body.published !== undefined) payload.published = Boolean(body.published);
      if (body.settings !== undefined && body.settings !== null) payload.settings = body.settings;

      const { data: inserted, error: insErr } = await insertCompatibleQuizAdmin(payload, caller.userId);
      if (insErr) throw insErr;
      if (!inserted?.id) return res.status(500).json({ error: "Quiz insert returned no id" });
      res.json({ success: true, quiz: { id: inserted.id } });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to create quiz" });
    }
  };
  app.post("/api/teacher/quizzes", teacherQuizzesPostHandler);
  app.post("/api/teacher/quizzes/", teacherQuizzesPostHandler);

  /** Load quiz questions for edit (service role) — bypasses RLS; teachers may only read quizzes for courses they own. */
  app.get("/api/teacher/quizzes/:quizId/questions", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }

      const quizId = typeof req.params.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id is required" });

      const { data: quizRow, error: qErr } = await supabaseAdmin
        .from("quizzes")
        .select("id, course_id")
        .eq("id", quizId)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!quizRow?.id) return res.status(404).json({ error: "Quiz not found." });

      if (caller.role !== "admin") {
        const gate = await assertTeacherOwnsCourse(caller.userId, String(quizRow.course_id));
        if (!gate.ok) {
          return res.status(403).json({ error: "You do not have access to this quiz." });
        }
      }

      let qRes = await supabaseAdmin
        .from("questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("order", { ascending: true })
        .order("created_at", { ascending: true });

      if (qRes.error) {
        qRes = await supabaseAdmin
          .from("questions")
          .select("*")
          .eq("quiz_id", quizId)
          .order("created_at", { ascending: true });
      }

      if (qRes.error) {
        qRes = await supabaseAdmin
          .from("questions")
          .select("*")
          .eq("quiz_id", quizId);
      }

      if (qRes.error) throw qRes.error;
      res.json({ success: true, questions: qRes.data || [] });
    } catch (e: any) {
      console.error("GET /api/teacher/quizzes/:quizId/questions", e);
      res.status(500).json({ error: e?.message || "Failed to load questions" });
    }
  });

  /** Replace all questions for a quiz (service role — bypasses RLS; browser insert often fails on questions policy). */
  app.post("/api/teacher/quizzes/:quizId/save-questions", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const quizId = typeof req.params.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id is required" });

      const rows = (req.body as { questions?: unknown })?.questions;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "Body must include questions: []" });
      }

      const { data: quizRow, error: qErr } = await supabaseAdmin
        .from("quizzes")
        .select("id, course_id")
        .eq("id", quizId)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!quizRow?.id) return res.status(404).json({ error: "Quiz not found." });

      if (caller.role !== "admin") {
        const gate = await assertTeacherOwnsCourse(caller.userId, String(quizRow.course_id));
        if (!gate.ok) {
          return res.status(403).json({ error: "You do not have access to this quiz." });
        }
      }

      const { error: delErr } = await supabaseAdmin.from("questions").delete().eq("quiz_id", quizId);
      if (delErr) throw delErr;

      if (rows.length === 0) {
        return res.json({ success: true });
      }

      const normalizeQuestionBody = (r: Record<string, unknown>) => {
        const raw = r.text ?? r.question_text;
        if (typeof raw === "string" && raw.trim()) return raw.trim();
        if (typeof raw === "string") return raw.length ? raw : " ";
        return " ";
      };

      const buildInsertRows = (mode: "text" | "question_text" | "both") =>
        rows.map((r: Record<string, unknown>, idx: number) => {
          const orderVal =
            typeof r.order === "number"
              ? r.order
              : typeof r["order"] === "number"
                ? (r["order"] as number)
                : idx;
          const qtext = normalizeQuestionBody(r);
          const row: Record<string, unknown> = {
            quiz_id: quizId,
            type: typeof r.type === "string" && r.type.trim() ? r.type.trim() : "multiple-choice",
            media_url: r.media_url ?? null,
            media_type: r.media_type ?? null,
            reading_passage: r.reading_passage ?? null,
            options: r.options ?? null,
            correct_answer: r.correct_answer ?? null,
            points: (() => {
              const raw = r.points;
              const n =
                typeof raw === "number" && !Number.isNaN(raw) ? raw : Number(raw);
              return Number.isFinite(n) ? n : 1;
            })(),
            explanation: r.explanation ?? null,
            order: orderVal,
          };
          if (mode === "both") {
            row.text = qtext;
            row.question_text = qtext;
          } else {
            row[mode] = qtext;
          }
          return row;
        });

      const errToStr = (e: typeof insErr) =>
        e
          ? [e.message, e.details, e.hint, (e as { code?: string }).code].filter(Boolean).join(" — ")
          : "";

      let insertRows = buildInsertRows("text");
      let { error: insErr } = await supabaseAdmin.from("questions").insert(insertRows);

      let errStr = errToStr(insErr);

      const looksLikeQuestionTextMissing =
        insErr &&
        (/question_text/i.test(errStr) ||
          /null value[^\n]*question_text/i.test(errStr) ||
          /column[^\n]*\btext\b.*does not exist|PGRST204[^\n]*\btext\b/i.test(errStr));

      if (looksLikeQuestionTextMissing) {
        insertRows = buildInsertRows("question_text");
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(insertRows));
        errStr = errToStr(insErr);
      }

      const looksLikeTextMissingAfterLegacy =
        insErr &&
        (/null value[^\n]*\btext\b/i.test(errStr) ||
          /column[^\n]*question_text\b.*does not exist|PGRST204[^\n]*question_text/i.test(errStr));

      if (looksLikeTextMissingAfterLegacy) {
        insertRows = buildInsertRows("both");
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(insertRows));
      }

      if (insErr) {
        const msg = [insErr.message, insErr.details, insErr.hint].filter(Boolean).join(" — ") || insErr.code || "Insert failed";
        return res.status(400).json({ error: msg });
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("POST /api/teacher/quizzes/:quizId/save-questions", e);
      res.status(500).json({ error: e?.message || "Failed to save questions" });
    }
  });

  /** Delete quiz + attempts/questions (service role). Teachers may only delete quizzes for courses they own. */
  const teacherQuizDeleteHandler = async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const quizId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id is required" });

      const { data: quizRow, error: qErr } = await supabaseAdmin
        .from("quizzes")
        .select("id, course_id")
        .eq("id", quizId)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!quizRow?.id) return res.status(404).json({ error: "Quiz not found." });

      if (caller.role !== "admin") {
        const gate = await assertTeacherOwnsCourse(caller.userId, String(quizRow.course_id));
        if (!gate.ok) {
          return res.status(403).json({ error: "You do not have access to this quiz." });
        }
      }

      const { error: qDelErr } = await supabaseAdmin.from("questions").delete().eq("quiz_id", quizId);
      if (qDelErr) throw qDelErr;

      const qaRes = await supabaseAdmin.from("quiz_attempts").delete().eq("quiz_id", quizId);
      if (qaRes.error) {
        const msg = String(qaRes.error.message || "");
        const code = String((qaRes.error as { code?: string }).code || "");
        const missingTable =
          code === "42P01" ||
          code === "PGRST205" ||
          /could not find the table|does not exist/i.test(msg);
        if (!missingTable) throw qaRes.error;
      }

      const attRes = await supabaseAdmin.from("attempts").delete().eq("quiz_id", quizId);
      if (attRes.error) {
        const code = String((attRes.error as { code?: string }).code || "");
        const msg = String(attRes.error.message || "");
        const missingTable =
          code === "42P01" ||
          code === "PGRST205" ||
          /does not exist|could not find the table/i.test(msg);
        if (!missingTable) throw attRes.error;
      }

      const { data: deleted, error: dErr } = await supabaseAdmin
        .from("quizzes")
        .delete()
        .eq("id", quizId)
        .select("id");
      if (dErr) {
        if (dErr.code === "23503") {
          return res.status(409).json({
            error:
              "This quiz cannot be deleted because something still references it (e.g. a lesson). Remove that link first.",
          });
        }
        throw dErr;
      }
      if (!deleted?.length) {
        return res.status(404).json({ error: "Quiz not found or already deleted." });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("DELETE /api/teacher/quizzes/:id", e);
      res.status(500).json({ error: e?.message || "Failed to delete quiz" });
    }
  };
  app.delete("/api/teacher/quizzes/:id", teacherQuizDeleteHandler);
  app.post("/api/teacher/quizzes/:id/delete", teacherQuizDeleteHandler);

  // Admin users list for dashboard user management (teachers only)
  app.get('/api/admin/users', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, display_name, role, teacher_id, status, created_at')
        .eq('role', 'teacher')
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ success: true, users: data || [] });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'Failed to load users' });
    }
  });

  /** Set teacher status; disabling a teacher also disables profiles with teacher_id = that teacher. */
  app.patch('/api/admin/users/:userId/status', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });

      const userId = String(req.params.userId || '').trim();
      const status = req.body?.status;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ error: 'status must be active or inactive' });
      }

      const { data: profile, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', userId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: 'User not found' });
      if (profile.role !== 'teacher') {
        return res.status(400).json({ error: 'Only teacher accounts can be updated from this action' });
      }

      const { error: uErr } = await supabaseAdmin.from('profiles').update({ status }).eq('id', userId);
      if (uErr) throw uErr;

      let cascadedCount = 0;
      if (status === 'inactive') {
        const { data: students, error: cErr } = await supabaseAdmin
          .from('profiles')
          .update({ status: 'inactive' })
          .eq('teacher_id', userId)
          .select('id');
        if (cErr) throw cErr;
        cascadedCount = students?.length ?? 0;
      }

      res.json({ success: true, cascadedCount });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message || 'Failed to update status' });
    }
  });

  // Admin can update any student profile.
  app.patch('/api/admin/students/:studentId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });

      const studentId = String(req.params.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId required' });

      const { data: profile, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', studentId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: 'Student not found' });
      if (profile.role !== 'student') return res.status(400).json({ error: 'Target user is not a student' });

      const body = (req.body || {}) as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      if (typeof body.display_name === 'string') update.display_name = body.display_name.trim();
      if (typeof body.email === 'string') update.email = body.email.trim();
      if (body.status === 'active' || body.status === 'inactive') update.status = body.status;
      if (typeof body.teacher_id === 'string' || body.teacher_id === null) update.teacher_id = body.teacher_id;
      if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(update)
        .eq('id', studentId)
        .select('id, email, display_name, role, teacher_id, status, created_at')
        .single();
      if (error) throw error;
      res.json({ success: true, student: data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to update student' });
    }
  });

  app.delete('/api/admin/students/:studentId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
      const studentId = String(req.params.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId required' });

      const { data: profile, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', studentId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: 'Student not found' });
      if (profile.role !== 'student') return res.status(400).json({ error: 'Target user is not a student' });

      const { error } = await supabaseAdmin.from('profiles').delete().eq('id', studentId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to delete student' });
    }
  });

  // Admin can update/delete any teacher profile.
  app.patch('/api/admin/teachers/:teacherId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
      const teacherId = String(req.params.teacherId || '').trim();
      if (!teacherId) return res.status(400).json({ error: 'teacherId required' });

      const { data: profile, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', teacherId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: 'Teacher not found' });
      if (profile.role !== 'teacher') return res.status(400).json({ error: 'Target user is not a teacher' });

      const body = (req.body || {}) as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      if (typeof body.display_name === 'string') update.display_name = body.display_name.trim();
      if (typeof body.email === 'string') update.email = body.email.trim();
      if (body.status === 'active' || body.status === 'inactive') update.status = body.status;
      if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(update)
        .eq('id', teacherId)
        .select('id, email, display_name, role, status, created_at')
        .single();
      if (error) throw error;
      res.json({ success: true, teacher: data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to update teacher' });
    }
  });

  app.delete('/api/admin/teachers/:teacherId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
      const teacherId = String(req.params.teacherId || '').trim();
      if (!teacherId) return res.status(400).json({ error: 'teacherId required' });

      const { data: profile, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', teacherId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: 'Teacher not found' });
      if (profile.role !== 'teacher') return res.status(400).json({ error: 'Target user is not a teacher' });

      const { error } = await supabaseAdmin.from('profiles').delete().eq('id', teacherId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to delete teacher' });
    }
  });

  // List sessions for logged-in teacher (teacher or admin only)
  app.get('/api/teacher/live-sessions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: teacher or admin role required' });
      }
      const { host_id } = req.query;
      // Teachers can only list their own; admins can filter by host_id
      const effectiveHostId = caller.role === 'admin' ? (host_id as string | undefined) : caller.userId;
      let query = supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .order('scheduled_at', { ascending: false });
      if (effectiveHostId) query = query.eq('host_id', effectiveHostId);
      const { data, error } = await query;
      if (error) throw error;

      const ids = (data || []).map((s: { id: string }) => s.id);
      const invitedCounts: Record<string, number> = {};
      const joinedCounts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: pData, error: pErr } = await supabaseAdmin
          .from('session_participants')
          .select('session_id,joined_at')
          .in('session_id', ids);
        if (pErr && !isSessionParticipantsTableMissing(pErr)) throw pErr;
        (pData || []).forEach((p: { session_id: string; joined_at: string | null }) => {
          invitedCounts[p.session_id] = (invitedCounts[p.session_id] || 0) + 1;
          if (p.joined_at) joinedCounts[p.session_id] = (joinedCounts[p.session_id] || 0) + 1;
        });
      }

      const sessions = (data || []).map((s: Record<string, unknown>) => ({
        ...s,
        participant_count: s.status === 'ended'
          ? (joinedCounts[s.id as string] || 0)
          : (invitedCounts[s.id as string] || 0),
        invited_count: invitedCounts[s.id as string] || 0,
        joined_count: joinedCounts[s.id as string] || 0,
      }));
      res.json({ success: true, sessions });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Create session
  app.post('/api/teacher/live-sessions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: teacher role required' });

      const { participant_ids, class_id, class_ids, ...sessionData } = req.body;
      const classIds: string[] = Array.isArray(class_ids)
        ? class_ids.map((x: unknown) => String(x || '').trim()).filter(Boolean)
        : class_id
          ? [String(class_id).trim()]
          : [];
      // Force host_id to the authenticated caller
      const payload: Record<string, unknown> = {
        ...sessionData,
        host_id: caller.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: session, error } = await supabaseAdmin
        .from('live_sessions').insert(payload).select().single();
      if (error) throw error;

      const inviteIds: string[] = Array.isArray(participant_ids) ? [...participant_ids] : [];

      for (const cid of classIds) {
        const { data: classRow } = await supabaseAdmin
          .from('classes')
          .select('student_ids, course_id')
          .eq('id', cid)
          .maybeSingle();
        const classStudentIds: string[] = Array.isArray(classRow?.student_ids)
          ? (classRow.student_ids as string[]).filter(Boolean)
          : [];
        if (classStudentIds.length > 0) {
          classStudentIds.forEach((uid: string) => {
            if (!inviteIds.includes(uid)) inviteIds.push(uid);
          });
        } else if (classRow?.course_id) {
          // Fallback: class has no direct student_ids — use course's enrolled students
          const { data: courseRow } = await supabaseAdmin
            .from('courses')
            .select('student_ids')
            .eq('id', classRow.course_id)
            .maybeSingle();
          ((courseRow?.student_ids as string[]) || []).forEach((uid: string) => {
            if (uid && !inviteIds.includes(uid)) inviteIds.push(uid);
          });
        }
      }

      if (inviteIds.length > 0) {
        const participantRows = inviteIds.map((uid: string) => ({
          session_id: session.id,
          user_id: uid,
          role: 'student',
          invited_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }));
        const upsertRes = await supabaseAdmin
          .from('session_participants')
          .upsert(participantRows, { onConflict: 'session_id,user_id' });
        if (upsertRes.error && !isSessionParticipantsTableMissing(upsertRes.error)) {
          throw upsertRes.error;
        }

        const notifRows = inviteIds.map((uid: string) => ({
          user_id: uid,
          title: 'Live Session Invitation',
          message: `You've been invited to "${session.title}" — join now`,
          type: 'info',
          action_url: `/student/live-sessions/${session.id}`,
          created_at: new Date().toISOString(),
        }));
        await supabaseAdmin.from('notifications').insert(notifRows);
      }

      res.json({ success: true, session });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Update session — host only; strict whitelist of mutable fields
  app.patch('/api/teacher/live-sessions/:id', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;

      // Whitelist the fields a host is permitted to change
      const ALLOWED_FIELDS = ['status', 'title', 'description', 'scheduled_at', 'duration_minutes', 'recording_url', 'jitsi_room_name', 'started_at'];
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ALLOWED_FIELDS) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (Object.keys(update).length === 1) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }

      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .update(update)
        .eq('id', req.params.id).select().single();
      if (error) throw error;

      if (req.body.status === 'live') {
        update.started_at = new Date().toISOString();
        const { data: parts, error: partsErr } = await supabaseAdmin
          .from('session_participants').select('user_id').eq('session_id', req.params.id);
        if (partsErr && !isSessionParticipantsTableMissing(partsErr)) throw partsErr;
        if (parts && parts.length > 0) {
          const notifRows = (parts as Array<{ user_id: string }>).map((p) => ({
            user_id: p.user_id,
            title: 'Session is Live Now!',
            message: `"${data.title}" has started — join now`,
            type: 'info',
            action_url: `/student/live-sessions/${req.params.id}`,
            created_at: new Date().toISOString(),
          }));
          await supabaseAdmin.from('notifications').insert(notifRows);
        }
      }

      res.json({ success: true, session: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Delete session (host only)
  app.delete('/api/teacher/live-sessions/:id', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { error } = await supabaseAdmin.from('live_sessions').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Helper: check if caller has access to a given session
  // Access granted if: admin, session host, invited+non-removed participant, OR enrolled in session's course/class (for ended sessions)
  // assertSessionParticipantAccess — only host, admin, or explicitly invited (non-removed) participants
  const assertSessionParticipantAccess = async (req: Request, res: Response, sessionId: string): Promise<string | null> => {
    const caller = await getAuthUser(req);
    if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    if (caller.role === 'admin') return caller.userId;
    const { data: sessionRow } = await supabaseAdmin
      .from('live_sessions').select('host_id').eq('id', sessionId).single();
    if (!sessionRow) { res.status(404).json({ error: 'Session not found' }); return null; }
    if (sessionRow.host_id === caller.userId) return caller.userId;
    const { data: participation, error: partErr } = await supabaseAdmin
      .from('session_participants').select('id,is_removed').eq('session_id', sessionId).eq('user_id', caller.userId).single();
    if (partErr && !isSessionParticipantsTableMissing(partErr)) {
      throw partErr;
    }
    if (participation && (participation as { id: string; is_removed?: boolean }).is_removed) {
      res.status(403).json({ error: 'Forbidden: you have been removed from this session' }); return null;
    }
    if (participation) return caller.userId;
    res.status(403).json({ error: 'Forbidden: join this live session first or ask the host to invite you' }); return null;
  };

  // assertSessionAccess — host/admin/invited participant OR enrolled student (any status)
  const assertSessionAccess = async (req: Request, res: Response, sessionId: string): Promise<string | null> => {
    const caller = await getAuthUser(req);
    if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    if (caller.role === 'admin') return caller.userId;

    // Fetch session metadata
    const sessionRes = await supabaseAdmin
      .from('live_sessions')
      .select('host_id,course_id,status')
      .eq('id', sessionId)
      .single();
    if (sessionRes.error) { res.status(404).json({ error: 'Session not found' }); return null; }
    const sessionRow = (sessionRes.data || {}) as { host_id?: string; course_id?: string; status?: string };
    if (sessionRow.host_id === caller.userId) return caller.userId;

    // Check session_participants table
    let participantsTableMissing = false;
    const { data: participation, error: partErr } = await supabaseAdmin
      .from('session_participants').select('id,is_removed').eq('session_id', sessionId).eq('user_id', caller.userId).single();
    if (partErr) {
      if (isSessionParticipantsTableMissing(partErr)) {
        participantsTableMissing = true;
      } else {
        throw partErr;
      }
    }
    if (participation) {
      const p = participation as { id: string; is_removed?: boolean };
      if (p.is_removed) { res.status(403).json({ error: 'Forbidden: you have been removed from this session' }); return null; }
      return caller.userId;
    }

    // No participation row — check enrollment in the session's course or class
    // This covers: (a) session_participants table missing, (b) student was added before fix, (c) enrolled via course
    if (sessionRow.course_id) {
      const { data: courseRow } = await supabaseAdmin
        .from('courses').select('student_ids').eq('id', sessionRow.course_id).single();
      if (courseRow && Array.isArray(courseRow.student_ids) && (courseRow.student_ids as string[]).includes(caller.userId)) {
        return caller.userId;
      }
      // Also check classes linked to this course
      const { data: classRows } = await supabaseAdmin
        .from('classes').select('student_ids').eq('course_id', sessionRow.course_id);
      if (Array.isArray(classRows)) {
        for (const cl of classRows) {
          if (Array.isArray(cl.student_ids) && (cl.student_ids as string[]).includes(caller.userId)) {
            return caller.userId;
          }
        }
      }
    }

    // If session_participants table is missing entirely, allow any student linked to the host teacher
    if (participantsTableMissing && sessionRow.host_id) {
      const teacherIdCandidates = await getTeacherIdCandidates(sessionRow.host_id);
      const scopedIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [sessionRow.host_id];
      const { data: linkedProfile } = await supabaseAdmin
        .from('profiles').select('id').eq('id', caller.userId).in('teacher_id', scopedIds).maybeSingle();
      if (linkedProfile) return caller.userId;
    }

    res.status(403).json({ error: 'Forbidden: you are not a participant of this session' }); return null;
  };

  // Student session detail — accessible to invited participants AND enrolled students (for ended sessions)
  app.get('/api/student/live-sessions/:id', async (req, res) => {
    try {
      const userId = await assertSessionAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id).single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Student recordings endpoint — list recordings accessible to caller (invited or enrolled)
  app.get('/api/student/live-sessions/:id/recording', async (req, res) => {
    try {
      const userId = await assertSessionAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('id,title,recording_url,status,scheduled_at')
        .eq('id', req.params.id).single();
      if (error) throw error;
      if (!data.recording_url) return res.json({ success: true, recording_url: null });
      res.json({ success: true, recording_url: data.recording_url, title: data.title });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Single session fetch — accessible by host or invited participants only (not enrolled-only students)
  app.get('/api/teacher/live-sessions/:id', async (req, res) => {
    try {
      const userId = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id).single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Get participants — host or explicitly invited participant only
  app.get('/api/teacher/live-sessions/:id/participants', async (req, res) => {
    try {
      const userId = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin
        .from('session_participants')
        .select('*, user:profiles!user_id(id,display_name,email,avatar_url)')
        .eq('session_id', req.params.id);
      if (error) throw error;
      res.json({ success: true, participants: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Invite participants to existing session (host only)
  app.post('/api/teacher/live-sessions/:id/invite', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;

      const { user_ids, class_id } = req.body;
      const inviteIds: string[] = Array.isArray(user_ids) ? [...user_ids] : [];

      if (class_id) {
        const { data: classRow } = await supabaseAdmin.from('classes').select('student_ids').eq('id', class_id).single();
        ((classRow?.student_ids as string[]) || []).forEach((uid: string) => {
          if (!inviteIds.includes(uid)) inviteIds.push(uid);
        });
      }

      if (inviteIds.length === 0) return res.status(400).json({ error: 'No user IDs provided' });

      const { data: session } = await supabaseAdmin.from('live_sessions').select('title').eq('id', req.params.id).single();

      const rows = inviteIds.map((uid: string) => ({
        session_id: req.params.id,
        user_id: uid,
        role: 'student',
        invited_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }));
      await supabaseAdmin.from('session_participants').upsert(rows, { onConflict: 'session_id,user_id' });

      const notifRows = inviteIds.map((uid: string) => ({
        user_id: uid,
        title: 'Live Session Invitation',
        message: `You've been invited to "${session?.title || 'a session'}" — join now`,
        type: 'info',
        action_url: `/student/live-sessions/${req.params.id}`,
        created_at: new Date().toISOString(),
      }));
      await supabaseAdmin.from('notifications').insert(notifRows);

      res.json({ success: true, invited: inviteIds.length });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Update participant status — host can mute/pin/remove; participants can only update own left_at
  app.patch('/api/teacher/live-sessions/:id/participants/:userId', async (req, res) => {
    try {
      const { id, userId } = req.params;
      const caller = await getAuthUser(req);
      if (!caller) { return res.status(401).json({ error: 'Unauthorized' }); }

      // Determine if this is a participant leaving their own record
      const isSelfLeave = caller.userId === userId;

      if (isSelfLeave) {
        // Participants may ONLY update their own left_at or is_hand_raised — nothing else
        const { left_at, is_hand_raised } = req.body;
        if (left_at === undefined && is_hand_raised === undefined) {
          return res.status(403).json({ error: 'Forbidden: participants may only set their own left_at or is_hand_raised' });
        }
        const selfUpdate: Record<string, unknown> = {};
        if (left_at !== undefined) selfUpdate.left_at = left_at;
        if (is_hand_raised !== undefined) selfUpdate.is_hand_raised = is_hand_raised;
        const { data, error } = await supabaseAdmin
          .from('session_participants')
          .update(selfUpdate)
          .eq('session_id', id).eq('user_id', userId)
          .select().single();
        if (error) throw error;
        return res.json({ success: true, participant: data });
      }

      // All other updates require host ownership
      const sessionRow = await assertSessionHost(req, res, id);
      if (!sessionRow) return;

      // Whitelist host-mutable fields
      const HOST_FIELDS = ['is_muted', 'is_pinned', 'left_at', 'is_removed', 'is_hand_raised'];
      const update: Record<string, unknown> = {};
      for (const key of HOST_FIELDS) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }
      const { data, error } = await supabaseAdmin
        .from('session_participants')
        .update(update)
        .eq('session_id', id).eq('user_id', userId)
        .select().single();
      if (error) throw error;
      res.json({ success: true, participant: data });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Log attendance (join) — session participants only, can only log own join
  app.post('/api/teacher/live-sessions/:id/join', async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: 'Unauthorized' });
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'user_id is required' });
      if (caller.userId !== user_id && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: can only log own attendance' });
      }

      // Verify session is currently live
      const { data: sessionRow, error: sErr } = await supabaseAdmin
        .from('live_sessions').select('id,status,host_id').eq('id', req.params.id).single();
      if (sErr || !sessionRow) return res.status(404).json({ error: 'Session not found' });
      const isHost = caller.userId === sessionRow.host_id || caller.role === 'admin';
      if (sessionRow.status !== 'live' && !isHost) {
        return res.status(403).json({ error: 'Session is not live' });
      }

      // Non-admin non-host callers: verify access and check if removed
      if (!isHost) {
        const { data: pRow, error: pErr } = await supabaseAdmin
          .from('session_participants')
          .select('id,is_removed')
          .eq('session_id', req.params.id).eq('user_id', user_id)
          .maybeSingle();
        const tableMissing = pErr && isSessionParticipantsTableMissing(pErr);
        if (pErr && !tableMissing) throw pErr;
        if (pRow && (pRow as any).is_removed) return res.status(403).json({ error: 'You have been removed from this session' });
        // If not yet in the table (table missing or not yet invited), verify via course/class enrollment
        if (!pRow && !tableMissing) {
          // auto-add them so join is recorded
        }
      }

      const upsertRes = await supabaseAdmin
        .from('session_participants')
        .upsert({ session_id: req.params.id, user_id, role: 'student', joined_at: new Date().toISOString(), created_at: new Date().toISOString() }, { onConflict: 'session_id,user_id' })
        .select().single();
      if (upsertRes.error && !isSessionParticipantsTableMissing(upsertRes.error)) throw upsertRes.error;
      res.json({ success: true, participant: upsertRes.data || { session_id: req.params.id, user_id } });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Log attendance (leave) — must be currently an active invited participant
  app.post('/api/teacher/live-sessions/:id/leave', async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: 'Unauthorized' });
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'user_id is required' });
      if (caller.userId !== user_id && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: can only log own attendance' });
      }

      // Verify session exists
      const { data: sessionRow, error: sErr } = await supabaseAdmin
        .from('live_sessions').select('id,status,host_id').eq('id', req.params.id).single();
      if (sErr || !sessionRow) return res.status(404).json({ error: 'Session not found' });
      const isHost = caller.userId === sessionRow.host_id || caller.role === 'admin';

      // Non-host: check if removed; gracefully ignore missing table
      if (!isHost) {
        const { data: pRow, error: pErr } = await supabaseAdmin
          .from('session_participants')
          .select('id,is_removed,joined_at')
          .eq('session_id', req.params.id).eq('user_id', user_id)
          .maybeSingle();
        const tableMissing = pErr && isSessionParticipantsTableMissing(pErr);
        if (pErr && !tableMissing) throw pErr;
        if (pRow && (pRow as any).is_removed) return res.status(403).json({ error: 'You have been removed from this session' });
      }

      const leaveRes = await supabaseAdmin
        .from('session_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('session_id', req.params.id).eq('user_id', user_id)
        .select().single();
      if (leaveRes.error && !isSessionParticipantsTableMissing(leaveRes.error)) throw leaveRes.error;
      res.json({ success: true, participant: leaveRes.data || { session_id: req.params.id, user_id } });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Get chat messages — any session participant (invited, enrolled, or host)
  app.get('/api/teacher/live-sessions/:id/chat', async (req, res) => {
    try {
      const caller = await assertSessionAccess(req, res, req.params.id);
      if (!caller) return;
      const { data, error } = await supabaseAdmin
        .from('session_chat_messages')
        .select('*, sender:profiles!sender_id(id,display_name,avatar_url)')
        .eq('session_id', req.params.id)
        .order('created_at', { ascending: true });
      if (error && !isSessionChatTableMissing(error)) throw error;
      res.json({ success: true, messages: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Send chat message — any participant (invited, enrolled, or host), sender_id must match caller
  app.post('/api/teacher/live-sessions/:id/chat', async (req, res) => {
    try {
      const accessUserId = await assertSessionAccess(req, res, req.params.id);
      if (!accessUserId) return;
      const caller = await getAuthUser(req);
      if (!caller) return;
      const { sender_id, message } = req.body;
      const text = typeof message === 'string' ? message.trim() : '';
      if (!text) {
        return res.status(400).json({ error: 'message is required' });
      }
      if (caller.userId !== sender_id) {
        return res.status(403).json({ error: 'Forbidden: sender_id must match authenticated user' });
      }
      const { data, error } = await supabaseAdmin
        .from('session_chat_messages')
        .insert({ session_id: req.params.id, sender_id, message: text, created_at: new Date().toISOString() })
        .select('*, sender:profiles!sender_id(id,display_name,avatar_url)').single();
      if (error && !isSessionChatTableMissing(error)) throw error;
      // If table missing, return a local echo of the message so UI doesn't crash
      const echoed = data || { id: `local-${Date.now()}`, session_id: req.params.id, sender_id, message: text, created_at: new Date().toISOString(), sender: { id: sender_id, display_name: 'You', avatar_url: null } };
      res.json({ success: true, message: echoed });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Persist reaction — any session participant
  app.post('/api/teacher/live-sessions/:id/reactions', async (req, res) => {
    try {
      const userId = await assertSessionAccess(req, res, req.params.id);
      if (!userId) return;
      const caller = await getAuthUser(req);
      if (!caller) return;
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: 'emoji required' });
      const { data, error } = await supabaseAdmin
        .from('session_reactions')
        .insert({ session_id: req.params.id, user_id: caller.userId, emoji, created_at: new Date().toISOString() })
        .select().single();
      if (error && !isSessionReactionsTableMissing(error)) throw error;
      res.json({ success: true, reaction: data || { session_id: req.params.id, user_id: caller.userId, emoji } });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Recording upload URL (host only)
  app.post('/api/teacher/live-sessions/:id/upload-url', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { id } = req.params;
      const filename = `session-${id}-${Date.now()}.webm`;
      const storagePath = `recordings/${filename}`;
      await supabaseAdmin.storage.createBucket('live-recordings', { public: true }).catch(() => {});
      const { data, error } = await supabaseAdmin.storage.from('live-recordings').createSignedUploadUrl(storagePath);
      if (error) {
        await supabaseAdmin.storage.createBucket('recordings', { public: true }).catch(() => {});
        const { data: d2, error: e2 } = await supabaseAdmin.storage.from('recordings').createSignedUploadUrl(storagePath);
        if (e2) throw e2;
        const { data: { publicUrl } } = supabaseAdmin.storage.from('recordings').getPublicUrl(storagePath);
        return res.json({ success: true, signedUrl: d2.signedUrl, publicUrl, bucket: 'recordings' });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from('live-recordings').getPublicUrl(storagePath);
      res.json({ success: true, signedUrl: data.signedUrl, publicUrl, bucket: 'live-recordings' });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Search users for invitation (teacher only)
  app.get('/api/teacher/users/search', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { q, role } = req.query;
      let query = supabaseAdmin.from('profiles').select('id, display_name, email, role, avatar_url');
      if (role) query = query.eq('role', role as string);
      if (q) query = query.or(`display_name.ilike.%${q}%,email.ilike.%${q}%`);
      query = query.limit(20);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, users: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Resolve student IDs for a set of class IDs — tries all enrollment sources
  app.get('/api/teacher/classes/students', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

      const rawIds = typeof req.query.classIds === 'string' ? req.query.classIds : '';
      const classIds = rawIds.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (classIds.length === 0) return res.json({ success: true, studentsByClass: {} });

      const teacherIdCandidates = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [caller.userId];

      // Fetch the class rows for the requested IDs
      const { data: classRows, error: classErr } = await supabaseAdmin
        .from('classes')
        .select('id, student_ids, course_id, teacher_id')
        .in('id', classIds);
      if (classErr) throw classErr;

      // Collect unique course IDs so we can do one query
      const courseIdSet = new Set<string>();
      (classRows || []).forEach((cl: any) => {
        if (cl.course_id) courseIdSet.add(String(cl.course_id));
      });

      // Fetch course student_ids for those courses (graceful on missing column)
      const courseStudentMap = new Map<string, string[]>();
      if (courseIdSet.size > 0) {
        const { data: courseRows, error: courseErr } = await supabaseAdmin
          .from('courses')
          .select('id, student_ids')
          .in('id', [...courseIdSet]);
        if (!courseErr) {
          (courseRows || []).forEach((c: any) => {
            const ids = Array.isArray(c.student_ids) ? (c.student_ids as unknown[]).map(String).filter(Boolean) : [];
            if (ids.length > 0) courseStudentMap.set(String(c.id), ids);
          });
        }
      }

      // Fetch all students linked to this teacher via profiles.teacher_id
      const { data: linkedProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, teacher_id')
        .in('teacher_id', scopedIds)
        .eq('role', 'student');
      const allTeacherStudentIds = (linkedProfiles || []).map((p: any) => String(p.id));

      // Build per-class student ID list
      const studentsByClass: Record<string, string[]> = {};
      for (const cl of (classRows || [])) {
        const classId = String(cl.id);
        const directIds: string[] = Array.isArray(cl.student_ids)
          ? (cl.student_ids as unknown[]).map(String).filter(Boolean)
          : [];
        const courseIds: string[] = cl.course_id ? (courseStudentMap.get(String(cl.course_id)) || []) : [];
        const combined = Array.from(new Set([...directIds, ...courseIds]));
        // If still empty, fall back to all students linked to the teacher
        studentsByClass[classId] = combined.length > 0 ? combined : allTeacherStudentIds;
      }

      return res.json({ success: true, studentsByClass });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // List classes (teacher only)
  app.get('/api/teacher/classes', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { teacher_id } = req.query;
      const baseTeacherId =
        caller.role === 'admin'
          ? (typeof teacher_id === 'string' ? teacher_id : '')
          : caller.userId;
      const teacherIdCandidates = await getTeacherIdCandidates(baseTeacherId || caller.userId);

      let query = supabaseAdmin
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false });
      if (teacherIdCandidates.length > 0) query = query.in('teacher_id', teacherIdCandidates);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, classes: data || [] });
    } catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Create/update class (teacher/admin) with teacher_id FK compatibility.
  app.post('/api/teacher/classes/save', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: teacher or admin role required' });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const mode = body.mode === 'update' ? 'update' : 'insert';
      const classId = typeof body.id === 'string' ? body.id.trim() : '';
      const payload = (body.payload || {}) as Record<string, unknown>;

      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'Class name is required' });

      // Resolve best teacher_id candidates for live schema:
      // 1) teachers.id rows linked to caller.userId, then 2) caller.userId/profile id candidates.
      const teacherIdCandidates: string[] = [];
      const pushCandidate = (v: unknown) => {
        const s = String(v || '').trim();
        if (!s) return;
        if (!teacherIdCandidates.includes(s)) teacherIdCandidates.push(s);
      };

      const { data: teacherRows, error: teacherRowsErr } = await supabaseAdmin
        .from('teachers')
        .select('id, user_id')
        .eq('user_id', caller.userId)
        .limit(20);
      if (teacherRowsErr) throw teacherRowsErr;
      (teacherRows || []).forEach((t: any) => {
        pushCandidate(t?.id);
        pushCandidate(t?.user_id);
      });

      if (!teacherIdCandidates.length) {
        // Attempt to bootstrap a teachers row if table requires teacher IDs.
        const { data: profileRow, error: profileErr } = await supabaseAdmin
          .from('profiles')
          .select('id, email')
          .eq('id', caller.userId)
          .maybeSingle();
        if (profileErr) throw profileErr;
        if (profileRow?.id && profileRow?.email) {
          const ins = await supabaseAdmin
            .from('teachers')
            .insert({ user_id: profileRow.id, email: profileRow.email })
            .select('id, user_id')
            .single();
          if (!ins.error && ins.data) {
            pushCandidate((ins.data as any).id);
            pushCandidate((ins.data as any).user_id);
          }
        }
      }

      // Always include auth user id / related teacher candidates as fallback.
      const fallbackCandidates = await getTeacherIdCandidates(caller.userId);
      fallbackCandidates.forEach((id) => pushCandidate(id));
      if (!teacherIdCandidates.length) {
        return res.status(400).json({ error: 'No valid teacher id candidates were found.' });
      }

      const baseRow: Record<string, unknown> = {
        name,
        description: typeof payload.description === 'string' ? payload.description.trim() || null : (payload.description ?? null),
        course_id: payload.course_id ?? null,
        status: payload.status ?? 'upcoming',
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        capacity: Number.isFinite(Number(payload.capacity)) ? Number(payload.capacity) : 30,
      };
      if (mode === 'insert') {
        baseRow.student_ids = Array.isArray(payload.student_ids) ? payload.student_ids : [];
      }

      let lastError: any = null;
      for (const teacherIdCandidate of teacherIdCandidates) {
        const row = { ...baseRow, teacher_id: teacherIdCandidate };
        const result =
          mode === 'update'
            ? await supabaseAdmin.from('classes').update(row).eq('id', classId).select('id').maybeSingle()
            : await supabaseAdmin.from('classes').insert(row).select('id').single();

        if (!result.error) {
          return res.json({ success: true, class: result.data || null });
        }

        const msg = `${result.error.message || ''} ${result.error.details || ''}`;
        const isTeacherFk = result.error.code === '23503' && /classes_teacher_id_fkey|table "teachers"|table "profiles"/i.test(msg);
        if (!isTeacherFk) {
          return res.status(400).json({ error: [result.error.message, result.error.details, result.error.hint].filter(Boolean).join(' — ') || 'Failed to save class' });
        }
        lastError = result.error;
      }

      return res.status(400).json({
        error:
          [lastError?.message, lastError?.details, lastError?.hint].filter(Boolean).join(' — ') ||
          'Could not resolve a valid teacher_id for classes table foreign key.',
      });
    } catch (e: any) {
      console.error('POST /api/teacher/classes/save', e);
      return res.status(500).json({ error: e?.message || 'Failed to save class' });
    }
  });

  // ── STUDENT LIVE SESSIONS ───────────────────────────────────

  // Student enroll in a published course owned by their assigned teacher.
  app.post('/api/student/courses/:courseId/enroll', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const courseId = String(req.params.courseId || '').trim();
      if (!courseId) return res.status(400).json({ error: 'courseId is required' });

      const { data: profile, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('teacher_id')
        .eq('id', caller.userId)
        .single();
      if (profileErr) throw profileErr;

      const linkedTeacherId = profile?.teacher_id ? String(profile.teacher_id) : '';
      if (!linkedTeacherId) {
        return res.status(403).json({ error: 'Student has no assigned teacher' });
      }

      const teacherIds = await getTeacherIdCandidates(linkedTeacherId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [linkedTeacherId];

      const { data: course, error: courseErr } = await supabaseAdmin
        .from('courses')
        .select('id, title, teacher_id, status, student_ids, total_students')
        .eq('id', courseId)
        .single();
      if (courseErr) throw courseErr;
      if (!course) return res.status(404).json({ error: 'Course not found' });

      const courseTeacherId = String(course.teacher_id || '');
      if (!scopedIds.includes(courseTeacherId)) {
        return res.status(403).json({ error: 'Forbidden: this course is not from your assigned teacher' });
      }
      if (String(course.status || '').toLowerCase() !== 'published') {
        return res.status(403).json({ error: 'Only published courses can be enrolled' });
      }

      const studentIds = Array.isArray(course.student_ids)
        ? course.student_ids.map((sid: unknown) => String(sid))
        : [];
      const alreadyEnrolled = studentIds.includes(caller.userId);

      if (!alreadyEnrolled) {
        const nextStudentIds = [...studentIds, caller.userId];
        const nextTotalStudents = Math.max(nextStudentIds.length, Number(course.total_students || 0) + 1);

        const { error: updErr } = await supabaseAdmin
          .from('courses')
          .update({
            student_ids: nextStudentIds,
            total_students: nextTotalStudents,
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId);
        if (updErr) throw updErr;
      }

      const classIds: string[] = [];
      let classAssignment: 'assigned' | 'already_assigned' | 'no_class_available' | 'skipped' = 'skipped';

      const loadCourseClasses = async () => {
        let classRes = await supabaseAdmin
          .from('classes')
          .select('id,status,student_ids,capacity,start_date,created_at')
          .eq('course_id', courseId);
        if (classRes.error && isRecoverableSchemaColumnError(classRes.error)) {
          classRes = await supabaseAdmin
            .from('classes')
            .select('id,status,student_ids,capacity,created_at')
            .eq('course_id', courseId);
        }
        if (classRes.error && isRecoverableSchemaColumnError(classRes.error)) {
          classRes = await supabaseAdmin
            .from('classes')
            .select('id,student_ids,created_at')
            .eq('course_id', courseId);
        }
        if (classRes.error) throw classRes.error;
        return classRes.data || [];
      };

      try {
        const classRows = await loadCourseClasses();
        if (classRows.length > 0) {
          const statusWeight = (status: unknown) => {
            const normalized = String(status || '').toLowerCase();
            if (normalized === 'active') return 0;
            if (normalized === 'upcoming') return 1;
            if (normalized === 'completed') return 2;
            if (normalized === 'archived') return 3;
            return 4;
          };
          const classCandidates = (classRows || []).map((row: any) => {
            const ids = Array.isArray(row?.student_ids)
              ? row.student_ids.map((sid: unknown) => String(sid))
              : [];
            const capacity = Number(row?.capacity);
            const hasCapacity = !Number.isFinite(capacity) || capacity <= 0 || ids.length < capacity;
            return {
              id: String(row?.id || ''),
              status: String(row?.status || ''),
              startDate: row?.start_date ? String(row.start_date) : '',
              createdAt: row?.created_at ? String(row.created_at) : '',
              studentIds: ids,
              hasCapacity,
            };
          }).filter((row: any) => row.id);

          const existingClasses = classCandidates.filter((row: any) => row.studentIds.includes(caller.userId));
          if (existingClasses.length > 0) {
            existingClasses.forEach((row: any) => classIds.push(row.id));
            classAssignment = 'already_assigned';
          } else {
            classCandidates.sort((a: any, b: any) => {
              const statusDelta = statusWeight(a.status) - statusWeight(b.status);
              if (statusDelta !== 0) return statusDelta;
              const startA = a.startDate ? Date.parse(a.startDate) : Number.POSITIVE_INFINITY;
              const startB = b.startDate ? Date.parse(b.startDate) : Number.POSITIVE_INFINITY;
              if (startA !== startB) return startA - startB;
              const createdA = a.createdAt ? Date.parse(a.createdAt) : 0;
              const createdB = b.createdAt ? Date.parse(b.createdAt) : 0;
              return createdA - createdB;
            });

            const targetClass = classCandidates.find((row: any) => row.hasCapacity);
            if (targetClass) {
              const nextClassStudentIds = Array.from(new Set([...targetClass.studentIds, caller.userId]));
              const { error: classUpdateErr } = await supabaseAdmin
                .from('classes')
                .update({ student_ids: nextClassStudentIds })
                .eq('id', targetClass.id);
              if (classUpdateErr) throw classUpdateErr;
              classIds.push(targetClass.id);
              classAssignment = 'assigned';
            } else {
              classAssignment = 'no_class_available';
            }
          }
        }
      } catch (classError: any) {
        if (!isClassesTableMissing(classError)) throw classError;
      }

      if (!alreadyEnrolled) {
        await dispatchNotifyEvent('newEnrollment', {
          studentId: caller.userId,
          teacherId: courseTeacherId,
          courseId,
          courseTitle: String(course.title || ''),
        });
      }

      return res.json({
        success: true,
        enrolled: !alreadyEnrolled,
        alreadyEnrolled,
        classAssignment,
        classIds,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to enroll in course' });
    }
  });

  // Dispatch an in-app notification event from the client (for events whose source
  // of truth is still client-driven: quiz submissions and certificate issuances).
  // Server validates the caller has the right to fire the event for the supplied ctx.
  app.post('/api/notifications/event', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const eventKey = String(req.body?.event || '').trim() as NotifyEventKey;
      const ctxIn = (req.body?.ctx ?? {}) as Partial<NotifyContext>;

      const ALLOWED: NotifyEventKey[] = ['quizSubmitted', 'certificateIssued'];
      if (!ALLOWED.includes(eventKey)) {
        return res.status(400).json({ error: 'Unsupported event' });
      }

      const studentId = String(ctxIn.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'studentId is required' });

      // Authorization rules per event.
      if (eventKey === 'quizSubmitted') {
        // Only the student themselves may report their own submission.
        if (caller.role !== 'student' || caller.userId !== studentId) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } else if (eventKey === 'certificateIssued') {
        // Only teachers/admins may announce a certificate issuance.
        if (caller.role !== 'teacher' && caller.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      // Pick allow-listed fields from the body (don't let clients spoof other ctx).
      const ctx: NotifyContext = {
        studentId,
        teacherId: ctxIn.teacherId ? String(ctxIn.teacherId) : undefined,
        courseId: ctxIn.courseId ? String(ctxIn.courseId) : undefined,
        courseTitle: ctxIn.courseTitle ? String(ctxIn.courseTitle) : undefined,
        quizId: ctxIn.quizId ? String(ctxIn.quizId) : undefined,
        quizTitle: ctxIn.quizTitle ? String(ctxIn.quizTitle) : undefined,
        attemptId: ctxIn.attemptId ? String(ctxIn.attemptId) : undefined,
        score: typeof ctxIn.score === 'number' ? ctxIn.score : undefined,
        totalPoints: typeof ctxIn.totalPoints === 'number' ? ctxIn.totalPoints : undefined,
        passed: typeof ctxIn.passed === 'boolean' ? ctxIn.passed : undefined,
        certificateId: ctxIn.certificateId ? String(ctxIn.certificateId) : undefined,
        certificateNumber: ctxIn.certificateNumber ? String(ctxIn.certificateNumber) : undefined,
      };

      // For certificates issued by a teacher, force teacherId to be the caller.
      if (eventKey === 'certificateIssued' && caller.role === 'teacher') {
        ctx.teacherId = caller.userId;
      }

      // For quiz submissions, fetch course/teacher info from the quiz row when missing
      // so we can be sure the recipients line up correctly.
      if (eventKey === 'quizSubmitted' && (!ctx.teacherId || !ctx.courseId)) {
        try {
          const { data: quizRow } = await supabaseAdmin
            .from('quizzes')
            .select('teacher_id, course_id, title')
            .eq('id', ctx.quizId || '')
            .maybeSingle();
          if (quizRow) {
            ctx.teacherId = ctx.teacherId || (quizRow.teacher_id ? String(quizRow.teacher_id) : undefined);
            ctx.courseId = ctx.courseId || (quizRow.course_id ? String(quizRow.course_id) : undefined);
            ctx.quizTitle = ctx.quizTitle || (quizRow.title ? String(quizRow.title) : undefined);
          }
        } catch { /* best-effort */ }
      }

      // For certificates, fetch course title (and teacher_id when admin-issued) from the course row.
      if (eventKey === 'certificateIssued' && ctx.courseId && (!ctx.courseTitle || !ctx.teacherId)) {
        try {
          const { data: courseRow } = await supabaseAdmin
            .from('courses')
            .select('title, teacher_id')
            .eq('id', ctx.courseId)
            .maybeSingle();
          if (courseRow?.title && !ctx.courseTitle) ctx.courseTitle = String(courseRow.title);
          if (courseRow?.teacher_id && !ctx.teacherId) ctx.teacherId = String(courseRow.teacher_id);
        } catch { /* best-effort */ }
      }

      await dispatchNotifyEvent(eventKey, ctx);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('POST /api/notifications/event', e);
      return res.status(500).json({ error: e?.message || 'Failed to dispatch notification event' });
    }
  });

  // Student course content counts (service-role): returns lessons/quizzes per course.
  app.get('/api/student/courses/content-counts', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const raw = typeof req.query.courseIds === 'string' ? req.query.courseIds : '';
      const courseIds = raw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (courseIds.length === 0) return res.json({ success: true, counts: {} });

      let quizRowsByCourse: any[] = [];
      const [{ data: modules }, { data: lessonsDirect }] = await Promise.all([
        supabaseAdmin.from('modules').select('id,course_id').in('course_id', courseIds),
        supabaseAdmin.from('lessons').select('id,course_id,module_id').in('course_id', courseIds),
      ]);
      let quizRes = await supabaseAdmin
        .from('quizzes')
        .select('id, course_id, lesson_id')
        .in('course_id', courseIds)
        .or('status.eq.published,status.eq.active');
      if (quizRes.error && isRecoverableSchemaColumnError(quizRes.error)) {
        quizRes = await supabaseAdmin
          .from('quizzes')
          .select('id, course_id, lesson_id')
          .in('course_id', courseIds);
      }
      if (quizRes.error) throw quizRes.error;
      quizRowsByCourse = quizRes.data || [];

      const moduleToCourse: Record<string, string> = {};
      (modules || []).forEach((m: any) => {
        const mid = String(m?.id || '');
        const cid = String(m?.course_id || '');
        if (mid && cid) moduleToCourse[mid] = cid;
      });

      const lessonCountByCourse: Record<string, number> = {};
      const lessonToCourse: Record<string, string> = {};
      (lessonsDirect || []).forEach((l: any) => {
        const lid = String(l?.id || '');
        const directCourseId = String(l?.course_id || '');
        const mappedCourseId = directCourseId || moduleToCourse[String(l?.module_id || '')] || '';
        if (!lid || !mappedCourseId) return;
        lessonToCourse[lid] = mappedCourseId;
        lessonCountByCourse[mappedCourseId] = (lessonCountByCourse[mappedCourseId] || 0) + 1;
      });

      const lessonIds = Object.keys(lessonToCourse);
      const quizRowsByLesson = lessonIds.length > 0
        ? await supabaseAdmin.from('quizzes').select('id,lesson_id').in('lesson_id', lessonIds)
        : { data: [] as any[] };

      const quizSetByCourse: Record<string, Set<string>> = {};
      (quizRowsByCourse || []).forEach((q: any) => {
        const cid = String(q?.course_id || '');
        const qid = String(q?.id || '');
        if (!cid || !qid) return;
        if (!quizSetByCourse[cid]) quizSetByCourse[cid] = new Set<string>();
        quizSetByCourse[cid].add(qid);
      });
      (quizRowsByLesson.data || []).forEach((q: any) => {
        const lid = String(q?.lesson_id || '');
        const qid = String(q?.id || '');
        const cid = lessonToCourse[lid];
        if (!cid || !qid) return;
        if (!quizSetByCourse[cid]) quizSetByCourse[cid] = new Set<string>();
        quizSetByCourse[cid].add(qid);
      });

      const counts: Record<string, { lessons: number; quizzes: number }> = {};
      courseIds.forEach((cid) => {
        counts[cid] = {
          lessons: lessonCountByCourse[cid] || 0,
          quizzes: quizSetByCourse[cid] ? quizSetByCourse[cid].size : 0,
        };
      });
      return res.json({ success: true, counts });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load course content counts' });
    }
  });

  // Student quizzes: only published quizzes from courses where the student is enrolled.
  app.get('/api/student/quizzes', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const requestedCourseId = typeof req.query.courseId === 'string' ? req.query.courseId.trim() : '';

      const { data: enrolledCourses, error: ecErr } = await supabaseAdmin
        .from('courses')
        .select('id,title')
        .contains('student_ids', [caller.userId]);
      if (ecErr) throw ecErr;

      const { data: enrolledClasses, error: classErr } = await supabaseAdmin
        .from('classes')
        .select('id,course_id,student_ids')
        .contains('student_ids', [caller.userId]);
      if (classErr && !isClassesTableMissing(classErr)) throw classErr;

      const classCourseIds = (enrolledClasses || [])
        .map((row: any) => String(row?.course_id || '').trim())
        .filter(Boolean);

      const enrolledCourseIds = Array.from(new Set([
        ...(enrolledCourses || []).map((c: any) => String(c.id)).filter(Boolean),
        ...classCourseIds,
      ]));
      if (enrolledCourseIds.length === 0) return res.json({ success: true, quizzes: [] });
      const courseIds = requestedCourseId
        ? enrolledCourseIds.includes(requestedCourseId) ? [requestedCourseId] : []
        : enrolledCourseIds;
      if (courseIds.length === 0) return res.json({ success: true, quizzes: [] });

      const courseTitleById: Record<string, string> = {};
      (enrolledCourses || []).forEach((course: any) => {
        courseTitleById[String(course.id)] = String(course.title || 'Course');
      });
      if (classCourseIds.length > 0) {
        const missingTitleIds = classCourseIds.filter((cid) => !courseTitleById[cid]);
        if (missingTitleIds.length > 0) {
          const { data: classLinkedCourses } = await supabaseAdmin
            .from('courses')
            .select('id,title')
            .in('id', missingTitleIds);
          (classLinkedCourses || []).forEach((course: any) => {
            courseTitleById[String(course.id)] = String(course.title || 'Course');
          });
        }
      }

      const { data: modules, error: modulesErr } = await supabaseAdmin
        .from('modules')
        .select('id,course_id')
        .in('course_id', courseIds);
      if (modulesErr) throw modulesErr;

      const moduleToCourse: Record<string, string> = {};
      (modules || []).forEach((m: any) => {
        const mid = String(m?.id || '');
        const cid = String(m?.course_id || '');
        if (mid && cid) moduleToCourse[mid] = cid;
      });

      const moduleIds = Object.keys(moduleToCourse);
      let lessonsByCourseRes = await supabaseAdmin
        .from('lessons')
        .select('id,course_id,module_id')
        .in('course_id', courseIds);
      if (lessonsByCourseRes.error && isRecoverableSchemaColumnError(lessonsByCourseRes.error)) {
        lessonsByCourseRes = { data: [] as any[], error: null as any };
      }
      if (lessonsByCourseRes.error) throw lessonsByCourseRes.error;
      const lessonsByModule = moduleIds.length > 0
        ? await supabaseAdmin.from('lessons').select('id,module_id').in('module_id', moduleIds)
        : { data: [] as any[], error: null as any };
      if (lessonsByModule.error && !isRecoverableSchemaColumnError(lessonsByModule.error)) throw lessonsByModule.error;

      const lessonToCourse: Record<string, string> = {};
      ((lessonsByCourseRes.data as any[]) || []).forEach((l: any) => {
        const lid = String(l?.id || '');
        const cid = String(l?.course_id || '') || moduleToCourse[String(l?.module_id || '')] || '';
        if (lid && cid) lessonToCourse[lid] = cid;
      });
      ((lessonsByModule.data as any[]) || []).forEach((l: any) => {
        const lid = String(l?.id || '');
        const cid = moduleToCourse[String(l?.module_id || '')] || '';
        if (lid && cid && !lessonToCourse[lid]) lessonToCourse[lid] = cid;
      });
      const lessonIds = Object.keys(lessonToCourse);

      let quizByCourseRes = await supabaseAdmin
        .from('quizzes')
        .select('*')
        .in('course_id', courseIds);
      if (quizByCourseRes.error && isRecoverableSchemaColumnError(quizByCourseRes.error)) {
        quizByCourseRes = { data: [] as any[], error: null as any };
      }
      if (quizByCourseRes.error) throw quizByCourseRes.error;

      let quizByLessonRes = lessonIds.length > 0
        ? await supabaseAdmin.from('quizzes').select('*').in('lesson_id', lessonIds)
        : { data: [] as any[], error: null as any };
      if (quizByLessonRes.error && isRecoverableSchemaColumnError(quizByLessonRes.error)) {
        quizByLessonRes = { data: [] as any[], error: null as any };
      }
      if (quizByLessonRes.error) throw quizByLessonRes.error;

      const combined = [...(quizByCourseRes.data || []), ...((quizByLessonRes.data as any[]) || [])];
      const deduped: Record<string, any> = {};
      combined.forEach((row: any) => {
        const qid = String(row?.id || '');
        if (!qid) return;
        if (!deduped[qid]) deduped[qid] = row;
      });

      const quizzes = Object.values(deduped).filter((row: any) => {
        const status = String(row?.status || '').trim().toLowerCase();
        if (status) return status === 'published' || status === 'active';
        if (typeof row?.published === 'boolean') return row.published;
        const publishedText = String(row?.published || '').trim().toLowerCase();
        if (publishedText) return publishedText === 'true' || publishedText === '1' || publishedText === 'yes';
        return true;
      }).map((row: any) => ({
        ...row,
        course_id: String(row?.course_id || '') || lessonToCourse[String(row?.lesson_id || '')] || '',
        course_title: courseTitleById[String(row?.course_id || '') || lessonToCourse[String(row?.lesson_id || '')] || ''] || 'Course',
      }));

      return res.json({ success: true, quizzes });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load student quizzes' });
    }
  });

  app.get('/api/student/quizzes/:quizId/questions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const quizId = typeof req.params.quizId === 'string' ? req.params.quizId.trim() : '';
      if (!quizId) return res.status(400).json({ error: 'Quiz id is required' });

      const { data: quizRow, error: quizErr } = await supabaseAdmin
        .from('quizzes')
        .select('id,course_id,lesson_id')
        .eq('id', quizId)
        .maybeSingle();
      if (quizErr) throw quizErr;
      if (!quizRow?.id) return res.status(404).json({ error: 'Quiz not found' });

      let resolvedCourseId = String((quizRow as any)?.course_id || '').trim();
      if (!resolvedCourseId) {
        const lessonId = String((quizRow as any)?.lesson_id || '').trim();
        if (lessonId) {
          const { data: lessonRow, error: lessonErr } = await supabaseAdmin
            .from('lessons')
            .select('course_id,module_id')
            .eq('id', lessonId)
            .maybeSingle();
          if (lessonErr && !isRecoverableSchemaColumnError(lessonErr)) throw lessonErr;
          resolvedCourseId = String((lessonRow as any)?.course_id || '').trim();
          if (!resolvedCourseId) {
            const moduleId = String((lessonRow as any)?.module_id || '').trim();
            if (moduleId) {
              const { data: moduleRow } = await supabaseAdmin
                .from('modules')
                .select('course_id')
                .eq('id', moduleId)
                .maybeSingle();
              resolvedCourseId = String((moduleRow as any)?.course_id || '').trim();
            }
          }
        }
      }

      if (!resolvedCourseId) {
        return res.status(403).json({ error: 'Quiz is not linked to an enrolled course' });
      }

      const { data: directCourseRows, error: directErr } = await supabaseAdmin
        .from('courses')
        .select('id')
        .eq('id', resolvedCourseId)
        .contains('student_ids', [caller.userId]);
      if (directErr) throw directErr;

      const { data: classRows, error: classErr } = await supabaseAdmin
        .from('classes')
        .select('id,course_id,student_ids')
        .eq('course_id', resolvedCourseId)
        .contains('student_ids', [caller.userId]);
      if (classErr && !isClassesTableMissing(classErr)) throw classErr;

      const hasAccess = (directCourseRows || []).length > 0 || (classRows || []).length > 0 || caller.role === 'admin';
      if (!hasAccess) return res.status(403).json({ error: 'You do not have access to this quiz' });

      let qRes = await supabaseAdmin
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order', { ascending: true })
        .order('created_at', { ascending: true });

      if (qRes.error) {
        qRes = await supabaseAdmin
          .from('questions')
          .select('*')
          .eq('quiz_id', quizId)
          .order('created_at', { ascending: true });
      }
      if (qRes.error) {
        qRes = await supabaseAdmin
          .from('questions')
          .select('*')
          .eq('quiz_id', quizId);
      }
      if (qRes.error) throw qRes.error;

      return res.json({ success: true, questions: qRes.data || [] });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load quiz questions' });
    }
  });

  // Temporary diagnostic endpoint for student quiz visibility.
  app.get('/api/student/quizzes-debug', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const requestedCourseId = typeof req.query.courseId === 'string' ? req.query.courseId.trim() : '';

      const { data: enrolledCourses, error: ecErr } = await supabaseAdmin
        .from('courses')
        .select('id,title,student_ids')
        .contains('student_ids', [caller.userId]);
      if (ecErr) throw ecErr;

      const { data: enrolledClasses, error: classErr } = await supabaseAdmin
        .from('classes')
        .select('id,name,course_id,student_ids')
        .contains('student_ids', [caller.userId]);
      if (classErr && !isClassesTableMissing(classErr)) throw classErr;

      const classCourseIds = (enrolledClasses || [])
        .map((row: any) => String(row?.course_id || '').trim())
        .filter(Boolean);
      const enrolledCourseIds = Array.from(new Set([
        ...(enrolledCourses || []).map((c: any) => String(c.id)).filter(Boolean),
        ...classCourseIds,
      ]));
      const scopedCourseIds = requestedCourseId
        ? (enrolledCourseIds.includes(requestedCourseId) ? [requestedCourseId] : [])
        : enrolledCourseIds;

      const { data: directQuizzes } = scopedCourseIds.length > 0
        ? await supabaseAdmin.from('quizzes').select('id,title,course_id,lesson_id,status').in('course_id', scopedCourseIds)
        : { data: [] as any[] };

      const { data: modules } = scopedCourseIds.length > 0
        ? await supabaseAdmin.from('modules').select('id,course_id').in('course_id', scopedCourseIds)
        : { data: [] as any[] };
      const moduleToCourse: Record<string, string> = {};
      (modules || []).forEach((m: any) => {
        const mid = String(m?.id || '');
        const cid = String(m?.course_id || '');
        if (mid && cid) moduleToCourse[mid] = cid;
      });

      const moduleIds = Object.keys(moduleToCourse);
      const lessonsByModule = moduleIds.length > 0
        ? await supabaseAdmin.from('lessons').select('id,module_id').in('module_id', moduleIds)
        : { data: [] as any[], error: null as any };
      const lessonToCourse: Record<string, string> = {};
      ((lessonsByModule.data as any[]) || []).forEach((l: any) => {
        const lid = String(l?.id || '');
        const cid = moduleToCourse[String(l?.module_id || '')] || '';
        if (lid && cid) lessonToCourse[lid] = cid;
      });
      const lessonIds = Object.keys(lessonToCourse);

      const quizzesByLesson = lessonIds.length > 0
        ? await supabaseAdmin.from('quizzes').select('id,title,course_id,lesson_id,status').in('lesson_id', lessonIds)
        : { data: [] as any[], error: null as any };

      const allQuizzes = [...((directQuizzes as any[]) || []), ...(((quizzesByLesson.data as any[]) || []))];
      const unique: Record<string, any> = {};
      allQuizzes.forEach((q: any) => {
        const qid = String(q?.id || '');
        if (!qid || unique[qid]) return;
        unique[qid] = q;
      });

      const normalized = Object.values(unique).map((row: any) => {
        const status = String(row?.status || '').toLowerCase();
        const published = typeof row?.published === 'boolean' ? row.published : null;
        const visible = status ? (status === 'published' || status === 'active') : (published !== null ? published : true);
        const resolvedCourseId = String(row?.course_id || '') || lessonToCourse[String(row?.lesson_id || '')] || '';
        return {
          id: String(row?.id || ''),
          title: String(row?.title || ''),
          status,
          published,
          resolvedCourseId,
          lessonId: String(row?.lesson_id || ''),
          visible,
        };
      });

      return res.json({
        success: true,
        userId: caller.userId,
        requestedCourseId,
        enrolledCourseIds,
        scopedCourseIds,
        classLinks: (enrolledClasses || []).map((c: any) => ({
          id: String(c?.id || ''),
          name: String(c?.name || ''),
          courseId: String(c?.course_id || ''),
          studentCount: Array.isArray(c?.student_ids) ? c.student_ids.length : 0,
        })),
        counts: {
          directQuizzes: (directQuizzes || []).length,
          lessonMappedQuizzes: ((quizzesByLesson.data as any[]) || []).length,
          dedupedQuizzes: normalized.length,
          visibleAfterPublishFilter: normalized.filter((q: any) => q.visible).length,
        },
        quizzes: normalized,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to debug student quizzes' });
    }
  });

  app.post('/api/student/quiz-violation', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const quizId = typeof req.body?.quizId === 'string' ? req.body.quizId.trim() : '';
      if (!quizId) return res.status(400).json({ error: 'quizId is required' });

      const violationType = typeof req.body?.type === 'string' ? req.body.type.trim() : 'unknown';
      const questionIndex = Number.isFinite(Number(req.body?.questionIndex)) ? Number(req.body.questionIndex) : null;
      const remainingSeconds = Number.isFinite(Number(req.body?.remainingSeconds)) ? Number(req.body.remainingSeconds) : null;
      const violationCount = Number.isFinite(Number(req.body?.violationCount)) ? Number(req.body.violationCount) : null;

      let quizRes = await supabaseAdmin
        .from('quizzes')
        .select('id,title,teacher_id,course_id')
        .eq('id', quizId)
        .maybeSingle();
      if (quizRes.error && missingQuizzesTeacherIdColumn(quizRes.error)) {
        quizRes = await supabaseAdmin
          .from('quizzes')
          .select('id,title,course_id')
          .eq('id', quizId)
          .maybeSingle();
      }
      if (quizRes.error) throw quizRes.error;
      if (!quizRes.data) return res.status(404).json({ error: 'Quiz not found' });

      const quizRow = quizRes.data as any;
      const quizTitle = String(quizRow?.title || 'Quiz');
      let teacherId = String(quizRow?.teacher_id || '').trim();
      const courseId = String(quizRow?.course_id || '').trim();

      if (!teacherId && courseId) {
        const { data: courseRow } = await supabaseAdmin
          .from('courses')
          .select('teacher_id')
          .eq('id', courseId)
          .maybeSingle();
        teacherId = String((courseRow as any)?.teacher_id || '').trim();
      }

      if (!teacherId) {
        return res.json({ success: true, notified: false, reason: 'missing_teacher' });
      }

      const { data: studentProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name,email')
        .eq('id', caller.userId)
        .maybeSingle();
      const studentLabel =
        String((studentProfile as any)?.display_name || '').trim() ||
        String((studentProfile as any)?.email || '').trim() ||
        'A student';

      const violationInfo = [
        `Type: ${violationType || 'unknown'}`,
        questionIndex !== null ? `Question: ${questionIndex + 1}` : '',
        remainingSeconds !== null ? `Remaining time: ${remainingSeconds}s` : '',
        violationCount !== null ? `Warnings: ${violationCount}` : '',
      ].filter(Boolean).join(' | ');

      await supabaseAdmin.from('notifications').insert({
        user_id: teacherId,
        title: 'Quiz Integrity Alert',
        message: `${studentLabel} triggered a quiz violation in "${quizTitle}". ${violationInfo}`.trim(),
        type: 'warning',
        read: false,
        action_url: `/teacher/results`,
        created_at: new Date().toISOString(),
      });

      return res.json({ success: true, notified: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to report quiz violation' });
    }
  });

  const isQuizRuntimeStateTableMissing = (error: any) => {
    const haystack = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      (error?.code === 'PGRST205' && haystack.includes('quiz_runtime_state')) ||
      (error?.code === '42P01' && haystack.includes('quiz_runtime_state')) ||
      haystack.includes("could not find the table 'public.quiz_runtime_state'")
    );
  };

  app.get('/api/student/quiz-runtime/:quizId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const quizId = typeof req.params?.quizId === 'string' ? req.params.quizId.trim() : '';
      if (!quizId) return res.status(400).json({ error: 'quizId is required' });

      // Try to select with the answers column; fall back if column missing.
      let runtimeRes = await supabaseAdmin
        .from('quiz_runtime_state')
        .select('quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,answers,updated_at')
        .eq('quiz_id', quizId)
        .eq('student_id', caller.userId)
        .maybeSingle();

      if (runtimeRes.error && /answers/i.test(String(runtimeRes.error.message))) {
        // answers column does not exist yet — retry without it.
        runtimeRes = await supabaseAdmin
          .from('quiz_runtime_state')
          .select('quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,updated_at')
          .eq('quiz_id', quizId)
          .eq('student_id', caller.userId)
          .maybeSingle();
      }

      if (runtimeRes.error) {
        if (isQuizRuntimeStateTableMissing(runtimeRes.error)) {
          return res.json({ success: true, runtime: null, storage: 'table_missing' });
        }
        throw runtimeRes.error;
      }

      return res.json({ success: true, runtime: runtimeRes.data || null, storage: 'database' });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to fetch quiz runtime state' });
    }
  });

  app.put('/api/student/quiz-runtime/:quizId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const quizId = typeof req.params?.quizId === 'string' ? req.params.quizId.trim() : '';
      if (!quizId) return res.status(400).json({ error: 'quizId is required' });

      const startedAt = typeof req.body?.startedAt === 'string' ? req.body.startedAt : null;
      const expiresAtMs = Number.isFinite(Number(req.body?.expiresAtMs)) ? Number(req.body.expiresAtMs) : null;
      const violationCount = Number.isFinite(Number(req.body?.violationCount)) ? Number(req.body.violationCount) : 0;
      const currentQuestionIndex = Number.isFinite(Number(req.body?.currentQuestionIndex))
        ? Math.max(0, Number(req.body.currentQuestionIndex))
        : 0;
      const answers =
        req.body?.answers && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers)
          ? req.body.answers
          : null;

      const baseRow = {
        quiz_id: quizId,
        student_id: caller.userId,
        started_at: startedAt,
        expires_at_ms: expiresAtMs,
        violation_count: Math.max(0, violationCount),
        current_question_index: currentQuestionIndex,
        updated_at: new Date().toISOString(),
      };

      // Try to upsert WITH answers; gracefully fall back without if the column
      // doesn't exist in this deployment (run migration 007 to enable it).
      let upsertRes = await supabaseAdmin
        .from('quiz_runtime_state')
        .upsert(
          answers !== null ? { ...baseRow, answers } : baseRow,
          { onConflict: 'quiz_id,student_id' }
        )
        .select('quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,answers,updated_at')
        .single();

      if (upsertRes.error && /answers/i.test(String(upsertRes.error.message))) {
        // answers column missing — retry without it.
        upsertRes = await supabaseAdmin
          .from('quiz_runtime_state')
          .upsert(baseRow, { onConflict: 'quiz_id,student_id' })
          .select('quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,updated_at')
          .single();
      }

      if (upsertRes.error) {
        if (isQuizRuntimeStateTableMissing(upsertRes.error)) {
          return res.json({ success: true, runtime: null, storage: 'table_missing' });
        }
        throw upsertRes.error;
      }

      return res.json({ success: true, runtime: upsertRes.data, storage: 'database' });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to update quiz runtime state' });
    }
  });

  app.delete('/api/student/quiz-runtime/:quizId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const quizId = typeof req.params?.quizId === 'string' ? req.params.quizId.trim() : '';
      if (!quizId) return res.status(400).json({ error: 'quizId is required' });

      const deleteRes = await supabaseAdmin
        .from('quiz_runtime_state')
        .delete()
        .eq('quiz_id', quizId)
        .eq('student_id', caller.userId);

      if (deleteRes.error && !isQuizRuntimeStateTableMissing(deleteRes.error)) {
        throw deleteRes.error;
      }

      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to clear quiz runtime state' });
    }
  });

  // Student profile: get and update profile + stats.
  app.get('/api/student/profile', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student role required' });
      }
      const uid = caller.userId;
      const [profileRes, enrolledRes, certificatesRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*').eq('id', uid).maybeSingle(),
        supabaseAdmin.from('courses').select('id').contains('student_ids', [uid]),
        supabaseAdmin.from('certificates').select('id').eq('student_id', uid),
      ]);
      if (profileRes.error) throw profileRes.error;
      const profileRow = (profileRes.data || {}) as Record<string, unknown>;
      const enrolledCourseIds = (enrolledRes.data || []).map((c: any) => String(c.id));
      const certCount = (certificatesRes.data || []).length;

      let lessonsCompleted = 0;
      if (enrolledCourseIds.length > 0) {
        const { data: progressRows } = await supabaseAdmin
          .from('lesson_progress')
          .select('id')
          .eq('student_id', uid)
          .eq('completed', true);
        lessonsCompleted = (progressRows || []).length;
      }

      let quizzesTaken = 0;
      try {
        const { data: attemptRows } = await supabaseAdmin
          .from('quiz_attempts')
          .select('id')
          .eq('student_id', uid);
        quizzesTaken = (attemptRows || []).length;
      } catch { /* table may not exist */ }

      return res.json({
        success: true,
        profile: {
          displayName: String(profileRow.display_name || ''),
          bio: String(profileRow.bio || ''),
          phone: String(profileRow.phone || ''),
          website: String(profileRow.website || ''),
          avatarUrl: String(profileRow.avatar_url || ''),
          email: String(profileRow.email || ''),
          createdAt: String(profileRow.created_at || ''),
        },
        stats: {
          coursesEnrolled: enrolledCourseIds.length,
          lessonsCompleted,
          quizzesTaken,
          certificatesEarned: certCount,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load student profile' });
    }
  });

  // Student lessons: only from enrolled courses (optionally one specific course).
  app.get('/api/student/lessons', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const requestedCourseId = typeof req.query.courseId === 'string' ? req.query.courseId.trim() : '';

      const { data: enrolledCourses, error: ecErr } = await supabaseAdmin
        .from('courses')
        .select('id,title')
        .contains('student_ids', [caller.userId]);
      if (ecErr) throw ecErr;

      const enrolledCourseIds = (enrolledCourses || []).map((c: any) => String(c.id));
      if (enrolledCourseIds.length === 0) return res.json({ success: true, lessons: [] });

      const scopedCourseIds = requestedCourseId
        ? enrolledCourseIds.includes(requestedCourseId) ? [requestedCourseId] : []
        : enrolledCourseIds;
      if (scopedCourseIds.length === 0) return res.json({ success: true, lessons: [] });

      const { data: modules, error: modErr } = await supabaseAdmin
        .from('modules')
        .select('id,title,course_id')
        .in('course_id', scopedCourseIds);
      if (modErr) throw modErr;

      let lessonsRes = await supabaseAdmin
        .from('lessons')
        .select('*')
        .in('course_id', scopedCourseIds)
        .eq('status', 'published')
        .order('order', { ascending: true });
      if (lessonsRes.error && isRecoverableSchemaColumnError(lessonsRes.error)) {
        lessonsRes = await supabaseAdmin
          .from('lessons')
          .select('*')
          .in('course_id', scopedCourseIds)
          .order('order', { ascending: true });
      }
      if (lessonsRes.error) throw lessonsRes.error;

      let lessonRows = lessonsRes.data || [];
      if (lessonRows.length === 0) {
        const moduleIds = (modules || []).map((m: any) => String(m.id)).filter(Boolean);
        if (moduleIds.length > 0) {
          let byModuleRes = await supabaseAdmin
            .from('lessons')
            .select('*')
            .in('module_id', moduleIds)
            .eq('status', 'published')
            .order('order', { ascending: true });
          if (byModuleRes.error && isRecoverableSchemaColumnError(byModuleRes.error)) {
            byModuleRes = await supabaseAdmin
              .from('lessons')
              .select('*')
              .in('module_id', moduleIds)
              .order('order', { ascending: true });
          }
          if (byModuleRes.error) throw byModuleRes.error;
          lessonRows = byModuleRes.data || [];
        }
      }

      const moduleMap: Record<string, { title: string; courseId: string }> = {};
      (modules || []).forEach((m: any) => {
        moduleMap[String(m.id)] = { title: String(m.title || ''), courseId: String(m.course_id || '') };
      });
      const courseMap: Record<string, string> = {};
      (enrolledCourses || []).forEach((c: any) => {
        courseMap[String(c.id)] = String(c.title || 'Course');
      });
      const allowedCourseIds = new Set(scopedCourseIds);
      const lessonIds = (lessonRows || []).map((l: any) => String(l.id)).filter(Boolean);
      let progressMap: Record<string, { completed: boolean; last_video_position: number }> = {};
      if (lessonIds.length > 0) {
        const progressRes = await fetchLessonProgressRows(caller.userId, lessonIds);
        (progressRes.rows || []).forEach((p: any) => {
          const lid = String(p.lesson_id || '');
          if (!lid) return;
          progressMap[lid] = {
            completed: toLessonCompleted(p),
            last_video_position: Number(p.last_video_position || 0),
          };
        });
      }

      const lessons = (lessonRows || []).map((l: any) => {
        const mod = moduleMap[String(l.module_id)] || { title: '', courseId: '' };
        const resolvedCourseId = String(l.course_id || mod.courseId || '');
        const progress = progressMap[String(l.id)] || { completed: false, last_video_position: 0 };
        return {
          ...l,
          module_title: mod.title,
          course_id: resolvedCourseId,
          course_title: courseMap[resolvedCourseId] || 'Course',
          progress_completed: progress.completed,
          last_video_position: progress.last_video_position,
        };
      }).filter((l: any) => allowedCourseIds.has(String(l.course_id || '')));

      return res.json({ success: true, lessons });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load student lessons' });
    }
  });

  app.get('/api/student/lessons/:lessonId/detail', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }
      const lessonId = String(req.params.lessonId || '').trim();
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });

      const { data: lesson, error: lessonErr } = await supabaseAdmin
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

      const lessonCourseId = String((lesson as any).course_id || '').trim();
      if (!lessonCourseId) return res.status(400).json({ error: 'Lesson is missing course_id' });

      const { data: enrolledRows, error: enrollErr } = await supabaseAdmin
        .from('courses')
        .select('id,title')
        .contains('student_ids', [caller.userId]);
      if (enrollErr) throw enrollErr;
      const enrolledSet = new Set((enrolledRows || []).map((c: any) => String(c.id)));
      if (!enrolledSet.has(lessonCourseId) && caller.role !== 'admin') {
        return res.status(403).json({ error: 'You are not enrolled in this lesson course' });
      }

      const { data: moduleRow } = await supabaseAdmin
        .from('modules')
        .select('id,title')
        .eq('id', (lesson as any).module_id)
        .maybeSingle();
      const contentsRes = await fetchLessonContentsWithFallbackOrder(lessonId);
      if (contentsRes.error && !isLessonContentsTableMissing(contentsRes.error)) throw contentsRes.error;

      const progressRes = await fetchLessonProgressSingle(caller.userId, lessonId);

      const contentRows = normalizeLessonContentRows(contentsRes.data || []).map((row: any) => ({
        ...row,
        signed_url: typeof row?.storage_path === 'string' && /^https?:\/\//i.test(row.storage_path)
          ? row.storage_path
          : null,
      }));
      for (const row of contentRows) {
        const path = String(row?.storage_path || '').trim();
        if (!path || /^https?:\/\//i.test(path)) continue;
        await ensureLessonMediaBucket();
        const signed = await supabaseAdmin.storage.from('lesson-media').createSignedUrl(path, 3600);
        row.signed_url = signed.error ? null : signed.data?.signedUrl || null;
      }

      return res.json({
        success: true,
        lesson: {
          ...lesson,
          module_title: (moduleRow as any)?.title || '',
          course_title: (enrolledRows || []).find((c: any) => String(c.id) === lessonCourseId)?.title || 'Course',
        },
        contents: contentRows,
        progress: progressRes.row || null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load lesson detail' });
    }
  });

  app.get('/api/student/lessons/:lessonId/progress', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }
      const lessonId = String(req.params.lessonId || '').trim();
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });

      const progressRes = await fetchLessonProgressSingle(caller.userId, lessonId);
      return res.json({ success: true, progress: progressRes.row || null, storage: progressRes.storage });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load lesson progress' });
    }
  });

  app.put('/api/student/lessons/:lessonId/progress', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }
      const lessonId = String(req.params.lessonId || '').trim();
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });

      const completed = Boolean(req.body?.completed);
      const lastVideoPosition = Number.isFinite(Number(req.body?.lastVideoPosition))
        ? Math.max(0, Number(req.body.lastVideoPosition))
        : 0;

      const upsertRes = await upsertLessonProgressWithFallback(caller.userId, lessonId, completed, lastVideoPosition);
      return res.json({ success: true, progress: upsertRes.row, storage: upsertRes.storage });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to update lesson progress' });
    }
  });

  app.get('/api/student/courses/:courseId/progress', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }
      const courseId = String(req.params.courseId || '').trim();
      if (!courseId) return res.status(400).json({ error: 'courseId is required' });

      const lessonRowsRes = await supabaseAdmin
        .from('lessons')
        .select('id')
        .eq('course_id', courseId)
        .eq('status', 'published');
      if (lessonRowsRes.error && !isRecoverableSchemaColumnError(lessonRowsRes.error)) throw lessonRowsRes.error;
      const lessonRows = lessonRowsRes.data || [];
      const lessonIds = lessonRows.map((l: any) => String(l.id)).filter(Boolean);
      if (!lessonIds.length) return res.json({ success: true, totalLessons: 0, completedLessons: 0, progressPercent: 0 });

      const progressRes = await fetchLessonProgressRows(caller.userId, lessonIds);
      if (progressRes.storage === 'table_missing') {
        return res.json({ success: true, totalLessons: lessonIds.length, completedLessons: 0, progressPercent: 0, storage: 'table_missing' });
      }
      const completedSet = new Set(
        (progressRes.rows || [])
          .filter((p: any) => toLessonCompleted(p))
          .map((p: any) => String(p.lesson_id))
      );
      const completedLessons = completedSet.size;
      const totalLessons = lessonIds.length;
      const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
      return res.json({ success: true, totalLessons, completedLessons, progressPercent });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load course progress' });
    }
  });

  // Get live sessions for which the authenticated student is an invited participant
  app.get('/api/student/live-sessions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }
      const { status } = req.query;

      // Find session_ids where this user is a non-removed participant
      const { data: participantRows, error: pErr } = await supabaseAdmin
        .from('session_participants')
        .select('session_id,is_removed')
        .eq('user_id', caller.userId);
      if (pErr && !isSessionParticipantsTableMissing(pErr)) throw pErr;

      const invitedSessionIds = (participantRows || [])
        .filter((p: { session_id: string; is_removed?: boolean }) => !p.is_removed)
        .map((p: { session_id: string }) => p.session_id);

      // Also find ended sessions from courses or classes the student is enrolled in
      const [{ data: enrolledCourses }, { data: enrolledClasses }] = await Promise.all([
        supabaseAdmin.from('courses').select('id').contains('student_ids', [caller.userId]),
        supabaseAdmin.from('classes').select('id').contains('student_ids', [caller.userId]),
      ]);
      const courseIds = (enrolledCourses || []).map((c: { id: string }) => c.id);
      const classIds = (enrolledClasses || []).map((c: { id: string }) => c.id);
      let enrolledSessionIds: string[] = [];
      if (courseIds.length > 0) {
        const { data: rows } = await supabaseAdmin.from('live_sessions').select('id').in('course_id', courseIds).eq('status', 'ended');
        enrolledSessionIds.push(...(rows || []).map((s: { id: string }) => s.id));
      }
      // NOTE: some DBs no longer have live_sessions.class_id; invitations handle class-based access.

      const allSessionIds = Array.from(new Set([...invitedSessionIds, ...enrolledSessionIds]));
      if (allSessionIds.length === 0) return res.json({ success: true, sessions: [] });

      let query = supabaseAdmin
        .from('live_sessions')
        .select('id, title, status, scheduled_at, duration_minutes, meeting_url, recording_url, max_participants, course_id, host:profiles!host_id(id,display_name)')
        .in('id', allSessionIds)
        .order('scheduled_at', { ascending: false });

      if (status) query = query.eq('status', status as string);

      let { data, error } = await query;
      if (error) {
        const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
        const classIdCacheErr =
          error.code === 'PGRST204' ||
          (msg.includes('class_id') && (msg.includes('schema cache') || msg.includes('could not find') || msg.includes('does not exist')));
        if (!classIdCacheErr) throw error;

        // Fallback: retry without relation joins in case stale relationship cache still references class_id.
        let fallbackQuery = supabaseAdmin
          .from('live_sessions')
          .select('id, title, status, scheduled_at, duration_minutes, meeting_url, recording_url, max_participants, course_id, host_id')
          .in('id', allSessionIds)
          .order('scheduled_at', { ascending: false });
        if (status) fallbackQuery = fallbackQuery.eq('status', status as string);

        const fallback = await fallbackQuery;
        if (fallback.error) throw fallback.error;

        const hostIds = Array.from(new Set((fallback.data || []).map((r: any) => String(r.host_id || '')).filter(Boolean)));
        let hostMap: Record<string, { id: string; display_name: string }> = {};
        if (hostIds.length > 0) {
          const hostsRes = await supabaseAdmin.from('profiles').select('id,display_name').in('id', hostIds);
          if (!hostsRes.error) {
            hostMap = Object.fromEntries(
              (hostsRes.data || []).map((h: any) => [String(h.id), { id: String(h.id), display_name: String(h.display_name || 'Teacher') }]),
            );
          }
        }
        data = (fallback.data || []).map((row: any) => ({
          ...row,
          host: row.host_id ? hostMap[String(row.host_id)] || null : null,
        }));
      }
      res.json({ success: true, sessions: data || [] });
    } catch (e: unknown) {
      console.error('GET /api/student/live-sessions', e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── LIVE SESSION RECORDING UPLOAD ──────────────────────────
  app.post('/api/admin/live-sessions/:id/upload-url', async (req, res) => {
    try {
      const { id } = req.params;
      const filename = `session-${id}-${Date.now()}.webm`;
      const storagePath = `recordings/${filename}`;
      // Create bucket if it doesn't exist
      await supabaseAdmin.storage.createBucket('recordings', { public: true }).catch(() => {});
      const { data, error } = await supabaseAdmin.storage.from('recordings').createSignedUploadUrl(storagePath);
      if (error) throw error;
      const { data: { publicUrl } } = supabaseAdmin.storage.from('recordings').getPublicUrl(storagePath);
      res.json({ success: true, signedUrl: data.signedUrl, publicUrl });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Single session fetch
  app.get('/api/admin/live-sessions/:id', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id)
        .single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── LIVE SESSIONS ──────────────────────────────────────────
  app.get('/api/admin/live-sessions', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, sessions: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/live-sessions', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions').insert({ ...req.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/live-sessions/:id', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('live_sessions').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/live-sessions/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('live_sessions').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── COMMUNITY POSTS ─────────────────────────────────────────
  const missingCommunityPostsClassIdColumn = (error: any) => {
    const hay = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    if (!hay.includes('class_id')) return false;
    return /schema cache|could not find|does not exist|42703|undefined column|column/i.test(hay);
  };

  const sortCommunityPosts = (rows: any[]) => {
    return [...(rows || [])].sort((a, b) => {
      const aPinned = String(a?.status || '') === 'pinned' ? 1 : 0;
      const bPinned = String(b?.status || '') === 'pinned' ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = new Date(String(a?.created_at || 0)).getTime();
      const bTime = new Date(String(b?.created_at || 0)).getTime();
      return bTime - aTime;
    });
  };

  const selectCommunityPostsCompat = async () => {
    const withClass = await supabaseAdmin
      .from('community_posts')
      .select('*, author:profiles!author_id(id,display_name,email), class_target:classes!class_id(id,name)')
      .order('created_at', { ascending: false });

    if (!withClass.error) {
      return { data: sortCommunityPosts(withClass.data || []), error: null };
    }

    if (!missingCommunityPostsClassIdColumn(withClass.error)) {
      return { data: null, error: withClass.error };
    }

    const fallback = await supabaseAdmin
      .from('community_posts')
      .select('*, author:profiles!author_id(id,display_name,email)')
      .order('created_at', { ascending: false });

    if (fallback.error) return { data: null, error: fallback.error };

    const normalized = (fallback.data || []).map((row: any) => ({
      ...row,
      class_id: null,
      class_target: null,
    }));
    return { data: sortCommunityPosts(normalized), error: null };
  };

  const insertCommunityPostCompat = async (payload: Record<string, unknown>) => {
    let current = { ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

    for (let i = 0; i < 4; i += 1) {
      const res = await supabaseAdmin.from('community_posts').insert(current).select().single();
      if (!res.error) return res;
      if (missingCommunityPostsClassIdColumn(res.error) && 'class_id' in current) {
        if (current.class_id) {
          return {
            data: null,
            error: new Error("Community class targeting needs the SQL in sql/add_community_post_class_id.sql."),
          };
        }
        const next = { ...current };
        delete next.class_id;
        current = next;
        continue;
      }
      return res;
    }

    return { data: null, error: new Error('Community insert: compatibility retries exhausted') };
  };

  const updateCommunityPostCompat = async (id: string, payload: Record<string, unknown>) => {
    let current = { ...payload, updated_at: new Date().toISOString() };

    for (let i = 0; i < 4; i += 1) {
      const res = await supabaseAdmin.from('community_posts').update(current).eq('id', id).select().single();
      if (!res.error) return res;
      if (missingCommunityPostsClassIdColumn(res.error) && 'class_id' in current) {
        if (current.class_id) {
          return {
            data: null,
            error: new Error("Community class targeting needs the SQL in sql/add_community_post_class_id.sql."),
          };
        }
        const next = { ...current };
        delete next.class_id;
        current = next;
        continue;
      }
      return res;
    }

    return { data: null, error: new Error('Community update: compatibility retries exhausted') };
  };

  app.get('/api/admin/community', async (req, res) => {
    try {
      const { data, error } = await selectCommunityPostsCompat();
      if (error) throw error;
      res.json({ success: true, posts: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/community', async (req, res) => {
    try {
      const { data, error } = await insertCommunityPostCompat(req.body || {});
      if (error) throw error;
      res.json({ success: true, post: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/community/:id', async (req, res) => {
    try {
      const { data, error } = await updateCommunityPostCompat(req.params.id, req.body || {});
      if (error) throw error;
      res.json({ success: true, post: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/community/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('community_posts').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  const canModerateDiscussion = (role: string) => role === 'teacher' || role === 'admin';
  const canMarkBestAnswer = (role: string) => role === 'teacher' || role === 'admin';
  const canUseDiscussion = (role: string) => role === 'student' || role === 'teacher' || role === 'admin';
  const asInt = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const awardDiscussionBadges = async (userId: string) => {
    try {
      const [statsRes, badgesRes] = await Promise.all([
        poolQuery(`SELECT * FROM discussion_user_stats WHERE user_id = $1`, [userId]),
        poolQuery(`SELECT * FROM discussion_badges`),
      ]);
      const stats = statsRes.rows[0];
      const badgeRows = badgesRes.rows;
      if (!stats || badgeRows.length === 0) return;
      for (const badge of badgeRows) {
        const key = String(badge.key || '');
        const threshold = asInt(badge.threshold, 1);
        const answersCount = asInt(stats.answers_count, 0);
        const bestAnswers = asInt(stats.best_answers_count, 0);
        const helpfulReceived = asInt(stats.helpful_reactions_received, 0);
        const shouldGrant =
          (key === 'first_answer' && answersCount >= threshold) ||
          (key === 'helpful_contributor' && helpfulReceived >= threshold) ||
          (key === 'mentor' && bestAnswers >= threshold);
        if (shouldGrant) {
          await poolQuery(
            `INSERT INTO discussion_user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT (user_id, badge_id) DO NOTHING`,
            [userId, String(badge.id || '')]
          ).catch(() => {});
        }
      }
    } catch { /* silent */ }
  };

  // ─── REAL-TIME LIVE QUIZ SYSTEM (Kahoot-style) ───────────────────────────────

  interface RQQuestion {
    id: string;
    index: number;
    body: string;
    options: string[];
    correctAnswer: string;
    points: number;
    timerSeconds: number;
    type: string;
  }

  interface RQAnswer {
    optionText: string;
    isCorrect: boolean;
    pointsEarned: number;
    answeredAt: number;
  }

  interface RQParticipant {
    userId: string;
    displayName: string;
    score: number;
    answers: Record<number, RQAnswer>;
    status: 'connected' | 'disconnected';
    joinedAt: number;
  }

  interface RQSession {
    id: string;
    quizId: string;
    quizTitle: string;
    hostId: string;
    pin: string;
    status: 'waiting' | 'active' | 'ended';
    currentQuestionIndex: number;
    questionStartedAt: number | null;
    questions: RQQuestion[];
    participants: Map<string, RQParticipant>;
    createdAt: number;
    autoNextTimer?: ReturnType<typeof setTimeout>;
    teamsEnabled: boolean;
    teamCount: number;
    teamNames: string[];
    participantTeams: Record<string, string>;
    teamScores: Record<string, number>;
  }

  const rqSessions = new Map<string, RQSession>();
  const rqPins = new Map<string, string>(); // pin → sessionId

  interface RQReportParticipant {
    rank: number; userId: string; displayName: string;
    score: number; correctAnswers: number; totalAnswers: number; accuracy: number;
  }
  interface RQReportQuestion {
    index: number; body: string; correctAnswer: string; options: string[];
    totalAnswered: number; correctCount: number; accuracy: number;
  }
  interface RQReport {
    id: string; quizId: string; quizTitle: string; hostId: string; pin: string;
    totalQuestions: number; participantCount: number;
    endedAt: number; createdAt: number;
    leaderboard: RQReportParticipant[];
    questionStats: RQReportQuestion[];
  }
  const rqCompletedSessions = new Map<string, RQReport>();

  const buildRQReport = (session: RQSession): RQReport => {
    const parts = [...session.participants.values()];
    const leaderboard: RQReportParticipant[] = parts
      .map(p => {
        const totalAnswers = Object.keys(p.answers).length;
        const correctAnswers = Object.values(p.answers).filter(a => a.isCorrect).length;
        return { userId: p.userId, displayName: p.displayName, score: p.score,
          correctAnswers, totalAnswers,
          accuracy: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0, rank: 0 };
      })
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 }));
    const questionStats: RQReportQuestion[] = session.questions.map(q => {
      const answers = parts.map(p => p.answers[q.index]).filter(Boolean);
      const correctCount = answers.filter(a => a.isCorrect).length;
      return { index: q.index, body: q.body, correctAnswer: q.correctAnswer,
        options: q.options, totalAnswered: answers.length, correctCount,
        accuracy: answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0 };
    });
    return { id: session.id, quizId: session.quizId, quizTitle: session.quizTitle,
      hostId: session.hostId, pin: session.pin, totalQuestions: session.questions.length,
      participantCount: parts.length, endedAt: Date.now(), createdAt: session.createdAt,
      leaderboard, questionStats };
  };

  const generatePin = (): string => {
    let pin: string;
    do { pin = String(Math.floor(100000 + Math.random() * 900000)); }
    while (rqPins.has(pin));
    return pin;
  };

  const rqBroadcast = async (sessionId: string, event: string, payload: unknown) => {
    try {
      await (supabaseAdmin as any)
        .channel(`quiz:${sessionId}`)
        .send({ type: 'broadcast', event, payload });
    } catch (_) { /* non-critical */ }
  };

  const rqLeaderboard = (session: RQSession) =>
    [...session.participants.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, userId: p.userId, displayName: p.displayName, score: p.score }));

  // ─── ACHIEVEMENT BADGE SYSTEM ─────────────────────────────────────────────────
  interface RQBadgeDef { id: string; name: string; description: string; icon: string; color: string; rarity: string; }
  const BADGE_DEFS: RQBadgeDef[] = [
    { id: 'first_quiz',     name: 'Quiz Taker',         description: 'Completed your first quiz',                icon: '🎯', color: 'from-blue-400 to-blue-600',     rarity: 'common' },
    { id: 'perfect_score',  name: 'Perfectionist',      description: 'Got 100% on a quiz',                       icon: '⭐', color: 'from-amber-400 to-yellow-500',  rarity: 'rare' },
    { id: 'speed_demon',    name: 'Speed Demon',        description: 'Answered a live question in under 5s',     icon: '⚡', color: 'from-violet-500 to-purple-600', rarity: 'rare' },
    { id: 'live_player',    name: 'Live Participant',   description: 'Joined a live quiz session',               icon: '📡', color: 'from-emerald-400 to-teal-500',  rarity: 'common' },
    { id: 'champion',       name: 'Champion',           description: 'Finished #1 in a live quiz',               icon: '🏆', color: 'from-amber-500 to-orange-500',  rarity: 'epic' },
    { id: 'quiz_marathon',  name: 'Marathon Runner',    description: 'Completed 5 quizzes',                      icon: '🏃', color: 'from-sky-400 to-indigo-500',    rarity: 'uncommon' },
    { id: 'high_achiever',  name: 'High Achiever',      description: 'Scored 90%+ on a quiz',                   icon: '🌟', color: 'from-rose-400 to-pink-500',     rarity: 'uncommon' },
    { id: 'consistent',     name: 'Consistent Learner', description: 'Passed 3 quizzes in a row',               icon: '🔥', color: 'from-orange-400 to-red-500',    rarity: 'uncommon' },
  ];
  const studentBadges      = new Map<string, Set<string>>();
  const studentQuizCount   = new Map<string, number>();
  const studentPassStreak  = new Map<string, number>();

  const awardBadge = (userId: string, badgeId: string) => {
    if (!studentBadges.has(userId)) studentBadges.set(userId, new Set());
    studentBadges.get(userId)!.add(badgeId);
  };

  const checkAndAwardBadges = (
    userId: string,
    opts: { score?: number; total?: number; isLive?: boolean; rank?: number; answerTimeMs?: number }
  ) => {
    const count = (studentQuizCount.get(userId) ?? 0) + 1;
    studentQuizCount.set(userId, count);
    if (count === 1) awardBadge(userId, 'first_quiz');
    if (count >= 5)  awardBadge(userId, 'quiz_marathon');
    const pct = opts.total && opts.total > 0 ? (opts.score ?? 0) / opts.total * 100 : 0;
    if (pct >= 90)  awardBadge(userId, 'high_achiever');
    if (pct >= 100) awardBadge(userId, 'perfect_score');
    if (opts.isLive) {
      awardBadge(userId, 'live_player');
      if (opts.rank === 1) awardBadge(userId, 'champion');
      if (opts.answerTimeMs !== undefined && opts.answerTimeMs < 5000) awardBadge(userId, 'speed_demon');
    }
    const prevStreak = studentPassStreak.get(userId) ?? 0;
    const newStreak = pct >= 50 ? prevStreak + 1 : 0;
    studentPassStreak.set(userId, newStreak);
    if (newStreak >= 3) awardBadge(userId, 'consistent');
  };
  // ─── END ACHIEVEMENT BADGE SYSTEM ────────────────────────────────────────────

  const rqSessionPublic = (session: RQSession) => ({
    id: session.id,
    quizId: session.quizId,
    quizTitle: session.quizTitle,
    pin: session.pin,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    questionStartedAt: session.questionStartedAt,
    totalQuestions: session.questions.length,
    participantCount: session.participants.size,
  });

  const rqCurrentQuestionForStudent = (session: RQSession) => {
    if (session.status !== 'active') return null;
    const q = session.questions[session.currentQuestionIndex];
    if (!q) return null;
    const elapsed = session.questionStartedAt ? (Date.now() - session.questionStartedAt) / 1000 : 0;
    const remaining = Math.max(0, q.timerSeconds - elapsed);
    return {
      index: q.index,
      body: q.body,
      options: q.options,
      points: q.points,
      timerSeconds: q.timerSeconds,
      remainingSeconds: remaining,
      type: q.type,
    };
  };

  const rqScheduleAutoNext = (sessionId: string) => {
    const session = rqSessions.get(sessionId);
    if (!session || session.status !== 'active') return;
    const q = session.questions[session.currentQuestionIndex];
    if (!q) return;
    if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
    session.autoNextTimer = setTimeout(async () => {
      const s = rqSessions.get(sessionId);
      if (!s || s.status !== 'active') return;
      const nextIndex = s.currentQuestionIndex + 1;
      if (nextIndex >= s.questions.length) {
        s.status = 'ended';
        rqPins.delete(s.pin);
        rqCompletedSessions.set(s.id, buildRQReport(s));
        const board = rqLeaderboard(s);
        await rqBroadcast(sessionId, 'session_ended', { leaderboard: board });
      } else {
        s.currentQuestionIndex = nextIndex;
        s.questionStartedAt = Date.now();
        const nq = s.questions[nextIndex];
        await rqBroadcast(sessionId, 'question_started', {
          index: nq.index,
          body: nq.body,
          options: nq.options,
          points: nq.points,
          timerSeconds: nq.timerSeconds,
          startedAt: s.questionStartedAt,
        });
        rqScheduleAutoNext(sessionId);
      }
    }, q.timerSeconds * 1000 + 500);
  };

  // Teacher: start a live quiz session
  app.post('/api/teacher/realtime-quiz/start', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Teacher or admin role required.' });
      }
      const { quizId, timerPerQuestion } = req.body as { quizId?: string; timerPerQuestion?: number };
      if (!quizId) return res.status(400).json({ error: 'quizId is required.' });

      const { data: quizRow, error: qErr } = await supabaseAdmin
        .from('quizzes').select('id, title, time_limit').eq('id', quizId).maybeSingle();
      if (qErr) throw qErr;
      if (!quizRow) return res.status(404).json({ error: 'Quiz not found.' });

      const { data: qRows, error: qqErr } = await supabaseAdmin
        .from('questions').select('*').eq('quiz_id', quizId).order('order', { ascending: true });
      if (qqErr) throw qqErr;
      const rawQs = qRows ?? [];

      const liveTypes = new Set(['multiple-choice', 'true-false']);
      // Normalize an option (could be {id,text} object or plain string) to plain text
      const normalizeRqOption = (o: any): string =>
        o && typeof o === 'object' ? String(o.text ?? o.label ?? '') : String(o ?? '');
      const rqQuestions: RQQuestion[] = rawQs
        .filter((r: any) => liveTypes.has(r.type))
        .map((r: any, idx: number) => {
          const rawOpts: any[] = Array.isArray(r.options) ? r.options : [];
          const opts: string[] = rawOpts.map(normalizeRqOption);
          // correctAnswer may be stored as an option ID (e.g. "opt_abc") — resolve to text
          const rawCorrect = String(r.correct_answer ?? '');
          const matchedOpt = rawOpts.find((o: any) => o && typeof o === 'object' && o.id === rawCorrect);
          const correctAnswer = matchedOpt ? normalizeRqOption(matchedOpt) : rawCorrect;
          return {
            id: r.id,
            index: idx,
            body: String(r.question_text ?? r.text ?? ''),
            options: opts,
            correctAnswer,
            points: typeof r.points === 'number' ? r.points : 1,
            timerSeconds: typeof timerPerQuestion === 'number' && timerPerQuestion > 0
              ? timerPerQuestion : 30,
            type: r.type,
          };
        });

      if (rqQuestions.length === 0) {
        return res.status(400).json({ error: 'Quiz has no multiple-choice or true/false questions suitable for live play.' });
      }

      const sessionId = `rqs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const pin = generatePin();

      const { teamsEnabled, teamCount } = req.body as { quizId?: string; timerPerQuestion?: number; teamsEnabled?: boolean; teamCount?: number };
      const tCount = Math.min(6, Math.max(2, Number(teamCount) || 2));
      const defaultTeamNames = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];
      const teamNames = defaultTeamNames.slice(0, tCount);
      const teamScores: Record<string, number> = {};
      teamNames.forEach(n => { teamScores[n] = 0; });

      const session: RQSession = {
        id: sessionId,
        quizId,
        quizTitle: String((quizRow as any).title ?? 'Untitled Quiz'),
        hostId: caller.userId,
        pin,
        status: 'waiting',
        currentQuestionIndex: 0,
        questionStartedAt: null,
        questions: rqQuestions,
        participants: new Map(),
        createdAt: Date.now(),
        teamsEnabled: Boolean(teamsEnabled),
        teamCount: tCount,
        teamNames,
        participantTeams: {},
        teamScores,
      };
      rqSessions.set(sessionId, session);
      rqPins.set(pin, sessionId);

      // Auto-clean sessions after 3 hours
      setTimeout(() => {
        const s = rqSessions.get(sessionId);
        if (s) { rqPins.delete(s.pin); rqSessions.delete(sessionId); }
      }, 3 * 60 * 60 * 1000);

      res.json({ success: true, sessionId, pin, quizTitle: session.quizTitle, totalQuestions: rqQuestions.length });
    } catch (err) {
      console.error('[rq] start error:', err);
      res.status(500).json({ error: 'Failed to start session.' });
    }
  });

  // Teacher: get session host state
  app.get('/api/teacher/realtime-quiz/:sessionId', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      if (session.hostId !== caller.userId && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const q = session.questions[session.currentQuestionIndex] ?? null;
      const elapsed = session.questionStartedAt ? (Date.now() - session.questionStartedAt) / 1000 : 0;
      res.json({
        success: true,
        session: rqSessionPublic(session),
        currentQuestion: q ? {
          index: q.index, body: q.body, options: q.options, correctAnswer: q.correctAnswer,
          points: q.points, timerSeconds: q.timerSeconds, type: q.type,
          remainingSeconds: Math.max(0, q.timerSeconds - elapsed),
        } : null,
        participants: [...session.participants.values()].map(p => ({
          userId: p.userId, displayName: p.displayName, score: p.score,
          status: p.status, answeredCurrent: p.answers[session.currentQuestionIndex] !== undefined,
        })),
        leaderboard: rqLeaderboard(session),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get session.' });
    }
  });

  // Teacher: list active sessions
  app.get('/api/teacher/realtime-quiz/sessions/list', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const sessions = [...rqSessions.values()]
        .filter(s => s.hostId === caller.userId || caller.role === 'admin')
        .map(rqSessionPublic);
      res.json({ success: true, sessions });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list sessions.' });
    }
  });

  // Teacher: list completed quiz reports
  app.get('/api/teacher/rq-reports', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const reports = [...rqCompletedSessions.values()]
        .filter(r => r.hostId === caller.userId || caller.role === 'admin')
        .sort((a, b) => b.endedAt - a.endedAt)
        .map(r => ({
          id: r.id, quizId: r.quizId, quizTitle: r.quizTitle, pin: r.pin,
          totalQuestions: r.totalQuestions, participantCount: r.participantCount,
          endedAt: r.endedAt, createdAt: r.createdAt,
          avgScore: r.leaderboard.length > 0
            ? Math.round(r.leaderboard.reduce((s, p) => s + p.score, 0) / r.leaderboard.length)
            : 0,
          avgAccuracy: r.leaderboard.length > 0
            ? Math.round(r.leaderboard.reduce((s, p) => s + p.accuracy, 0) / r.leaderboard.length)
            : 0,
        }));
      res.json({ success: true, reports });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch reports.' });
    }
  });

  // Teacher: get single report detail
  app.get('/api/teacher/rq-reports/:sessionId', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const report = rqCompletedSessions.get(req.params.sessionId);
      if (!report) return res.status(404).json({ error: 'Report not found.' });
      if (report.hostId !== caller.userId && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      res.json({ success: true, report });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch report.' });
    }
  });

  // Teacher: next question
  app.patch('/api/teacher/realtime-quiz/:sessionId/next', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      if (session.hostId !== caller.userId && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
      }

      if (session.status === 'waiting') {
        session.status = 'active';
        session.currentQuestionIndex = 0;
        session.questionStartedAt = Date.now();
        const q = session.questions[0];
        await rqBroadcast(session.id, 'question_started', {
          index: q.index, body: q.body, options: q.options, points: q.points,
          timerSeconds: q.timerSeconds, startedAt: session.questionStartedAt,
        });
        rqScheduleAutoNext(session.id);
        return res.json({ success: true, status: 'active', questionIndex: 0 });
      }

      if (session.status === 'active') {
        if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
        const nextIndex = session.currentQuestionIndex + 1;
        if (nextIndex >= session.questions.length) {
          session.status = 'ended';
          rqPins.delete(session.pin);
          rqCompletedSessions.set(session.id, buildRQReport(session));
          const board = rqLeaderboard(session);
          await rqBroadcast(session.id, 'session_ended', { leaderboard: board });
          return res.json({ success: true, status: 'ended', leaderboard: board });
        }
        session.currentQuestionIndex = nextIndex;
        session.questionStartedAt = Date.now();
        const nq = session.questions[nextIndex];
        await rqBroadcast(session.id, 'question_started', {
          index: nq.index, body: nq.body, options: nq.options, points: nq.points,
          timerSeconds: nq.timerSeconds, startedAt: session.questionStartedAt,
        });
        rqScheduleAutoNext(session.id);
        return res.json({ success: true, status: 'active', questionIndex: nextIndex });
      }

      res.status(400).json({ error: 'Session is already ended.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to advance question.' });
    }
  });

  // Teacher: end session
  app.post('/api/teacher/realtime-quiz/:sessionId/end', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      if (session.hostId !== caller.userId && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
      session.status = 'ended';
      rqPins.delete(session.pin);
      rqCompletedSessions.set(session.id, buildRQReport(session));
      const board = rqLeaderboard(session);
      await rqBroadcast(session.id, 'session_ended', { leaderboard: board });
      res.json({ success: true, leaderboard: board });
    } catch (err) {
      res.status(500).json({ error: 'Failed to end session.' });
    }
  });

  // Student: join by PIN
  app.post('/api/student/realtime-quiz/join', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { pin, displayName } = req.body as { pin?: string; displayName?: string };
      if (!pin) return res.status(400).json({ error: 'PIN is required.' });
      const sessionId = rqPins.get(String(pin).trim());
      if (!sessionId) return res.status(404).json({ error: 'Invalid PIN. No active quiz found.' });
      const session = rqSessions.get(sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      if (session.status === 'ended') return res.status(400).json({ error: 'This quiz session has already ended.' });

      const name = String(displayName ?? 'Student').slice(0, 40);
      let participant = session.participants.get(caller.userId);
      if (!participant) {
        participant = { userId: caller.userId, displayName: name, score: 0, answers: {}, status: 'connected', joinedAt: Date.now() };
        session.participants.set(caller.userId, participant);
        await rqBroadcast(sessionId, 'participant_joined', {
          displayName: name, participantCount: session.participants.size,
        });
      } else {
        participant.status = 'connected';
        participant.displayName = name;
      }

      if (session.teamsEnabled && !session.participantTeams[caller.userId]) {
        const teamMemberCounts = session.teamNames.map(t =>
          Object.values(session.participantTeams).filter(v => v === t).length
        );
        const minIdx = teamMemberCounts.indexOf(Math.min(...teamMemberCounts));
        session.participantTeams[caller.userId] = session.teamNames[minIdx];
      }

      const currentQ = rqCurrentQuestionForStudent(session);
      res.json({
        success: true,
        sessionId,
        quizTitle: session.quizTitle,
        status: session.status,
        totalQuestions: session.questions.length,
        currentQuestion: currentQ,
        submittedAnswers: Object.fromEntries(
          Object.entries(participant.answers).map(([k, v]) => [k, v.optionText])
        ),
        score: participant.score,
        teamName: session.teamsEnabled ? (session.participantTeams[caller.userId] ?? null) : null,
        teamsEnabled: session.teamsEnabled,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to join session.' });
    }
  });

  // Student: get current state (rejoin)
  app.get('/api/student/realtime-quiz/:sessionId/state', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      const participant = session.participants.get(caller.userId);
      if (!participant) return res.status(403).json({ error: 'You have not joined this session.' });
      if (participant.status === 'disconnected') participant.status = 'connected';

      const currentQ = rqCurrentQuestionForStudent(session);
      const board = session.status === 'ended' ? rqLeaderboard(session) : null;
      res.json({
        success: true,
        sessionId: session.id,
        quizTitle: session.quizTitle,
        status: session.status,
        totalQuestions: session.questions.length,
        currentQuestion: currentQ,
        submittedAnswers: Object.fromEntries(
          Object.entries(participant.answers).map(([k, v]) => [k, v.optionText])
        ),
        score: participant.score,
        leaderboard: board,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get state.' });
    }
  });

  // Student: submit answer
  app.post('/api/student/realtime-quiz/:sessionId/answer', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      if (session.status !== 'active') return res.status(400).json({ error: 'Quiz is not active.' });

      const participant = session.participants.get(caller.userId);
      if (!participant) return res.status(403).json({ error: 'You have not joined this session.' });

      const { questionIndex, optionText } = req.body as { questionIndex?: number; optionText?: string };
      if (typeof questionIndex !== 'number') return res.status(400).json({ error: 'questionIndex required.' });
      if (questionIndex !== session.currentQuestionIndex) {
        return res.status(400).json({ error: 'This question is no longer active.' });
      }
      if (participant.answers[questionIndex] !== undefined) {
        return res.status(400).json({ error: 'Already answered this question.' });
      }

      const q = session.questions[questionIndex];
      if (!q) return res.status(400).json({ error: 'Invalid question.' });

      // Anti-cheat: check timer
      if (session.questionStartedAt) {
        const elapsed = (Date.now() - session.questionStartedAt) / 1000;
        if (elapsed > q.timerSeconds + 1) {
          return res.status(400).json({ error: 'Time is up for this question.' });
        }
      }

      const isCorrect = String(optionText ?? '').trim() === String(q.correctAnswer ?? '').trim();
      let pointsEarned = 0;
      if (isCorrect && session.questionStartedAt) {
        const elapsed = (Date.now() - session.questionStartedAt) / 1000;
        const speedBonus = Math.max(0, 1 - elapsed / q.timerSeconds);
        pointsEarned = Math.round(q.points * (0.5 + 0.5 * speedBonus));
      }

      participant.answers[questionIndex] = {
        optionText: String(optionText ?? ''),
        isCorrect,
        pointsEarned,
        answeredAt: Date.now(),
      };
      participant.score += pointsEarned;

      if (session.teamsEnabled && session.participantTeams[caller.userId]) {
        const team = session.participantTeams[caller.userId];
        session.teamScores[team] = (session.teamScores[team] ?? 0) + pointsEarned;
      }

      const answeredMs = session.questionStartedAt ? Date.now() - session.questionStartedAt : 99999;
      checkAndAwardBadges(caller.userId, { isLive: true, answerTimeMs: answeredMs });

      const teamLeaderboard = session.teamsEnabled
        ? session.teamNames.map(t => ({ team: t, score: session.teamScores[t] ?? 0 })).sort((a, b) => b.score - a.score)
        : null;

      await rqBroadcast(session.id, 'leaderboard_updated', {
        leaderboard: rqLeaderboard(session),
        teamLeaderboard,
        teamScores: session.teamScores,
      });

      res.json({
        success: true, isCorrect, pointsEarned, correctAnswer: q.correctAnswer, score: participant.score,
        teamScore: session.teamsEnabled && session.participantTeams[caller.userId]
          ? session.teamScores[session.participantTeams[caller.userId]] : null,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit answer.' });
    }
  });

  // Public leaderboard
  app.get('/api/realtime-quiz/:sessionId/leaderboard', async (req: Request, res: Response) => {
    try {
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      res.json({ success: true, leaderboard: rqLeaderboard(session), status: session.status });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get leaderboard.' });
    }
  });

  // ─── INVITE CODE SYSTEM ─────────────────────────────────────────────────────
  const classInviteCodes = new Map<string, string>();   // code → classId
  const classIdToCodes   = new Map<string, string>();   // classId → code

  const generateInviteCode = (classId: string): string => {
    if (classIdToCodes.has(classId)) return classIdToCodes.get(classId)!;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do { code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
    while (classInviteCodes.has(code));
    classInviteCodes.set(code, classId);
    classIdToCodes.set(classId, code);
    return code;
  };

  app.get('/api/teacher/classes/:classId/invite-code', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { classId } = req.params;
      const code = generateInviteCode(classId);
      const domain = process.env.REPLIT_DEV_DOMAIN || '';
      const link = domain ? `https://${domain}/student/join-class?code=${code}` : `/student/join-class?code=${code}`;
      res.json({ success: true, code, link });
    } catch { res.status(500).json({ error: 'Failed to generate invite code.' }); }
  });

  app.get('/api/classes/invite/:code', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const code = String(req.params.code).toUpperCase().trim();
      const classId = classInviteCodes.get(code);
      if (!classId) return res.status(404).json({ error: 'Invalid or expired invite code.' });
      const { data: cls, error: clsErr } = await supabaseAdmin.from('classes').select('*').eq('id', classId).maybeSingle();
      if (clsErr || !cls) return res.status(404).json({ error: 'Class not found.' });
      const studentIds = Array.isArray((cls as any).student_ids) ? (cls as any).student_ids : [];
      let courseName: string | undefined;
      if ((cls as any).course_id) {
        const { data: course } = await supabaseAdmin.from('courses').select('title').eq('id', (cls as any).course_id).maybeSingle();
        courseName = (course as any)?.title;
      }
      res.json({ success: true, class: {
        id: (cls as any).id, name: (cls as any).name, description: (cls as any).description,
        status: (cls as any).status, capacity: (cls as any).capacity ?? 30,
        studentCount: studentIds.length, courseName,
      }});
    } catch { res.status(500).json({ error: 'Failed to look up class.' }); }
  });

  app.post('/api/student/classes/join-by-code', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { code } = req.body as { code?: string };
      if (!code) return res.status(400).json({ error: 'Code is required.' });
      const classId = classInviteCodes.get(String(code).toUpperCase().trim());
      if (!classId) return res.status(404).json({ error: 'Invalid or expired invite code.' });
      const { data: cls, error: clsErr } = await supabaseAdmin.from('classes').select('*').eq('id', classId).maybeSingle();
      if (clsErr || !cls) return res.status(404).json({ error: 'Class not found.' });
      const currentIds: string[] = Array.isArray((cls as any).student_ids) ? (cls as any).student_ids : [];
      if (currentIds.includes(caller.userId)) return res.json({ success: true, message: 'Already enrolled.' });
      const { error: updateErr } = await supabaseAdmin.from('classes').update({ student_ids: [...currentIds, caller.userId] }).eq('id', classId);
      if (updateErr) throw updateErr;
      res.json({ success: true, message: 'Joined class successfully.' });
    } catch { res.status(500).json({ error: 'Failed to join class.' }); }
  });
  // ─── END INVITE CODE SYSTEM ──────────────────────────────────────────────────

  // Student: get earned badges
  app.get('/api/student/badges', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const earned = studentBadges.get(caller.userId) ?? new Set<string>();
      const badges = BADGE_DEFS.map(b => ({ ...b, earned: earned.has(b.id), earnedAt: earned.has(b.id) ? new Date().toISOString() : null }));
      res.json({ success: true, badges, earnedCount: earned.size, totalCount: BADGE_DEFS.length });
    } catch { res.status(500).json({ error: 'Failed to get badges.' }); }
  });

  // ─── END REAL-TIME LIVE QUIZ ──────────────────────────────────────────────────

  const addDiscussionNotification = async (userId: string, title: string, message: string, actionUrl: string) => {
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      title,
      message: message.slice(0, 240),
      type: 'info',
      read: false,
      action_url: actionUrl,
      created_at: new Date().toISOString(),
    });
  };

  const resolveQuestionOrdering = (sort: string) => {
    if (sort === 'helpful') return { col: 'helpful_score', asc: false };
    if (sort === 'recent') return { col: 'last_activity_at', asc: false };
    return { col: 'created_at', asc: false };
  };


  app.get('/api/student/community', async (_req, res) => {
    res.json({ success: true, posts: [], deprecated: true, message: 'Use lesson discussion endpoints.' });
  });

  // Fetch profiles from Supabase and enrich rows whose author.display_name is missing.
  const supabaseEnrichAuthors = async (rows: any[]): Promise<any[]> => {
    if (!rows.length) return rows;
    const missingIds = [...new Set(
      rows
        .filter((r: any) => !r?.author?.display_name)
        .map((r: any) => String(r?.author_id || ''))
        .filter(Boolean),
    )];
    if (!missingIds.length) return rows;
    try {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name, email')
        .in('id', missingIds);
      if (!data?.length) return rows;
      const profileMap = new Map((data as any[]).map((p: any) => [String(p.id), p]));
      return rows.map((row: any) => {
        if (row?.author?.display_name) return row;
        const authorId = String(row?.author_id || '');
        if (!authorId) return row;
        const profile = profileMap.get(authorId);
        if (!profile) return row;
        return { ...row, author: { id: profile.id, display_name: profile.display_name, email: profile.email } };
      });
    } catch {
      return rows;
    }
  };

  // Helper: fetch a question row with author info via pg
  const pgGetQuestion = async (questionId: string) => {
    const r = await poolQuery(
      `SELECT q.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
       FROM lesson_discussion_questions q
       LEFT JOIN profiles p ON p.id = q.author_id
       WHERE q.id = $1 AND q.deleted_at IS NULL`,
      [questionId]
    );
    if (!r.rows[0]) return null;
    const enriched = await supabaseEnrichAuthors([r.rows[0]]);
    return enriched[0] || null;
  };
  const pgGetAnswer = async (answerId: string) => {
    const r = await poolQuery(
      `SELECT a.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
       FROM lesson_discussion_answers a
       LEFT JOIN profiles p ON p.id = a.author_id
       WHERE a.id = $1`,
      [answerId]
    );
    if (!r.rows[0]) return null;
    const enriched = await supabaseEnrichAuthors([r.rows[0]]);
    return enriched[0] || null;
  };
  const pgUpsertStats = async (userId: string, delta: { answers?: number; reputation?: number; best_answers?: number; helpful?: number }) => {
    await poolQuery(
      `INSERT INTO discussion_user_stats (user_id, answers_count, reputation, best_answers_count, helpful_reactions_received, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         answers_count = discussion_user_stats.answers_count + $2,
         reputation = discussion_user_stats.reputation + $3,
         best_answers_count = discussion_user_stats.best_answers_count + $4,
         helpful_reactions_received = discussion_user_stats.helpful_reactions_received + $5,
         updated_at = now()`,
      [userId, delta.answers ?? 0, delta.reputation ?? 0, delta.best_answers ?? 0, delta.helpful ?? 0]
    );
  };

  app.get('/api/student/lessons/:lessonId/discussions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canUseDiscussion(caller.role)) return res.status(403).json({ error: 'Forbidden' });
      const lessonId = String(req.params.lessonId || '').trim();
      const q = String(req.query.q || '').trim().toLowerCase();
      const sort = String(req.query.sort || 'recent').trim();
      const limit = Math.min(50, Math.max(1, asInt(req.query.limit, 20)));
      const cursor = String(req.query.cursor || '').trim();
      const order = resolveQuestionOrdering(sort);
      const orderDir = order.asc ? 'ASC' : 'DESC';
      const params: unknown[] = [lessonId, limit + 1];
      let cursorClause = '';
      if (cursor) {
        params.push(cursor);
        cursorClause = `AND q.${order.col} < $${params.length}`;
      }
      const sql = `
        SELECT q.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
        FROM lesson_discussion_questions q
        LEFT JOIN profiles p ON p.id = q.author_id
        WHERE q.lesson_id = $1 AND q.deleted_at IS NULL ${cursorClause}
        ORDER BY q.is_pinned DESC, q.${order.col} ${orderDir}
        LIMIT $2`;
      const result = await poolQuery(sql, params);
      let rows = result.rows as any[];
      if (sort === 'unanswered') rows = rows.filter((row) => asInt(row?.answers_count, 0) === 0);
      if (q) rows = rows.filter((row) => `${row?.title || ''} ${row?.body || ''}`.toLowerCase().includes(q));
      const hasMore = rows.length > limit;
      let pageRows = hasMore ? rows.slice(0, limit) : rows;
      pageRows = await supabaseEnrichAuthors(pageRows);
      const nextCursor = hasMore ? String(rows.slice(0, limit)[rows.slice(0, limit).length - 1]?.[order.col] || '') : null;
      res.json({ success: true, questions: pageRows, hasMore, nextCursor });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load lesson discussions' });
    }
  });

  app.post('/api/student/lessons/:lessonId/discussions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canUseDiscussion(caller.role)) return res.status(403).json({ error: 'Forbidden' });
      const lessonId = String(req.params.lessonId || '').trim();
      const title = String(req.body?.title || '').trim();
      const body = String(req.body?.body || '').trim();
      if (!lessonId || !title || !body) return res.status(400).json({ error: 'lessonId, title, and body are required' });
      const now = new Date().toISOString();
      const r = await poolQuery(
        `INSERT INTO lesson_discussion_questions (lesson_id, author_id, title, body, is_pinned, created_at, updated_at, last_activity_at)
         VALUES ($1,$2,$3,$4,false,$5,$5,$5) RETURNING *`,
        [lessonId, caller.userId, title, body, now]
      );
      const question = await pgGetQuestion(String(r.rows[0]?.id || ''));
      res.json({ success: true, question: question || r.rows[0] });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to create question' });
    }
  });

  app.get('/api/student/discussions/questions/:questionId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || '').trim();
      const [question, answersRes] = await Promise.all([
        pgGetQuestion(questionId),
        poolQuery(
          `SELECT a.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
           FROM lesson_discussion_answers a
           LEFT JOIN profiles p ON p.id = a.author_id
           WHERE a.question_id = $1 AND a.deleted_at IS NULL
           ORDER BY a.is_best DESC, a.helpful_score DESC, a.created_at ASC`,
          [questionId]
        ),
      ]);
      let answers = answersRes.rows as any[];
      answers = await supabaseEnrichAuthors(answers);
      const answerIds = answers.map((a) => String(a.id)).filter(Boolean);
      let replies: any[] = [];
      if (answerIds.length) {
        const rr = await poolQuery(
          `SELECT r.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
           FROM lesson_discussion_replies r
           LEFT JOIN profiles p ON p.id = r.author_id
           WHERE r.answer_id = ANY($1::uuid[]) AND r.deleted_at IS NULL
           ORDER BY r.created_at ASC`,
          [answerIds]
        );
        replies = await supabaseEnrichAuthors(rr.rows);
      }
      res.json({ success: true, question, answers, replies });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load thread' });
    }
  });

  app.patch('/api/student/discussions/questions/:questionId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || '').trim();
      const current = await pgGetQuestion(questionId);
      if (!current) return res.status(404).json({ error: 'Question not found' });
      if (String(current.author_id || '') !== caller.userId && !canModerateDiscussion(caller.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const sets: string[] = ['updated_at = now()'];
      const params: unknown[] = [];
      if (typeof req.body?.title === 'string') { params.push(String(req.body.title).trim()); sets.push(`title = $${params.length}`); }
      if (typeof req.body?.body === 'string') { params.push(String(req.body.body).trim()); sets.push(`body = $${params.length}`); }
      params.push(questionId);
      await poolQuery(`UPDATE lesson_discussion_questions SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      const question = await pgGetQuestion(questionId);
      res.json({ success: true, question });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to update question' });
    }
  });

  app.delete('/api/student/discussions/questions/:questionId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || '').trim();
      const current = await poolQuery(`SELECT id, author_id FROM lesson_discussion_questions WHERE id = $1`, [questionId]);
      const row = current.rows[0];
      if (!row) return res.status(404).json({ error: 'Question not found' });
      if (String(row.author_id || '') !== caller.userId && !canModerateDiscussion(caller.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await poolQuery(`UPDATE lesson_discussion_questions SET deleted_at = now(), updated_at = now() WHERE id = $1`, [questionId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete question' });
    }
  });

  app.post('/api/student/discussions/questions/:questionId/answers', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || '').trim();
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'body is required' });
      const qRes = await poolQuery(`SELECT id, author_id, answers_count FROM lesson_discussion_questions WHERE id = $1`, [questionId]);
      const question = qRes.rows[0];
      const aRes = await poolQuery(
        `INSERT INTO lesson_discussion_answers (question_id, author_id, body, created_at, updated_at)
         VALUES ($1,$2,$3,now(),now()) RETURNING *`,
        [questionId, caller.userId, body]
      );
      const answer = await pgGetAnswer(String(aRes.rows[0]?.id || ''));
      await poolQuery(
        `UPDATE lesson_discussion_questions SET answers_count = answers_count + 1, last_activity_at = now(), updated_at = now() WHERE id = $1`,
        [questionId]
      );
      await pgUpsertStats(caller.userId, { answers: 1, reputation: 2 });
      if (question && String(question.author_id || '') && String(question.author_id || '') !== caller.userId) {
        await addDiscussionNotification(String(question.author_id || ''), 'New answer to your question', body, `/student/community?question=${questionId}`);
      }
      await awardDiscussionBadges(caller.userId);
      res.json({ success: true, answer: answer || aRes.rows[0] });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to add answer' });
    }
  });

  app.post('/api/student/discussions/answers/:answerId/replies', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const answerId = String(req.params.answerId || '').trim();
      const body = String(req.body?.body || '').trim();
      const parentReplyId = req.body?.parent_reply_id ? String(req.body.parent_reply_id).trim() : null;
      if (!body) return res.status(400).json({ error: 'body is required' });
      let depth = 0;
      if (parentReplyId) {
        const pr = await poolQuery(`SELECT depth FROM lesson_discussion_replies WHERE id = $1`, [parentReplyId]);
        depth = Math.min(3, asInt(pr.rows[0]?.depth, 0) + 1);
      }
      const aRes = await poolQuery(`SELECT id, author_id, question_id, replies_count FROM lesson_discussion_answers WHERE id = $1`, [answerId]);
      const answer = aRes.rows[0];
      const rRes = await poolQuery(
        `INSERT INTO lesson_discussion_replies (answer_id, author_id, body, parent_reply_id, depth, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,now(),now()) RETURNING *`,
        [answerId, caller.userId, body, parentReplyId, depth]
      );
      const replyRow = rRes.rows[0];
      // Attach author
      const fullReply = await poolQuery(
        `SELECT r.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
         FROM lesson_discussion_replies r LEFT JOIN profiles p ON p.id = r.author_id WHERE r.id = $1`,
        [String(replyRow?.id || '')]
      );
      await poolQuery(`UPDATE lesson_discussion_answers SET replies_count = replies_count + 1, updated_at = now() WHERE id = $1`, [answerId]);
      if (answer && String(answer.author_id || '') && String(answer.author_id || '') !== caller.userId) {
        await addDiscussionNotification(String(answer.author_id || ''), 'New reply to your answer', body, `/student/community?question=${String(answer.question_id || '')}`);
      }
      res.json({ success: true, reply: fullReply.rows[0] || replyRow });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to add reply' });
    }
  });

  app.post('/api/teacher/discussions/questions/:questionId/best-answer/:answerId', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canMarkBestAnswer(caller.role)) return res.status(403).json({ error: 'Forbidden' });
      const questionId = String(req.params.questionId || '').trim();
      const answerId = String(req.params.answerId || '').trim();
      await poolQuery(`UPDATE lesson_discussion_answers SET is_best = false, updated_at = now() WHERE question_id = $1`, [questionId]);
      await poolQuery(`UPDATE lesson_discussion_answers SET is_best = true, updated_at = now() WHERE id = $1`, [answerId]);
      const answerRow = await poolQuery(`SELECT id, author_id FROM lesson_discussion_answers WHERE id = $1`, [answerId]);
      await poolQuery(`UPDATE lesson_discussion_questions SET best_answer_id = $1, updated_at = now() WHERE id = $2`, [answerId, questionId]);
      const question = await pgGetQuestion(questionId);
      const answerAuthorId = String(answerRow.rows[0]?.author_id || '');
      if (answerAuthorId) {
        await pgUpsertStats(answerAuthorId, { best_answers: 1, reputation: 10 });
        await awardDiscussionBadges(answerAuthorId);
      }
      res.json({ success: true, question });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to mark best answer' });
    }
  });

  app.post('/api/teacher/discussions/questions/:questionId/pin', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canModerateDiscussion(caller.role)) return res.status(403).json({ error: 'Forbidden' });
      const questionId = String(req.params.questionId || '').trim();
      const isPinned = Boolean(req.body?.is_pinned ?? true);
      await poolQuery(`UPDATE lesson_discussion_questions SET is_pinned = $1, updated_at = now() WHERE id = $2`, [isPinned, questionId]);
      const question = await pgGetQuestion(questionId);
      res.json({ success: true, question });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to pin question' });
    }
  });

  app.post('/api/student/discussions/reactions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const targetType = String(req.body?.target_type || '').trim();
      const targetId = String(req.body?.target_id || '').trim();
      const reactionType = String(req.body?.reaction_type || 'like').trim();
      if (!targetType || !targetId) return res.status(400).json({ error: 'target_type and target_id are required' });
      const r = await poolQuery(
        `INSERT INTO lesson_discussion_reactions (user_id, target_type, target_id, reaction_type)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
        [caller.userId, targetType, targetId, reactionType]
      );
      res.json({ success: true, reaction: r.rows[0] || null });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to add reaction' });
    }
  });

  app.delete('/api/student/discussions/reactions', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const targetType = String(req.body?.target_type || '').trim();
      const targetId = String(req.body?.target_id || '').trim();
      const reactionType = String(req.body?.reaction_type || 'like').trim();
      await poolQuery(
        `DELETE FROM lesson_discussion_reactions WHERE user_id=$1 AND target_type=$2 AND target_id=$3 AND reaction_type=$4`,
        [caller.userId, targetType, targetId, reactionType]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to remove reaction' });
    }
  });

  app.post('/api/student/discussions/reports', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const targetType = String(req.body?.target_type || '').trim();
      const targetId = String(req.body?.target_id || '').trim();
      const reason = String(req.body?.reason || '').trim();
      const details = req.body?.details ? String(req.body.details) : null;
      if (!targetType || !targetId || !reason) return res.status(400).json({ error: 'target_type, target_id and reason are required' });
      const r = await poolQuery(
        `INSERT INTO lesson_discussion_reports (reporter_id, target_type, target_id, reason, details, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'open',now(),now()) RETURNING *`,
        [caller.userId, targetType, targetId, reason, details]
      );
      res.json({ success: true, report: r.rows[0] });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to submit report' });
    }
  });

  app.get('/api/teacher/discussions/reports', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canModerateDiscussion(caller.role)) return res.status(403).json({ error: 'Forbidden' });
      const r = await poolQuery(
        `SELECT rp.*,
           json_build_object('id',rep.id,'display_name',rep.display_name,'email',rep.email) AS reporter,
           json_build_object('id',rev.id,'display_name',rev.display_name,'email',rev.email) AS reviewer
         FROM lesson_discussion_reports rp
         LEFT JOIN profiles rep ON rep.id = rp.reporter_id
         LEFT JOIN profiles rev ON rev.id = rp.reviewed_by
         ORDER BY rp.created_at DESC`
      );
      res.json({ success: true, reports: r.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load reports' });
    }
  });

  app.post('/api/teacher/discussions/moderate', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canModerateDiscussion(caller.role)) return res.status(403).json({ error: 'Forbidden' });
      const targetType = String(req.body?.target_type || '').trim();
      const targetId = String(req.body?.target_id || '').trim();
      const actionType = String(req.body?.action_type || '').trim();
      const reason = req.body?.reason ? String(req.body.reason) : null;
      if (!targetType || !targetId || !actionType) return res.status(400).json({ error: 'target_type, target_id, action_type are required' });
      const deletedAt = actionType === 'restore' ? null : new Date().toISOString();
      if (targetType === 'question') {
        await poolQuery(`UPDATE lesson_discussion_questions SET deleted_at=$1, is_locked=$2, updated_at=now() WHERE id=$3`, [deletedAt, actionType === 'lock', targetId]);
      } else if (targetType === 'answer') {
        await poolQuery(`UPDATE lesson_discussion_answers SET deleted_at=$1, updated_at=now() WHERE id=$2`, [deletedAt, targetId]);
      } else if (targetType === 'reply') {
        await poolQuery(`UPDATE lesson_discussion_replies SET deleted_at=$1, updated_at=now() WHERE id=$2`, [deletedAt, targetId]);
      }
      await poolQuery(
        `INSERT INTO discussion_moderation_actions (actor_id, target_type, target_id, action_type, reason, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [caller.userId, targetType, targetId, actionType, reason, JSON.stringify(req.body?.metadata || {})]
      ).catch(() => {});
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to moderate content' });
    }
  });

  app.get('/api/admin/discussions/moderation', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
      const r = await poolQuery(
        `SELECT ma.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS actor
         FROM discussion_moderation_actions ma
         LEFT JOIN profiles p ON p.id = ma.actor_id
         ORDER BY ma.created_at DESC LIMIT 200`
      );
      res.json({ success: true, actions: r.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load moderation actions' });
    }
  });

  app.get('/api/student/discussions/me/stats', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const [statsRes, badgesRes] = await Promise.all([
        poolQuery(`SELECT * FROM discussion_user_stats WHERE user_id = $1`, [caller.userId]),
        poolQuery(
          `SELECT ub.awarded_at,
             json_build_object('id',b.id,'key',b.key,'label',b.label,'description',b.description) AS badge
           FROM discussion_user_badges ub
           JOIN discussion_badges b ON b.id = ub.badge_id
           WHERE ub.user_id = $1
           ORDER BY ub.awarded_at DESC`,
          [caller.userId]
        ),
      ]);
      res.json({ success: true, stats: statsRes.rows[0] || null, badges: badgesRes.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load discussion stats' });
    }
  });

  // ── MODULES (ADMIN) ───────────────────────────────────────────

  // â”€â”€ MODULES (ADMIN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.get('/api/admin/modules', async (req, res) => {
    try {
      const [modulesSnap, coursesSnap, teachersSnap] = await Promise.all([
        supabaseAdmin.from('modules').select('*').order('order', { ascending: true }),
        supabaseAdmin.from('courses').select('id, title, teacher_id'),
        supabaseAdmin.from('teachers').select('user_id, first_name, last_name'),
      ]);

      if (modulesSnap.error) throw modulesSnap.error;
      if (coursesSnap.error) throw coursesSnap.error;
      if (teachersSnap.error) throw teachersSnap.error;

      let lessonsSnap = await supabaseAdmin
        .from('lessons')
        .select('*')
        .order('order', { ascending: true });
      if (lessonsSnap.error) {
        lessonsSnap = await supabaseAdmin
          .from('lessons')
          .select('*')
          .order('created_at', { ascending: true });
      }
      if (lessonsSnap.error) throw lessonsSnap.error;

      res.json({
        success: true,
        modules: modulesSnap.data || [],
        courses: coursesSnap.data || [],
        teachers: teachersSnap.data || [],
        lessons: lessonsSnap.data || [],
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/modules', async (req, res) => {
    try {
      const payload = {
        ...req.body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from('modules').insert(payload).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/modules/:id', async (req, res) => {
    try {
      const payload = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from('modules').update(payload).eq('id', req.params.id).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/modules/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('modules').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── LESSONS (ADMIN, service role — bypasses RLS) ─────────────
  // List/load: use GET /api/admin/modules (includes lessons + courses + modules + teachers).

  app.post('/api/admin/lessons', async (req, res) => {
    try {
      const { title, short_description, course_id, module_id, type, duration_minutes, status, is_free_preview, slug, order } = req.body || {};
      if (!course_id || !module_id || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'course_id, module_id and title are required' });
      }
      const slugFinal =
        typeof slug === 'string' && slug.trim()
          ? slug.trim()
          : title
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)+/g, '');
      const now = new Date().toISOString();
      const payload = {
        title: title.trim(),
        short_description: short_description ?? null,
        course_id: String(course_id),
        module_id: String(module_id),
        type: type || 'video',
        duration_minutes: Number(duration_minutes) || 0,
        status: status || 'published',
        is_free_preview: Boolean(is_free_preview),
        slug: slugFinal,
        order: Number(order) || 1,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await supabaseAdmin.from('lessons').insert(payload).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(' — ') || error.code || 'Database error';
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/admin/lessons/:id', async (req, res) => {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'Lesson id is required' });
      const { title, short_description, course_id, module_id, type, duration_minutes, status, is_free_preview, order } = req.body || {};
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof title === 'string') updates.title = title.trim();
      if (short_description !== undefined) updates.short_description = short_description;
      if (course_id !== undefined) updates.course_id = String(course_id);
      if (module_id !== undefined) updates.module_id = String(module_id);
      if (type !== undefined) updates.type = type;
      if (duration_minutes !== undefined) updates.duration_minutes = Number(duration_minutes) || 0;
      if (status !== undefined) updates.status = status;
      if (is_free_preview !== undefined) updates.is_free_preview = Boolean(is_free_preview);
      if (order !== undefined) updates.order = Number(order) || 1;
      const { data, error } = await supabaseAdmin.from('lessons').update(updates).eq('id', id).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(' — ') || error.code || 'Database error';
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/admin/lessons/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('lessons').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ANNOUNCEMENTS ────────────────────────────────────────────
  const sendAnnouncementNotifications = async ({
    title,
    content,
    priority,
    audience,
    classIds,
    studentIds,
    sendEmail: shouldSendEmail = false,
  }: {
    title: string;
    content: string;
    priority: string;
    audience: string;
    classIds: string[];
    studentIds: string[];
    sendEmail?: boolean;
  }): Promise<number> => {
    const recipientIds = new Set<string>();
    studentIds.forEach((sid) => recipientIds.add(sid));

    for (const cid of classIds) {
      const { data: classRow } = await supabaseAdmin
        .from('classes')
        .select('student_ids')
        .eq('id', cid)
        .maybeSingle();
      ((classRow?.student_ids as string[]) || []).forEach((uid: string) => recipientIds.add(String(uid)));
    }

    let profilesById = new Map<string, { role: string; email: string; name: string }>();

    if (recipientIds.size > 0) {
      const { data: invitedProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, role, email, display_name')
        .in('id', [...recipientIds]);
      profilesById = new Map((invitedProfiles || []).map((p: any) => [
        String(p.id),
        { role: String(p.role || '').toLowerCase(), email: String(p.email || ''), name: String(p.display_name || p.email || '') },
      ]));
    } else {
      const normalizedAudience = String(audience || 'all').toLowerCase();
      const targetRoles = normalizedAudience === 'students'
        ? ['student']
        : normalizedAudience === 'teachers'
          ? ['teacher']
          : ['student', 'teacher'];

      const { data: audienceProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, role, email, display_name')
        .in('role', targetRoles);

      profilesById = new Map((audienceProfiles || []).map((p: any) => [
        String(p.id),
        { role: String(p.role || '').toLowerCase(), email: String(p.email || ''), name: String(p.display_name || p.email || '') },
      ]));
      profilesById.forEach((_, uid) => recipientIds.add(uid));
    }

    if (recipientIds.size === 0) return 0;

    const createdAt = new Date().toISOString();
    const notifRows = [...recipientIds].map((uid) => {
      const profile = profilesById.get(uid);
      const role = profile?.role || 'student';
      const actionUrl =
        role === 'teacher'
          ? '/teacher/announcements'
          : role === 'admin'
            ? '/admin/announcements'
            : '/student';

      return {
        user_id: uid,
        title: `Announcement: ${String(title || 'New announcement')}`,
        message: String(content || '').slice(0, 240),
        type: priority === 'urgent' ? 'warning' : 'info',
        action_url: actionUrl,
        created_at: createdAt,
      };
    });

    await supabaseAdmin.from('notifications').insert(notifRows);

    // Send email via Brevo if enabled
    if (shouldSendEmail) {
      try {
        if (isEmailConfigured()) {
          const shortContent = String(content || '').slice(0, 800);
          const emailSubject = `📢 ${String(title || 'New Announcement')}`;
          const htmlContent = `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 28px;">
<div style="font-size:22px;margin-bottom:4px;">📢</div>
<h1 style="margin:0;font-size:20px;color:#ffffff;font-weight:700;">${String(title || 'New Announcement')}</h1>
<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">${priority === 'urgent' ? '🚨 Urgent' : priority === 'important' ? '⚠️ Important' : '📌 Notice'}</div>
</td></tr>
<tr><td style="padding:24px 28px;">
<div style="font-size:14px;line-height:1.7;color:#475569;white-space:pre-wrap;">${shortContent}</div>
</td></tr>
<tr><td style="padding:12px 28px 24px;border-top:1px solid #f1f5f9;">
<div style="font-size:11px;color:#94a3b8;">This announcement was sent via QuizMaster. You received it because you are a member of this platform.</div>
</td></tr>
</table></td></tr></table>
</body></html>`;
          const textContent = `${String(title || 'New Announcement')}\n\n${shortContent}`;

          // Send emails in small batches to avoid timeout
          const recipients = [...recipientIds]
            .map(uid => profilesById.get(uid))
            .filter((p): p is { role: string; email: string; name: string } => !!(p?.email));

          const emailPromises = recipients.map(p =>
            sendEmail({ to: p.email, toName: p.name, subject: emailSubject, htmlContent, textContent }).catch(() => null)
          );
          await Promise.allSettled(emailPromises);
        }
      } catch (emailErr) {
        console.warn('[announcements] Email sending skipped:', emailErr);
      }
    }

    return recipientIds.size;
  };

  // ── Student: read published announcements ──────────────────────────────────
  app.get('/api/student/announcements', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      // Fetch all classes the student belongs to
      const { data: classRows } = await supabaseAdmin
        .from('classes')
        .select('id')
        .contains('student_ids', [caller.userId]);
      const myClassIds = (classRows || []).map((c: { id: string }) => c.id);

      // Fetch published announcements visible to students
      let query = supabaseAdmin
        .from('announcements')
        .select('*, author:profiles!author_id(id,display_name,email)')
        .eq('status', 'published')
        .in('target_audience', ['all', 'students'])
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Filter out expired ones
      const now = new Date();
      const visible = (data || []).filter((a: any) => {
        if (a.expires_at && new Date(a.expires_at) < now) return false;
        return true;
      });

      res.json({ success: true, announcements: visible, classIds: myClassIds });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Count unread (for badge) — returns { count }
  app.get('/api/student/announcements/unread-count', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const now = new Date().toISOString();
      const { count, error } = await supabaseAdmin
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .in('target_audience', ['all', 'students'])
        .or(`expires_at.is.null,expires_at.gt.${now}`);

      if (error) throw error;
      res.json({ success: true, count: count ?? 0 });
    } catch (e: any) { res.json({ success: false, count: 0 }); }
  });

  app.get('/api/admin/announcements', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('announcements')
        .select('*, author:profiles!author_id(id,display_name,email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, announcements: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Safely insert/update announcements — retries without new columns if schema cache error
  const annInsert = async (payload: Record<string, any>) => {
    const r = await supabaseAdmin.from('announcements').insert(payload).select().single();
    if (r.error && /schema cache|column/i.test(r.error.message)) {
      const { ann_type, scheduled_at, ...safe } = payload;
      return supabaseAdmin.from('announcements').insert(safe).select().single();
    }
    return r;
  };
  const annUpdate = async (id: string, payload: Record<string, any>) => {
    const r = await supabaseAdmin.from('announcements').update(payload).eq('id', id).select().single();
    if (r.error && /schema cache|column/i.test(r.error.message)) {
      const { ann_type, scheduled_at, ...safe } = payload;
      return supabaseAdmin.from('announcements').update(safe).eq('id', id).select().single();
    }
    return r;
  };

  app.post('/api/admin/announcements', async (req, res) => {
    try {
      const { class_ids, student_ids, send_email, ...body } = req.body || {};
      const payload = {
        ...body,
        published_at: body.status === 'published' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await annInsert(payload);
      if (error) throw error;

      if (body.status === 'published') {
        const classIds: string[] = Array.isArray(class_ids) ? class_ids.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [];
        const studentIds: string[] = Array.isArray(student_ids) ? student_ids.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [];
        await sendAnnouncementNotifications({
          title: String(body.title || ''),
          content: String(body.content || ''),
          priority: String(body.priority || 'normal'),
          audience: String(body.target_audience || 'all'),
          classIds,
          studentIds,
          sendEmail: Boolean(send_email),
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/admin/announcements/:id', async (req, res) => {
    try {
      const { class_ids, student_ids, send_email, ...body } = req.body || {};
      const payload = {
        ...body,
        updated_at: new Date().toISOString(),
        ...(body.status === 'published' ? { published_at: new Date().toISOString() } : {}),
      };
      const { data, error } = await annUpdate(req.params.id, payload);
      if (error) throw error;

      if (body.status === 'published') {
        const classIds: string[] = Array.isArray(class_ids) ? class_ids.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [];
        const studentIds: string[] = Array.isArray(student_ids) ? student_ids.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [];
        await sendAnnouncementNotifications({
          title: String((body.title ?? data?.title) || ''),
          content: String((body.content ?? data?.content) || ''),
          priority: String((body.priority ?? data?.priority) || 'normal'),
          audience: String((body.target_audience ?? data?.target_audience) || 'all'),
          classIds,
          studentIds,
          sendEmail: Boolean(send_email),
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/announcements/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('announcements').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/brevo/status', async (_req, res) => {
    const configured = isEmailConfigured();
    if (!configured) {
      return res.json({ configured: false, connected: false, reason: 'BREVO_API_KEY, BREVO_SENDER_EMAIL or BREVO_SENDER_NAME is missing from environment secrets.' });
    }
    try {
      const apiKey = process.env.BREVO_API_KEY || '';
      const r = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': apiKey, 'accept': 'application/json' },
      });
      const json = await r.json() as any;
      if (!r.ok) {
        return res.json({ configured: true, connected: false, reason: json?.message || `Brevo returned ${r.status}` });
      }
      const senderEmail = process.env.BREVO_SENDER_EMAIL || '';
      const senderName  = process.env.BREVO_SENDER_NAME  || '';
      res.json({ configured: true, connected: true, email: json?.email, plan: json?.plan?.[0]?.title, senderEmail, senderName });
    } catch (e: any) {
      res.json({ configured: true, connected: false, reason: e.message });
    }
  });

  app.post('/api/admin/announcements/:id/resend', async (req, res) => {
    try {
      const { data: ann, error } = await supabaseAdmin
        .from('announcements')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!ann) return res.status(404).json({ error: 'Announcement not found' });
      const count = await sendAnnouncementNotifications({
        title: String(ann.title || ''),
        content: String(ann.content || ''),
        priority: String(ann.priority || 'normal'),
        audience: String(ann.target_audience || 'all'),
        classIds: [],
        studentIds: [],
      });
      res.json({ success: true, count });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Student: get own submission for an assignment
  app.get('/api/student/assignments/:assignmentId/submission', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const { data, error } = await supabaseAdmin
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('student_id', caller.userId)
        .maybeSingle();
      if (error && !/does not exist|schema cache/i.test(error.message)) throw error;
      res.json({ success: true, submission: data || null });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Student: submit (or resubmit) an assignment
  app.post('/api/student/assignments/:assignmentId/submit', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const { content } = req.body;

      const { data: assignment } = await supabaseAdmin
        .from('assignments')
        .select('id, due_date, allow_late_submission, status')
        .eq('id', assignmentId)
        .maybeSingle();

      if (!assignment || assignment.status !== 'published') {
        return res.status(400).json({ error: 'Assignment not available' });
      }

      const isLate = assignment.due_date ? new Date() > new Date(assignment.due_date) : false;
      if (isLate && !assignment.allow_late_submission) {
        return res.status(400).json({ error: 'Deadline has passed and late submissions are not allowed' });
      }

      const { data: existing } = await supabaseAdmin
        .from('assignment_submissions')
        .select('id')
        .eq('assignment_id', assignmentId)
        .eq('student_id', caller.userId)
        .maybeSingle();

      const payload: any = {
        assignment_id: assignmentId,
        student_id: caller.userId,
        content: content || '',
        status: 'submitted',
        is_late: isLate,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let result;
      if (existing?.id) {
        result = await supabaseAdmin.from('assignment_submissions').update(payload).eq('id', existing.id).select().single();
      } else {
        result = await supabaseAdmin.from('assignment_submissions').insert({ ...payload, created_at: new Date().toISOString() }).select().single();
      }
      if (result.error) throw result.error;
      res.json({ success: true, submission: result.data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Teacher: get all submissions for an assignment
  app.get('/api/teacher/assignments/:assignmentId/submissions', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;

      const { data: submissions, error } = await supabaseAdmin
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });

      if (error && !/does not exist|schema cache/i.test(error.message)) throw error;

      const studentIds = [...new Set((submissions || []).map((s: any) => s.student_id))];
      let profileMap: Record<string, any> = {};
      if (studentIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name, email, avatar_url')
          .in('id', studentIds);
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
      }

      const enriched = (submissions || []).map((s: any) => ({
        ...s,
        student: profileMap[s.student_id] || { display_name: 'Unknown', email: '' },
      }));
      res.json({ success: true, submissions: enriched });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Teacher: grade a submission
  app.patch('/api/teacher/assignments/submissions/:subId/grade', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { subId } = req.params;
      const { grade, feedback } = req.body;

      const { data, error } = await supabaseAdmin
        .from('assignment_submissions')
        .update({
          grade: grade !== undefined && grade !== '' ? Number(grade) : null,
          feedback: feedback || null,
          status: 'graded',
          graded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', subId)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, submission: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.use((err: any, req: Request, res: Response, next: any) => {
    if (!err) return next();
    const status = Number(err?.status || err?.statusCode || 500);
    const normalizedStatus = Number.isFinite(status) ? Math.max(400, status) : 500;
    const layer = detectErrorLayer(`${err?.message || ""}\n${err?.stack || ""}`);
    void logSystemError(
      {
        layer,
        message: err?.message || "Unhandled backend error",
        stack: err?.stack,
        file: err?.fileName,
        line: Number.isFinite(Number(err?.lineNumber)) ? Number(err.lineNumber) : undefined,
        url: req.originalUrl,
        userAgent: req.headers["user-agent"] as string | undefined,
        source: "express.error-middleware",
      },
      res,
    );
    if (res.headersSent) return next(err);
    return res.status(normalizedStatus).json({ error: err?.message || "Internal server error" });
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      console.error(`[404] No API route matched: ${req.method} ${req.path}`);
      return res.status(404).json({
        error:
          `No API route matched for ${req.method} ${req.path}. Start the app with npm run dev (tsx server.ts) and open the app at the URL printed in the terminal (same host/port as the API). If you set VITE_API_BASE_URL, it must match that URL (e.g. if the server says port 5002, use http://localhost:5002 — not a stale port). Restart the server after git pull.`,
        method: req.method,
        path: req.path,
      });
    }
    next();
  });

  // UI middleware is only needed when running as a standalone web server.
  if (includeFrontend) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer } = await import("vite");
      const isReplit = !!(process.env.REPL_ID || process.env.REPLIT_DEV_DOMAIN);
      let hmrConfig: any;
      if (isReplit) {
        const replitPort = Number(process.env.PORT) || 5000;
        hmrConfig = {
          ...(options.httpServer ? { server: options.httpServer } : {}),
          protocol: "wss",
          host: process.env.REPLIT_DEV_DOMAIN || undefined,
          clientPort: replitPort,
        };
      } else {
        hmrConfig = options.httpServer ? { server: options.httpServer } : true;
      }
      const vite = await createServer({
        server: {
          middlewareMode: true,
          hmr: hmrConfig,
          allowedHosts: true,
          watch: {
            ignored: [
              "**/.local/**",
              "**/.git/**",
              "**/.cache/**",
              "**/dist/**",
              "**/node_modules/**",
              "**/attached_assets/**",
              "**/tmp/**",
              "**/.replit",
              "**/replit.md",
              // Backend-only and non-source files — Vite cannot hot-replace
              // them so watching them forces a full page reload, which breaks
              // mid-flow states such as the 2FA code-entry screen.
              "**/server.ts",
              "**/server.js",
              "**/*.server.ts",
              "**/*.server.js",
              "**/*.sql",
              "**/migrations/**",
              "**/*.md",
              "**/*.json",
            ],
          },
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  // Student: get own submission for an assignment
  app.get('/api/student/assignments/:assignmentId/submission', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const { data, error } = await supabaseAdmin
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('student_id', caller.userId)
        .maybeSingle();
      if (error && !/does not exist|schema cache/i.test(error.message)) throw error;
      res.json({ success: true, submission: data || null });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Student: submit (or resubmit) an assignment
  app.post('/api/student/assignments/:assignmentId/submit', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const { content, file_urls, link_urls } = req.body;

      const { data: assignment } = await supabaseAdmin
        .from('assignments')
        .select('id, due_date, allow_late_submission, status')
        .eq('id', assignmentId)
        .maybeSingle();

      if (!assignment || assignment.status !== 'published') {
        return res.status(400).json({ error: 'Assignment not available' });
      }

      const isLate = assignment.due_date ? new Date() > new Date(assignment.due_date) : false;
      if (isLate && !assignment.allow_late_submission) {
        return res.status(400).json({ error: 'Deadline has passed and late submissions are not allowed' });
      }

      const existing = await supabaseAdmin
        .from('assignment_submissions')
        .select('id')
        .eq('assignment_id', assignmentId)
        .eq('student_id', caller.userId)
        .maybeSingle();

      const safeFileUrls = Array.isArray(file_urls) ? file_urls : [];
      const safeLinkUrls = Array.isArray(link_urls) ? link_urls : [];

      const basePayload: any = {
        content: content || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        is_late: isLate,
        updated_at: new Date().toISOString(),
      };

      const tryWithRichFields = async (id?: string) => {
        const richPayload = { ...basePayload, file_urls: JSON.stringify(safeFileUrls), link_urls: JSON.stringify(safeLinkUrls) };
        if (id) {
          return supabaseAdmin.from('assignment_submissions').update(richPayload).eq('id', id).select().single();
        }
        return supabaseAdmin.from('assignment_submissions').insert({ assignment_id: assignmentId, student_id: caller.userId, ...richPayload }).select().single();
      };

      const tryWithBaseFields = async (id?: string) => {
        if (id) {
          return supabaseAdmin.from('assignment_submissions').update(basePayload).eq('id', id).select().single();
        }
        return supabaseAdmin.from('assignment_submissions').insert({ assignment_id: assignmentId, student_id: caller.userId, ...basePayload }).select().single();
      };

      let result = await tryWithRichFields(existing.data?.id);
      if (result.error && /column|schema cache/i.test(result.error.message)) {
        result = await tryWithBaseFields(existing.data?.id);
      }
      if (result.error) throw result.error;
      res.json({ success: true, submission: result.data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/student/assignments/:assignmentId/save-draft', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const { draft_content, draft_file_urls, draft_link_urls } = req.body;

      const existing = await supabaseAdmin
        .from('assignment_submissions')
        .select('id')
        .eq('assignment_id', assignmentId)
        .eq('student_id', caller.userId)
        .maybeSingle();

      const draftPayload: any = {
        draft_content: draft_content || null,
        draft_file_urls: JSON.stringify(Array.isArray(draft_file_urls) ? draft_file_urls : []),
        draft_link_urls: JSON.stringify(Array.isArray(draft_link_urls) ? draft_link_urls : []),
        draft_saved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let result: any;
      if (existing.data?.id) {
        result = await supabaseAdmin.from('assignment_submissions').update(draftPayload).eq('id', existing.data.id).select().single();
      } else {
        result = await supabaseAdmin.from('assignment_submissions').insert({
          assignment_id: assignmentId,
          student_id: caller.userId,
          status: 'submitted',
          is_late: false,
          ...draftPayload,
        }).select().single();
      }
      if (result.error && /column|schema cache/i.test(result.error.message)) {
        return res.json({ success: true, saved: false, reason: 'draft columns not yet migrated' });
      }
      if (result.error) throw result.error;
      res.json({ success: true, saved: true, submission: result.data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Teacher: list submissions for an assignment
  app.get('/api/teacher/assignments/:assignmentId/submissions', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;

      const { data: submissions, error } = await supabaseAdmin
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });

      if (error && !/does not exist|schema cache/i.test(error.message)) throw error;

      const studentIds = [...new Set((submissions || []).map((s: any) => s.student_id))];
      let profileMap: Record<string, any> = {};
      if (studentIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name, email, avatar_url')
          .in('id', studentIds);
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
      }

      const enriched = (submissions || []).map((s: any) => ({
        ...s,
        student: profileMap[s.student_id] || { display_name: 'Unknown', email: '' },
      }));
      res.json({ success: true, submissions: enriched });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Teacher: grade a submission
  app.patch('/api/teacher/assignments/submissions/:subId/grade', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { subId } = req.params;
      const { grade, feedback } = req.body;

      const { data, error } = await supabaseAdmin
        .from('assignment_submissions')
        .update({
          grade: grade !== undefined && grade !== '' ? Number(grade) : null,
          feedback: feedback || null,
          status: 'graded',
          graded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', subId)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, submission: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return app;
}

// ── AUTO-MIGRATION: discussion tables ────────────────────────────────────────
const DISCUSSION_MIGRATION_SQL = `
create extension if not exists pgcrypto;

create table if not exists public.lesson_discussion_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  author_id uuid not null,
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  best_answer_id uuid null,
  answers_count integer not null default 0,
  reactions_count integer not null default 0,
  helpful_score integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.lesson_discussion_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.lesson_discussion_questions(id) on delete cascade,
  author_id uuid not null,
  body text not null,
  is_best boolean not null default false,
  replies_count integer not null default 0,
  reactions_count integer not null default 0,
  helpful_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.lesson_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.lesson_discussion_answers(id) on delete cascade,
  author_id uuid not null,
  parent_reply_id uuid null references public.lesson_discussion_replies(id) on delete cascade,
  body text not null,
  depth smallint not null default 0,
  reactions_count integer not null default 0,
  helpful_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.lesson_discussion_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  reaction_type text not null,
  created_at timestamptz not null default now(),
  unique(user_id, target_type, target_id, reaction_type)
);

create table if not exists public.lesson_discussion_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text null,
  status text not null default 'open',
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discussion_user_stats (
  user_id uuid primary key,
  reputation integer not null default 0,
  answers_count integer not null default 0,
  best_answers_count integer not null default 0,
  helpful_reactions_received integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discussion_badges (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text not null,
  threshold integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.discussion_user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  badge_id uuid not null references public.discussion_badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index if not exists idx_ldq_lesson_recent on public.lesson_discussion_questions (lesson_id, created_at desc);
create index if not exists idx_ldq_lesson_activity on public.lesson_discussion_questions (lesson_id, last_activity_at desc);
create index if not exists idx_lda_question on public.lesson_discussion_answers (question_id, created_at asc);
create index if not exists idx_ldr_answer on public.lesson_discussion_replies (answer_id, created_at asc);

insert into public.discussion_badges (key, label, description, threshold)
values
  ('first_answer', 'First Answer', 'Posted your first answer', 1),
  ('helpful_contributor', 'Helpful Contributor', 'Received helpful reactions', 10),
  ('mentor', 'Mentor', 'Got multiple best answers', 5)
on conflict (key) do nothing;

alter table public.lesson_discussion_questions
  add column if not exists best_answer_id uuid null;

`;

const DISCUSSION_RLS_SQL = `
alter table public.lesson_discussion_questions enable row level security;
alter table public.lesson_discussion_answers enable row level security;
alter table public.lesson_discussion_replies enable row level security;
alter table public.lesson_discussion_reactions enable row level security;
alter table public.lesson_discussion_reports enable row level security;
alter table public.discussion_user_stats enable row level security;
alter table public.discussion_badges enable row level security;
alter table public.discussion_user_badges enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'lesson_discussion_questions' and policyname = 'ldq_auth_all') then
    create policy ldq_auth_all on public.lesson_discussion_questions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lesson_discussion_answers' and policyname = 'lda_auth_all') then
    create policy lda_auth_all on public.lesson_discussion_answers for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lesson_discussion_replies' and policyname = 'ldr_auth_all') then
    create policy ldr_auth_all on public.lesson_discussion_replies for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lesson_discussion_reactions' and policyname = 'ldreact_auth_all') then
    create policy ldreact_auth_all on public.lesson_discussion_reactions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lesson_discussion_reports' and policyname = 'ldrep_auth_all') then
    create policy ldrep_auth_all on public.lesson_discussion_reports for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'discussion_user_stats' and policyname = 'dus_auth_all') then
    create policy dus_auth_all on public.discussion_user_stats for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'discussion_badges' and policyname = 'db_auth_read') then
    create policy db_auth_read on public.discussion_badges for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'discussion_user_badges' and policyname = 'dub_auth_all') then
    create policy dub_auth_all on public.discussion_user_badges for all using (true) with check (true);
  end if;
end $$;
`;

let _discussionTablesReady = false;

async function runDiscussionMigration(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('[migration] DATABASE_URL not set — skipping discussion table auto-setup');
    return false;
  }
  try {
    // Check if table already exists
    const check = await poolQuery(
      `SELECT to_regclass('public.lesson_discussion_questions') AS tbl`
    );
    if (!check.rows[0]?.tbl) {
      console.log('[migration] creating discussion tables…');
      await poolQuery(DISCUSSION_MIGRATION_SQL);
      console.log('[migration] discussion tables created ✓');
    } else {
      console.log('[migration] discussion tables already exist — ensuring RLS policies…');
    }
    // Always apply RLS + policies (idempotent) and reload schema
    await poolQuery(DISCUSSION_RLS_SQL).catch((e: any) => {
      console.warn('[migration] RLS policy setup warning:', e?.message);
    });
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    _discussionTablesReady = true;
    console.log('[migration] discussion setup complete ✓');
    return true;
  } catch (err: any) {
    console.error('[migration] discussion table setup failed:', err?.message || err);
    return false;
  }
}

async function runAnnouncementColumnsMigration(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;
  // Try with explicit search_path first, then without schema prefix
  const attempts = [
    `SET search_path TO public; ALTER TABLE announcements ADD COLUMN IF NOT EXISTS ann_type text NOT NULL DEFAULT 'general'; ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NULL;`,
    `ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS ann_type text NOT NULL DEFAULT 'general'; ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NULL;`,
  ];
  for (const sql of attempts) {
    try {
      await poolQuery(sql);
      await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
      console.log('[migration] announcements columns (ann_type, scheduled_at) ensured ✓');
      return;
    } catch (err: any) {
      console.warn('[migration] announcements column attempt failed:', err?.message?.split('\n')[0]);
    }
  }
  // Final fallback: use supabaseAdmin to trigger a schema reload via a no-op query
  // The annInsert/annUpdate helpers already handle the missing columns gracefully.
  console.log('[migration] announcements columns: will use graceful fallback in API handlers');
}

// ─── Assignment Submissions Migration ────────────────────────────────────────
async function runAssignmentSubmissionsMigration() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return;
  try {
    await poolQuery(`
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id uuid NOT NULL,
        student_id uuid NOT NULL,
        content text,
        status text NOT NULL DEFAULT 'submitted',
        grade numeric,
        feedback text,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        graded_at timestamptz,
        is_late boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('[migration] assignment_submissions table ensured ✓');
  } catch (err: any) {
    console.warn('[migration] assignment_submissions table:', err?.message?.split('\n')[0]);
  }
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS instructions text`);
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS allow_late_submission boolean DEFAULT false`);
    console.log('[migration] assignments extra columns ensured ✓');
  } catch (err: any) {
    console.warn('[migration] assignments extra columns:', err?.message?.split('\n')[0]);
  }
  // New submission method columns
  try {
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS file_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS link_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_content text`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_file_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_link_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_saved_at timestamptz`);
    console.log('[migration] assignment_submissions rich columns ensured ✓');
  } catch (err: any) {
    console.warn('[migration] assignment_submissions rich columns:', err?.message?.split('\n')[0]);
  }
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS submission_config jsonb`);
    console.log('[migration] assignments submission_config ensured ✓');
  } catch (err: any) {
    console.warn('[migration] assignments submission_config:', err?.message?.split('\n')[0]);
  }
}

async function ensureAssignmentFilesBucket(): Promise<void> {
  try {
    const { error } = await supabaseAdmin.storage.createBucket('assignment-files', {
      public: true,
      fileSizeLimit: 52428800,
    });
    if (error && !error.message.toLowerCase().includes('already exists')) {
      console.warn('[storage] assignment-files bucket setup:', error.message);
    } else {
      console.log('[storage] assignment-files bucket ready ✓');
    }
  } catch (e: any) {
    console.warn('[storage] assignment-files bucket failed:', e?.message);
  }
}

async function startServer() {
  const parsedPort = Number(process.env.PORT);
  const preferredPort = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5000;
  const preferredHost = process.env.HOST || "0.0.0.0";
  const hostCandidates = preferredHost === "0.0.0.0" ? [preferredHost] : [preferredHost, "0.0.0.0"];
  const maxPortAttempts = 10;
  const recoverableListenErrors = new Set(["EACCES", "EADDRINUSE"]);
  // Auto-create discussion tables and announcement columns if DATABASE_URL is available
  void runDiscussionMigration();
  void runAnnouncementColumnsMigration();
  void runAssignmentSubmissionsMigration();
  void ensureAssignmentFilesBucket();

  const httpServer = http.createServer();
  const app = await createApp({ includeFrontend: true, httpServer });
  httpServer.on("request", app);

  const tryListen = (port: number, host: string) =>
    new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        const displayHost = host === "0.0.0.0" ? "localhost" : host;
        console.log(`Server running on http://${displayHost}:${port}`);
        resolve();
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(port, host);
    });

  let lastRecoverableError: NodeJS.ErrnoException | null = null;

  for (let portOffset = 0; portOffset < maxPortAttempts; portOffset++) {
    const portToTry = preferredPort + portOffset;

    for (const hostToTry of hostCandidates) {
      try {
        await tryListen(portToTry, hostToTry);
        return;
      } catch (error) {
        const listenError = error as NodeJS.ErrnoException;
        if (!listenError.code || !recoverableListenErrors.has(listenError.code)) {
          throw listenError;
        }

        lastRecoverableError = listenError;
        const triedFinalCandidate =
          portOffset === maxPortAttempts - 1 &&
          hostToTry === hostCandidates[hostCandidates.length - 1];

        if (!triedFinalCandidate) {
          console.warn(
            `Could not bind to ${hostToTry}:${portToTry} (${listenError.code}). Trying another address...`,
          );
        }
      }
    }
  }

  throw new Error(
    `Unable to start server after trying ports ${preferredPort}-${preferredPort + maxPortAttempts - 1}. Last error: ${lastRecoverableError?.code ?? "unknown"}`,
  );
}

if (!process.env.VERCEL) {
  setInterval(() => {
    void flushFailedTelegramAlerts();
  }, TELEGRAM_RETRY_INTERVAL_MS);
  void flushFailedTelegramAlerts();

  process.on("unhandledRejection", (reason) => {
    const details = serializeUnknownError(reason);
    console.error("[runtime] unhandledRejection:", details);
    void logSystemError({
      layer: detectErrorLayer(details, "BACKEND"),
      message: "Unhandled Promise Rejection",
      stack: details,
      source: "process.unhandledRejection",
    });
  });

  process.on("uncaughtException", (error) => {
    const details = serializeUnknownError(error);
    console.error("[runtime] uncaughtException:", details);
    void logSystemError({
      layer: detectErrorLayer(details, "BACKEND"),
      message: "Uncaught Exception",
      stack: details,
      source: "process.uncaughtException",
    });
  });
}

if (!process.env.VERCEL) {
  startServer();
}
