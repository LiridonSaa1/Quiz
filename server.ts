import "dotenv/config";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import AdmZip from "adm-zip";
import jwt from "jsonwebtoken";
import { isMissingCoursesStudentIdsError } from "./src/lib/schemaErrors.js";
import { canAccessTeacherCourses, isAdmin, isAdminSeedAllowed } from "./src/lib/routeAuth.js";
import { generateFixSuggestion } from "./src/lib/ai/generateFixSuggestion.js";
import { isEmailConfigured, sendEmail, renderVerificationEmail, renderCredentialEmail } from "./src/lib/email.js";
import { notifyEvent, type NotifyContext, type NotifyEventKey } from "./src/lib/notifyEvents.js";
import { HEADWAY_FULL_DATA, buildUnitQuestions as buildHwUnitQuestions, type HUnit } from "./src/lib/headwayData.js";
import { getQuestionsForSection, getTopicsForLevel, HEADWAY_QUESTIONS } from "./src/lib/headwayQuestions.js";
import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { appendFile, mkdir, readFile as readFileFs, writeFile } from "fs/promises";
import http from "http";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
import { createRequire as _cr } from "module";
const _require = _cr(import.meta.url);
let _ws: any;
try { _ws = _require("ws"); } catch { _ws = undefined; }
const require = createRequire(import.meta.url);
let poolPromise: Promise<any> | null = null;
/**
 * Returns true when a Supabase/PostgREST error indicates a specific column
 * is missing from the schema cache (PGRST204) or the DB (42703).
 * Used to detect stale PostgREST schema cache and retry without that column.
 */
function isMissingColumnError(err: any, column: string): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  const msg  = String(err.message ?? '').toLowerCase();
  const col  = column.toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    (msg.includes('could not find') && msg.includes(col)) ||
    (msg.includes('schema cache') && msg.includes(col))
  );
}

const stripProfilesJoin = (sql: string): string =>
  sql.replace(
    /LEFT JOIN profiles (\w+) ON \1\.id = \w+\.\w+/gi,
    (_match, alias) =>
      `LEFT JOIN (SELECT NULL::uuid AS id, NULL::text AS display_name, NULL::text AS email) ${alias} ON false`,
  );

/** Deterministic seeded shuffle (Fisher-Yates with xorshift32 PRNG). */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  // Hash the seed string into a 32-bit integer
  let h = 0x12345678;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x9e3779b9);
    h ^= h >>> 16;
  }
  // xorshift32 PRNG
  const next = () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 0xffffffff;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Google Drive Import — module-level job store + helpers ────────────────
interface DriveImportJob {
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  skipped: number;
  errors: string[];
  logs: string[];
}
const driveImportJobs = new Map<string, DriveImportJob>();

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/** Per-level Drive folder IDs.  Keys must match the `level` strings used in headway_media. */
const LEVEL_DRIVE_FOLDERS: Record<string, Record<string, string>> = {
  'Beginner': {
    student_audio: '12Mmg0fjHxRhglHgKag9bP5QGGo7sNkx-',
    workbook_audio: '1jX0bv2qQDRyhedO7qfvu5yjb97qDazQu',
    video: '15HmRs-8kRI4C1Uzp5iwz-TE4c02lEuCc',
  },
  'Elementary': {
    student_audio: '1bJpdL3tkWRlIQKS2lp9ZvKBm-SHrahUE',
    workbook_audio: '1bwL0ANh1IR-YXzc9y53r9wRXEUAw7dkj',
    video: '1DO4J5r-7HnytBb4UArIPnPjZTX60GPZm',
  },
  'Pre-Intermediate': {
    student_audio: '1-MS0Eu2-uXELtasjK23r5wpIxSYw13WZ',
    workbook_audio: '1pmBAkEVHE8E0NlZoaZf7VZKrhCUAK5yL',
    video: '1tl7tpMoajGSOX1y6G1Y3-OvvZtnFgnCH',
  },
};

/** Backward-compat alias (Beginner is the default) */
const BEGINNER_DRIVE_FOLDERS = LEVEL_DRIVE_FOLDERS['Beginner'];

function detectUnitNumber(filename: string): number | null {
  const patterns = [
    /unit[\s_\-.]*0?(\d{1,2})/i,
    /\bu0?(\d{1,2})\b/i,
    /_0?(\d{1,2})[_\s]/,
    /^0?(\d{1,2})[_\s\-.]/,
  ];
  for (const pat of patterns) {
    const m = filename.match(pat);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 20) return n;
    }
  }
  return null;
}

async function listDriveFolder(folderId: string, apiKey: string): Promise<any[]> {
  const files: any[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,size,mimeType,modifiedTime)');
    let url = `${DRIVE_API_BASE}/files?q=${q}&key=${apiKey}&fields=${fields}&pageSize=200`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Drive API ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const data = await resp.json() as any;
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return files;
}

async function downloadDriveFileBuffer(fileId: string, apiKey: string): Promise<Buffer> {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&key=${apiKey}`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Drive download ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const arrBuf = await resp.arrayBuffer();
  return Buffer.from(arrBuf);
}

const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);
const MEDIA_EXTS = new Set([...AUDIO_EXTS, ...VIDEO_EXTS]);

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  };
  return map[ext] || 'application/octet-stream';
}

async function processZipEntries(
  zipBuffer: Buffer,
  zipName: string,
  zipDriveId: string,
  type: string,
  level: string,
  job: DriveImportJob,
  courseId?: string
): Promise<void> {
  const unitNum = detectUnitNumber(zipName);
  let zip: InstanceType<typeof AdmZip>;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (e: any) {
    throw new Error(`Invalid ZIP "${zipName}": ${e?.message}`);
  }

  const entries = zip.getEntries().filter(e => {
    if (e.isDirectory) return false;
    const baseName = e.entryName.split('/').pop() || '';
    if (baseName.startsWith('__MACOSX') || baseName.startsWith('.')) return false;
    const ext = baseName.split('.').pop()?.toLowerCase() || '';
    return MEDIA_EXTS.has(ext);
  });

  if (entries.length === 0) {
    job.logs.push(`   ↳ No audio/video files inside "${zipName}"`);
    return;
  }

  job.total += entries.length;
  job.logs.push(`   ↳ ${entries.length} media files inside "${zipName}"`);

  for (const entry of entries) {
    const baseName = (entry.entryName.split('/').pop() || entry.entryName).replace(/\s+/g, '_');
    const ext = baseName.split('.').pop()?.toLowerCase() || '';
    const compositeId = `${zipDriveId}::${entry.entryName}`;

    try {
      const { data: existing } = await supabaseAdmin
        .from('headway_media').select('id').eq('drive_file_id', compositeId).maybeSingle();
      if (existing) {
        job.skipped++;
        job.logs.push(`↷ Skip (exists): ${baseName}`);
        continue;
      }

      const fileData = entry.getData();
      const storagePath = `headway/${level}/${type}/unit${unitNum ?? 0}/${baseName}`;
      const mime = mimeForExt(ext);

      const { error: uploadErr } = await supabaseAdmin.storage
        .from('headway-media')
        .upload(storagePath, fileData, { contentType: mime, upsert: true });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { data: { publicUrl } } = supabaseAdmin.storage.from('headway-media').getPublicUrl(storagePath);
      const title = baseName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim();

      const insertPayload: Record<string, unknown> = {
        level, unit_number: unitNum, type, title,
        file_name: baseName, drive_file_id: compositeId,
        url: publicUrl, mime_type: mime, size_bytes: fileData.length,
      };
      if (courseId) insertPayload.course_id = courseId;

      let insResult = await supabaseAdmin.from('headway_media').insert(insertPayload);
      if (insertPayload.course_id && isMissingColumnError(insResult.error, 'course_id')) {
        // course_id column not yet visible in PostgREST schema cache — retry without it
        const { course_id: _dropped, ...payloadWithoutCourse } = insertPayload;
        insResult = await supabaseAdmin.from('headway_media').insert(payloadWithoutCourse);
      }
      if (insResult.error) {
        if (insResult.error.code === '42P01') throw new Error('headway_media table not found — run migration 014');
        throw new Error(insResult.error.message);
      }

      job.done++;
      job.logs.push(`✓ ${baseName}${unitNum ? ` → Unit ${unitNum}` : ''}`);
    } catch (err: any) {
      job.errors.push(`${baseName}: ${err?.message}`);
      job.logs.push(`✗ ${baseName}: ${err?.message}`);
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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

type ApiCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const apiResponseCache = new Map<string, ApiCacheEntry<unknown>>();
const API_CACHE_MAX_ENTRIES = 500;
const PERF_SLOW_THRESHOLD_MS = 300;

function getCachedApiResponse<T>(key: string): T | null {
  const cached = apiResponseCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    apiResponseCache.delete(key);
    return null;
  }
  return cached.value as T;
}

function setCachedApiResponse<T>(key: string, value: T, ttlMs: number): void {
  apiResponseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (apiResponseCache.size > API_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [cacheKey, entry] of apiResponseCache) {
      if (entry.expiresAt <= now) apiResponseCache.delete(cacheKey);
      if (apiResponseCache.size <= API_CACHE_MAX_ENTRIES - 100) break;
    }
  }
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
      },
      ...(_ws ? { realtime: { transport: _ws } } : {}),
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

  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // Trust all Replit reverse-proxy hops so express-rate-limit reads the real
  // client IP from X-Forwarded-For. Replit uses multiple proxy layers so
  // `trust proxy: 1` can expose the proxy IP rather than the real user IP,
  // causing all users to share one rate-limit bucket and trigger 429s.
  // Replit routes through multiple proxy hops. Using a number (e.g. 1) can
  // expose the proxy IP instead of the real client IP, collapsing all users
  // into one rate-limit bucket. We keep trust proxy at 1 to satisfy
  // express-rate-limit's validation while also disabling its trustProxy check
  // (the validate flag) and providing a custom keyGenerator that reads the
  // real IP from X-Forwarded-For safely.
  app.set('trust proxy', 1);

  // ── Rate Limiting ────────────────────────────────────────────────────────────
  const resolveClientIp = (req: Request): string => {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const first = (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
      if (first) return first;
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  };

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // 1000 req/15min — generous enough for normal dashboard polling.
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    // req.originalUrl keeps the full path regardless of mount point.
    skip: (req) => req.originalUrl === '/api/health' || req.path === '/health',
    keyGenerator: resolveClientIp,
    validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please try again in 15 minutes.' },
  });
  // Realtime routes are polled frequently (every 3s per student) so they get their own
  // generous limiter — 2000 req / 15 min per IP — well above the normal 200 cap.
  const realtimeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many realtime requests, please slow down.' },
  });
  app.use('/api/student/realtime-quiz/', realtimeLimiter);
  app.use('/api/teacher/realtime-quiz/', realtimeLimiter);
  app.use('/api/realtime-quiz/', realtimeLimiter);
  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);

  // ── Admin Auth Middleware ─────────────────────────────────────────────────────
  // Protects ALL /api/admin/* routes. Exceptions:
  //   - /api/admin/seed      — first-run unauthenticated access when DB is empty
  //   - /api/admin/create-student — teachers are allowed; the route handler does its own role check
  app.use('/api/admin', async (req: Request, res: Response, next) => {
    if (req.path === '/seed' && req.method === 'GET') return next();
    // Teachers may create students; skip the admin-only gate and let the route handler decide.
    if (req.path === '/create-student' && req.method === 'POST') return next();
    const caller = await assertAuthenticated(req, res);
    if (!caller) return;
    if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
    next();
  });

  // PWA: serve sw.js with no-cache so browsers always check for updates
  app.get("/sw.js", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Content-Type", "application/javascript");
    next();
  });

  // PWA: serve manifest.json dynamically (reads school name, colors, logoText from DB)
  app.get("/manifest.json", async (_req, res) => {
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
      const primaryColor = (typeof b?.colors?.primary === "string" && b.colors.primary) || "#4f46e5";
      const bgColor = (typeof b?.colors?.sidebar_bg === "string" && b.colors.sidebar_bg) || "#0f172a";
      res.setHeader("Content-Type", "application/manifest+json");
      res.setHeader("Cache-Control", "no-store");
      res.json({
        name: schoolName,
        short_name: schoolName.length > 14 ? schoolName.slice(0, 14) : schoolName,
        description: `${schoolName} — Education Platform`,
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: bgColor,
        theme_color: primaryColor,
        lang: "en",
        categories: ["education", "productivity"],
        icons: [
          { src: "/bs-icon.jpg", sizes: "512x512", type: "image/jpeg", purpose: "any" },
          { src: "/bs-icon.jpg", sizes: "192x192", type: "image/jpeg", purpose: "any" },
          { src: "/api/pwa/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Dashboard", short_name: "Dashboard", url: "/", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
        ],
      });
    } catch {
      // Fallback: serve static manifest
      const staticPath = path.join(process.cwd(), "public", "manifest.json");
      res.setHeader("Content-Type", "application/manifest+json");
      res.sendFile(staticPath);
    }
  });

  // PWA: dynamic SVG app icon — shows logoText on brand-color background
  app.get("/api/pwa/icon.svg", async (_req, res) => {
    try {
      const branding = await getConfigSection("branding").catch(() => null);
      const b: any = branding || {};
      const raw = typeof b.logoText === "string" ? b.logoText.trim().toUpperCase() : "";
      const logoText = raw.slice(0, 3) || "QM";
      const primaryColor = (typeof b?.colors?.primary === "string" && b.colors.primary) || "#4f46e5";
      const fontSize = logoText.length > 2 ? 180 : 210;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${primaryColor}"/><text x="256" y="338" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle" fill="white" letter-spacing="-6">${logoText}</text></svg>`;
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-store");
      res.send(svg);
    } catch {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#4f46e5"/><text x="256" y="338" font-family="system-ui,sans-serif" font-size="210" font-weight="800" text-anchor="middle" fill="white">QM</text></svg>`;
      res.setHeader("Content-Type", "image/svg+xml");
      res.send(svg);
    }
  });

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
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
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
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  app.get("/api/telegram/diagnostics", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
    } catch { return res.status(401).json({ error: 'Unauthorized' }); }
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

      const apiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();

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

      const fullPrompt = `${historyText ? `Conversation so far:\n${historyText}\n\n` : ""}User: ${message}`;

      let reply = "";

      if (apiKey) {
        const { GoogleGenAI } = await import("@google/genai");
        const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
        const ai = geminiBaseUrl
          ? new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } })
          : new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `${systemPrompt}\n\n${fullPrompt}\nAssistant:`,
        });
        reply = (result.text || "").trim();
      } else {
        // Free fallback: Pollinations AI (no API key required)
        const pollinationsRes = await fetch("https://text.pollinations.ai/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              ...history.slice(-8).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
              { role: "user", content: message },
            ],
            model: "openai",
          }),
        });
        if (!pollinationsRes.ok) throw new Error(`Pollinations AI error: ${pollinationsRes.status}`);
        reply = (await pollinationsRes.text()).trim();
      }

      reply = reply || "I'm sorry, I couldn't generate a response. Please try again.";
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
      const durationMs = Date.now() - startedAt;
      if (!res.headersSent) res.setHeader("X-Response-Time", `${durationMs}ms`);

      // Log slow API requests (>300ms) so bottlenecks are visible in console
      if (req.path.startsWith("/api") && durationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(
          `[perf] ⚠️  SLOW REQUEST  ${req.method} ${req.path} → ${res.statusCode}  ${durationMs}ms`,
        );
      }

      if (res.statusCode < 500 || !req.path.startsWith("/api")) return;
      if ((res.locals as any).errorAlertEmitted) {
        console.log(
          "[alerts] skip middleware API 5xx Telegram (route already called logSystemError)",
          req.method,
          req.path,
        );
        return;
      }
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

  // ── Auth token in-memory cache (30s TTL) ────────────────────────────────
  // Every authenticated API call previously made 2 Supabase round-trips:
  // (1) auth.getUser(token) and (2) profiles.select("role").
  // Caching by token hash saves ~100-300ms per request for active users.
  const AUTH_CACHE_TTL_MS = 30_000;
  const authUserCache = new Map<string, { userId: string; role: string; displayName?: string; expiresAt: number }>();

  const getAuthUser = async (req: Request): Promise<{ userId: string; role: string; displayName?: string } | null> => {
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return null;

    // Use a hash of the token as the cache key (tokens can be large)
    const cacheKey = stableHash(token);
    const cached = authUserCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { userId: cached.userId, role: cached.role, displayName: cached.displayName };
    }

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
      .select("role, display_name")
      .eq("id", user.id)
      .maybeSingle();
    const result = { userId: user.id, role: normalizeRole(profile?.role), displayName: profile?.display_name ?? undefined };
    authUserCache.set(cacheKey, { ...result, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    // Evict old entries to avoid unbounded growth
    if (authUserCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of authUserCache) {
        if (v.expiresAt < now) authUserCache.delete(k);
        if (authUserCache.size <= 400) break;
      }
    }
    return result;
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

  // Resilient notification insert — retries without columns the live DB doesn't have
  // (older Supabase instances may be missing `title` and/or `read`).
  let _notifColsKnown = false;
  let _notifHasTitle = true;
  let _notifHasRead  = true;
  const notifInsert = async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
    const arr = Array.isArray(rows) ? rows : [rows];
    const strip = (r: Record<string, unknown>) => {
      const out = { ...r };
      if (!_notifHasTitle) delete out.title;
      if (!_notifHasRead)  delete out.read;
      return out;
    };
    const attempt = async () => supabaseAdmin.from('notifications').insert(arr.map(strip));
    let { error } = await attempt();
    if (!error) { _notifColsKnown = true; return; }
    const hay = `${error.message || ''} ${(error as any).details || ''}`.toLowerCase();
    const missingTitle = hay.includes("'title'") || hay.includes('"title"');
    const missingRead  = hay.includes("'read'")  || hay.includes('"read"');
    if ((missingTitle || missingRead) && !_notifColsKnown) {
      if (missingTitle) _notifHasTitle = false;
      if (missingRead)  _notifHasRead  = false;
      _notifColsKnown = false;
      const retry = await attempt();
      if (retry.error) console.warn('[notify] insert failed (retry):', retry.error.message);
    } else {
      console.warn('[notify] insert failed:', error.message);
    }
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

  const ATTEMPTS_CACHE_TTL_MS = 15_000;
  let attemptsCache: { rows: any[]; expiresAt: number } = { rows: [], expiresAt: 0 };
  let attemptsInFlight: Promise<any[]> | null = null;

  const fetchAllAttemptRows = async () => {
    const now = Date.now();
    if (now < attemptsCache.expiresAt) return attemptsCache.rows;
    if (attemptsInFlight) return attemptsInFlight;

    attemptsInFlight = (async () => {
      const startedAt = Date.now();
      const modernStartedAt = Date.now();
      const modern = await supabaseAdmin.from("quiz_attempts").select("*");
      const modernDurationMs = Date.now() - modernStartedAt;
      if (modernDurationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(`[perf] slow query quiz_attempts.select(*) ${modernDurationMs}ms`);
      }
      if (!modern.error) {
        const rows = modern.data || [];
        attemptsCache = { rows, expiresAt: Date.now() + ATTEMPTS_CACHE_TTL_MS };
        const durationMs = Date.now() - startedAt;
        if (durationMs > PERF_SLOW_THRESHOLD_MS) {
          console.warn(`[perf] fetchAllAttemptRows resolved in ${durationMs}ms (source=quiz_attempts, rows=${rows.length})`);
        }
        return rows;
      }
      if (!isAttemptsTableMissing(modern.error) && !isAnyTableMissingError(modern.error)) throw modern.error;

      const legacyStartedAt = Date.now();
      const legacy = await supabaseAdmin.from("attempts").select("*");
      const legacyDurationMs = Date.now() - legacyStartedAt;
      if (legacyDurationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(`[perf] slow query attempts.select(*) ${legacyDurationMs}ms`);
      }
      if (!legacy.error) {
        const rows = legacy.data || [];
        attemptsCache = { rows, expiresAt: Date.now() + ATTEMPTS_CACHE_TTL_MS };
        const durationMs = Date.now() - startedAt;
        if (durationMs > PERF_SLOW_THRESHOLD_MS) {
          console.warn(`[perf] fetchAllAttemptRows resolved in ${durationMs}ms (source=attempts, rows=${rows.length})`);
        }
        return rows;
      }
      // Both quiz_attempts and attempts tables are absent — return empty gracefully
      if (isAnyTableMissingError(legacy.error)) return [];
      throw legacy.error;
    })();

    try {
      return await attemptsInFlight;
    } finally {
      attemptsInFlight = null;
    }
  };

  /**
   * Filtered attempt fetch — queries only rows matching the given quiz IDs and/or student IDs.
   * Falls back gracefully if the table is missing or filters exceed Supabase's IN-list limit.
   * Uses the all-attempts cache when no filters are provided.
   */
  const fetchFilteredAttemptRows = async (opts: {
    quizIds?: Set<string> | string[];
    studentIds?: Set<string> | string[];
  } = {}): Promise<any[]> => {
    const quizArr = opts.quizIds ? [...opts.quizIds].filter(Boolean) : [];
    const studentArr = opts.studentIds ? [...opts.studentIds].filter(Boolean) : [];

    // Fall back to global cache when no useful filters are given
    if (quizArr.length === 0 && studentArr.length === 0) {
      return fetchAllAttemptRows();
    }

    const startedAt = Date.now();

    const buildQuery = (table: string) => {
      let q = supabaseAdmin.from(table).select(
        "id,quiz_id,student_id,score,score_percent,total_points,correct_answers,total_questions,status,passed,started_at,completed_at,answers"
      );
      if (quizArr.length > 0) q = q.in("quiz_id", quizArr);
      if (studentArr.length > 0) q = q.in("student_id", studentArr);
      return q;
    };

    const modern = await buildQuery("quiz_attempts");
    const durationMs = Date.now() - startedAt;
    if (durationMs > PERF_SLOW_THRESHOLD_MS) {
      console.warn(`[perf] slow fetchFilteredAttemptRows quiz_attempts ${durationMs}ms quizIds=${quizArr.length} studentIds=${studentArr.length}`);
    }
    if (!modern.error) return modern.data || [];
    if (!isAttemptsTableMissing(modern.error) && !isAnyTableMissingError(modern.error)) throw modern.error;

    const legacy = await buildQuery("attempts");
    if (!legacy.error) return legacy.data || [];
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

  /**
   * Fetch course rows for a teacher, gracefully handling missing columns
   * (courses.teacher_id or courses.student_ids may not exist in older schemas).
   * Falls back from most-specific to least-specific query until one succeeds.
   */
  const fetchTeacherCourseRows = async (
    scopedIds: string[],
    includeStudentIds = false,
  ): Promise<any[]> => {
    const buildQ = (filterByTeacher: boolean, withStudentIds: boolean) => {
      const sel = withStudentIds ? 'id,title,student_ids' : 'id,title';
      let q = supabaseAdmin.from('courses').select(sel as any);
      if (filterByTeacher && scopedIds.length > 0) q = q.in('teacher_id' as any, scopedIds);
      return q;
    };

    const attempts = [
      buildQ(true,  includeStudentIds),
      buildQ(true,  false),
      buildQ(false, includeStudentIds),
      buildQ(false, false),
    ];

    for (const q of attempts) {
      const { data, error } = await q;
      if (!error) return data || [];
      if (!isRecoverableSchemaColumnError(error)) throw error;
    }
    return [];
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
    // Generated/computed column: "column 'published' can only be updated to DEFAULT"
    if (/published/i.test(hay) && /can only be updated to default/i.test(low)) {
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
      // Generic: if the error mentions a specific column name, strip it and retry
      const errMsg = String((err as any)?.message || (err as any)?.details || "");
      const colMatch = errMsg.match(/column[^''"]*[''"]([\w]+)[''"]|[''"]([\w]+)[''"][^''"]* column|Could not find[^''"]+'([\w]+)'/i);
      if (colMatch) {
        const missingCol = colMatch[1] || colMatch[2] || colMatch[3];
        if (missingCol && missingCol in payload) {
          const { [missingCol]: _dropped, ...rest } = payload as Record<string, unknown>;
          void _dropped;
          payload = rest;
          continue;
        }
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
      // When courses.teacher_id column is missing, fall back to all quizzes (sorted by date)
      if (ce) {
        const msg = `${ce.message || ''} ${ce.details || ''}`.toLowerCase();
        if (ce.code === 'PGRST204' || /teacher_id/.test(msg) || /does not exist|42703|undefined column/.test(msg)) {
          const fallbackQ = await supabaseAdmin.from("quizzes").select("*").order("created_at", { ascending: false }).limit(500);
          return sortRows(fallbackQ.data || []);
        }
        throw ce;
      }
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

  // ── Config section in-memory cache (30s TTL) ────────────────────────────
  // Each DB call to getConfigSection costs ~50-150ms. With branding + runtime
  // + settings fetched on every startup (up to 4 calls), caching saves 200-600ms
  // per request cluster. Cache is invalidated immediately on any write.
  const CONFIG_CACHE_TTL_MS = 30_000;
  const configSectionCache = new Map<string, { value: unknown; expiresAt: number }>();

  const getConfigSection = async (section: string) => {
    const cached = configSectionCache.get(section);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }
    const res = await supabaseAdmin
      .from("platform_config")
      .select("section, value, updated_at")
      .eq("section", section)
      .maybeSingle();
    if (res.error) throw res.error;
    const value = res.data?.value ?? null;
    configSectionCache.set(section, { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return value;
  };

  const upsertConfigSection = async (section: string, value: unknown) => {
    // Invalidate cache immediately on write so the next read is fresh
    configSectionCache.delete(section);
    const res = await supabaseAdmin
      .from("platform_config")
      .upsert({ section, value, updated_at: new Date().toISOString() }, { onConflict: "section" })
      .select("section, value, updated_at")
      .maybeSingle();
    if (res.error) throw res.error;
    // Some PostgREST versions return null data on a successful upsert (RLS/schema-cache quirk).
    // Fall back to a plain read so callers always get the saved value.
    if (!res.data) {
      const readRes = await supabaseAdmin
        .from("platform_config")
        .select("section, value, updated_at")
        .eq("section", section)
        .maybeSingle();
      if (readRes.error) throw readRes.error;
      // Update cache with the freshly-read value
      if (readRes.data?.value !== undefined) {
        configSectionCache.set(section, { value: readRes.data.value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
      }
      return readRes.data;
    }
    // Update cache with the written value
    configSectionCache.set(section, { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return res.data;
  };

  const isPlatformConfigMissing = (error: any) => {
    const hay = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return error?.code === "42P01" || (error?.code === "PGRST205" && hay.includes("platform_config"));
  };

  /**
   * Reads `platform_config.settings.notifications[settingsKey]` and returns
   * per-role enabled flags. Defaults all roles to `true` when the settings row
   * doesn't exist yet so events fan out on a fresh install.
   *
   * Backward-compatible: if the stored value is a plain boolean (old format)
   * it applies that boolean to all three roles.
   */
  const isNotificationEnabled = async (settingsKey: string): Promise<{ student: boolean; teacher: boolean; admin: boolean }> => {
    const allTrue  = { student: true,  teacher: true,  admin: true  };
    const allFalse = { student: false, teacher: false, admin: false };
    try {
      const settings: any = await getConfigSection("settings");
      const notifs = settings?.notifications;
      if (!notifs || typeof notifs !== "object") return allTrue;
      const v = notifs[settingsKey];
      if (v === undefined) return allTrue;
      // New format: per-role object { student, teacher, admin }
      if (v && typeof v === "object" && "student" in v) {
        return {
          student: Boolean(v.student),
          teacher: Boolean(v.teacher),
          admin:   Boolean(v.admin),
        };
      }
      // Legacy format: single boolean — apply to all roles
      const b = Boolean(v);
      return { student: b, teacher: b, admin: b };
    } catch {
      return allFalse;
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

  // ── Server-side Live Session Auto-End ────────────────────────────────────────
  // Runs every 5 minutes. Finds any session with status='live' whose
  // started_at + duration_minutes has elapsed, and marks it as 'ended'.
  // This handles the case where the teacher's browser closed before the timer fired.
  const autoEndExpiredLiveSessions = async () => {
    try {
      const { data: liveSessions, error } = await supabaseAdmin
        .from('live_sessions')
        .select('id, started_at, duration_minutes')
        .eq('status', 'live')
        .not('started_at', 'is', null);
      if (error || !liveSessions || liveSessions.length === 0) return;

      const now = Date.now();
      const expiredIds: string[] = [];
      for (const s of liveSessions as Array<{ id: string; started_at: string; duration_minutes: number }>) {
        const startMs = new Date(s.started_at).getTime();
        const endMs = startMs + (s.duration_minutes || 60) * 60 * 1000;
        // Add 2-minute grace period so client timer fires first
        if (now > endMs + 2 * 60 * 1000) {
          expiredIds.push(s.id);
        }
      }

      if (expiredIds.length === 0) return;

      const { error: updateErr } = await supabaseAdmin
        .from('live_sessions')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .in('id', expiredIds);
      if (updateErr) {
        console.warn('[live-sessions] auto-end update error:', updateErr.message);
      } else {
        console.log(`[live-sessions] Auto-ended ${expiredIds.length} expired session(s): ${expiredIds.join(', ')}`);
      }
    } catch (e) {
      console.warn('[live-sessions] autoEndExpiredLiveSessions error:', e);
    }
  };
  // Run once 1 minute after boot (sessions may exist from before restart), then every 5 minutes
  setTimeout(() => { void autoEndExpiredLiveSessions(); }, 60_000);
  setInterval(() => { void autoEndExpiredLiveSessions(); }, 5 * 60 * 1000);
  // ── End Live Session Auto-End ─────────────────────────────────────────────────

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
  // Health check responds instantly — no DB round-trip.
  // Supabase connectivity is checked in the background every 30s so the
  // status stays fresh without blocking Replit's liveness probe.
  let _cachedHealth: { status: string; error: string | null; checkedAt: number } = {
    status: 'unknown', error: null, checkedAt: 0,
  };
  const _refreshHealthCache = async () => {
    try {
      const { error } = await supabaseAdmin.from('profiles').select('count').limit(1);
      _cachedHealth = { status: error ? 'error' : 'connected', error: error?.message ?? null, checkedAt: Date.now() };
    } catch (err: any) {
      _cachedHealth = { status: 'failed', error: err.message, checkedAt: Date.now() };
    }
  };
  // Kick off first check immediately, then every 30 s
  void _refreshHealthCache();
  setInterval(() => { void _refreshHealthCache(); }, 30_000);

  app.get("/api/health", (_req, res) => {
    type VarStatus = 'set' | 'missing' | 'invalid';
    interface VarReport { status: VarStatus; hint?: string }

    const checkUrl = (key: string): VarReport => {
      const raw = (process.env[key] ?? '').trim();
      if (!raw) return { status: 'missing', hint: `Add ${key} to environment variables` };
      if (!raw.startsWith('https://') && !raw.startsWith('http://'))
        return { status: 'invalid', hint: `${key} must start with https:// (got: ${raw.slice(0, 20)}...)` };
      return { status: 'set' };
    };

    const checkSecret = (key: string, hint?: string): VarReport => {
      const raw = (process.env[key] ?? '').trim();
      if (!raw) return { status: 'missing', hint: hint ?? `Add ${key} to environment variables` };
      return { status: 'set' };
    };

    const vars: Record<string, Record<string, VarReport>> = {
      core: {
        VITE_SUPABASE_URL:       checkUrl('VITE_SUPABASE_URL'),
        VITE_SUPABASE_ANON_KEY:  checkSecret('VITE_SUPABASE_ANON_KEY', 'Frontend Supabase key — required for login'),
        SUPABASE_SERVICE_ROLE_KEY: checkSecret('SUPABASE_SERVICE_ROLE_KEY', 'Backend-only service role key'),
      },
      ai: {
        GEMINI_API_KEY: (() => {
          const replit = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? '').trim();
          const direct = (process.env.GEMINI_API_KEY ?? '').trim();
          if (replit || direct) return { status: 'set' } as VarReport;
          return { status: 'missing', hint: 'Set GEMINI_API_KEY for AI quiz/content features' } as VarReport;
        })(),
      },
      email: {
        BREVO_API_KEY:      checkSecret('BREVO_API_KEY',      '2FA verification emails require this'),
        BREVO_SENDER_EMAIL: checkSecret('BREVO_SENDER_EMAIL', 'Must match a verified sender in Brevo'),
        BREVO_SENDER_NAME:  checkSecret('BREVO_SENDER_NAME',  'Display name shown in email inbox'),
      },
      alerts: {
        TELEGRAM_BOT_TOKEN: checkSecret('TELEGRAM_BOT_TOKEN', 'Optional — enables error alerts via Telegram'),
        TELEGRAM_CHAT_ID:   checkSecret('TELEGRAM_CHAT_ID',   'Optional — Telegram chat to receive alerts'),
      },
      database: {
        DATABASE_URL: checkSecret('DATABASE_URL', 'Optional — direct pg pool for migrations/raw SQL'),
      },
    };

    const allVars = Object.values(vars).flatMap(g => Object.values(g));
    const missingCritical = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
      .filter(k => vars.core[k].status !== 'set');
    const invalidCount = allVars.filter(v => v.status === 'invalid').length;
    const missingCount = allVars.filter(v => v.status === 'missing').length;

    const overallStatus =
      missingCritical.length > 0 || invalidCount > 0 ? 'error'
      : missingCount > 0 ? 'degraded'
      : 'ok';

    const supabaseUrlRaw = (process.env.VITE_SUPABASE_URL ?? '').trim();

    res.status(overallStatus === 'error' ? 503 : 200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      node: process.version,
      env: process.env.NODE_ENV ?? 'development',
      summary: {
        total:   allVars.length,
        set:     allVars.filter(v => v.status === 'set').length,
        missing: missingCount,
        invalid: invalidCount,
      },
      vars,
      supabase: {
        urlPrefix: supabaseUrlRaw ? supabaseUrlRaw.replace(/^(https?:\/\/[^.]+).*/, '$1') + '…' : null,
        connectivity: _cachedHealth.status,
        error: _cachedHealth.error,
        cachedAgoMs: _cachedHealth.checkedAt ? Date.now() - _cachedHealth.checkedAt : null,
      },
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
        logoText: typeof b.logoText === "string" ? b.logoText.trim().toUpperCase() : null,
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

  // ── Combined platform init endpoint — returns runtime + branding + features in ONE request.
  // Replaces the 2-3 separate calls that App.tsx, StudentLayout and TeacherLayout used to fire.
  app.get("/api/platform/init", async (_req, res) => {
    try {
      const [settings, branding] = await Promise.all([
        getConfigSection("settings").catch(() => null),
        getConfigSection("branding").catch(() => null),
      ]);
      const s: any = settings || {};
      const b: any = branding || {};
      const features = extractPublicFeatureFlags(settings);
      const maintenanceMode = Boolean(s?.advanced?.maintenance);
      const schoolName = (typeof s?.general?.school_name === "string" && s.general.school_name.trim()) ||
        (typeof b?.schoolName === "string" && b.schoolName.trim()) || "QuizMaster";
      // Set a short browser cache so identical unauthenticated visits reuse the response
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json({
        success: true,
        features,
        maintenanceMode,
        schoolName,
        logoUrl: typeof b.logoUrl === "string" ? b.logoUrl : null,
        faviconUrl: typeof b.faviconUrl === "string" ? b.faviconUrl : null,
        logoText: typeof b.logoText === "string" ? b.logoText.trim().toUpperCase() : null,
        colors: b.colors && typeof b.colors === "object" ? b.colors : null,
        typography: b.typography && typeof b.typography === "object" ? b.typography : null,
        copy: b.copy && typeof b.copy === "object" ? b.copy : null,
        darkMode: Boolean(b.darkMode),
      });
    } catch (e: any) {
      if (isPlatformConfigMissing(e)) {
        res.set("Cache-Control", "public, max-age=60");
        return res.json({
          success: true,
          features: extractPublicFeatureFlags(null),
          maintenanceMode: false,
          schoolName: "QuizMaster",
          logoUrl: null, faviconUrl: null, logoText: null, colors: null,
          typography: null, copy: null, darkMode: false,
        });
      }
      res.status(500).json({ error: e?.message || "Failed to load platform config" });
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

      const page  = Math.max(0, parseInt(String(req.query.page  ?? '0')) || 0);
      const limit = Math.min(200, Math.max(10, parseInt(String(req.query.limit ?? '100')) || 100));
      const rangeStart = page * limit;
      const rangeEnd   = rangeStart + limit - 1;

      const [profilesRes, teachersRes, coursesRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*', { count: 'exact' }).eq('role', 'student').range(rangeStart, rangeEnd),
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

      res.json({ success: true, students, teacherOptions, total: profilesRes.count ?? students.length, page, limit });
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

      const tPage  = Math.max(0, parseInt(String(req.query.page  ?? '0')) || 0);
      const tLimit = Math.min(200, Math.max(10, parseInt(String(req.query.limit ?? '100')) || 100));
      const tRangeStart = tPage * tLimit;
      const tRangeEnd   = tRangeStart + tLimit - 1;

      const [profilesRes, teachersRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*", { count: 'exact' }).eq("role", "teacher").range(tRangeStart, tRangeEnd),
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
      res.json({ success: true, teachers, total: profilesRes.count ?? teachers.length, page: tPage, limit: tLimit });
    } catch (error: any) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to seed the initial admin account
  app.get("/api/admin/seed", async (req, res) => {
    const adminEmail = "britanicaschool@gmail.com";
    const adminPassword = "Admin123!";
    
    try {
      // Allow unauthenticated seed only when no profiles exist yet (fresh DB)
      const { count } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .then(r => ({ count: r.count ?? 0 }));

      if (count > 0) {
        // Profiles exist — require admin auth before re-seeding
        const caller = await assertAuthenticated(req, res);
        if (!caller) return;
        if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });
      }
      // Fresh DB (count === 0): allow seed freely so admins can bootstrap any environment

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

  // ── Clear all database data except admin users ────────────────────────────
  app.post("/api/admin/clear-database", async (req, res) => {
    try {
      const { confirmation } = req.body || {};
      if (confirmation !== "DELETE") {
        return res.status(400).json({ error: "Confirmation text must be 'DELETE'" });
      }

      const caller = await getAuthUser(req);
      if (!caller || caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const adminId = caller.userId;

      // Step 1: find all non-admin user IDs so we can delete their auth accounts
      const { data: nonAdminProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .neq("role", "admin");

      const nonAdminIds: string[] = (nonAdminProfiles || []).map((p: any) => p.id);

      // Step 2: delete non-admin auth users in Supabase Auth
      const authDeletions = nonAdminIds.map((id) =>
        supabaseAdmin.auth.admin.deleteUser(id).catch(() => null)
      );
      await Promise.all(authDeletions);

      // Step 3: truncate all data tables (order matters for foreign keys)
      const tables = [
        // Discussion system (children first)
        "discussion_moderation_actions",
        "discussion_user_badges",
        "discussion_badges",
        "discussion_user_stats",
        "lesson_discussion_reports",
        "lesson_discussion_reactions",
        "lesson_discussion_replies",
        "lesson_discussion_answers",
        "lesson_discussion_questions",
        // Live sessions
        "session_reactions",
        "session_chat_messages",
        "session_participants",
        "live_sessions",
        // Community & announcements
        "community_posts",
        "announcements",
        // Quiz data
        "quiz_runtime_state",
        "quiz_attempts",
        "attempts",
        "questions",
        "quizzes",
        // Lesson content & progress
        "lesson_progress",
        "lesson_contents",
        "lessons",
        // Academic records
        "assignment_submissions",
        "assignments",
        "attendance",
        "certificates",
        // Finance
        "invoices",
        "payments",
        // Course structure
        "modules",
        "courses",
        "classes",
        // User data (non-admins only – handled below)
        "teachers",
        "students",
        "notifications",
        // Config & monitoring
        "platform_config",
        "error_alert_context",
      ];

      const errors: string[] = [];
      for (const table of tables) {
        try {
          const { error } = await supabaseAdmin.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (error && !error.message.includes("does not exist") && !error.message.includes("relation")) {
            errors.push(`${table}: ${error.message}`);
          }
        } catch {
          // Table doesn't exist — skip silently
        }
      }

      // Step 4: delete non-admin profiles (keep admins)
      await supabaseAdmin.from("profiles").delete().neq("role", "admin");

      console.log(`[clear-database] Cleared by admin ${adminId}. Errors: ${errors.length ? errors.join("; ") : "none"}`);

      return res.json({
        success: true,
        message: "Database cleared. All data deleted except admin accounts.",
        deletedUsers: nonAdminIds.length,
        errors,
      });
    } catch (err: any) {
      console.error("[clear-database] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to clear database" });
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
  // ── Helper: send credentials to a newly created user via configured channels ─
  const sendUserCredentials = async (opts: {
    name: string;
    email: string;
    password: string;
    role: 'teacher' | 'student';
    phone?: string;
  }) => {
    try {
      const settings: any = await getConfigSection('settings');
      const channels = settings?.notification_channels || {};
      const brandName: string = settings?.general?.school_name || 'QuizMaster';
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (settings?.general?.website || 'http://localhost:5000');
      const loginUrl = `${baseUrl}/login`;

      const plainText = [
        `Përshëndetje ${opts.name},`,
        opts.role === 'teacher'
          ? `Ju jeni ftuar si mësues në platformën ${brandName}.`
          : `Llogaria juaj si student në ${brandName} është krijuar me sukses.`,
        ``,
        `Kredencialet tuaja:`,
        `Email: ${opts.email}`,
        `Fjalëkalim: ${opts.password}`,
        `Kyçuni: ${loginUrl}`,
        ``,
        `Ju mirëpresim! — Ekipi i ${brandName}`,
      ].join('\n');

      const results: Record<string, string> = {};

      // ── 1. Email via Brevo (enabled by default unless explicitly disabled) ──
      if (channels.email_enabled !== false) {
        try {
          if (isEmailConfigured()) {
            const tpl = renderCredentialEmail({ name: opts.name, email: opts.email, password: opts.password, role: opts.role, loginUrl, brandName });
            await sendEmail({ to: opts.email, toName: opts.name, subject: tpl.subject, htmlContent: tpl.htmlContent, textContent: tpl.textContent });
            results.email = 'sent';
          } else {
            results.email = 'not_configured';
          }
        } catch (e: any) {
          results.email = `error: ${e.message}`;
        }
      }

      // ── 2. Viber ──
      if (channels.viber_enabled && channels.viber_token && opts.phone) {
        try {
          const vRes = await fetch('https://chatapi.viber.com/pa/send_message', {
            method: 'POST',
            headers: { 'X-Viber-Auth-Token': String(channels.viber_token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiver: opts.phone.replace(/[^0-9]/g, ''), type: 'text', text: plainText }),
          });
          const vJson = await vRes.json().catch(() => ({})) as any;
          results.viber = vJson.status === 0 ? 'sent' : `error: ${vJson.status_message || vRes.status}`;
        } catch (e: any) {
          results.viber = `error: ${e.message}`;
        }
      }

      // ── 3. WhatsApp (Meta Cloud API) ──
      if (channels.whatsapp_enabled && channels.whatsapp_token && channels.whatsapp_phone_id && opts.phone) {
        try {
          const waRes = await fetch(`https://graph.facebook.com/v19.0/${channels.whatsapp_phone_id}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${channels.whatsapp_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: opts.phone.replace(/[^0-9]/g, ''),
              type: 'text',
              text: { body: plainText },
            }),
          });
          const waJson = await waRes.json().catch(() => ({})) as any;
          results.whatsapp = waJson.messages?.[0]?.id ? 'sent' : `error: ${JSON.stringify(waJson.error || waJson)}`;
        } catch (e: any) {
          results.whatsapp = `error: ${e.message}`;
        }
      }

      // ── 4. Gmail (SMTP via nodemailer) ──
      if (channels.gmail_enabled && channels.gmail_user && channels.gmail_password) {
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: { user: String(channels.gmail_user), pass: String(channels.gmail_password) },
          });
          const tpl = renderCredentialEmail({ name: opts.name, email: opts.email, password: opts.password, role: opts.role, loginUrl, brandName });
          await transporter.sendMail({
            from: `"${brandName}" <${channels.gmail_user}>`,
            to: opts.email,
            subject: tpl.subject,
            html: tpl.htmlContent,
            text: tpl.textContent,
          });
          results.gmail = 'sent';
        } catch (e: any) {
          results.gmail = `error: ${e.message}`;
        }
      }

      console.log(`[credentials] ${opts.role} ${opts.email} →`, JSON.stringify(results));
      return results;
    } catch (e: any) {
      console.error('[credentials] sendUserCredentials error:', e.message);
      return {};
    }
  };

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
      // Fire-and-forget: send credentials via configured notification channels
      void sendUserCredentials({ name, email, password, role: 'teacher', phone: phone || undefined });
    } catch (error: any) {
      console.error('Error creating teacher:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route to create a student
  app.post("/api/admin/reset-all-welcome", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Admin only" });

      // Fetch all users with role=student
      let page = 1;
      const resetIds: string[] = [];
      while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        for (const u of data.users) {
          if (u.user_metadata?.role === "student") resetIds.push(u.id);
        }
        if (data.users.length < 1000) break;
        page++;
      }

      // Reset welcomed flag for each student
      await Promise.all(
        resetIds.map(id =>
          supabaseAdmin.auth.admin.updateUserById(id, { user_metadata: { welcomed: false } })
        )
      );

      return res.json({ success: true, count: resetIds.length });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to reset welcome flags" });
    }
  });

  app.post("/api/admin/reset-welcome/:userId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Admin only" });
      const { userId } = req.params;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { welcomed: false },
      });
      if (error) throw error;
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to reset welcome flag" });
    }
  });

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

        const classStudentIds = [...new Set(
          (Array.isArray(cls.student_ids) ? cls.student_ids : []).map((sid: unknown) => String(sid)).filter(Boolean)
        )];
        if (!classStudentIds.includes(userId)) {
          const capacity = cls.capacity != null && cls.capacity !== '' ? Number(cls.capacity) : 30;
          if (classStudentIds.length >= capacity) {
            return res.status(400).json({ error: `This class is full (${classStudentIds.length}/${capacity}). No free spots available.` });
          }
          const nextClassStudentIds = [...classStudentIds, userId];
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
      // Fire-and-forget: send credentials via configured notification channels
      void sendUserCredentials({ name, email, password, role: 'student', phone: phone || undefined });
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

  app.get('/api/admin/courses/:id', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: 'Forbidden: admin role required' });
      const { data, error } = await supabaseAdmin
        .from('courses')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error) return res.status(404).json({ error: 'Course not found' });
      res.json({ success: true, course: data });
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

  // Teacher: create own course
  app.post('/api/teacher/courses', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: teacher or admin role required' });
      }

      const teacherId = caller.userId;
      const teacherIdCandidates = await getTeacherIdCandidates(teacherId);
      if (teacherIdCandidates.length === 0) {
        return res.status(400).json({ error: 'Teacher account not found.' });
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
      for (const tid of teacherIdCandidates) {
        const { data, error } = await supabaseAdmin
          .from('courses')
          .insert({ ...payloadBase, teacher_id: tid })
          .select()
          .single();
        if (!error) { createdCourse = data; break; }
        if (!(error.code === '23503' && typeof error.message === 'string' && error.message.includes('courses_teacher_id_fkey'))) {
          throw error;
        }
      }

      if (!createdCourse) {
        return res.status(400).json({ error: 'Could not create course. Please try again.' });
      }

      // Optionally link to a class
      const selectedClassId = typeof req.body?.class_id === 'string' ? req.body.class_id.trim() : '';
      if (selectedClassId) {
        const { data: classRow } = await supabaseAdmin
          .from('classes').select('id, student_ids').eq('id', selectedClassId).maybeSingle();
        if (classRow) {
          const studentIds = Array.isArray((classRow as any).student_ids)
            ? (classRow as any).student_ids.map((s: unknown) => String(s)).filter(Boolean)
            : [];
          const unique = Array.from(new Set(studentIds));
          const { data: updated } = await supabaseAdmin
            .from('courses')
            .update({ student_ids: unique, total_students: unique.length, updated_at: new Date().toISOString() })
            .eq('id', createdCourse.id).select().single();
          if (updated) createdCourse = updated;
        }
      }

      res.json({ success: true, course: createdCourse });
    } catch (e: any) {
      console.error('POST /api/teacher/courses', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Teacher: update own course
  app.patch('/api/teacher/courses/:id', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { id: courseId } = req.params;
      const gate = await assertTeacherOwnsCourse(caller.userId, courseId);
      if (!gate.ok) return res.status(403).json({ error: 'You do not have access to this course.' });

      const updates = {
        ...sanitizeCoursePayload(req.body),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from('courses').update(updates).eq('id', courseId).select().single();
      if (error) throw error;
      res.json({ success: true, course: data });
    } catch (e: any) {
      console.error('PATCH /api/teacher/courses/:id', e);
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

  // ── GET /api/teacher/peer-teachers — list of other active teachers (for transfer target picker) ──
  app.get("/api/teacher/peer-teachers", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, status")
        .eq("role", "teacher")
        .neq("id", caller.userId)
        .eq("status", "active")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return res.json({ teachers: data ?? [] });
    } catch (e: any) {
      console.error("GET /api/teacher/peer-teachers", e);
      return res.status(500).json({ error: e?.message || "Failed to load teachers" });
    }
  });

  // ── POST /api/teacher/students/:studentId/transfer — reassign a student to a different teacher ──
  app.post("/api/teacher/students/:studentId/transfer", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const studentId = String(req.params.studentId || "").trim();
      const targetTeacherId = typeof req.body?.targetTeacherId === "string" ? req.body.targetTeacherId.trim() : "";
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      if (!targetTeacherId) return res.status(400).json({ error: "targetTeacherId is required" });

      // Verify student exists and belongs to the caller (teachers) or any (admin)
      const { data: student, error: sErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role, teacher_id, display_name, email")
        .eq("id", studentId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!student) return res.status(404).json({ error: "Student not found" });
      if (student.role !== "student") return res.status(400).json({ error: "Target user is not a student" });

      if (caller.role === "teacher") {
        const teacherIds = await getTeacherIdCandidates(caller.userId);
        const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];
        if (!scopedIds.includes(String(student.teacher_id))) {
          return res.status(403).json({ error: "Forbidden: student is not linked to your account" });
        }
      }

      // Verify target teacher exists and has the teacher role
      const { data: targetTeacher, error: tErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role, display_name")
        .eq("id", targetTeacherId)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!targetTeacher) return res.status(404).json({ error: "Target teacher not found" });
      if (targetTeacher.role !== "teacher") return res.status(400).json({ error: "Target user is not a teacher" });

      // Perform the transfer
      const { error: updErr } = await supabaseAdmin
        .from("profiles")
        .update({ teacher_id: targetTeacherId })
        .eq("id", studentId);
      if (updErr) throw updErr;

      // Get the from-teacher name for the log
      const { data: fromTeacherProfile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, email")
        .eq("id", caller.userId)
        .maybeSingle();

      // Log the transfer (fire-and-forget; don't let a logging failure break the transfer)
      await supabaseAdmin.from("student_transfers").insert({
        student_id:       studentId,
        student_name:     student.display_name || "",
        student_email:    student.email || "",
        from_teacher_id:  caller.userId,
        from_teacher_name: fromTeacherProfile?.display_name || fromTeacherProfile?.email || "",
        to_teacher_id:    targetTeacherId,
        to_teacher_name:  targetTeacher.display_name || "",
        transferred_by:   caller.userId,
      }).then(({ error: logErr }) => {
        if (logErr) console.warn("[transfer] Failed to log transfer:", logErr.message);
      });

      console.log(`[transfer] Student ${studentId} transferred from teacher ${caller.userId} → ${targetTeacherId}`);
      return res.json({
        success: true,
        message: `${student.display_name || student.email} transferred to ${targetTeacher.display_name}`,
      });
    } catch (e: any) {
      console.error("POST /api/teacher/students/:studentId/transfer", e);
      return res.status(500).json({ error: e?.message || "Failed to transfer student" });
    }
  });

  // ── GET /api/admin/transfer-history — all student transfers (admin only) ──
  app.get("/api/admin/transfer-history", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const limit  = Math.min(200, Math.max(1, parseInt(String(req.query.limit  ?? "50"), 10)));
      const offset = Math.max(0,              parseInt(String(req.query.offset ?? "0"),  10));

      const { data, error, count } = await supabaseAdmin
        .from("student_transfers")
        .select("*", { count: "exact" })
        .order("transferred_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        if (/does not exist|PGRST|schema cache|Could not find/i.test(error.message)) {
          return res.json({ transfers: [], total: 0 });
        }
        throw error;
      }
      return res.json({ transfers: data ?? [], total: count ?? 0 });
    } catch (e: any) {
      console.error("GET /api/admin/transfer-history", e);
      return res.status(500).json({ error: e?.message || "Failed to load transfer history" });
    }
  });

  // ── GET /api/teacher/transfer-history — transfers involving the calling teacher ──
  app.get("/api/teacher/transfer-history", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit  ?? "30"), 10)));
      const offset = Math.max(0,              parseInt(String(req.query.offset ?? "0"),  10));

      // Teachers see transfers they initiated (from) OR received (to)
      const { data: sent, error: e1 } = await supabaseAdmin
        .from("student_transfers")
        .select("*")
        .eq("from_teacher_id", caller.userId)
        .order("transferred_at", { ascending: false })
        .limit(limit);

      const { data: received, error: e2 } = await supabaseAdmin
        .from("student_transfers")
        .select("*")
        .eq("to_teacher_id", caller.userId)
        .order("transferred_at", { ascending: false })
        .limit(limit);

      if (e1 && /does not exist|PGRST|schema cache|Could not find/i.test(e1.message)) {
        return res.json({ transfers: [] });
      }
      if (e2 && /does not exist|PGRST|schema cache|Could not find/i.test(e2?.message || '')) {
        return res.json({ transfers: [] });
      }
      if (e1) throw e1;
      if (e2) throw e2;

      // Merge, deduplicate, sort by date
      const allById = new Map<string, any>();
      [...(sent ?? []), ...(received ?? [])].forEach(t => allById.set(t.id, t));
      const merged = Array.from(allById.values())
        .sort((a, b) => new Date(b.transferred_at).getTime() - new Date(a.transferred_at).getTime())
        .slice(offset, offset + limit);

      return res.json({ transfers: merged });
    } catch (e: any) {
      console.error("GET /api/teacher/transfer-history", e);
      return res.status(500).json({ error: e?.message || "Failed to load transfer history" });
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

      const courseRows = await fetchTeacherCourseRows(scopedIds, true);
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
        if (quizzesRes.error && !isAnyTableMissingError(quizzesRes.error)) throw quizzesRes.error;
        quizRows = quizzesRes.error ? [] : (quizzesRes.data || []);
      }
      const quizzesCount = quizRows.length;
      const quizIds = new Set<string>(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
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

      const attemptsRows = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds: allowedStudentIds }),
        passingScoreByQuiz
      ).filter((a: any) => {
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

      // ── Assignment submissions — real activity data even when quiz_attempts is absent ──
      let teacherAssignmentsCount = 0;
      const assignmentsByStudent: Record<string, { submitted: number; graded: number; gradeSum: number; lastDate: string | null }> = {};
      if (teacherCourseIds.length > 0) {
        const assignmentsRes = await supabaseAdmin
          .from("assignments")
          .select("id,title,course_id")
          .in("course_id", teacherCourseIds);
        if (!assignmentsRes.error) {
          const assignmentIds = (assignmentsRes.data || []).map((a: any) => String(a.id)).filter(Boolean);
          teacherAssignmentsCount = assignmentIds.length;
          if (assignmentIds.length > 0 && allowedStudentIds.size > 0) {
            const subsRes = await supabaseAdmin
              .from("assignment_submissions")
              .select("id,assignment_id,student_id,grade,status,submitted_at")
              .in("assignment_id", assignmentIds)
              .in("student_id", [...allowedStudentIds]);
            if (!subsRes.error) {
              (subsRes.data || []).forEach((sub: any) => {
                const sid = String(sub.student_id || "");
                if (!sid || !allowedStudentIds.has(sid)) return;
                if (!assignmentsByStudent[sid]) assignmentsByStudent[sid] = { submitted: 0, graded: 0, gradeSum: 0, lastDate: null };
                assignmentsByStudent[sid].submitted += 1;
                if (sub.grade != null && sub.grade !== "") {
                  assignmentsByStudent[sid].graded += 1;
                  assignmentsByStudent[sid].gradeSum += Number(sub.grade) || 0;
                }
                const d = sub.submitted_at || null;
                if (d && (!assignmentsByStudent[sid].lastDate || d > assignmentsByStudent[sid].lastDate!)) {
                  assignmentsByStudent[sid].lastDate = d;
                }
              });
            }
          }
        }
      }

      const rows = [...studentById.values()].map((s: any) => {
        const sid = String(s.id);
        const aggr = attemptsByStudent[sid] || { attempts: 0, passed: 0, scoreSum: 0 };
        const avgScore = aggr.attempts > 0 ? Math.round(aggr.scoreSum / aggr.attempts) : 0;
        const passRate = aggr.attempts > 0 ? Math.round((aggr.passed / aggr.attempts) * 100) : 0;

        const studentAttempts = attemptsRows.filter((a: any) => String(a.student_id || "") === sid);
        const sortedAttempts = [...studentAttempts].sort((a: any, b: any) =>
          new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime()
        );
        const lastAttemptDate: string | null = sortedAttempts[0]?.completed_at || null;

        const courseCount: Record<string, number> = {};
        studentAttempts.forEach((a: any) => {
          const quiz = quizRows.find((q: any) => String(q.id || "") === String(a.quiz_id || ""));
          if (quiz?.course_id) {
            const cid = String(quiz.course_id);
            courseCount[cid] = (courseCount[cid] || 0) + 1;
          }
        });
        const topCourseId = Object.entries(courseCount).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0];
        const topCourse = courseRows.find((c: any) => String(c.id || "") === topCourseId);

        const subAggr = assignmentsByStudent[sid] || { submitted: 0, graded: 0, gradeSum: 0, lastDate: null };
        const submissionRate = teacherAssignmentsCount > 0 ? Math.round((subAggr.submitted / teacherAssignmentsCount) * 100) : 0;
        const avgGrade = subAggr.graded > 0 ? Math.round(subAggr.gradeSum / subAggr.graded) : 0;
        const lastActivityDate = (() => {
          const dates = [lastAttemptDate, subAggr.lastDate].filter(Boolean) as string[];
          if (!dates.length) return null;
          return dates.sort((a, b) => b.localeCompare(a))[0];
        })();

        return {
          studentId: sid,
          studentName: String(s.display_name || "Unknown Student"),
          studentEmail: String(s.email || ""),
          attempts: aggr.attempts,
          passed: aggr.passed,
          passRate,
          avgScore,
          lastAttemptDate: lastActivityDate,
          topCourseName: topCourse?.title || null,
          submissionsCount: subAggr.submitted,
          assignmentsTotal: teacherAssignmentsCount,
          submissionRate,
          avgGrade,
        };
      });

      res.json({ success: true, rows, coursesCount, quizzesCount, assignmentsCount: teacherAssignmentsCount });
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

      const teacherCourseRowsFull = await fetchTeacherCourseRows(scopedIds, true);
      const teacherCourseIds = teacherCourseRowsFull.map((c: any) => String(c.id || "")).filter(Boolean);

      let quizRows: any[] = [];
      if (teacherCourseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", teacherCourseIds);
        if (quizzesRes.error && !isAnyTableMissingError(quizzesRes.error)) throw quizzesRes.error;
        quizRows = quizzesRes.error ? [] : (quizzesRes.data || []);
      }
      const quizIds = new Set<string>(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
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

      // Collect students from 3 sources (same pattern as /api/teacher/students & /api/teacher/progress)
      const studentById = new Map<string, { name: string; email: string }>();

      // Source 1: profiles.teacher_id
      const linkedStudentsRes = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,email")
        .in("teacher_id", scopedIds)
        .eq("role", "student");
      if (!linkedStudentsRes.error) {
        for (const s of (linkedStudentsRes.data || [])) {
          const sid = String(s.id || "");
          if (sid) studentById.set(sid, { name: String(s.display_name || "Unknown"), email: String(s.email || "") });
        }
      }

      // Source 2: courses.student_ids
      const courseEnrolledIds = new Set<string>();
      for (const c of teacherCourseRowsFull) {
        if (Array.isArray(c.student_ids)) {
          for (const sid of c.student_ids) {
            const s = String(sid || "");
            if (s && !studentById.has(s)) courseEnrolledIds.add(s);
          }
        }
      }

      // Source 3: classes.student_ids
      const classResForResults = await supabaseAdmin
        .from("classes")
        .select("student_ids")
        .in("teacher_id", scopedIds);
      if (!classResForResults.error && Array.isArray(classResForResults.data)) {
        for (const cl of classResForResults.data) {
          if (Array.isArray(cl.student_ids)) {
            for (const sid of cl.student_ids) {
              const s = String(sid || "");
              if (s && !studentById.has(s)) courseEnrolledIds.add(s);
            }
          }
        }
      }

      // Fetch profiles for course/class-enrolled students not yet in map
      if (courseEnrolledIds.size > 0) {
        const enrolledRes = await supabaseAdmin
          .from("profiles")
          .select("id,display_name,email")
          .in("id", [...courseEnrolledIds]);
        if (!enrolledRes.error) {
          for (const s of (enrolledRes.data || [])) {
            const sid = String(s.id || "");
            if (sid && !studentById.has(sid)) {
              studentById.set(sid, { name: String(s.display_name || "Unknown"), email: String(s.email || "") });
            }
          }
        }
      }

      const allowedStudentIds = new Set<string>(studentById.keys());
      const students: Record<string, { name: string; email: string }> = Object.fromEntries(studentById);

      const attempts = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds: allowedStudentIds }),
        passingScoreByQuiz
      ).filter((a: any) => quizIds.has(String(a.quiz_id || "")) && allowedStudentIds.has(String(a.student_id || "")))
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

      // Assignment submissions — real activity even when quiz_attempts is absent
      let assignmentSubmissions: any[] = [];
      let assignments: Record<string, string> = {};
      if (teacherCourseIds.length > 0) {
        const asgRes = await supabaseAdmin
          .from("assignments")
          .select("id,title,course_id")
          .in("course_id", teacherCourseIds);
        if (!asgRes.error) {
          (asgRes.data || []).forEach((a: any) => { assignments[String(a.id)] = String(a.title || "Assignment"); });
          const asgIds = Object.keys(assignments);
          if (asgIds.length > 0 && allowedStudentIds.size > 0) {
            const subRes = await supabaseAdmin
              .from("assignment_submissions")
              .select("id,assignment_id,student_id,grade,status,submitted_at,content")
              .in("assignment_id", asgIds)
              .in("student_id", [...allowedStudentIds]);
            if (!subRes.error) {
              assignmentSubmissions = (subRes.data || []).map((s: any) => ({
                id: String(s.id || ""),
                assignmentId: String(s.assignment_id || ""),
                studentId: String(s.student_id || ""),
                grade: s.grade != null ? Number(s.grade) : null,
                status: String(s.status || "submitted"),
                submittedAt: s.submitted_at || null,
              }));
            }
          }
        }
      }

      res.json({ success: true, attempts, quizzes, students, assignmentSubmissions, assignments });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load teacher results" });
    }
  });

  // Teacher dashboard summary — scoped strictly to authenticated teacher ownership.
  app.get("/api/teacher/dashboard", async (req: Request, res: Response) => {
    try {
      const dashboardStartedAt = Date.now();
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

      const teacherDashboardCacheKey = `teacher-dashboard:${requestedUserId}`;
      const cachedTeacherDashboard = getCachedApiResponse<any>(teacherDashboardCacheKey);
      if (cachedTeacherDashboard) return res.json(cachedTeacherDashboard);

      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];

      // Fetch course rows including student_ids for enrollment counting
      const courseRowsFull = await fetchTeacherCourseRows(scopedIds, true);
      const courseIds = courseRowsFull.map((c: any) => String(c.id || "")).filter(Boolean);

      // Collect student IDs from 3 sources (mirrors /api/teacher/students logic):
      // 1) profiles.teacher_id (direct link)
      // 2) courses.student_ids (enrollment array on each course)
      // 3) classes.student_ids (class-level enrollment)
      const studentIds = new Set<string>();

      // Source 1: profiles linked by teacher_id
      const linkedStudentsRes = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("teacher_id", scopedIds)
        .eq("role", "student");
      if (!linkedStudentsRes.error) {
        for (const s of (linkedStudentsRes.data || [])) {
          const sid = String(s.id || "");
          if (sid) studentIds.add(sid);
        }
      }

      // Source 2: courses.student_ids enrollment arrays
      for (const c of courseRowsFull) {
        if (Array.isArray(c.student_ids)) {
          for (const sid of c.student_ids) {
            const s = String(sid || "");
            if (s) studentIds.add(s);
          }
        }
      }

      // Source 3: classes.student_ids for this teacher's classes
      const classesRes = await supabaseAdmin
        .from("classes")
        .select("student_ids")
        .in("teacher_id", scopedIds);
      if (!classesRes.error && Array.isArray(classesRes.data)) {
        for (const cl of classesRes.data) {
          if (Array.isArray(cl.student_ids)) {
            for (const sid of cl.student_ids) {
              const s = String(sid || "");
              if (s) studentIds.add(s);
            }
          }
        }
      }

      let quizRows: any[] = [];
      if (courseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
        if (quizzesRes.error && !isAnyTableMissingError(quizzesRes.error)) throw quizzesRes.error;
        quizRows = quizzesRes.error ? [] : (quizzesRes.data || []);
      }
      const quizIds = new Set<string>(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
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

      const attempts = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds }),
        passingScoreByQuiz
      ).filter((a: any) => {
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

      // Module completion per course
      let moduleCompletion: { course: string; published: number; total: number; pct: number }[] = [];
      if (courseIds.length > 0) {
        const [modulesForCourses, courseTitles] = await Promise.all([
          supabaseAdmin.from("modules").select("id, course_id, status").in("course_id", courseIds),
          supabaseAdmin.from("courses").select("id, title").in("id", courseIds),
        ]);
        if (!modulesForCourses.error && !courseTitles.error) {
          const titleMap: Record<string, string> = {};
          for (const c of (courseTitles.data || [])) {
            titleMap[String(c.id)] = String(c.title || "Untitled");
          }
          const groupedByCourse: Record<string, { total: number; published: number }> = {};
          for (const m of (modulesForCourses.data || [])) {
            const cid = String(m.course_id || "");
            if (!groupedByCourse[cid]) groupedByCourse[cid] = { total: 0, published: 0 };
            groupedByCourse[cid].total++;
            if (String(m.status || "").toLowerCase() === "published") groupedByCourse[cid].published++;
          }
          moduleCompletion = Object.entries(groupedByCourse)
            .map(([cid, { total, published }]) => ({
              course: titleMap[cid] || "Untitled",
              published,
              total,
              pct: total > 0 ? Math.round((published / total) * 100) : 0,
            }))
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 8);
        }
      }

      // Top students leaderboard (ranked by avg score, min 1 completed attempt)
      let topStudents: { id: string; name: string; avatar: string | null; avgScore: number; quizzes: number; passed: number }[] = [];
      if (completedAttempts.length > 0) {
        const byStudent: Record<string, { scores: number[]; passed: number }> = {};
        for (const a of completedAttempts) {
          const sid = String(a.student_id || "");
          if (!sid || !studentIds.has(sid)) continue;
          if (!byStudent[sid]) byStudent[sid] = { scores: [], passed: 0 };
          byStudent[sid].scores.push(toFiniteNumber(a.score_percent, 0));
          if (a.passed) byStudent[sid].passed++;
        }
        const ranked = Object.entries(byStudent)
          .map(([id, { scores, passed }]) => ({
            id,
            avgScore: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
            quizzes: scores.length,
            passed,
          }))
          .sort((a, b) => b.avgScore - a.avgScore || b.quizzes - a.quizzes)
          .slice(0, 10);

        if (ranked.length > 0) {
          const profilesRes = await supabaseAdmin
            .from("profiles")
            .select("id, display_name, email, avatar_url")
            .in("id", ranked.map(r => r.id));
          const profileMap: Record<string, { name: string; avatar: string | null }> = {};
          for (const p of (profilesRes.data || [])) {
            profileMap[String(p.id)] = {
              name: String(p.display_name || p.email || "Student"),
              avatar: p.avatar_url || null,
            };
          }
          topStudents = ranked.map(r => ({
            ...r,
            name: profileMap[r.id]?.name ?? "Student",
            avatar: profileMap[r.id]?.avatar ?? null,
          }));
        }
      }

      const payload = {
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
        moduleCompletion,
        topStudents,
      };
      setCachedApiResponse(teacherDashboardCacheKey, payload, 30_000);
      const durationMs = Date.now() - dashboardStartedAt;
      if (durationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(
          `[perf] slow teacher dashboard requestedUserId=${requestedUserId} duration=${durationMs}ms courseIds=${courseIds.length} quizIds=${quizIds.size} attempts=${attempts.length}`,
        );
      }
      res.json(payload);
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
      const studentIds = new Set<string>((studentsRes.data || []).map((s: any) => String(s.id || "")).filter(Boolean));

      let quizRows: any[] = [];
      if (courseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
        if (quizzesRes.error) throw quizzesRes.error;
        quizRows = quizzesRes.data || [];
      }

      const quizIds = new Set<string>(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
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

      const attempts = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds }),
        passingScoreByQuiz
      ).filter((a: any) => {
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
      const quizCountByCourse: Record<string, number> = {};
      if (moduleIds.length > 0) {
        const { data: lessonRows, error: lessonErr } = await supabaseAdmin
          .from("lessons")
          .select("id,module_id")
          .in("module_id", moduleIds);
        if (lessonErr) throw lessonErr;

        (lessonRows || []).forEach((l: any) => {
          const moduleId = String(l?.module_id || "");
          const lessonId = String(l?.id || "");
          if (!moduleId || !lessonId) return;
          lessonCountByModule[moduleId] = (lessonCountByModule[moduleId] || 0) + 1;
        });
      }

      // Count quizzes by course_id (quizzes are linked to courses, not lessons/modules)
      if (courseIds.length > 0) {
        const fetchQuizRows = async () => {
          const withStatus = await supabaseAdmin
            .from("quizzes")
            .select("id,course_id,status")
            .in("course_id", courseIds);
          if (!withStatus.error) return withStatus.data || [];
          const fallback = await supabaseAdmin
            .from("quizzes")
            .select("id,course_id")
            .in("course_id", courseIds);
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
          const cId = String(q?.course_id || "");
          if (!cId) return;
          quizCountByCourse[cId] = (quizCountByCourse[cId] || 0) + 1;
        });
      }

      const enrichedRows = rows.map((m: any) => {
        const moduleId = String(m?.id || "");
        const courseId = String(m?.course_id || "");
        return {
          ...m,
          total_lessons: lessonCountByModule[moduleId] ?? m?.total_lessons ?? 0,
          total_quizzes: quizCountByCourse[courseId] ?? 0,
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
      if (typeof req.body.publish_at === "string" && req.body.publish_at) {
        insertRow.publish_at = req.body.publish_at;
      }

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
      if (typeof req.body.publish_at === "string" && req.body.publish_at) {
        updates.publish_at = req.body.publish_at;
      } else if (req.body.publish_at === null || req.body.publish_at === "") {
        updates.publish_at = null;
      }
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

  // ── Bulk-update status for multiple modules ───────────────────────────────
  app.post("/api/teacher/modules/bulk-status", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const moduleIds: string[] = Array.isArray(req.body?.moduleIds)
        ? req.body.moduleIds.filter((id: any) => typeof id === "string" && id)
        : [];
      const status = req.body?.status === "active" || req.body?.status === "inactive" ? req.body.status : null;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!moduleIds.length) return res.status(400).json({ error: "moduleIds required" });
      if (!status) return res.status(400).json({ error: "status must be active or inactive" });
      const { data: mods } = await supabaseAdmin.from("modules").select("id,course_id").in("id", moduleIds);
      const courseIds = [...new Set((mods || []).map((m: any) => String(m.course_id)))];
      for (const cid of courseIds) {
        const gate = await assertTeacherOwnsCourse(userId, cid);
        if (!gate.ok) return res.status(403).json({ error: "Access denied" });
      }
      const { error } = await supabaseAdmin.from("modules").update({ status, updated_at: new Date().toISOString() }).in("id", moduleIds);
      if (error) throw error;
      res.json({ success: true, updated: moduleIds.length });
    } catch (e: any) {
      console.error("POST /api/teacher/modules/bulk-status", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // ── Duplicate a module with all its lessons + lesson contents ─────────────
  app.post("/api/teacher/modules/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const moduleId = req.params.id;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: mod, error: mErr } = await supabaseAdmin.from("modules").select("*").eq("id", moduleId).maybeSingle();
      if (mErr) throw mErr;
      if (!mod) return res.status(404).json({ error: "Module not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(mod.course_id));
      if (!gate.ok) return res.status(403).json({ error: "Access denied" });
      const { data: maxOrd } = await supabaseAdmin.from("modules").select("order").eq("course_id", mod.course_id).order("order", { ascending: false }).limit(1).maybeSingle();
      const newOrder = ((maxOrd as any)?.order ?? 0) + 1;
      const ts = Date.now();
      const slugBase = String(mod.slug || mod.title || "module").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: newMod, error: newErr } = await supabaseAdmin.from("modules")
        .insert({ course_id: mod.course_id, title: `${mod.title} (Copy)`, slug: `${slugBase}-copy-${ts}`, description: mod.description, status: "inactive", order: newOrder })
        .select("id").single();
      if (newErr) throw newErr;
      const { data: lessons } = await supabaseAdmin.from("lessons").select("*").eq("module_id", moduleId).order("order");
      if (lessons && lessons.length > 0) {
        const newLessons = lessons.map((l: any) => ({
          course_id: l.course_id, module_id: newMod.id, title: l.title,
          slug: `${String(l.slug || l.title || "lesson").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ts}`,
          type: l.type, short_description: l.short_description, order: l.order,
          status: l.status, duration_minutes: l.duration_minutes, is_free_preview: l.is_free_preview,
        }));
        const { data: createdLessons } = await supabaseAdmin.from("lessons").insert(newLessons).select("id");
        if (createdLessons) {
          for (let i = 0; i < lessons.length; i++) {
            const newId = createdLessons[i]?.id;
            if (!newId) continue;
            const { data: contents } = await supabaseAdmin.from("lesson_contents").select("type,content_type,text_content,content,position").eq("lesson_id", lessons[i].id);
            if (contents?.length) await supabaseAdmin.from("lesson_contents").insert(contents.map((c: any) => ({ ...c, lesson_id: newId })));
          }
        }
      }
      res.json({ success: true, moduleId: newMod.id });
    } catch (e: any) {
      console.error("POST /api/teacher/modules/:id/duplicate", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // ── Re-generate audio/video download content for an existing lesson ───────
  app.post("/api/teacher/lessons/:id/regenerate-content", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const lessonId = req.params.id;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: lesson, error: lErr } = await supabaseAdmin.from("lessons").select("id,title,short_description,course_id").eq("id", lessonId).maybeSingle();
      if (lErr) throw lErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id));
      if (!gate.ok) return res.status(403).json({ error: "Access denied" });
      const title = String(lesson.title || "");
      const desc = String(lesson.short_description || "").split("\n")[0];
      const url = String(lesson.short_description || "").split("\n")[1] || "";
      const isAudioDL = title.includes("Audio");
      const isVideoDL = title.includes("Video") && !isAudioDL;
      if (!isAudioDL && !isVideoDL) return res.status(400).json({ error: "Not an audio/video download lesson" });
      const OUP_BASE = "https://elt.oup.com";
      const CC_STR = "?cc=global&selLanguage=en";
      const slugMatch = url.match(/\/student\/headway\/([^/?]+)\//);
      const levelSlug = slugMatch ? slugMatch[1] : (url.match(/headway_([a-z]+)_students/) ? "beg" : "preint4");
      const dlPage = `${OUP_BASE}/student/headway/${levelSlug}/download${CC_STR}`;
      const zipLink = url ? `<p style="margin:10px 0 4px;font-size:12px">or download directly:</p><a href="${url}" target="_blank" rel="noopener noreferrer" style="font-size:12px;font-weight:600;text-decoration:underline">⬇ Direct ZIP download</a>` : "";
      let html = "";
      if (isAudioDL) {
        html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #99f6e4;border-radius:16px;background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);text-align:center;font-family:system-ui,sans-serif"><div style="font-size:40px;margin-bottom:10px">🎧</div><p style="margin:0 0 4px;color:#0f766e;font-size:17px;font-weight:700">${title}</p><p style="margin:0 0 6px;color:#115e59;font-size:13px">${desc}</p><p style="margin:0 0 20px;color:#0d9488;font-size:12px;background:#ccfbf1;display:inline-block;padding:4px 12px;border-radius:99px;border:1px solid #5eead4">📦 MP3 audio files</p><br/><a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#0d9488;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">🔗 Open Downloads Page</a>${zipLink}<p style="margin:14px 0 0;color:#5eead4;font-size:11px">Oxford University Press · elt.oup.com</p></div>`;
      } else {
        html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #bae6fd;border-radius:16px;background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);text-align:center;font-family:system-ui,sans-serif"><div style="font-size:40px;margin-bottom:10px">🎬</div><p style="margin:0 0 4px;color:#0369a1;font-size:17px;font-weight:700">${title}</p><p style="margin:0 0 6px;color:#075985;font-size:13px">${desc}</p><p style="margin:0 0 20px;color:#0284c7;font-size:12px;background:#e0f2fe;display:inline-block;padding:4px 12px;border-radius:99px;border:1px solid #7dd3fc">📦 MP4 video clips</p><br/><a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#0284c7;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">🔗 Open Downloads Page</a>${zipLink}<p style="margin:14px 0 0;color:#7dd3fc;font-size:11px">Oxford University Press · elt.oup.com</p></div>`;
      }
      const { data: existing } = await supabaseAdmin.from("lesson_contents").select("id").eq("lesson_id", lessonId).maybeSingle();
      if (existing?.id) {
        await supabaseAdmin.from("lesson_contents").update({ text_content: html, content: html }).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("lesson_contents").insert({ lesson_id: lessonId, type: "text", content_type: "text", text_content: html, content: html, position: 1 });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("POST /api/teacher/lessons/:id/regenerate-content", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // ── Reset a student's progress (quiz attempts + lesson progress) ──────────
  app.post("/api/teacher/students/:studentId/reset-progress", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const studentId = req.params.studentId;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const courseId = typeof req.body?.courseId === "string" && req.body.courseId ? req.body.courseId.trim() : null;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: teacherCourses } = await supabaseAdmin.from("courses").select("id").eq("teacher_id", userId);
      const allowedIds = (teacherCourses || []).map((c: any) => String(c.id));
      if (courseId && !allowedIds.includes(courseId)) return res.status(403).json({ error: "Access denied" });
      const scopedCourseIds = courseId ? [courseId] : allowedIds;
      const { data: quizzes } = await supabaseAdmin.from("quizzes").select("id").in("course_id", scopedCourseIds);
      const quizIds = (quizzes || []).map((q: any) => String(q.id));
      let deletedAttempts = 0;
      if (quizIds.length) {
        const { data: d } = await supabaseAdmin.from("quiz_attempts").delete().eq("student_id", studentId).in("quiz_id", quizIds).select("id");
        deletedAttempts = d?.length ?? 0;
      }
      const { data: lessons } = await supabaseAdmin.from("lessons").select("id").in("course_id", scopedCourseIds);
      const lessonIds = (lessons || []).map((l: any) => String(l.id));
      let deletedProgress = 0;
      if (lessonIds.length) {
        const { data: d } = await supabaseAdmin.from("lesson_progress").delete().eq("student_id", studentId).in("lesson_id", lessonIds).select("id");
        deletedProgress = d?.length ?? 0;
      }
      res.json({ success: true, deletedAttempts, deletedProgress });
    } catch (e: any) {
      console.error("POST /api/teacher/students/:studentId/reset-progress", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // ── Suggestion 7: Per-module completion dashboard ────────────────────────
  app.get("/api/teacher/courses/:courseId/module-completion", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher role required" });
      }
      const courseId = String(req.params.courseId || "").trim();
      if (!courseId) return res.status(400).json({ error: "courseId is required" });

      const gate = await assertTeacherOwnsCourse(caller.userId, courseId);
      if (!gate.ok) return res.status(403).json({ error: "Access denied" });

      const [modulesRes, lessonsRes, courseRes] = await Promise.all([
        supabaseAdmin.from("modules").select("id, title, order").eq("course_id", courseId).order("order"),
        supabaseAdmin.from("lessons").select("id, module_id, title, status").eq("course_id", courseId).eq("status", "published"),
        supabaseAdmin.from("courses").select("id, student_ids").eq("id", courseId).maybeSingle(),
      ]);
      if (modulesRes.error) throw modulesRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      const modules = modulesRes.data || [];
      const lessons = lessonsRes.data || [];
      const studentIds: string[] = Array.isArray(courseRes.data?.student_ids)
        ? (courseRes.data.student_ids as string[]).filter(Boolean)
        : [];

      if (studentIds.length === 0 || lessons.length === 0) {
        return res.json({ success: true, modules, studentCount: studentIds.length, completion: [] });
      }

      // Fetch all profiles for students
      const profilesRes = await supabaseAdmin.from("profiles").select("id, display_name, email").in("id", studentIds);
      const profiles = (profilesRes.data || []) as Array<{ id: string; display_name: string; email: string }>;

      // Fetch all lesson progress for these lessons
      const lessonIds = lessons.map((l: any) => String(l.id));
      const progressRes = await supabaseAdmin
        .from("lesson_progress")
        .select("student_id, lesson_id, completed")
        .in("lesson_id", lessonIds)
        .in("student_id", studentIds);
      const progressRows = (progressRes.data || []) as Array<{ student_id: string; lesson_id: string; completed: boolean }>;

      // Build completion map: studentId -> lessonId -> completed
      const completionMap: Record<string, Record<string, boolean>> = {};
      for (const row of progressRows) {
        const sid = String(row.student_id);
        const lid = String(row.lesson_id);
        if (!completionMap[sid]) completionMap[sid] = {};
        completionMap[sid][lid] = Boolean(row.completed);
      }

      // Build lesson-to-module map
      const lessonToModule: Record<string, string> = {};
      for (const lesson of lessons) {
        if (lesson.module_id) lessonToModule[String(lesson.id)] = String(lesson.module_id);
      }

      // Build per-student, per-module completion
      const completion = profiles.map(profile => {
        const sid = profile.id;
        const studentProgress = completionMap[sid] || {};
        const modulesProgress = modules.map((mod: any) => {
          const modLessons = lessons.filter((l: any) => String(l.module_id) === String(mod.id));
          const completedCount = modLessons.filter((l: any) => studentProgress[String(l.id)]).length;
          return {
            moduleId: String(mod.id),
            moduleTitle: String(mod.title || ""),
            total: modLessons.length,
            completed: completedCount,
            percent: modLessons.length > 0 ? Math.round((completedCount / modLessons.length) * 100) : 0,
          };
        });
        const totalCompleted = modulesProgress.reduce((s, m) => s + m.completed, 0);
        const totalLessons = lessons.length;
        return {
          studentId: sid,
          studentName: String(profile.display_name || profile.email || sid),
          studentEmail: String(profile.email || ""),
          overallPercent: totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0,
          modules: modulesProgress,
        };
      });

      return res.json({ success: true, modules, studentCount: studentIds.length, completion });
    } catch (e: any) {
      console.error("GET /api/teacher/courses/:courseId/module-completion", e);
      return res.status(500).json({ error: e.message || "Server error" });
    }
  });

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
      const { course_id, module_id, title, slug, short_description, type, duration_minutes, order, status, is_free_preview, publish_at } = req.body;
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
        publish_at: publish_at ? new Date(publish_at).toISOString() : null,
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

  // Bulk-delete all modules (and their lessons/quizzes) for a course
  app.post("/api/teacher/courses/:courseId/clear-modules", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { courseId } = req.params;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const gate = await assertTeacherOwnsCourse(userId, courseId);
      if (!gate.ok) return res.status(403).json({ error: "Access denied" });

      // Fetch all module IDs for this course
      const { data: mods, error: mErr } = await supabaseAdmin
        .from("modules")
        .select("id")
        .eq("course_id", courseId);
      if (mErr) throw mErr;
      if (!mods || mods.length === 0) return res.json({ deleted: 0 });

      const moduleIds = mods.map((m: any) => m.id);

      // Delete lessons first (avoids FK issues if no cascade)
      await supabaseAdmin.from("lessons").delete().in("module_id", moduleIds);

      // Delete quizzes tied to those modules (if quiz table has module_id — silently ignore if column absent)
      try {
        await supabaseAdmin.from("quizzes").delete().in("module_id", moduleIds);
      } catch { /* module_id column may not exist on quizzes */ }

      // Delete the modules
      const { error: dErr } = await supabaseAdmin.from("modules").delete().in("id", moduleIds);
      if (dErr) throw dErr;

      res.json({ success: true, deleted: moduleIds.length });
    } catch (e: any) {
      console.error("POST /api/teacher/courses/:courseId/clear-modules", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // Headway auto-populate: creates modules + per-unit lessons with real Oxford exercise links
  app.post("/api/teacher/courses/:courseId/headway-populate", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { courseId } = req.params;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const level   = typeof req.body?.level  === "string" ? req.body.level.trim()  : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!level)  return res.status(400).json({ error: "level is required" });
      if (!canAccessTeacherCourses(caller, userId)) return res.status(403).json({ error: "Forbidden" });

      const gate = await assertTeacherOwnsCourse(userId, courseId);
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this course." });

      const rawOpts = req.body?.options ?? {};
      const includeGrammar       = rawOpts.grammar        !== false;
      const includeVocabulary    = rawOpts.vocabulary      !== false;
      const includeEverydayEnglish = rawOpts.everydayEnglish !== false;
      const includeAudioDownload = rawOpts.audioDownload   !== false;
      const includeVideoDownload = rawOpts.videoDownload   !== false;
      const includeTestBuilder   = rawOpts.testBuilder     !== false;

      const OUP = "https://elt.oup.com";
      const CC  = "?cc=global&selLanguage=en";
      // HEADWAY_FULL_DATA is imported from src/lib/headwayData.ts


      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown Headway level: "${level}". Valid: ${Object.keys(HEADWAY_FULL_DATA).join(", ")}` });

      const slugify = (s: string) => s.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();

      const wantStream = req.body?.stream === true;
      const total = levelData.units.length;

      // Helper: emit a Server-Sent Event line
      const emit = (obj: Record<string, unknown>) => {
        if (wantStream) res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      if (wantStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
      }

      let totalLessons = 0;
      let totalModules = 0;
      const unitModuleIds: string[] = [];

      // ── Process each unit individually so we can stream progress ─────────────
      for (let i = 0; i < levelData.units.length; i++) {
        const unit = levelData.units[i];

        emit({ type: "progress", unit: i + 1, total, title: unit.title, phase: "module" });

        // Insert module
        const { data: modRows, error: modErr } = await supabaseAdmin
          .from("modules")
          .insert([{
            course_id:   courseId,
            title:       unit.title,
            slug:        slugify(unit.title),
            description: unit.description,
            order:       i + 1,
            status:      "active",
          }])
          .select("id, order");

        if (modErr || !modRows?.length) {
          const msg = modErr ? [modErr.message, modErr.details, modErr.hint].filter(Boolean).join(" — ") : "Module not created";
          emit({ type: "error", message: msg });
          if (!wantStream) return res.status(400).json({ error: msg });
          res.end();
          return;
        }
        const mod = modRows[0];
        unitModuleIds[i] = String(mod.id);
        totalModules++;

        emit({ type: "progress", unit: i + 1, total, title: unit.title, phase: "lessons" });

        // Build lessons for this unit
        const lessonRows: Record<string, unknown>[] = [];
        const lessonUrls: string[] = [];
        let ord = 0;

        const hwTag = `\nheadway:${level}:${unit.num}`;
        if (includeGrammar) {
          for (const gr of unit.grammar) {
            const url = `${OUP}${gr.path}${CC}`;
            lessonRows.push({ course_id: courseId, module_id: mod.id, title: `Grammar: ${gr.topic}`, slug: slugify(`u${unit.num}-gr-${gr.topic}`), type: "text", short_description: `Oxford Headway exercise — ${gr.topic}\n${url}${hwTag}`, order: ++ord, status: "published", duration_minutes: 20, is_free_preview: ord === 1 });
            lessonUrls.push(url);
          }
        }
        if (includeVocabulary) {
          for (const vc of unit.vocabulary) {
            const url = `${OUP}${vc.path}${CC}`;
            lessonRows.push({ course_id: courseId, module_id: mod.id, title: `Vocabulary: ${vc.topic}`, slug: slugify(`u${unit.num}-vc-${vc.topic}`), type: "text", short_description: `Oxford Headway vocabulary — ${vc.topic}\n${url}${hwTag}`, order: ++ord, status: "published", duration_minutes: 15, is_free_preview: false });
            lessonUrls.push(url);
          }
        }
        if (includeEverydayEnglish) {
          const eeUrl = `${OUP}/student/headway/${levelData.slug}/everydayenglish/${unit.eeSlug}/${CC}`;
          lessonRows.push({ course_id: courseId, module_id: mod.id, title: "Everyday English", slug: slugify(`u${unit.num}-everyday-english`), type: "video", short_description: `Listen and practise dialogues from Unit ${unit.num}.\n${eeUrl}${hwTag}`, order: ++ord, status: "published", duration_minutes: 20, is_free_preview: false });
          lessonUrls.push(eeUrl);
        }
        if (includeAudioDownload && (unit as any).audioZip) {
          lessonRows.push({ course_id: courseId, module_id: mod.id, title: "Student's Book Audio — Download", slug: slugify(`u${unit.num}-audio`), type: "text", short_description: `Download Student's Book audio for Unit ${unit.num}.\n${(unit as any).audioZip}${hwTag}`, order: ++ord, status: "published", duration_minutes: 0, is_free_preview: false });
          lessonUrls.push((unit as any).audioZip);
        }
        if (includeVideoDownload && (unit as any).videoZip) {
          lessonRows.push({ course_id: courseId, module_id: mod.id, title: "Video — Download", slug: slugify(`u${unit.num}-video`), type: "video", short_description: `Download video for Unit ${unit.num}.\n${(unit as any).videoZip}${hwTag}`, order: ++ord, status: "published", duration_minutes: 0, is_free_preview: false });
          lessonUrls.push((unit as any).videoZip);
        }

        // Insert lessons for this unit
        const { data: createdLessons, error: lessonErr } = await supabaseAdmin.from("lessons").insert(lessonRows).select("id");
        if (lessonErr) {
          const msg = [lessonErr.message, lessonErr.details, lessonErr.hint].filter(Boolean).join(" — ");
          emit({ type: "error", message: msg || "Failed to create lessons" });
          if (!wantStream) return res.status(400).json({ error: msg });
          res.end();
          return;
        }
        totalLessons += lessonRows.length;

        // Lesson contents (best-effort) — rich cards per lesson type
        if (Array.isArray(createdLessons) && createdLessons.length > 0) {
          const contentRows = createdLessons.map((l: any, li: number) => {
            const url  = lessonUrls[li] || "";
            const lsn  = lessonRows[li] as any;
            const title = lsn?.title || "";
            const desc  = lsn?.short_description?.split("\n")[0] || "";

            // Determine card type from title / URL
            const isAudioDL   = title.includes("Audio") && url.endsWith(".zip");
            const isVideoDL   = title.includes("Video") && url.endsWith(".zip");
            const isEE        = title === "Everyday English";
            const isGrammar   = title.startsWith("Grammar:");
            const isVocab     = title.startsWith("Vocabulary:");

            let html = "";

            if (isAudioDL) {
              // ── 🎧 Audio Download — rich card with track listing ─────────────
              const dlPage = `${OUP}/student/headway/${levelData.slug}/audiodl${CC}`;
              const audioTracks = [
                { label: "Student's Book Audio", icon: "📗", desc: `All listening tracks for Unit ${unit.num} — dialogues, reading texts & exercises` },
                { label: "Pronunciation Practice", icon: "🎙️", desc: `Sounds, word stress & intonation drills from Unit ${unit.num}` },
                { label: "Listening Activities", icon: "🎵", desc: `Graded listening tasks and comprehension exercises` },
                { label: "Everyday English Dialogue", icon: "💬", desc: `Functional language & real-life conversation practice` },
              ];
              const trackRows = audioTracks.map(t =>
                `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#f0fdfa;border-radius:10px;border:1px solid #99f6e4;text-align:left">
  <span style="font-size:20px;line-height:1">${t.icon}</span>
  <div><p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#0f766e">${t.label}</p><p style="margin:0;font-size:11px;color:#115e59">${t.desc}</p></div>
</div>`).join("");
              html = `<div style="margin:0 auto;max-width:560px;padding:28px 24px;border:1.5px solid #99f6e4;border-radius:18px;background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);font-family:system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#0d9488,#0f766e);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">🎧</div>
    <div>
      <p style="margin:0 0 2px;color:#0f766e;font-size:17px;font-weight:800">${unit.title} — Audio Downloads</p>
      <p style="margin:0;color:#115e59;font-size:12px">Oxford Headway · Student's Book &amp; Workbook Audio · MP3</p>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    <span style="background:#ccfbf1;color:#0f766e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #5eead4">🎵 MP3 Format</span>
    <span style="background:#ccfbf1;color:#0f766e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #5eead4">📚 Unit ${unit.num}</span>
    <span style="background:#ccfbf1;color:#0f766e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #5eead4">🏫 Oxford University Press</span>
  </div>
  <div style="display:grid;gap:8px;margin-bottom:20px">${trackRows}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px">🔗 Open Audio Downloads</a>
    <a href="${url}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#fff;color:#0f766e;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px;border:2px solid #5eead4">⬇ Direct ZIP Download</a>
  </div>
  <p style="margin:14px 0 0;color:#5eead4;font-size:11px;text-align:center">Oxford University Press · elt.oup.com — for educational use</p>
</div>`;
            } else if (isVideoDL) {
              // ── 🎬 Video Download — rich card with content listing ────────────
              const dlPage = `${OUP}/student/headway/${levelData.slug}/video_bandw${CC}`;
              const videoItems = [
                { label: "Unit Video Clip", icon: "🎬", desc: `Main video for Unit ${unit.num} — watch & understand real-life situations` },
                { label: "Video Script", icon: "📄", desc: `Full transcript of the video dialogue for study and review` },
                { label: "Video Tasks", icon: "✏️", desc: `Comprehension questions and follow-up activities` },
                { label: "MP4 Download", icon: "💾", desc: `Download the video ZIP for offline classroom use` },
              ];
              const videoRows = videoItems.map(v =>
                `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;text-align:left">
  <span style="font-size:20px;line-height:1">${v.icon}</span>
  <div><p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#0369a1">${v.label}</p><p style="margin:0;font-size:11px;color:#075985">${v.desc}</p></div>
</div>`).join("");
              html = `<div style="margin:0 auto;max-width:560px;padding:28px 24px;border:1.5px solid #bae6fd;border-radius:18px;background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);font-family:system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#0284c7,#0369a1);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">🎬</div>
    <div>
      <p style="margin:0 0 2px;color:#0369a1;font-size:17px;font-weight:800">${unit.title} — Video Downloads</p>
      <p style="margin:0;color:#075985;font-size:12px">Oxford Headway · Classroom Video · MP4 &amp; Scripts</p>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #7dd3fc">🎥 MP4 Format</span>
    <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #7dd3fc">📚 Unit ${unit.num}</span>
    <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #7dd3fc">🏫 Oxford University Press</span>
  </div>
  <div style="display:grid;gap:8px;margin-bottom:20px">${videoRows}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px">▶ Open Video Page</a>
    <a href="${url}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#fff;color:#0369a1;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px;border:2px solid #7dd3fc">⬇ Direct ZIP Download</a>
  </div>
  <p style="margin:14px 0 0;color:#7dd3fc;font-size:11px;text-align:center">Oxford University Press · elt.oup.com — for educational use</p>
</div>`;
            } else if (isEE) {
              // ── 🎤 Everyday English ───────────────────────────────────────────
              html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #ddd6fe;border-radius:16px;background:linear-gradient(135deg,#faf5ff 0%,#ede9fe 100%);text-align:center;font-family:system-ui,sans-serif">
  <div style="font-size:40px;margin-bottom:10px">🎤</div>
  <p style="margin:0 0 4px;color:#6d28d9;font-size:17px;font-weight:700">Everyday English</p>
  <p style="margin:0 0 20px;color:#7c3aed;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">▶ Watch &amp; Listen</a>
  <p style="margin:14px 0 0;color:#c4b5fd;font-size:11px">Interactive dialogue · Oxford Headway Online</p>
</div>`;
            } else if (isGrammar) {
              // ── 📘 Grammar Exercise ───────────────────────────────────────────
              const topic = title.replace("Grammar: ", "");
              html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #c7d2fe;border-radius:16px;background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%);text-align:center;font-family:system-ui,sans-serif">
  <div style="font-size:40px;margin-bottom:10px">📘</div>
  <p style="margin:0 0 4px;color:#3730a3;font-size:17px;font-weight:700">Grammar: ${topic}</p>
  <p style="margin:0 0 20px;color:#4338ca;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Open Grammar Exercise →</a>
  <p style="margin:14px 0 0;color:#a5b4fc;font-size:11px">Interactive practice · Oxford Headway Online</p>
</div>`;
            } else if (isVocab) {
              // ── 🌿 Vocabulary Exercise ────────────────────────────────────────
              const topic = title.replace("Vocabulary: ", "");
              html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #bbf7d0;border-radius:16px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);text-align:center;font-family:system-ui,sans-serif">
  <div style="font-size:40px;margin-bottom:10px">🌿</div>
  <p style="margin:0 0 4px;color:#166534;font-size:17px;font-weight:700">Vocabulary: ${topic}</p>
  <p style="margin:0 0 20px;color:#15803d;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#16a34a;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Open Vocabulary Exercise →</a>
  <p style="margin:14px 0 0;color:#86efac;font-size:11px">Interactive practice · Oxford Headway Online</p>
</div>`;
            } else {
              // ── Generic fallback ──────────────────────────────────────────────
              const isZip = url.endsWith(".zip");
              html = `<div style="margin:0 auto;max-width:480px;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;text-align:center;font-family:system-ui,sans-serif">
  <p style="margin:0 0 8px;color:#334155;font-size:15px;font-weight:600">${title}</p>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#6366f1;color:#fff;padding:11px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">${isZip ? "⬇ Download ZIP" : "Open →"}</a>
</div>`;
            }

            return { lesson_id: l.id, type: "text", content_type: "text", text_content: html, content: html, position: 1 };
          });
          try { await supabaseAdmin.from("lesson_contents").insert(contentRows); } catch { /* best-effort */ }
        }

        emit({ type: "progress", unit: i + 1, total, title: unit.title, phase: "done" });
      }

      // ── Quizzes intentionally not created during headway-populate ────────────
      // Use the Smart Test Builder (/teacher/quizzes/test-builder) to create
      // targeted quizzes from specific grammar/vocabulary sections instead.
      if (false && includeTestBuilder) {
        emit({ type: "status", message: "Creating Test Builder quizzes with questions..." });

        // Helper: generate realistic MC questions from a unit's grammar + vocab topics
        const buildUnitQuestions = (u: HUnit): Record<string, unknown>[] => {
          const questions: Record<string, unknown>[] = [];
          let order = 0;

          // Grammar questions — one per grammar topic
          for (const gr of u.grammar) {
            const topic = gr.topic;
            const url = `${OUP}${gr.path}${CC}`;
            questions.push({
              text: `Which of the following best demonstrates correct use of "${topic}" from Unit ${u.num}?`,
              question_text: `Which of the following best demonstrates correct use of "${topic}" from Unit ${u.num}?`,
              type: "multiple-choice",
              options: JSON.stringify([
                `Practice exercise on "${topic}" — see Oxford Headway: ${url}`,
                `An incorrect form that ignores the rules of "${topic}"`,
                `A sentence that mixes "${topic}" with an incompatible tense`,
                `A phrase that avoids "${topic}" altogether`,
              ]),
              correct_answer: `0`,
              points: 1,
              explanation: `The correct answer links to the Oxford Headway interactive exercise on "${topic}". Visit: ${url}`,
              order: order++,
            });
          }

          // Vocabulary questions — one per vocab topic
          for (const vc of u.vocabulary) {
            const topic = vc.topic;
            const url = `${OUP}${vc.path}${CC}`;
            questions.push({
              text: `Which sentence uses vocabulary from the "${topic}" set in Unit ${u.num} correctly?`,
              question_text: `Which sentence uses vocabulary from the "${topic}" set in Unit ${u.num} correctly?`,
              type: "multiple-choice",
              options: JSON.stringify([
                `Correct use of a word from the "${topic}" group — practise here: ${url}`,
                `Incorrect word chosen from a different category`,
                `A synonym used in the wrong register or context`,
                `A word that looks similar but has a different meaning`,
              ]),
              correct_answer: `0`,
              points: 1,
              explanation: `The first option is correct. Review the "${topic}" vocabulary set at: ${url}`,
              order: order++,
            });
          }

          // Unit-level comprehension question (always included)
          questions.push({
            text: `What is the main topic of ${u.title}?`,
            question_text: `What is the main topic of ${u.title}?`,
            type: "multiple-choice",
            options: JSON.stringify([
              u.description,
              `A lesson about a completely different theme unrelated to ${u.title}`,
              `An advanced grammar topic not covered in this unit`,
              `A revision unit with no new content`,
            ]),
            correct_answer: `0`,
            points: 1,
            explanation: u.description,
            order: order++,
          });

          // Test Builder reference question
          const tbUrl = `${OUP}/student/headway/${levelData.slug}/testbuilder${CC}`;
          questions.push({
            text: `Where can you find the Oxford Headway Test Builder for ${u.title}?`,
            question_text: `Where can you find the Oxford Headway Test Builder for ${u.title}?`,
            type: "multiple-choice",
            options: JSON.stringify([
              tbUrl,
              `https://www.cambridge.org/elt/headway`,
              `https://www.bbc.co.uk/learningenglish`,
              `https://www.longman.com/english`,
            ]),
            correct_answer: `0`,
            points: 1,
            explanation: `Oxford Headway Test Builder is at: ${tbUrl}`,
            order: order++,
          });

          return questions;
        };

        // Insert quizzes one at a time so we can attach questions
        for (let qi = 0; qi < levelData.units.length; qi++) {
          const u = levelData.units[qi];
          emit({ type: "status", message: `Creating quiz for ${u.title}…` });

          const { data: quizData } = await insertCompatibleQuizAdmin({
            course_id: courseId,
            teacher_id: userId,
            module_id: unitModuleIds[qi] || null,
            title: `${u.title.replace(/^Unit \d+ — /, "")} — Test Builder`,
            description: `Grammar and vocabulary test for ${u.title}. Also open the Oxford Headway Test Builder: ${OUP}/student/headway/${levelData.slug}/testbuilder${CC}`,
            time_limit: 20,
            passing_score: 70,
            published: false,
            status: "draft",
          }, userId);

          if (!quizData?.id) {
            console.error("[headway-populate] quiz insert failed (all retries exhausted)");
            continue;
          }

          // Insert questions for this quiz
          const questionRows = buildUnitQuestions(u).map(q => ({ ...q, quiz_id: quizData.id }));
          if (questionRows.length > 0) {
            let { error: iqErr } = await supabaseAdmin.from("questions").insert(questionRows);
            // Fallback: drop the `text` field if the column doesn't exist in the schema
            if (iqErr && /question_text|null value.*text/i.test(iqErr.message + (iqErr.details || ""))) {
              const fallback = questionRows.map(q => {
                const r = { ...q } as Record<string, unknown>;
                delete r["text"];
                return r;
              });
              ({ error: iqErr } = await supabaseAdmin.from("questions").insert(fallback));
            }
            if (iqErr) console.error("[headway-populate] questions insert failed:", iqErr.message);
          }
        }
      }

      // ── Auto-update course level to match Headway level ─────────────────────
      try {
        await supabaseAdmin.from("courses").update({ level }).eq("id", courseId);
      } catch { /* non-critical — course level update is best-effort */ }

      // ── Persist sync timestamp to platform_config ─────────────────────────────
      const syncedAt = new Date().toISOString();
      try {
        await supabaseAdmin.from("platform_config").upsert(
          { section: `headway_sync:${courseId}`, value: { syncedAt, level, modules: totalModules, lessons: totalLessons }, updated_at: syncedAt },
          { onConflict: "section" }
        );
      } catch { /* non-critical */ }

      emit({ type: "done", modules: totalModules, lessons: totalLessons, level, syncedAt, success: true });

      if (wantStream) {
        res.end();
      } else {
        res.json({ success: true, modules: totalModules, lessons: totalLessons, level });
      }
    } catch (e: any) {
      console.error("POST /api/teacher/courses/:courseId/headway-populate", e);
      if (res.headersSent) { res.write(`data: ${JSON.stringify({ type: "error", message: e?.message || "Server error" })}\n\n`); res.end(); }
      else res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── POST /api/teacher/headway/save-unit-quiz — save one unit's Test Builder quiz to Supabase ──
  app.post("/api/teacher/headway/save-unit-quiz", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const userId   = typeof req.body?.userId   === "string" ? req.body.userId.trim()   : "";
      const courseId = typeof req.body?.courseId === "string" ? req.body.courseId.trim() : "";
      const level    = typeof req.body?.level    === "string" ? req.body.level.trim()    : "";
      const unitNum  = Number(req.body?.unitNum ?? 0);
      if (!userId)   return res.status(400).json({ error: "userId is required" });
      if (!courseId) return res.status(400).json({ error: "courseId is required" });
      if (!level)    return res.status(400).json({ error: "level is required" });
      if (!unitNum)  return res.status(400).json({ error: "unitNum is required" });
      if (!canAccessTeacherCourses(caller, userId)) return res.status(403).json({ error: "Forbidden" });

      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find(u => u.num === unitNum);
      if (!unit) return res.status(404).json({ error: `Unit ${unitNum} not found` });

      const OUP = "https://elt.oup.com";
      const CC  = "?cc=global&selLanguage=en";
      const tbUrl = `${OUP}/student/headway/${levelData.slug}/testbuilder${CC}`;

      // Insert quiz — compatible insert strips teacher_id / published if columns are absent
      const { data: quizData, error: quizErr } = await insertCompatibleQuizAdmin({
        course_id:     courseId,
        teacher_id:    userId,
        title:         `${unit.title.replace(/^Unit \d+ — /, "")} — Test Builder`,
        description:   `Grammar and vocabulary test for ${unit.title}. Also open the Oxford Headway Test Builder: ${tbUrl}\nheadway:${level}:${unitNum}`,
        time_limit:    20,
        passing_score: 70,
        published:     false,
        status:        "draft",
      }, userId);

      if (!quizData?.id) {
        const msg = quizErr ? (quizErr as any)?.message || String(quizErr) : "Quiz could not be created";
        return res.status(400).json({ error: msg });
      }

      // Build questions — try AI first, fall back to static bank
      const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      let questionRows: Record<string, unknown>[] = [];

      if (aiApiKey && (unit.grammar.length > 0 || unit.vocabulary.length > 0)) {
        try {
          const cefrMap: Record<string, string> = {
            "Beginner": "A1", "Elementary": "A2", "Pre-Intermediate": "B1",
            "Intermediate": "B1+", "Upper-Intermediate": "B2", "Advanced": "C1",
          };
          const cefr = cefrMap[level] || "B1";
          const topics = [
            ...unit.grammar.map(g => ({ type: "grammar" as const, topic: g.topic })),
            ...unit.vocabulary.map(v => ({ type: "vocabulary" as const, topic: v.topic })),
          ];
          const prompt = `You are an Oxford Headway English language test generator.
Level: ${level} (${cefr}) — ${unit.title}
Unit theme: ${unit.description}

Generate ONE fill-in-the-blank multiple-choice question for each topic below.
Each question must be a realistic English sentence with _____ (5 underscores) for the blank.
Provide 4 plausible options where exactly ONE is correct.

Topics:
${topics.map((t, i) => `${i + 1}. [${t.type}] ${t.topic}`).join("\n")}

Return ONLY a valid JSON array — no markdown, no code fences:
[{"topic":"...","type":"grammar","text":"She _____ to work.","options":["goes","is going","went","has gone"],"correct":0,"explanation":"..."}]`;

          const { GoogleGenAI } = await import("@google/genai");
          const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
          const ai = geminiBaseUrl
            ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } })
            : new GoogleGenAI({ apiKey: aiApiKey });
          const aiResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { temperature: 0.4 },
          });
          const raw = (aiResult.text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            questionRows = parsed
              .filter((q: any) => q && typeof q.text === "string" && Array.isArray(q.options))
              .map((q: any, idx: number) => {
                const correctIdx = Math.max(0, Math.min(3, Number(q.correct) || 0));
                const opts = (q.options as string[]).slice(0, 4);
                const correctText = opts[correctIdx];
                const shuffled = [...opts].sort(() => Math.random() - 0.5);
                const foundIdx = shuffled.indexOf(correctText);
                const safeIdx = foundIdx === -1 ? 0 : foundIdx;
                const optionObjects = shuffled.map((text, i) => ({ id: String(i + 1), text }));
                return {
                  quiz_id:        quizData.id,
                  type:           "multiple-choice",
                  text:           String(q.text),
                  question_text:  String(q.text),
                  options:        optionObjects,
                  correct_answer: String(safeIdx + 1),
                  explanation:    String(q.explanation || ""),
                  points:         1,
                  order:          idx,
                };
              });
          }
        } catch (aiErr: any) {
          console.warn("[save-unit-quiz] AI generation failed, using static bank:", aiErr?.message);
        }
      }

      // Fall back to static placeholder questions if AI didn't produce anything
      if (questionRows.length === 0) {
        questionRows = buildHwUnitQuestions(unit, levelData.slug).map((q, idx) => {
          const correctText = q.options[q.correctIndex];
          const shuffled = [...q.options].sort(() => Math.random() - 0.5);
          const foundIdx = shuffled.indexOf(correctText);
          const safeIdx = foundIdx === -1 ? 0 : foundIdx;
          const optionObjects = shuffled.map((text, i) => ({ id: String(i + 1), text }));
          return {
            quiz_id:        quizData.id,
            type:           "multiple-choice",
            text:           q.questionText,
            question_text:  q.questionText,
            options:        optionObjects,
            correct_answer: String(safeIdx + 1),
            explanation:    q.explanation,
            points:         1,
            order:          idx,
          };
        });
      }

      // Set points so total = 100 (e.g. 10 questions → 10 pts each)
      if (questionRows.length > 0) {
        const pointsEach = Math.round(100 / questionRows.length);
        questionRows = questionRows.map(r => ({ ...r, points: pointsEach }));
      }

      if (questionRows.length > 0) {
        let { error: iqErr } = await supabaseAdmin.from("questions").insert(questionRows);
        if (iqErr && /question_text|null value.*text/i.test(iqErr.message + (iqErr.details || ""))) {
          const fallback = questionRows.map(q => { const r = { ...q } as Record<string, unknown>; delete r["text"]; return r; });
          ({ error: iqErr } = await supabaseAdmin.from("questions").insert(fallback));
        }
        if (iqErr) console.warn("[save-unit-quiz] questions insert warning:", iqErr.message);
      }

      // Auto-update course level to match Headway level
      try {
        await supabaseAdmin.from("courses").update({ level }).eq("id", courseId);
      } catch { /* non-critical */ }

      return res.json({ success: true, quizId: quizData.id, questions: questionRows.length });
    } catch (e: any) {
      console.error("POST /api/teacher/headway/save-unit-quiz", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── GET /api/teacher/headway-preview — return MC questions for a unit (no DB writes) ──
  app.get("/api/teacher/headway-preview", (req: Request, res: Response) => {
    try {
      const level = typeof req.query.level === "string" ? req.query.level.trim() : "";
      const unitNum = parseInt(String(req.query.unit ?? "1"), 10);
      if (!level) return res.status(400).json({ error: "level query param required" });
      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find(u => u.num === unitNum);
      if (!unit) return res.status(404).json({ error: `Unit ${unitNum} not found for level "${level}"` });
      const questions = buildHwUnitQuestions(unit, levelData.slug);
      return res.json({ level, unit: unitNum, title: unit.title, description: unit.description, questions });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── POST /api/teacher/headway/generate-questions — AI generates real fill-in-the-blank questions ──
  app.post("/api/teacher/headway/generate-questions", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const level   = typeof req.body?.level   === "string" ? req.body.level.trim()        : "";
      const unitNum = Number(req.body?.unitNum ?? 0);
      if (!level)   return res.status(400).json({ error: "level is required" });
      if (!unitNum) return res.status(400).json({ error: "unitNum is required" });

      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find(u => u.num === unitNum);
      if (!unit)  return res.status(404).json({ error: `Unit ${unitNum} not found` });

      const apiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ error: "AI not configured — set GEMINI_API_KEY in Secrets." });

      const topics: Array<{ type: "grammar" | "vocabulary"; topic: string }> = [
        ...unit.grammar.map(g => ({ type: "grammar"    as const, topic: g.topic })),
        ...unit.vocabulary.map(v => ({ type: "vocabulary" as const, topic: v.topic })),
      ];

      if (topics.length === 0) {
        return res.json({ level, unitNum, title: unit.title, questions: [] });
      }

      const cefrMap: Record<string, string> = {
        "Beginner": "A1", "Elementary": "A2", "Pre-Intermediate": "B1",
        "Intermediate": "B1+", "Upper-Intermediate": "B2", "Advanced": "C1",
      };
      const cefr = cefrMap[level] || "B1";

      const prompt = `You are an Oxford Headway English language test generator.
Level: ${level} (${cefr}) — ${unit.title}
Unit theme: ${unit.description}

Generate ONE fill-in-the-blank multiple-choice question for each topic below.
Each question must be a realistic English sentence with _____ (5 underscores) for the blank.
Provide 4 plausible options where exactly ONE is correct. Use vocabulary and grammar appropriate for ${cefr} learners.

Topics:
${topics.map((t, i) => `${i + 1}. [${t.type}] ${t.topic}`).join("\n")}

Return ONLY a valid JSON array — no markdown, no code fences, no extra text:
[
  {
    "topic": "exact topic name from the list above",
    "type": "grammar",
    "text": "She _____ to work every day.",
    "options": ["goes", "is going", "went", "has gone"],
    "correct": 0,
    "explanation": "Use Present Simple for habits and routines."
  }
]

Rules:
- text must contain exactly one _____ (5 underscores)
- options must have exactly 4 items
- correct is the 0-based index of the correct option
- explanation is one concise sentence
- For vocabulary: test word choice, collocations, or meaning in context
- Make sentences natural, realistic and appropriate for the unit theme`;

      const { GoogleGenAI } = await import("@google/genai");
      const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
      const ai = geminiBaseUrl
        ? new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } })
        : new GoogleGenAI({ apiKey });

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.4 },
      });

      const raw = (result.text || "").trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

      let questions: unknown[];
      try {
        questions = JSON.parse(cleaned);
      } catch {
        console.error("[headway/generate-questions] JSON parse error. Raw:", cleaned.slice(0, 300));
        return res.status(500).json({ error: "AI returned invalid JSON. Please try again." });
      }

      if (!Array.isArray(questions)) {
        return res.status(500).json({ error: "AI did not return an array." });
      }

      // Sanitise each question — shuffle options so correct answer isn't always position 0
      const sanitised = questions
        .filter((q: any) => q && typeof q.text === "string" && Array.isArray(q.options))
        .map((q: any, idx: number) => {
          const correctIdx = Math.max(0, Math.min(3, Number(q.correct) || 0));
          const opts = (q.options as string[]).slice(0, 4);
          const correctText = opts[correctIdx];
          const shuffled = [...opts].sort(() => Math.random() - 0.5);
          const foundIdx = shuffled.indexOf(correctText);
          const safeIdx = foundIdx === -1 ? 0 : foundIdx;
          return {
            order:          idx,
            type:           q.type === "vocabulary" ? "vocabulary" : "grammar",
            topic:          String(q.topic || ""),
            questionText:   String(q.text || ""),
            text:           String(q.text || ""),
            options:        shuffled,
            correctIndex:   safeIdx,
            correct_answer: shuffled[safeIdx],
            explanation:    String(q.explanation || ""),
            oxfordUrl:      `${OUP}/student/headway/${levelData.slug}/testbuilder${CC}`,
          };
        });

      return res.json({ level, unitNum, title: unit.title, questions: sanitised });
    } catch (e: any) {
      console.error("POST /api/teacher/headway/generate-questions", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── GET /api/teacher/headway/media — list uploaded audio/video files for a unit ──
  app.get("/api/teacher/headway/media", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const levelSlug = typeof req.query.levelSlug === "string" ? req.query.levelSlug.trim() : "";
      const unitNum   = parseInt(String(req.query.unitNum ?? "0"), 10);
      if (!levelSlug || !unitNum) return res.status(400).json({ error: "levelSlug and unitNum required" });

      // Query the headway_media table (inserted during Drive import) using
      // case-insensitive level match so "Beginner" == "beginner" == "BEGINNER"
      const { data: rows, error } = await supabaseAdmin
        .from("headway_media")
        .select("title, file_name, url, mime_type, type")
        .ilike("level", levelSlug)
        .eq("unit_number", unitNum);

      if (error) {
        // Table may not exist yet — return empty list gracefully
        if (error.code === "42P01") return res.json({ files: [] });
        throw new Error(error.message);
      }

      const files = (rows ?? []).map((r: any) => ({
        name: r.file_name || r.title,
        path: r.url,
        url:  r.url,
        // Normalise type: student_audio / workbook_audio → "audio", video → "video"
        type: String(r.type || "").includes("video") ? "video" : "audio",
      }));

      return res.json({ files });
    } catch (e: any) {
      console.error("GET /api/teacher/headway/media", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── POST /api/teacher/headway/media/upload-url — get signed URL to upload a file ──
  app.post("/api/teacher/headway/media/upload-url", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const levelSlug = typeof req.body?.levelSlug === "string" ? req.body.levelSlug.trim() : "";
      const unitNum   = Number(req.body?.unitNum ?? 0);
      const type      = req.body?.type === "video" ? "video" : "audio";
      const rawName   = typeof req.body?.filename === "string" ? req.body.filename.trim() : "file";
      if (!levelSlug || !unitNum) return res.status(400).json({ error: "levelSlug and unitNum required" });

      // Sanitise filename
      const safe = rawName.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_");
      const storagePath = `${levelSlug}/${unitNum}/${type}/${safe}`;

      const { data, error } = await supabaseAdmin.storage
        .from("headway-media")
        .createSignedUploadUrl(storagePath);
      if (error || !data) {
        return res.status(500).json({ error: error?.message || "Could not create upload URL" });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
      return res.json({ signedUrl: data.signedUrl, path: storagePath, publicUrl });
    } catch (e: any) {
      console.error("POST /api/teacher/headway/media/upload-url", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── DELETE /api/teacher/headway/media — delete an uploaded media file ──
  app.delete("/api/teacher/headway/media", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const path = typeof req.body?.path === "string" ? req.body.path.trim() : "";
      if (!path) return res.status(400).json({ error: "path required" });
      // Safety: only allow paths inside headway-media bucket
      if (path.includes("..")) return res.status(400).json({ error: "Invalid path" });
      const { error } = await supabaseAdmin.storage.from("headway-media").remove([path]);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    } catch (e: any) {
      console.error("DELETE /api/teacher/headway/media", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── POST /api/teacher/headway/import-unit-audio — download OUP ZIP, extract & store files ──
  app.post("/api/teacher/headway/import-unit-audio", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const level     = typeof req.body?.level     === "string" ? req.body.level.trim()     : "";
      const levelSlug = typeof req.body?.levelSlug === "string" ? req.body.levelSlug.trim() : "";
      const unitNum   = Number(req.body?.unitNum ?? 0);
      const mediaType: "audio" | "video" = req.body?.type === "video" ? "video" : "audio";

      if (!level || !levelSlug || !unitNum) {
        return res.status(400).json({ error: "level, levelSlug, and unitNum are required" });
      }

      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level: ${level}` });

      const unit = levelData.units.find((u: HUnit) => u.num === unitNum);
      if (!unit) return res.status(400).json({ error: `Unit ${unitNum} not found in level ${level}` });

      const zipUrl: string | undefined = mediaType === "video" ? (unit as any).videoZip : (unit as any).audioZip;
      if (!zipUrl) return res.status(400).json({ error: `No ${mediaType} ZIP available for ${level} Unit ${unitNum}` });

      // Download the ZIP from OUP (publicly accessible, no auth)
      const zipRes = await fetch(zipUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Headway-Importer/1.0)" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!zipRes.ok) {
        return res.status(502).json({ error: `OUP server returned ${zipRes.status}: ${zipRes.statusText}` });
      }

      const zipBuffer = Buffer.from(await zipRes.arrayBuffer());

      // Extract files using unzipper
      const unzipper = _require("unzipper");
      const directory = await unzipper.Open.buffer(zipBuffer);

      const allowedExts = mediaType === "video"
        ? [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"]
        : [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];

      const mediaFiles: any[] = (directory.files as any[]).filter((f: any) => {
        if (f.type !== "File") return false;
        const ext = f.path.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
        return allowedExts.includes(ext);
      });

      if (mediaFiles.length === 0) {
        return res.status(422).json({ error: "No audio/video files found in the ZIP" });
      }

      const prefix = `${levelSlug}/${unitNum}/${mediaType}`;

      // Get already-uploaded files to skip re-uploading
      const { data: existing } = await supabaseAdmin.storage.from("headway-media").list(prefix);
      const existingNames = new Set((existing ?? []).map((f: any) => f.name));

      const results: { name: string; path: string; url: string; type: "audio" | "video" }[] = [];

      for (const file of mediaFiles) {
        const rawName = (file.path as string).split("/").pop() ?? file.path;
        const safe = rawName.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_");
        const storagePath = `${prefix}/${safe}`;

        if (existingNames.has(safe)) {
          // Already stored — just return public URL
          const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
          results.push({ name: safe, path: storagePath, url: publicUrl, type: mediaType });
          continue;
        }

        const content: Buffer = await file.buffer();
        const mimeType = mediaType === "video" ? "video/mp4" : "audio/mpeg";

        const { error: uploadErr } = await supabaseAdmin.storage
          .from("headway-media")
          .upload(storagePath, content, { contentType: mimeType, upsert: false });

        if (!uploadErr) {
          const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
          results.push({ name: safe, path: storagePath, url: publicUrl, type: mediaType });
        }
      }

      return res.json({ files: results, imported: results.length });
    } catch (e: any) {
      console.error("POST /api/teacher/headway/import-unit-audio", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── GET /api/teacher/headway/drive-config ────────────────────────────────
  app.get("/api/teacher/headway/drive-config", (_req: Request, res: Response) => {
    return res.json({ configured: Boolean(process.env.GOOGLE_API_KEY?.trim()) });
  });

  // ── POST /api/teacher/headway/drive-import/start ─────────────────────────
  app.post("/api/teacher/headway/drive-import/start", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) return res.status(403).json({ error: "Forbidden" });

      const apiKey = process.env.GOOGLE_API_KEY?.trim();
      if (!apiKey) return res.status(503).json({ error: "GOOGLE_API_KEY not configured in Replit Secrets" });

      const level    = String(req.body?.level    || "Beginner").trim();
      const courseId = typeof req.body?.courseId === "string" ? req.body.courseId.trim() : undefined;
      const jobId = `hw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const job: DriveImportJob = { status: "running", total: 0, done: 0, skipped: 0, errors: [], logs: [] };
      driveImportJobs.set(jobId, job);
      console.log(`[drive-import] Starting job ${jobId} for level="${level}"${courseId ? ` courseId=${courseId}` : ""}`);

      // Auto-ensure course_id column exists on headway_media (best-effort)
      try {
        await supabaseAdmin.rpc("exec_sql", {
          sql: "ALTER TABLE headway_media ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;"
        });
      } catch { /* ignore — column may already exist or exec_sql not available */ }

      // Choose level-specific folders; fall back to Beginner if level not configured
      const levelFolders = LEVEL_DRIVE_FOLDERS[level] ?? LEVEL_DRIVE_FOLDERS['Beginner'];
      job.logs.push(`📚 Level: ${level}${courseId ? " · linked to course" : ""} — ${Object.keys(levelFolders).length} folder(s) configured`);

      res.json({ jobId });

      // Run import in background (fire-and-forget)
      (async () => {
        for (const [type, folderId] of Object.entries(levelFolders)) {
          try {
            job.logs.push(`📂 Listing ${type} folder…`);
            const allEntries = await listDriveFolder(folderId, apiKey);

            // Separate ZIPs from plain media files
            const zipFiles   = allEntries.filter((f: any) => /\.zip$/i.test(f.name));
            const plainMedia = allEntries.filter((f: any) =>
              !f.name.toLowerCase().endsWith('.zip') &&
              f.mimeType !== 'application/vnd.google-apps.folder' &&
              MEDIA_EXTS.has((f.name.split('.').pop() || '').toLowerCase())
            );

            job.logs.push(`   ↳ ${zipFiles.length} ZIP(s), ${plainMedia.length} plain media file(s)`);

            // ── Process ZIP files ──────────────────────────────────────────
            for (const zipFile of zipFiles) {
              try {
                job.logs.push(`📦 Downloading ZIP: ${zipFile.name}…`);
                const zipBuf = await downloadDriveFileBuffer(zipFile.id, apiKey);
                job.logs.push(`   ↳ ${(zipBuf.length / 1024 / 1024).toFixed(1)} MB — extracting…`);
                await processZipEntries(zipBuf, zipFile.name, zipFile.id, type, level, job, courseId);
              } catch (err: any) {
                job.errors.push(`${zipFile.name}: ${err?.message}`);
                job.logs.push(`✗ ${zipFile.name}: ${err?.message}`);
              }
              await new Promise(r => setTimeout(r, 200));
            }

            // ── Process plain media files (non-ZIP) ────────────────────────
            for (const driveFile of plainMedia) {
              try {
                const compositeId = driveFile.id;
                const { data: existing } = await supabaseAdmin
                  .from('headway_media').select('id').eq('drive_file_id', compositeId).maybeSingle();
                if (existing) {
                  job.skipped++;
                  job.logs.push(`↷ Skip (exists): ${driveFile.name}`);
                  continue;
                }

                const unitNum = detectUnitNumber(driveFile.name);
                const ext = (driveFile.name.split('.').pop() || '').toLowerCase();
                const mime = mimeForExt(ext);

                // Download and re-upload to Supabase Storage
                const fileBuf = await downloadDriveFileBuffer(driveFile.id, apiKey);
                const safeName = driveFile.name.replace(/\s+/g, '_');
                const storagePath = `headway/${level}/${type}/unit${unitNum ?? 0}/${safeName}`;
                const { error: uploadErr } = await supabaseAdmin.storage
                  .from('headway-media')
                  .upload(storagePath, fileBuf, { contentType: mime, upsert: true });
                if (uploadErr) throw new Error(`Storage: ${uploadErr.message}`);

                const { data: { publicUrl } } = supabaseAdmin.storage.from('headway-media').getPublicUrl(storagePath);
                const title = safeName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim();

                const insertRow: Record<string, unknown> = {
                  level, unit_number: unitNum, type, title,
                  file_name: safeName, drive_file_id: compositeId,
                  url: publicUrl, mime_type: mime,
                  size_bytes: fileBuf.length,
                };
                if (courseId) insertRow.course_id = courseId;
                let insResult2 = await supabaseAdmin.from('headway_media').insert(insertRow);
                if (insertRow.course_id && isMissingColumnError(insResult2.error, 'course_id')) {
                  // course_id not yet visible in PostgREST schema cache — retry without it
                  const { course_id: _dropped, ...rowWithoutCourse } = insertRow;
                  insResult2 = await supabaseAdmin.from('headway_media').insert(rowWithoutCourse);
                }
                if (insResult2.error) {
                  if (insResult2.error.code === '42P01') throw new Error('headway_media table not found — run migration 014');
                  throw new Error(insResult2.error.message);
                }
                job.done++;
                job.total++;
                job.logs.push(`✓ ${driveFile.name}${unitNum ? ` → Unit ${unitNum}` : ''}`);
              } catch (err: any) {
                job.errors.push(`${driveFile.name}: ${err?.message}`);
                job.logs.push(`✗ ${driveFile.name}: ${err?.message}`);
              }
            }
          } catch (err: any) {
            job.errors.push(`${type}: ${err?.message}`);
            job.logs.push(`✗ Folder ${type}: ${err?.message}`);
          }
        }

        job.status = job.done === 0 && job.errors.length > 0 ? "error" : "done";
        job.logs.push(`🏁 Done — ${job.done} imported, ${job.skipped} skipped, ${job.errors.length} errors`);
        console.log(`[drive-import] Job ${jobId} finished — done=${job.done} skipped=${job.skipped} errors=${job.errors.length}`);
        if (job.errors.length > 0) console.warn('[drive-import] Errors:', job.errors.slice(0, 5).join(' | '));
      })().catch(err => {
        job.status = "error";
        job.errors.push(String(err?.message || err));
        job.logs.push(`✗ Fatal: ${err?.message}`);
        console.error(`[drive-import] Job ${jobId} fatal error:`, err?.message);
      });
    } catch (e: any) {
      console.error("POST /api/teacher/headway/drive-import/start", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── GET /api/teacher/headway/drive-import/:jobId — poll progress ──────────
  app.get("/api/teacher/headway/drive-import/:jobId", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const job = driveImportJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      return res.json(job);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message });
    }
  });

  // ── POST /api/teacher/headway/lessons-media-summary — batch summary per lesson ──
  // Supports two lookup strategies:
  //   1. lesson_id column (media explicitly linked to a lesson)
  //   2. headway:level:unit tag in lesson short_description (tag-based, for imported lessons)
  app.post("/api/teacher/headway/lessons-media-summary", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const lessonIds: string[] = Array.isArray(req.body?.lessonIds) ? req.body.lessonIds.slice(0, 200) : [];
      if (lessonIds.length === 0) return res.json({ summary: {} });

      const summary: Record<string, { audioCount: number; videoCount: number; level: string; unit: number | null }> = {};

      // ── Strategy 1: lesson_id column ────────────────────────────────────────
      const { data: byId, error: e1 } = await supabaseAdmin
        .from("headway_media")
        .select("lesson_id, type, level, unit_number")
        .in("lesson_id", lessonIds);

      if (e1 && e1.code !== "42P01") throw e1;

      for (const row of (byId ?? []) as any[]) {
        const lid = String(row.lesson_id || "");
        if (!lid) continue;
        if (!summary[lid]) summary[lid] = { audioCount: 0, videoCount: 0, level: row.level || "", unit: row.unit_number ?? null };
        if (String(row.type || "").includes("video")) summary[lid].videoCount++;
        else summary[lid].audioCount++;
      }

      // ── Strategy 2: headway:level:unit tag in short_description ─────────────
      // Only for lessons that weren't resolved via lesson_id
      const unresolved = lessonIds.filter(id => !summary[id]);
      if (unresolved.length > 0) {
        // Fetch short_descriptions for unresolved lessons
        const { data: lessonRows } = await supabaseAdmin
          .from("lessons")
          .select("id, short_description")
          .in("id", unresolved);

        // Group lessons by their "level:unit" tag
        const tagGroups = new Map<string, { level: string; unit: number; lessonIds: string[] }>();
        for (const row of (lessonRows ?? []) as any[]) {
          const desc = String(row.short_description || "");
          const m = desc.match(/headway:([^:\n\s]+):(\d+)/i);
          if (!m) continue;
          const lvl  = m[1].trim();
          const unit = parseInt(m[2], 10);
          const key  = `${lvl.toLowerCase()}:${unit}`;
          if (!tagGroups.has(key)) tagGroups.set(key, { level: lvl, unit, lessonIds: [] });
          tagGroups.get(key)!.lessonIds.push(String(row.id));
        }

        // For each tag group, count media from headway_media
        for (const { level: lvl, unit, lessonIds: lids } of tagGroups.values()) {
          const { data: mediaRows } = await supabaseAdmin
            .from("headway_media")
            .select("type, level")
            .ilike("level", lvl)
            .eq("unit_number", unit);

          if (!mediaRows?.length) continue;

          let audioCount = 0, videoCount = 0;
          for (const mr of mediaRows as any[]) {
            if (String(mr.type || "").includes("video")) videoCount++;
            else audioCount++;
          }
          if (audioCount === 0 && videoCount === 0) continue;

          const levelDisplay = (mediaRows[0] as any).level || lvl;
          for (const lid of lids) {
            summary[lid] = { audioCount, videoCount, level: levelDisplay, unit };
          }
        }
      }

      return res.json({ summary });
    } catch (e: any) {
      console.error("POST /api/teacher/headway/lessons-media-summary", e);
      return res.status(500).json({ error: e?.message });
    }
  });

  // ── GET /api/teacher/headway/lesson-media/:lessonId — media linked to a lesson ──
  app.get("/api/teacher/headway/lesson-media/:lessonId", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const lessonId = String(req.params.lessonId || '').trim();
      if (!lessonId) return res.status(400).json({ error: 'lessonId required' });

      // First try to get media linked by lesson_id
      const { data: byLesson, error: e1 } = await supabaseAdmin
        .from("headway_media")
        .select("id, title, file_name, url, mime_type, type, level, unit_number")
        .eq("lesson_id", lessonId)
        .order("type", { ascending: true })
        .order("file_name", { ascending: true });

      if (e1 && e1.code !== "42P01") throw e1;

      // Also check lesson short_description for headway:levelSlug:unitNum tag
      const { data: lessonRow } = await supabaseAdmin
        .from("lessons")
        .select("short_description")
        .eq("id", lessonId)
        .maybeSingle();

      let byUnit: any[] = [];
      const desc = String((lessonRow as any)?.short_description || '');
      const hwMatch = desc.match(/headway:([^:\n]+):(\d+)/i);
      if (hwMatch) {
        const levelSlug = hwMatch[1].trim();
        const unitNum   = parseInt(hwMatch[2], 10);
        const { data: unitRows } = await supabaseAdmin
          .from("headway_media")
          .select("id, title, file_name, url, mime_type, type, level, unit_number")
          .ilike("level", levelSlug)
          .eq("unit_number", unitNum)
          .order("type", { ascending: true })
          .order("file_name", { ascending: true });
        byUnit = unitRows ?? [];
      }

      // Merge, deduplicate by id
      const allRows = [...(byLesson ?? []), ...byUnit];
      const seen = new Set<string>();
      const files = allRows
        .filter((r: any) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
        .map((r: any) => ({
          id: r.id,
          name: r.file_name || r.title || 'Media',
          url: r.url,
          type: String(r.type || '').includes('video') ? 'video' : 'audio',
          mime_type: r.mime_type,
          level: r.level,
          unit_number: r.unit_number,
        }));

      return res.json({ files });
    } catch (e: any) {
      console.error("GET /api/teacher/headway/lesson-media", e);
      return res.status(500).json({ error: e?.message });
    }
  });

  // ── GET /api/teacher/headway/drive-media — list imported Drive media ──────
  app.get("/api/teacher/headway/drive-media", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const level    = typeof req.query.level    === "string" ? req.query.level    : "Beginner";
      const unitNum  = req.query.unit  ? parseInt(String(req.query.unit), 10)  : undefined;
      const type     = typeof req.query.type     === "string" ? req.query.type     : undefined;
      const courseId = typeof req.query.courseId === "string" ? req.query.courseId.trim() : undefined;

      let q = supabaseAdmin
        .from("headway_media")
        .select("*")
        .eq("level", level)
        .order("unit_number", { ascending: true, nullsFirst: false })
        .order("file_name",   { ascending: true });

      if (unitNum)  q = (q as any).eq("unit_number", unitNum);
      if (type)     q = (q as any).eq("type", type);
      if (courseId) q = (q as any).eq("course_id", courseId);

      const { data, error } = await q;
      if (error) {
        if (error.code === "42P01") return res.json({ media: [] }); // table not yet created
        if (isMissingColumnError(error, "course_id")) return res.json({ media: [] }); // column not in cache yet
        throw error;
      }
      return res.json({ media: data ?? [] });
    } catch (e: any) {
      console.error("GET /api/teacher/headway/drive-media", e);
      return res.status(500).json({ error: e?.message });
    }
  });

  // ── DELETE /api/teacher/headway/drive-media/:id ────────────────────────────
  app.delete("/api/teacher/headway/drive-media/:id", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const { error } = await supabaseAdmin.from("headway_media").delete().eq("id", req.params.id);
      if (error) throw error;
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message });
    }
  });

  // ── DELETE /api/teacher/headway/drive-media — bulk delete all media (optionally by level) ──
  app.delete("/api/teacher/headway/drive-media", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) return res.status(403).json({ error: "Forbidden" });

      const level = typeof req.query.level === "string" ? req.query.level.trim() : "";

      let query = supabaseAdmin.from("headway_media").delete();
      if (level) {
        query = (query as any).ilike("level", level);
      } else {
        // Delete all — require explicit confirmation header
        const confirm = req.headers["x-confirm-delete-all"];
        if (confirm !== "yes") {
          return res.status(400).json({ error: "Pass header x-confirm-delete-all: yes to delete all media" });
        }
        query = (query as any).neq("id", "00000000-0000-0000-0000-000000000000"); // match all rows
      }

      const { error, count } = await (query as any).select("id", { count: "exact", head: true });
      // Re-run actual delete
      let delQuery = supabaseAdmin.from("headway_media").delete();
      if (level) {
        delQuery = (delQuery as any).ilike("level", level);
      } else {
        delQuery = (delQuery as any).neq("id", "00000000-0000-0000-0000-000000000000");
      }
      const { error: delErr } = await delQuery;
      if (delErr) throw delErr;

      return res.json({ success: true, level: level || "all" });
    } catch (e: any) {
      console.error("DELETE /api/teacher/headway/drive-media (bulk)", e);
      return res.status(500).json({ error: e?.message });
    }
  });

  // ── GET /api/teacher/headway/drive-stream/:fileId — proxy Drive file ───────
  app.get("/api/teacher/headway/drive-stream/:fileId", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const fileId = String(req.params.fileId || "").trim();
      if (!fileId) return res.status(400).json({ error: "fileId required" });

      const apiKey = process.env.GOOGLE_API_KEY?.trim();
      const downloadUrl = apiKey
        ? `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&key=${apiKey}`
        : `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

      const reqHeaders: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
      if (req.headers.range) reqHeaders["Range"] = req.headers.range;

      const driveRes = await fetch(downloadUrl, { headers: reqHeaders, redirect: "follow" });

      if (!driveRes.ok && driveRes.status !== 206) {
        return res.status(driveRes.status).json({ error: `Drive returned ${driveRes.status}` });
      }

      const ct = driveRes.headers.get("content-type") || "application/octet-stream";
      const cl = driveRes.headers.get("content-length");
      const cr = driveRes.headers.get("content-range");

      res.setHeader("Content-Type", ct);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (cl) res.setHeader("Content-Length", cl);
      if (cr) res.setHeader("Content-Range", cr);
      if (req.headers.range) res.status(206);

      if (!driveRes.body) return res.status(500).json({ error: "No body from Drive" });

      // Stream response body to client
      const reader = driveRes.body.getReader();
      const pump = (): void => {
        reader.read().then(({ done, value }) => {
          if (done) { res.end(); return; }
          res.write(Buffer.from(value));
          pump();
        }).catch(() => { try { res.end(); } catch { /**/ } });
      };
      pump();
    } catch (e: any) {
      console.error("GET /api/teacher/headway/drive-stream", e);
      if (!res.headersSent) res.status(500).json({ error: e?.message });
    }
  });

  // ── POST /api/teacher/exams/:id/generate-ai-questions — generate exam questions via Gemini ──
  app.post("/api/teacher/exams/:id/generate-ai-questions", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const examId = req.params.id?.trim();
      if (!examId) return res.status(400).json({ error: "examId is required" });

      const topic    = typeof req.body?.topic    === "string" ? req.body.topic.trim()    : "";
      const level    = typeof req.body?.level    === "string" ? req.body.level.trim()    : "intermediate";
      const count    = Math.min(30, Math.max(1, parseInt(req.body?.count  ?? "10", 10)));
      const language = typeof req.body?.language === "string" ? req.body.language.trim() : "English";

      if (!topic) return res.status(400).json({ error: "topic is required" });

      const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();

      // ── No API key → fall back to the same static bank as the Smart Test Builder ──
      if (!aiApiKey) {
        // Normalise level to Headway bank casing
        const levelMap: Record<string, string> = {
          beginner: "Beginner",
          elementary: "Elementary",
          "pre-intermediate": "Pre-Intermediate",
          intermediate: "Intermediate",
          "upper-intermediate": "Upper-Intermediate",
          advanced: "Advanced",
        };
        const normLevel = levelMap[level.toLowerCase()] ?? "Intermediate";

        // Pull questions from the static bank — getQuestionsForSection does fuzzy
        // topic matching and falls back to template questions if no match.
        let staticQs = getQuestionsForSection(normLevel, topic, count);

        // If the matched section has fewer questions than requested, pad from other
        // sections of the same level (shuffle each section before sampling, deduplicate by text).
        if (staticQs.length < count) {
          const usedTexts = new Set(staticQs.map(q => q.text));
          const levelSections = HEADWAY_QUESTIONS[normLevel] ?? [];
          // Shuffle the section list so we don't always pick the same padding sections
          const shuffledSections = [...levelSections].sort(() => Math.random() - 0.5);
          for (const sec of shuffledSections) {
            if (staticQs.length >= count) break;
            const shuffledPool = [...sec.questions].sort(() => Math.random() - 0.5);
            for (const q of shuffledPool) {
              if (staticQs.length >= count) break;
              if (!usedTexts.has(q.text)) {
                usedTexts.add(q.text);
                staticQs = [...staticQs, q];
              }
            }
          }
        }

        if (staticQs.length === 0) {
          return res.status(400).json({ error: "No questions available for this topic. Please add a GEMINI_API_KEY to generate custom questions." });
        }

        const valid = staticQs.map((q, i) => {
          // Save correct answer text before shuffling options
          const correctText = q.options[q.correct] ?? q.options[0];
          // Shuffle the answer options so correct isn't always first
          const shuffledOpts = [...q.options].sort(() => Math.random() - 0.5);
          return {
            text: q.text,
            options: shuffledOpts,
            correct_answer: correctText,
            explanation: q.explanation || "",
            order: i,
            points: 1,
          };
        });

        console.log(`[exam-builder] Static bank fallback: ${valid.length} questions for topic="${topic}" level="${normLevel}"`);
        return res.json({ questions: valid });
      }

      const prompt = `You are an expert English language exam writer.
Generate exactly ${count} multiple-choice questions for the following exam topic.

Topic: ${topic}
Difficulty level: ${level}
Language for question text and options: ${language}

Rules:
- Each question must have exactly 4 answer options (A, B, C, D).
- Exactly one option must be correct.
- Questions must test real language understanding, vocabulary, or grammar skills.
- Do NOT number the questions in the text field.
- Return ONLY valid JSON — no explanation, no markdown fences.

JSON format (array of objects):
[
  {
    "text": "<question text>",
    "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
    "correct_answer": "<the correct option text, must exactly match one of the options>",
    "explanation": "<brief reason why this is correct>"
  }
]`;

      const { GoogleGenAI } = await import("@google/genai");
      const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
      const ai = geminiBaseUrl
        ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } })
        : new GoogleGenAI({ apiKey: aiApiKey });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.7, maxOutputTokens: 8192 },
      });

      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      let questions: any[] = [];
      try {
        questions = JSON.parse(cleaned);
        if (!Array.isArray(questions)) throw new Error("Not an array");
      } catch {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) questions = JSON.parse(match[0]);
        else return res.status(502).json({ error: "AI returned invalid JSON", raw: cleaned.slice(0, 500) });
      }

      // Validate & sanitise
      const valid = questions
        .filter(q => q && typeof q.text === "string" && Array.isArray(q.options) && q.options.length >= 2)
        .slice(0, count)
        .map((q: any, i: number) => ({
          text: q.text,
          options: q.options.slice(0, 4),
          correct_answer: q.correct_answer || q.options[0],
          explanation: q.explanation || "",
          order: i,
          points: 1,
        }));

      return res.json({ questions: valid });
    } catch (e: any) {
      console.error("POST /api/teacher/exams/:id/generate-ai-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to generate questions" });
    }
  });

  // ── POST /api/teacher/exams/question-counts — count questions per exam id (bypasses RLS) ──
  app.post("/api/teacher/exams/question-counts", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === "string") : [];
      if (ids.length === 0) return res.json({ counts: {} });

      const { data, error } = await supabaseAdmin
        .from("questions")
        .select("quiz_id")
        .in("quiz_id", ids);
      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach((r: { quiz_id: string }) => {
        if (r?.quiz_id) counts[r.quiz_id] = (counts[r.quiz_id] || 0) + 1;
      });
      return res.json({ counts });
    } catch (e: any) {
      console.error("POST /api/teacher/exams/question-counts", e);
      return res.status(500).json({ error: e?.message || "Failed to count questions" });
    }
  });

  // ── POST /api/teacher/exams/:id/save-questions — save exam questions via service role (bypasses RLS) ──
  app.post("/api/teacher/exams/:id/save-questions", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const examId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!examId) return res.status(400).json({ error: "Exam id is required" });

      const rows = (req.body as { questions?: unknown })?.questions;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "Body must include questions: []" });
      }

      // Verify the exam exists — teacher_id column may not exist in all deployments, so select only id
      const { data: examRow, error: examErr } = await supabaseAdmin
        .from("quizzes")
        .select("id")
        .eq("id", examId)
        .maybeSingle();
      if (examErr) throw examErr;
      if (!examRow?.id) return res.status(404).json({ error: "Exam not found." });

      // Delete existing questions then insert new ones via service role — bypasses RLS
      const { error: delErr } = await supabaseAdmin.from("questions").delete().eq("quiz_id", examId);
      if (delErr) throw delErr;

      if (rows.length === 0) return res.json({ success: true });

      const qtext = (r: Record<string, unknown>) => {
        const raw = r.text ?? r.question_text;
        if (typeof raw === "string" && raw.trim()) return raw.trim();
        return " ";
      };

      const buildRows = (mode: "text" | "question_text" | "both") =>
        rows.map((r: Record<string, unknown>, idx: number) => {
          const t = qtext(r);
          const row: Record<string, unknown> = {
            quiz_id: examId,
            type: "multiple-choice",
            options: r.options ?? null,
            correct_answer: r.correct_answer ?? null,
            explanation: r.explanation ?? null,
            points: (() => { const n = Number(r.points); return Number.isFinite(n) ? n : 1; })(),
            order: typeof r.order === "number" ? r.order : idx,
          };
          if (mode === "both") { row.text = t; row.question_text = t; }
          else { row[mode] = t; }
          return row;
        });

      const errStr = (e: any) => e ? [e.message, e.details, e.hint, e.code].filter(Boolean).join(" — ") : "";

      let { error: insErr } = await supabaseAdmin.from("questions").insert(buildRows("text"));

      // If "text" column doesn't exist, retry with "question_text"
      if (insErr && (/question_text/i.test(errStr(insErr)) || /null value[^\n]*question_text/i.test(errStr(insErr)) || /column[^\n]*\btext\b.*does not exist/i.test(errStr(insErr)))) {
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(buildRows("question_text")));
      }

      // If neither alone works, try both columns
      if (insErr && (/null value[^\n]*\btext\b/i.test(errStr(insErr)) || /column[^\n]*question_text.*does not exist/i.test(errStr(insErr)))) {
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(buildRows("both")));
      }

      if (insErr) {
        const msg = [insErr.message, insErr.details, insErr.hint].filter(Boolean).join(" — ") || "Insert failed";
        return res.status(400).json({ error: msg });
      }

      return res.json({ success: true, count: rows.length });
    } catch (e: any) {
      console.error("POST /api/teacher/exams/:id/save-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to save questions" });
    }
  });

  // ── POST /api/teacher/headway/regenerate-quiz — replace all questions for a saved Headway quiz with fresh AI ones ──
  app.post("/api/teacher/headway/regenerate-quiz", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const quizId = typeof req.body?.quizId === "string" ? req.body.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "quizId is required" });

      // Load quiz to get level + unitNum from description tag
      const { data: quiz, error: qErr } = await supabaseAdmin
        .from("quizzes").select("id, description").eq("id", quizId).maybeSingle();
      if (qErr || !quiz) return res.status(404).json({ error: "Quiz not found" });

      const match = String(quiz.description || "").match(/headway:([^:\n]+):(\d+)/);
      if (!match) return res.status(400).json({ error: "Quiz is not a Headway unit quiz" });

      const level   = match[1];
      const unitNum = parseInt(match[2], 10);

      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find(u => u.num === unitNum);
      if (!unit)  return res.status(404).json({ error: `Unit ${unitNum} not found` });

      const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      if (!aiApiKey) return res.status(503).json({ error: "AI not configured — set GEMINI_API_KEY in Secrets." });

      const cefrMap: Record<string, string> = {
        "Beginner": "A1", "Elementary": "A2", "Pre-Intermediate": "B1",
        "Intermediate": "B1+", "Upper-Intermediate": "B2", "Advanced": "C1",
      };
      const cefr = cefrMap[level] || "B1";
      const topics = [
        ...unit.grammar.map(g => ({ type: "grammar" as const, topic: g.topic })),
        ...unit.vocabulary.map(v => ({ type: "vocabulary" as const, topic: v.topic })),
      ];
      if (topics.length === 0) return res.status(400).json({ error: "Unit has no grammar/vocabulary topics" });

      const prompt = `You are an Oxford Headway English language test generator.
Level: ${level} (${cefr}) — ${unit.title}
Unit theme: ${unit.description}

Generate ONE fill-in-the-blank multiple-choice question for each topic below.
Each question must be a realistic English sentence with _____ (5 underscores) for the blank.
Provide 4 plausible options where exactly ONE is correct. Use vocabulary and grammar appropriate for ${cefr} learners.

Topics:
${topics.map((t, i) => `${i + 1}. [${t.type}] ${t.topic}`).join("\n")}

Return ONLY a valid JSON array — no markdown, no code fences, no extra text:
[
  {
    "topic": "exact topic name from the list above",
    "type": "grammar",
    "text": "She _____ to work every day.",
    "options": ["goes", "is going", "went", "has gone"],
    "correct": 0,
    "explanation": "Use Present Simple for habits and routines."
  }
]

Rules:
- text must contain exactly one _____ (5 underscores)
- options must have exactly 4 items
- correct is the 0-based index of the correct option
- explanation is one concise sentence`;

      const { GoogleGenAI } = await import("@google/genai");
      const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
      const ai = geminiBaseUrl
        ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } })
        : new GoogleGenAI({ apiKey: aiApiKey });

      const aiResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.5 },
      });

      const raw = (aiResult.text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      let parsed: unknown[];
      try { parsed = JSON.parse(raw); }
      catch { return res.status(500).json({ error: "AI returned invalid JSON. Please try again." }); }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return res.status(500).json({ error: "AI did not return valid questions." });
      }

      const rawRows = parsed
        .filter((q: any) => q && typeof q.text === "string" && Array.isArray(q.options))
        .map((q: any, idx: number) => {
          const correctIdx = Math.max(0, Math.min(3, Number(q.correct) || 0));
          const opts = (q.options as string[]).slice(0, 4);
          const correctText = opts[correctIdx];
          const shuffled = [...opts].sort(() => Math.random() - 0.5);
          const foundIdx = shuffled.indexOf(correctText);
          const safeIdx = foundIdx === -1 ? 0 : foundIdx;
          const optionObjects = shuffled.map((text, i) => ({ id: String(i + 1), text }));
          return {
            quiz_id:        quizId,
            type:           "multiple-choice",
            text:           String(q.text),
            question_text:  String(q.text),
            options:        optionObjects,
            correct_answer: String(safeIdx + 1),
            explanation:    String(q.explanation || ""),
            points:         1,
            order:          idx,
          };
        });
      const pointsEach = rawRows.length > 0 ? Math.round(100 / rawRows.length) : 10;
      const newRows = rawRows.map(r => ({ ...r, points: pointsEach }));

      // Delete old questions and insert new ones
      await supabaseAdmin.from("questions").delete().eq("quiz_id", quizId);
      let { error: insErr } = await supabaseAdmin.from("questions").insert(newRows);
      if (insErr && /question_text|null value.*text/i.test(insErr.message + (insErr.details || ""))) {
        const fallback = newRows.map(r => { const x = { ...r } as Record<string, unknown>; delete x["text"]; return x; });
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(fallback));
      }
      if (insErr) {
        console.warn("[regenerate-quiz] insert warning:", insErr.message);
        return res.status(500).json({ error: insErr.message });
      }

      return res.json({ success: true, quizId, questions: newRows.length, level, unitNum });
    } catch (e: any) {
      console.error("POST /api/teacher/headway/regenerate-quiz", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  // ── GET /api/teacher/headway/saved-quizzes — list units that already have a saved quiz ──
  app.get("/api/teacher/headway/saved-quizzes", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      // Fetch all quizzes whose description contains the headway tag
      const { data: quizzes } = await supabaseAdmin
        .from("quizzes")
        .select("id, description")
        .ilike("description", "%headway:%");

      const saved: { level: string; unitNum: number; quizId: string }[] = [];
      for (const quiz of quizzes ?? []) {
        const match = String(quiz.description || "").match(/headway:([^:\n]+):(\d+)/);
        if (match) {
          saved.push({ level: match[1], unitNum: parseInt(match[2], 10), quizId: quiz.id });
        }
      }
      return res.json({ saved });
    } catch (e: any) {
      console.error("GET /api/teacher/headway/saved-quizzes", e);
      return res.status(500).json({ error: e?.message || "Server error" });
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
      if ('publish_at' in req.body) updates.publish_at = req.body.publish_at ? new Date(req.body.publish_at).toISOString() : null;
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
      rawType === 'video' || rawType === 'audio' || rawType === 'pdf' || rawType === 'text' || rawType === 'link'
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

      // Generate signed URLs for media files (same as student API)
      const contentRows = normalizeLessonContentRows(contentsRes.data || []).map((row: any) => ({
        ...row,
        signed_url: typeof row?.storage_path === 'string' && /^https?:\/\//i.test(row.storage_path)
          ? row.storage_path
          : null,
      }));
      await ensureLessonMediaBucket();
      for (const row of contentRows) {
        const path = String(row?.storage_path || '').trim();
        if (!path || /^https?:\/\//i.test(path)) continue;
        const signed = await supabaseAdmin.storage.from('lesson-media').createSignedUrl(path, 3600);
        row.signed_url = signed.error ? null : signed.data?.signedUrl || null;
      }

      return res.json({
        success: true,
        contents: contentRows,
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
      const normalizedRow: any = normalizeLessonContentRow(upd.data, 0);
      // Generate signed URL for media files
      const storagePath = String(normalizedRow?.storage_path || '').trim();
      if (storagePath && !/^https?:\/\//i.test(storagePath)) {
        await ensureLessonMediaBucket();
        const signed = await supabaseAdmin.storage.from('lesson-media').createSignedUrl(storagePath, 3600);
        normalizedRow.signed_url = signed.error ? null : signed.data?.signedUrl || null;
      } else if (/^https?:\/\//i.test(storagePath)) {
        normalizedRow.signed_url = storagePath;
      }
      return res.json({ success: true, content: normalizedRow });
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

      // Validate content type and file size before issuing a signed URL
      const ALLOWED_CONTENT_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'video/mp4', 'video/webm', 'video/ogg',
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
        'application/pdf',
        'text/plain', 'text/html',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint',
      ];
      const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return res.status(400).json({ error: `File type not allowed: ${contentType}` });
      }
      const fileSize = typeof req.body?.fileSize === 'number' ? req.body.fileSize : null;
      if (fileSize !== null && fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'File exceeds maximum allowed size of 500 MB.' });
      }

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
      const analyticsStartedAt = Date.now();
      const adminAnalyticsCacheKey = "admin-analytics:global";
      const cachedAdminAnalytics = getCachedApiResponse<any>(adminAnalyticsCacheKey);
      if (cachedAdminAnalytics) return res.json(cachedAdminAnalytics);

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

      const payload = {
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
      };
      setCachedApiResponse(adminAnalyticsCacheKey, payload, 300_000);
      const durationMs = Date.now() - analyticsStartedAt;
      if (durationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(
          `[perf] slow admin analytics duration=${durationMs}ms profiles=${profiles.length} courses=${courses.length} classes=${classes.length} attempts=${attempts.length}`,
        );
      }
      res.json(payload);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── REPORTS ─────────────────────────────────────────────────
  app.get('/api/admin/reports/students', async (req, res) => {
    try {
      const rptStudentsCacheKey = 'admin-reports:students';
      const rptStudentsCached = getCachedApiResponse<any>(rptStudentsCacheKey);
      if (rptStudentsCached) return res.json(rptStudentsCached);

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

      const rptStudentsPayload = { success: true, report };
      setCachedApiResponse(rptStudentsCacheKey, rptStudentsPayload, 180_000);
      res.json(rptStudentsPayload);
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
      const rptRolesCacheKey = 'admin-reports:roles';
      const rptRolesCached = getCachedApiResponse<any>(rptRolesCacheKey);
      if (rptRolesCached) return res.json(rptRolesCached);

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
      const rptRolesPayload = { success: true, report };
      setCachedApiResponse(rptRolesCacheKey, rptRolesPayload, 180_000);
      res.json(rptRolesPayload);
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

  // ─── Update Payment ───────────────────────────────────────────────────────────
  app.patch('/api/admin/payments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'Payment ID is required' });

      const {
        amount,
        currency,
        status,
        method,
        payment_date,
        description,
        reference,
      } = req.body || {};

      const updates: Record<string, any> = {};
      if (amount !== undefined) {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0)
          return res.status(400).json({ error: 'Amount must be greater than zero' });
        updates.amount = numericAmount;
      }
      if (currency !== undefined) updates.currency = currency;
      if (status !== undefined) updates.status = status;
      if (method !== undefined) updates.method = method;
      if (payment_date !== undefined) updates.payment_date = payment_date;
      if (description !== undefined) updates.description = description;
      if (reference !== undefined) updates.reference = reference;

      const { error } = await supabaseAdmin
        .from('payments')
        .update(updates)
        .eq('id', id);
      if (error) throw error;

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to update payment' });
    }
  });

  // ─── Delete Payment ───────────────────────────────────────────────────────────
  app.delete('/api/admin/payments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'Payment ID is required' });

      const { error } = await supabaseAdmin
        .from('payments')
        .delete()
        .eq('id', id);
      if (error) throw error;

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete payment' });
    }
  });

  // ─── Student Monthly Payments ────────────────────────────────────────────────
  app.get('/api/admin/student-payments', async (req, res) => {
    try {
      const { month } = req.query as Record<string, string>;
      const monthYear = month || new Date().toISOString().slice(0, 7);

      const [studentsRes, paymentsRes, teachersResult] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, display_name, email, teacher_id').eq('role', 'student').order('display_name'),
        supabaseAdmin.from('student_monthly_payments').select('*').eq('month_year', monthYear).order('paid_at', { ascending: false }),
        supabaseAdmin.from('profiles').select('id, display_name, email').eq('role', 'teacher'),
      ]);

      if (studentsRes.error) throw studentsRes.error;

      const payments: any[] = paymentsRes.data || [];
      const teacherMap: Record<string, string> = {};
      (teachersResult.data || []).forEach((t: any) => { teacherMap[t.id] = t.display_name || t.email || 'Unknown'; });

      const paidSet = new Set(payments.map((p: any) => p.student_id));
      const paymentByStudent: Record<string, any> = {};
      payments.forEach((p: any) => { paymentByStudent[p.student_id] = p; });

      const students = (studentsRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.display_name || s.email || 'Unnamed',
        email: s.email || '',
        teacher_id: s.teacher_id || null,
        teacher_name: s.teacher_id ? (teacherMap[s.teacher_id] || '—') : '—',
        paid: paidSet.has(s.id),
        payment: paymentByStudent[s.id] || null,
      }));

      res.json({ success: true, students, month_year: monthYear });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load student payments' });
    }
  });

  app.post('/api/admin/student-payments', async (req, res) => {
    try {
      const { student_id, month_year, amount = 0, notes = '' } = req.body || {};
      if (!student_id) return res.status(400).json({ error: 'student_id is required' });
      const monthYear = month_year || new Date().toISOString().slice(0, 7);

      const { data: student, error: sErr } = await supabaseAdmin
        .from('profiles').select('id, display_name, email, teacher_id').eq('id', student_id).single();
      if (sErr || !student) return res.status(400).json({ error: 'Student not found' });

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('student_monthly_payments')
        .upsert({ student_id, month_year: monthYear, amount: Number(amount) || 0, notes: notes || '', paid_at: new Date().toISOString() }, { onConflict: 'student_id,month_year' })
        .select('id').single();
      if (insErr) throw insErr;
      const paymentId = inserted?.id;

      const studentName = student.display_name || student.email || 'Student';
      const [yr, mo] = monthYear.split('-');
      const monthLabel = new Date(Number(yr), Number(mo) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

      const notifs: any[] = [{
        user_id: student_id,
        type: 'payment_confirmed',
        title: 'Pagesa u konfirmua',
        message: `Pagesa juaj për muajin ${monthLabel} u konfirmua me sukses.`,
        read: false,
      }];
      if (student.teacher_id) {
        notifs.push({
          user_id: student.teacher_id,
          type: 'payment_confirmed',
          title: 'Pagesa e studentit u konfirmua',
          message: `Pagesa e ${studentName} për muajin ${monthLabel} u konfirmua.`,
          read: false,
        });
      }
      await supabaseAdmin.from('notifications').insert(notifs).then(() => {});

      res.json({ success: true, id: paymentId });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to record payment' });
    }
  });

  app.delete('/api/admin/student-payments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabaseAdmin.from('student_monthly_payments').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete payment' });
    }
  });

  // Called during login to check if student has paid the current month
  app.get('/api/auth/check-student-payment', async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'student') return res.json({ required: false, paid: true });

      const monthYear = new Date().toISOString().slice(0, 7);
      const { data: payRow } = await supabaseAdmin
        .from('student_monthly_payments')
        .select('id')
        .eq('student_id', user.id)
        .eq('month_year', monthYear)
        .maybeSingle();

      res.json({ required: true, paid: !!payRow });
    } catch (e: any) {
      res.json({ required: false, paid: true });
    }
  });

  // ─── Teacher Hours ───────────────────────────────────────────────────────────
  app.get('/api/admin/teacher-hours', async (req, res) => {
    try {
      const { teacher_id, month } = req.query as Record<string, string>;
      const monthYear = month || new Date().toISOString().slice(0, 7);
      const [yr, mo] = monthYear.split('-');
      const startDate = `${yr}-${mo}-01`;
      const endDate = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);

      let hoursQuery = supabaseAdmin
        .from('teacher_hours')
        .select('*')
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: false });
      if (teacher_id) hoursQuery = hoursQuery.eq('teacher_id', teacher_id);

      const [hoursRes, teachersRes] = await Promise.all([
        hoursQuery,
        supabaseAdmin.from('profiles').select('id, display_name, email').eq('role', 'teacher').order('display_name'),
      ]);

      const rows: any[] = hoursRes.data || [];
      const teacherMap: Record<string, string> = {};
      (teachersRes.data || []).forEach((t: any) => { teacherMap[t.id] = t.display_name || t.email || 'Unknown'; });

      const hours = rows.map((r: any) => ({
        ...r,
        teacher_name: teacherMap[r.teacher_id] || '—',
        hours: Number(r.hours),
        rate_per_hour: Number(r.rate_per_hour),
        total: Number(r.hours) * Number(r.rate_per_hour),
      }));

      const summaryMap: Record<string, { teacher_id: string; teacher_name: string; total_hours: number; total_amount: number }> = {};
      hours.forEach((r: any) => {
        if (!summaryMap[r.teacher_id]) {
          summaryMap[r.teacher_id] = { teacher_id: r.teacher_id, teacher_name: r.teacher_name, total_hours: 0, total_amount: 0 };
        }
        summaryMap[r.teacher_id].total_hours += Number(r.hours);
        summaryMap[r.teacher_id].total_amount += r.total;
      });

      res.json({
        success: true,
        hours,
        summary: Object.values(summaryMap),
        teachers: teachersRes.data || [],
        month_year: monthYear,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load teacher hours' });
    }
  });

  app.post('/api/admin/teacher-hours', async (req, res) => {
    try {
      const { teacher_id, work_date, hours, rate_per_hour = 40, notes = '' } = req.body || {};
      if (!teacher_id) return res.status(400).json({ error: 'teacher_id is required' });
      if (!work_date) return res.status(400).json({ error: 'work_date is required' });
      const numHours = Number(hours);
      if (!Number.isFinite(numHours) || numHours <= 0) return res.status(400).json({ error: 'hours must be greater than 0' });

      const [wd_yr, wd_mo] = work_date.split('-');
      const monthStart = `${wd_yr}-${wd_mo}-01`;
      const monthEnd = new Date(Number(wd_yr), Number(wd_mo), 0).toISOString().slice(0, 10);
      if (work_date < monthStart || work_date > monthEnd) {
        return res.status(400).json({ error: 'Data e punës nuk është e vlefshme' });
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('teacher_hours')
        .insert({ teacher_id, work_date, hours: numHours, rate_per_hour: Number(rate_per_hour) || 40, notes: notes || '' })
        .select('id').single();
      if (insErr) throw insErr;
      res.json({ success: true, id: inserted?.id });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to record hours' });
    }
  });

  app.patch('/api/admin/teacher-hours/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { hours, rate_per_hour, notes, work_date } = req.body || {};
      const updates: Record<string, any> = {};
      if (hours !== undefined) updates.hours = Number(hours);
      if (rate_per_hour !== undefined) updates.rate_per_hour = Number(rate_per_hour);
      if (notes !== undefined) updates.notes = notes;
      if (work_date !== undefined) updates.work_date = work_date;
      if (!Object.keys(updates).length) return res.json({ success: true });
      const { error } = await supabaseAdmin.from('teacher_hours').update(updates).eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to update hours' });
    }
  });

  app.delete('/api/admin/teacher-hours/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabaseAdmin.from('teacher_hours').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete hours' });
    }
  });

  // Invoice data for a teacher/month
  app.get('/api/admin/teacher-hours/invoice', async (req, res) => {
    try {
      const { teacher_id, month } = req.query as Record<string, string>;
      if (!teacher_id) return res.status(400).json({ error: 'teacher_id is required' });
      const monthYear = month || new Date().toISOString().slice(0, 7);
      const [yr, mo] = monthYear.split('-');
      const startDate = `${yr}-${mo}-01`;
      const endDate = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);

      const [teacherRes, hoursRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, display_name, email').eq('id', teacher_id).single(),
        supabaseAdmin.from('teacher_hours').select('*').eq('teacher_id', teacher_id).gte('work_date', startDate).lte('work_date', endDate).order('work_date'),
      ]);

      if (teacherRes.error) throw teacherRes.error;

      const rows: any[] = hoursRes.data || [];
      const total_hours = rows.reduce((s: number, r: any) => s + Number(r.hours), 0);
      const total_amount = rows.reduce((s: number, r: any) => s + Number(r.hours) * Number(r.rate_per_hour), 0);

      res.json({
        success: true,
        teacher: teacherRes.data,
        month_year: monthYear,
        rows: rows.map((r: any) => ({ ...r, hours: Number(r.hours), rate_per_hour: Number(r.rate_per_hour), total: Number(r.hours) * Number(r.rate_per_hour) })),
        total_hours,
        total_amount,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to generate invoice' });
    }
  });

  // Teacher's own earnings (for dashboard widget)
  app.get('/api/teacher/earnings', async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const monthYear = new Date().toISOString().slice(0, 7);
      const [yr, mo] = monthYear.split('-');
      const startDate = `${yr}-${mo}-01`;
      const endDate = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);

      const { data: earningsData } = await supabaseAdmin
        .from('teacher_hours')
        .select('hours, rate_per_hour, work_date')
        .eq('teacher_id', user.id)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      const rows = earningsData || [];
      const total_hours = rows.reduce((s: number, r: any) => s + Number(r.hours), 0);
      const total_amount = rows.reduce((s: number, r: any) => s + Number(r.hours) * Number(r.rate_per_hour), 0);

      res.json({ success: true, total_hours, total_amount, month_year: monthYear });
    } catch (e: any) {
      res.json({ success: true, total_hours: 0, total_amount: 0, month_year: new Date().toISOString().slice(0, 7) });
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
      if ('publish_at' in body) payload.publish_at = body.publish_at ? new Date(String(body.publish_at)).toISOString() : null;

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

  /** AI Question Generation — server-side Gemini call so the browser never needs an API key */
  app.post("/api/teacher/ai/generate-questions", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { content, questionTypes } = req.body as { content?: string; questionTypes?: string[] };
      if (!content?.trim()) return res.status(400).json({ error: "content is required" });
      const geminiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();

      const QUIZ_MAX = 16000;
      const clipped = content.trim().slice(0, QUIZ_MAX);
      const types: string[] = Array.isArray(questionTypes) && questionTypes.length > 0
        ? questionTypes : ["multiple-choice", "true-false", "fill-in-the-blank"];

      const words = (clipped.match(/[A-Za-z0-9]+/g) || []).length;
      const autoCount = words <= 120 ? 3 : words <= 250 ? 4 : words <= 450 ? 5 : words <= 850 ? 7 : 9;
      const count = Math.max(types.length, autoCount);

      const TYPE_LABELS: Record<string, string> = {
        "multiple-choice": "Multiple Choice", "multiple-answer": "Multiple Answer",
        "true-false": "True / False", "fill-in-the-blank": "Fill in the Blank",
        "short-answer": "Short Answer", "long-answer": "Essay", "matching": "Matching",
        "ordering": "Ordering", "word-bank": "Word Bank", "sentence-building": "Sentence Building",
        "drag-drop": "Drag & Drop", "cloze": "Cloze Test", "listening": "Listening Questions",
        "audio-fill-blank": "Audio Fill in Blank", "dictation": "Dictation", "speaking": "Speaking",
        "pronunciation": "Pronunciation Check", "reading-comprehension": "Reading Comprehension",
      };
      const TYPE_SCHEMAS: Record<string, string> = {
        "multiple-choice": `{"type":"multiple-choice","question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}`,
        "multiple-answer": `{"type":"multiple-answer","question":"...","options":["A","B","C","D"],"correct_answers":["A","C"],"explanation":"..."}`,
        "true-false": `{"type":"true-false","question":"...","correct_answer":"True","explanation":"..."}`,
        "fill-in-the-blank": `{"type":"fill-in-the-blank","question":"The ___ is the powerhouse of the cell.","correct_answer":"mitochondria","explanation":"..."}`,
        "short-answer": `{"type":"short-answer","question":"...","correct_answer":"brief answer","explanation":"..."}`,
        "long-answer": `{"type":"long-answer","question":"Explain in detail...","explanation":"sample answer or rubric hint"}`,
        "matching": `{"type":"matching","question":"Match each word to its definition:","pairs":[{"left":"apple","right":"a red fruit"},{"left":"book","right":"pages bound together"}],"explanation":"..."}`,
        "ordering": `{"type":"ordering","question":"Put these steps in order:","items":["Step C","Step A","Step B"],"correct_order":["Step A","Step B","Step C"],"explanation":"..."}`,
        "word-bank": `{"type":"word-bank","question":"Choose the correct word: The ___ shines brightly.","word_bank":["sun","moon","rain","cloud"],"correct_answer":"sun","explanation":"..."}`,
        "sentence-building": `{"type":"sentence-building","question":"Arrange the words:","words":["is","The","sky","blue"],"correct_answer":"The sky is blue","explanation":"..."}`,
        "drag-drop": `{"type":"drag-drop","question":"Drag to put in correct order:","items":["C","A","B"],"correct_order":["A","B","C"],"explanation":"..."}`,
        "cloze": `{"type":"cloze","question":"Complete the passage:","passage":"The ___ (1) rises in the east.","blanks":["sun"],"explanation":"..."}`,
        "reading-comprehension": `{"type":"reading-comprehension","question":"Read the passage and answer:","passage":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}`,
        "listening": `{"type":"listening","question":"[Listening] ...","audio_transcript":"Full transcript","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}`,
        "audio-fill-blank": `{"type":"audio-fill-blank","question":"Listen and fill: 'The capital of France is ___.'","audio_transcript":"Paris.","correct_answer":"Paris","explanation":"..."}`,
        "dictation": `{"type":"dictation","question":"Listen carefully and write what you hear.","audio_transcript":"The quick brown fox.","correct_answer":"The quick brown fox.","explanation":"..."}`,
        "speaking": `{"type":"speaking","question":"Describe your favourite holiday in 3-4 sentences.","explanation":"..."}`,
        "pronunciation": `{"type":"pronunciation","question":"Say the following word clearly:","correct_answer":"necessary","explanation":"..."}`,
      };

      const onlyMC = types.length === 1 && types[0] === "multiple-choice";
      const typeLabels = types.map(t => TYPE_LABELS[t] || t).join(", ");
      const schemaDesc = types.map(t => `- ${TYPE_LABELS[t] || t}: ${TYPE_SCHEMAS[t] || `{"type":"${t}","question":"...","correct_answer":"...","explanation":"..."}`}`).join("\n");

      const systemPrompt = `You are an expert quiz creator for an LMS platform. You always respond with ONLY a valid JSON array of question objects — no markdown, no explanation, no extra text.`;
      const userPrompt = onlyMC
        ? `Create exactly ${count} multiple-choice quiz questions using ONLY the content below. Each question needs exactly 4 options and 1 correct answer. Return a JSON array:
[{"type":"multiple-choice","question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]
Content:\n"""${clipped}"""`
        : `Generate exactly ${count} quiz questions using ONLY the content below.
Types to use: ${typeLabels} (distribute evenly, ~${Math.ceil(count / types.length)} per type).
Rules: For fill-in-the-blank use ___ for the blank. For matching provide pairs array. For ordering/drag-drop provide items and correct_order. For word-bank provide word_bank array. For multiple-choice: 4 options, 1 correct. Always include explanation.
Schemas:\n${schemaDesc}
Return ONLY a JSON array:\n[...questions]
Content:\n"""${clipped}"""`;

      let rawText = "";
      if (geminiKey) {
        const { GoogleGenAI } = await import("@google/genai");
        const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
        const ai = geminiBaseUrl
          ? new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } })
          : new GoogleGenAI({ apiKey: geminiKey });
        const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: `${systemPrompt}\n\n${userPrompt}` });
        rawText = (result.text || "").trim();
      } else {
        const pollinationsRes = await fetch("https://text.pollinations.ai/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            model: "openai",
            jsonMode: true,
          }),
        });
        if (!pollinationsRes.ok) throw new Error(`AI service error: ${pollinationsRes.status}`);
        rawText = (await pollinationsRes.text()).trim();
      }

      const parseJsonFromText = (text: string): any[] => {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const clean = (fenced ? fenced[1] : text).trim();
        try { const p = JSON.parse(clean); return Array.isArray(p) ? p : (p?.questions ?? []); } catch {}
        let depth = 0, start = -1;
        for (let i = 0; i < clean.length; i++) {
          if (clean[i] === '[') { if (start === -1) start = i; depth++; }
          else if (clean[i] === ']' && start !== -1) { depth--; if (depth === 0) { try { const p = JSON.parse(clean.slice(start, i + 1)); return Array.isArray(p) ? p : []; } catch {} } }
        }
        return [];
      };

      const parsed = parseJsonFromText(rawText);
      const questions = parsed.map((item: any) => {
        const type = String(item.type || "multiple-choice");
        const text = String(item.question || item.text || "").trim();
        if (!text) return null;
        const q: any = { type, text, explanation: String(item.explanation || "").trim(), points: 1 };
        if (type === "multiple-choice" || type === "reading-comprehension" || type === "listening") {
          const opts = Array.isArray(item.options) ? item.options.map(String) : [];
          q.options = opts.slice(0, 4).map((t: string, i: number) => ({ id: String(i + 1), text: t }));
          const ca = String(item.correct_answer || opts[0] || "");
          const caIdx = q.options.findIndex((o: any) => o.text === ca);
          q.correctAnswer = caIdx >= 0 ? String(caIdx + 1) : "1";
          if (type !== "multiple-choice") q.passage = String(item.passage || item.audio_transcript || "");
        } else if (type === "multiple-answer") {
          const opts = Array.isArray(item.options) ? item.options.map(String) : [];
          q.options = opts.slice(0, 4).map((t: string, i: number) => ({ id: String(i + 1), text: t }));
          const cas: string[] = Array.isArray(item.correct_answers) ? item.correct_answers.map(String) : [String(item.correct_answer || opts[0] || "")];
          q.correctAnswer = cas.map((ca: string) => { const idx = q.options.findIndex((o: any) => o.text === ca); return idx >= 0 ? String(idx + 1) : "1"; });
        } else if (type === "true-false") {
          q.options = [{ id: "1", text: "True" }, { id: "2", text: "False" }];
          q.correctAnswer = String(item.correct_answer || "True").toLowerCase().startsWith("t") ? "1" : "2";
        } else if (["fill-in-the-blank","short-answer","audio-fill-blank","dictation","pronunciation"].includes(type)) {
          q.correctAnswer = String(item.correct_answer || item.audio_transcript || "").trim();
          if (item.audio_transcript) q.audioTranscript = String(item.audio_transcript);
        } else if (type === "long-answer" || type === "speaking") {
          q.points = 2;
        } else if (type === "matching") {
          q.pairs = Array.isArray(item.pairs) ? item.pairs.filter((p: any) => p.left && p.right) : [];
          if (q.pairs.length < 2) return null;
          q.points = q.pairs.length;
        } else if (type === "ordering" || type === "drag-drop") {
          q.items = Array.isArray(item.items) ? item.items.map(String) : [];
          q.correctOrder = Array.isArray(item.correct_order) ? item.correct_order.map(String) : q.items;
          if (q.items.length < 2) return null;
        } else if (type === "word-bank") {
          q.wordBank = Array.isArray(item.word_bank) ? item.word_bank.map(String) : [];
          q.correctAnswer = String(item.correct_answer || "").trim();
        } else if (type === "sentence-building") {
          q.words = Array.isArray(item.words) ? item.words.map(String) : [];
          q.correctAnswer = String(item.correct_answer || q.words.join(" ")).trim();
          if (q.words.length < 2) return null;
        } else if (type === "cloze") {
          q.passage = String(item.passage || text);
          q.blanks = Array.isArray(item.blanks) ? item.blanks.map(String) : [];
          q.correctAnswer = JSON.stringify(q.blanks);
        }
        return q;
      }).filter(Boolean);

      if (questions.length === 0) {
        return res.status(500).json({ error: "AI could not generate questions from the provided content. Try adding more detailed text." });
      }
      return res.json({ questions });
    } catch (e: any) {
      console.error("POST /api/teacher/ai/generate-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to generate questions" });
    }
  });

  /** Smart Test Builder — AI generates questions from Headway grammar/vocabulary sections */
  app.post("/api/teacher/smart-quiz/generate", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const body = req.body as {
        level: string;
        selectedSections: Array<{ id: string; topic: string; type: string; unitTitle: string }>;
        courseId: string;
        title: string;
        timeLimit?: number;
        passmark?: number;
        questionsPerSection?: number;
        questionTypes?: string[];
      };

      const { level, selectedSections, courseId, title } = body;
      const timeLimit = Number(body.timeLimit) || 30;
      const passmark = Number(body.passmark) || 70;
      const questionsPerSection = Math.min(Math.max(Number(body.questionsPerSection) || 3, 2), 8);
      const questionTypes: string[] = Array.isArray(body.questionTypes) && body.questionTypes.length > 0
        ? body.questionTypes : ["multiple-choice"];
      const useAI = Boolean((process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim());

      if (!level || !Array.isArray(selectedSections) || selectedSections.length === 0) {
        return res.status(400).json({ error: "level and selectedSections are required" });
      }
      if (!courseId) return res.status(400).json({ error: "courseId is required" });
      if (!title?.trim()) return res.status(400).json({ error: "title is required" });

      // Verify teacher owns the course
      if (caller.role !== "admin") {
        const { data: course } = await supabaseAdmin.from("courses").select("teacher_id").eq("id", courseId).maybeSingle();
        if (!course) return res.status(404).json({ error: "Course not found" });
        const scopedIds = await getTeacherIdCandidates(caller.userId);
        const tid = course.teacher_id ? String(course.teacher_id) : "";
        if (tid && !scopedIds.includes(tid) && tid !== caller.userId) {
          return res.status(403).json({ error: "You do not own this course" });
        }
      }

      // Build questions — AI path for mixed types, static bank for MC-only
      type SmartQ = { type: string; text: string; options: string[]; correct_answer: string; explanation: string; [key: string]: any };
      let questions: SmartQ[] = [];

      if (useAI) {
        const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();

        const TYPE_LABELS: Record<string, string> = {
          "multiple-choice": "Multiple Choice", "multiple-answer": "Multiple Answer",
          "true-false": "True / False", "fill-in-the-blank": "Fill in the Blank",
          "short-answer": "Short Answer", "long-answer": "Essay", "matching": "Matching",
          "ordering": "Ordering", "word-bank": "Word Bank", "sentence-building": "Sentence Building",
          "drag-drop": "Drag & Drop", "cloze": "Cloze Test", "listening": "Listening Questions",
          "audio-fill-blank": "Audio Fill in Blank", "dictation": "Dictation", "speaking": "Speaking",
          "pronunciation": "Pronunciation Check", "reading-comprehension": "Reading Comprehension",
        };
        const typeLabels = questionTypes.map(t => TYPE_LABELS[t] || t).join(", ");
        const totalCount = selectedSections.length * questionsPerSection;
        const perType = Math.ceil(totalCount / questionTypes.length);

        const sectionList = selectedSections.map(s => `- ${s.unitTitle}: ${s.type} (${s.topic})`).join("\n");
        const smartSysPrompt = `You are an expert English language teacher creating a Headway-style quiz. Respond ONLY with a valid JSON array — no markdown, no extra text.`;
        const smartUserPrompt = `Generate exactly ${totalCount} English language questions for ${level} level students based on these topics:\n${sectionList}\n\nTypes: ${typeLabels} (~${perType} per type).\nRules: fill-in-the-blank uses ___. matching needs pairs array. ordering/drag-drop needs items+correct_order. word-bank needs word_bank array. Always include explanation.\nReturn ONLY a JSON array:\n[...questions]`;

        let rawAI = "";
        let aiSucceeded = false;
        if (aiApiKey) {
          const { GoogleGenAI } = await import("@google/genai");
          const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
          const ai = geminiBaseUrl
            ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } })
            : new GoogleGenAI({ apiKey: aiApiKey });
          const maxRetries = 3;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 2000));
              const aiResult = await ai.models.generateContent({ model: "gemini-2.0-flash-lite", contents: `${smartSysPrompt}\n\n${smartUserPrompt}` });
              rawAI = (aiResult.text || "").trim();
              aiSucceeded = true;
              break;
            } catch (aiErr: any) {
              const status = aiErr?.status ?? aiErr?.code ?? 0;
              const isRetryable = status === 503 || status === 429 || String(aiErr?.message || "").includes("UNAVAILABLE") || String(aiErr?.message || "").includes("overloaded");
              console.warn(`[smart-quiz] Gemini attempt ${attempt + 1} failed (${status}): ${aiErr?.message}`);
              if (!isRetryable || attempt === maxRetries - 1) break;
            }
          }
        }
        if (!aiSucceeded) {
          console.warn("[smart-quiz] AI unavailable — falling back to static question bank");
        }

        const parseArr = (text: string): any[] => {
          const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
          const clean = (fenced ? fenced[1] : text).trim();
          try { const p = JSON.parse(clean); return Array.isArray(p) ? p : []; } catch {}
          let depth = 0, start = -1;
          for (let i = 0; i < clean.length; i++) {
            if (clean[i] === '[') { if (start === -1) start = i; depth++; }
            else if (clean[i] === ']' && start !== -1) { depth--; if (depth === 0) { try { const p = JSON.parse(clean.slice(start, i + 1)); return Array.isArray(p) ? p : []; } catch {} } }
          }
          return [];
        };

        if (aiSucceeded && rawAI) {
          const parsed = parseArr(rawAI);
          questions = parsed.map((item: any) => {
            const type = String(item.type || "multiple-choice");
            const text = String(item.question || item.text || "").trim();
            if (!text) return null;
            return { type, text, options: Array.isArray(item.options) ? item.options.map(String) : [], correct_answer: String(item.correct_answer || ""), explanation: String(item.explanation || ""), ...item };
          }).filter(Boolean) as SmartQ[];
          console.log(`[smart-quiz] AI generated ${questions.length} questions for ${selectedSections.length} sections (level=${level}, types=${questionTypes.join(",")})`);
        }

      }

      // Static bank fallback — runs when useAI=false OR when AI returned nothing
      if (questions.length === 0) {
        if (useAI) console.warn("[smart-quiz] AI returned no questions — using static bank as fallback");
        const transformToType = (q: { text: string; options: string[]; correct: number; explanation: string }, qType: string, qIndex: number): SmartQ => {
          const correctText = q.options[q.correct ?? 0] ?? q.options[0];
          const wrongOptions = q.options.filter((_, i) => i !== (q.correct ?? 0));
          const wrongText = wrongOptions[qIndex % wrongOptions.length] ?? q.options[1] ?? "";
          switch (qType) {
            case "fill-in-the-blank":
              return { type: "fill-in-the-blank", text: q.text, options: [], correct_answer: correctText, explanation: q.explanation };
            case "true-false": {
              const useTrue = qIndex % 2 === 0;
              const sentence = q.text.replace("_____", useTrue ? correctText : wrongText);
              return { type: "true-false", text: sentence, options: ["True", "False"], correct_answer: useTrue ? "True" : "False", explanation: q.explanation };
            }
            case "word-bank": {
              const shuffled = [...q.options].sort(() => Math.random() - 0.5);
              return { type: "word-bank", text: q.text, options: shuffled, word_bank: shuffled, correct_answer: correctText, explanation: q.explanation };
            }
            case "short-answer":
              return { type: "short-answer", text: q.text, options: [], correct_answer: correctText, explanation: q.explanation };
            case "sentence-building": {
              const fullSentence = q.text.replace("_____", correctText);
              const words = fullSentence.replace(/[.!?]$/, "").split(" ").filter(Boolean);
              const scrambled = [...words].sort(() => Math.random() - 0.5);
              return { type: "sentence-building", text: "Arrange the words to form a correct sentence:", options: scrambled, words: scrambled, correct_answer: fullSentence.replace(/[.!?]$/, ""), explanation: q.explanation };
            }
            case "multiple-choice":
            default:
              return { type: "multiple-choice", text: q.text, options: q.options, correct_answer: String((q.correct ?? 0) + 1), explanation: q.explanation };
          }
        };
        let typeIndex = 0;
        for (const sec of selectedSections) {
          const staticQs = getQuestionsForSection(level, sec.topic, questionsPerSection);
          for (const q of staticQs) {
            const qType = questionTypes[typeIndex % questionTypes.length];
            questions.push(transformToType(q, qType, typeIndex));
            typeIndex++;
          }
        }
        console.log(`[smart-quiz] Static bank generated ${questions.length} questions for ${selectedSections.length} sections (level=${level}, types=${questionTypes.join(",")})`);
      }

      if (questions.length === 0) {
        return res.status(400).json({ error: "No questions could be generated for the selected sections. Try different types or add more sections." });
      }

      // Create the quiz
      const quizPayload: Record<string, unknown> = {
        title: title.trim(),
        description: `Smart Test Builder — ${level} · ${selectedSections.length} sections · ${questionTypes.join(", ")}`,
        course_id: courseId,
        teacher_id: caller.userId,
        time_limit: timeLimit,
        pass_mark: passmark,
        published: false,
        settings: {
          shuffleQuestions: false,
          shuffleAnswers: false,
          allowRetry: true,
          passingScore: passmark,
          smartTestMeta: {
            level,
            sections: selectedSections,
            questionsPerSection,
            questionTypes,
          },
        },
      };

      const { data: inserted, error: insErr } = await insertCompatibleQuizAdmin(quizPayload, caller.userId);
      if (insErr || !inserted?.id) {
        console.error("[smart-quiz] quiz insert error:", insErr);
        return res.status(500).json({ error: insErr?.message || "Failed to create quiz" });
      }

      const quizId = inserted.id;

      // Map any question type to the subset the DB constraint allows
      const DB_ALLOWED_TYPES = new Set(['multiple-choice','true-false','open-text','fill-in-the-blank','matching','ordering','image','video','reading','instruction']);
      const normalizeQType = (t: string): string => {
        if (DB_ALLOWED_TYPES.has(t)) return t;
        const map: Record<string, string> = {
          'word-bank': 'fill-in-the-blank', 'cloze': 'fill-in-the-blank', 'audio-fill-blank': 'fill-in-the-blank',
          'sentence-building': 'open-text', 'short-answer': 'open-text', 'long-answer': 'open-text',
          'dictation': 'open-text', 'speaking': 'open-text', 'pronunciation': 'open-text', 'listening': 'open-text',
          'drag-drop': 'ordering', 'multiple-answer': 'multiple-choice', 'reading-comprehension': 'reading',
        };
        return map[t] ?? 'multiple-choice';
      };

      // Insert questions — preserve actual type for AI-generated questions
      const questionRows = questions.map((q: any, idx: number) => ({
        quiz_id: quizId,
        type: normalizeQType(String(q.type || "multiple-choice")),
        text: String(q.text || q.question || "").trim() || " ",
        question_text: String(q.text || q.question || "").trim() || " ",
        options: Array.isArray(q.options) ? q.options : [],
        correct_answer: q.correct_answer ?? (Array.isArray(q.options) ? q.options[0] : ""),
        explanation: q.explanation ?? null,
        points: ["long-answer","speaking","matching"].includes(String(q.type)) ? 2 : 1,
        order: idx,
      }));

      // Try inserting with text column first, fallback to question_text
      let { error: qInsErr } = await supabaseAdmin.from("questions").insert(
        questionRows.map(({ question_text: _qt, ...r }: any) => r)
      );
      if (qInsErr && /question_text|does not exist|PGRST204/i.test(qInsErr.message || "")) {
        ({ error: qInsErr } = await supabaseAdmin.from("questions").insert(
          questionRows.map(({ text: _t, ...r }: any) => ({ ...r, question_text: r.question_text }))
        ));
      }
      if (qInsErr) {
        console.warn("[smart-quiz] question insert warning:", qInsErr.message);
      }

      console.log(`[smart-quiz] Created quiz ${quizId} with ${questions.length} questions for level=${level}`);
      return res.json({ success: true, quizId, questionCount: questions.length });
    } catch (e: any) {
      console.error("POST /api/teacher/smart-quiz/generate", e);
      return res.status(500).json({ error: e?.message || "Failed to generate smart quiz" });
    }
  });

  /** Regenerate AI questions for a Smart Test Builder quiz. */
  app.post("/api/teacher/quizzes/:id/regenerate-questions", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const quizId = req.params.id;
      let quiz: any = null;
      let quizErr: any = null;
      ({ data: quiz, error: quizErr } = await supabaseAdmin
        .from("quizzes")
        .select("id, settings, course_id")
        .eq("id", quizId)
        .maybeSingle());

      if (quizErr || !quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      const meta = (quiz.settings as any)?.smartTestMeta;
      if (!meta?.level || !Array.isArray(meta?.sections) || meta.sections.length === 0) {
        return res.status(400).json({ error: "This quiz was not created with Smart Test Builder. No regeneration metadata found." });
      }

      const { level, sections: selectedSections, questionsPerSection = 3 } = meta;

      // Regenerate from expanded static bank — shuffled differently each call for variety
      type SmartQ = { text: string; options: string[]; correct_answer: string; explanation: string };
      const questions: SmartQ[] = [];

      for (const sec of selectedSections) {
        const staticQs = getQuestionsForSection(level, sec.topic, questionsPerSection);
        for (const q of staticQs) {
          // Store correct_answer as 1-based index string to match QuizBuilder's opt.id convention
          questions.push({ text: q.text, options: q.options, correct_answer: String((q.correct ?? 0) + 1), explanation: q.explanation });
        }
      }
      console.log(`[regen] Static bank regenerated ${questions.length} questions for quiz ${quizId} (level=${level})`);

      if (questions.length === 0) {
        return res.status(400).json({ error: "Could not generate questions." });
      }

      // Delete existing questions and insert new ones
      await supabaseAdmin.from("questions").delete().eq("quiz_id", quizId);

      const questionRows = questions.map((q: SmartQ, idx: number) => ({
        quiz_id: quizId,
        type: "multiple-choice",
        text: q.text,
        question_text: q.text,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation || null,
        points: 1,
        order: idx,
      }));

      let { error: qInsErr } = await supabaseAdmin.from("questions").insert(
        questionRows.map(({ question_text: _qt, ...r }: any) => r)
      );
      if (qInsErr && /question_text|does not exist|PGRST204/i.test(qInsErr.message || "")) {
        ({ error: qInsErr } = await supabaseAdmin.from("questions").insert(
          questionRows.map(({ text: _t, ...r }: any) => ({ ...r, question_text: r.question_text }))
        ));
      }

      console.log(`[regen] Replaced questions for quiz ${quizId}: ${questions.length} new questions`);
      return res.json({ success: true, questionCount: questions.length });
    } catch (e: any) {
      console.error("POST /api/teacher/quizzes/:id/regenerate-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to regenerate questions" });
    }
  });

  /** Update quiz metadata (service role — bypasses RLS for schemas without teacher_id). */
  /** GET single quiz by id (service role) — used by ExamBuilder to bypass RLS. */
  app.get("/api/teacher/quizzes/:id", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const quizId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id required" });

      const { data: qz, error: qzErr } = await supabaseAdmin
        .from("quizzes")
        .select("id, title, description, time_limit, pass_mark, course_id, published, status, type, settings")
        .eq("id", quizId)
        .maybeSingle();
      if (qzErr) return res.status(500).json({ error: qzErr.message });
      if (!qz) return res.status(404).json({ error: "Exam not found" });

      let courseName = "";
      if (qz.course_id) {
        const { data: c } = await supabaseAdmin.from("courses").select("title").eq("id", qz.course_id).maybeSingle();
        courseName = c?.title || "";
      }

      const { data: qs } = await supabaseAdmin
        .from("questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("order", { ascending: true });

      return res.json({ success: true, quiz: { ...qz, courseName }, questions: qs || [] });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load quiz" });
    }
  });

  app.patch("/api/teacher/quizzes/:id", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const quizId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id required" });

      const body = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = String(body.title);
      if (body.description !== undefined) updates.description = body.description != null ? String(body.description) : null;
      if (body.course_id !== undefined) updates.course_id = body.course_id;
      if (body.time_limit !== undefined) updates.time_limit = Number(body.time_limit) || 0;
      if (body.published !== undefined) updates.published = Boolean(body.published);
      if (body.settings !== undefined && body.settings !== null) updates.settings = body.settings;
      if ("publish_at" in body) updates.publish_at = body.publish_at ? new Date(String(body.publish_at)).toISOString() : null;

      let payload = { ...updates };
      for (let i = 0; i < 8; i++) {
        const { error } = await supabaseAdmin.from("quizzes").update(payload).eq("id", quizId);
        if (!error) return res.json({ success: true });
        const e = error as { message?: string; code?: string };
        const msg = (e.message || "").toLowerCase();
        if ((e.code === "PGRST204" || /schema cache|could not find|does not exist/i.test(msg)) && msg.includes("settings") && "settings" in payload) {
          const { settings: _s, ...rest } = payload; void _s; payload = rest; continue;
        }
        if (missingQuizzesPublishedColumn(e) && "published" in payload) {
          const { published: _p, ...rest } = payload; void _p; payload = rest; continue;
        }
        if ((e.code === "PGRST204" || e.code === "42703") && msg.includes("publish_at") && "publish_at" in payload) {
          const { publish_at: _pa, ...rest } = payload; void _pa; payload = rest; continue;
        }
        return res.status(500).json({ error: e.message || "Failed to update quiz" });
      }
      return res.status(500).json({ error: "Quiz update: max retries" });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update quiz" });
    }
  });

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

  // ─── Quiz Sections ─────────────────────────────────────────────────────────
  const isQuizSectionsMissing = (e: unknown): boolean => {
    const msg = String((e as any)?.message || '');
    const code = String((e as any)?.code || '');
    return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(msg);
  };

  app.get('/api/teacher/quizzes/:id/sections', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const quizId = String(req.params.id || '').trim();
      if (!quizId) return res.status(400).json({ error: 'Quiz id required' });
      const { data, error } = await supabaseAdmin
        .from('quiz_sections')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true });
      if (error) {
        if (isQuizSectionsMissing(error)) return res.json({ success: true, sections: [] });
        throw error;
      }
      return res.json({ success: true, sections: data || [] });
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to load sections' }); }
  });

  app.post('/api/teacher/quizzes/:id/sections/sync', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const quizId = String(req.params.id || '').trim();
      if (!quizId) return res.status(400).json({ error: 'Quiz id required' });
      const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
      const delRes = await supabaseAdmin.from('quiz_sections').delete().eq('quiz_id', quizId);
      if (delRes.error && !isQuizSectionsMissing(delRes.error)) throw delRes.error;
      if (sections.length === 0) return res.json({ success: true, sections: [] });
      const rows = sections.map((s: any, idx: number) => ({
        quiz_id: quizId,
        title: String(s.title || 'Section').trim() || 'Section',
        type: String(s.type || 'general').trim(),
        instructions: s.instructions ? String(s.instructions).trim() : null,
        audio_url: s.audio_url ? String(s.audio_url).trim() : null,
        order_index: idx,
      }));
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('quiz_sections').insert(rows).select();
      if (insErr) {
        if (isQuizSectionsMissing(insErr)) return res.json({ success: true, sections: [] });
        throw insErr;
      }
      return res.json({ success: true, sections: inserted || [] });
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to sync sections' }); }
  });

  app.get('/api/student/quizzes/:id/sections', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const quizId = String(req.params.id || '').trim();
      if (!quizId) return res.status(400).json({ error: 'Quiz id required' });
      const { data, error } = await supabaseAdmin
        .from('quiz_sections')
        .select('id,title,type,instructions,audio_url,order_index')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true });
      if (error) {
        if (isQuizSectionsMissing(error)) return res.json({ success: true, sections: [] });
        throw error;
      }
      return res.json({ success: true, sections: data || [] });
    } catch (e: any) { res.status(500).json({ error: e?.message || 'Failed to load sections' }); }
  });

  // Admin users list for dashboard user management (teachers only)
  app.get('/api/admin/users', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin role required' });
      const adminUsersCacheKey = "admin-users:teachers";
      const cachedAdminUsers = getCachedApiResponse<any>(adminUsersCacheKey);
      if (cachedAdminUsers) return res.json(cachedAdminUsers);

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, display_name, role, teacher_id, status, created_at')
        .eq('role', 'teacher')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const payload = { success: true, users: data || [] };
      setCachedApiResponse(adminUsersCacheKey, payload, 15_000);
      res.json(payload);
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
  const isLiveSessionsStartedAtColumnMissing = (error: any) => {
    const hay = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''} ${error?.code || ''}`.toLowerCase();
    if (!hay.includes('started_at')) return false;
    // "column does not exist" (schema cache miss or truly absent)
    if (/schema cache|could not find|does not exist|42703|undefined column/.test(hay)) return true;
    // "can only be updated to DEFAULT" — column is GENERATED ALWAYS in Postgres
    if (hay.includes('can only be updated to default')) return true;
    return false;
  };

  // ── Jitsi / JaaS token endpoint ─────────────────────────────────────────
  // Returns a signed JWT so the caller can join as moderator (teacher) or
  // guest (student) without the meet.jit.si "Log in as moderator" gate.
  // Requires env vars: JAAS_APP_ID, JAAS_API_KEY_ID, JAAS_PRIVATE_KEY
  app.post('/api/jitsi-token', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const { roomName, moderator = false, displayName } = req.body as {
        roomName?: string;
        moderator?: boolean;
        displayName?: string;
      };

      const appId      = process.env.JAAS_APP_ID;
      const keyId      = process.env.JAAS_API_KEY_ID;
      const privateKey = process.env.JAAS_PRIVATE_KEY;

      if (!appId || !keyId || !privateKey) {
        // Credentials not configured — tell client to fall back to meet.jit.si
        return res.json({ token: null, domain: 'meet.jit.si', appId: null });
      }

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: 'chat',
        aud: 'jitsi',
        iat: now - 10,
        nbf: now - 10,
        exp: now + 7200,
        sub: appId,
        room: roomName || '*',
        context: {
          user: {
            moderator: String(moderator),
            name: displayName || caller.displayName || caller.email || 'User',
            id: caller.id,
            avatar: '',
            email: caller.email || '',
          },
          features: {
            livestreaming: 'false',
            'outbound-call': 'false',
            'sip-outbound-call': 'false',
            transcription: 'false',
            recording: 'false',
          },
        },
      };

      const pemKey = privateKey.replace(/\\n/g, '\n');
      const token = jwt.sign(payload, pemKey, {
        algorithm: 'RS256',
        header: { alg: 'RS256', kid: `${appId}/${keyId}`, typ: 'JWT' } as any,
      });

      res.json({ token, domain: '8x8.vc', appId });
    } catch (err: any) {
      console.error('[jitsi-token] error:', err.message);
      res.json({ token: null, domain: 'meet.jit.si', appId: null });
    }
  });

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
        await notifInsert(notifRows);
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
      const ALLOWED_FIELDS = ['status', 'title', 'description', 'scheduled_at', 'duration_minutes', 'recording_url', 'jitsi_room_name', 'started_at', 'chat_enabled', 'reactions_enabled', 'raise_hand_enabled'];
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ALLOWED_FIELDS) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (Object.keys(update).length === 1) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }

      // When transitioning to 'live', always record started_at in DB
      // (client may not send it, e.g. when using the list page "Start" button)
      if (req.body.status === 'live' && !update.started_at) {
        update.started_at = new Date().toISOString();
      }

      // When a new recording_url is being set, also append it to recording_urls array
      if (update.recording_url) {
        const { data: existing } = await supabaseAdmin
          .from('live_sessions').select('recording_urls').eq('id', req.params.id).single();
        const existingUrls: string[] = Array.isArray(existing?.recording_urls) ? existing.recording_urls : [];
        const newUrl = String(update.recording_url);
        if (!existingUrls.includes(newUrl)) {
          update.recording_urls = [...existingUrls, newUrl];
        }
      }

      let updateResult = await supabaseAdmin
        .from('live_sessions')
        .update(update)
        .eq('id', req.params.id).select().single();
      if (updateResult.error && isLiveSessionsStartedAtColumnMissing(updateResult.error) && 'started_at' in update) {
        const { started_at: _startedAt, ...fallbackUpdate } = update;
        updateResult = await supabaseAdmin
          .from('live_sessions')
          .update(fallbackUpdate)
          .eq('id', req.params.id).select().single();
      }
      const { data, error } = updateResult;
      if (error) throw error;

      if (req.body.status === 'live') {
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
          await notifInsert(notifRows);
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
    const { data: participationRows, error: partErr } = await supabaseAdmin
      .from('session_participants').select('id,is_removed').eq('session_id', sessionId).eq('user_id', caller.userId).limit(1);
    if (partErr && !isSessionParticipantsTableMissing(partErr)) {
      throw partErr;
    }
    const participation = Array.isArray(participationRows) ? participationRows[0] ?? null : null;
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
    const { data: participationRows, error: partErr } = await supabaseAdmin
      .from('session_participants').select('id,is_removed').eq('session_id', sessionId).eq('user_id', caller.userId).limit(1);
    const participation = Array.isArray(participationRows) ? participationRows[0] ?? null : null;
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

  // Student session detail — any authenticated student can view session info via direct link
  app.get('/api/student/live-sessions/:id', async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id).single();
      if (error || !data) { res.status(404).json({ error: 'Session not found' }); return; }
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
      const caller = await getAuthUser(req);
      if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { data, error } = await supabaseAdmin
        .from('live_sessions')
        .select('*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)')
        .eq('id', req.params.id).single();
      if (error) throw error;
      if (!data) { res.status(404).json({ error: 'Session not found' }); return; }
      // Allow: admin, the host, or an invited participant
      if (caller.role !== 'admin' && data.host_id !== caller.userId) {
        const { data: part } = await supabaseAdmin
          .from('session_participants').select('id,is_removed')
          .eq('session_id', req.params.id).eq('user_id', caller.userId).limit(1).maybeSingle();
        if (!part || (part as { is_removed?: boolean }).is_removed) {
          res.status(403).json({ error: 'Forbidden: you are not the host or an invited participant' }); return;
        }
      }
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
      await notifInsert(notifRows);

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
        .insert({ session_id: req.params.id, sender_id, message: text, created_at: new Date().toISOString(), sender_display_name: caller.displayName as string | undefined ?? null })
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

  // Push quiz to all session students (host only)
  app.post('/api/teacher/live-sessions/:id/push-quiz', async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { quizId, quizTitle } = req.body;
      if (!quizId || !quizTitle) return res.status(400).json({ error: 'quizId and quizTitle required' });

      // Update live_sessions row with live_quiz_id + live_quiz_title so Realtime pushes to students
      const { error: patchErr } = await supabaseAdmin
        .from('live_sessions')
        .update({ live_quiz_id: quizId, live_quiz_title: quizTitle } as any)
        .eq('id', req.params.id);
      if (patchErr) {
        // Column may not exist yet — still send notifications, just skip the update
        console.warn('[push-quiz] live_sessions update skipped (column missing?):', patchErr.message);
      }

      // Also send in-app notifications to all session participants
      const { data: participants } = await supabaseAdmin
        .from('session_participants')
        .select('user_id')
        .eq('session_id', req.params.id)
        .is('left_at', null);

      if (participants && participants.length > 0) {
        const notifs = participants.map((p: any) => ({
          user_id: p.user_id,
          title: '📝 Kuiz i ri',
          message: `Mësuesi ka nisur kuizin: ${quizTitle}`,
          type: 'quiz',
          action_url: `/student/quiz/${quizId}`,
          read: false,
          created_at: new Date().toISOString(),
        }));
        await supabaseAdmin.from('notifications').insert(notifs).catch(() => {});
      }

      res.json({ success: true });
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
      const deduped = (data || []).map((cls: any) => ({
        ...cls,
        student_ids: Array.isArray(cls.student_ids)
          ? [...new Set(cls.student_ids.map((s: unknown) => String(s)).filter(Boolean))]
          : [],
      }));
      res.json({ success: true, classes: deduped });
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

  // ── Suggestion 5: CSV Student Enrollment into a class ─────────────────────
  app.post('/api/teacher/classes/:classId/enroll-csv', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: teacher role required' });
      }
      const classId = String(req.params.classId || '').trim();
      if (!classId) return res.status(400).json({ error: 'classId is required' });

      // emails can be an array or a comma/newline-separated string
      let rawEmails: string[] = [];
      if (Array.isArray(req.body?.emails)) {
        rawEmails = req.body.emails.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean);
      } else if (typeof req.body?.emails === 'string') {
        rawEmails = req.body.emails.split(/[\n,;]+/).map((e: string) => e.trim().toLowerCase()).filter(Boolean);
      }
      if (rawEmails.length === 0) return res.status(400).json({ error: 'No emails provided' });

      // Get class row
      const classSnap = await supabaseAdmin.from('classes').select('id, teacher_id, student_ids, course_id').eq('id', classId).maybeSingle();
      if (classSnap.error) throw classSnap.error;
      const cls = classSnap.data as any;
      if (!cls) return res.status(404).json({ error: 'Class not found' });

      // Resolve teacher access
      const teacherIdCandidates = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [caller.userId];
      if (cls.teacher_id && !scopedIds.includes(String(cls.teacher_id))) {
        return res.status(403).json({ error: 'Access denied to this class' });
      }

      // Look up profiles by email
      const profilesRes = await supabaseAdmin.from('profiles').select('id, email, role').in('email', rawEmails);
      if (profilesRes.error) throw profilesRes.error;
      const profiles = (profilesRes.data || []) as Array<{ id: string; email: string; role: string }>;

      const foundEmails = new Set(profiles.map(p => p.email.toLowerCase()));
      const notFound = rawEmails.filter(e => !foundEmails.has(e));
      const studentProfiles = profiles.filter(p => p.role === 'student' || p.role === 'admin');

      // Add to class
      const existingIds: string[] = Array.isArray(cls.student_ids) ? cls.student_ids.map((s: any) => String(s)) : [];
      const newIds = studentProfiles.map(p => p.id).filter(id => !existingIds.includes(id));
      const mergedIds = [...new Set([...existingIds, ...newIds])];

      const classUpdate = await supabaseAdmin.from('classes').update({ student_ids: mergedIds }).eq('id', classId);
      if (classUpdate.error) throw classUpdate.error;

      // Also enroll in the linked course if present
      if (cls.course_id && newIds.length > 0) {
        const courseSnap = await supabaseAdmin.from('courses').select('id, student_ids, total_students').eq('id', String(cls.course_id)).maybeSingle();
        if (!courseSnap.error && courseSnap.data) {
          const course = courseSnap.data as any;
          const courseStudentIds: string[] = Array.isArray(course.student_ids) ? course.student_ids.map((s: any) => String(s)) : [];
          const nextCourseIds = [...new Set([...courseStudentIds, ...newIds])];
          await supabaseAdmin.from('courses').update({ student_ids: nextCourseIds, total_students: nextCourseIds.length }).eq('id', String(cls.course_id));
        }
      }

      return res.json({
        success: true,
        enrolled: newIds.length,
        alreadyEnrolled: existingIds.filter(id => studentProfiles.map(p => p.id).includes(id)).length,
        notFound,
        notStudents: profiles.filter(p => p.role !== 'student' && p.role !== 'admin').map(p => p.email),
      });
    } catch (e: any) {
      console.error('POST /api/teacher/classes/:classId/enroll-csv', e);
      return res.status(500).json({ error: e?.message || 'Failed to enroll students' });
    }
  });

  // ── STUDENT LIVE SESSIONS ───────────────────────────────────

  // Return all published courses belonging to the student's assigned teacher.
  // This powers the "Available Courses" / discover section in /student/courses.
  app.get('/api/student/courses/available', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student role required' });
      }

      // Get the student's assigned teacher_id from their profile
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('teacher_id')
        .eq('id', caller.userId)
        .single();
      if (profileErr) throw profileErr;

      const linkedTeacherId = profile?.teacher_id ? String(profile.teacher_id) : '';

      // Helper: fetch ALL published courses (fallback when no teacher is linked or teacher_id column missing)
      const fetchAllPublished = async () => {
        let res = await supabaseAdmin
          .from('courses')
          .select('id, title, description, level, language, status, teacher_id, student_ids, total_students, total_lessons, short_description, category, created_at')
          .eq('status', 'published')
          .order('created_at', { ascending: false });
        if (res.error && isMissingCoursesStudentIdsError(res.error)) {
          res = await supabaseAdmin
            .from('courses')
            .select('id, title, description, level, language, status, teacher_id, total_students, total_lessons, short_description, category, created_at')
            .eq('status', 'published')
            .order('created_at', { ascending: false });
        }
        return res;
      };

      // If student has no linked teacher, return all published courses so they can see available ones
      if (!linkedTeacherId) {
        const fallbackRes = await fetchAllPublished();
        const courses = (fallbackRes.data || []).map((c: any) => ({
          ...c,
          student_ids: Array.isArray(c.student_ids) ? c.student_ids : [],
        }));
        return res.json({ success: true, courses });
      }

      // Resolve all candidate IDs for the teacher (handles teachers table row id vs auth uid)
      const teacherIds = await getTeacherIdCandidates(linkedTeacherId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [linkedTeacherId];

      // Fetch all published courses from those teacher IDs
      let coursesRes = await supabaseAdmin
        .from('courses')
        .select('id, title, description, level, language, status, teacher_id, student_ids, total_students, total_lessons, short_description, category, created_at')
        .in('teacher_id', scopedIds)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (coursesRes.error) {
        // Fallback 1: student_ids column missing — retry without it
        if (isMissingCoursesStudentIdsError(coursesRes.error)) {
          coursesRes = await supabaseAdmin
            .from('courses')
            .select('id, title, description, level, language, status, teacher_id, total_students, total_lessons, short_description, category, created_at')
            .in('teacher_id', scopedIds)
            .eq('status', 'published')
            .order('created_at', { ascending: false });
        }
        // Fallback 2: teacher_id column missing — fetch all published courses
        if (coursesRes.error) {
          const fallbackRes = await fetchAllPublished();
          if (!fallbackRes.error) {
            const courses = (fallbackRes.data || []).map((c: any) => ({
              ...c,
              student_ids: Array.isArray(c.student_ids) ? c.student_ids : [],
            }));
            return res.json({ success: true, courses });
          }
          throw coursesRes.error;
        }
      }

      const courses = (coursesRes.data || []).map((c: any) => ({
        ...c,
        student_ids: Array.isArray(c.student_ids) ? c.student_ids : [],
      }));

      return res.json({ success: true, courses });
    } catch (e: any) {
      console.error('GET /api/student/courses/available', e);
      return res.status(500).json({ error: e?.message || 'Failed to load available courses' });
    }
  });

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
  /**
   * Auto-certificate: called by the student client immediately after a passed quiz.
   * Verifies the attempt belongs to the caller, that they passed, then inserts a
   * certificate row (idempotent — won't double-issue for the same student + course)
   * and fires a certificateIssued notification.
   */
  app.post('/api/student/quiz/auto-certificate', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { attemptId } = req.body as { attemptId?: string };
      if (!attemptId) return res.status(400).json({ error: 'attemptId is required' });

      // 1. Fetch the attempt — must belong to this student and be passed
      const { data: attempt, error: attErr } = await supabaseAdmin
        .from('quiz_attempts')
        .select('id, quiz_id, student_id, score, total_points, passed, score_percent')
        .eq('id', attemptId)
        .maybeSingle()
        .catch(() => ({ data: null, error: null }));

      if (attErr) return res.status(500).json({ error: 'Could not fetch attempt' });
      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
      if (attempt.student_id !== caller.userId) return res.status(403).json({ error: 'Forbidden' });
      if (!attempt.passed) return res.status(400).json({ error: 'Student did not pass this quiz' });

      // 2. Fetch quiz details (title, course_id, teacher_id, type)
      const { data: quiz } = await supabaseAdmin
        .from('quizzes')
        .select('id, title, course_id, teacher_id, type')
        .eq('id', attempt.quiz_id)
        .maybeSingle()
        .catch(() => ({ data: null }));

      if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

      const courseId = quiz.course_id ? String(quiz.course_id) : null;
      const isExam = String(quiz.type || '').toLowerCase() === 'exam';

      // 3. Idempotency: for exams check per quiz_id; for regular quizzes check per course
      const dupCheck = isExam
        ? await supabaseAdmin.from('certificates').select('id, grade, score, certificate_number').eq('student_id', caller.userId).contains('meta', { quiz_id: quiz.id }).limit(1).maybeSingle().catch(() => ({ data: null }))
        : courseId
          ? await supabaseAdmin.from('certificates').select('id, grade, score, certificate_number').eq('student_id', caller.userId).eq('course_id', courseId).not('meta', 'cs', '{"quiz_type":"exam"}').limit(1).maybeSingle().catch(() => ({ data: null }))
          : await supabaseAdmin.from('certificates').select('id, grade, score, certificate_number').eq('student_id', caller.userId).contains('meta', { quiz_id: quiz.id }).limit(1).maybeSingle().catch(() => ({ data: null }));

      if ((dupCheck as any)?.data?.id) {
        const dup = (dupCheck as any).data;
        return res.json({ ok: true, duplicate: true, certificateId: dup.id, grade: dup.grade, score: dup.score, certificateNumber: dup.certificate_number });
      }

      // 4. Compute grade from score percentage
      const pct: number = attempt.score_percent != null
        ? Number(attempt.score_percent)
        : (attempt.total_points > 0 ? Math.round((attempt.score / attempt.total_points) * 100) : 0);

      const grade =
        pct >= 97 ? 'A+' :
        pct >= 93 ? 'A'  :
        pct >= 90 ? 'A-' :
        pct >= 87 ? 'B+' :
        pct >= 83 ? 'B'  :
        pct >= 80 ? 'B-' :
        pct >= 77 ? 'C+' :
        pct >= 73 ? 'C'  :
        pct >= 70 ? 'C-' :
        'D';

      // Derive a descriptive performance level from the grade
      const level =
        grade === 'A+' || grade === 'A'  ? 'Outstanding' :
        grade === 'A-' || grade === 'B+' ? 'Excellent' :
        grade === 'B'  || grade === 'B-' ? 'Very Good' :
        grade === 'C+' || grade === 'C'  ? 'Good' :
        grade === 'C-'                   ? 'Satisfactory' :
        'Pass';

      // 5. Generate unique certificate number
      const certYear = new Date().getFullYear();
      const certRand = Math.random().toString(36).toUpperCase().slice(2, 8);
      const certNumber = `CERT-${certYear}-${certRand}`;

      // 6. Determine certificate title
      //    For exams: use the exam title directly.
      //    For regular quizzes: use the course title (fallback to quiz title).
      let certTitle = quiz.title;
      if (!isExam && courseId) {
        const { data: course } = await supabaseAdmin.from('courses').select('title').eq('id', courseId).maybeSingle().catch(() => ({ data: null }));
        if (course?.title) certTitle = String(course.title);
      }

      // 7. Insert certificate with full meta
      const { data: cert, error: certErr } = await supabaseAdmin
        .from('certificates')
        .insert({
          student_id: caller.userId,
          course_id: courseId,
          title: certTitle,
          issued_at: new Date().toISOString().slice(0, 10),
          certificate_number: certNumber,
          grade,
          score: pct,
          status: 'issued',
          meta: {
            quiz_id: quiz.id,
            quiz_title: quiz.title,
            quiz_type: quiz.type || 'standard',
            level,
            score: attempt.score,
            total_points: attempt.total_points,
          },
        })
        .select('id')
        .maybeSingle();

      if (certErr || !cert?.id) {
        console.error('[auto-certificate] insert error:', certErr?.message);
        return res.status(500).json({ error: certErr?.message || 'Failed to create certificate' });
      }

      // 8. Fire certificateIssued notification (server-side, best-effort)
      try {
        const teacherId = quiz.teacher_id ? String(quiz.teacher_id) : undefined;
        await notifyEvent(
          supabaseAdmin,
          { isEventEnabled: isNotificationEnabled },
          'certificateIssued',
          {
            studentId: caller.userId,
            teacherId,
            courseId: courseId ?? undefined,
            courseTitle: certTitle,
            certificateId: cert.id,
            certificateNumber: certNumber,
          }
        );
      } catch { /* notifications are best-effort */ }

      return res.json({ ok: true, duplicate: false, certificateId: cert.id, certificateNumber: certNumber, grade, level, score: pct, totalPoints: attempt.total_points, earnedPoints: attempt.score });
    } catch (e: any) {
      console.error('[auto-certificate]', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  /** Look up the auto-issued certificate for the current student + a given quiz */
  app.get('/api/student/certificate/by-quiz', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const quizId = typeof req.query.quizId === 'string' ? req.query.quizId.trim() : '';
      if (!quizId) return res.status(400).json({ error: 'quizId is required' });

      const { data: cert } = await supabaseAdmin
        .from('certificates')
        .select('id, grade, score, certificate_number, title, issued_at, meta, status')
        .eq('student_id', caller.userId)
        .contains('meta', { quiz_id: quizId })
        .eq('status', 'issued')
        .limit(1)
        .maybeSingle()
        .catch(() => ({ data: null }));

      if (!cert) return res.json({ cert: null });

      const meta: any = cert.meta || {};
      return res.json({
        cert: {
          id: cert.id,
          grade: cert.grade,
          score: cert.score,
          certificateNumber: cert.certificate_number,
          title: cert.title,
          issuedAt: cert.issued_at,
          level: meta.level || null,
          totalPoints: meta.total_points ?? null,
          earnedPoints: meta.score ?? null,
        },
      });
    } catch (e: any) {
      console.error('[cert-by-quiz]', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  /** Headway Test Builder — get available grammar topics for a level */
  app.get('/api/student/headway-test/topics', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const level = typeof req.query.level === 'string' ? req.query.level.trim() : 'Pre-Intermediate';
      const topics = getTopicsForLevel(level).map(s => ({ topic: s.topic, type: s.type, count: s.questions.length }));
      return res.json({ level, topics });
    } catch (e: any) {
      console.error('[headway-test/topics]', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  /** Headway Test Builder — student submits test answers with user_id tracking */
  app.post('/api/student/headway-test/submit', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;

      const body = req.body as {
        level: string;
        selectedTopics: string[];
        answers: Array<{ questionIdx: number; chosen: string; correct: string }>;
        score: number;
        total: number;
        timeTakenSeconds?: number;
      };

      const { level, selectedTopics, answers, score, total } = body;
      if (!level || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'level and answers are required' });
      }

      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

      // Auto-create headway_test_results table if not exists (idempotent)
      await supabaseAdmin.rpc('exec_sql', {
        sql: `CREATE TABLE IF NOT EXISTS headway_test_results (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id uuid NOT NULL,
          level text NOT NULL,
          selected_topics text[] DEFAULT '{}',
          answers jsonb DEFAULT '[]',
          score int NOT NULL DEFAULT 0,
          total int NOT NULL DEFAULT 0,
          percentage int NOT NULL DEFAULT 0,
          time_taken_seconds int,
          created_at timestamptz DEFAULT now()
        );`
      }).catch(() => null); // ignore if rpc not available; table may already exist

      const { data: row, error: insErr } = await supabaseAdmin
        .from('headway_test_results')
        .insert({
          user_id: caller.userId,
          level,
          selected_topics: selectedTopics ?? [],
          answers,
          score,
          total,
          percentage,
          time_taken_seconds: body.timeTakenSeconds ?? null,
        })
        .select('id, created_at')
        .maybeSingle();

      if (insErr) {
        // If table doesn't exist yet, still return success — result stored client-side
        console.warn('[headway-test/submit] DB insert warning:', insErr.message);
        return res.json({ ok: true, stored: false, percentage, message: 'Score calculated but not saved to DB — table may need migration.' });
      }

      return res.json({ ok: true, stored: true, id: row?.id, percentage });
    } catch (e: any) {
      console.error('[headway-test/submit]', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/student/quizzes', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: student or admin role required' });
      }

      const requestedCourseId = typeof req.query.courseId === 'string' ? req.query.courseId.trim() : '';

      let enrolledCourses: any[] = [];
      {
        const { data: ecData, error: ecErr } = await supabaseAdmin
          .from('courses')
          .select('id,title,level')
          .contains('student_ids', [caller.userId]);
        if (ecErr) {
          // courses.student_ids column may not exist in all deployments — fall back gracefully
          if (!isMissingCoursesStudentIdsError(ecErr)) throw ecErr;
          // column missing: rely on classes-based enrollment only
          enrolledCourses = [];
        } else {
          enrolledCourses = ecData || [];
        }
      }

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
      const courseLevelById: Record<string, string> = {};
      (enrolledCourses || []).forEach((course: any) => {
        courseTitleById[String(course.id)] = String(course.title || 'Course');
        courseLevelById[String(course.id)] = String(course.level || '');
      });
      if (classCourseIds.length > 0) {
        const missingTitleIds = classCourseIds.filter((cid) => !courseTitleById[cid]);
        if (missingTitleIds.length > 0) {
          const { data: classLinkedCourses } = await supabaseAdmin
            .from('courses')
            .select('id,title,level')
            .in('id', missingTitleIds);
          (classLinkedCourses || []).forEach((course: any) => {
            courseTitleById[String(course.id)] = String(course.title || 'Course');
            courseLevelById[String(course.id)] = String(course.level || '');
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
      }).map((row: any) => {
        const resolvedCourseId = String(row?.course_id || '') || lessonToCourse[String(row?.lesson_id || '')] || '';
        return {
          ...row,
          course_id: resolvedCourseId,
          course_title: courseTitleById[resolvedCourseId] || 'Course',
          course_level: courseLevelById[resolvedCourseId] || '',
        };
      });

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
        .select('id,course_id,lesson_id,settings')
        .eq('id', quizId)
        .maybeSingle();
      if (quizErr) throw quizErr;
      if (!quizRow?.id) return res.status(404).json({ error: 'Quiz not found' });

      const quizSettings = (quizRow as any)?.settings;
      const doShuffleQuestions = quizSettings?.shuffleQuestions === true;
      const doShuffleAnswers = quizSettings?.shuffleAnswers === true;

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

      // courses.student_ids column may not exist — handle gracefully
      let hasDirectAccess = false;
      const { data: directCourseRows, error: directErr } = await supabaseAdmin
        .from('courses')
        .select('id')
        .eq('id', resolvedCourseId)
        .contains('student_ids', [caller.userId]);
      if (directErr) {
        if (!isMissingCoursesStudentIdsError(directErr)) throw directErr;
        // column missing — allow; classes check below may still restrict
        hasDirectAccess = false;
      } else {
        hasDirectAccess = (directCourseRows || []).length > 0;
      }

      const { data: classRows, error: classErr } = await supabaseAdmin
        .from('classes')
        .select('id,course_id,student_ids')
        .eq('course_id', resolvedCourseId)
        .contains('student_ids', [caller.userId]);
      if (classErr && !isClassesTableMissing(classErr)) throw classErr;

      // When courses.student_ids is missing we can't verify direct enrollment,
      // so we fall back to: allow if the quiz is published (best-effort for partial schemas).
      const isMissingDirectCheck = !!(directErr && isMissingCoursesStudentIdsError(directErr));
      const hasAccess = hasDirectAccess || (classRows || []).length > 0 || caller.role === 'admin' || isMissingDirectCheck;
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

      let questions: any[] = qRes.data || [];

      if (doShuffleQuestions || doShuffleAnswers) {
        const seed = `${caller.userId}:${quizId}`;
        if (doShuffleQuestions) {
          questions = seededShuffle(questions, seed);
        }
        if (doShuffleAnswers) {
          questions = questions.map((q: any) => ({
            ...q,
            options: Array.isArray(q.options) && q.options.length > 1
              ? seededShuffle(q.options, `${seed}:${String(q.id)}`)
              : q.options,
          }));
        }
      }

      return res.json({
        success: true,
        questions,
        shuffled: { questions: doShuffleQuestions, answers: doShuffleAnswers },
      });
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

      await notifInsert({
        user_id: teacherId,
        title: 'Quiz Integrity Alert',
        message: `${studentLabel} triggered a quiz violation in "${quizTitle}". ${violationInfo}`.trim(),
        type: 'warning',
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

  // Student modules: returns all modules for enrolled courses via supabaseAdmin (bypasses RLS).
  app.get('/api/student/modules', async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Resolve enrolled course IDs using the same multi-path logic as /api/student/courses/available
      const uid = caller.userId;

      // Path A: direct student_ids enrollment
      let courseIds: string[] = [];
      const directRes = await supabaseAdmin.from('courses')
        .select('id,title,level,status')
        .contains('student_ids', [uid])
        .eq('status', 'published');
      if (!directRes.error) {
        courseIds = (directRes.data || []).map((c: any) => String(c.id));
      }

      // Path B: class-based enrollment
      const classRes = await supabaseAdmin.from('classes').select('course_id').contains('student_ids', [uid]);
      if (!classRes.error && classRes.data?.length) {
        const classCourseIds = classRes.data.map((r: any) => String(r.course_id)).filter(Boolean);
        const missing = classCourseIds.filter((id) => !courseIds.includes(id));
        if (missing.length) {
          const extraRes = await supabaseAdmin.from('courses').select('id').in('id', missing).eq('status', 'published');
          if (!extraRes.error) courseIds.push(...(extraRes.data || []).map((c: any) => String(c.id)));
        }
      }

      // Path C: teacher-linked courses (via profile.teacher_id)
      if (!courseIds.length) {
        const profileRes = await supabaseAdmin.from('profiles').select('teacher_id').eq('id', uid).single();
        const teacherId = profileRes.data?.teacher_id;
        if (teacherId) {
          const teacherCourses = await supabaseAdmin.from('courses').select('id').eq('teacher_id', teacherId).eq('status', 'published');
          if (!teacherCourses.error) courseIds.push(...(teacherCourses.data || []).map((c: any) => String(c.id)));
        }
        if (!courseIds.length) {
          // fallback: all published courses
          const allRes = await supabaseAdmin.from('courses').select('id').eq('status', 'published');
          if (!allRes.error) courseIds.push(...(allRes.data || []).map((c: any) => String(c.id)));
        }
      }

      courseIds = [...new Set(courseIds)];
      if (!courseIds.length) return res.json({ success: true, modules: [], courses: [] });

      // Fetch course details + modules + lesson counts
      const [coursesRes, modulesRes] = await Promise.all([
        supabaseAdmin.from('courses').select('id,title,level').in('id', courseIds),
        supabaseAdmin.from('modules').select('id,title,description,order,status,course_id,created_at').in('course_id', courseIds).order('order', { ascending: true }),
      ]);

      const moduleIds = (modulesRes.data || []).map((m: any) => String(m.id));
      const lessonsRes = moduleIds.length
        ? await supabaseAdmin.from('lessons').select('id,module_id').in('module_id', moduleIds)
        : { data: [] };

      const lessonsByModule: Record<string, number> = {};
      (lessonsRes.data || []).forEach((l: any) => { lessonsByModule[l.module_id] = (lessonsByModule[l.module_id] || 0) + 1; });

      const courseTitleMap: Record<string, string> = {};
      const courseLevelMap: Record<string, string> = {};
      (coursesRes.data || []).forEach((c: any) => { courseTitleMap[c.id] = c.title || ''; courseLevelMap[c.id] = c.level || ''; });

      const modules = (modulesRes.data || []).map((m: any) => ({
        id: m.id,
        title: m.title || 'Untitled Module',
        description: m.description || '',
        order: m.order ?? 0,
        status: m.status || 'active',
        course_id: m.course_id,
        courseTitle: courseTitleMap[m.course_id] || 'Course',
        courseLevel: courseLevelMap[m.course_id] || '',
        lessonCount: lessonsByModule[m.id] || 0,
        createdAt: m.created_at || '',
      }));

      const courses = (coursesRes.data || []).map((c: any) => ({ id: c.id, title: c.title || 'Course', level: c.level || '' }));
      return res.json({ success: true, modules, courses });
    } catch (e: any) {
      console.error('GET /api/student/modules', e);
      return res.status(500).json({ error: e?.message || 'Failed to load modules' });
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

      // --- Suggestion 9: Auto-issue certificate when all lessons complete ---
      let autoCertificateIssued = false;
      if (completed) {
        try {
          const lessonSnap = await supabaseAdmin.from('lessons').select('course_id').eq('id', lessonId).maybeSingle();
          const courseId = lessonSnap.data?.course_id ? String(lessonSnap.data.course_id) : '';
          if (courseId) {
            const allLessonsRes = await supabaseAdmin.from('lessons').select('id').eq('course_id', courseId).eq('status', 'published');
            const allLessonIds = (allLessonsRes.data || []).map((l: any) => String(l.id));
            if (allLessonIds.length > 0) {
              const progressRes = await fetchLessonProgressRows(caller.userId, allLessonIds);
              const completedIds = new Set(
                (progressRes.rows || [])
                  .filter((p: any) => toLessonCompleted(p))
                  .map((p: any) => String(p.lesson_id))
              );
              const allComplete = allLessonIds.every(id => completedIds.has(id));
              if (allComplete) {
                const existingCert = await supabaseAdmin
                  .from('certificates')
                  .select('id')
                  .eq('student_id', caller.userId)
                  .eq('course_id', courseId)
                  .maybeSingle();
                if (!existingCert.error && !existingCert.data) {
                  await supabaseAdmin.from('certificates').insert({
                    student_id: caller.userId,
                    course_id: courseId,
                    status: 'issued',
                    issued_date: new Date().toISOString(),
                  });
                  autoCertificateIssued = true;
                  console.log(`[auto-cert] Certificate issued student=${caller.userId} course=${courseId}`);
                }
              }
            }
          }
        } catch (certErr: any) {
          console.warn('[auto-cert] Failed to issue certificate:', certErr?.message);
        }
      }

      return res.json({ success: true, progress: upsertRes.row, storage: upsertRes.storage, autoCertificateIssued });
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
      const studentLiveSessionsCacheKey = `student-live-sessions:${caller.userId}:${String(status || "all")}`;
      const cachedLiveSessions = getCachedApiResponse<any>(studentLiveSessionsCacheKey);
      if (cachedLiveSessions) return res.json(cachedLiveSessions);

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
      const payload = { success: true, sessions: data || [] };
      setCachedApiResponse(studentLiveSessionsCacheKey, payload, 15_000);
      res.json(payload);
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
      const adminUpdatePayload: Record<string, unknown> = { ...req.body, updated_at: new Date().toISOString() };
      let updateResult = await supabaseAdmin
        .from('live_sessions').update(adminUpdatePayload).eq('id', req.params.id).select().single();
      if (updateResult.error && isLiveSessionsStartedAtColumnMissing(updateResult.error) && 'started_at' in adminUpdatePayload) {
        const { started_at: _startedAt, ...fallbackUpdate } = adminUpdatePayload;
        updateResult = await supabaseAdmin
          .from('live_sessions').update(fallbackUpdate).eq('id', req.params.id).select().single();
      }
      const { data, error } = updateResult;
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
  const RQ_REPORT_SECTION_PREFIX = 'rq_report:';

  const rqPersistReport = async (report: RQReport): Promise<void> => {
    try {
      await supabaseAdmin.from('platform_config').upsert(
        { section: `${RQ_REPORT_SECTION_PREFIX}${report.id}`, value: report as any, updated_at: new Date().toISOString() },
        { onConflict: 'section' }
      );
    } catch (e) { console.warn('[rq] persist report failed:', e); }
  };

  const rqRestoreReportsFromDB = async (): Promise<void> => {
    try {
      const { data } = await supabaseAdmin
        .from('platform_config')
        .select('section, value')
        .like('section', `${RQ_REPORT_SECTION_PREFIX}%`);
      if (!data) return;
      let count = 0;
      for (const row of data) {
        const r = row.value as any;
        if (!r?.id) continue;
        rqCompletedSessions.set(r.id, r as RQReport);
        count++;
      }
      if (count > 0) console.log(`[rq] Restored ${count} completed quiz report(s) from DB`);
    } catch (e) { console.warn('[rq] restoreReportsFromDB failed:', e); }
  };

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

  // ── Badge DB persistence (survive server restarts) ──────────────────────────
  const BADGE_SECTION_PREFIX = 'rq_badge:';

  const rqPersistBadgeState = async (userId: string): Promise<void> => {
    try {
      const badges = [...(studentBadges.get(userId) ?? [])];
      const quizCount  = studentQuizCount.get(userId)  ?? 0;
      const passStreak = studentPassStreak.get(userId) ?? 0;
      await supabaseAdmin.from('platform_config').upsert(
        { section: `${BADGE_SECTION_PREFIX}${userId}`, value: { badges, quizCount, passStreak }, updated_at: new Date().toISOString() },
        { onConflict: 'section' }
      );
    } catch { /* non-critical */ }
  };

  const rqRestoreBadgeStateFromDB = async (): Promise<void> => {
    try {
      const { data } = await supabaseAdmin
        .from('platform_config')
        .select('section, value')
        .like('section', `${BADGE_SECTION_PREFIX}%`);
      if (!data) return;
      let restored = 0;
      for (const row of data) {
        const userId = (row.section as string).slice(BADGE_SECTION_PREFIX.length);
        const d = row.value as any;
        if (!userId || !d) continue;
        if (Array.isArray(d.badges))           studentBadges.set(userId, new Set<string>(d.badges));
        if (typeof d.quizCount  === 'number')  studentQuizCount.set(userId, d.quizCount);
        if (typeof d.passStreak === 'number')  studentPassStreak.set(userId, d.passStreak);
        restored++;
      }
      if (restored > 0) console.log(`[badges] Restored badge state for ${restored} user(s)`);
    } catch { /* non-critical */ }
  };
  rqRestoreBadgeStateFromDB().catch(() => {});
  // ────────────────────────────────────────────────────────────────────────────

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
    rqPersistBadgeState(userId).catch(() => {});
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
        const _autoReport1 = buildRQReport(s);
        rqCompletedSessions.set(s.id, _autoReport1);
        rqPersistReport(_autoReport1).catch(() => {});
        const board = rqLeaderboard(s);
        await rqBroadcast(sessionId, 'session_ended', { leaderboard: board });
        rqDeleteSessionFromDB(sessionId).catch(() => {});
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
        rqPersistSession(s).catch(() => {});
        rqScheduleAutoNext(sessionId);
      }
    }, q.timerSeconds * 1000 + 500);
  };

  // ─── LIVE QUIZ SESSION PERSISTENCE (survive server restarts) ─────────────────
  const RQ_SESSION_SECTION_PREFIX = 'teacher/live-quiz:';
  const RQ_SESSION_SECTION_PREFIX_LEGACY = 'rq_session:';
  const rqSectionForSession = (sessionId: string) => `${RQ_SESSION_SECTION_PREFIX}${sessionId}`;
  const rqLegacySectionForSession = (sessionId: string) => `${RQ_SESSION_SECTION_PREFIX_LEGACY}${sessionId}`;

  const rqSerializeSession = (s: RQSession) => ({
    id: s.id, quizId: s.quizId, quizTitle: s.quizTitle, hostId: s.hostId,
    pin: s.pin, status: s.status, currentQuestionIndex: s.currentQuestionIndex,
    questionStartedAt: s.questionStartedAt, questions: s.questions,
    createdAt: s.createdAt, teamsEnabled: s.teamsEnabled, teamCount: s.teamCount,
    teamNames: s.teamNames, participantTeams: s.participantTeams, teamScores: s.teamScores,
    participants: Object.fromEntries(s.participants.entries()),
  });

  const rqPersistSession = async (s: RQSession) => {
    try {
      await supabaseAdmin.from('platform_config')
        .upsert(
          { section: rqSectionForSession(s.id), value: rqSerializeSession(s), updated_at: new Date().toISOString() },
          { onConflict: 'section' }
        );
      // Clean up legacy key once new key is saved.
      await supabaseAdmin.from('platform_config').delete().eq('section', rqLegacySectionForSession(s.id));
    } catch (e) { console.warn('[rq] persist failed:', e); }
  };

  const rqDeleteSessionFromDB = async (sessionId: string) => {
    try {
      await supabaseAdmin
        .from('platform_config')
        .delete()
        .in('section', [rqSectionForSession(sessionId), rqLegacySectionForSession(sessionId)]);
    } catch (e) { console.warn('[rq] delete from DB failed:', e); }
  };

  const rqRestoreSingleSessionFromDB = async (sessionId: string): Promise<RQSession | null> => {
    try {
      const { data, error } = await supabaseAdmin
        .from('platform_config')
        .select('section, value')
        .in('section', [rqSectionForSession(sessionId), rqLegacySectionForSession(sessionId)])
        .maybeSingle();
      if (error || !data?.value) return null;
      const d = data.value as any;
      if (!d?.id || d.id !== sessionId || !d?.status) return null;
      if (d.status === 'ended') {
        await supabaseAdmin.from('platform_config').delete().eq('section', data.section);
        return null;
      }
      const session: RQSession = {
        id: d.id, quizId: d.quizId, quizTitle: d.quizTitle, hostId: d.hostId,
        pin: d.pin, status: d.status, currentQuestionIndex: d.currentQuestionIndex ?? 0,
        questionStartedAt: d.questionStartedAt ?? null, questions: d.questions ?? [],
        createdAt: d.createdAt ?? Date.now(),
        teamsEnabled: Boolean(d.teamsEnabled), teamCount: d.teamCount ?? 2,
        teamNames: Array.isArray(d.teamNames) ? d.teamNames : ['Red', 'Blue'],
        participantTeams: d.participantTeams ?? {},
        teamScores: d.teamScores ?? {},
        participants: new Map(Object.entries(d.participants ?? {})),
      };
      rqSessions.set(session.id, session);
      rqPins.set(session.pin, session.id);
      if (session.status === 'active') rqScheduleAutoNext(session.id);
      return session;
    } catch {
      return null;
    }
  };

  const rqRestoreSessionsFromDB = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from('platform_config')
        .select('section, value')
        .or(`section.like.${RQ_SESSION_SECTION_PREFIX}%,section.like.${RQ_SESSION_SECTION_PREFIX_LEGACY}%`);
      if (error || !data) return;
      let restored = 0;
      for (const row of data) {
        try {
          const d = row.value as any;
          if (!d?.id || !d?.status) continue;
          if (d.status === 'ended') {
            // Clean up ended sessions from DB
            await supabaseAdmin.from('platform_config').delete().eq('section', row.section);
            continue;
          }
          // Check if session expired (older than 3 hours)
          const msLeft = (d.createdAt ?? 0) + 3 * 60 * 60 * 1000 - Date.now();
          if (msLeft <= 0) {
            await supabaseAdmin.from('platform_config').delete().eq('section', row.section);
            continue;
          }
          // Reconstruct session
          const session: RQSession = {
            id: d.id, quizId: d.quizId, quizTitle: d.quizTitle, hostId: d.hostId,
            pin: d.pin, status: d.status, currentQuestionIndex: d.currentQuestionIndex ?? 0,
            questionStartedAt: d.questionStartedAt ?? null, questions: d.questions ?? [],
            createdAt: d.createdAt ?? Date.now(),
            teamsEnabled: Boolean(d.teamsEnabled), teamCount: d.teamCount ?? 2,
            teamNames: Array.isArray(d.teamNames) ? d.teamNames : ['Red', 'Blue'],
            participantTeams: d.participantTeams ?? {},
            teamScores: d.teamScores ?? {},
            participants: new Map(Object.entries(d.participants ?? {})),
          };
          rqSessions.set(session.id, session);
          rqPins.set(session.pin, session.id);
          // Reschedule auto-next if session is active
          if (session.status === 'active') {
            rqScheduleAutoNext(session.id);
          }
          // Auto-clean when remaining lifetime expires
          setTimeout(() => {
            const s = rqSessions.get(session.id);
            if (s) { rqPins.delete(s.pin); rqSessions.delete(session.id); }
            rqDeleteSessionFromDB(session.id).catch(() => {});
          }, msLeft);
          restored++;
        } catch (e) { console.warn('[rq] restore session failed:', e); }
      }
      if (restored > 0) console.log(`[rq] Restored ${restored} live quiz session(s) from DB`);
    } catch (e) { console.warn('[rq] restoreSessionsFromDB failed:', e); }
  };

  // Restore sessions and completed reports immediately (fire-and-forget)
  rqRestoreSessionsFromDB().catch(() => {});
  rqRestoreReportsFromDB().catch(() => {});
  // ─── END LIVE QUIZ SESSION PERSISTENCE ───────────────────────────────────────

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

      // Persist session so it survives server restarts
      await rqPersistSession(session);

      // Auto-clean sessions after 3 hours
      setTimeout(() => {
        const s = rqSessions.get(sessionId);
        if (s) { rqPins.delete(s.pin); rqSessions.delete(sessionId); }
        rqDeleteSessionFromDB(sessionId).catch(() => {});
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
      const session =
        rqSessions.get(req.params.sessionId) ??
        (await rqRestoreSingleSessionFromDB(req.params.sessionId));
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
  // Merge any DB-persisted reports that are missing from the in-memory map.
  // Called by the list endpoint so the first page-load after a restart is correct.
  const rqSyncReportsFromDB = async (): Promise<void> => {
    try {
      const { data } = await supabaseAdmin
        .from('platform_config')
        .select('section, value')
        .like('section', `${RQ_REPORT_SECTION_PREFIX}%`);
      if (!data) return;
      for (const row of data) {
        const r = row.value as any;
        if (!r?.id || rqCompletedSessions.has(r.id)) continue;
        rqCompletedSessions.set(r.id, r as RQReport);
      }
    } catch (_) { /* non-critical */ }
  };

  app.get('/api/teacher/rq-reports', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      // Always sync from DB so reports aren't lost across server restarts
      await rqSyncReportsFromDB();
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
      let report = rqCompletedSessions.get(req.params.sessionId);
      // Fallback: load from DB if not in memory
      if (!report) {
        try {
          const { data } = await supabaseAdmin
            .from('platform_config')
            .select('value')
            .eq('section', `${RQ_REPORT_SECTION_PREFIX}${req.params.sessionId}`)
            .maybeSingle();
          if (data?.value) {
            report = data.value as RQReport;
            rqCompletedSessions.set(report.id, report);
          }
        } catch (_) {}
      }
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
      const session =
        rqSessions.get(req.params.sessionId) ??
        (await rqRestoreSingleSessionFromDB(req.params.sessionId));
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
        rqPersistSession(session).catch(() => {});
        rqScheduleAutoNext(session.id);
        return res.json({ success: true, status: 'active', questionIndex: 0 });
      }

      if (session.status === 'active') {
        if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
        const nextIndex = session.currentQuestionIndex + 1;
        if (nextIndex >= session.questions.length) {
          session.status = 'ended';
          rqPins.delete(session.pin);
          const _nextReport = buildRQReport(session);
          rqCompletedSessions.set(session.id, _nextReport);
          rqPersistReport(_nextReport).catch(() => {});
          const board = rqLeaderboard(session);
          await rqBroadcast(session.id, 'session_ended', { leaderboard: board });
          rqDeleteSessionFromDB(session.id).catch(() => {});
          return res.json({ success: true, status: 'ended', leaderboard: board });
        }
        session.currentQuestionIndex = nextIndex;
        session.questionStartedAt = Date.now();
        const nq = session.questions[nextIndex];
        await rqBroadcast(session.id, 'question_started', {
          index: nq.index, body: nq.body, options: nq.options, points: nq.points,
          timerSeconds: nq.timerSeconds, startedAt: session.questionStartedAt,
        });
        rqPersistSession(session).catch(() => {});
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
      const session =
        rqSessions.get(req.params.sessionId) ??
        (await rqRestoreSingleSessionFromDB(req.params.sessionId));
      if (!session) return res.status(404).json({ error: 'Session not found.' });
      if (session.hostId !== caller.userId && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
      session.status = 'ended';
      rqPins.delete(session.pin);
      const _endReport = buildRQReport(session);
      rqCompletedSessions.set(session.id, _endReport);
      rqPersistReport(_endReport).catch(() => {});
      const board = rqLeaderboard(session);
      await rqBroadcast(session.id, 'session_ended', { leaderboard: board });
      rqDeleteSessionFromDB(session.id).catch(() => {});
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
        rqPersistSession(session).catch(() => {});
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
  // In-memory set to prevent race-condition double-submissions on the answer endpoint.
  // Key: `${sessionId}:${userId}:${questionIndex}`
  const rqAnswerProcessing = new Set<string>();

  app.post('/api/student/realtime-quiz/:sessionId/answer', async (req: Request, res: Response) => {
    let _rqKey = '';
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

      // Race-condition guard: prevent two simultaneous requests from both passing
      // the "already answered" check above before either has written the answer.
      _rqKey = `${req.params.sessionId}:${caller.userId}:${questionIndex}`;
      if (rqAnswerProcessing.has(_rqKey)) {
        return res.status(429).json({ error: 'Answer is being processed, please wait.' });
      }
      rqAnswerProcessing.add(_rqKey);
      // Key is removed in the finally block below

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

      rqPersistSession(session).catch(() => {});

      res.json({
        success: true, isCorrect, pointsEarned, correctAnswer: q.correctAnswer, score: participant.score,
        teamScore: session.teamsEnabled && session.participantTeams[caller.userId]
          ? session.teamScores[session.participantTeams[caller.userId]] : null,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit answer.' });
    } finally {
      if (_rqKey) rqAnswerProcessing.delete(_rqKey);
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
    await notifInsert({
      user_id: userId,
      title,
      message: message.slice(0, 240),
      type: 'info',
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

    await notifInsert(notifRows);

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

  // ── Teacher Announcement routes (same logic as admin, accessible to teacher or admin) ──
  app.get('/api/teacher/announcements', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { data, error } = await supabaseAdmin
        .from('announcements')
        .select('*, author:profiles!author_id(id,display_name,email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, announcements: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/teacher/announcements', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { class_ids, student_ids, send_email, ...body } = req.body || {};
      const payload = {
        ...body,
        author_id: body.author_id || caller.userId,
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
          title: String(body.title || ''), content: String(body.content || ''),
          priority: String(body.priority || 'normal'), audience: String(body.target_audience || 'all'),
          classIds, studentIds, sendEmail: Boolean(send_email),
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/teacher/announcements/:id', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
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
          title: String((body.title ?? data?.title) || ''), content: String((body.content ?? data?.content) || ''),
          priority: String((body.priority ?? data?.priority) || 'normal'), audience: String((body.target_audience ?? data?.target_audience) || 'all'),
          classIds, studentIds, sendEmail: Boolean(send_email),
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/teacher/announcements/:id', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { error } = await supabaseAdmin.from('announcements').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/teacher/announcements/:id/resend', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const { data: ann, error } = await supabaseAdmin.from('announcements').select('*').eq('id', req.params.id).maybeSingle();
      if (error) throw error;
      if (!ann) return res.status(404).json({ error: 'Announcement not found' });
      const count = await sendAnnouncementNotifications({
        title: String(ann.title || ''), content: String(ann.content || ''),
        priority: String(ann.priority || 'normal'), audience: String(ann.target_audience || 'all'),
        classIds: [], studentIds: [], sendEmail: false,
      });
      res.json({ success: true, count });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/teacher/brevo/status', async (_req: Request, res: Response) => {
    const configured = isEmailConfigured();
    if (!configured) return res.json({ configured: false, connected: false, reason: 'BREVO_API_KEY, BREVO_SENDER_EMAIL or BREVO_SENDER_NAME is missing.' });
    try {
      const apiKey = process.env.BREVO_API_KEY || '';
      const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': apiKey, 'accept': 'application/json' } });
      const json = await r.json() as any;
      if (!r.ok) return res.json({ configured: true, connected: false, reason: json?.message || `Brevo returned ${r.status}` });
      res.json({ configured: true, connected: true, email: json?.email, plan: json?.plan?.[0]?.title, senderEmail: process.env.BREVO_SENDER_EMAIL || '', senderName: process.env.BREVO_SENDER_NAME || '' });
    } catch (e: any) { res.json({ configured: true, connected: false, reason: e.message }); }
  });

  // ── POST /api/teacher/students/:studentId/reset-password — teacher resets a student's password ──
  app.post("/api/teacher/students/:studentId/reset-password", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const studentId = String(req.params.studentId || "").trim();
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : "";
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const { data: student, error: sErr } = await supabaseAdmin
        .from("profiles").select("id, role, teacher_id, display_name, email").eq("id", studentId).maybeSingle();
      if (sErr) throw sErr;
      if (!student) return res.status(404).json({ error: "Student not found" });
      if (student.role !== "student") return res.status(400).json({ error: "Target user is not a student" });

      if (caller.role === "teacher") {
        const teacherIds = await getTeacherIdCandidates(caller.userId);
        const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];
        if (!scopedIds.includes(String(student.teacher_id))) {
          return res.status(403).json({ error: "Forbidden: student is not linked to your account" });
        }
      }

      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(studentId, { password: newPassword });
      if (updErr) throw updErr;

      return res.json({ success: true, message: `Password updated for ${student.display_name || student.email}` });
    } catch (e: any) {
      console.error("POST /api/teacher/students/:studentId/reset-password", e);
      return res.status(500).json({ error: e?.message || "Failed to reset password" });
    }
  });

  // ── GET /api/teacher/students/:studentId/detail — full student detail for progress view ──
  app.get("/api/teacher/students/:studentId/detail", async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const studentId = String(req.params.studentId || "").trim();
      if (!studentId) return res.status(400).json({ error: "studentId is required" });

      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,email,role,status,teacher_id,created_at")
        .eq("id", studentId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: "Student not found" });
      if (profile.role !== "student") return res.status(400).json({ error: "Target user is not a student" });

      if (caller.role === "teacher") {
        const teacherIds = await getTeacherIdCandidates(caller.userId);
        const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];

        const isLinked = scopedIds.includes(String(profile.teacher_id || ""));
        if (!isLinked) {
          // Also allow if student enrolled in teacher's courses or classes
          const courseRowsCk = await fetchTeacherCourseRows(scopedIds, true);
          const studentInCourse = courseRowsCk.some((c: any) =>
            Array.isArray(c.student_ids) && c.student_ids.map(String).includes(studentId)
          );
          const classRowsCk = await supabaseAdmin
            .from("classes").select("student_ids").in("teacher_id", scopedIds);
          const studentInClass = (classRowsCk.data || []).some((cl: any) =>
            Array.isArray(cl.student_ids) && cl.student_ids.map(String).includes(studentId)
          );
          if (!studentInCourse && !studentInClass) {
            return res.status(403).json({ error: "Forbidden: student is not linked to your account" });
          }
        }
      }

      // Enrolled courses
      const courseRowsRes = await supabaseAdmin
        .from("courses")
        .select("id,title,student_ids")
        .not("student_ids", "is", null);
      const allCourses = (courseRowsRes.data || []);
      const enrolledCourses = allCourses
        .filter((c: any) => Array.isArray(c.student_ids) && c.student_ids.map(String).includes(studentId))
        .map((c: any) => ({ id: String(c.id), title: String(c.title || "Untitled"), role: "student" }));

      // Quiz attempts
      const teacherIds2 = caller.role === "teacher"
        ? (await getTeacherIdCandidates(caller.userId).then(ids => ids.length > 0 ? ids : [caller.userId]))
        : null;
      const teacherCourseIds = teacherIds2
        ? (await fetchTeacherCourseRows(teacherIds2)).map((c: any) => String(c.id || "")).filter(Boolean)
        : [];

      let quizRows: any[] = [];
      if (teacherCourseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("id,title,course_id,settings,passing_score,pass_mark").in("course_id", teacherCourseIds);
        if (!quizzesRes.error) quizRows = quizzesRes.data || [];
      }
      const quizIds = new Set<string>(quizRows.map((q: any) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q: any) => {
        const raw = q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark;
        acc[String(q.id)] = Number.isFinite(Number(raw)) ? Number(raw) : 50;
        return acc;
      }, {});

      const attemptRows = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds: new Set([studentId]) }),
        passingScoreByQuiz
      ).filter((a: any) => String(a.student_id || "") === studentId && quizIds.has(String(a.quiz_id || "")));

      const attempts = attemptRows.length;
      const passed = attemptRows.filter((a: any) => a.passed).length;
      const failed = attempts - passed;
      const scoreSum = attemptRows.reduce((s: number, a: any) => s + (Number(a.score_percent) || 0), 0);
      const avgScore = attempts > 0 ? Math.round(scoreSum / attempts) : 0;
      const passRate = attempts > 0 ? Math.round((passed / attempts) * 100) : 0;
      const sorted = [...attemptRows].sort((a: any, b: any) =>
        new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime()
      );
      const lastAttemptDate: string | null = sorted[0]?.completed_at || null;

      const quizHistory = sorted.map((a: any) => {
        const quiz = quizRows.find((q: any) => String(q.id || "") === String(a.quiz_id || ""));
        return {
          quizId: String(a.quiz_id || ""),
          quizTitle: quiz?.title || "Quiz",
          score: Math.round(Number(a.score_percent) || 0),
          passed: Boolean(a.passed),
          completedAt: a.completed_at || null,
        };
      });

      // Weekly activity — last 7 days
      const now = Date.now();
      const weeklyActivity = Array.from({ length: 7 }).map((_, i) => {
        const day = new Date(now - (6 - i) * 86400000);
        const label = day.toLocaleDateString("en-US", { weekday: "short" });
        const dayStr = day.toISOString().slice(0, 10);
        const dayAttempts = attemptRows.filter((a: any) => {
          const d = a.completed_at ? new Date(a.completed_at).toISOString().slice(0, 10) : "";
          return d === dayStr;
        });
        const dayAvg = dayAttempts.length > 0
          ? Math.round(dayAttempts.reduce((s: number, a: any) => s + (Number(a.score_percent) || 0), 0) / dayAttempts.length)
          : 0;
        return { day: label, attempts: dayAttempts.length, avgScore: dayAvg };
      });

      return res.json({
        success: true,
        student: {
          id: String(profile.id),
          displayName: String(profile.display_name || "Unknown Student"),
          email: String(profile.email || ""),
          status: String(profile.status || "inactive"),
          createdAt: profile.created_at || null,
          teacherId: profile.teacher_id || null,
          enrolledCourses,
          attempts,
          passed,
          failed,
          avgScore,
          passRate,
          lastAttemptDate,
          quizHistory,
          weeklyActivity,
        },
      });
    } catch (e: any) {
      console.error("GET /api/teacher/students/:studentId/detail", e);
      return res.status(500).json({ error: e?.message || "Failed to load student details" });
    }
  });

  // GET /api/student/assignments — list published assignments visible to this student
  app.get('/api/student/assignments', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'student' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

      const { data: profile } = await supabaseAdmin
        .from('profiles').select('teacher_id').eq('id', caller.userId).maybeSingle();

      const teacherId: string | null = profile?.teacher_id || null;
      console.log(`[student/assignments] student=${caller.userId} teacher_id=${teacherId}`);
      if (!teacherId) {
        console.log('[student/assignments] no teacher_id on profile — returning empty');
        return res.json({ success: true, assignments: [] });
      }

      // Always keep the raw teacher_id from profile; getTeacherIdCandidates may add extras
      let teacherIds: string[] = [teacherId];
      try {
        const candidates = await getTeacherIdCandidates(teacherId);
        // candidates always contains teacherId itself, so safe to use
        if (candidates.length > 0) teacherIds = candidates;
      } catch { /* teachers table may not exist */ }
      console.log(`[student/assignments] querying teacher_ids=${JSON.stringify(teacherIds)}`);

      let assignments: any[] = [];
      try {
        // Debug: count total assignments for this teacher
        const countResult = await poolQuery(
          `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='published') AS published FROM public.assignments WHERE teacher_id = ANY($1::uuid[])`,
          [teacherIds]
        );
        const { total, published } = countResult.rows[0] || {};
        console.log(`[student/assignments] teacher has ${total} total assignments, ${published} published`);

        // Try with courses JOIN first
        let didJoin = false;
        try {
          const result = await poolQuery(
            `SELECT a.*, COALESCE(c.title, c.name, '') AS course_title
             FROM public.assignments a
             LEFT JOIN public.courses c ON c.id = a.course_id
             WHERE a.teacher_id = ANY($1::uuid[])
               AND a.status = 'published'
             ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
            [teacherIds]
          );
          assignments = result.rows;
          didJoin = true;
        } catch {
          // courses table unavailable — query without join
          const result = await poolQuery(
            `SELECT a.* FROM public.assignments a
             WHERE a.teacher_id = ANY($1::uuid[])
               AND a.status = 'published'
             ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
            [teacherIds]
          );
          assignments = result.rows.map((r: any) => ({ ...r, course_title: '' }));
        }
        console.log(`[student/assignments] returning ${assignments.length} assignments (join=${didJoin})`);
      } catch (sqlErr: any) {
        console.warn('[student/assignments] poolQuery failed entirely:', sqlErr?.message);
        // Last resort: raw SQL via supabaseAdmin RPC or direct query
        try {
          const { data, error } = await supabaseAdmin
            .from('assignments')
            .select('*')
            .eq('status', 'published')
            .order('created_at', { ascending: false });
          if (error) throw error;
          // Filter client-side since PostgREST may not support .in() for teacher_id
          const filtered = (data || []).filter((a: any) =>
            a.teacher_id && teacherIds.includes(String(a.teacher_id))
          );
          assignments = filtered.map((a: any) => ({ ...a, course_title: '' }));
          console.log(`[student/assignments] supabaseAdmin fallback: ${assignments.length} of ${data?.length || 0}`);
        } catch (fbErr: any) {
          console.error('[student/assignments] all methods failed:', fbErr?.message);
        }
      }

      return res.json({ success: true, assignments });
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

      let assignment: any = null;
      {
        const { data: aFull } = await supabaseAdmin
          .from('assignments')
          .select('id, due_date, allow_late_submission, status')
          .eq('id', assignmentId)
          .maybeSingle();
        if (aFull) {
          assignment = aFull;
        } else {
          const { data: aBasic } = await supabaseAdmin
            .from('assignments')
            .select('id, due_date, status')
            .eq('id', assignmentId)
            .maybeSingle();
          if (aBasic) assignment = { ...aBasic, allow_late_submission: false };
        }
      }

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

  // ── Teacher Assignment CRUD (poolQuery — bypasses PostgREST schema cache) ────
  // Trigger auto-publish check immediately (called by frontend on page load)
  app.post('/api/teacher/assignments/trigger-autopublish', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      await runAutoPublishAssignments();
      return res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/teacher/assignments', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

      // Always include caller.userId so even if teachers table lookup fails we still scope correctly
      let scopedIds: string[] = [caller.userId];
      try {
        const teacherIds = await getTeacherIdCandidates(caller.userId);
        if (teacherIds.length > 0) scopedIds = teacherIds;
      } catch {
        // teachers table may not exist — scopedIds stays as [caller.userId]
      }

      // Try direct SQL first (bypasses PostgREST schema cache)
      try {
        const result = caller.role === 'teacher'
          ? await poolQuery(
              `SELECT * FROM assignments WHERE teacher_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
              [scopedIds]
            )
          : await poolQuery(`SELECT * FROM assignments ORDER BY created_at DESC`);
        console.log(`[assignments] GET via poolQuery: ${result.rows.length} rows (role=${caller.role})`);
        return res.json({ success: true, assignments: result.rows });
      } catch (sqlErr: any) {
        console.warn('[assignments] poolQuery failed, falling back to supabaseAdmin:', sqlErr?.message);
      }

      // Fallback: supabaseAdmin (PostgREST)
      let query = supabaseAdmin.from('assignments').select('*').order('created_at', { ascending: false });
      if (caller.role === 'teacher') query = (query as any).in('teacher_id', scopedIds);
      const { data, error } = await query;
      if (error) {
        console.warn('[assignments] supabaseAdmin GET error:', error.message);
        return res.json({ success: true, assignments: [] });
      }
      console.log(`[assignments] GET via supabaseAdmin: ${(data || []).length} rows`);
      return res.json({ success: true, assignments: data || [] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/teacher/assignments', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const b = req.body as Record<string, unknown>;
      if (!b.title) return res.status(400).json({ error: 'Title is required' });
      const publishAt = 'publish_at' in b && b.publish_at ? new Date(String(b.publish_at)).toISOString() : null;
      try {
        const result = await poolQuery(
          `INSERT INTO assignments
             (title, description, instructions, course_id, class_id, teacher_id,
              type, due_date, max_score, status, allow_late_submission,
              submission_config, publish_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,now(),now())
           RETURNING id`,
          [
            String(b.title),
            b.description != null ? String(b.description) : null,
            b.instructions != null ? String(b.instructions) : null,
            b.course_id || null,
            b.class_id || null,
            b.teacher_id || caller.userId,
            b.type || 'homework',
            b.due_date || null,
            Number(b.max_score) || 100,
            b.status || 'draft',
            b.allow_late_submission ? true : false,
            b.submission_config != null ? JSON.stringify(b.submission_config) : null,
            publishAt,
          ]
        );
        return res.json({ success: true, assignment: { id: result.rows[0].id } });
      } catch {
        // poolQuery unavailable — fall back to supabaseAdmin with column-strip retry loop
        const now = new Date().toISOString();
        let payload: Record<string, unknown> = {
          title: String(b.title),
          description: b.description != null ? String(b.description) : null,
          course_id: b.course_id || null, class_id: b.class_id || null,
          teacher_id: b.teacher_id || caller.userId,
          type: b.type || 'homework', due_date: b.due_date || null,
          max_score: Number(b.max_score) || 100, status: b.status || 'draft',
          allow_late_submission: Boolean(b.allow_late_submission),
          instructions: b.instructions != null ? String(b.instructions) : null,
          submission_config: b.submission_config != null ? b.submission_config : null,
          created_at: now, updated_at: now,
        };
        if (publishAt) payload.publish_at = publishAt; // only include if actually set
        const STRIP_COLS = ['publish_at', 'allow_late_submission', 'instructions', 'submission_config'];
        for (let i = 0; i < STRIP_COLS.length + 2; i++) {
          const { data, error } = await supabaseAdmin.from('assignments').insert(payload).select('id').single();
          if (!error && data?.id) return res.json({ success: true, assignment: { id: data.id } });
          if (!error) return res.status(500).json({ error: 'Insert returned no id' });
          const em = (error.message || '').toLowerCase();
          const hit = STRIP_COLS.find(c => em.includes(c) && c in payload);
          if (hit) { const { [hit]: _d, ...rest } = payload; payload = rest; continue; }
          return res.status(500).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Failed to insert assignment' });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/teacher/assignments/:id', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const aId = req.params.id?.trim();
      if (!aId) return res.status(400).json({ error: 'Assignment id required' });
      const b = req.body as Record<string, unknown>;
      try {
        const sets: string[] = ['updated_at = now()'];
        const params: any[] = [];
        let pi = 1;
        const col = (name: string, val: any) => { sets.push(`${name} = $${pi++}`); params.push(val); };
        if (b.title !== undefined) col('title', String(b.title));
        if (b.description !== undefined) col('description', b.description != null ? String(b.description) : null);
        if (b.course_id !== undefined) col('course_id', b.course_id || null);
        if (b.class_id !== undefined) col('class_id', b.class_id || null);
        if (b.type !== undefined) col('type', b.type);
        if (b.due_date !== undefined) col('due_date', b.due_date || null);
        if (b.max_score !== undefined) col('max_score', Number(b.max_score) || 100);
        if (b.status !== undefined) col('status', b.status);
        if (b.instructions !== undefined) col('instructions', b.instructions != null ? String(b.instructions) : null);
        if (b.allow_late_submission !== undefined) col('allow_late_submission', Boolean(b.allow_late_submission));
        if (b.submission_config !== undefined) col('submission_config', b.submission_config != null ? JSON.stringify(b.submission_config) : null);
        if ('publish_at' in b) col('publish_at', b.publish_at ? new Date(String(b.publish_at)).toISOString() : null);
        params.push(aId);
        await poolQuery(`UPDATE assignments SET ${sets.join(', ')} WHERE id = $${pi}`, params);
        return res.json({ success: true });
      } catch {
        // poolQuery unavailable — fall back to supabaseAdmin with column-strip retry loop
        let payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (b.title !== undefined) payload.title = String(b.title);
        if (b.description !== undefined) payload.description = b.description != null ? String(b.description) : null;
        if (b.course_id !== undefined) payload.course_id = b.course_id || null;
        if (b.class_id !== undefined) payload.class_id = b.class_id || null;
        if (b.type !== undefined) payload.type = b.type;
        if (b.due_date !== undefined) payload.due_date = b.due_date || null;
        if (b.max_score !== undefined) payload.max_score = Number(b.max_score) || 100;
        if (b.status !== undefined) payload.status = b.status;
        if (b.instructions !== undefined) payload.instructions = b.instructions != null ? String(b.instructions) : null;
        if (b.allow_late_submission !== undefined) payload.allow_late_submission = Boolean(b.allow_late_submission);
        if (b.submission_config !== undefined) payload.submission_config = b.submission_config;
        // Only include publish_at if it has a value (null/absent = don't touch the column)
        if ('publish_at' in b && b.publish_at) payload.publish_at = new Date(String(b.publish_at)).toISOString();
        const STRIP_COLS = ['publish_at', 'allow_late_submission', 'instructions', 'submission_config'];
        for (let i = 0; i < STRIP_COLS.length + 2; i++) {
          const { error } = await supabaseAdmin.from('assignments').update(payload).eq('id', aId);
          if (!error) return res.json({ success: true });
          const em = (error.message || '').toLowerCase();
          const hit = STRIP_COLS.find(c => em.includes(c) && c in payload);
          if (hit) { const { [hit]: _d, ...rest } = payload; payload = rest; continue; }
          return res.status(500).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Failed to update assignment' });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/teacher/assignments/:id', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== 'teacher' && caller.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      const aId = req.params.id?.trim();
      if (!aId) return res.status(400).json({ error: 'Assignment id required' });
      const { error } = await supabaseAdmin.from('assignments').delete().eq('id', aId);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Teacher: get all submissions for an assignment
  app.get('/api/teacher/assignments/:assignmentId/submissions', async (req: Request, res: Response) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;

      // Single query with join — eliminates sequential round-trip for profiles
      const { data: submissions, error } = await supabaseAdmin
        .from('assignment_submissions')
        .select(`
          id, assignment_id, student_id, submitted_at, score, status,
          content, file_url, feedback, grade, graded_at, updated_at,
          student:profiles!student_id(id, display_name, email, avatar_url)
        `)
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });

      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          const { data: plain } = await supabaseAdmin
            .from('assignment_submissions')
            .select('id, assignment_id, student_id, submitted_at, score, status, content, file_url, feedback, grade, graded_at')
            .eq('assignment_id', assignmentId)
            .order('submitted_at', { ascending: false });
          return res.json({ success: true, submissions: plain || [] });
        }
        throw error;
      }

      const enriched = (submissions || []).map((s: any) => ({
        ...s,
        student: s.student || { display_name: 'Unknown', email: '' },
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

  // ── PRESENTATIONS ──────────────────────────────────────────────────────────
  // Auto-migrate presentations table
  async function ensurePresentationsTable() {
    try {
      const { error } = await supabaseAdmin.from('presentations').select('id').limit(1);
      if (error && (error.message.includes('does not exist') || error.code === '42P01')) {
        // Table doesn't exist — create it via poolQuery
        await poolQuery(`
          CREATE TABLE IF NOT EXISTS presentations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            theme TEXT NOT NULL DEFAULT 'modern',
            language TEXT NOT NULL DEFAULT 'en',
            education_level TEXT,
            slides JSONB NOT NULL DEFAULT '[]',
            is_public BOOLEAN NOT NULL DEFAULT false,
            assignment_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `).catch(() => null);
        await poolQuery(`CREATE INDEX IF NOT EXISTS presentations_user_id_idx ON presentations(user_id)`).catch(() => null);
        console.log('[presentations] Table created ✓');
      } else {
        // Table exists — ensure assignment_id column is present
        await poolQuery(`ALTER TABLE presentations ADD COLUMN IF NOT EXISTS assignment_id UUID`).catch(() => null);
      }
    } catch (e: any) {
      console.warn('[presentations] Migration check:', e?.message);
    }
  }
  void ensurePresentationsTable();

  // GET /api/presentations — list presentations (admin: all, teacher/student: own)
  app.get('/api/presentations', async (req: Request, res: Response) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace('Bearer ', '') || ''
      );
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const { data: profile } = await supabaseAdmin
        .from('profiles').select('role').eq('id', user.id).single();

      let query = supabaseAdmin
        .from('presentations')
        .select('id, user_id, title, description, theme, language, education_level, is_public, slides, assignment_id, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (profile?.role !== 'admin') {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, presentations: data || [] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/presentations/:id — get single presentation
  app.get('/api/presentations/:id', async (req: Request, res: Response) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace('Bearer ', '') || ''
      );
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const { data, error } = await supabaseAdmin
        .from('presentations').select('*').eq('id', req.params.id).single();
      if (error) throw error;

      const { data: profile } = await supabaseAdmin
        .from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin' && data.user_id !== user.id && !data.is_public) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      res.json({ success: true, presentation: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/presentations — create presentation
  app.post('/api/presentations', async (req: Request, res: Response) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace('Bearer ', '') || ''
      );
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const { title, description, theme, language, education_level, slides, is_public, assignment_id } = req.body;
      const insertPayload: Record<string, any> = {
        user_id: user.id, title, description, theme: theme || 'modern',
        language: language || 'en', education_level, slides: slides || [],
        is_public: is_public || false,
        assignment_id: assignment_id || null,
      };
      let { data, error } = await supabaseAdmin.from('presentations').insert(insertPayload).select().single();
      if (error && error.message?.includes('assignment_id')) {
        // Schema cache doesn't know about assignment_id yet — insert without it
        const { assignment_id: _drop, ...payloadWithout } = insertPayload;
        ({ data, error } = await supabaseAdmin.from('presentations').insert(payloadWithout).select().single());
      }
      if (error) throw error;
      res.json({ success: true, presentation: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/presentations/:id — update presentation
  app.put('/api/presentations/:id', async (req: Request, res: Response) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace('Bearer ', '') || ''
      );
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const { data: existing } = await supabaseAdmin
        .from('presentations').select('user_id').eq('id', req.params.id).single();
      const { data: profile } = await supabaseAdmin
        .from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin' && existing?.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { title, description, theme, language, education_level, slides, is_public, assignment_id } = req.body;
      const updatePayload: Record<string, any> = {
        title, description, theme, language, education_level, slides, is_public,
        assignment_id: assignment_id ?? null,
        updated_at: new Date().toISOString(),
      };
      let { data, error } = await supabaseAdmin.from('presentations')
        .update(updatePayload).eq('id', req.params.id).select().single();
      if (error && error.message?.includes('assignment_id')) {
        const { assignment_id: _drop, ...payloadWithout } = updatePayload;
        ({ data, error } = await supabaseAdmin.from('presentations')
          .update(payloadWithout).eq('id', req.params.id).select().single());
      }
      if (error) throw error;
      res.json({ success: true, presentation: data });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/presentations/:id — delete presentation
  app.delete('/api/presentations/:id', async (req: Request, res: Response) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace('Bearer ', '') || ''
      );
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const { data: existing } = await supabaseAdmin
        .from('presentations').select('user_id').eq('id', req.params.id).single();
      const { data: profile } = await supabaseAdmin
        .from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin' && existing?.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { error } = await supabaseAdmin.from('presentations').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/presentations/generate — AI-generate slide content via Gemini
  app.post('/api/presentations/generate', async (req: Request, res: Response) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace('Bearer ', '') || ''
      );
      if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

      const { topic, language, slideCount, style, educationLevel } = req.body;
      if (!topic) return res.status(400).json({ error: 'Topic is required' });

      const count = Math.min(Math.max(Number(slideCount) || 8, 3), 20);
      const apiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

      const prompt = `You are an expert educational presentation creator. Generate a complete presentation about "${topic}".

Requirements:
- Language: ${language || 'English'}
- Number of slides: ${count}
- Style: ${style || 'modern'} (modern = clean & bold, business = formal & structured, education = colorful & engaging, minimal = simple & elegant)
- Education level: ${educationLevel || 'general'}

CRITICAL JSON RULES — you must follow these exactly:
- Output ONLY raw JSON. No markdown, no code fences, no explanation before or after.
- Every string value must be on a single line — NO literal newlines inside strings.
- Use \\n (backslash-n) if you need a line break inside a string value.
- Do NOT use any control characters inside strings.

Output this exact structure:
{"title":"Presentation Title","slides":[{"order":1,"type":"title","title":"Slide Title","content":["bullet 1","bullet 2","bullet 3"],"notes":"Speaker notes as a single line. Multiple sentences separated by spaces, not newlines.","emoji":"🎯"}]}

Slide types: "title" (first slide only), "content" (main slides), "stats", "quote", "summary" (last slide only).
Each content/stats/quote slide must have 3-5 bullet points.
Speaker notes: 2-3 sentences on a single line with no line breaks.`;

      /** Robustly parse AI JSON — handles markdown fences, bare newlines inside strings, stray control chars */
      function safeParseJSON(raw: string): any {
        if (!raw || !raw.trim()) return null;
        // 1. Strip markdown fences
        let text = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
        // 2. Extract the outermost { } block (greedy — takes largest match)
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;
        text = text.slice(start, end + 1);
        // 3. Direct parse (best case — AI followed instructions)
        try { return JSON.parse(text); } catch { /* fall through */ }
        // 4. Escape bare newlines/tabs/CRs that appear inside string values
        //    Walk char by char to track whether we're inside a JSON string
        let result = '';
        let inStr = false;
        let escape = false;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (escape) { result += ch; escape = false; continue; }
          if (ch === '\\' && inStr) { result += ch; escape = true; continue; }
          if (ch === '"') { inStr = !inStr; result += ch; continue; }
          if (inStr) {
            if (ch === '\n') { result += '\\n'; continue; }
            if (ch === '\r') { result += '\\r'; continue; }
            if (ch === '\t') { result += '\\t'; continue; }
          }
          result += ch;
        }
        try { return JSON.parse(result); } catch { /* fall through */ }
        // 5. Aggressive fallback: strip all remaining control chars except structural whitespace
        const stripped = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
        try { return JSON.parse(stripped); } catch { return null; }
      }

      let rawText = '';

      if (apiKey) {
        const { GoogleGenAI } = await import('@google/genai');
        const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || '').trim();
        const ai = new GoogleGenAI(geminiBaseUrl
          ? { apiKey, httpOptions: { apiVersion: '', baseUrl: geminiBaseUrl } }
          : { apiKey }
        );
        // Use gemini-2.0-flash — reliable JSON output, not a thinking model (2.5-flash thinking model
        // returns empty text when responseMimeType is set, and produces newlines in strings without it)
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: prompt,
        });
        rawText = response.text ?? '';
      } else {
        // Free fallback: Pollinations AI (no API key required)
        const pollinationsRes = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            model: 'openai',
            seed: 42,
            jsonMode: true,
          }),
        });
        if (!pollinationsRes.ok) {
          throw new Error(`Pollinations AI error: ${pollinationsRes.status}`);
        }
        rawText = await pollinationsRes.text();
      }

      console.log(`[presentations/generate] rawText length=${rawText.length}, preview=${rawText.slice(0, 120).replace(/\n/g, ' ')}`);
      const parsed = safeParseJSON(rawText);
      if (!parsed) {
        console.error('[presentations/generate] safeParseJSON returned null. rawText (first 500):', rawText.slice(0, 500));
        return res.status(500).json({ error: 'AI did not return valid JSON. Please try again.' });
      }
      res.json({ success: true, data: parsed });
    } catch (e: any) {
      console.error('[presentations/generate]', e?.message);
      res.status(500).json({ error: e?.message || 'AI generation failed' });
    }
  });
  // ── END PRESENTATIONS ────────────────────────────────────────────────────────

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
        hmrConfig = {
          ...(options.httpServer ? { server: options.httpServer } : {}),
          protocol: "wss",
          host: process.env.REPLIT_DEV_DOMAIN || undefined,
          clientPort: 443,
        };
      } else {
        hmrConfig = options.httpServer ? { server: options.httpServer } : true;
      }
      const vite = await createServer({
        configFile: false,
        root: process.cwd(),
        plugins: [
          (await import("@vitejs/plugin-react")).default(),
          (await import("@tailwindcss/vite")).default(),
        ],
        resolve: {
          alias: { '@': process.cwd() },
          dedupe: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
        },
        optimizeDeps: {
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'react-router-dom',
            'react-hook-form',
            'react-i18next',
            '@hookform/resolvers/zod',
            'zod',
            'lucide-react',
            'clsx',
            'tailwind-merge',
            'sonner',
            'motion/react',
            'date-fns',
            'recharts',
            'i18next',
            'i18next-browser-languagedetector',
            '@supabase/supabase-js',
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
            'canvas-confetti',
            'dompurify',
          ],
        },
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
      // Prevent browser from caching Vite pre-bundled dep chunks across
      // optimization runs — stale cached chunks from prior runs cause
      // mismatched React instances and "Invalid hook call" errors.
      app.use('/node_modules/.vite/deps/', (_req: any, res: any, next: any) => {
        res.set('Cache-Control', 'no-store');
        next();
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      // Vite hashed assets (e.g. index-AbCdEf.js) can be cached for 1 year — immutable.
      // index.html and other entry files must NOT be cached so clients always get the latest.
      app.use('/assets', express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }));
      app.use(express.static(distPath, { maxAge: 0 }));
      app.get("*", (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

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

// ─── Student Monthly Payments Migration ──────────────────────────────────────
async function runStudentMonthlyPaymentsMigration() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return;
  try {
    await poolQuery(`
      CREATE TABLE IF NOT EXISTS student_monthly_payments (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id  UUID        NOT NULL,
        month_year  TEXT        NOT NULL,
        amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
        notes       TEXT,
        paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_by     UUID,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(student_id, month_year)
      )
    `);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_smp_student ON student_monthly_payments (student_id)`);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_smp_month  ON student_monthly_payments (month_year)`);
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    console.log('[migration] student_monthly_payments table ensured ✓');
  } catch (err: any) {
    console.warn('[migration] student_monthly_payments:', err?.message?.split('\n')[0]);
  }
}

// ─── Teacher Hours Migration ──────────────────────────────────────────────────
async function runTeacherHoursMigration() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return;
  try {
    await poolQuery(`
      CREATE TABLE IF NOT EXISTS teacher_hours (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id     UUID        NOT NULL,
        work_date      DATE        NOT NULL,
        hours          NUMERIC(5,2) NOT NULL,
        rate_per_hour  NUMERIC(10,2) NOT NULL DEFAULT 40,
        notes          TEXT,
        created_by     UUID,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_th_teacher ON teacher_hours (teacher_id)`);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_th_date    ON teacher_hours (work_date DESC)`);
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    console.log('[migration] teacher_hours table ensured ✓');
  } catch (err: any) {
    console.warn('[migration] teacher_hours:', err?.message?.split('\n')[0]);
  }
}

// ─── Student Transfers Log Migration ─────────────────────────────────────────
async function runStudentTransfersMigration() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return;
  try {
    await poolQuery(`
      CREATE TABLE IF NOT EXISTS student_transfers (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id      UUID        NOT NULL,
        student_name    TEXT        NOT NULL DEFAULT '',
        student_email   TEXT        NOT NULL DEFAULT '',
        from_teacher_id UUID        NOT NULL,
        from_teacher_name TEXT      NOT NULL DEFAULT '',
        to_teacher_id   UUID        NOT NULL,
        to_teacher_name TEXT        NOT NULL DEFAULT '',
        transferred_by  UUID        NOT NULL,
        note            TEXT,
        transferred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_student_transfers_from_teacher ON student_transfers (from_teacher_id)`);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_student_transfers_to_teacher   ON student_transfers (to_teacher_id)`);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_student_transfers_at           ON student_transfers (transferred_at DESC)`);
    console.log('[migration] student_transfers table ensured ✓');
  } catch (err: any) {
    console.warn('[migration] student_transfers table:', err?.message?.split('\n')[0]);
  }
}

// ─── Assignment Submissions Migration ────────────────────────────────────────
async function runAssignmentSubmissionsMigration() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return;
  // Ensure assignments table exists first
  try {
    await poolQuery(`
      CREATE TABLE IF NOT EXISTS assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        description text,
        instructions text,
        course_id uuid,
        class_id uuid,
        teacher_id uuid,
        type text NOT NULL DEFAULT 'homework',
        due_date timestamptz,
        max_score numeric NOT NULL DEFAULT 100,
        status text NOT NULL DEFAULT 'draft',
        allow_late_submission boolean NOT NULL DEFAULT false,
        submission_config jsonb,
        publish_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('[migration] assignments table ensured ✓');
  } catch (err: any) {
    console.warn('[migration] assignments table:', err?.message?.split('\n')[0]);
  }
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
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log('[migration] assignments.publish_at column ensured ✓');
  } catch (err: any) {
    if (!String(err?.message || '').toLowerCase().includes('already exists')) {
      console.warn('[migration] assignments.publish_at:', err?.message?.split('\n')[0]);
    } else {
      console.log('[migration] assignments.publish_at column already exists ✓');
    }
  }
}

async function runModulesPublishAtMigration(): Promise<void> {
  // Try via direct DB pool first (works if DATABASE_URL points to the right DB)
  try {
    await poolQuery(`ALTER TABLE modules ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log('[migration] modules.publish_at column ensured ✓');
    return;
  } catch {
    // fall through to supabaseAdmin RPC attempt
  }
  // Fallback: probe via supabaseAdmin — select publish_at to see if column exists
  try {
    const probe = await supabaseAdmin.from('modules').select('publish_at').limit(1);
    if (!probe.error) {
      console.log('[migration] modules.publish_at column already exists ✓');
      return;
    }
    // Column likely missing — attempt to add via RPC exec_sql (requires pg function)
    const rpcResult = await (supabaseAdmin as any).rpc('exec_sql', {
      sql: 'ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL',
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log('[migration] modules.publish_at added via RPC ✓');
  } catch (err: any) {
    console.warn('[migration] modules.publish_at column could not be auto-created:', err?.message?.split('\n')[0]);
    console.warn('[migration] Run manually: ALTER TABLE modules ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL');
  }
}

async function runQuizSectionsMigration(): Promise<void> {
  try {
    await poolQuery(`
      CREATE TABLE IF NOT EXISTS public.quiz_sections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'Section',
        type TEXT NOT NULL DEFAULT 'general',
        instructions TEXT,
        audio_url TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_quiz_sections_quiz_id') THEN
          CREATE INDEX idx_quiz_sections_quiz_id ON public.quiz_sections(quiz_id);
        END IF;
      END $$;
      ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.quiz_sections(id) ON DELETE SET NULL;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_questions_section_id') THEN
          CREATE INDEX idx_questions_section_id ON public.questions(section_id);
        END IF;
      END $$;
    `);
    console.log('[migration] quiz_sections table + questions.section_id ensured ✓');
  } catch (err: any) {
    try {
      const probe = await supabaseAdmin.from('quiz_sections').select('id').limit(1);
      if (!probe.error) { console.log('[migration] quiz_sections already exists ✓'); return; }
    } catch {}
    console.warn('[migration] quiz_sections: could not auto-create — run migrations/012_quiz_sections.sql manually.');
    console.warn('[migration] Error:', err?.message?.split?.('\n')?.[0]);
  }
}

async function runQuizzesPublishAtMigration(): Promise<void> {
  try {
    await poolQuery(`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log('[migration] quizzes.publish_at column ensured ✓');
    return;
  } catch {
    // fall through to supabaseAdmin probe
  }
  try {
    const probe = await supabaseAdmin.from('quizzes').select('publish_at').limit(1);
    if (!probe.error) {
      console.log('[migration] quizzes.publish_at column already exists ✓');
      return;
    }
    const rpcResult = await (supabaseAdmin as any).rpc('exec_sql', {
      sql: 'ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL',
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log('[migration] quizzes.publish_at added via RPC ✓');
  } catch (err: any) {
    console.warn('[migration] quizzes.publish_at column could not be auto-created:', err?.message?.split('\n')[0]);
    console.warn('[migration] Run manually: ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL');
  }
}

async function runLessonsPublishAtMigration(): Promise<void> {
  try {
    await poolQuery(`ALTER TABLE lessons ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log('[migration] lessons.publish_at column ensured ✓');
    return;
  } catch {
    // fall through to supabaseAdmin probe
  }
  try {
    const probe = await supabaseAdmin.from('lessons').select('publish_at').limit(1);
    if (!probe.error) {
      console.log('[migration] lessons.publish_at column already exists ✓');
      return;
    }
    const rpcResult = await (supabaseAdmin as any).rpc('exec_sql', {
      sql: 'ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL',
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log('[migration] lessons.publish_at added via RPC ✓');
  } catch (err: any) {
    console.warn('[migration] lessons.publish_at column could not be auto-created:', err?.message?.split('\n')[0]);
    console.warn('[migration] Run manually: ALTER TABLE lessons ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL');
  }
}

async function runAssignmentsPublishAtMigration(): Promise<void> {
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log('[migration] assignments.publish_at column ensured ✓');
    return;
  } catch { /* fall through */ }
  try {
    const probe = await supabaseAdmin.from('assignments').select('publish_at').limit(1);
    if (!probe.error) { console.log('[migration] assignments.publish_at column already exists ✓'); return; }
    const rpcResult = await (supabaseAdmin as any).rpc('exec_sql', {
      sql: 'ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL',
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log('[migration] assignments.publish_at added via RPC ✓');
  } catch (err: any) {
    console.warn('[migration] assignments.publish_at column could not be auto-created:', err?.message?.split('\n')[0]);
  }
}

async function runNotificationsColumnsMigration(): Promise<void> {
  // Add `title` and `read` columns if the live DB was created from an older schema
  const cols: Array<{ name: string; ddl: string }> = [
    { name: 'title', ddl: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''` },
    { name: 'read',  ddl: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT FALSE` },
  ];
  for (const col of cols) {
    try {
      await poolQuery(col.ddl);
      console.log(`[migration] notifications.${col.name} column ensured ✓`);
    } catch {
      // poolQuery failed — try supabase probe then RPC
      try {
        const probe = await supabaseAdmin.from('notifications').select(col.name).limit(1);
        if (!probe.error) {
          console.log(`[migration] notifications.${col.name} column already exists ✓`);
          continue;
        }
        const rpc = await (supabaseAdmin as any).rpc('exec_sql', { sql: col.ddl });
        if (rpc.error) throw rpc.error;
        console.log(`[migration] notifications.${col.name} added via RPC ✓`);
      } catch (err: any) {
        console.warn(`[migration] notifications.${col.name} could not be auto-created:`, err?.message?.split('\n')[0]);
      }
    }
  }
}

async function runLiveSessionsRecordingUrlsMigration(): Promise<void> {
  const ddl = `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS recording_urls JSONB NOT NULL DEFAULT '[]'::jsonb`;
  try {
    await poolQuery(ddl);
    console.log('[migration] live_sessions.recording_urls column ensured ✓');
    return;
  } catch { /* fall through */ }
  try {
    const probe = await supabaseAdmin.from('live_sessions').select('recording_urls').limit(1);
    if (!probe.error) { console.log('[migration] live_sessions.recording_urls column already exists ✓'); return; }
    const rpc = await (supabaseAdmin as any).rpc('exec_sql', { sql: ddl });
    if (rpc.error) throw rpc.error;
    console.log('[migration] live_sessions.recording_urls added via RPC ✓');
  } catch (err: any) {
    console.warn('[migration] live_sessions.recording_urls could not be auto-created:', err?.message?.split('\n')[0]);
    console.warn('[migration] Run manually:', ddl);
  }
}

async function runLiveSessionsControlsMigration(): Promise<void> {
  const ddls = [
    `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS reactions_enabled BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS raise_hand_enabled BOOLEAN NOT NULL DEFAULT true`,
  ];
  try {
    for (const ddl of ddls) await poolQuery(ddl);
    console.log('[migration] live_sessions controls columns ensured ✓');
    return;
  } catch { /* fall through */ }
  try {
    for (const ddl of ddls) {
      const rpc = await (supabaseAdmin as any).rpc('exec_sql', { sql: ddl });
      if (rpc.error && !String(rpc.error.message).includes('already exists')) throw rpc.error;
    }
    console.log('[migration] live_sessions controls columns added via RPC ✓');
  } catch (err: any) {
    console.warn('[migration] live_sessions controls columns could not be auto-created:', err?.message?.split('\n')[0]);
  }
}

async function runSessionParticipantsHandRaisedMigration(): Promise<void> {
  const ddl = `ALTER TABLE public.session_participants ADD COLUMN IF NOT EXISTS is_hand_raised BOOLEAN NOT NULL DEFAULT false`;
  try {
    await poolQuery(ddl);
    console.log('[migration] session_participants.is_hand_raised column ensured ✓');
    return;
  } catch { /* fall through */ }
  try {
    const probe = await supabaseAdmin.from('session_participants').select('is_hand_raised').limit(1);
    if (!probe.error) { console.log('[migration] session_participants.is_hand_raised already exists ✓'); return; }
    const rpc = await (supabaseAdmin as any).rpc('exec_sql', { sql: ddl });
    if (rpc.error) throw rpc.error;
    console.log('[migration] session_participants.is_hand_raised added via RPC ✓');
  } catch (err: any) {
    console.warn('[migration] session_participants.is_hand_raised could not be auto-created:', err?.message?.split('\n')[0]);
  }
}

async function ensureHeadwayMediaTable(): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS headway_media (
      id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
      level         TEXT        NOT NULL DEFAULT 'Beginner',
      unit_number   INTEGER,
      module_id     UUID,
      lesson_id     UUID,
      type          TEXT        NOT NULL DEFAULT 'student_audio',
      title         TEXT,
      file_name     TEXT,
      drive_file_id TEXT        UNIQUE NOT NULL,
      url           TEXT,
      mime_type     TEXT,
      size_bytes    BIGINT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_headway_media_level_unit ON headway_media (level, unit_number);
    CREATE INDEX IF NOT EXISTS idx_headway_media_drive_id   ON headway_media (drive_file_id);
  `;
  try {
    await poolQuery(ddl);
    console.log('[migration] headway_media table ensured ✓');
  } catch { /* fall through to RPC */ }
  try {
    const probe = await supabaseAdmin.from('headway_media').select('id').limit(1);
    if (probe.error) {
      const rpc = await (supabaseAdmin as any).rpc('exec_sql', { sql: ddl });
      if (rpc.error) throw rpc.error;
      console.log('[migration] headway_media table created via RPC ✓');
    } else {
      console.log('[migration] headway_media table already exists ✓');
    }
  } catch (err: any) {
    console.warn('[migration] headway_media table could not be auto-created:', err?.message?.split('\n')[0]);
  }
  // Ensure course_id column + index exist (added after initial migration)
  try {
    await poolQuery(`ALTER TABLE headway_media ADD COLUMN IF NOT EXISTS course_id UUID`);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_headway_media_course_id ON headway_media (course_id) WHERE course_id IS NOT NULL`);
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    console.log('[migration] headway_media.course_id column + index ensured ✓');
  } catch (err: any) {
    console.warn('[migration] headway_media.course_id column could not be added:', err?.message?.split('\n')[0]);
  }
}

async function ensureHeadwayMediaBucket(): Promise<void> {
  try {
    // Try creating; if it already exists the error is ignored
    const { error } = await supabaseAdmin.storage.createBucket('headway-media', { public: true });
    if (error && !error.message.toLowerCase().includes('already exists')) {
      // Bucket may already exist under a different plan limit — attempt without options
      const { error: e2 } = await supabaseAdmin.storage.createBucket('headway-media', {});
      if (e2 && !e2.message.toLowerCase().includes('already exists')) {
        console.warn('[storage] headway-media bucket setup:', e2.message);
        return;
      }
    }
    console.log('[storage] headway-media bucket ready ✓');
  } catch (e: any) {
    console.warn('[storage] headway-media bucket failed:', e?.message);
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

/**
 * Fix multiple-choice questions where correct_answer was stored as option text
 * instead of the 1-based option id ("1","2","3","4") that QuizBuilder expects.
 * Handles both cases:
 *   A) options stored as {id,text} objects  → match by text, use object's id
 *   B) options stored as plain strings       → match by text, use 1-based index
 * Also fixes questions where correct_answer is NULL/empty but options are plain
 * strings (legacy fallback questions always had correctIndex 0 → set to "1").
 * Runs once at startup and is idempotent.
 */
async function fixHeadwayQuizCorrectAnswers(): Promise<void> {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("questions")
      .select("id, options, correct_answer")
      .eq("type", "multiple-choice");

    if (error || !rows || rows.length === 0) return;

    const updates: { id: string; correct_answer: string; options?: unknown }[] = [];

    for (const row of rows) {
      const opts: unknown = row.options;
      if (!Array.isArray(opts) || opts.length === 0) continue;

      const ca = String(row.correct_answer ?? "");
      const firstOpt = opts[0];

      // ── Case A: options are {id, text} objects ───────────────────────────
      if (firstOpt && typeof firstOpt === "object" && "id" in firstOpt && "text" in firstOpt) {
        const optObjs = opts as { id: string; text: string }[];

        // Already a valid option id → nothing to do
        if (optObjs.some(o => o.id === ca)) continue;

        // Match by text (exact then case-insensitive)
        const caLower = ca.toLowerCase();
        const match = optObjs.find(o => o.text === ca) ?? optObjs.find(o => o.text.toLowerCase() === caLower);
        if (match) {
          updates.push({ id: row.id, correct_answer: match.id });
        }
        continue;
      }

      // ── Case B: options are plain strings ───────────────────────────────
      if (typeof firstOpt === "string") {
        const optStrs = opts as string[];

        // Convert options to {id, text} objects for future compatibility
        const optionObjects = optStrs.map((text, i) => ({ id: String(i + 1), text }));

        // If correct_answer already matches a 1-based id, just convert options format
        if (optionObjects.some(o => o.id === ca)) {
          updates.push({ id: row.id, correct_answer: ca, options: optionObjects });
          continue;
        }

        // Match correct_answer by text → convert to 1-based id
        const caLower = ca.toLowerCase();
        const match = optionObjects.find(o => o.text === ca) ?? optionObjects.find(o => o.text.toLowerCase() === caLower);
        if (match) {
          updates.push({ id: row.id, correct_answer: match.id, options: optionObjects });
          continue;
        }

        // correct_answer is NULL/empty or doesn't match → default to first option ("1")
        // Only do this for questions that look like Headway imports (have explanation or topic-style text)
        if (!ca || ca === "0" || ca === "null") {
          updates.push({ id: row.id, correct_answer: "1", options: optionObjects });
        }
      }
    }

    if (updates.length === 0) return;

    for (const upd of updates) {
      const patch: Record<string, unknown> = { correct_answer: upd.correct_answer };
      if (upd.options) patch.options = upd.options;
      await supabaseAdmin.from("questions").update(patch).eq("id", upd.id);
    }

    console.log(`[migration] fixed correct_answer for ${updates.length} quiz question(s) ✓`);
  } catch (e: any) {
    console.warn("[migration] fixHeadwayQuizCorrectAnswers:", e?.message);
  }
}

function logEnvValidation() {
  type VarLevel = 'required' | 'optional';
  const checks: { key: string; level: VarLevel; isUrl?: boolean }[] = [
    { key: 'VITE_SUPABASE_URL',        level: 'required', isUrl: true },
    { key: 'VITE_SUPABASE_ANON_KEY',   level: 'required' },
    { key: 'SUPABASE_SERVICE_ROLE_KEY',level: 'required' },
    { key: 'GEMINI_API_KEY',           level: 'optional' },
    { key: 'BREVO_API_KEY',            level: 'optional' },
    { key: 'BREVO_SENDER_EMAIL',       level: 'optional' },
    { key: 'TELEGRAM_BOT_TOKEN',       level: 'optional' },
    { key: 'DATABASE_URL',             level: 'optional' },
  ];

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const { key, level, isUrl } of checks) {
    const raw = key === 'GEMINI_API_KEY'
      ? ((process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? '') || (process.env.GEMINI_API_KEY ?? '')).trim()
      : (process.env[key] ?? '').trim();

    if (!raw) {
      if (level === 'required') errors.push(`  ✗ ${key} — MISSING (required)`);
      else warnings.push(`  ⚠ ${key} — not set (optional)`);
      continue;
    }
    if (isUrl && !raw.startsWith('https://') && !raw.startsWith('http://')) {
      errors.push(`  ✗ ${key} — INVALID URL: must start with https:// (got: "${raw.slice(0, 30)}…")`);
      continue;
    }
    const preview = isUrl
      ? raw.replace(/^(https?:\/\/[^.]+).*/, '$1') + '…'
      : `${raw.slice(0, 4)}${'*'.repeat(Math.max(0, raw.length - 4))}`;
    console.log(`  ✓ ${key} — ${preview}`);
  }

  for (const w of warnings) console.warn(w);
  if (errors.length) {
    for (const e of errors) console.error(e);
    console.error(`[env] ${errors.length} required variable(s) missing or invalid — the app may not work correctly.`);
  } else {
    console.log('[env] All required environment variables are set ✓');
  }
}

async function startServer() {
  console.log('[env] Validating environment variables…');
  logEnvValidation();

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
  void runModulesPublishAtMigration();
  void runLessonsPublishAtMigration();
  void runQuizzesPublishAtMigration();
  void runAssignmentsPublishAtMigration();
  void runNotificationsColumnsMigration();
  void runLiveSessionsRecordingUrlsMigration();
  void runLiveSessionsControlsMigration();
  void runSessionParticipantsHandRaisedMigration();
  void runQuizSectionsMigration();
  void runStudentTransfersMigration();
  void runStudentMonthlyPaymentsMigration();
  void runTeacherHoursMigration();
  void ensureAssignmentFilesBucket();
  void ensureHeadwayMediaBucket();
  void ensureHeadwayMediaTable();
  void fixHeadwayQuizCorrectAnswers();

  // Create a minimal HTTP server that binds the port immediately so Replit's
  // workflow health-check passes, then swap in the full Express app once Vite
  // has finished pre-bundling dependencies (which can take >30s on first run).
  let appHandler: ((req: any, res: any) => void) | null = null;
  const httpServer = http.createServer((req, res) => {
    if (appHandler) {
      appHandler(req, res);
    } else {
      // Vite is still initialising — respond with a loading page so the
      // browser doesn't show a connection-refused error.
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Starting up, please wait…</p></body></html>');
    }
  });

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
  let boundPort: number | null = null;

  for (let portOffset = 0; portOffset < maxPortAttempts; portOffset++) {
    const portToTry = preferredPort + portOffset;

    for (const hostToTry of hostCandidates) {
      try {
        await tryListen(portToTry, hostToTry);
        boundPort = portToTry;
        break;
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
    if (boundPort !== null) break;
  }

  if (boundPort === null) {
    throw new Error(
      `Unable to start server after trying ports ${preferredPort}-${preferredPort + maxPortAttempts - 1}. Last error: ${lastRecoverableError?.code ?? "unknown"}`,
    );
  }

  // Now initialise the full Express + Vite app asynchronously (may take a while
  // on first run due to Vite dependency pre-bundling).
  console.log('[startup] Initialising Express + Vite app…');
  createApp({ includeFrontend: true, httpServer }).then(app => {
    appHandler = app;
    console.log('[startup] App ready — all requests now served by Express + Vite');
  }).catch(err => {
    console.error('[startup] createApp failed:', err);
  });

  // In Replit, also listen on 24678 with the same handler.
  if (process.env.REPL_ID) {
    const replitProxyServer = http.createServer((req, res) => {
      if (appHandler) {
        appHandler(req, res);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Starting up, please wait…</p></body></html>');
      }
    });
    replitProxyServer.listen(24678, "0.0.0.0", () => {
      console.log("Replit proxy listener also running on port 24678");
    });
    replitProxyServer.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code !== "EADDRINUSE") {
        console.warn("Replit proxy port 24678 error:", e.code);
      }
    });
  }
}

async function runAutoPublishQuizzes() {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .select('id, title')
      .lte('publish_at', now)
      .neq('published', true);
    if (error || !data || data.length === 0) return;
    // Batch update — 1 query instead of N
    const ids = data.map((q: any) => q.id);
    const { error: batchErr } = await supabaseAdmin
      .from('quizzes')
      .update({ published: true, publish_at: null, updated_at: now })
      .in('id', ids);
    if (batchErr) {
      console.error('[auto-publish] Failed to batch-publish quizzes:', batchErr.message);
    } else {
      console.log(`[auto-publish] Published ${ids.length} quiz(zes):`, data.map((q: any) => q.title).join(', '));
    }
  } catch (e: any) {
    console.error('[auto-publish] Quizzes scheduler error:', e?.message);
  }
}

async function runAutoPublishLessons() {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('lessons')
      .select('id, title')
      .lte('publish_at', now)
      .neq('status', 'published');
    if (error || !data || data.length === 0) return;
    // Batch update — 1 query instead of N
    const ids = data.map((l: any) => l.id);
    const { error: batchErr } = await supabaseAdmin
      .from('lessons')
      .update({ status: 'published', publish_at: null, updated_at: now })
      .in('id', ids);
    if (batchErr) {
      console.error('[auto-publish] Failed to batch-publish lessons:', batchErr.message);
    } else {
      console.log(`[auto-publish] Published ${ids.length} lesson(s):`, data.map((l: any) => l.title).join(', '));
    }
  } catch (e: any) {
    console.error('[auto-publish] Lessons scheduler error:', e?.message);
  }
}

async function runAutoPublishAssignments() {
  try {
    const now = new Date().toISOString();
    // Try direct SQL first — single UPDATE is atomic and avoids PostgREST schema cache issues
    try {
      const result = await poolQuery(
        `UPDATE assignments
         SET status = 'published', publish_at = NULL, updated_at = $1
         WHERE publish_at IS NOT NULL
           AND publish_at <= $1
           AND status != 'published'
         RETURNING id, title`,
        [now]
      );
      if (result.rows.length > 0) {
        for (const a of result.rows) {
          console.log(`[auto-publish] Published assignment "${a.title}" (${a.id})`);
        }
      }
      return;
    } catch (sqlErr: any) {
      // If publish_at column missing, try to add it then bail (next tick will publish)
      if (String(sqlErr?.message || '').includes('publish_at')) {
        try {
          await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
          console.log('[auto-publish] Added missing publish_at column ✓');
        } catch { /* ignore */ }
      }
      console.warn('[auto-publish] poolQuery failed, falling back to supabaseAdmin:', sqlErr?.message?.split('\n')[0]);
    }
    // Fallback: supabaseAdmin
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select('id, title')
      .lte('publish_at', now)
      .neq('status', 'published');
    if (error) {
      console.warn('[auto-publish] assignments query error (publish_at may be missing):', error.message?.split('\n')[0]);
      return;
    }
    if (!data || data.length === 0) return;
    for (const a of data) {
      const { error: updErr } = await supabaseAdmin
        .from('assignments')
        .update({ status: 'published', publish_at: null, updated_at: now })
        .eq('id', a.id);
      if (updErr) {
        console.error(`[auto-publish] Failed to publish assignment "${a.title}":`, updErr.message);
      } else {
        console.log(`[auto-publish] Published assignment "${a.title}" (${a.id})`);
      }
    }
  } catch (e: any) {
    console.error('[auto-publish] Assignments scheduler error:', e?.message);
  }
}

async function runAutoPublishModules() {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('modules')
      .select('id, title')
      .lte('publish_at', now)
      .neq('status', 'active');
    if (error || !data || data.length === 0) return;
    // Batch update — 1 query instead of N
    const ids = data.map((m: any) => m.id);
    const { error: batchErr } = await supabaseAdmin
      .from('modules')
      .update({ status: 'active', publish_at: null, updated_at: now })
      .in('id', ids);
    if (batchErr) {
      console.error('[auto-publish] Failed to batch-publish modules:', batchErr.message);
    } else {
      console.log(`[auto-publish] Published ${ids.length} module(s):`, data.map((m: any) => m.title).join(', '));
    }
  } catch (e: any) {
    console.error('[auto-publish] Scheduler error:', e?.message);
  }
}

if (!process.env.VERCEL) {
  setInterval(() => { void runAutoPublishModules(); }, 60_000);
  void runAutoPublishModules();

  setInterval(() => { void runAutoPublishLessons(); }, 60_000);
  void runAutoPublishLessons();

  setInterval(() => { void runAutoPublishQuizzes(); }, 60_000);
  void runAutoPublishQuizzes();

  setInterval(() => { void runAutoPublishAssignments(); }, 60_000);
  void runAutoPublishAssignments();

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
