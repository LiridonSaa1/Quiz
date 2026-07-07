// server.ts
import "dotenv/config";
import dns from "dns";
import jwt from "jsonwebtoken";

// src/lib/schemaErrors.ts
function isMissingCoursesStudentIdsError(error) {
  if (error == null || typeof error !== "object") return false;
  const e = error;
  const hay = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  const code = e.code != null ? String(e.code) : "";
  if (code === "42703" || code === "PGRST204" || e.code === 42703) {
    if (hay.includes("student_ids")) return true;
  }
  if (!hay.includes("student_ids")) return false;
  if (code === "42703" || code === "PGRST204" || e.code === 42703) return true;
  if (hay.includes("courses.student_ids")) return true;
  if (hay.includes("does not exist") || hay.includes("could not find") || hay.includes("schema cache")) {
    return true;
  }
  return false;
}

// src/lib/routeAuth.ts
var normalizeRole = (role) => String(role || "").toLowerCase().trim();
function isAdmin(caller) {
  return normalizeRole(caller.role) === "admin";
}
function isTeacher(caller) {
  return normalizeRole(caller.role) === "teacher";
}
function canAccessTeacherCourses(caller, requestedUserId) {
  const normalizedRequested = String(requestedUserId || "").trim();
  if (!normalizedRequested) return false;
  if (isAdmin(caller)) return true;
  if (!isTeacher(caller)) return false;
  return caller.userId === normalizedRequested;
}

// src/lib/ai/errorContextResolver.ts
import { readFile } from "fs/promises";
import path from "path";
var MAX_SNIPPET_LINES = 80;
var DEFAULT_RADIUS = 12;
function safeRelativePath(fileName) {
  const trimmed = String(fileName || "").trim().replace(/\\/g, "/");
  if (!trimmed) return null;
  if (trimmed.includes("..")) return null;
  if (path.isAbsolute(trimmed)) return null;
  return trimmed.replace(/^\.?\//, "");
}
async function resolveErrorCodeContext(errorData) {
  const relativePath = safeRelativePath(errorData.fileName || "");
  if (!relativePath) return null;
  const absolutePath = path.join(process.cwd(), relativePath);
  let raw = "";
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  const requestedLine = Number(errorData.lineNumber);
  const hasLine = Number.isFinite(requestedLine) && requestedLine > 0;
  const center = hasLine ? requestedLine : 1;
  const radius = Math.max(1, Math.min(DEFAULT_RADIUS, Math.floor(MAX_SNIPPET_LINES / 2)));
  const startLine = Math.max(1, center - radius);
  const endLine = Math.min(lines.length, center + radius);
  const snippet = lines.slice(startLine - 1, endLine).map((line, idx) => `${startLine + idx}|${line}`).join("\n");
  return {
    fileName: relativePath,
    requestedLineNumber: hasLine ? requestedLine : void 0,
    startLine,
    endLine,
    snippet
  };
}

// src/lib/ai/formatFixSuggestion.ts
function formatFixSuggestion(result) {
  const analysis = String(result.analysis || "No analysis available.").trim();
  const suggestion = String(result.fixSuggestion || "No fix suggestion available.").trim();
  const patch = String(result.patch || "").trim();
  const assumptions = Array.isArray(result.assumptions) ? result.assumptions.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const patchSection = patch ? `\u{1F6E0}\uFE0F CODE PATCH
\`\`\`diff
${patch}
\`\`\`` : "\u{1F6E0}\uFE0F CODE PATCH\n```diff\n# No patch generated\n```";
  const assumptionsSection = assumptions.length ? ["", "\u{1F4DD} ASSUMPTIONS", ...assumptions.map((item) => `- ${item}`)].join("\n") : "";
  return [
    "\u{1F9E0} BUG ANALYSIS",
    `Problem: ${analysis}`,
    "",
    "\u{1F4A1} FIX SUGGESTION",
    suggestion,
    "",
    patchSection,
    assumptionsSection
  ].join("\n");
}
function withFormattedOutput(result) {
  return {
    ...result,
    formatted: formatFixSuggestion({
      analysis: result.analysis,
      fixSuggestion: result.fixSuggestion,
      patch: result.patch,
      assumptions: result.assumptions
    })
  };
}

// src/lib/ai/generateFixSuggestion.ts
var DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
var OPENAI_API_URL = "https://api.openai.com/v1/responses";
function normalizeErrorData(input) {
  return {
    message: String(input?.message || "Unknown error"),
    stack: input?.stack ? String(input.stack) : void 0,
    fileName: input?.fileName ? String(input.fileName) : void 0,
    lineNumber: Number.isFinite(Number(input?.lineNumber)) && Number(input?.lineNumber) > 0 ? Number(input.lineNumber) : void 0,
    currentUrl: input?.currentUrl ? String(input.currentUrl) : void 0,
    rawLog: input?.rawLog ? String(input.rawLog) : void 0
  };
}
function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  return "";
}
function extractJsonBlock(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
function buildOpenAIRequestBody(errorData, contextBlock) {
  return {
    model: DEFAULT_MODEL,
    input: buildPrompt(errorData, contextBlock)
  };
}
function parseOpenAIError(body) {
  try {
    const parsed = JSON.parse(body);
    const error = parsed?.error;
    if (!error || typeof error !== "object") return null;
    const message = typeof error.message === "string" ? error.message.trim() : "";
    const param = typeof error.param === "string" ? error.param.trim() : "";
    if (!message) return null;
    return {
      message,
      param: param || void 0
    };
  } catch {
    return null;
  }
}
function buildPrompt(errorData, contextBlock) {
  return [
    "You are an expert debugging assistant.",
    "Analyze the error and return ONLY valid JSON with keys:",
    "analysis (string), fixSuggestion (string), patch (string), assumptions (string[]).",
    "If you cannot create a patch, return patch as an empty string.",
    "Do not fabricate certainty; include assumptions when context is missing.",
    "",
    "Error payload:",
    JSON.stringify(errorData, null, 2),
    "",
    "Relevant code context:",
    contextBlock || "No code context available."
  ].join("\n");
}
async function generateFixSuggestion(errorDataInput) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const errorData = normalizeErrorData(errorDataInput);
  const context = await resolveErrorCodeContext(errorData);
  const contextBlock = context ? `File: ${context.fileName}
Requested line: ${context.requestedLineNumber || "n/a"}
Snippet:
${context.snippet}` : "";
  const fallback = withFormattedOutput({
    analysis: "Unable to analyze error with AI right now.",
    fixSuggestion: "Check logs, confirm stack trace source, and retry the AI suggestion endpoint once service connectivity is restored.",
    patch: "",
    model: DEFAULT_MODEL,
    timestamp,
    assumptions: ["AI service unavailable or invalid response format."],
    context
  });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return withFormattedOutput({
      ...fallback,
      analysis: "OPENAI_API_KEY is missing in server environment.",
      fixSuggestion: "Set OPENAI_API_KEY (and optionally OPENAI_MODEL) in the backend environment, then retry.",
      assumptions: ["No outbound AI call was made because credentials are missing."]
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3e4);
  try {
    const requestBody = buildOpenAIRequestBody(errorData, contextBlock);
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text();
      const parsedError = parseOpenAIError(body);
      const unsupportedParam = parsedError?.message.toLowerCase().includes("unsupported parameter");
      const paramDetails = parsedError?.param ? ` (param: ${parsedError.param})` : "";
      const details = parsedError?.message || `OpenAI returned a non-OK response body: ${body.slice(0, 500)}`;
      return withFormattedOutput({
        ...fallback,
        analysis: `OpenAI request failed (${response.status}).`,
        fixSuggestion: unsupportedParam ? `OpenAI rejected an unsupported request parameter${paramDetails}. The service now sends a safe payload without optional tuning parameters. Response: ${details}` : `Inspect OpenAI API response and credentials. Response: ${details}`
      });
    }
    const payload = await response.json();
    const outputText = extractOutputText(payload);
    const parsed = extractJsonBlock(outputText);
    if (!parsed || typeof parsed !== "object") {
      return withFormattedOutput({
        ...fallback,
        analysis: "AI returned a non-JSON payload.",
        fixSuggestion: `Review model output and tighten prompt schema. Raw output: ${outputText.slice(0, 500)}`
      });
    }
    return withFormattedOutput({
      analysis: String(parsed.analysis || "No analysis provided."),
      fixSuggestion: String(parsed.fixSuggestion || "No fix suggestion provided."),
      patch: typeof parsed.patch === "string" ? parsed.patch : "",
      model: DEFAULT_MODEL,
      timestamp,
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map((x) => String(x)) : void 0,
      context
    });
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    return withFormattedOutput({
      ...fallback,
      analysis: isAbort ? "AI request timed out." : "AI request failed unexpectedly.",
      fixSuggestion: isAbort ? "Retry with the same payload or reduce prompt context size." : `Inspect backend logs for details: ${String(error?.message || error)}`
    });
  } finally {
    clearTimeout(timeout);
  }
}

// src/lib/email.ts
var BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
function pick(value) {
  return typeof value === "string" ? value.trim() : "";
}
function resolveConfig(override) {
  const apiKey = pick(override?.apiKey) || pick(process.env.BREVO_API_KEY);
  const senderEmail = pick(override?.senderEmail) || pick(process.env.BREVO_SENDER_EMAIL);
  const senderName = pick(override?.senderName) || pick(process.env.BREVO_SENDER_NAME) || "QuizMaster";
  return { apiKey, senderEmail, senderName };
}
function isEmailConfigured(override) {
  const { apiKey, senderEmail } = resolveConfig(override);
  return Boolean(apiKey && senderEmail);
}
async function sendEmail(msg, override) {
  const { apiKey, senderEmail, senderName } = resolveConfig(override);
  if (!apiKey || !senderEmail) {
    throw new Error("Brevo is not configured (missing API key or sender email)");
  }
  const body = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: msg.to, name: msg.toName || msg.to }],
    subject: msg.subject,
    htmlContent: msg.htmlContent,
    textContent: msg.textContent
  };
  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = errText ? JSON.parse(errText) : null;
    } catch {
    }
    const message = parsed?.message || errText || `Brevo responded ${res.status}`;
    throw new Error(`Brevo send failed: ${message}`);
  }
  const json = await res.json().catch(() => ({}));
  return { messageId: json?.messageId };
}
function renderCredentialEmail(opts) {
  const brand = (opts.brandName || "QuizMaster").trim();
  const isTeacher2 = opts.role === "teacher";
  const subject = isTeacher2 ? `Ftes\xEB p\xEBr akses n\xEB ${brand}` : `Llogaria juaj n\xEB ${brand} \xEBsht\xEB krijuar`;
  const roleLabel = isTeacher2 ? "m\xEBsues" : "student";
  const accentColor = isTeacher2 ? "#6366f1" : "#10b981";
  const greeting = isTeacher2 ? `Ju jeni ftuar si <strong>${roleLabel}</strong> n\xEB platform\xEBn <strong>${brand}</strong>.` : `Llogaria juaj si <strong>${roleLabel}</strong> n\xEB platform\xEBn <strong>${brand}</strong> \xEBsht\xEB krijuar me sukses.`;
  const textContent = [
    `P\xEBrsh\xEBndetje ${opts.name},`,
    ``,
    greeting.replace(/<[^>]+>/g, ""),
    ``,
    `Kredencialet tuaja jan\xEB:`,
    `  Email: ${opts.email}`,
    `  Fjal\xEBkalim: ${opts.password}`,
    ``,
    `Klikoni k\xEBtu p\xEBr t'u ky\xE7ur: ${opts.loginUrl}`,
    ``,
    `Ju mir\xEBpresim!`,
    `Ekipi i ${brand}`
  ].join("\n");
  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:${accentColor};padding:32px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">${isTeacher2 ? "Ftes\xEB M\xEBsuesi" : "Llogari e Re Studenti"}</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">P\xEBrsh\xEBndetje, ${opts.name}!</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">${greeting}</p>

          <!-- Credentials box -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Kredencialet e aksesit</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;width:90px;">\u{1F4E7} Email</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${opts.email}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">\u{1F511} Fjal\xEBkalim</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;font-family:'Courier New',monospace;">${opts.password}</td>
              </tr>
            </table>
          </div>

          <!-- Login button -->
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${opts.loginUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;">
              \u{1F517} Ky\xE7u tani
            </a>
          </div>

          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            N\xEBse keni pyetje, na kontaktoni. Mos e ndani fjal\xEBkalimin tuaj me ask\xEBnd tjet\xEBr.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">D\xEBrguar nga platforma <strong>${brand}</strong> \xB7 Ju mir\xEBpresim!</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, htmlContent, textContent };
}
function renderInvoiceEmail(opts) {
  const brand = (opts.brandName || "QuizMaster").trim();
  const subject = `Fatur\xEB pagese \u2014 ${opts.monthLabel} | ${brand}`;
  const amountStr = opts.amount > 0 ? `\u20AC${opts.amount.toFixed(2)}` : "\u2014";
  let dateStr = opts.paidAt.slice(0, 10);
  try {
    dateStr = new Date(opts.paidAt).toLocaleDateString("sq-AL", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
  }
  const textContent = [
    `Fatur\xEB Pagese \u2014 ${brand}`,
    ``,
    `I nderuar/e ${opts.studentName},`,
    `Pagesa juaj p\xEBr muajin ${opts.monthLabel} u konfirmua me sukses.`,
    ``,
    `Muaji: ${opts.monthLabel}`,
    `Shuma: ${amountStr}`,
    `Data: ${dateStr}`,
    opts.notes ? `Sh\xEBnime: ${opts.notes}` : "",
    ``,
    `Ju faleminderit! \u2014 Ekipi i ${brand}`
  ].filter(Boolean).join("\n");
  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:#10b981;padding:32px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Konfirmim Pagese \u2713</div>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">P\xEBrsh\xEBndetje, ${opts.studentName}!</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
            Pagesa juaj p\xEBr muajin <strong>${opts.monthLabel}</strong> u konfirmua me sukses.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Detajet e Fatur\xEBs</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;width:110px;">\u{1F4C5} Muaji</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${opts.monthLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">\u{1F4B6} Shuma</td>
                <td style="padding:6px 0;font-size:16px;font-weight:800;color:#10b981;">${amountStr}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">\u{1F5D3}\uFE0F Data</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${dateStr}</td>
              </tr>
              ${opts.notes ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;">\u{1F4DD} Sh\xEBnime</td><td style="padding:6px 0;font-size:13px;color:#374151;">${opts.notes}</td></tr>` : ""}
            </table>
          </div>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            Ruajeni k\xEBt\xEB email si d\xEBshmi pagese. N\xEBse keni pyetje, na kontaktoni.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">D\xEBrguar nga platforma <strong>${brand}</strong> \xB7 Ju faleminderit!</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, htmlContent, textContent };
}
function renderPaymentReminderEmail(opts) {
  const brand = (opts.brandName || "QuizMaster").trim();
  const subject = `\u23F0 Kujtues pagese \u2014 ${opts.monthLabel} | ${brand}`;
  const daysLate = Math.max(0, opts.dayOfMonth - 5);
  const urgency = daysLate >= 10 ? "Urgjente" : daysLate >= 5 ? "Afati po afrohet" : "Kujtues mujor";
  const textContent = [
    `${urgency} \u2014 ${brand}`,
    ``,
    `I nderuar/e ${opts.studentName},`,
    `Ju kujtojm\xEB se pagesa juaj p\xEBr muajin ${opts.monthLabel} \xEBsht\xEB e papaguar.`,
    ``,
    `Ju lutemi kontaktoni administratorin tuaj sa m\xEB par\xEB.`,
    ``,
    `Ju faleminderit! \u2014 Ekipi i ${brand}`
  ].join("\n");
  const accentColor = daysLate >= 10 ? "#ef4444" : daysLate >= 5 ? "#f97316" : "#f59e0b";
  const bgColor = daysLate >= 10 ? "#fef2f2" : daysLate >= 5 ? "#fff7ed" : "#fefce8";
  const borderColor = daysLate >= 10 ? "#fecaca" : daysLate >= 5 ? "#fed7aa" : "#fde68a";
  const loginBtn = opts.loginUrl ? `
          <div style="text-align:center;margin-bottom:20px;">
            <a href="${opts.loginUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:12px;">
              \u{1F517} Ky\xE7u dhe shiko detajet
            </a>
          </div>` : "";
  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:${accentColor};padding:28px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">${urgency} \u23F0</div>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">P\xEBrsh\xEBndetje, ${opts.studentName}!</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
            Ju kujtojm\xEB se pagesa juaj mujore p\xEBr <strong>${opts.monthLabel}</strong> ende nuk \xEBsht\xEB regjistruar.
          </p>
          <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:14px;padding:18px 22px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
              \u{1F4C5} <strong>Afati:</strong> dita e 5-t\xEB e muajit<br>
              \u{1F4B6} <strong>Muaji:</strong> ${opts.monthLabel}<br>
              \u{1F4CC} <strong>Statusi:</strong> E papaguar
            </p>
          </div>
          ${loginBtn}
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            N\xEBse pagesa tashm\xEB \xEBsht\xEB b\xEBr\xEB, ju lutemi kontaktoni administratorin. Ky email d\xEBrgohet automatikisht nga sistemi.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">D\xEBrguar nga platforma <strong>${brand}</strong> \xB7 Ju faleminderit!</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, htmlContent, textContent };
}

// src/lib/notifyEvents.ts
var RECIPIENTS = {
  newEnrollment: { student: true, teacher: true, admin: true },
  quizSubmitted: { student: true, teacher: true, admin: true },
  certificateIssued: { student: true, teacher: true, admin: true },
  paymentReceived: { student: true, teacher: true, admin: true },
  maintenanceAlert: { student: false, teacher: false, admin: true },
  weeklyReport: { student: false, teacher: false, admin: true }
};
var TYPE_MAP = {
  newEnrollment: "course",
  quizSubmitted: "quiz",
  certificateIssued: "success",
  paymentReceived: "success",
  maintenanceAlert: "warning",
  weeklyReport: "info"
};
var SETTINGS_KEY = {
  newEnrollment: "email_new_enrollment",
  quizSubmitted: "email_quiz_submitted",
  certificateIssued: "email_certificate_issued",
  paymentReceived: "email_payment_received",
  maintenanceAlert: "system_maintenance_alerts",
  weeklyReport: "weekly_report"
};
var ACTION_URLS = {
  newEnrollment: {
    student: "/student/courses",
    teacher: "/teacher/courses",
    admin: "/admin/courses"
  },
  quizSubmitted: {
    student: "/student/results",
    teacher: "/teacher/quizzes",
    admin: "/admin/quizzes"
  },
  certificateIssued: {
    student: "/student/certificates",
    teacher: "/teacher/certificates",
    admin: "/admin/certificates"
  },
  paymentReceived: {
    student: "/student/payments",
    teacher: "/teacher/payments",
    admin: "/admin/payments"
  },
  maintenanceAlert: {
    student: "/admin/settings",
    teacher: "/admin/settings",
    admin: "/admin/settings"
  },
  weeklyReport: {
    student: "/admin",
    teacher: "/admin",
    admin: "/admin"
  }
};
function formatMoney(amount, currency) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  const cur = (currency || "").toUpperCase().trim();
  try {
    if (cur && /^[A-Z]{3}$/.test(cur)) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(amount);
    }
  } catch {
  }
  return `${cur ? cur + " " : ""}${amount.toFixed(2)}`;
}
function renderContent(role, event, ctx) {
  const courseTitle = ctx.courseTitle || "a course";
  const quizTitle = ctx.quizTitle || "a quiz";
  const studentName = ctx.studentName || "A student";
  switch (event) {
    case "newEnrollment":
      if (role === "student") {
        return {
          title: "Enrollment confirmed",
          message: `You're now enrolled in "${courseTitle}". Start learning anytime from your courses page.`
        };
      }
      if (role === "teacher") {
        return {
          title: "New course enrollment",
          message: `${studentName} just enrolled in "${courseTitle}".`
        };
      }
      return {
        title: "New course enrollment",
        message: `${studentName} enrolled in "${courseTitle}".`
      };
    case "quizSubmitted": {
      const scoreText = typeof ctx.score === "number" && typeof ctx.totalPoints === "number" ? ` \u2014 scored ${ctx.score}/${ctx.totalPoints}${ctx.passed ? " (passed)" : ""}` : "";
      if (role === "student") {
        return {
          title: "Quiz submitted",
          message: `Your attempt at "${quizTitle}"${scoreText} was recorded.`
        };
      }
      if (role === "teacher") {
        return {
          title: "New quiz attempt",
          message: `${studentName} submitted "${quizTitle}"${scoreText}.`
        };
      }
      return {
        title: "Quiz submitted",
        message: `${studentName} submitted "${quizTitle}"${scoreText}.`
      };
    }
    case "certificateIssued": {
      const numberText = ctx.certificateNumber ? ` (#${ctx.certificateNumber})` : "";
      if (role === "student") {
        return {
          title: "Certificate issued",
          message: `Your certificate for "${courseTitle}"${numberText} is ready to view and download.`
        };
      }
      if (role === "teacher") {
        return {
          title: "Certificate issued",
          message: `Certificate issued to ${studentName} for "${courseTitle}"${numberText}.`
        };
      }
      return {
        title: "Certificate issued",
        message: `${studentName} received a certificate for "${courseTitle}"${numberText}.`
      };
    }
    case "paymentReceived": {
      const moneyText = formatMoney(ctx.amount, ctx.currency);
      const amountText = moneyText ? ` of ${moneyText}` : "";
      if (role === "student") {
        return {
          title: "Payment received",
          message: `Your payment${amountText} was processed successfully. A receipt is available in your billing history.`
        };
      }
      if (role === "teacher") {
        return {
          title: "Payment received",
          message: `Payment${amountText} from ${studentName}${ctx.courseTitle ? ` for "${ctx.courseTitle}"` : ""} was processed successfully.`
        };
      }
      return {
        title: "Payment received",
        message: `Payment${amountText} from ${studentName} was processed successfully.`
      };
    }
    case "maintenanceAlert": {
      const enabled = ctx.maintenanceEnabled;
      const note = (ctx.maintenanceNote || "").trim();
      if (enabled === true) {
        return {
          title: "Maintenance mode enabled",
          message: note ? `The platform is now in maintenance mode. ${note}` : "The platform is now in maintenance mode. Non-admin users will see a maintenance notice until it is turned off."
        };
      }
      if (enabled === false) {
        return {
          title: "Maintenance mode disabled",
          message: note ? `The platform is back online and available to all users. ${note}` : "The platform is back online and available to all users."
        };
      }
      return {
        title: "System maintenance alert",
        message: note || "A platform health alert was triggered."
      };
    }
    case "weeklyReport": {
      const t = ctx.reportTotals || {};
      const parts = [];
      if (typeof t.enrollments === "number") parts.push(`${t.enrollments} new enrollments`);
      if (typeof t.quizAttempts === "number") parts.push(`${t.quizAttempts} quiz attempts`);
      if (typeof t.certificatesIssued === "number") parts.push(`${t.certificatesIssued} certificates issued`);
      if (typeof t.payments === "number" && t.payments > 0) {
        const revenue = formatMoney(t.revenue, t.currency);
        parts.push(`${t.payments} payments${revenue ? ` (${revenue})` : ""}`);
      }
      const summary = parts.length ? parts.join(", ") : "No new activity in the last 7 days";
      return {
        title: "Weekly summary report",
        message: `Last 7 days: ${summary}.`
      };
    }
  }
}
async function notifyEvent(admin, deps, event, ctx) {
  try {
    const roleEnabled = await deps.isEventEnabled(SETTINGS_KEY[event]);
    const baseRecipients = RECIPIENTS[event];
    const recipients = {
      student: baseRecipients.student && roleEnabled.student,
      teacher: baseRecipients.teacher && roleEnabled.teacher,
      admin: baseRecipients.admin && roleEnabled.admin
    };
    if (!recipients.student && !recipients.teacher && !recipients.admin) return;
    const seen = /* @__PURE__ */ new Set();
    const rows = [];
    const push = (uid, role) => {
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
        action_url: ACTION_URLS[event][role]
      });
    };
    if (!ctx.studentName && ctx.studentId) {
      try {
        const { data } = await admin.from("profiles").select("display_name, email").eq("id", ctx.studentId).maybeSingle();
        if (data) {
          ctx.studentName = String(data.display_name || data.email || "A student");
        }
      } catch {
      }
    }
    if (recipients.student) push(ctx.studentId, "student");
    if (recipients.teacher) push(ctx.teacherId, "teacher");
    if (recipients.admin) {
      try {
        const { data: admins } = await admin.from("profiles").select("id, status").eq("role", "admin");
        const adminIds = (admins || []).filter((a) => !a.status || String(a.status).toLowerCase() === "active").map((a) => String(a.id)).filter(Boolean);
        for (const uid of adminIds) push(uid, "admin");
      } catch (adminErr) {
        console.warn(`[notify:${event}] failed to load admins:`, adminErr?.message || adminErr);
      }
    }
    if (rows.length === 0) return;
    let insertRows = rows;
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await admin.from("notifications").insert(insertRows);
      if (!error) {
        lastError = null;
        break;
      }
      const msg = String(error.message || "");
      lastError = msg;
      const missingCol = msg.match(/Could not find the '(\w+)' column/)?.[1];
      if (missingCol && ["title", "read", "action_url"].includes(missingCol)) {
        insertRows = insertRows.map((r) => {
          const copy = { ...r };
          delete copy[missingCol];
          return copy;
        });
      } else {
        break;
      }
    }
    if (lastError) {
      console.warn(`[notify:${event}] insert failed (retry):`, lastError);
    }
  } catch (err) {
    console.warn(`[notify:${event}] dispatch failed:`, err?.message || err);
  }
}

// src/lib/headwayData.ts
var OUP2 = "https://elt.oup.com";
var CC2 = "?cc=global&selLanguage=en";
var g = (slug, unit, file) => `/student/headway/${slug}/grammar/${unit}/${file}`;
var v = (slug, unit, file) => `/student/headway/${slug}/vocabulary/${unit}/${file}`;
var DL = (level_name, n) => `${OUP2}/elt/students/headway/downloads/headway_${level_name}_students_book_unit_${String(n).padStart(2, "0")}.zip`;
var VL = (level_name, n) => `${OUP2}/elt/students/headway/downloads/headway_${level_name}_video_unit_${String(n).padStart(2, "0")}.zip`;
var HEADWAY_FULL_DATA = {
  "Beginner": {
    slug: "beg",
    units: [
      {
        num: 1,
        title: "Unit 1 \u2014 Hello!",
        description: "Greetings, introductions and basic personal information.",
        eeSlug: "unit01",
        audioZip: DL("beginner", 1),
        videoZip: VL("beginner", 1),
        grammar: [{ topic: "Present Simple", path: g("beg", "grammarunit01", "hwy_begin_unit01_1") }, { topic: "Questions and answers", path: g("beg", "grammarunit01", "hwy_begin_unit01_3") }],
        vocabulary: [{ topic: "Numbers", path: v("beg", "vocabularyunit01", "hwy_begin_unit01_4") }]
      },
      {
        num: 2,
        title: "Unit 2 \u2014 Your world",
        description: "Countries, nationalities and describing where you are from.",
        eeSlug: "unit02",
        audioZip: DL("beginner", 2),
        videoZip: VL("beginner", 2),
        grammar: [{ topic: "am / are / is", path: g("beg", "grammarunit02", "hwy_begin_unit02_1") }, { topic: "Questions and answers", path: g("beg", "grammarunit02", "hwy_begin_unit02_2") }],
        vocabulary: [{ topic: "Cities and countries", path: v("beg", "vocabularyunit02", "hwy_begin_unit02_4") }]
      },
      {
        num: 3,
        title: "Unit 3 \u2014 All about you!",
        description: "Personal information, jobs and family.",
        eeSlug: "unit03",
        audioZip: DL("beginner", 3),
        videoZip: VL("beginner", 3),
        grammar: [{ topic: "Personal information", path: g("beg", "grammarunit03", "hwy_begin_unit03_3") }, { topic: "Questions and short answers", path: g("beg", "grammarunit03", "hwy_begin_unit03_1") }],
        vocabulary: [{ topic: "Social expressions", path: v("beg", "vocabularyunit03", "hwy_begin_unit03_4") }]
      },
      {
        num: 4,
        title: "Unit 4 \u2014 Family and friends",
        description: "Talking about family members and describing people.",
        eeSlug: "unit04",
        audioZip: DL("beginner", 4),
        videoZip: VL("beginner", 4),
        grammar: [{ topic: "Possessives", path: g("beg", "grammarunit04", "hwy_begin_unit04_1") }, { topic: "Questions and answers", path: g("beg", "grammarunit04", "hwy_begin_unit04_3") }],
        vocabulary: [{ topic: "Word groups", path: v("beg", "vocabularyunit04", "hwy_begin_unit04_1") }]
      },
      {
        num: 5,
        title: "Unit 5 \u2014 It's my life!",
        description: "Daily routines, likes and dislikes.",
        eeSlug: "unit05",
        audioZip: DL("beginner", 5),
        videoZip: VL("beginner", 5),
        grammar: [{ topic: "Present Simple 1", path: g("beg", "grammarunit05", "hwy_begin_unit05_1") }, { topic: "Present Simple 2", path: g("beg", "grammarunit05", "hwy_begin_unit05_3") }],
        vocabulary: [{ topic: "Countries and nationalities", path: v("beg", "vocabularyunit05", "hwy_begin_unit05_4") }, { topic: "Odd-one-out", path: v("beg", "vocabularyunit05", "hwy_begin_unit05_2") }]
      },
      {
        num: 6,
        title: "Unit 6 \u2014 Every day",
        description: "Everyday activities and telling the time.",
        eeSlug: "unit06",
        audioZip: DL("beginner", 6),
        videoZip: VL("beginner", 6),
        grammar: [{ topic: "Present Simple", path: g("beg", "grammarunit06", "hwy_begin_unit06_1") }, { topic: "Questions and answers", path: g("beg", "grammarunit06", "hwy_begin_unit06_2") }],
        vocabulary: [{ topic: "Your day", path: v("beg", "vocabularyunit06", "hwy_begin_unit06_3") }]
      },
      {
        num: 7,
        title: "Unit 7 \u2014 Places I like",
        description: "Describing places and talking about towns and cities.",
        eeSlug: "unit07",
        audioZip: DL("beginner", 7),
        videoZip: VL("beginner", 7),
        grammar: [{ topic: "Question words", path: g("beg", "grammarunit07", "hwy_begin_unit07_1") }, { topic: "Questions and answers", path: g("beg", "grammarunit07", "hwy_begin_unit07_2") }, { topic: "Verb patterns", path: g("beg", "grammarunit07", "hwy_upp_unit07_1") }],
        vocabulary: [{ topic: "Adjectives", path: v("beg", "vocabularyunit07", "hwy_begin_unit07_3") }, { topic: "Everyday English expressions", path: v("beg", "vocabularyunit07", "hwy_begin_unit07_4") }]
      },
      {
        num: 8,
        title: "Unit 8 \u2014 Clothes and colours",
        description: "Shopping for clothes, colours and describing what people wear.",
        eeSlug: "unit08",
        audioZip: DL("beginner", 8),
        videoZip: VL("beginner", 8),
        grammar: [{ topic: "There is / There are", path: g("beg", "grammarunit08", "hwy_begin_unit08_1") }, { topic: "Questions and answers", path: g("beg", "grammarunit08", "hwy_begin_unit08_2") }],
        vocabulary: [{ topic: "Places and things", path: v("beg", "unit08", "hwy_begin_unit08_4") }]
      },
      {
        num: 9,
        title: "Unit 9 \u2014 Food and drink",
        description: "Ordering food, talking about meals and cooking.",
        eeSlug: "unit09",
        audioZip: DL("beginner", 9),
        videoZip: VL("beginner", 9),
        grammar: [{ topic: "was / were", path: g("beg", "grammarunit09", "hwy_begin_unit09_1") }, { topic: "Past Simple irregular", path: g("beg", "grammarunit09", "hwy_begin_unit09_2") }],
        vocabulary: [{ topic: "have, do, go", path: v("beg", "unit09", "hwy_begin_unit09_1") }]
      },
      {
        num: 10,
        title: "Unit 10 \u2014 I can do it!",
        description: "Talking about abilities and making requests.",
        eeSlug: "unit10",
        audioZip: DL("beginner", 10),
        videoZip: VL("beginner", 10),
        grammar: [{ topic: "Past Simple 1", path: g("beg", "grammarunit10", "hwy_begin_unit10_1") }],
        vocabulary: [{ topic: "Work, sports, and leisure", path: v("beg", "unit10", "hwy_begin_unit10_4") }]
      },
      {
        num: 11,
        title: "Unit 11 \u2014 The past",
        description: "Talking about past events and telling life stories.",
        eeSlug: "unit11",
        audioZip: DL("beginner", 11),
        videoZip: VL("beginner", 11),
        grammar: [{ topic: "can / can't", path: g("beg", "grammarunit11", "hwy_begin_unit11_1") }, { topic: "Requests", path: g("beg", "grammarunit11", "hwy_begin_unit11_4") }],
        vocabulary: [{ topic: "Verbs", path: v("beg", "unit11", "hwy_begin_unit11_2") }]
      },
      {
        num: 12,
        title: "Unit 12 \u2014 Thank you and goodbye!",
        description: "Making plans, saying goodbye and reviewing the course.",
        eeSlug: "unit12",
        audioZip: DL("beginner", 12),
        videoZip: VL("beginner", 12),
        grammar: [{ topic: "like / would like", path: g("beg", "grammarunit12", "hwy_begin_unit12_1") }, { topic: "some / any", path: g("beg", "grammarunit12", "hwy_begin_unit12_3") }],
        vocabulary: [{ topic: "In a restaurant", path: v("beg", "unit12", "hwy_begin_unit12_4") }]
      },
      {
        num: 13,
        title: "Unit 13 \u2014 Here and now",
        description: "Talking about what is happening right now.",
        eeSlug: "unit13",
        audioZip: DL("beginner", 13),
        videoZip: VL("beginner", 13),
        grammar: [{ topic: "Present Continuous", path: g("beg", "grammarunit13", "hwy_begin_unit13_1") }, { topic: "Questions and answers", path: g("beg", "grammarunit13", "hwy_begin_unit13_2") }],
        vocabulary: [{ topic: "Opposite verbs", path: v("beg", "unit13", "hwy_begin_unit12_1") }]
      },
      {
        num: 14,
        title: "Unit 14 \u2014 It's time to go!",
        description: "Making future plans and talking about travel.",
        eeSlug: "unit14",
        audioZip: DL("beginner", 14),
        videoZip: VL("beginner", 14),
        grammar: [{ topic: "Present Continuous for future", path: g("beg", "grammarunit14", "hwy_begin_unit14_1") }, { topic: "Future plans", path: g("beg", "grammarunit14", "hwy_begin_unit14_3") }],
        vocabulary: [{ topic: "Transport and travel", path: v("beg", "unit14", "hwy_begin_unit14_4") }]
      }
    ]
  },
  "Elementary": {
    slug: "elementary4",
    units: [
      {
        num: 1,
        title: "Unit 1 \u2014 Getting to know you",
        description: "Meeting people and sharing personal information.",
        eeSlug: "unit01",
        grammar: [{ topic: "am / are / is", path: g("elementary4", "unit01", "hwy_elem_unit01_1") }, { topic: "Possessive 's", path: g("elementary4", "unit01", "hwy_elem_unit01_2") }],
        vocabulary: [{ topic: "Conversations", path: v("elementary4", "unit01", "hwy_elem_unit01_1") }, { topic: "Verbs", path: v("elementary4", "unit01", "hwy_elem_unit01_2") }]
      },
      {
        num: 2,
        title: "Unit 2 \u2014 Work hard, play hard!",
        description: "Jobs, routines and leisure activities.",
        eeSlug: "unit02",
        grammar: [{ topic: "Present Simple 1", path: g("elementary4", "unit02", "hwy_elem_unit02_2") }, { topic: "Questions and answers", path: g("elementary4", "unit02", "hwy_elem_unit02_1") }],
        vocabulary: [{ topic: "Times", path: v("elementary4", "unit02", "hwy_elem_unit02_1") }]
      },
      {
        num: 3,
        title: "Unit 3 \u2014 It's a wonderful world!",
        description: "Countries, languages and world knowledge.",
        eeSlug: "unit03",
        grammar: [{ topic: "Adverbs of frequency", path: g("elementary4", "unit03", "hwy_elem_unit03_1") }, { topic: "Present Simple 2", path: g("elementary4", "unit03", "hwy_elem_unit03_2") }, { topic: "Present Simple 3", path: g("elementary4", "unit03", "hwy_elem_unit03_3") }],
        vocabulary: [{ topic: "Words that go together", path: v("elementary4", "unit03", "hwy_elem_unit03_1") }]
      },
      {
        num: 4,
        title: "Unit 4 \u2014 Eat, drink and be merry!",
        description: "Food, drink and eating out.",
        eeSlug: "unit04",
        grammar: [{ topic: "some / any", path: g("elementary4", "unit04", "hwy_elem_unit04_1") }, { topic: "There is / are", path: g("elementary4", "unit04", "hwy_elem_unit04_2") }],
        vocabulary: [{ topic: "Adjectives", path: v("elementary4", "unit04", "hwy_elem_unit04_1") }, { topic: "Numbers", path: v("elementary4", "unit04", "hwy_elem_unit04_2") }]
      },
      {
        num: 5,
        title: "Unit 5 \u2014 A sense of history",
        description: "Historical events and biographies.",
        eeSlug: "unit05",
        grammar: [{ topic: "Present Simple and Past Simple", path: g("elementary4", "unit05", "hwy_elem_unit05_1") }, { topic: "can / could, was / were", path: g("elementary4", "unit05", "hwy_elem_unit05_2") }],
        vocabulary: [{ topic: "Noun + noun", path: v("elementary4", "unit05", "hwy_elem_unit05_1") }, { topic: "Verb + noun", path: v("elementary4", "unit05", "hwy_elem_unit05_2") }, { topic: "Polite requests", path: v("elementary4", "unit05", "hwy_elem_unit05_3") }]
      },
      {
        num: 6,
        title: "Unit 6 \u2014 Time off",
        description: "Free time, hobbies and weekend activities.",
        eeSlug: "unit06",
        grammar: [{ topic: "Past Simple 1", path: g("elementary4", "unit06", "hwy_elem_unit06_1") }, { topic: "Past Simple 2", path: g("elementary4", "unit06", "hwy_elem_unit06_2") }],
        vocabulary: [{ topic: "Adjectives", path: v("elementary4", "unit06", "hwy_elem_unit06_1") }, { topic: "Months of the year", path: v("elementary4", "unit06", "hwy_elem_unit06_2") }]
      },
      {
        num: 7,
        title: "Unit 7 \u2014 Passions!",
        description: "Talking about things you love and feel strongly about.",
        eeSlug: "unit07",
        grammar: [{ topic: "Adverbs", path: g("elementary4", "unit07", "hwy_elem_unit07_1") }, { topic: "Past Simple 3", path: g("elementary4", "unit07", "hwy_elem_unit07_2") }],
        vocabulary: [{ topic: "in, at, or on?", path: v("elementary4", "unit07", "hwy_elem_unit07_11") }]
      },
      {
        num: 8,
        title: "Unit 8 \u2014 How things began",
        description: "Inventions and the history of everyday things.",
        eeSlug: "unit08",
        grammar: [{ topic: "like and would like", path: g("elementary4", "unit08", "hwy_elem_unit08_1") }, { topic: "some, any, much, many", path: g("elementary4", "unit08", "hwy_elem_unit08_2") }],
        vocabulary: [{ topic: "Food and drink", path: v("elementary4", "unit08", "hwy_elem_unit08_1") }]
      },
      {
        num: 9,
        title: "Unit 9 \u2014 Changing times",
        description: "Changes in society, life and technology.",
        eeSlug: "unit09",
        grammar: [{ topic: "Comparatives and superlatives", path: g("elementary4", "unit09", "hwy_elem_unit09_1") }, { topic: "Superlatives", path: g("elementary4", "unit09", "hwy_elem_unit09_2") }, { topic: "Directions", path: g("elementary4", "unit09", "hwy_elem_unit09_3") }],
        vocabulary: [{ topic: "Places", path: v("elementary4", "unit09", "hwy_elem_unit09_11") }]
      },
      {
        num: 10,
        title: "Unit 10 \u2014 How does that make you feel?",
        description: "Emotions, feelings and expressing opinions.",
        eeSlug: "unit10",
        grammar: [{ topic: "Present Continuous", path: g("elementary4", "unit10", "hwy_elem_unit10_1") }, { topic: "anything, something, nothing", path: g("elementary4", "unit10", "hwy_elem_unit10_2") }],
        vocabulary: [{ topic: "Social expressions", path: v("elementary4", "unit10", "hwy_elem_unit10_2") }]
      },
      {
        num: 11,
        title: "Unit 11 \u2014 In my life",
        description: "Personal experiences and important life events.",
        eeSlug: "unit11",
        grammar: [{ topic: "going to and Past Simple", path: g("elementary4", "unit11", "hwy_elem_unit11_1") }, { topic: "Suggestions", path: g("elementary4", "unit11", "hwy_elem_unit11_2") }],
        vocabulary: [{ topic: "The weather", path: v("elementary4", "unit11", "hwy_elem_unit11_2") }]
      },
      {
        num: 12,
        title: "Unit 12 \u2014 Looking ahead",
        description: "Future plans, hopes and ambitions.",
        eeSlug: "unit12",
        grammar: [{ topic: "Present Perfect 1", path: g("elementary4", "unit12", "hwy_elem_unit12_1") }, { topic: "Present Perfect 2", path: g("elementary4", "unit12", "hwy_elem_unit12_2") }],
        vocabulary: [{ topic: "take, get, go", path: v("elementary4", "unit12", "hwy_elem_unit12_1") }]
      }
    ]
  },
  "Pre-Intermediate": {
    slug: "preint4",
    units: [
      {
        num: 1,
        title: "Unit 1 \u2014 No place like home",
        description: "Homes, houses and living spaces.",
        eeSlug: "unit01",
        grammar: [{ topic: "Tenses", path: g("preint4", "unit01", "hwy_preint_unit01_1") }, { topic: "Question words", path: g("preint4", "unit01", "hwy_preint_unit01_2") }],
        vocabulary: [{ topic: "Adjectives ending in -ed and -ing", path: v("preint4", "unit01", "hwy_preint_unit01_1") }, { topic: "Words with two meanings", path: v("preint4", "unit01", "hwy_preint_unit01_2") }]
      },
      {
        num: 2,
        title: "Unit 2 \u2014 Whatever makes you happy!",
        description: "Happiness, lifestyle and what matters to people.",
        eeSlug: "unit02",
        grammar: [{ topic: "Present Simple / Continuous", path: g("preint4", "unit02", "hwy_preint_unit02_1") }, { topic: "Short answers", path: g("preint4", "unit02", "hwy_preint_unit02_2") }],
        vocabulary: [{ topic: "Making conversation", path: v("preint4", "unit02", "hwy_preint_unit02_1") }, { topic: "Things I like doing", path: v("preint4", "unit02", "hwy_preint_unit02_2") }]
      },
      {
        num: 3,
        title: "Unit 3 \u2014 What happened next?",
        description: "Telling stories and narrative past tenses.",
        eeSlug: "unit03",
        grammar: [{ topic: "Past Simple or Continuous", path: g("preint4", "unit03", "hwy_preint_unit03_1") }, { topic: "Adverbs", path: g("preint4", "unit03", "hwy_preint_unit03_2") }],
        vocabulary: [{ topic: "in, at, on", path: v("preint4", "unit03", "hwy_preint_unit03_2") }]
      },
      {
        num: 4,
        title: "Unit 4 \u2014 Doing the right thing",
        description: "Rules, obligations and moral dilemmas.",
        eeSlug: "unit04",
        grammar: [{ topic: "Count / Uncount nouns", path: g("preint4", "unit04", "hwy_preint_unit04_1") }, { topic: "Articles", path: g("preint4", "unit04", "hwy_preint_unit04_2") }],
        vocabulary: [{ topic: "A piece of\u2026", path: v("preint4", "unit04", "hwy_preint_unit04_1") }, { topic: "Having dinner together", path: v("preint4", "unit04", "hwy_preint_unit04_2") }]
      },
      {
        num: 5,
        title: "Unit 5 \u2014 On the road",
        description: "Travel, transport and holiday experiences.",
        eeSlug: "unit05",
        grammar: [{ topic: "Verb patterns", path: g("preint4", "unit05", "hwy_preint_unit05_1") }, { topic: "Future forms", path: g("preint4", "unit05", "hwy_preint_unit05_2") }],
        vocabulary: [{ topic: "Phrasal verbs \u2013 idiomatic", path: v("preint4", "unit05", "hwy_preint_unit05_1") }, { topic: "Phrasal verbs \u2013 literal", path: v("preint4", "unit05", "hwy_preint_unit05_2") }]
      },
      {
        num: 6,
        title: "Unit 6 \u2014 Life's great events",
        description: "Celebrations, milestones and life events.",
        eeSlug: "unit06",
        grammar: [{ topic: "Superlatives", path: g("preint4", "unit06", "hwy_preint_unit06_1") }, { topic: "What ... like?", path: g("preint4", "unit06", "hwy_preint_unit06_2") }],
        vocabulary: [{ topic: "Antonyms", path: v("preint4", "unit06", "hwy_preint_unit06_1") }, { topic: "Synonyms", path: v("preint4", "unit06", "hwy_preint_unit06_2") }]
      },
      {
        num: 7,
        title: "Unit 7 \u2014 Learning for life",
        description: "Education, learning styles and schools.",
        eeSlug: "unit07",
        grammar: [{ topic: "Present Perfect", path: g("preint4", "unit07", "hwy_preint_unit07_01") }, { topic: "For and since", path: g("preint4", "unit07", "hwy_preint_unit07_02") }, { topic: "Question tags", path: g("preint4", "unit07", "hwy_preint_unit07_03") }],
        vocabulary: [{ topic: "Word endings", path: v("preint4", "unit07", "hwy_preint_unit07_2") }]
      },
      {
        num: 8,
        title: "Unit 8 \u2014 A matter of opinion",
        description: "Giving opinions, agreeing and disagreeing.",
        eeSlug: "unit08",
        grammar: [{ topic: "should / must / have to 1", path: g("preint4", "unit08", "hwy_preint_unit08_1") }, { topic: "should / must / have to 2", path: g("preint4", "unit08", "hwy_preint_unit08_2") }],
        vocabulary: [{ topic: "So and such", path: v("preint4", "unit08", "hwy_preint_unit08_1") }]
      },
      {
        num: 9,
        title: "Unit 9 \u2014 Buying and selling",
        description: "Shopping, money and consumer culture.",
        eeSlug: "unit09",
        grammar: [{ topic: "Past Perfect and Past Simple", path: g("preint4", "unit09", "hwy_preint_unit09_1") }, { topic: "Joining sentences", path: g("preint4", "unit09", "hwy_preint_unit09_2") }],
        vocabulary: [{ topic: "So and such", path: v("preint4", "unit09", "hwy_preint_unit09_2") }]
      },
      {
        num: 10,
        title: "Unit 10 \u2014 All things high-tech",
        description: "Technology, gadgets and the digital world.",
        eeSlug: "unit10",
        grammar: [{ topic: "Passives 1", path: g("preint4", "unit10", "hwy_preint_unit10_1") }, { topic: "Passives 2", path: g("preint4", "unit10", "hwy_preint_unit10_2") }],
        vocabulary: [{ topic: "Words that go together", path: v("preint4", "unit10", "hwy_preint_unit10_1") }]
      },
      {
        num: 11,
        title: "Unit 11 \u2014 What a story!",
        description: "News stories, media and storytelling.",
        eeSlug: "unit11",
        grammar: [{ topic: "Present Perfect Simple / Continuous", path: g("preint4", "unit11", "hwy_preint_unit11_1") }, { topic: "Tenses", path: g("preint4", "unit11", "hwy_preint_unit11_2") }],
        vocabulary: [{ topic: "Marriage", path: v("preint4", "unit11", "hwy_preint_unit11_1") }]
      },
      {
        num: 12,
        title: "Unit 12 \u2014 It's never too late!",
        description: "Ambitions, second chances and life goals.",
        eeSlug: "unit12",
        grammar: [{ topic: "First conditional", path: g("preint4", "unit12", "hwy_preint_unit12_1") }, { topic: "Second conditional", path: g("preint4", "unit12", "hwy_preint_unit12_2") }],
        vocabulary: [{ topic: "Thank you and goodbye!", path: v("preint4", "unit12", "hwy_preint_unit12_1") }, { topic: "Prepositions", path: v("preint4", "unit12", "hwy_preint_unit12_2") }]
      }
    ]
  },
  "Intermediate": {
    slug: "int",
    units: [
      {
        num: 1,
        title: "Unit 1 \u2014 A world of difference",
        description: "Comparing cultures and ways of life around the world.",
        eeSlug: "unit01",
        grammar: [{ topic: "Auxiliary verbs", path: g("int", "unit01", "hwy_int_unit01_1") }, { topic: "Questions", path: g("int", "unit01", "hwy_hwy_unit01_2") }, { topic: "Short answers", path: g("int", "unit01", "hwy_int_unit01_3") }],
        vocabulary: [{ topic: "Words that go together", path: v("int", "unit01", "hwy_int_unit01_4") }]
      },
      {
        num: 2,
        title: "Unit 2 \u2014 Buying and selling",
        description: "The world of commerce, advertising and consumerism.",
        eeSlug: "unit02",
        grammar: [{ topic: "Present Simple or Continuous 1", path: g("int", "unit02", "hwy_int_unit02_1") }, { topic: "Present Simple or Continuous 2", path: g("int", "unit02", "hwy_int_unit02_2") }, { topic: "Active / Passive", path: g("int", "unit02", "hwy_int_unit02_3") }],
        vocabulary: [{ topic: "Jobs", path: v("int", "unit02", "hwy_int_unit02_5") }, { topic: "Free time activities", path: v("int", "unit02", "hwy_int_unit03_3") }]
      },
      {
        num: 3,
        title: "Unit 3 \u2014 What is beauty?",
        description: "Concepts of beauty, art and aesthetic judgement.",
        eeSlug: "unit03",
        grammar: [{ topic: "Past Simple or Continuous", path: g("int", "unit03", "hwy_int_unit03_1") }, { topic: "Past Simple or Past Perfect", path: g("int", "unit03", "hwy_int_unit03_2") }, { topic: "Past tenses", path: g("int", "unit03", "hwy_int_unit03_3") }],
        vocabulary: [{ topic: "Giving opinions", path: v("int", "unit03", "hwy_int_unit03_2") }, { topic: "Silent letters", path: v("int", "unit03", "hwy_int_unit03_3") }]
      },
      {
        num: 4,
        title: "Unit 4 \u2014 Never stop learning",
        description: "Lifelong learning, education systems and study skills.",
        eeSlug: "unit04",
        grammar: [{ topic: "have to / be allowed to", path: g("int", "unit04", "hwy_int_unit04_1") }, { topic: "Modal verbs", path: g("int", "unit04", "hwy_int_unit04_2") }],
        vocabulary: [{ topic: "Phrasal verbs", path: v("int", "unit04", "hwy_int_unit04_1") }, { topic: "Requests and offers", path: v("int", "unit04", "hwy_int_unit04_4") }]
      },
      {
        num: 5,
        title: "Unit 5 \u2014 A short history of sport",
        description: "Sports history, famous athletes and competition.",
        eeSlug: "unit05",
        grammar: [{ topic: "will / going to", path: g("int", "unit05", "hwy_int_unit05_2") }, { topic: "I think / I don't think + will", path: g("int", "unit05", "hwy_int_unit05_1") }],
        vocabulary: [{ topic: "Prefixes", path: v("int", "unit05", "hwy_int_unit05_1") }]
      },
      {
        num: 6,
        title: "Unit 6 \u2014 The right person for the job",
        description: "Work, careers, job applications and interviews.",
        eeSlug: "unit06",
        grammar: [{ topic: "Questions with like", path: g("int", "unit06", "hwy_int_unit06_1") }, { topic: "What, which and who", path: g("int", "unit06", "hwy_int_unit05_1") }],
        vocabulary: [{ topic: "-ed and -ing adjectives", path: v("int", "unit06", "hwy_int_unit06_1") }, { topic: "Adjective + noun", path: v("int", "unit06", "hwy_int_unit06_2") }]
      },
      {
        num: 7,
        title: "Unit 7 \u2014 Cultures meeting",
        description: "Cross-cultural communication and global society.",
        eeSlug: "unit07",
        grammar: [{ topic: "Present Perfect", path: g("int", "unit07", "hwy_int_unit07_1") }, { topic: "Present Perfect Active / Passive", path: g("int", "unit07", "hwy_int_unit07_2") }, { topic: "Time expressions", path: g("int", "unit07", "hwy_int_unit07_3") }],
        vocabulary: [{ topic: "Likes and dislikes", path: v("int", "unit07", "hwy_int_unit07_2") }]
      },
      {
        num: 8,
        title: "Unit 8 \u2014 It's a crime",
        description: "Crime, justice and the law.",
        eeSlug: "unit08",
        grammar: [{ topic: "Verb patterns", path: g("int", "unit08", "hwy_int_unit02_1") }, { topic: "Reduced infinitive", path: g("int", "unit08", "hwy_int_unit08_2") }],
        vocabulary: [{ topic: "Body verbs", path: v("int", "unit08", "hwy_int_unit08_1") }, { topic: "Body idioms", path: v("int", "unit08", "hwy_int_unit08_2") }]
      },
      {
        num: 9,
        title: "Unit 9 \u2014 Travel the world",
        description: "Travel experiences, tourism and world destinations.",
        eeSlug: "unit09",
        grammar: [{ topic: "Conditionals 1", path: g("int", "unit09", "hwy_int_unit08_2") }, { topic: "Conditionals 2", path: g("int", "unit09", "hwy_int_unit09_2") }],
        vocabulary: [{ topic: "Words with similar meaning", path: v("int", "unit09", "hwy_int_unit08_1") }]
      },
      {
        num: 10,
        title: "Unit 10 \u2014 Our future",
        description: "Environmental issues, predictions and global challenges.",
        eeSlug: "unit10",
        grammar: [{ topic: "Possessives", path: g("int", "unit10", "hwy_int_unit09_1") }, { topic: "Articles", path: g("int", "unit10", "hwy_int_unit09_2") }],
        vocabulary: [{ topic: "Compound nouns 1", path: v("int", "unit10", "hwy_int_unit10_1") }, { topic: "Compound nouns 2", path: v("int", "unit10", "hwy_int_unit10_6") }]
      },
      {
        num: 11,
        title: "Unit 11 \u2014 Telling stories",
        description: "Literature, fiction and the art of storytelling.",
        eeSlug: "unit11",
        grammar: [{ topic: "Modal verbs of probability: Present", path: g("int", "unit11", "hwy_int_unit09_3") }, { topic: "Modal verbs of probability: Past", path: g("int", "unit11", "hwy_int_unit09_2") }],
        vocabulary: [{ topic: "Expressing attitude", path: v("int", "unit11", "hwy_int_unit11_3") }, { topic: "Phrasal verbs 2", path: v("int", "unit11", "hwy_int_unit11_6") }]
      },
      {
        num: 12,
        title: "Unit 12 \u2014 Music of the night",
        description: "Music, entertainment and cultural expression.",
        eeSlug: "unit12",
        grammar: [{ topic: "Reported speech", path: g("int", "unit12", "hwy_int_unit12_1") }, { topic: "Reporting verbs", path: g("int", "unit12", "hwy_int_unit12_2") }],
        vocabulary: [{ topic: "Clich\xE9s", path: v("int", "unit12", "hwy_int_unit12_4") }]
      }
    ]
  },
  "Upper-Intermediate": {
    slug: "upperintermediate",
    units: [
      {
        num: 1,
        title: "Unit 1 \u2014 My world",
        description: "Personal identity, background and modern life.",
        eeSlug: "unit01",
        grammar: [{ topic: "Active and Passive 1", path: g("upperintermediate", "unit01", "hwy_upp_unit01_1") }, { topic: "Active and Passive 2", path: g("upperintermediate", "unit01", "hwy_upp_unit01_2") }],
        vocabulary: [{ topic: "Social expressions", path: v("upperintermediate", "unit01", "hwy_upp_unit01_3") }, { topic: "Compound nouns and adjectives", path: v("upperintermediate", "unit01", "hwy_upp_unit01_4") }]
      },
      {
        num: 2,
        title: "Unit 2 \u2014 All in the mind?",
        description: "Psychology, memory and the human brain.",
        eeSlug: "unit02",
        grammar: [{ topic: "Present Perfect Simple and Continuous", path: g("upperintermediate", "unit02", "hwy_upp_unit02_1") }, { topic: "Present Perfect and Past Simple", path: g("upperintermediate", "unit02", "hwy_upp_unit02_2") }],
        vocabulary: [{ topic: "Hot verbs \u2013 make, do 1", path: v("upperintermediate", "unit02", "hwy_upp_unit02_4") }, { topic: "Hot verbs \u2013 make, do 2", path: v("upperintermediate", "unit02", "hwy_upp_unit02_5") }, { topic: "Talking about places 1", path: v("upperintermediate", "unit02", "hwy_upp_unit02_6") }]
      },
      {
        num: 3,
        title: "Unit 3 \u2014 Getting and spending",
        description: "Money, economics and consumerism.",
        eeSlug: "unit03",
        grammar: [{ topic: "Narrative tenses: Active and Passive", path: g("upperintermediate", "unit03", "hwy_upp_unit03_2") }],
        vocabulary: [{ topic: "Books and films", path: v("upperintermediate", "unit03", "hwy_upp_unit03_3") }, { topic: "Showing interest and surprise", path: v("upperintermediate", "unit03", "hwy_upp_unit03_4") }]
      },
      {
        num: 4,
        title: "Unit 4 \u2014 It depends how you look at it",
        description: "Different perspectives and critical thinking.",
        eeSlug: "unit04",
        grammar: [{ topic: "Questions", path: g("upperintermediate", "unit04", "hwy_upp_unit04_1") }, { topic: "Negatives", path: g("upperintermediate", "unit04", "hwy_upp_unit04_2") }],
        vocabulary: [{ topic: "Antonyms", path: v("upperintermediate", "unit04", "hwy_upp_unit04_3") }, { topic: "Being polite", path: v("upperintermediate", "unit04", "hwy_upp_unit04_4") }]
      },
      {
        num: 5,
        title: "Unit 5 \u2014 Clues to the past",
        description: "History, archaeology and ancient civilizations.",
        eeSlug: "unit05",
        grammar: [{ topic: "Future forms 1", path: g("upperintermediate", "unit05", "hwy_upp_unit05_1") }, { topic: "Future forms 2", path: g("upperintermediate", "unit05", "hwy_upp_unit05_2") }],
        vocabulary: [{ topic: "Hot verbs \u2013 take, put", path: v("upperintermediate", "unit05", "hwy_upp_unit05_3") }, { topic: "Phrasal verbs with take or put", path: v("upperintermediate", "unit05", "hwy_upp_unit05_4") }]
      },
      {
        num: 6,
        title: "Unit 6 \u2014 Writing and speaking",
        description: "Communication skills \u2014 written and spoken English.",
        eeSlug: "unit06",
        grammar: [{ topic: "Expressions of quantity 1", path: g("upperintermediate", "unit06", "hwy_upp_unit06_1") }, { topic: "Expressions of quantity 2", path: g("upperintermediate", "unit06", "hwy_upp_unit06_2") }],
        vocabulary: [{ topic: "Business expressions", path: v("upperintermediate", "unit06", "hwy_upp_unit06_4") }]
      },
      {
        num: 7,
        title: "Unit 7 \u2014 Success and failure",
        description: "Ambition, achievement and learning from mistakes.",
        eeSlug: "unit07",
        grammar: [{ topic: "Modals and related verbs 1", path: g("upperintermediate", "unit07", "hwy_upp_unit07_1") }, { topic: "Modals and related verbs 2", path: g("upperintermediate", "unit07", "hwy_upp_unit07_2") }],
        vocabulary: [{ topic: "Hot verbs \u2013 get", path: v("upperintermediate", "unit07", "hwy_upp_unit07_3") }, { topic: "Exaggeration and understatement", path: v("upperintermediate", "unit07", "hwy_upp_unit07_4") }]
      },
      {
        num: 8,
        title: "Unit 8 \u2014 First world problems?",
        description: "Modern society, inequality and global issues.",
        eeSlug: "unit08",
        grammar: [{ topic: "Relative clauses", path: g("upperintermediate", "unit08", "hwy_upp_unit08_1") }, { topic: "Participles", path: g("upperintermediate", "unit08", "hwy_upp_unit08_2") }],
        vocabulary: [{ topic: "Extreme adjectives", path: v("upperintermediate", "unit08", "hwy_upp_unit08_3") }, { topic: "Adverb collocations", path: v("upperintermediate", "unit08", "adverb-collocations") }]
      },
      {
        num: 9,
        title: "Unit 9 \u2014 Places and communities",
        description: "Urban and rural life, community and belonging.",
        eeSlug: "unit09",
        grammar: [{ topic: "Expressing habit 1", path: g("upperintermediate", "unit09", "hwy_upp_unit09_1") }, { topic: "Expressing habit 2", path: g("upperintermediate", "unit09", "hwy_upp_unit09_2") }],
        vocabulary: [{ topic: "Homophones", path: v("upperintermediate", "unit09", "hwy_upp_unit09_3") }, { topic: "Making your point", path: v("upperintermediate", "unit09", "hwy_upp_unit09_4") }]
      },
      {
        num: 10,
        title: "Unit 10 \u2014 Science and technology",
        description: "Scientific discoveries and technological innovation.",
        eeSlug: "unit10",
        grammar: [{ topic: "Modal auxiliary verbs", path: g("upperintermediate", "unit10", "hwy_upp_unit10_1") }, { topic: "Expressions with modals", path: g("upperintermediate", "unit10", "hwy_upp_unit10_2") }],
        vocabulary: [{ topic: "Synonyms", path: v("upperintermediate", "unit10", "hwy_upp_unit10_3") }, { topic: "Metaphors and idioms \u2013 the body", path: v("upperintermediate", "unit10", "hwy_upp_unit10_4") }]
      },
      {
        num: 11,
        title: "Unit 11 \u2014 Language and communication",
        description: "How language works and how we communicate.",
        eeSlug: "unit11",
        grammar: [{ topic: "Hypothesizing 1", path: g("upperintermediate", "unit11", "hwy_upp_unit11_1") }, { topic: "Hypothesizing 2", path: g("upperintermediate", "unit11", "hwy_upp_unit11_2") }],
        vocabulary: [{ topic: "Word pairs", path: v("upperintermediate", "unit11", "hwy_upp_unit11_3") }, { topic: "Moans and groans", path: v("upperintermediate", "unit11", "hwy_upp_unit11_4") }]
      },
      {
        num: 12,
        title: "Unit 12 \u2014 The big picture",
        description: "Global issues, the future and big ideas.",
        eeSlug: "unit12",
        grammar: [{ topic: "Determiners", path: g("upperintermediate", "unit12", "hwy_upp_unit12_1") }, { topic: "Articles and determiners", path: g("upperintermediate", "unit12", "hwy_upp_unit12_2") }],
        vocabulary: [{ topic: "Hot verbs \u2013 life and time", path: v("upperintermediate", "unit12", "hwy_upp_unit12_3") }, { topic: "Linking and commenting expressions", path: v("upperintermediate", "unit12", "hwy_upp_unit12_4") }]
      }
    ]
  },
  "Advanced": {
    slug: "advanceddownload",
    units: [
      { num: 1, title: "Unit 1 \u2014 Meeting people and places", description: "First impressions, social interactions and places.", eeSlug: "unit01", grammar: [], vocabulary: [] },
      { num: 2, title: "Unit 2 \u2014 Getting on and getting away", description: "Relationships, travel and escaping everyday life.", eeSlug: "unit02", grammar: [], vocabulary: [] },
      { num: 3, title: "Unit 3 \u2014 What's in the news?", description: "Media literacy, news reporting and current events.", eeSlug: "unit03", grammar: [], vocabulary: [] },
      { num: 4, title: "Unit 4 \u2014 Hard times", description: "Challenges, adversity and resilience.", eeSlug: "unit04", grammar: [], vocabulary: [] },
      { num: 5, title: "Unit 5 \u2014 Divided loyalties", description: "Conflicting values, ethics and moral choices.", eeSlug: "unit05", grammar: [], vocabulary: [] },
      { num: 6, title: "Unit 6 \u2014 I love literature", description: "English literature, books and literary analysis.", eeSlug: "unit06", grammar: [], vocabulary: [] },
      { num: 7, title: "Unit 7 \u2014 Talking business", description: "Business English, the economy and entrepreneurship.", eeSlug: "unit07", grammar: [], vocabulary: [] },
      { num: 8, title: "Unit 8 \u2014 Looking at language", description: "Linguistics, language evolution and usage.", eeSlug: "unit08", grammar: [], vocabulary: [] },
      { num: 9, title: "Unit 9 \u2014 It takes all sorts...", description: "Personality types, human behaviour and society.", eeSlug: "unit09", grammar: [], vocabulary: [] },
      { num: 10, title: "Unit 10 \u2014 Nothing but the truth", description: "Truth, deception, trust and honesty.", eeSlug: "unit10", grammar: [], vocabulary: [] },
      { num: 11, title: "Unit 11 \u2014 Over to you!", description: "Independent learning, projects and presentations.", eeSlug: "unit11", grammar: [], vocabulary: [] },
      { num: 12, title: "Unit 12 \u2014 Life goes on", description: "Reflecting on language learning, the future and change.", eeSlug: "unit12", grammar: [], vocabulary: [] }
    ]
  }
};
function buildUnitQuestions(unit, levelSlug) {
  const questions = [];
  let order = 0;
  for (const gr of unit.grammar) {
    const url = `${OUP2}${gr.path}${CC2}`;
    questions.push({
      order: order++,
      type: "grammar",
      topic: gr.topic,
      questionText: `Which of the following best demonstrates correct use of "${gr.topic}" from ${unit.title}?`,
      options: [
        `Practice exercise on "${gr.topic}" \u2014 see Oxford Headway: ${url}`,
        `An incorrect form that ignores the rules of "${gr.topic}"`,
        `A sentence that mixes "${gr.topic}" with an incompatible tense`,
        `A phrase that avoids "${gr.topic}" altogether`
      ],
      correctIndex: 0,
      explanation: `The correct answer links to the Oxford Headway interactive exercise on "${gr.topic}". Visit: ${url}`,
      oxfordUrl: url
    });
  }
  for (const vc of unit.vocabulary) {
    const url = `${OUP2}${vc.path}${CC2}`;
    questions.push({
      order: order++,
      type: "vocabulary",
      topic: vc.topic,
      questionText: `Which sentence uses vocabulary from the "${vc.topic}" set in ${unit.title} correctly?`,
      options: [
        `Correct use of a word from the "${vc.topic}" group \u2014 practise here: ${url}`,
        `Incorrect word chosen from a different category`,
        `A synonym used in the wrong register or context`,
        `A word that looks similar but has a different meaning`
      ],
      correctIndex: 0,
      explanation: `The first option is correct. Review the "${vc.topic}" vocabulary set at: ${url}`,
      oxfordUrl: url
    });
  }
  const tbUrl = `${OUP2}/student/headway/${levelSlug}/testbuilder${CC2}`;
  questions.push({
    order: order++,
    type: "comprehension",
    topic: "Unit comprehension",
    questionText: `What is the main topic of ${unit.title}?`,
    options: [
      unit.description,
      `A lesson about a completely different theme unrelated to ${unit.title}`,
      `An advanced grammar topic not covered in this unit`,
      `A revision unit with no new content`
    ],
    correctIndex: 0,
    explanation: unit.description,
    oxfordUrl: tbUrl
  });
  questions.push({
    order: order++,
    type: "testbuilder",
    topic: "Test Builder reference",
    questionText: `Where can you find the Oxford Headway Test Builder for ${unit.title}?`,
    options: [
      tbUrl,
      `https://www.cambridge.org/elt/headway`,
      `https://www.bbc.co.uk/learningenglish`,
      `https://www.longman.com/english`
    ],
    correctIndex: 0,
    explanation: `Oxford Headway Test Builder is at: ${tbUrl}`,
    oxfordUrl: tbUrl
  });
  return questions;
}

// src/lib/headwayQuestions.ts
var BEGINNER = [
  {
    topic: "am / are / is",
    type: "grammar",
    questions: [
      { text: "She _____ a doctor.", options: ["is", "are", "am", "be"], correct: 0, explanation: 'Use "is" with he/she/it.' },
      { text: "They _____ from Spain.", options: ["are", "is", "am", "be"], correct: 0, explanation: 'Use "are" with they/we/you.' },
      { text: "I _____ a student.", options: ["am", "is", "are", "be"], correct: 0, explanation: 'Use "am" with I.' },
      { text: "He _____ at work today.", options: ["is", "am", "are", "be"], correct: 0, explanation: 'Use "is" with he/she/it.' },
      { text: "We _____ very happy.", options: ["are", "is", "am", "be"], correct: 0, explanation: 'Use "are" with we/they/you.' },
      { text: "My name _____ Maria.", options: ["is", "are", "am", "be"], correct: 0, explanation: 'Use "is" for singular subjects.' },
      { text: "_____ you a teacher?", options: ["Are", "Is", "Am", "Be"], correct: 0, explanation: 'Use "Are" for questions with you.' },
      { text: "The children _____ in the garden.", options: ["are", "is", "am", "be"], correct: 0, explanation: 'Use "are" with plural subjects.' }
    ]
  },
  {
    topic: "Present Simple",
    type: "grammar",
    questions: [
      { text: "She _____ to school every day.", options: ["goes", "go", "going", "is go"], correct: 0, explanation: "Add -s/-es with he/she/it in Present Simple." },
      { text: "They _____ football on Saturdays.", options: ["play", "plays", "playing", "are play"], correct: 0, explanation: "No -s with they/we/you in Present Simple." },
      { text: "He _____ coffee for breakfast.", options: ["drinks", "drink", "drinking", "is drink"], correct: 0, explanation: "Add -s with he/she/it." },
      { text: "I _____ in London.", options: ["live", "lives", "living", "am live"], correct: 0, explanation: "No -s with I in Present Simple." },
      { text: "She _____ speak French.", options: ["doesn't", "don't", "isn't", "aren't"], correct: 0, explanation: `Use "doesn't" with he/she/it in negatives.` },
      { text: "_____ they live near you?", options: ["Do", "Does", "Are", "Is"], correct: 0, explanation: 'Use "Do" with they/we/you in questions.' },
      { text: "He _____ up at 7 every morning.", options: ["gets", "get", "got", "getting"], correct: 0, explanation: "Third person singular takes -s in Present Simple." }
    ]
  },
  {
    topic: "Present Simple 1",
    type: "grammar",
    questions: [
      { text: "My sister _____ a nurse.", options: ["is", "are", "am", "be"], correct: 0, explanation: '"Is" with he/she/it.' },
      { text: "The train _____ at 8 o'clock.", options: ["leaves", "leave", "leaving", "is leave"], correct: 0, explanation: "Third person singular: add -s/-es." },
      { text: "We _____ like fish.", options: ["don't", "doesn't", "aren't", "isn't"], correct: 0, explanation: `Use "don't" with we/they/I/you.` },
      { text: "_____ she work on Sundays?", options: ["Does", "Do", "Is", "Are"], correct: 0, explanation: 'Use "Does" for third person singular questions.' },
      { text: "He _____ Italian.", options: ["speaks", "speak", "speaking", "spoke"], correct: 0, explanation: "Third person singular takes -s." }
    ]
  },
  {
    topic: "Present Simple 2",
    type: "grammar",
    questions: [
      { text: "She _____ breakfast every morning.", options: ["has", "have", "having", "had"], correct: 0, explanation: '"Have" becomes "has" in third person singular.' },
      { text: "My parents _____ in a small town.", options: ["live", "lives", "living", "lived"], correct: 0, explanation: "Use base form with plural subjects." },
      { text: "He _____ TV every evening.", options: ["watches", "watch", "watching", "watched"], correct: 0, explanation: "Add -es after -ch/-sh in third person." },
      { text: "_____ you work at the weekend?", options: ["Do", "Does", "Are", "Is"], correct: 0, explanation: '"Do" for I/you/we/they.' },
      { text: "She _____ early on weekdays.", options: ["doesn't get up", "don't get up", "isn't get up", "aren't get up"], correct: 0, explanation: `"Doesn't" for third person singular negative.` }
    ]
  },
  {
    topic: "Questions and answers",
    type: "grammar",
    questions: [
      { text: "A: _____ you married? B: Yes, I am.", options: ["Are", "Is", "Do", "Have"], correct: 0, explanation: 'Short answer with "am/is/are" matches the question auxiliary.' },
      { text: "A: _____ she like pizza? B: Yes, she _____.", options: ["Does / does", "Do / does", "Is / is", "Has / has"], correct: 0, explanation: 'Use "does" for third person singular questions and short answers.' },
      { text: "_____ your brother a student?", options: ["Is", "Are", "Do", "Does"], correct: 0, explanation: 'Use "is" with singular subjects in be-questions.' },
      { text: "A: Do they live here? B: No, they _____.", options: ["don't", "doesn't", "aren't", "isn't"], correct: 0, explanation: `Short negative answer with "do": "don't".` },
      { text: "_____ your parents speak English?", options: ["Do", "Does", "Are", "Is"], correct: 0, explanation: 'Use "Do" with plural subjects.' }
    ]
  },
  {
    topic: "Questions and short answers",
    type: "grammar",
    questions: [
      { text: "A: Is he a doctor? B: Yes, he _____.", options: ["is", "are", "does", "has"], correct: 0, explanation: "Short answer echoes the auxiliary verb in the question." },
      { text: "A: Are they French? B: No, they _____.", options: ["aren't", "isn't", "don't", "doesn't"], correct: 0, explanation: `Negative short answer with "are" \u2192 "aren't".` },
      { text: "_____ she from Italy?", options: ["Is", "Are", "Do", "Does"], correct: 0, explanation: 'Use "is" with she/he/it.' },
      { text: "A: Do you work here? B: Yes, I _____.", options: ["do", "does", "am", "have"], correct: 0, explanation: 'Short answer with "do": "Yes, I do."' },
      { text: "_____ they at home?", options: ["Are", "Is", "Do", "Does"], correct: 0, explanation: 'Use "are" with plural subjects.' }
    ]
  },
  {
    topic: "Possessives",
    type: "grammar",
    questions: [
      { text: "This is _____ book. (Tom)", options: ["Tom's", "Toms", "Tom is", "of Tom"], correct: 0, explanation: "Add apostrophe + s to show possession." },
      { text: "That is _____ car. (my mother)", options: ["my mother's", "my mothers", "of my mother", "mother's my"], correct: 0, explanation: "Possessive 's after the owner's name." },
      { text: "_____ name is Maria. (she)", options: ["Her", "His", "Their", "Its"], correct: 0, explanation: 'Use "her" as possessive adjective for she.' },
      { text: "_____ house is very big. (they)", options: ["Their", "His", "Her", "Its"], correct: 0, explanation: 'Use "their" as possessive adjective for they.' },
      { text: "Is this _____ phone?", options: ["your", "you", "yours", "you're"], correct: 0, explanation: '"Your" is a possessive adjective used before a noun.' }
    ]
  },
  {
    topic: "can / can't",
    type: "grammar",
    questions: [
      { text: "She _____ swim very well.", options: ["can", "cans", "could", "is able"], correct: 0, explanation: '"Can" expresses ability; no -s in third person.' },
      { text: "I _____ play the piano. I've never learned.", options: ["can't", "don't can", "am not can", "hasn't"], correct: 0, explanation: `"Can't" expresses inability.` },
      { text: "_____ you drive?", options: ["Can", "Do", "Are", "Have"], correct: 0, explanation: '"Can" comes before the subject in questions.' },
      { text: "He _____ speak three languages.", options: ["can", "cans", "is able", "could"], correct: 0, explanation: '"Can" + base verb for ability, no -s.' },
      { text: "They _____ come tonight. They're busy.", options: ["can't", "don't can", "haven't", "aren't can"], correct: 0, explanation: `"Can't" for impossibility or inability.` }
    ]
  },
  {
    topic: "was / were",
    type: "grammar",
    questions: [
      { text: "I _____ at school yesterday.", options: ["was", "were", "am", "be"], correct: 0, explanation: 'Use "was" with I/he/she/it in the past.' },
      { text: "They _____ very tired after the trip.", options: ["were", "was", "are", "be"], correct: 0, explanation: 'Use "were" with they/we/you in the past.' },
      { text: "_____ she at home last night?", options: ["Was", "Were", "Is", "Did"], correct: 0, explanation: '"Was" for she/he/it in past questions.' },
      { text: "We _____ not ready on time.", options: ["were", "was", "are", "be"], correct: 0, explanation: '"Were" with we for past tense.' },
      { text: "He _____ born in 1985.", options: ["was", "were", "is", "has"], correct: 0, explanation: '"Was" for he/she/it in past simple.' }
    ]
  },
  {
    topic: "Past Simple irregular",
    type: "grammar",
    questions: [
      { text: "She _____ a great film last night. (see)", options: ["saw", "seed", "seen", "sees"], correct: 0, explanation: '"See" \u2192 "saw" in Past Simple (irregular).' },
      { text: "We _____ dinner at 7. (have)", options: ["had", "haved", "having", "has"], correct: 0, explanation: '"Have" \u2192 "had" in Past Simple.' },
      { text: "He _____ to Paris last year. (go)", options: ["went", "goed", "gone", "goes"], correct: 0, explanation: '"Go" \u2192 "went" in Past Simple (irregular).' },
      { text: "She _____ me a present. (give)", options: ["gave", "gived", "given", "gives"], correct: 0, explanation: '"Give" \u2192 "gave" in Past Simple.' },
      { text: "They _____ up very late. (get)", options: ["got", "getted", "gotten", "gets"], correct: 0, explanation: '"Get" \u2192 "got" in Past Simple (irregular).' }
    ]
  },
  {
    topic: "Past Simple 1",
    type: "grammar",
    questions: [
      { text: "She _____ to bed early last night.", options: ["went", "goes", "is going", "gone"], correct: 0, explanation: "Use Past Simple for completed actions in the past." },
      { text: "They _____ a new car last month.", options: ["bought", "buy", "are buying", "buyed"], correct: 0, explanation: '"Buy" \u2192 "bought" (irregular past).' },
      { text: "_____ you watch TV yesterday?", options: ["Did", "Do", "Are", "Were"], correct: 0, explanation: 'Use "Did" to form past simple questions.' },
      { text: "He _____ call me. I waited all evening.", options: ["didn't", "doesn't", "isn't", "wasn't"], correct: 0, explanation: `"Didn't + base verb" for past simple negative.` },
      { text: "We _____ the museum in the morning.", options: ["visited", "visit", "are visiting", "have visited"], correct: 0, explanation: "Regular past simple: base verb + -ed." }
    ]
  },
  {
    topic: "Present Continuous",
    type: "grammar",
    questions: [
      { text: "Look! She _____ a red dress.", options: ["is wearing", "wears", "wore", "wear"], correct: 0, explanation: "Use Present Continuous for actions happening right now." },
      { text: "They _____ football at the moment.", options: ["are playing", "play", "played", "plays"], correct: 0, explanation: '"Are + -ing" for ongoing actions now.' },
      { text: "Be quiet! The baby _____.", options: ["is sleeping", "sleeps", "slept", "sleep"], correct: 0, explanation: "Present Continuous for a current situation." },
      { text: "I _____ for my keys right now.", options: ["am looking", "look", "looked", "looks"], correct: 0, explanation: '"Am + -ing" with I.' },
      { text: "He _____ a book this week.", options: ["is reading", "reads", "read", "readed"], correct: 0, explanation: "Present Continuous for a temporary activity." }
    ]
  },
  {
    topic: "Present Continuous for future",
    type: "grammar",
    questions: [
      { text: "I _____ my friend tonight. We arranged it yesterday.", options: ["am meeting", "meet", "will meet", "met"], correct: 0, explanation: "Present Continuous for fixed future arrangements." },
      { text: "They _____ to Paris next week.", options: ["are flying", "fly", "flew", "will flying"], correct: 0, explanation: '"Are + -ing" for arranged future plans.' },
      { text: "She _____ a new job next month.", options: ["is starting", "starts", "start", "will starting"], correct: 0, explanation: "Present Continuous for confirmed future plans." },
      { text: "We _____ a party on Saturday.", options: ["are having", "have", "will having", "had"], correct: 0, explanation: "Present Continuous for future arrangements." },
      { text: "_____ you doing anything this evening?", options: ["Are", "Do", "Were", "Have"], correct: 0, explanation: "Present Continuous question for future plans." }
    ]
  },
  {
    topic: "Future plans",
    type: "grammar",
    questions: [
      { text: "I _____ going to travel next summer.", options: ["am", "is", "are", "be"], correct: 0, explanation: '"Am going to" for personal future plans.' },
      { text: "They _____ going to buy a new house.", options: ["are", "is", "am", "be"], correct: 0, explanation: '"Are going to" with they/we/you.' },
      { text: "She _____ going to study medicine.", options: ["is", "are", "am", "be"], correct: 0, explanation: '"Is going to" with he/she/it.' },
      { text: "Are you going _____ visit them?", options: ["to", "and", "for", "that"], correct: 0, explanation: '"Going to + infinitive" for future intention.' },
      { text: "We _____ to move soon.", options: ["are going", "go", "going", "is going"], correct: 0, explanation: '"Are going to + verb" for plans.' }
    ]
  },
  {
    topic: "like / would like",
    type: "grammar",
    questions: [
      { text: "I _____ coffee. I drink it every morning. (enjoy generally)", options: ["like", "would like", "'d like", "am liking"], correct: 0, explanation: '"Like" for general preferences.' },
      { text: "_____ you like some more cake?", options: ["Would", "Do", "Are", "Did"], correct: 0, explanation: '"Would you like" for polite offers.' },
      { text: "She _____ a glass of water, please.", options: ["'d like", "likes", "is liking", "like"], correct: 0, explanation: `"Would like" ('d like) for polite requests.` },
      { text: "Do you _____ swimming?", options: ["like", "would like", "' d like", "liked"], correct: 0, explanation: '"Like + -ing" for general preferences.' },
      { text: "They _____ to visit Rome one day.", options: ["'d like", "like", "likes", "are liking"], correct: 0, explanation: '"Would like to + infinitive" for wishes.' }
    ]
  },
  {
    topic: "some / any",
    type: "grammar",
    questions: [
      { text: "There are _____ eggs in the fridge.", options: ["some", "any", "a", "the"], correct: 0, explanation: 'Use "some" in affirmative sentences with plural nouns.' },
      { text: "Is there _____ milk?", options: ["any", "some", "a", "an"], correct: 0, explanation: 'Use "any" in questions with uncountable nouns.' },
      { text: "We don't have _____ bread.", options: ["any", "some", "a", "the"], correct: 0, explanation: 'Use "any" in negative sentences.' },
      { text: "Would you like _____ tea?", options: ["some", "any", "a", "an"], correct: 0, explanation: 'Use "some" in offers.' },
      { text: "She didn't buy _____ fruit.", options: ["any", "some", "a", "the"], correct: 0, explanation: '"Any" in negative sentences.' }
    ]
  },
  {
    topic: "There is / There are",
    type: "grammar",
    questions: [
      { text: "_____ a bank near here.", options: ["There is", "There are", "Is there", "Are there"], correct: 0, explanation: '"There is" with singular nouns.' },
      { text: "_____ three bedrooms in my flat.", options: ["There are", "There is", "Are there", "Is there"], correct: 0, explanation: '"There are" with plural nouns.' },
      { text: "_____ a problem with the computer.", options: ["There is", "There are", "It is", "They are"], correct: 0, explanation: '"There is" introduces a singular subject.' },
      { text: "_____ any shops near your house?", options: ["Are there", "Is there", "There are", "There is"], correct: 0, explanation: '"Are there" for plural questions.' },
      { text: "_____ a lot of students in the class.", options: ["There are", "There is", "Are there", "Is there"], correct: 0, explanation: '"There are" with "a lot of + plural noun".' }
    ]
  },
  {
    topic: "Question words",
    type: "grammar",
    questions: [
      { text: "_____ is your name?", options: ["What", "Who", "Where", "When"], correct: 0, explanation: '"What" asks about things, names, or identity.' },
      { text: "_____ do you live?", options: ["Where", "When", "Why", "Who"], correct: 0, explanation: '"Where" asks about place.' },
      { text: "_____ old are you?", options: ["How", "What", "Which", "Why"], correct: 0, explanation: '"How old" asks about age.' },
      { text: "_____ does the lesson start?", options: ["When", "Where", "What", "How"], correct: 0, explanation: '"When" asks about time.' },
      { text: "_____ did you buy that jacket?", options: ["Where", "What", "Who", "How"], correct: 0, explanation: '"Where" asks about the place of purchase.' },
      { text: "_____ much is this?", options: ["How", "What", "Why", "Which"], correct: 0, explanation: '"How much" asks about price.' }
    ]
  }
];
var ELEMENTARY = [
  {
    topic: "am / are / is",
    type: "grammar",
    questions: [
      { text: "She _____ 25 years old.", options: ["is", "are", "am", "be"], correct: 0, explanation: '"Is" with he/she/it.' },
      { text: "My friends _____ very funny.", options: ["are", "is", "am", "be"], correct: 0, explanation: '"Are" with plural subjects.' },
      { text: "I _____ not happy today.", options: ["am", "is", "are", "be"], correct: 0, explanation: '"Am" with I.' },
      { text: "It _____ a beautiful day.", options: ["is", "am", "are", "be"], correct: 0, explanation: '"Is" with it.' },
      { text: "_____ they from the UK?", options: ["Are", "Is", "Am", "Do"], correct: 0, explanation: '"Are" for they/we/you questions.' },
      { text: "The film _____ very long.", options: ["is", "are", "am", "be"], correct: 0, explanation: '"Is" with singular subjects.' }
    ]
  },
  {
    topic: "Possessive 's",
    type: "grammar",
    questions: [
      { text: "That is _____ coat. (Anna)", options: ["Anna's", "Annas", "Anna is", "of Anna"], correct: 0, explanation: "Add 's to show possession." },
      { text: "_____ car is new. (my father)", options: ["My father's", "My fathers", "My father is", "Of my father"], correct: 0, explanation: "Use apostrophe + s after the owner's name." },
      { text: "This is _____ room. (the children)", options: ["the children's", "the childrens'", "the children is", "of the children"], correct: 0, explanation: "For irregular plurals (not ending in s), add 's." },
      { text: "Is that _____ book? (you)", options: ["your", "yours", "you", "you're"], correct: 0, explanation: '"Your" is the possessive adjective.' },
      { text: "We went to _____ party. (Sarah)", options: ["Sarah's", "Sarahs", "Sarah is", "of Sarah"], correct: 0, explanation: "Possessive 's for names." }
    ]
  },
  {
    topic: "Present Simple 1",
    type: "grammar",
    questions: [
      { text: "She _____ a lot.", options: ["reads", "read", "reading", "is read"], correct: 0, explanation: "Third person singular: add -s." },
      { text: "My parents _____ near the city centre.", options: ["live", "lives", "living", "is live"], correct: 0, explanation: "Plural subject: base form." },
      { text: "_____ she like cooking?", options: ["Does", "Do", "Is", "Has"], correct: 0, explanation: '"Does" for he/she/it questions.' },
      { text: "I _____ usually eat meat.", options: ["don't", "doesn't", "am not", "haven't"], correct: 0, explanation: `"Don't" for I/you/we/they negatives.` },
      { text: "He _____ the bus to work.", options: ["takes", "take", "taking", "took"], correct: 0, explanation: "Add -s with he/she/it." }
    ]
  },
  {
    topic: "Present Simple 2",
    type: "grammar",
    questions: [
      { text: "She _____ tennis on Tuesdays.", options: ["plays", "play", "is playing", "played"], correct: 0, explanation: "Present Simple: third person singular + -s." },
      { text: "My brother _____ to music every day.", options: ["listens", "listen", "is listening", "listened"], correct: 0, explanation: "Add -s for third person singular." },
      { text: "_____ you enjoy reading?", options: ["Do", "Does", "Are", "Have"], correct: 0, explanation: '"Do" for you/I/we/they questions.' },
      { text: "She _____ work on Sundays.", options: ["doesn't", "don't", "isn't", "hasn't"], correct: 0, explanation: `"Doesn't" for third person singular.` },
      { text: "He _____ to the gym three times a week.", options: ["goes", "go", "going", "gone"], correct: 0, explanation: '"Go" \u2192 "goes" in third person singular.' }
    ]
  },
  {
    topic: "Present Simple 3",
    type: "grammar",
    questions: [
      { text: "The museum _____ at nine.", options: ["opens", "open", "is opening", "opened"], correct: 0, explanation: "Scheduled events use Present Simple." },
      { text: "She _____ three languages.", options: ["speaks", "speak", "is speaking", "spoke"], correct: 0, explanation: "Third person singular: add -s." },
      { text: "_____ he often travel for work?", options: ["Does", "Do", "Is", "Has"], correct: 0, explanation: '"Does" for third person questions.' },
      { text: "Water _____ at 100\xB0C.", options: ["boils", "boil", "is boiling", "boiled"], correct: 0, explanation: "Facts and scientific truths use Present Simple." },
      { text: "We _____ meat \u2014 we're vegetarian.", options: ["don't eat", "doesn't eat", "aren't eating", "haven't eaten"], correct: 0, explanation: `"Don't + base verb" for we/they/I/you negative.` }
    ]
  },
  {
    topic: "Adverbs of frequency",
    type: "grammar",
    questions: [
      { text: "She _____ goes to bed before midnight.", options: ["always", "ever", "yet", "still"], correct: 0, explanation: '"Always" means 100% of the time.' },
      { text: "I _____ eat fish. Maybe once a year.", options: ["rarely", "usually", "always", "often"], correct: 0, explanation: '"Rarely" means almost never.' },
      { text: "He is _____ late. He misses the bus every day.", options: ["always", "never", "rarely", "sometimes"], correct: 0, explanation: '"Always" for something that happens every time.' },
      { text: "We _____ go to the cinema \u2014 about twice a month.", options: ["sometimes", "never", "always", "rarely"], correct: 0, explanation: '"Sometimes" for occasional actions.' },
      { text: "She _____ drinks alcohol. She doesn't like it.", options: ["never", "always", "often", "usually"], correct: 0, explanation: '"Never" = 0% of the time.' }
    ]
  },
  {
    topic: "Comparatives and superlatives",
    type: "grammar",
    questions: [
      { text: "London is _____ than my hometown.", options: ["bigger", "more big", "biggest", "the biggest"], correct: 0, explanation: "Short adjectives: add -er for comparatives." },
      { text: "This is _____ film I've ever seen.", options: ["the best", "better", "the most good", "the more good"], correct: 0, explanation: '"Best" is the irregular superlative of "good".' },
      { text: "She is _____ than her brother.", options: ["more intelligent", "intelligenter", "the most intelligent", "most intelligent"], correct: 0, explanation: 'Long adjectives: "more + adjective" for comparatives.' },
      { text: "January is _____ month of the year.", options: ["the coldest", "colder", "the most cold", "most cold"], correct: 0, explanation: 'Superlative: "the + -est" for short adjectives.' },
      { text: "My bag is _____ than yours.", options: ["heavier", "more heavy", "heaviest", "the heaviest"], correct: 0, explanation: "Adjectives ending in -y: change to -ier in comparative." }
    ]
  },
  {
    topic: "Superlatives",
    type: "grammar",
    questions: [
      { text: "This is _____ restaurant in the city.", options: ["the most expensive", "more expensive", "the expensivest", "most expensive"], correct: 0, explanation: 'Long adjectives: "the most + adjective" for superlative.' },
      { text: "That was _____ day of my life.", options: ["the worst", "worse", "the most bad", "the badest"], correct: 0, explanation: '"Worst" is the superlative of "bad".' },
      { text: "She is _____ student in the class.", options: ["the most hardworking", "more hardworking", "the hardworkingest", "hardworkingest"], correct: 0, explanation: 'Superlative of long adjectives: "the most + adjective".' },
      { text: "This is _____ mountain in Europe.", options: ["the highest", "higher", "the most high", "most high"], correct: 0, explanation: '"Highest" is the superlative of "high".' },
      { text: "He is _____ player on the team.", options: ["the fastest", "faster", "the most fast", "most fast"], correct: 0, explanation: '"Fastest" is the superlative of "fast".' }
    ]
  },
  {
    topic: "Present Continuous",
    type: "grammar",
    questions: [
      { text: "She _____ to music right now.", options: ["is listening", "listens", "listened", "listen"], correct: 0, explanation: '"Is + -ing" for actions happening now.' },
      { text: "They _____ a house at the moment.", options: ["are building", "build", "built", "builds"], correct: 0, explanation: "Present Continuous for ongoing actions." },
      { text: "I _____ this book. It's great!", options: ["am enjoying", "enjoy", "enjoyed", "enjoys"], correct: 0, explanation: '"Am + -ing" with I for current actions.' },
      { text: "_____ you working from home today?", options: ["Are", "Do", "Did", "Have"], correct: 0, explanation: '"Are" for Present Continuous questions.' },
      { text: "He _____ his sister this weekend.", options: ["is visiting", "visits", "visited", "visit"], correct: 0, explanation: "Present Continuous for a future arrangement." }
    ]
  },
  {
    topic: "going to and Past Simple",
    type: "grammar",
    questions: [
      { text: "Look at those clouds! It _____ rain.", options: ["'s going to", "'ll", "rains", "rained"], correct: 0, explanation: '"Going to" for predictions based on evidence.' },
      { text: "She _____ buy a new laptop next month.", options: ["'s going to", "'ll", "buys", "bought"], correct: 0, explanation: '"Going to" for planned future intentions.' },
      { text: "We _____ to Spain last summer.", options: ["went", "go", "are going", "were going"], correct: 0, explanation: "Past Simple for completed past actions." },
      { text: "He _____ a film last night.", options: ["watched", "watches", "is watching", "was watching"], correct: 0, explanation: 'Past Simple with time expression "last night".' },
      { text: "They _____ visit their grandparents at the weekend.", options: ["are going to", "went", "go", "will going to"], correct: 0, explanation: '"Are going to" for arranged future plans.' }
    ]
  },
  {
    topic: "Present Perfect 1",
    type: "grammar",
    questions: [
      { text: "I _____ to New York three times.", options: ["have been", "went", "was", "go"], correct: 0, explanation: "Present Perfect for experiences without a specific time." },
      { text: "She _____ her wallet. She can't find it.", options: ["has lost", "lost", "loses", "is losing"], correct: 0, explanation: "Present Perfect when the result affects the present." },
      { text: "_____ you ever tried Japanese food?", options: ["Have", "Did", "Do", "Were"], correct: 0, explanation: '"Have + ever" for life experiences.' },
      { text: "He _____ just _____ the report.", options: ["has / finished", "did / finish", "was / finishing", "is / finishing"], correct: 0, explanation: '"Has + just + past participle" for recent actions.' },
      { text: "They _____ never _____ to Asia.", options: ["have / been", "did / go", "are / going", "were / be"], correct: 0, explanation: '"Have + never + past participle" for negative experiences.' }
    ]
  },
  {
    topic: "Present Perfect 2",
    type: "grammar",
    questions: [
      { text: "I _____ already _____ that film.", options: ["have / seen", "did / see", "was / seeing", "am / seeing"], correct: 0, explanation: '"Have + already + past participle" for completed actions.' },
      { text: "Have you finished your homework _____?", options: ["yet", "already", "just", "never"], correct: 0, explanation: '"Yet" in questions means "by now".' },
      { text: "She _____ lived here for five years.", options: ["has", "did", "is", "was"], correct: 0, explanation: '"Has + past participle + for" for duration up to now.' },
      { text: "They _____ arrived at the hotel.", options: ["haven't", "didn't", "aren't", "weren't"], correct: 0, explanation: `"Haven't + past participle" for present perfect negative.` },
      { text: "He has _____ his exam!", options: ["passed", "pass", "passing", "been passing"], correct: 0, explanation: "Present Perfect uses past participle." }
    ]
  },
  {
    topic: "can / could, was / were",
    type: "grammar",
    questions: [
      { text: "She _____ swim when she was five.", options: ["could", "can", "is able", "was able to"], correct: 0, explanation: '"Could" expresses past ability.' },
      { text: "When I was young, I _____ run very fast.", options: ["could", "can", "will", "am able"], correct: 0, explanation: '"Could" for past ability.' },
      { text: "He _____ a teacher before he became a doctor.", options: ["was", "is", "were", "be"], correct: 0, explanation: '"Was" with he/she/it for past.' },
      { text: "They _____ at the party last night.", options: ["were", "was", "are", "be"], correct: 0, explanation: '"Were" with they/we/you for past.' },
      { text: "_____ you speak any other languages when you were a child?", options: ["Could", "Can", "Were", "Do"], correct: 0, explanation: '"Could" for past ability questions.' }
    ]
  }
];
var PREINT = [
  {
    topic: "Tenses",
    type: "grammar",
    questions: [
      { text: "My husband _____ about motorbikes all the time.", options: ["thinks", "is thinking", "thought", "has thought"], correct: 0, explanation: "Use Present Simple for habits and repeated actions." },
      { text: "Right now he _____ a motorbike magazine.", options: ["is reading", "reads", "read", "has read"], correct: 0, explanation: "Use Present Continuous for actions happening right now." },
      { text: "Yesterday she _____ a nice motorbike for sale.", options: ["saw", "sees", "is seeing", "has seen"], correct: 0, explanation: "Use Past Simple for completed actions in the past." },
      { text: "I _____ my homework yet.", options: ["haven't finished", "didn't finish", "don't finish", "wasn't finishing"], correct: 0, explanation: 'Use Present Perfect with "yet" for unfinished situations.' },
      { text: "They _____ in this town since 2010.", options: ["have lived", "lived", "are living", "were living"], correct: 0, explanation: 'Use Present Perfect with "since" for situations that continue.' },
      { text: "While she _____, her phone rang.", options: ["was cooking", "cooked", "has cooked", "is cooking"], correct: 0, explanation: "Past Continuous for an action interrupted by another." }
    ]
  },
  {
    topic: "Question words",
    type: "grammar",
    questions: [
      { text: "_____ did you go last weekend?", options: ["Where", "What", "Who", "Which"], correct: 0, explanation: '"Where" asks about place.' },
      { text: "_____ did you meet at the party?", options: ["Who", "What", "Which", "Where"], correct: 0, explanation: '"Who" asks about a person.' },
      { text: "_____ does the train leave?", options: ["When", "How", "Why", "Which"], correct: 0, explanation: '"When" asks about time.' },
      { text: "_____ long does it take to get there?", options: ["How", "What", "Which", "Why"], correct: 0, explanation: '"How long" asks about duration.' },
      { text: "_____ is your favourite subject at school?", options: ["What", "Who", "How", "When"], correct: 0, explanation: '"What" asks about things or subjects.' },
      { text: "_____ much did you pay for that jacket?", options: ["How", "What", "Why", "Which"], correct: 0, explanation: '"How much" asks about price.' }
    ]
  },
  {
    topic: "Present Simple/Present Continuous",
    type: "grammar",
    questions: [
      { text: "Look at that woman. She _____ a beautiful hat.", options: ["is wearing", "wears", "wore", "has worn"], correct: 0, explanation: "Use Present Continuous for actions happening at the moment." },
      { text: "Sam looks frightened. What _____?", options: ["is happening", "happens", "happened", "has happened"], correct: 0, explanation: "Use Present Continuous for situations happening now." },
      { text: "I usually drive but today my car _____.", options: ["isn't working", "doesn't work", "didn't work", "hasn't worked"], correct: 0, explanation: "Use Present Continuous for a temporary situation." },
      { text: "_____ to the radio when you get up?", options: ["Do you listen", "Are you listening", "Did you listen", "Have you listened"], correct: 0, explanation: "Use Present Simple for routines and habits." },
      { text: "She _____ tennis twice a week.", options: ["plays", "is playing", "played", "has played"], correct: 0, explanation: "Present Simple for regular activities." },
      { text: "He _____ French at university this year.", options: ["is studying", "studies", "studied", "has studied"], correct: 0, explanation: "Present Continuous for temporary activities around now." }
    ]
  },
  {
    topic: "Present Simple / Continuous",
    type: "grammar",
    questions: [
      { text: "She _____ her sister every Sunday.", options: ["visits", "is visiting", "visited", "has visited"], correct: 0, explanation: "Present Simple for regular habits." },
      { text: "I _____ a new book this week.", options: ["am reading", "read", "reads", "have read"], correct: 0, explanation: "Present Continuous for a current temporary activity." },
      { text: "He _____ English to tourists right now.", options: ["is explaining", "explains", "explained", "has explained"], correct: 0, explanation: "Present Continuous for actions in progress now." },
      { text: "_____ you usually have lunch at home?", options: ["Do", "Are", "Did", "Have"], correct: 0, explanation: 'Present Simple question with "Do".' },
      { text: "They _____ a new office this month.", options: ["are building", "build", "built", "have built"], correct: 0, explanation: "Present Continuous for a temporary ongoing activity." }
    ]
  },
  {
    topic: "Past Simple",
    type: "grammar",
    questions: [
      { text: "She _____ to Italy last summer.", options: ["went", "goes", "is going", "has gone"], correct: 0, explanation: "Past Simple for completed actions at a specific past time." },
      { text: "We _____ the film last night.", options: ["didn't enjoy", "don't enjoy", "aren't enjoying", "haven't enjoyed"], correct: 0, explanation: "Past Simple negative with 'didn't + base verb'." },
      { text: "_____ you see John at the meeting yesterday?", options: ["Did", "Were", "Have", "Do"], correct: 0, explanation: '"Did" for Past Simple questions.' },
      { text: "I _____ my keys this morning.", options: ["lost", "lose", "am losing", "have lost"], correct: 0, explanation: "Past Simple for completed earlier actions." },
      { text: "He _____ in London for ten years and then moved to Paris.", options: ["lived", "has lived", "was living", "is living"], correct: 0, explanation: "Past Simple for a finished period in the past." }
    ]
  },
  {
    topic: "Past Simple or Continuous",
    type: "grammar",
    questions: [
      { text: "I _____ TV when the phone rang.", options: ["was watching", "watched", "watch", "had watched"], correct: 0, explanation: "Past Continuous for an action interrupted by another." },
      { text: "When she arrived, they _____ dinner.", options: ["were having", "had", "have", "are having"], correct: 0, explanation: "Past Continuous for an action in progress at a past moment." },
      { text: "I saw Maria while I _____ to work.", options: ["was walking", "walked", "walk", "am walking"], correct: 0, explanation: 'Past Continuous with "while" for a background action.' },
      { text: "It _____ heavily when we left the house.", options: ["was raining", "rained", "rains", "has rained"], correct: 0, explanation: "Past Continuous for background description." }
    ]
  },
  {
    topic: "Past Simple/Past Continuous",
    type: "grammar",
    questions: [
      { text: "I _____ TV when the phone rang.", options: ["was watching", "watched", "watch", "had watched"], correct: 0, explanation: "Past Continuous for an ongoing action interrupted by another." },
      { text: "When she arrived, they _____ dinner.", options: ["were having", "had", "have", "are having"], correct: 0, explanation: "Past Continuous for an action in progress at a past moment." },
      { text: "I saw Maria while I _____ to work.", options: ["was walking", "walked", "walk", "am walking"], correct: 0, explanation: 'Past Continuous with "while".' },
      { text: "It _____ heavily when we left the house.", options: ["was raining", "rained", "rains", "has rained"], correct: 0, explanation: "Past Continuous for weather as background." },
      { text: "She _____ her keys while she _____ in her bag.", options: ["found / was looking", "was finding / looked", "found / is looking", "finds / looked"], correct: 0, explanation: "Past Simple (short) + Past Continuous (background)." }
    ]
  },
  {
    topic: "some/any/a",
    type: "grammar",
    questions: [
      { text: "Would you like _____ coffee?", options: ["some", "any", "a", "the"], correct: 0, explanation: '"Some" in offers and requests.' },
      { text: "Is there _____ milk in the fridge?", options: ["any", "some", "a", "an"], correct: 0, explanation: '"Any" in questions with uncountable nouns.' },
      { text: "I'm hungry. I'll make _____ sandwich.", options: ["a", "some", "any", "the"], correct: 0, explanation: '"A" with singular countable nouns.' },
      { text: "There aren't _____ chairs in the room.", options: ["any", "some", "a", "the"], correct: 0, explanation: '"Any" in negative sentences.' },
      { text: "She bought _____ apples from the market.", options: ["some", "any", "a", "an"], correct: 0, explanation: '"Some" in affirmative sentences with plural nouns.' }
    ]
  },
  {
    topic: "Articles",
    type: "grammar",
    questions: [
      { text: "She plays _____ piano every evening.", options: ["the", "a", "an", "-"], correct: 0, explanation: '"The" with musical instruments.' },
      { text: "He is _____ engineer.", options: ["an", "a", "the", "-"], correct: 0, explanation: '"An" before vowel sounds.' },
      { text: "_____ sun rises in the east.", options: ["The", "A", "An", "-"], correct: 0, explanation: '"The" for unique nouns.' },
      { text: "I had _____ breakfast at seven.", options: ["-", "a", "the", "an"], correct: 0, explanation: "No article with meals in a general sense." },
      { text: "That's _____ most interesting book I've read.", options: ["the", "a", "an", "-"], correct: 0, explanation: '"The" with superlatives.' },
      { text: "She goes to _____ school by bus.", options: ["-", "the", "a", "an"], correct: 0, explanation: 'No article with "school/work/home" for their purpose.' }
    ]
  },
  {
    topic: "Count / Uncount nouns",
    type: "grammar",
    questions: [
      { text: "Can I have _____ information about the course?", options: ["some", "a", "an", "many"], correct: 0, explanation: '"Information" is uncountable; use "some".' },
      { text: "I need to buy _____ furniture for my flat.", options: ["some", "a", "many", "few"], correct: 0, explanation: '"Furniture" is uncountable; use "some" not "a".' },
      { text: "She gave me _____ good advice.", options: ["some", "a", "an", "many"], correct: 0, explanation: '"Advice" is uncountable.' },
      { text: "There is _____ traffic on the roads today.", options: ["a lot of", "many", "a", "few"], correct: 0, explanation: 'Uncountable nouns use "a lot of" not "many".' },
      { text: "I have _____ questions for you.", options: ["a few", "a little", "much", "a piece of"], correct: 0, explanation: '"A few" with countable plural nouns.' }
    ]
  },
  {
    topic: "Verb patterns",
    type: "grammar",
    questions: [
      { text: "I enjoy _____ to music.", options: ["listening", "to listen", "listen", "listened"], correct: 0, explanation: '"Enjoy" is followed by a gerund (-ing).' },
      { text: "She decided _____ a new job.", options: ["to find", "finding", "find", "found"], correct: 0, explanation: '"Decide" is followed by an infinitive.' },
      { text: "Would you mind _____ the window?", options: ["closing", "to close", "close", "closed"], correct: 0, explanation: '"Mind" is followed by a gerund.' },
      { text: "They want _____ on holiday next month.", options: ["to go", "going", "go", "gone"], correct: 0, explanation: '"Want" is followed by an infinitive.' },
      { text: "He stopped _____ when he was thirty.", options: ["smoking", "to smoke", "smoke", "smoked"], correct: 0, explanation: '"Stop + gerund" means the action ends.' }
    ]
  },
  {
    topic: "going to/will",
    type: "grammar",
    questions: [
      { text: "Look at those clouds! It _____ rain.", options: ["'s going to", "'ll", "goes to", "is"], correct: 0, explanation: '"Going to" for predictions based on present evidence.' },
      { text: "A: The phone is ringing! B: I _____ get it.", options: ["'ll", "'m going to", "go to", "am"], correct: 0, explanation: '"Will" for spontaneous decisions.' },
      { text: "They _____ move to London next year.", options: ["'re going to", "'ll", "goes to", "move"], correct: 0, explanation: '"Going to" for plans and intentions.' },
      { text: "I promise I _____ call you tomorrow.", options: ["'ll", "'m going to", "am going", "will have"], correct: 0, explanation: '"Will" for promises.' },
      { text: "She _____ have a baby in June.", options: ["'s going to", "'ll", "goes to", "is have"], correct: 0, explanation: '"Going to" for plans based on evidence.' }
    ]
  },
  {
    topic: "Future forms",
    type: "grammar",
    questions: [
      { text: "I _____ see you tomorrow at 3.", options: ["'ll", "'m going to", "am seeing", "see"], correct: 0, explanation: '"Will" for promises and offers.' },
      { text: "She _____ buy a new car \u2014 she saved enough money.", options: ["'s going to", "'ll", "buys", "bought"], correct: 0, explanation: '"Going to" for planned intentions.' },
      { text: "The match _____ at 8 pm tonight.", options: ["starts", "'ll start", "is going to start", "started"], correct: 0, explanation: "Present Simple for scheduled timetable events." },
      { text: "A: I can't open this jar. B: I _____ help you.", options: ["'ll", "'m going to", "am helping", "help"], correct: 0, explanation: '"Will" for spontaneous decisions.' },
      { text: "They _____ get married in June. They booked the venue.", options: ["are getting", "'ll get", "get", "got"], correct: 0, explanation: "Present Continuous for arranged future plans." }
    ]
  },
  {
    topic: "Comparatives/Superlatives",
    type: "grammar",
    questions: [
      { text: "This test is _____ the last one.", options: ["easier than", "more easy than", "the easiest", "easy than"], correct: 0, explanation: 'Comparative + "than" to compare two things.' },
      { text: "She is _____ student in the class.", options: ["the most intelligent", "more intelligent", "intelligenter", "the intelligenter"], correct: 0, explanation: '"The most + adjective" for superlative of long adjectives.' },
      { text: "Today is _____ day of the year so far.", options: ["the hottest", "hotter", "the most hot", "most hottest"], correct: 0, explanation: '"The + -est" for short adjectives in superlative.' },
      { text: "He earns _____ money than his brother.", options: ["more", "the most", "much", "most"], correct: 0, explanation: '"More" with uncountable nouns for comparatives.' },
      { text: "This is _____ film I have ever seen.", options: ["the worst", "worse", "the most bad", "more bad"], correct: 0, explanation: '"Worst" is the irregular superlative of "bad".' }
    ]
  },
  {
    topic: "Superlatives",
    type: "grammar",
    questions: [
      { text: "She is _____ person I know.", options: ["the kindest", "kinder", "the most kind", "more kind"], correct: 0, explanation: 'Short adjectives: "the + -est" for superlative.' },
      { text: "This is _____ book he has written.", options: ["the most interesting", "more interesting", "the interestingest", "most interesting"], correct: 0, explanation: '"The most + long adjective" for superlative.' },
      { text: "What is _____ country in the world?", options: ["the largest", "larger", "the most large", "most largest"], correct: 0, explanation: '"Largest" = superlative of "large".' },
      { text: "That was _____ meal I've ever had.", options: ["the best", "better", "the most good", "most good"], correct: 0, explanation: '"Best" = irregular superlative of "good".' }
    ]
  },
  {
    topic: "Past Simple/Present Perfect 1",
    type: "grammar",
    questions: [
      { text: "I _____ to Rome twice in my life.", options: ["have been", "was", "went", "am"], correct: 0, explanation: "Present Perfect for experiences without a specific time." },
      { text: "She _____ the report yesterday.", options: ["finished", "has finished", "finishes", "is finishing"], correct: 0, explanation: 'Past Simple with "yesterday".' },
      { text: "_____ you ever tried sushi?", options: ["Have", "Did", "Do", "Were"], correct: 0, explanation: '"Have + ever" for life experiences.' },
      { text: "He _____ his keys. He can't find them.", options: ["has lost", "lost", "loses", "is losing"], correct: 0, explanation: "Present Perfect when result affects the present." },
      { text: "They _____ married in 2005.", options: ["got", "have got", "get", "are getting"], correct: 0, explanation: "Past Simple with a specific date." }
    ]
  },
  {
    topic: "Past Simple/Present Perfect 2",
    type: "grammar",
    questions: [
      { text: "I _____ just _____ lunch.", options: ["have / had", "did / have", "have / have", "had / had"], correct: 0, explanation: '"Have + just + past participle" for recent actions.' },
      { text: "She _____ already _____ that book.", options: ["has / read", "did / read", "is / reading", "was / read"], correct: 0, explanation: '"Has + already" for actions sooner than expected.' },
      { text: "_____ you _____ your homework yet?", options: ["Have / done", "Did / do", "Are / doing", "Do / do"], correct: 0, explanation: '"Have + yet" in questions.' },
      { text: "We _____ here for three hours already.", options: ["have been", "were", "are", "have gone"], correct: 0, explanation: '"Have been + for + time period".' },
      { text: "They _____ the project last Tuesday.", options: ["completed", "have completed", "complete", "are completing"], correct: 0, explanation: "Past Simple with a specific day." }
    ]
  },
  {
    topic: "Present Perfect",
    type: "grammar",
    questions: [
      { text: "She _____ in three countries.", options: ["has lived", "lived", "lives", "is living"], correct: 0, explanation: "Present Perfect for life experiences." },
      { text: "I _____ that film. It's amazing!", options: ["have seen", "saw", "see", "am seeing"], correct: 0, explanation: "Present Perfect for recent experience." },
      { text: "_____ he ever been to Japan?", options: ["Has", "Did", "Is", "Was"], correct: 0, explanation: '"Has + ever" for third person singular experiences.' },
      { text: "We _____ not _____ from them since Monday.", options: ["have / heard", "did / hear", "are / hearing", "were / hearing"], correct: 0, explanation: `"Haven't heard + since" for a gap up to now.` }
    ]
  },
  {
    topic: "ever, never, for, since",
    type: "grammar",
    questions: [
      { text: "Have you _____ been to Australia?", options: ["ever", "never", "for", "since"], correct: 0, explanation: '"Ever" in questions about life experiences.' },
      { text: "I have _____ tasted anything so delicious.", options: ["never", "ever", "for", "since"], correct: 0, explanation: '"Never" in negative statements about experiences.' },
      { text: "She has lived here _____ 2012.", options: ["since", "for", "ever", "never"], correct: 0, explanation: '"Since" with a specific point in time.' },
      { text: "He has worked there _____ ten years.", options: ["for", "since", "ever", "never"], correct: 0, explanation: '"For" with a period of time.' },
      { text: "Have you _____ eaten snails? \u2014 No, I've _____ tried them.", options: ["ever / never", "never / ever", "for / since", "since / for"], correct: 0, explanation: '"Ever" in questions, "never" in negative answers.' }
    ]
  },
  {
    topic: "For and since",
    type: "grammar",
    questions: [
      { text: "She has worked here _____ 2019.", options: ["since", "for", "ago", "during"], correct: 0, explanation: '"Since" with a specific starting point.' },
      { text: "I have known him _____ ten years.", options: ["for", "since", "ago", "while"], correct: 0, explanation: '"For" with a duration.' },
      { text: "They have been married _____ a long time.", options: ["for", "since", "ago", "from"], correct: 0, explanation: '"For" describes the length of time.' },
      { text: "She has been ill _____ Monday.", options: ["since", "for", "ago", "at"], correct: 0, explanation: '"Since" introduces a specific point in time.' },
      { text: "He left two hours _____.", options: ["ago", "since", "for", "before"], correct: 0, explanation: '"Ago" is used with past simple for time before now.' }
    ]
  },
  {
    topic: "(don't) have to/should",
    type: "grammar",
    questions: [
      { text: "You _____ wear a seatbelt. It's the law.", options: ["have to", "should", "don't have to", "shouldn't"], correct: 0, explanation: '"Have to" expresses obligation.' },
      { text: "You _____ eat more vegetables. It's good for you.", options: ["should", "have to", "shouldn't", "must not"], correct: 0, explanation: '"Should" gives advice.' },
      { text: "Children _____ go to school. It's compulsory.", options: ["have to", "should", "don't have to", "shouldn't"], correct: 0, explanation: '"Have to" for legal obligation.' },
      { text: "It's Sunday. I _____ get up early.", options: ["don't have to", "shouldn't", "mustn't", "have to"], correct: 0, explanation: `"Don't have to" means not necessary.` },
      { text: "You _____ tell anyone. It's a secret.", options: ["shouldn't", "should", "have to", "don't have to"], correct: 0, explanation: `"Shouldn't" advises against something.` }
    ]
  },
  {
    topic: "should / must / have to 1",
    type: "grammar",
    questions: [
      { text: "You _____ see a doctor. You look terrible.", options: ["should", "must", "have to", "don't have to"], correct: 0, explanation: '"Should" for advice.' },
      { text: "All students _____ bring their ID to the exam.", options: ["must", "should", "don't have to", "mustn't"], correct: 0, explanation: '"Must" for strong obligation/rules.' },
      { text: "You _____ forget your passport.", options: ["mustn't", "don't have to", "shouldn't have", "haven't to"], correct: 0, explanation: `"Mustn't" for prohibition.` },
      { text: "You _____ pay \u2014 it's free!", options: ["don't have to", "mustn't", "shouldn't", "can't"], correct: 0, explanation: `"Don't have to" = not necessary.` },
      { text: "I think you _____ apologise to her.", options: ["should", "must", "have to", "need"], correct: 0, explanation: '"Should" for personal advice.' }
    ]
  },
  {
    topic: "should / must / have to 2",
    type: "grammar",
    questions: [
      { text: "Passengers _____ not smoke on the plane.", options: ["must", "should", "have", "don't have to"], correct: 0, explanation: '"Must not" for rules and prohibitions.' },
      { text: "She _____ practise more if she wants to improve.", options: ["should", "must", "doesn't have to", "mustn't"], correct: 0, explanation: '"Should" for recommendation.' },
      { text: "Do I _____ wear a tie?", options: ["have to", "should", "must", "need"], correct: 0, explanation: '"Have to" in questions about obligation.' },
      { text: "You _____ hurry \u2014 we've got plenty of time.", options: ["don't have to", "mustn't", "shouldn't", "can't"], correct: 0, explanation: `"Don't have to" means it's not necessary.` }
    ]
  },
  {
    topic: "so/such",
    type: "grammar",
    questions: [
      { text: "It was _____ a nice day that we went to the beach.", options: ["such", "so", "very", "too"], correct: 0, explanation: '"Such" before a noun phrase (a/an + adjective + noun).' },
      { text: "The music was _____ loud that I couldn't hear.", options: ["so", "such", "very", "too"], correct: 0, explanation: '"So" before an adjective or adverb.' },
      { text: "She has _____ good ideas!", options: ["such", "so", "very", "too"], correct: 0, explanation: '"Such" before a plural noun phrase.' },
      { text: "He drove _____ fast that he got a ticket.", options: ["so", "such", "very", "too"], correct: 0, explanation: '"So" before an adverb.' },
      { text: "It was _____ beautiful weather that we stayed outside.", options: ["such", "so", "very", "too"], correct: 0, explanation: '"Such" before uncountable noun phrase.' }
    ]
  },
  {
    topic: "Passives 1",
    type: "grammar",
    questions: [
      { text: "The letter _____ every day.", options: ["is delivered", "delivers", "is delivering", "has delivered"], correct: 0, explanation: "Present Simple passive: is/are + past participle." },
      { text: "The car _____ last night.", options: ["was stolen", "stole", "is stolen", "stolen"], correct: 0, explanation: "Past Simple passive: was/were + past participle." },
      { text: "Three people _____ in the accident.", options: ["were injured", "injured", "are injured", "have injured"], correct: 0, explanation: "Past Simple passive for completed past events." },
      { text: "English _____ all over the world.", options: ["is spoken", "speaks", "is speaking", "spoke"], correct: 0, explanation: "Present Simple passive for general truths." },
      { text: "The windows _____ once a week.", options: ["are cleaned", "clean", "are cleaning", "cleaned"], correct: 0, explanation: '"Are" for plural subjects in Present Simple passive.' }
    ]
  },
  {
    topic: "Passives 2",
    type: "grammar",
    questions: [
      { text: "This castle _____ in the 12th century.", options: ["was built", "built", "is built", "has built"], correct: 0, explanation: "Past Simple passive for historical facts." },
      { text: "The new hospital _____ next year.", options: ["will be opened", "will open", "is opened", "has been opened"], correct: 0, explanation: "Future passive: will be + past participle." },
      { text: "These paintings _____ by Picasso.", options: ["were painted", "painted", "are painting", "have painted"], correct: 0, explanation: 'Past Simple passive + "by" for the agent.' },
      { text: "The report _____ by Friday.", options: ["must be finished", "must finish", "is finishing", "finished"], correct: 0, explanation: "Modal passive: modal + be + past participle." },
      { text: "A new shopping centre _____ near here.", options: ["is being built", "is building", "has built", "was building"], correct: 0, explanation: "Present Continuous passive for ongoing actions." }
    ]
  },
  {
    topic: "Present Perfect Simple/Continuous",
    type: "grammar",
    questions: [
      { text: "She _____ for hours \u2014 her eyes are red.", options: ["has been crying", "has cried", "is crying", "cries"], correct: 0, explanation: "Present Perfect Continuous for recent ongoing activity." },
      { text: "I _____ three emails this morning.", options: ["have written", "have been writing", "wrote", "am writing"], correct: 0, explanation: "Present Perfect Simple for completed result." },
      { text: "How long _____ you _____ here?", options: ["have / been working", "did / work", "are / working", "were / working"], correct: 0, explanation: 'Present Perfect Continuous with "how long".' },
      { text: "They _____ all the sandwiches. There's nothing left.", options: ["have eaten", "have been eating", "ate", "are eating"], correct: 0, explanation: "Present Perfect Simple when the result is visible." },
      { text: "He _____ that book all week but still hasn't finished it.", options: ["has been reading", "has read", "read", "is reading"], correct: 0, explanation: "Present Perfect Continuous for ongoing action over time." }
    ]
  },
  {
    topic: "Time and conditional clauses",
    type: "grammar",
    questions: [
      { text: "Call me when you _____ home.", options: ["get", "will get", "got", "are getting"], correct: 0, explanation: 'Present Simple after "when" in future time clauses.' },
      { text: "If it _____ tomorrow, we'll cancel the trip.", options: ["rains", "will rain", "rained", "is raining"], correct: 0, explanation: 'Present Simple in the "if" clause of first conditional.' },
      { text: "I'll wait here until she _____.", options: ["arrives", "will arrive", "arrived", "is arriving"], correct: 0, explanation: 'Present Simple after "until".' },
      { text: "As soon as the meeting _____, we can leave.", options: ["ends", "will end", "ended", "has ended"], correct: 0, explanation: 'Present Simple after "as soon as".' },
      { text: "Before you _____ to bed, switch off the lights.", options: ["go", "will go", "went", "are going"], correct: 0, explanation: 'Present Simple after "before" in future clauses.' }
    ]
  },
  {
    topic: "Second conditional",
    type: "grammar",
    questions: [
      { text: "If I _____ a car, I'd drive to work.", options: ["had", "have", "would have", "will have"], correct: 0, explanation: 'Past Simple in the "if" clause of second conditional.' },
      { text: "If she _____ taller, she would be a model.", options: ["were", "is", "would be", "has been"], correct: 0, explanation: '"Were" in second conditional for all persons.' },
      { text: "I _____ a better job if I spoke better English.", options: ["would get", "will get", "got", "get"], correct: 0, explanation: '"Would + infinitive" in the result clause.' },
      { text: "What would you do if you _____ a million euros?", options: ["won", "win", "would win", "had won"], correct: 0, explanation: 'Past Simple after "if" in second conditional.' },
      { text: "If he _____ harder, he'd pass the exam.", options: ["studied", "studies", "would study", "has studied"], correct: 0, explanation: 'Past Simple in the "if" clause.' }
    ]
  },
  {
    topic: "would/might",
    type: "grammar",
    questions: [
      { text: "I _____ love to travel around the world.", options: ["would", "might", "will", "should"], correct: 0, explanation: '"Would" for wishes and hypothetical preferences.' },
      { text: "It _____ rain later \u2014 take an umbrella.", options: ["might", "would", "will", "must"], correct: 0, explanation: '"Might" for possibility (less certain).' },
      { text: "_____ you like some more tea?", options: ["Would", "Might", "Do", "Should"], correct: 0, explanation: '"Would you like" is a polite offer.' },
      { text: "She _____ be at home \u2014 try calling her.", options: ["might", "would", "will", "should"], correct: 0, explanation: '"Might" for uncertainty.' },
      { text: "I _____ rather stay at home tonight.", options: ["would", "might", "will", "should"], correct: 0, explanation: '"Would rather" for preference.' }
    ]
  },
  {
    topic: "Past Perfect and Past Simple",
    type: "grammar",
    questions: [
      { text: "When we arrived, the film _____ already _____.", options: ["had / started", "was / starting", "has / started", "did / start"], correct: 0, explanation: "Past Perfect for an action before another past action." },
      { text: "She _____ the report before the meeting.", options: ["had finished", "finished", "has finished", "was finishing"], correct: 0, explanation: "Past Perfect for action completed before a past moment." },
      { text: "By the time I got there, they _____.", options: ["had left", "left", "have left", "were leaving"], correct: 0, explanation: '"By the time" + Past Perfect for the earlier action.' },
      { text: "I didn't recognise her because she _____ her hair.", options: ["had changed", "changed", "has changed", "was changing"], correct: 0, explanation: "Past Perfect for the reason behind a past event." },
      { text: "He was tired because he _____ all day.", options: ["had been working", "worked", "has worked", "was working"], correct: 0, explanation: "Past Perfect Continuous for ongoing past action before another." }
    ]
  },
  {
    topic: "Question tags",
    type: "grammar",
    questions: [
      { text: "It's a lovely day, _____ it?", options: ["isn't", "is", "wasn't", "doesn't"], correct: 0, explanation: "Positive sentence \u2192 negative tag." },
      { text: "You can swim, _____ you?", options: ["can't", "can", "don't", "aren't"], correct: 0, explanation: `"Can" \u2192 "can't" in the tag.` },
      { text: "She hasn't called, _____ she?", options: ["has", "hasn't", "did", "does"], correct: 0, explanation: "Negative sentence \u2192 positive tag." },
      { text: "They live in London, _____ they?", options: ["don't", "do", "aren't", "didn't"], correct: 0, explanation: `Present Simple \u2192 "don't" in negative tag.` },
      { text: "You were there last night, _____ you?", options: ["weren't", "were", "didn't", "don't"], correct: 0, explanation: `"Were" \u2192 "weren't" in negative tag.` }
    ]
  }
];
var INTERMEDIATE = [
  {
    topic: "Present Perfect Simple and Continuous",
    type: "grammar",
    questions: [
      { text: "I _____ this exercise three times and I still don't understand it.", options: ["have done", "have been doing", "did", "am doing"], correct: 0, explanation: "Present Perfect Simple for completed repetitions." },
      { text: "You look exhausted. What _____ you _____?", options: ["have / been doing", "did / do", "are / doing", "have / done"], correct: 0, explanation: "Present Perfect Continuous for recent ongoing activity." },
      { text: "She _____ three novels this year.", options: ["has written", "has been writing", "wrote", "is writing"], correct: 0, explanation: "Present Perfect Simple emphasises completed number." },
      { text: "He _____ in the garden all morning \u2014 he's very muddy.", options: ["has been working", "has worked", "worked", "is working"], correct: 0, explanation: "Present Perfect Continuous shows ongoing duration." },
      { text: "We _____ for the bus for 20 minutes.", options: ["have been waiting", "have waited", "are waiting", "wait"], correct: 0, explanation: "Present Perfect Continuous for actions still in progress." }
    ]
  },
  {
    topic: "Narrative tenses",
    type: "grammar",
    questions: [
      { text: "When I arrived, everyone _____ already.", options: ["had left", "left", "was leaving", "leaves"], correct: 0, explanation: "Past Perfect for an action before a past moment." },
      { text: "She _____ when the alarm went off.", options: ["was sleeping", "slept", "had slept", "sleep"], correct: 0, explanation: "Past Continuous for background action." },
      { text: "He _____ the door and _____ inside.", options: ["opened / walked", "was opening / walked", "had opened / was walking", "opens / walks"], correct: 0, explanation: "Past Simple for sequential narrative events." },
      { text: "By the time the police arrived, the thief _____.", options: ["had escaped", "escaped", "was escaping", "has escaped"], correct: 0, explanation: "Past Perfect for action before another past action." },
      { text: "I _____ to study medicine but changed my mind.", options: ["had planned", "planned", "was planning", "have planned"], correct: 0, explanation: "Past Perfect for an earlier intention." }
    ]
  },
  {
    topic: "Passives",
    type: "grammar",
    questions: [
      { text: "The pyramids _____ by the ancient Egyptians.", options: ["were built", "built", "are built", "have been built"], correct: 0, explanation: 'Past Simple passive with "by + agent".' },
      { text: "A new bridge _____ at the moment.", options: ["is being constructed", "is constructing", "constructs", "was constructing"], correct: 0, explanation: "Present Continuous passive for ongoing work." },
      { text: "The results _____ next week.", options: ["will be announced", "will announce", "are announced", "announced"], correct: 0, explanation: "Future passive: will be + past participle." },
      { text: "The patient _____ to hospital immediately.", options: ["was taken", "took", "was taking", "has taken"], correct: 0, explanation: "Past Simple passive for a completed action." },
      { text: "The suspect _____ for questioning.", options: ["has been arrested", "has arrested", "arrested", "is arresting"], correct: 0, explanation: "Present Perfect passive for recent action." }
    ]
  },
  {
    topic: "Modal verbs",
    type: "grammar",
    questions: [
      { text: "You _____ be tired after such a long journey.", options: ["must", "can", "might", "should"], correct: 0, explanation: '"Must" for logical deduction.' },
      { text: "She _____ have left already \u2014 her coat is gone.", options: ["must", "might", "can", "should"], correct: 0, explanation: '"Must have" for a certain deduction about the past.' },
      { text: "He _____ be at home. I saw him in town.", options: ["can't", "mustn't", "shouldn't", "wouldn't"], correct: 0, explanation: `"Can't" for logical impossibility.` },
      { text: "You _____ have called first \u2014 it's very late.", options: ["should", "must", "can", "would"], correct: 0, explanation: '"Should have" for criticism about the past.' },
      { text: "It _____ rain tomorrow \u2014 bring an umbrella.", options: ["might", "must", "can't", "should"], correct: 0, explanation: '"Might" for possibility.' }
    ]
  },
  {
    topic: "Conditionals",
    type: "grammar",
    questions: [
      { text: "If you _____ enough, you'll pass.", options: ["study", "studied", "will study", "would study"], correct: 0, explanation: "First conditional: Present Simple in if-clause." },
      { text: "If I _____ you, I'd leave immediately.", options: ["were", "am", "would be", "will be"], correct: 0, explanation: 'Second conditional: "were" in if-clause.' },
      { text: "If she _____ harder, she would have passed.", options: ["had worked", "worked", "has worked", "would work"], correct: 0, explanation: "Third conditional: Past Perfect in if-clause." },
      { text: "I _____ him if I see him.", options: ["'ll tell", "would tell", "told", "have told"], correct: 0, explanation: "First conditional result clause: will." },
      { text: "She _____ happier if she changed jobs.", options: ["would be", "will be", "is", "was"], correct: 0, explanation: "Second conditional result clause: would." }
    ]
  },
  {
    topic: "Relative clauses",
    type: "grammar",
    questions: [
      { text: "The woman _____ lives next door is a doctor.", options: ["who", "which", "whose", "whom"], correct: 0, explanation: '"Who" introduces a relative clause for people.' },
      { text: "The film _____ we saw last night was excellent.", options: ["that", "who", "whose", "whom"], correct: 0, explanation: '"That" or "which" for things in relative clauses.' },
      { text: "She is the person _____ bag was stolen.", options: ["whose", "who", "which", "that"], correct: 0, explanation: '"Whose" shows possession in relative clauses.' },
      { text: "The hotel _____ we stayed was beautiful.", options: ["where", "which", "who", "that"], correct: 0, explanation: '"Where" for places in relative clauses.' },
      { text: "That is the man _____ I told you about.", options: ["who", "which", "whose", "what"], correct: 0, explanation: '"Who" or "that" for people as objects.' }
    ]
  }
];
var UPPER_INT = [
  {
    topic: "Inversion",
    type: "grammar",
    questions: [
      { text: "Not only _____ late, but he also forgot his keys.", options: ["was he", "he was", "did he was", "he did"], correct: 0, explanation: 'After "not only", use inversion: auxiliary + subject.' },
      { text: "Rarely _____ seen such a beautiful sunset.", options: ["have I", "I have", "did I", "I did"], correct: 0, explanation: "After negative adverbs, use inversion." },
      { text: "Never _____ to a more interesting lecture.", options: ["have I been", "I have been", "did I go", "I went"], correct: 0, explanation: '"Never" + inversion: have + subject + past participle.' },
      { text: "Only after the meeting _____ what had happened.", options: ["did she realise", "she realised", "she did realise", "had she realised"], correct: 0, explanation: '"Only after" triggers inversion in the main clause.' }
    ]
  },
  {
    topic: "Modal verbs \u2014 deduction",
    type: "grammar",
    questions: [
      { text: "He _____ have been at the party \u2014 he was abroad.", options: ["can't", "mustn't", "mightn't", "shouldn't"], correct: 0, explanation: `"Can't have" for impossible deductions about the past.` },
      { text: "She _____ have worked very hard \u2014 she got top marks.", options: ["must", "can", "might", "should"], correct: 0, explanation: '"Must have" for certain logical deductions.' },
      { text: "They _____ have taken a wrong turn \u2014 they're very late.", options: ["might", "must", "can't", "should"], correct: 0, explanation: '"Might have" for possible explanations in the past.' },
      { text: "You _____ have told me earlier!", options: ["should", "must", "can", "will"], correct: 0, explanation: '"Should have" for criticism about past actions.' },
      { text: "The lights are off \u2014 she _____ have left already.", options: ["must", "can", "should", "might not"], correct: 0, explanation: '"Must have" for logical conclusion based on evidence.' }
    ]
  },
  {
    topic: "Conditionals \u2014 mixed",
    type: "grammar",
    questions: [
      { text: "If she _____ the contract, she would be a millionaire now.", options: ["had signed", "signed", "has signed", "would sign"], correct: 0, explanation: "Mixed conditional: Past Perfect for hypothetical past, would for present result." },
      { text: "I _____ here now if I hadn't taken that job.", options: ["wouldn't be", "won't be", "hadn't been", "isn't"], correct: 0, explanation: "Mixed conditional result refers to the present." },
      { text: "If you were more careful, you _____ made that mistake.", options: ["wouldn't have", "won't have", "didn't", "hadn't"], correct: 0, explanation: "Mixed third/second conditional." },
      { text: "Had I known earlier, I _____ differently.", options: ["would have acted", "will act", "act", "acted"], correct: 0, explanation: 'Inverted conditional with "had + past participle".' }
    ]
  },
  {
    topic: "Reported speech",
    type: "grammar",
    questions: [
      { text: "She said she _____ tired.", options: ["was", "is", "were", "be"], correct: 0, explanation: 'Backshift: "am/is" \u2192 "was" in reported speech.' },
      { text: "He told me he _____ call me the next day.", options: ["would", "will", "can", "is going to"], correct: 0, explanation: '"Will" \u2192 "would" in reported speech backshift.' },
      { text: "She asked if I _____ help her.", options: ["could", "can", "will", "am able"], correct: 0, explanation: '"Can" \u2192 "could" in reported questions.' },
      { text: "They said they _____ finished by Monday.", options: ["would have", "will have", "have", "had"], correct: 0, explanation: '"Will have" \u2192 "would have" in reported speech.' },
      { text: "He admitted he _____ the mistake.", options: ["had made", "made", "has made", "makes"], correct: 0, explanation: "Past Simple \u2192 Past Perfect in reported speech." }
    ]
  }
];
var ADVANCED = [
  {
    topic: "Cleft sentences",
    type: "grammar",
    questions: [
      { text: "_____ that surprised me most was his reaction.", options: ["What", "That", "It", "Which"], correct: 0, explanation: '"What" starts a cleft sentence to emphasise information.' },
      { text: "It _____ John who broke the window.", options: ["was", "is", "had", "were"], correct: 0, explanation: '"It was ... who/that" for emphasis.' },
      { text: "_____ I really need is a long holiday.", options: ["What", "That", "It", "Which"], correct: 0, explanation: '"What + subject + need" for emphasis.' },
      { text: "It was in Paris _____ they first met.", options: ["that", "where", "which", "when"], correct: 0, explanation: '"It was ... that" for place emphasis.' }
    ]
  },
  {
    topic: "Subjunctive",
    type: "grammar",
    questions: [
      { text: "The committee recommended that he _____ present.", options: ["be", "is", "was", "were"], correct: 0, explanation: 'Mandative subjunctive uses base form after "recommend that".' },
      { text: "It is essential that she _____ on time.", options: ["arrive", "arrives", "arrived", "would arrive"], correct: 0, explanation: 'Subjunctive base form after "it is essential that".' },
      { text: "If I _____ you, I'd take the offer.", options: ["were", "was", "am", "would be"], correct: 0, explanation: '"If I were you" is the standard subjunctive form.' },
      { text: "They suggested that he _____ early.", options: ["leave", "leaves", "left", "would leave"], correct: 0, explanation: 'Mandative subjunctive base form after "suggest that".' }
    ]
  },
  {
    topic: "Complex conditionals",
    type: "grammar",
    questions: [
      { text: "_____ I known about the problem, I would have fixed it.", options: ["Had", "If", "Should", "Were"], correct: 0, explanation: '"Had + subject + past participle" for inverted third conditional.' },
      { text: "_____ you need any help, don't hesitate to call.", options: ["Should", "Had", "Were", "Would"], correct: 0, explanation: '"Should you need" is a formal inverted first conditional.' },
      { text: "_____ I in your position, I'd resign immediately.", options: ["Were", "Had", "Should", "Would"], correct: 0, explanation: '"Were + subject" is a formal inverted second conditional.' },
      { text: "Provided that she _____ hard, she will succeed.", options: ["works", "worked", "will work", "has worked"], correct: 0, explanation: '"Provided that" + Present Simple for first conditional.' }
    ]
  },
  {
    topic: "Advanced passives",
    type: "grammar",
    questions: [
      { text: "She _____ to be very talented by her teachers.", options: ["is considered", "considers", "is considering", "has considered"], correct: 0, explanation: '"Is considered to be" \u2014 passive with reporting verb.' },
      { text: "The deal _____ to be completed by March.", options: ["is expected", "expects", "is expecting", "was expecting"], correct: 0, explanation: '"Is expected to" for future passive expectation.' },
      { text: "He _____ have given the wrong information.", options: ["is thought to", "thinks to", "is thinking to", "thought to"], correct: 0, explanation: '"Is thought to have + past participle" for passive deduction.' },
      { text: "The report _____ the findings clearly.", options: ["is said to present", "says to present", "is saying to present", "said to present"], correct: 0, explanation: '"Is said to + infinitive" for passive reporting.' }
    ]
  }
];
var HEADWAY_QUESTIONS = {
  "Beginner": BEGINNER,
  "Elementary": ELEMENTARY,
  "Pre-Intermediate": PREINT,
  "Intermediate": INTERMEDIATE,
  "Upper-Intermediate": UPPER_INT,
  "Advanced": ADVANCED
};
var TOPIC_TEMPLATE_MAP = [
  {
    keywords: ["present simple", "present tense", "simple present"],
    questions: [
      { text: "She _____ to work by bus every morning.", options: ["travels", "is travelling", "travelled", "travel"], correct: 0, explanation: "Present Simple for regular habits." },
      { text: "They _____ dinner at 7 every evening.", options: ["have", "are having", "had", "has"], correct: 0, explanation: "Present Simple for routine." },
      { text: "He _____ three languages fluently.", options: ["speaks", "is speaking", "spoke", "speak"], correct: 0, explanation: "Third person singular: add -s." },
      { text: "_____ she usually walk to school?", options: ["Does", "Do", "Is", "Was"], correct: 0, explanation: '"Does" for third person singular questions.' },
      { text: "Water _____ at 0 degrees.", options: ["freezes", "is freezing", "froze", "freeze"], correct: 0, explanation: "Facts use Present Simple." },
      { text: "I _____ coffee. I prefer tea.", options: ["don't drink", "doesn't drink", "am not drinking", "didn't drink"], correct: 0, explanation: `"Don't" for I/you/we/they negative.` }
    ]
  },
  {
    keywords: ["past simple", "simple past", "past tense"],
    questions: [
      { text: "She _____ to school yesterday.", options: ["walked", "walks", "is walking", "has walked"], correct: 0, explanation: "Past Simple for completed past actions." },
      { text: "We _____ a fantastic film last night.", options: ["watched", "watch", "are watching", "have watched"], correct: 0, explanation: '"Last night" signals Past Simple.' },
      { text: "He _____ call me \u2014 I waited all evening.", options: ["didn't", "doesn't", "isn't", "hasn't"], correct: 0, explanation: `"Didn't + base verb" for past negative.` },
      { text: "_____ you enjoy the concert?", options: ["Did", "Do", "Are", "Have"], correct: 0, explanation: '"Did" for past simple questions.' },
      { text: "They _____ married five years ago.", options: ["got", "get", "have got", "are getting"], correct: 0, explanation: 'Past Simple with "ago".' }
    ]
  },
  {
    keywords: ["present continuous", "continuous present", "progressive"],
    questions: [
      { text: "She _____ a meeting right now.", options: ["is having", "has", "had", "have"], correct: 0, explanation: "Present Continuous for actions in progress now." },
      { text: "They _____ to loud music at the moment.", options: ["are listening", "listen", "listened", "listens"], correct: 0, explanation: '"Are + -ing" for current ongoing actions.' },
      { text: "I _____ on a new project this month.", options: ["am working", "work", "worked", "works"], correct: 0, explanation: "Present Continuous for a temporary activity." },
      { text: "_____ you doing anything tomorrow evening?", options: ["Are", "Do", "Did", "Were"], correct: 0, explanation: "Present Continuous for future arrangements." }
    ]
  },
  {
    keywords: ["present perfect", "perfect"],
    questions: [
      { text: "She _____ to Japan twice.", options: ["has been", "was", "went", "is"], correct: 0, explanation: "Present Perfect for life experiences." },
      { text: "I _____ my homework \u2014 can we go out now?", options: ["'ve finished", "finished", "finish", "was finishing"], correct: 0, explanation: "Present Perfect for recently completed action." },
      { text: "_____ you ever eaten octopus?", options: ["Have", "Did", "Are", "Do"], correct: 0, explanation: '"Have + ever" for life experiences.' },
      { text: "They _____ just _____ the news.", options: ["have / heard", "did / hear", "are / hearing", "were / hearing"], correct: 0, explanation: '"Have + just + past participle".' },
      { text: "He _____ that book before.", options: ["has read", "read", "reads", "is reading"], correct: 0, explanation: "Present Perfect for past experience." }
    ]
  },
  {
    keywords: ["future", "will", "going to"],
    questions: [
      { text: "I _____ help you carry those bags.", options: ["'ll", "'m going to", "am", "was"], correct: 0, explanation: '"Will" for spontaneous offers.' },
      { text: "She _____ visit her parents this weekend.", options: ["'s going to", "'ll", "visits", "visited"], correct: 0, explanation: '"Going to" for planned intentions.' },
      { text: "Look at those clouds \u2014 it _____ snow.", options: ["'s going to", "'ll", "snows", "snowed"], correct: 0, explanation: '"Going to" for predictions based on evidence.' },
      { text: "The train _____ at 9:15.", options: ["leaves", "is leaving", "'ll leave", "left"], correct: 0, explanation: "Timetabled events use Present Simple." }
    ]
  },
  {
    keywords: ["conditional", "if clause", "hypothesis"],
    questions: [
      { text: "If you _____ early, you'll get a good seat.", options: ["arrive", "arrived", "will arrive", "would arrive"], correct: 0, explanation: "First conditional: Present Simple in if-clause." },
      { text: "If I _____ more money, I'd travel the world.", options: ["had", "have", "would have", "will have"], correct: 0, explanation: "Second conditional: Past Simple in if-clause." },
      { text: "If she had studied, she _____ the exam.", options: ["would have passed", "will pass", "passes", "passed"], correct: 0, explanation: "Third conditional result clause." },
      { text: "I _____ help you if I had time.", options: ["would", "will", "did", "won't"], correct: 0, explanation: '"Would" in the second conditional result.' }
    ]
  },
  {
    keywords: ["passive", "passive voice"],
    questions: [
      { text: "The building _____ in the 19th century.", options: ["was built", "built", "is built", "builds"], correct: 0, explanation: "Past Simple passive: was + past participle." },
      { text: "These products _____ all over the world.", options: ["are sold", "sell", "sold", "are selling"], correct: 0, explanation: "Present Simple passive for general facts." },
      { text: "The new law _____ next year.", options: ["will be introduced", "will introduce", "introduces", "introduced"], correct: 0, explanation: "Future passive: will be + past participle." },
      { text: "The car _____ before the race.", options: ["had been checked", "checked", "was checking", "checks"], correct: 0, explanation: "Past Perfect passive." }
    ]
  },
  {
    keywords: ["modal", "can", "could", "should", "must", "might", "ability", "permission"],
    questions: [
      { text: "You _____ smoke in here \u2014 it's not allowed.", options: ["can't", "don't", "mustn't", "shouldn't"], correct: 0, explanation: `"Can't" for prohibition.` },
      { text: "She _____ play the violin when she was five.", options: ["could", "can", "should", "must"], correct: 0, explanation: '"Could" for past ability.' },
      { text: "You _____ try the local food \u2014 it's delicious!", options: ["should", "must", "can't", "don't have to"], correct: 0, explanation: '"Should" for recommendation.' },
      { text: "He _____ be the new manager \u2014 he seems very confident.", options: ["must", "can", "might", "should"], correct: 0, explanation: '"Must" for logical deduction.' }
    ]
  },
  {
    keywords: ["article", "the", "a", "an", "articles"],
    questions: [
      { text: "Can you close _____ door, please?", options: ["the", "a", "an", "-"], correct: 0, explanation: '"The" for specific items known to both speaker and listener.' },
      { text: "I'd like _____ apple, please.", options: ["an", "a", "the", "-"], correct: 0, explanation: '"An" before vowel sounds.' },
      { text: "She is _____ architect.", options: ["an", "a", "the", "-"], correct: 0, explanation: '"An" before vowel sounds.' },
      { text: "They play _____ football at school.", options: ["-", "the", "a", "an"], correct: 0, explanation: "No article with sports." },
      { text: "_____ Nile is the longest river in the world.", options: ["The", "A", "An", "-"], correct: 0, explanation: '"The" with river names.' }
    ]
  },
  {
    keywords: ["comparative", "superlative", "comparison", "adjective"],
    questions: [
      { text: "This jacket is _____ than the blue one.", options: ["more expensive", "expensiver", "the most expensive", "most expensive"], correct: 0, explanation: '"More + adjective" for long adjective comparatives.' },
      { text: "He is _____ student in the class.", options: ["the tallest", "taller", "the most tall", "more tall"], correct: 0, explanation: 'Short adjective superlative: "the + -est".' },
      { text: "The weather is _____ today than yesterday.", options: ["worse", "more bad", "the worst", "badder"], correct: 0, explanation: '"Worse" is the irregular comparative of "bad".' },
      { text: "This is _____ view I've ever seen.", options: ["the most beautiful", "more beautiful", "the beautifulest", "beautifuler"], correct: 0, explanation: '"The most + long adjective" for superlative.' }
    ]
  },
  {
    keywords: ["vocabulary", "words", "phrases", "expressions", "idioms", "phrasal"],
    questions: [
      { text: "I _____ up late studying for the exam last night.", options: ["stayed", "stay", "am staying", "have stayed"], correct: 0, explanation: '"Stay up" = to go to bed late (phrasal verb).' },
      { text: "She _____ with her colleagues very well.", options: ["gets on", "gets up", "gets in", "gets out"], correct: 0, explanation: '"Get on with" = have a good relationship.' },
      { text: "Don't worry \u2014 things will _____ in the end.", options: ["work out", "work up", "work in", "work off"], correct: 0, explanation: '"Work out" = to resolve satisfactorily.' },
      { text: "She _____ her grandmother \u2014 both are very patient.", options: ["takes after", "takes up", "takes over", "takes off"], correct: 0, explanation: '"Take after" = to resemble a family member.' }
    ]
  }
];
function findTemplateQuestions(topic) {
  const t = topic.toLowerCase();
  for (const entry of TOPIC_TEMPLATE_MAP) {
    if (entry.keywords.some((k) => t.includes(k) || k.includes(t.split(" ")[0]))) {
      return entry.questions;
    }
  }
  return [
    { text: "She _____ to work every day.", options: ["goes", "is going", "went", "has gone"], correct: 0, explanation: "Present Simple for habits." },
    { text: "They _____ football on Saturdays.", options: ["play", "plays", "are playing", "played"], correct: 0, explanation: "Present Simple for regular activities." },
    { text: "I _____ finished my homework.", options: ["have", "did", "am", "was"], correct: 0, explanation: "Present Perfect with past participle." },
    { text: "He _____ very hard yesterday.", options: ["worked", "works", "is working", "has worked"], correct: 0, explanation: "Past Simple for completed action." },
    { text: "_____ she speak French?", options: ["Does", "Do", "Is", "Has"], correct: 0, explanation: '"Does" for third person singular questions.' },
    { text: "We _____ the meeting tomorrow.", options: ["are attending", "attend", "attended", "attends"], correct: 0, explanation: "Present Continuous for arranged future events." }
  ];
}
function getQuestionsForSection(level, topic, limit = 5) {
  const sections = HEADWAY_QUESTIONS[level];
  let pool = [];
  if (sections) {
    const section = sections.find(
      (s) => s.topic.toLowerCase() === topic.toLowerCase() || topic.toLowerCase().includes(s.topic.toLowerCase()) || s.topic.toLowerCase().includes(topic.toLowerCase())
    );
    if (section) pool = [...section.questions];
  }
  if (pool.length === 0) {
    for (const lvlSections of Object.values(HEADWAY_QUESTIONS)) {
      const section = lvlSections.find(
        (s) => s.topic.toLowerCase() === topic.toLowerCase()
      );
      if (section) {
        pool = [...section.questions];
        break;
      }
    }
  }
  if (pool.length === 0) {
    pool = findTemplateQuestions(topic);
  }
  const seed = Date.now();
  let h = seed | 0;
  const rand = () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967295;
  };
  const all = [...pool];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, limit);
}
function getTopicsForLevel(level) {
  return HEADWAY_QUESTIONS[level] ?? [];
}

// server.ts
import express from "express";
import rateLimit from "express-rate-limit";
import { appendFile, mkdir, readFile as readFileFs, writeFile } from "fs/promises";
import http from "http";
import { createRequire } from "module";
import path2 from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createRequire as _cr } from "module";
dns.setDefaultResultOrder("ipv4first");
var _require = _cr(import.meta.url);
var _ws;
try {
  _ws = _require("ws");
} catch {
  _ws = void 0;
}
var require2 = createRequire(import.meta.url);
var poolPromise = null;
function isMissingColumnError(err, column) {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "").toLowerCase();
  const col = column.toLowerCase();
  return code === "PGRST204" || code === "42703" || msg.includes("could not find") && msg.includes(col) || msg.includes("schema cache") && msg.includes(col);
}
var stripProfilesJoin = (sql) => sql.replace(
  /LEFT JOIN profiles (\w+) ON \1\.id = \w+\.\w+/gi,
  (_match, alias) => `LEFT JOIN (SELECT NULL::uuid AS id, NULL::text AS display_name, NULL::text AS email) ${alias} ON false`
);
function seededShuffle(arr, seed) {
  let h = 305419896;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 2654435769);
    h ^= h >>> 16;
  }
  const next = () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967295;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
var driveImportJobs = /* @__PURE__ */ new Map();
var DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
var LEVEL_DRIVE_FOLDERS = {
  "Beginner": {
    student_audio: "12Mmg0fjHxRhglHgKag9bP5QGGo7sNkx-",
    workbook_audio: "1jX0bv2qQDRyhedO7qfvu5yjb97qDazQu",
    video: "15HmRs-8kRI4C1Uzp5iwz-TE4c02lEuCc"
  },
  "Elementary": {
    student_audio: "1bJpdL3tkWRlIQKS2lp9ZvKBm-SHrahUE",
    workbook_audio: "1bwL0ANh1IR-YXzc9y53r9wRXEUAw7dkj",
    video: "1DO4J5r-7HnytBb4UArIPnPjZTX60GPZm"
  },
  "Pre-Intermediate": {
    student_audio: "1-MS0Eu2-uXELtasjK23r5wpIxSYw13WZ",
    workbook_audio: "1pmBAkEVHE8E0NlZoaZf7VZKrhCUAK5yL",
    video: "1tl7tpMoajGSOX1y6G1Y3-OvvZtnFgnCH"
  }
};
var BEGINNER_DRIVE_FOLDERS = LEVEL_DRIVE_FOLDERS["Beginner"];
function detectUnitNumber(filename) {
  const patterns = [
    /unit[\s_\-.]*0?(\d{1,2})/i,
    /\bu0?(\d{1,2})\b/i,
    /_0?(\d{1,2})[_\s]/,
    /^0?(\d{1,2})[_\s\-.]/
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
async function listDriveFolder(folderId, apiKey) {
  const files = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent("nextPageToken,files(id,name,size,mimeType,modifiedTime)");
    let url = `${DRIVE_API_BASE}/files?q=${q}&key=${apiKey}&fields=${fields}&pageSize=200`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Drive API ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const data = await resp.json();
    files.push(...data.files ?? []);
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return files;
}
async function downloadDriveFileBuffer(fileId, apiKey) {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&key=${apiKey}`;
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Drive download ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const arrBuf = await resp.arrayBuffer();
  return Buffer.from(arrBuf);
}
var AUDIO_EXTS = /* @__PURE__ */ new Set(["mp3", "wav", "m4a", "ogg", "aac", "flac"]);
var VIDEO_EXTS = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "avi", "mkv"]);
var MEDIA_EXTS = /* @__PURE__ */ new Set([...AUDIO_EXTS, ...VIDEO_EXTS]);
function mimeForExt(ext) {
  const map = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska"
  };
  return map[ext] || "application/octet-stream";
}
async function processZipEntries(zipBuffer, zipName, zipDriveId, type, level, job, courseId) {
  const unitNum = detectUnitNumber(zipName);
  let AdmZip;
  try {
    AdmZip = (await import("adm-zip")).default;
  } catch {
    throw new Error(`adm-zip package not installed \u2014 run: npm install adm-zip`);
  }
  let zip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (e) {
    throw new Error(`Invalid ZIP "${zipName}": ${e?.message}`);
  }
  const entries = zip.getEntries().filter((e) => {
    if (e.isDirectory) return false;
    const baseName = e.entryName.split("/").pop() || "";
    if (baseName.startsWith("__MACOSX") || baseName.startsWith(".")) return false;
    const ext = baseName.split(".").pop()?.toLowerCase() || "";
    return MEDIA_EXTS.has(ext);
  });
  if (entries.length === 0) {
    job.logs.push(`   \u21B3 No audio/video files inside "${zipName}"`);
    return;
  }
  job.total += entries.length;
  job.logs.push(`   \u21B3 ${entries.length} media files inside "${zipName}"`);
  for (const entry of entries) {
    const baseName = (entry.entryName.split("/").pop() || entry.entryName).replace(/\s+/g, "_");
    const ext = baseName.split(".").pop()?.toLowerCase() || "";
    const compositeId = `${zipDriveId}::${entry.entryName}`;
    try {
      const { data: existing } = await supabaseAdmin.from("headway_media").select("id").eq("drive_file_id", compositeId).maybeSingle();
      if (existing) {
        job.skipped++;
        job.logs.push(`\u21B7 Skip (exists): ${baseName}`);
        continue;
      }
      const fileData = entry.getData();
      const storagePath = `headway/${level}/${type}/unit${unitNum ?? 0}/${baseName}`;
      const mime = mimeForExt(ext);
      const { error: uploadErr } = await supabaseAdmin.storage.from("headway-media").upload(storagePath, fileData, { contentType: mime, upsert: true });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
      const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
      const title = baseName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim();
      const insertPayload = {
        level,
        unit_number: unitNum,
        type,
        title,
        file_name: baseName,
        drive_file_id: compositeId,
        url: publicUrl,
        mime_type: mime,
        size_bytes: fileData.length
      };
      if (courseId) insertPayload.course_id = courseId;
      let insResult = await supabaseAdmin.from("headway_media").insert(insertPayload);
      if (insertPayload.course_id && isMissingColumnError(insResult.error, "course_id")) {
        const { course_id: _dropped, ...payloadWithoutCourse } = insertPayload;
        insResult = await supabaseAdmin.from("headway_media").insert(payloadWithoutCourse);
      }
      if (insResult.error) {
        if (insResult.error.code === "42P01") throw new Error("headway_media table not found \u2014 run migration 014");
        throw new Error(insResult.error.message);
      }
      job.done++;
      job.logs.push(`\u2713 ${baseName}${unitNum ? ` \u2192 Unit ${unitNum}` : ""}`);
    } catch (err) {
      job.errors.push(`${baseName}: ${err?.message}`);
      job.logs.push(`\u2717 ${baseName}: ${err?.message}`);
    }
  }
}
var getPool = async () => {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  if (!poolPromise) {
    poolPromise = Promise.resolve().then(() => {
      const pgModule = require2("pg");
      const Pool = pgModule?.Pool ?? pgModule?.default?.Pool;
      if (!Pool) {
        throw new Error("pg Pool export not available");
      }
      return new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
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
var poolQuery = async (sql, params) => {
  const pool = await getPool();
  if (!pool) throw new Error("Database pool not available");
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO public");
    try {
      return await client.query(sql, params);
    } catch (e) {
      if (typeof e?.message === "string" && e.message.includes("relation") && e.message.includes("profiles")) {
        const safeSql = stripProfilesJoin(sql);
        if (safeSql !== sql) return await client.query(safeSql, params);
      }
      throw e;
    }
  } finally {
    client.release();
  }
};
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
var TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim() || "";
var TELEGRAM_ALERT_FIX_URL = process.env.TELEGRAM_ALERT_FIX_URL?.trim() || "";
function resolveTelegramFixButtonUrl() {
  const raw = TELEGRAM_ALERT_FIX_URL;
  if (!raw) return "";
  if (/api\.telegram\.org\/bot[^/]+\/sendMessage/i.test(raw)) {
    console.warn(
      "[alerts] TELEGRAM_ALERT_FIX_URL points to api.telegram.org sendMessage; ignoring. Remove it in Vercel env, or set it to your app URL (e.g. https://YOUR.vercel.app/api/fix-now)."
    );
    return "";
  }
  return raw;
}
var TELEGRAM_ALERT_COOLDOWN_MS = Math.max(
  Number(process.env.TELEGRAM_ALERT_COOLDOWN_MS || 12e4),
  1e4
);
var TELEGRAM_RETRY_INTERVAL_MS = Math.max(
  Number(process.env.TELEGRAM_RETRY_INTERVAL_MS || 3e4),
  5e3
);
var ERROR_ALERTS_ENABLED = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
var TELEGRAM_ALERTS_SETTINGS_CACHE_TTL_MS = 15e3;
var telegramAlertsSettingsCache = {
  value: true,
  expiresAt: 0
};
var recentErrorAlerts = /* @__PURE__ */ new Map();
var recentLoggedErrors = /* @__PURE__ */ new Map();
var TELEGRAM_QUEUE_PATH = path2.join(process.cwd(), "logs", "telegram-failed.log");
var flushingTelegramQueue = false;
function escapeTelegramText(value) {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
function stableHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}
var apiResponseCache = /* @__PURE__ */ new Map();
var API_CACHE_MAX_ENTRIES = 500;
var PERF_SLOW_THRESHOLD_MS = 300;
function getCachedApiResponse(key) {
  const cached = apiResponseCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    apiResponseCache.delete(key);
    return null;
  }
  return cached.value;
}
function setCachedApiResponse(key, value, ttlMs) {
  apiResponseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (apiResponseCache.size > API_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [cacheKey, entry] of apiResponseCache) {
      if (entry.expiresAt <= now) apiResponseCache.delete(cacheKey);
      if (apiResponseCache.size <= API_CACHE_MAX_ENTRIES - 100) break;
    }
  }
}
function serializeUnknownError(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}
${error.stack || ""}`.trim();
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
async function sendTelegramErrorAlert(params) {
  const fingerprint = params.fingerprint ?? stableHash(params.fingerprintSource);
  if (!await isTelegramErrorAlertsEnabled()) {
    console.warn(
      "[alerts] Telegram error alerts disabled (env or admin settings); skip send. fingerprint=",
      fingerprint
    );
    return fingerprint;
  }
  const now = Date.now();
  const lastSentAt = recentErrorAlerts.get(fingerprint) || 0;
  if (now - lastSentAt < TELEGRAM_ALERT_COOLDOWN_MS) return fingerprint;
  recentErrorAlerts.set(fingerprint, now);
  const escapedTitle = escapeTelegramText(params.title);
  const escapedSummary = escapeTelegramText(params.summary);
  const escapedDetails = params.details ? `

${escapeTelegramText(params.details.slice(0, 1200))}` : "";
  const body = `\u{1F6A8} *${escapedTitle}*
${escapedSummary}
fingerprint: \`${escapeTelegramText(fingerprint)}\`${escapedDetails}`;
  const buttonUrlBase = params.fixUrl || resolveTelegramFixButtonUrl();
  const buttonUrl = buttonUrlBase ? `${buttonUrlBase}${buttonUrlBase.includes("?") ? "&" : "?"}fingerprint=${encodeURIComponent(fingerprint)}` : "";
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: body,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    ...!buttonUrl ? {
      reply_markup: {
        inline_keyboard: [[{ text: "Fix now", callback_data: `fix:${fingerprint}` }]]
      }
    } : buttonUrl ? {
      reply_markup: {
        inline_keyboard: [[{ text: "Fix now", url: buttonUrl }]]
      }
    } : {}
  };
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const responseText = await response.text();
      console.warn("[alerts] Telegram send failed:", response.status, responseText);
      void enqueueFailedTelegramAlert({
        type: "error",
        payload,
        fingerprint,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        attempts: 1
      });
    }
  } catch (error) {
    console.warn("[alerts] Telegram request failed:", error);
    console.warn("[alerts] Run GET /api/telegram/diagnostics on this server to verify Telegram connectivity.");
    void enqueueFailedTelegramAlert({
      type: "error",
      payload,
      fingerprint,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      attempts: 1
    });
  }
  return fingerprint;
}
async function isTelegramErrorAlertsEnabled() {
  if (!ERROR_ALERTS_ENABLED) return false;
  const now = Date.now();
  if (now < telegramAlertsSettingsCache.expiresAt) {
    return telegramAlertsSettingsCache.value;
  }
  let enabled = true;
  try {
    const settingsRes = await supabaseAdmin.from("platform_config").select("value").eq("section", "settings").maybeSingle();
    if (!settingsRes.error) {
      const settings = settingsRes.data?.value;
      if (typeof settings?.advanced?.telegramErrorAlerts === "boolean") {
        enabled = settings.advanced.telegramErrorAlerts;
      }
    }
  } catch {
  }
  telegramAlertsSettingsCache = {
    value: enabled,
    expiresAt: now + TELEGRAM_ALERTS_SETTINGS_CACHE_TTL_MS
  };
  return enabled;
}
async function sendTelegramTextMessage(text) {
  if (!ERROR_ALERTS_ENABLED) return;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text.slice(0, 3900),
    disable_web_page_preview: true
  };
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const responseText = await response.text();
      console.warn("[alerts] Telegram text send failed:", response.status, responseText);
      void enqueueFailedTelegramAlert({
        type: "text",
        payload,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        attempts: 1
      });
    }
  } catch (error) {
    console.warn("[alerts] Telegram text request failed:", error);
    void enqueueFailedTelegramAlert({
      type: "text",
      payload,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      attempts: 1
    });
  }
}
async function callTelegramApi(method, payload) {
  if (!ERROR_ALERTS_ENABLED) return;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const txt = await response.text();
      console.warn(`[alerts] Telegram API ${method} failed:`, response.status, txt);
    }
  } catch (error) {
    console.warn(`[alerts] Telegram API ${method} request failed:`, error);
  }
}
async function ensureTelegramQueueDir() {
  const dir = path2.dirname(TELEGRAM_QUEUE_PATH);
  await mkdir(dir, { recursive: true });
}
async function enqueueFailedTelegramAlert(item) {
  try {
    await ensureTelegramQueueDir();
    await appendFile(TELEGRAM_QUEUE_PATH, `${JSON.stringify(item)}
`, "utf8");
  } catch (error) {
    console.warn("[alerts] Failed to enqueue telegram alert:", error);
  }
}
async function readQueuedTelegramAlerts() {
  try {
    const raw = await readFileFs(TELEGRAM_QUEUE_PATH, "utf8");
    if (!raw.trim()) return [];
    return raw.split(/\r?\n/).filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((x) => Boolean(x));
  } catch {
    return [];
  }
}
async function overwriteQueuedTelegramAlerts(items) {
  await ensureTelegramQueueDir();
  const content = items.length ? `${items.map((x) => JSON.stringify(x)).join("\n")}
` : "";
  await writeFile(TELEGRAM_QUEUE_PATH, content, "utf8");
}
async function sendTelegramPayload(payload) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
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
async function flushFailedTelegramAlerts() {
  if (!ERROR_ALERTS_ENABLED || flushingTelegramQueue) return;
  flushingTelegramQueue = true;
  try {
    const queued = await readQueuedTelegramAlerts();
    if (!queued.length) return;
    const pending = [];
    for (const item of queued) {
      const sent = await sendTelegramPayload(item.payload);
      if (!sent) pending.push({ ...item, attempts: item.attempts + 1 });
    }
    await overwriteQueuedTelegramAlerts(pending);
    if (pending.length < queued.length) {
      console.log(
        `[alerts] Flushed ${queued.length - pending.length}/${queued.length} queued Telegram alert(s).`
      );
    }
  } catch (error) {
    console.warn("[alerts] Failed to flush queued Telegram alerts:", error);
  } finally {
    flushingTelegramQueue = false;
  }
}
function detectErrorLayer(input, fallback = "BACKEND") {
  const hay = String(input || "").toLowerCase();
  if (/sql|postgres|postgrest|supabase|migration|relation|column|table|constraint|42p|pgrst|query/i.test(
    hay
  )) {
    return "DATABASE";
  }
  return fallback;
}
async function recordApi5xxAlertForFix(req, statusCode, durationMs, requestId) {
  const layer = "BACKEND";
  const message = `${req.method} ${req.path} -> ${statusCode} in ${durationMs}ms`;
  const fingerprintSource = `${layer}:${message}::${req.originalUrl}`;
  const fingerprint = stableHash(fingerprintSource);
  const ctx = {
    layer,
    message,
    stack: `request_id=${requestId}`,
    url: req.originalUrl,
    userAgent: req.headers["user-agent"],
    source: "middleware.api-5xx",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  recentLoggedErrors.set(fingerprint, ctx);
  void persistErrorAlertContext(fingerprint, ctx);
  await sendTelegramErrorAlert({
    title: "API 5xx Error",
    summary: message,
    fingerprintSource,
    fingerprint,
    details: `request_id=${requestId}`
  });
}
async function logSystemError(event, res) {
  const timestamp = event.timestamp || (/* @__PURE__ */ new Date()).toISOString();
  const layer = event.layer || detectErrorLayer(`${event.message}
${event.stack || ""}`);
  const fingerprintSource = `${layer}:${event.message}:${event.file || ""}:${event.line || ""}:${event.url || ""}`;
  const fingerprint = stableHash(fingerprintSource);
  if (res) {
    res.locals.errorAlertEmitted = true;
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
    `LikelyReason: ${guessLikelyReason(layer, event.message, event.stack)}`
  ].filter(Boolean).join("\n");
  console.error(`[alerts] logSystemError fingerprint=${fingerprint} layer=${layer} source=${event.source || "n/a"}`);
  console.error(`[${layer}] ${event.message}`);
  if (event.stack) console.error(event.stack);
  const ctx = {
    layer,
    message: event.message,
    stack: event.stack,
    file: event.file,
    line: event.line,
    url: event.url,
    userAgent: event.userAgent,
    source: event.source,
    userId: event.userId,
    timestamp
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
    details: details.slice(0, 2e3)
  });
}
function guessLikelyReason(layer, message, stack) {
  const hay = `${message}
${stack || ""}`.toLowerCase();
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
var supabaseAdminInstance = null;
var getSupabaseAdmin = () => {
  if (!supabaseAdminInstance) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in environment variables.");
    }
    supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      ..._ws ? { realtime: { transport: _ws } } : {}
    });
  }
  return supabaseAdminInstance;
};
var supabaseAdmin = new Proxy({}, {
  get: (target, prop, receiver) => {
    const instance = getSupabaseAdmin();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  }
});
async function persistErrorAlertContext(fingerprint, ctx) {
  try {
    const { error } = await supabaseAdmin.from("error_alert_context").upsert(
      {
        fingerprint,
        payload: ctx
      },
      { onConflict: "fingerprint" }
    );
    if (error) {
      console.warn(
        "[alerts] persist error_alert_context failed:",
        error.message,
        error.code || "",
        "| Run migrations (error_alert_context) in Supabase if table is missing."
      );
    } else {
      console.log("[alerts] persisted error_alert_context fingerprint=", fingerprint);
    }
  } catch (e) {
    console.warn("[alerts] persist error_alert_context exception:", e?.message || e);
  }
}
async function loadErrorAlertContext(fingerprint) {
  try {
    const { data, error } = await supabaseAdmin.from("error_alert_context").select("payload").eq("fingerprint", fingerprint).maybeSingle();
    if (error) {
      console.warn("[alerts] load error_alert_context:", error.message, error.code || "");
      return null;
    }
    if (!data?.payload) return null;
    return data.payload;
  } catch (e) {
    console.warn("[alerts] load error_alert_context exception:", e?.message || e);
    return null;
  }
}
function buildFallbackErrorContext(fingerprint) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  return {
    layer: "BACKEND",
    message: [
      `No stored error context for fingerprint ${fingerprint}.`,
      "Typical causes: table public.error_alert_context missing (run migration), Supabase write failed,",
      "or this alert was sent from a code path before persistence was enabled (e.g. API 5xx middleware only).",
      "An AI analysis will still run using this limited information."
    ].join(" "),
    stack: void 0,
    file: void 0,
    line: void 0,
    url: void 0,
    userAgent: void 0,
    source: "fix.fallback-missing-context",
    userId: void 0,
    timestamp: ts
  };
}
async function triggerFixSuggestionForFingerprint(fingerprint, opts) {
  const fp = String(fingerprint || "").trim();
  if (!fp) {
    const err = new Error("fingerprint is required");
    err.status = 400;
    throw err;
  }
  let ctx = await loadErrorAlertContext(fp) || recentLoggedErrors.get(fp) || null;
  let usedFallback = false;
  if (!ctx) {
    console.warn("[alerts] triggerFix: no row/memory for fingerprint=", fp, "- using fallback context");
    ctx = buildFallbackErrorContext(fp);
    if (opts?.messageHint) {
      ctx = {
        ...ctx,
        message: `${ctx.message}
Extra hint: ${opts.messageHint}`
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
    rawLog: `Layer=${ctx.layer}; Source=${ctx.source || "n/a"}; UserAgent=${ctx.userAgent || "n/a"}; User=${ctx.userId || "n/a"}; usedFallback=${usedFallback}`
  });
  await sendTelegramTextMessage(
    [
      `\u{1F916} FIX RESULT`,
      `Fingerprint: ${fp}`,
      `Layer: ${ctx.layer}`,
      usedFallback ? "(limited context \u2014 see analysis)" : "",
      "",
      suggestion.formatted
    ].filter(Boolean).join("\n")
  );
  return { ctx, suggestion, usedFallback };
}
function escapeHtmlBasic(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function addDaysToYmd(ymd, days) {
  const parts = ymd.split("-").map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    const d = /* @__PURE__ */ new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const [y, m, day] = parts;
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function paymentStatusToInvoiceRowStatus(paymentStatus) {
  if (paymentStatus === "completed") return "paid";
  if (paymentStatus === "pending") return "pending";
  return "draft";
}
function resolveInvoiceDisplayStatus(dbStatus, dueYmd) {
  if (dbStatus === "draft") return "draft";
  if (dbStatus === "paid") return "paid";
  const due = /* @__PURE__ */ new Date(`${dueYmd}T12:00:00Z`);
  const today = /* @__PURE__ */ new Date();
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const tDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dueDay < tDay) return "overdue";
  return "pending";
}
async function nextInvoiceNumberForPaymentDate(paymentDateYmd) {
  const yStr = (paymentDateYmd || "").slice(0, 4);
  const year = yStr.length === 4 && /^\d{4}$/.test(yStr) ? parseInt(yStr, 10) : (/* @__PURE__ */ new Date()).getFullYear();
  const prefix = `INV-${year}-`;
  const { data, error } = await supabaseAdmin.from("invoices").select("invoice_number").like("invoice_number", `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  const re = new RegExp(`^INV-${year}-(\\d+)$`);
  for (const row of data || []) {
    const m = String(row.invoice_number || "").match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}
async function createApp(options = {}) {
  const includeFrontend = options.includeFrontend ?? true;
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));
  app.set("trust proxy", 1);
  const resolveClientIp = (req) => {
    const xff = req.headers["x-forwarded-for"];
    if (xff) {
      const first = (Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim();
      if (first) return first;
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
  };
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    // 1000 req/15min — generous enough for normal dashboard polling.
    max: 1e3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    // req.originalUrl keeps the full path regardless of mount point.
    skip: (req) => req.originalUrl === "/api/health" || req.path === "/health",
    keyGenerator: resolveClientIp,
    validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false }
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts, please try again in 15 minutes." }
  });
  const realtimeLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    max: 2e3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many realtime requests, please slow down." }
  });
  app.use("/api/student/realtime-quiz/", realtimeLimiter);
  app.use("/api/teacher/realtime-quiz/", realtimeLimiter);
  app.use("/api/realtime-quiz/", realtimeLimiter);
  app.use("/api/", apiLimiter);
  app.use("/api/auth/", authLimiter);
  app.use("/api/admin", async (req, res, next) => {
    if (req.path === "/seed" && req.method === "GET") return next();
    if (req.path === "/create-student" && req.method === "POST") return next();
    const caller = await assertAuthenticated(req, res);
    if (!caller) return;
    if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
    next();
  });
  app.get("/sw.js", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Content-Type", "application/javascript");
    next();
  });
  app.get("/manifest.json", async (_req, res) => {
    try {
      const [branding, settings] = await Promise.all([
        getConfigSection("branding").catch(() => null),
        getConfigSection("settings").catch(() => null)
      ]);
      const b = branding || {};
      const s = settings || {};
      const schoolName = typeof s?.general?.school_name === "string" && s.general.school_name.trim() || typeof b?.schoolName === "string" && b.schoolName.trim() || "QuizMaster";
      const primaryColor = typeof b?.colors?.primary === "string" && b.colors.primary || "#4f46e5";
      const bgColor = typeof b?.colors?.sidebar_bg === "string" && b.colors.sidebar_bg || "#0f172a";
      res.setHeader("Content-Type", "application/manifest+json");
      res.setHeader("Cache-Control", "no-store");
      res.json({
        name: schoolName,
        short_name: schoolName.length > 14 ? schoolName.slice(0, 14) : schoolName,
        description: `${schoolName} \u2014 Education Platform`,
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
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        shortcuts: [
          { name: "Dashboard", short_name: "Dashboard", url: "/", icons: [{ src: "/icon-192.png", sizes: "192x192" }] }
        ]
      });
    } catch {
      const staticPath = path2.join(process.cwd(), "public", "manifest.json");
      res.setHeader("Content-Type", "application/manifest+json");
      res.sendFile(staticPath);
    }
  });
  app.get("/api/pwa/icon.svg", async (_req, res) => {
    try {
      const branding = await getConfigSection("branding").catch(() => null);
      const b = branding || {};
      const raw = typeof b.logoText === "string" ? b.logoText.trim().toUpperCase() : "";
      const logoText = raw.slice(0, 3) || "QM";
      const primaryColor = typeof b?.colors?.primary === "string" && b.colors.primary || "#4f46e5";
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
  app.post("/api/log-error", async (req, res) => {
    try {
      const body = req.body || {};
      const message = String(body.message || "").trim();
      if (!message) return res.status(400).json({ error: "message is required" });
      const inferredLayer = body.layer === "FRONTEND" || body.layer === "BACKEND" || body.layer === "DATABASE" ? body.layer : detectErrorLayer(`${message}
${String(body.stack || "")}`, "FRONTEND");
      void logSystemError(
        {
          layer: inferredLayer,
          message,
          stack: body.stack ? String(body.stack) : void 0,
          file: body.file ? String(body.file) : void 0,
          line: Number.isFinite(Number(body.line)) && Number(body.line) > 0 ? Number(body.line) : void 0,
          url: body.currentUrl ? String(body.currentUrl) : void 0,
          userAgent: body.userAgent ? String(body.userAgent) : req.headers["user-agent"],
          source: body.source ? String(body.source) : "api.log-error",
          userId: body.userId ? String(body.userId) : void 0,
          timestamp: body.timestamp ? String(body.timestamp) : void 0
        },
        res
      );
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error?.message || "Failed to log error" });
    }
  });
  app.get("/api/test-telegram", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const message = typeof req.query.message === "string" && req.query.message.trim() ? req.query.message.trim() : "Manual Telegram pipeline test";
      await logSystemError(
        {
          layer: "BACKEND",
          message,
          stack: "Triggered by /api/test-telegram",
          url: req.originalUrl,
          userAgent: req.headers["user-agent"],
          source: "api.test-telegram"
        },
        res
      );
      return res.json({ success: true, message: "Test alert sent to Telegram (if configured)." });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error." });
    }
  });
  app.get("/api/telegram/diagnostics", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!ERROR_ALERTS_ENABLED) {
      return res.json({
        ok: false,
        configured: false,
        telegramReachable: false,
        hint: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env, then restart the server."
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12e3);
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/getMe`,
        { signal: controller.signal }
      );
      const json = await response.json().catch(() => ({}));
      clearTimeout(timer);
      const reachable = response.ok && json?.ok === true;
      return res.json({
        ok: reachable,
        configured: true,
        telegramReachable: reachable,
        botUsername: json?.result?.username,
        hint: reachable ? "This machine can reach Telegram; alerts should work if the server process is the one sending them." : `Telegram API responded but not OK: ${JSON.stringify(json).slice(0, 300)}`
      });
    } catch (error) {
      clearTimeout(timer);
      return res.json({
        ok: false,
        configured: true,
        telegramReachable: false,
        error: String(error?.message || error),
        hint: "Cannot reach https://api.telegram.org from this PC (firewall, ISP block, or corporate network). Error alerts will not arrive in Telegram until outbound HTTPS to Telegram works (try another network or VPN). Queued alerts are still written to logs/telegram-failed.log when sends fail."
      });
    }
  });
  app.get("/api/fix-now", async (req, res) => {
    try {
      const fingerprint = String(req.query.fingerprint || "").trim();
      const hint = typeof req.query.hint === "string" && req.query.hint.trim() ? req.query.hint.trim() : void 0;
      const { ctx, suggestion, usedFallback } = await triggerFixSuggestionForFingerprint(fingerprint, {
        messageHint: hint
      });
      return res.json({
        success: true,
        fingerprint,
        note: "Fix suggestion generated and sent to Telegram.",
        result: suggestion,
        layer: ctx.layer,
        usedFallback
      });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ error: error?.message || "Bad request" });
      }
      return res.status(500).json({ error: error?.message || "Failed to generate fix suggestion" });
    }
  });
  app.get("/api/alerts/trigger-fix", async (req, res) => {
    try {
      const fingerprint = String(req.query.fingerprint || "").trim();
      const hint = typeof req.query.hint === "string" && req.query.hint.trim() ? req.query.hint.trim() : void 0;
      const wantHtml = String(req.query.format || "").toLowerCase() === "html" || String(req.get("accept") || "").includes("text/html");
      const { ctx, suggestion, usedFallback } = await triggerFixSuggestionForFingerprint(fingerprint, {
        messageHint: hint
      });
      if (wantHtml) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Fix triggered</title></head><body style="font-family:system-ui;padding:24px;max-width:640px"><h1>Fix suggestion sent</h1><p>A detailed AI analysis was sent to your Telegram chat.</p><p><strong>Layer:</strong> ${escapeHtmlBasic(ctx.layer)}</p><p><strong>Fingerprint:</strong> <code>${escapeHtmlBasic(fingerprint)}</code></p><p style="color:#555;font-size:14px">You can close this tab.</p></body></html>`
        );
      }
      return res.json({
        success: true,
        fingerprint,
        note: "Fix suggestion generated and sent to Telegram.",
        result: suggestion,
        layer: ctx.layer,
        usedFallback
      });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ error: error?.message || "Bad request" });
      }
      return res.status(500).json({ error: error?.message || "Failed to generate fix suggestion" });
    }
  });
  const parseTelegramErrorMessage = (text) => {
    const normalized = String(text || "");
    const getLine = (label) => {
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
      const path3 = String(body.path || "").trim();
      const history = Array.isArray(body.history) ? body.history : [];
      if (!message) return res.status(400).json({ error: "message is required" });
      const apiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      const roleContext = {
        teacher: `You are an expert teaching assistant for an online educational platform. The teacher is currently on the "${page}" page (path: ${path3 || "unknown"}).
You help teachers:
- Create and manage quizzes, courses, modules, and lessons
- Start live quiz sessions and live video sessions
- Track student progress and view results
- Manage assignments, attendance, and certificates
- Use platform features effectively
When giving step-by-step instructions, number each step clearly. Be concise but thorough. Use a warm, professional tone.`,
        student: `You are a friendly learning assistant for an online educational platform. The student is currently on the "${page}" page (path: ${path3 || "unknown"}).
You help students:
- Take quizzes and understand their scores
- Join live classes and live quiz sessions
- Track their learning progress
- Submit assignments and view certificates
- Navigate and use the platform effectively
When giving instructions, number each step clearly. Be encouraging and supportive. Use simple, clear language.`,
        admin: `You are an expert platform administrator assistant for an online educational platform. The admin is currently on the "${page}" page (path: ${path3 || "unknown"}).
You help admins:
- Manage students, teachers, courses, and classes
- Configure platform settings, branding, and features
- Understand analytics and reports
- Set up roles, permissions, and security (including 2FA)
- Handle payments, invoices, and certificates
When giving instructions, number each step clearly. Be precise and technical when needed.`
      };
      const systemPrompt = roleContext[role] || roleContext.student;
      const historyText = history.slice(-8).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
      const fullPrompt = `${historyText ? `Conversation so far:
${historyText}

` : ""}User: ${message}`;
      let reply = "";
      if (apiKey) {
        const { GoogleGenAI } = await import("@google/genai");
        const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
        const ai = geminiBaseUrl ? new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } }) : new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `${systemPrompt}

${fullPrompt}
Assistant:`
        });
        reply = (result.text || "").trim();
      } else {
        const pollinationsRes = await fetch("https://text.pollinations.ai/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              ...history.slice(-8).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
              { role: "user", content: message }
            ],
            model: "openai"
          })
        });
        if (!pollinationsRes.ok) throw new Error(`Pollinations AI error: ${pollinationsRes.status}`);
        reply = (await pollinationsRes.text()).trim();
      }
      reply = reply || "I'm sorry, I couldn't generate a response. Please try again.";
      res.json({ success: true, reply });
    } catch (e) {
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
        stack: body.stack ? String(body.stack) : void 0,
        fileName: body.fileName ? String(body.fileName) : void 0,
        lineNumber: Number.isFinite(Number(body.lineNumber)) && Number(body.lineNumber) > 0 ? Number(body.lineNumber) : void 0,
        currentUrl: body.currentUrl ? String(body.currentUrl) : void 0,
        rawLog: body.rawLog ? String(body.rawLog) : void 0
      });
      res.json({ success: true, result });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to generate fix suggestion" });
    }
  });
  app.post("/api/telegram/error-webhook", async (req, res) => {
    try {
      const callbackQuery = req.body?.callback_query;
      if (callbackQuery) {
        const callbackId = String(callbackQuery.id || "");
        const callbackData = String(callbackQuery.data || "");
        const chatId = callbackQuery?.message?.chat?.id !== void 0 ? String(callbackQuery.message.chat.id) : TELEGRAM_CHAT_ID;
        if (callbackId) {
          await callTelegramApi("answerCallbackQuery", {
            callback_query_id: callbackId,
            text: "Fix started",
            show_alert: false
          });
        }
        if (callbackData.startsWith("fix:")) {
          const fingerprint = callbackData.slice(4).trim();
          await callTelegramApi("sendMessage", {
            chat_id: chatId,
            text: `AI fix analysis started for ${fingerprint}. You will get another message when finished.`
          });
          void (async () => {
            try {
              const { suggestion, usedFallback } = await triggerFixSuggestionForFingerprint(fingerprint);
              await callTelegramApi("sendMessage", {
                chat_id: chatId,
                text: [
                  `Fix analysis completed for ${fingerprint}.`,
                  usedFallback ? "(used limited context \u2014 ensure error_alert_context migration on Supabase)" : "",
                  "",
                  suggestion.formatted
                ].filter(Boolean).join("\n").slice(0, 3900)
              });
            } catch (err) {
              console.error("[alerts] callback fix pipeline failed:", err);
              await callTelegramApi("sendMessage", {
                chat_id: chatId,
                text: `Fix pipeline failed for ${fingerprint}: ${String(err?.message || err).slice(0, 500)}`
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
        stack: parsed.stack || void 0,
        currentUrl: parsed.currentUrl || void 0,
        rawLog: text
      });
      res.json({ success: true, result });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to process telegram webhook" });
    }
  });
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestId = stableHash(
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${req.method}-${req.path}`
    );
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      if (!res.headersSent) res.setHeader("X-Response-Time", `${durationMs}ms`);
      if (req.path.startsWith("/api") && durationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(
          `[perf] \u26A0\uFE0F  SLOW REQUEST  ${req.method} ${req.path} \u2192 ${res.statusCode}  ${durationMs}ms`
        );
      }
      if (res.statusCode < 500 || !req.path.startsWith("/api")) return;
      if (res.locals.errorAlertEmitted) {
        console.log(
          "[alerts] skip middleware API 5xx Telegram (route already called logSystemError)",
          req.method,
          req.path
        );
        return;
      }
      void recordApi5xxAlertForFix(req, res.statusCode, durationMs, requestId);
    });
    next();
  });
  app.use((req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=*, microphone=*, display-capture=*, fullscreen=*");
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Requested-With"
      );
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
  const normalizeRole2 = (r) => String(r || "student").toLowerCase().trim();
  const AUTH_CACHE_TTL_MS = 3e4;
  const authUserCache = /* @__PURE__ */ new Map();
  const getAuthUser = async (req) => {
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return null;
    const cacheKey = stableHash(token);
    const cached = authUserCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { userId: cached.userId, role: cached.role, displayName: cached.displayName };
    }
    const {
      data: { user },
      error
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[getAuthUser] auth.getUser failed:", error?.message || "no user");
      }
      return null;
    }
    const { data: profile } = await supabaseAdmin.from("profiles").select("role, display_name").eq("id", user.id).maybeSingle();
    const result = { userId: user.id, role: normalizeRole2(profile?.role), displayName: profile?.display_name ?? void 0 };
    authUserCache.set(cacheKey, { ...result, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    if (authUserCache.size > 500) {
      const now = Date.now();
      for (const [k, v2] of authUserCache) {
        if (v2.expiresAt < now) authUserCache.delete(k);
        if (authUserCache.size <= 400) break;
      }
    }
    return result;
  };
  const assertSessionHost = async (req, res, sessionId) => {
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
  const assertAuthenticated = async (req, res) => {
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
  const COURSE_MUTABLE_KEYS = /* @__PURE__ */ new Set([
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
    "updated_at"
  ]);
  const sanitizeCoursePayload = (payload) => {
    const sanitized = {};
    if (!payload || typeof payload !== "object") return sanitized;
    Object.keys(payload).forEach((key) => {
      if (COURSE_MUTABLE_KEYS.has(key) && payload[key] !== void 0) {
        sanitized[key] = payload[key];
      }
    });
    return sanitized;
  };
  const normalizeTeacherId = (value) => typeof value === "string" ? value.trim() : "";
  const toFiniteNumber = (value, fallback = 0) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const ADMIN_PROFILE_MUTABLE_KEYS = /* @__PURE__ */ new Set([
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
    "github"
  ]);
  const sanitizeAdminProfilePayload = (payload) => {
    const out = {};
    if (!payload || typeof payload !== "object") return out;
    Object.keys(payload).forEach((key) => {
      if (ADMIN_PROFILE_MUTABLE_KEYS.has(key)) out[key] = payload[key];
    });
    return out;
  };
  const saveAdminProfileWithFallback = async (userId, payload) => {
    const fullUpdate = await supabaseAdmin.from("profiles").update(payload).eq("id", userId);
    if (!fullUpdate.error) return;
    if (!isRecoverableSchemaColumnError(fullUpdate.error)) throw fullUpdate.error;
    const midPayload = Object.fromEntries(
      Object.entries(payload).filter(
        ([key]) => ["display_name", "email", "phone", "location", "website", "bio", "avatar_url"].includes(key)
      )
    );
    if (Object.keys(midPayload).length) {
      const midUpdate = await supabaseAdmin.from("profiles").update(midPayload).eq("id", userId);
      if (!midUpdate.error) return;
      if (!isRecoverableSchemaColumnError(midUpdate.error)) throw midUpdate.error;
    }
    const minPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => ["display_name", "email", "avatar_url"].includes(key))
    );
    if (!Object.keys(minPayload).length) throw fullUpdate.error;
    const minUpdate = await supabaseAdmin.from("profiles").update(minPayload).eq("id", userId);
    if (minUpdate.error) throw minUpdate.error;
  };
  const toAttemptPercent = (scoreValue, totalPointsValue) => {
    const score = toFiniteNumber(scoreValue, 0);
    const totalPoints = toFiniteNumber(totalPointsValue, 0);
    if (totalPoints > 0) return clamp(Math.round(score / totalPoints * 100), 0, 100);
    if (score >= 0 && score <= 1) return clamp(Math.round(score * 100), 0, 100);
    return clamp(Math.round(score), 0, 100);
  };
  const isAttemptsTableMissing = (error) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && haystack.includes("public.attempts") || error?.code === "42P01" && haystack.includes("attempts") || haystack.includes("could not find the table 'public.attempts'") || haystack.includes("public.attempts") && haystack.includes("schema cache") || haystack.includes("perhaps you meant") && haystack.includes("quiz_attempts");
  };
  const isSessionParticipantsTableMissing = (error) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && haystack.includes("public.session_participants") || error?.code === "42P01" && haystack.includes("session_participants") || haystack.includes("could not find the table 'public.session_participants'");
  };
  const isSessionChatTableMissing = (error) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && haystack.includes("session_chat_messages") || error?.code === "42P01" && haystack.includes("session_chat_messages") || haystack.includes("could not find the table 'public.session_chat_messages'");
  };
  const isSessionReactionsTableMissing = (error) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && haystack.includes("session_reactions") || error?.code === "42P01" && haystack.includes("session_reactions") || haystack.includes("could not find the table 'public.session_reactions'");
  };
  let _notifColsKnown = false;
  let _notifHasTitle = true;
  let _notifHasRead = true;
  const notifInsert = async (rows) => {
    const arr = Array.isArray(rows) ? rows : [rows];
    const strip = (r) => {
      const out = { ...r };
      if (!_notifHasTitle) delete out.title;
      if (!_notifHasRead) delete out.read;
      return out;
    };
    const attempt = async () => supabaseAdmin.from("notifications").insert(arr.map(strip));
    let { error } = await attempt();
    if (!error) {
      _notifColsKnown = true;
      return;
    }
    const hay = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    const missingTitle = hay.includes("'title'") || hay.includes('"title"');
    const missingRead = hay.includes("'read'") || hay.includes('"read"');
    if ((missingTitle || missingRead) && !_notifColsKnown) {
      if (missingTitle) _notifHasTitle = false;
      if (missingRead) _notifHasRead = false;
      _notifColsKnown = false;
      const retry = await attempt();
      if (retry.error) console.warn("[notify] insert failed (retry):", retry.error.message);
    } else {
      console.warn("[notify] insert failed:", error.message);
    }
  };
  const isClassesTableMissing = (error) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && haystack.includes("public.classes") || error?.code === "42P01" && haystack.includes("classes") || haystack.includes("could not find the table 'public.classes'");
  };
  const normalizeAttempts = (rows, passingScoreByQuiz = {}) => {
    return (rows || []).map((row) => {
      const rawScore = toFiniteNumber(row?.score, 0);
      const totalPointsRaw = toFiniteNumber(row?.total_points, 0);
      const totalPoints = totalPointsRaw > 0 ? totalPointsRaw : 100;
      const scorePercent = toAttemptPercent(rawScore, totalPointsRaw);
      const score = totalPointsRaw > 0 ? rawScore : Math.round(scorePercent / 100 * totalPoints);
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
        status: row?.status || (row?.completed_at || row?.created_at ? "completed" : "in_progress"),
        started_at: row?.started_at || row?.created_at || null,
        completed_at: row?.completed_at || row?.created_at || row?.started_at || null,
        created_at: row?.created_at || row?.completed_at || row?.started_at || null
      };
    });
  };
  const isAnyTableMissingError = (error) => {
    if (!error) return false;
    if (error.code === "PGRST205" || error.code === "42P01") return true;
    const hay = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    return hay.includes("does not exist") || hay.includes("schema cache") || hay.includes("could not find the table") || hay.includes("relation") && hay.includes("does not exist");
  };
  const ATTEMPTS_CACHE_TTL_MS = 15e3;
  let attemptsCache = { rows: [], expiresAt: 0 };
  let attemptsInFlight = null;
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
      if (isAnyTableMissingError(legacy.error)) return [];
      throw legacy.error;
    })();
    try {
      return await attemptsInFlight;
    } finally {
      attemptsInFlight = null;
    }
  };
  const fetchFilteredAttemptRows = async (opts = {}) => {
    const quizArr = opts.quizIds ? [...opts.quizIds].filter(Boolean) : [];
    const studentArr = opts.studentIds ? [...opts.studentIds].filter(Boolean) : [];
    if (quizArr.length === 0 && studentArr.length === 0) {
      return fetchAllAttemptRows();
    }
    const startedAt = Date.now();
    const buildQuery = (table) => {
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
  const isRecoverableSchemaColumnError = (error) => {
    if (!error) return false;
    if (error.code === "42703" || error.code === 42703) return true;
    if (error.code === "PGRST204") return true;
    const hay = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
    if (hay.includes("does not exist") && hay.includes("column")) return true;
    if (hay.includes("schema cache") && hay.includes("column")) return true;
    return hay.includes("could not find") && hay.includes("column");
  };
  const fetchCertificatesSelectWithFallback = async (selects) => {
    for (const sel of selects) {
      const res = await supabaseAdmin.from("certificates").select(sel);
      if (!res.error) return res.data || [];
      if (!isRecoverableSchemaColumnError(res.error)) throw res.error;
    }
    return [];
  };
  const loadQuizzesRowsForAnalytics = async () => {
    const selects = [
      "id, title, created_at",
      "id, created_at",
      "id",
      "*"
    ];
    for (const sel of selects) {
      const res = await supabaseAdmin.from("quizzes").select(sel);
      if (!res.error) return res.data || [];
      if (!isRecoverableSchemaColumnError(res.error)) throw res.error;
    }
    return [];
  };
  const loadCertificateRowsForReports = async () => {
    const rows = await fetchCertificatesSelectWithFallback([
      "student_id, course_id, status",
      "student_id, course_id",
      "student_id, status",
      "course_id, status",
      "student_id",
      "course_id",
      "*"
    ]);
    return rows.map((c) => ({
      student_id: c.student_id != null ? String(c.student_id) : null,
      course_id: c.course_id != null ? String(c.course_id) : null,
      status: c.status != null && String(c.status) !== "" ? String(c.status) : "issued"
    }));
  };
  const getTeacherIdCandidates = async (teacherId) => {
    const candidates = /* @__PURE__ */ new Set();
    if (teacherId) candidates.add(teacherId);
    const { data: teacherRows, error: teacherLookupError } = await supabaseAdmin.from("teachers").select("id, user_id").or(`id.eq.${teacherId},user_id.eq.${teacherId}`).limit(20);
    if (teacherLookupError) throw teacherLookupError;
    (teacherRows || []).forEach((row) => {
      if (row?.id) candidates.add(String(row.id));
      if (row?.user_id) candidates.add(String(row.user_id));
    });
    return [...candidates];
  };
  const fetchTeacherCourseRows = async (scopedIds, includeStudentIds = false) => {
    const buildQ = (filterByTeacher, withStudentIds) => {
      const sel = withStudentIds ? "id,title,student_ids" : "id,title";
      let q = supabaseAdmin.from("courses").select(sel);
      if (filterByTeacher && scopedIds.length > 0) q = q.in("teacher_id", scopedIds);
      return q;
    };
    const attempts = [
      buildQ(true, includeStudentIds),
      buildQ(true, false),
      buildQ(false, includeStudentIds),
      buildQ(false, false)
    ];
    for (const q of attempts) {
      const { data, error } = await q;
      if (!error) return data || [];
      if (!isRecoverableSchemaColumnError(error)) throw error;
    }
    return [];
  };
  const missingQuizzesTeacherIdColumn = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    const low = hay.toLowerCase();
    if (error?.code === "PGRST204" && low.includes("teacher_id")) return true;
    if (/quizzes\.?teacher_id/i.test(hay) && /does not exist|42703|undefined column/i.test(hay)) return true;
    return false;
  };
  const missingQuizzesPublishedColumn = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    const low = hay.toLowerCase();
    if (error?.code === "PGRST204" && low.includes("published")) return true;
    if (/published/i.test(hay) && /schema cache|could not find|does not exist|42703|undefined column/i.test(low)) {
      return true;
    }
    if (/published/i.test(hay) && /can only be updated to default/i.test(low)) {
      return true;
    }
    return false;
  };
  const missingQuizzesSettingsColumn = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    const low = hay.toLowerCase();
    if (!low.includes("settings") || !/quiz/i.test(low)) return false;
    if (error?.code === "PGRST204" || error?.code === "42703") return true;
    if (/schema cache|could not find|does not exist|undefined column|column/i.test(low)) return true;
    return false;
  };
  const insertCompatibleQuizAdmin = async (basePayload, sessionUserId) => {
    let payload = { ...basePayload };
    if (payload.teacher_id === void 0 || payload.teacher_id === null) {
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
      if ("settings" in payload && /settings/i.test(String(err?.message || ""))) {
        const { settings: _s, ...rest } = payload;
        void _s;
        payload = rest;
        continue;
      }
      const errMsg = String(err?.message || err?.details || "");
      const colMatch = errMsg.match(/column[^''"]*[''"]([\w]+)[''"]|[''"]([\w]+)[''"][^''"]* column|Could not find[^''"]+'([\w]+)'/i);
      if (colMatch) {
        const missingCol = colMatch[1] || colMatch[2] || colMatch[3];
        if (missingCol && missingCol in payload) {
          const { [missingCol]: _dropped, ...rest } = payload;
          void _dropped;
          payload = rest;
          continue;
        }
      }
      return { data: null, error: err };
    }
    return { data: null, error: new Error("Quiz insert: max compatibility retries") };
  };
  const loadTeacherQuizzesForScopedIds = async (scopedIds, sessionUserId) => {
    const sortRows = (rows) => {
      rows.sort((a, b) => {
        const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      return rows;
    };
    const tryByCourseIds = async () => {
      const { data: crs, error: ce } = await supabaseAdmin.from("courses").select("id").in("teacher_id", scopedIds);
      if (ce) {
        const msg = `${ce.message || ""} ${ce.details || ""}`.toLowerCase();
        if (ce.code === "PGRST204" || /teacher_id/.test(msg) || /does not exist|42703|undefined column/.test(msg)) {
          const fallbackQ = await supabaseAdmin.from("quizzes").select("*").order("created_at", { ascending: false }).limit(500);
          return sortRows(fallbackQ.data || []);
        }
        throw ce;
      }
      const courseIds = (crs || []).map((c) => c?.id).filter(Boolean);
      if (courseIds.length === 0) return [];
      let q2 = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds).order("created_at", { ascending: false });
      if (q2.error) {
        q2 = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
      }
      if (q2.error) throw q2.error;
      return sortRows(q2.data || []);
    };
    let { data, error } = await supabaseAdmin.from("quizzes").select("*").in("teacher_id", scopedIds).order("created_at", { ascending: false });
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
  const CONFIG_SECTIONS = /* @__PURE__ */ new Set(["settings", "branding", "domain", "roles"]);
  const CONFIG_CACHE_TTL_MS = 3e4;
  const configSectionCache = /* @__PURE__ */ new Map();
  const getConfigSection = async (section) => {
    const cached = configSectionCache.get(section);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }
    const res = await supabaseAdmin.from("platform_config").select("section, value, updated_at").eq("section", section).maybeSingle();
    if (res.error) throw res.error;
    const value = res.data?.value ?? null;
    configSectionCache.set(section, { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return value;
  };
  const upsertConfigSection = async (section, value) => {
    configSectionCache.delete(section);
    const res = await supabaseAdmin.from("platform_config").upsert({ section, value, updated_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "section" }).select("section, value, updated_at").maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) {
      const readRes = await supabaseAdmin.from("platform_config").select("section, value, updated_at").eq("section", section).maybeSingle();
      if (readRes.error) throw readRes.error;
      if (readRes.data?.value !== void 0) {
        configSectionCache.set(section, { value: readRes.data.value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
      }
      return readRes.data;
    }
    configSectionCache.set(section, { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return res.data;
  };
  const isPlatformConfigMissing = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return error?.code === "42P01" || error?.code === "PGRST205" && hay.includes("platform_config");
  };
  const isNotificationEnabled = async (settingsKey) => {
    const allTrue = { student: true, teacher: true, admin: true };
    const allFalse = { student: false, teacher: false, admin: false };
    try {
      const settings = await getConfigSection("settings");
      const notifs = settings?.notifications;
      if (!notifs || typeof notifs !== "object") return allTrue;
      const v2 = notifs[settingsKey];
      if (v2 === void 0) return allTrue;
      if (v2 && typeof v2 === "object" && "student" in v2) {
        return {
          student: Boolean(v2.student),
          teacher: Boolean(v2.teacher),
          admin: Boolean(v2.admin)
        };
      }
      const b = Boolean(v2);
      return { student: b, teacher: b, admin: b };
    } catch {
      return allFalse;
    }
  };
  const dispatchNotifyEvent = async (event, ctx) => {
    await notifyEvent(supabaseAdmin, { isEventEnabled: isNotificationEnabled }, event, ctx);
  };
  const WEEK_MS = 7 * 24 * 60 * 60 * 1e3;
  const safeCountSince = async (table, column, sinceIso) => {
    try {
      const { count, error } = await supabaseAdmin.from(table).select("id", { count: "exact", head: true }).gte(column, sinceIso);
      if (error) return void 0;
      return typeof count === "number" ? count : void 0;
    } catch {
      return void 0;
    }
  };
  const safeSumSince = async (table, column, sinceIso, sumField, currencyField) => {
    try {
      const select = currencyField ? `${sumField}, ${currencyField}` : sumField;
      const { data, error } = await supabaseAdmin.from(table).select(select).gte(column, sinceIso);
      if (error || !Array.isArray(data)) return void 0;
      let sum = 0;
      let currency;
      for (const row of data) {
        const v2 = Number(row?.[sumField]);
        if (Number.isFinite(v2)) sum += v2;
        if (!currency && currencyField && typeof row?.[currencyField] === "string") {
          currency = row[currencyField];
        }
      }
      return { count: data.length, sum, currency };
    } catch {
      return void 0;
    }
  };
  const runWeeklyReportIfDue = async () => {
    try {
      const enabled = await isNotificationEnabled("weekly_report");
      if (!enabled) return;
      const { data: lastRows } = await supabaseAdmin.from("notifications").select("created_at").eq("title", "Weekly summary report").order("created_at", { ascending: false }).limit(1);
      const lastAt = lastRows && lastRows[0]?.created_at ? Date.parse(lastRows[0].created_at) : 0;
      if (lastAt && Date.now() - lastAt < WEEK_MS) return;
      const sinceIso = new Date(Date.now() - WEEK_MS).toISOString();
      const [enrollments, quizAttempts, certificates, payments] = await Promise.all([
        safeCountSince("course_enrollments", "created_at", sinceIso),
        safeCountSince("attempts", "submitted_at", sinceIso),
        safeCountSince("certificates", "created_at", sinceIso),
        safeSumSince("payments", "created_at", sinceIso, "amount", "currency")
      ]);
      await dispatchNotifyEvent("weeklyReport", {
        reportPeriodStart: sinceIso,
        reportPeriodEnd: (/* @__PURE__ */ new Date()).toISOString(),
        reportTotals: {
          enrollments,
          quizAttempts,
          certificatesIssued: certificates,
          payments: payments?.count,
          revenue: payments?.sum,
          currency: payments?.currency
        }
      });
    } catch (err) {
      console.warn("[notify:weeklyReport] check failed:", err?.message || err);
    }
  };
  setTimeout(() => {
    void runWeeklyReportIfDue();
  }, 3e4);
  setInterval(() => {
    void runWeeklyReportIfDue();
  }, 6 * 60 * 60 * 1e3);
  const autoEndExpiredLiveSessions = async () => {
    try {
      const { data: liveSessions, error } = await supabaseAdmin.from("live_sessions").select("id, started_at, duration_minutes").eq("status", "live").not("started_at", "is", null);
      if (error || !liveSessions || liveSessions.length === 0) return;
      const now = Date.now();
      const expiredIds = [];
      for (const s of liveSessions) {
        const startMs = new Date(s.started_at).getTime();
        const endMs = startMs + (s.duration_minutes || 60) * 60 * 1e3;
        if (now > endMs + 2 * 60 * 1e3) {
          expiredIds.push(s.id);
        }
      }
      if (expiredIds.length === 0) return;
      const { error: updateErr } = await supabaseAdmin.from("live_sessions").update({ status: "ended", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).in("id", expiredIds);
      if (updateErr) {
        console.warn("[live-sessions] auto-end update error:", updateErr.message);
      } else {
        console.log(`[live-sessions] Auto-ended ${expiredIds.length} expired session(s): ${expiredIds.join(", ")}`);
      }
    } catch (e) {
      console.warn("[live-sessions] autoEndExpiredLiveSessions error:", e);
    }
  };
  setTimeout(() => {
    void autoEndExpiredLiveSessions();
  }, 6e4);
  setInterval(() => {
    void autoEndExpiredLiveSessions();
  }, 5 * 60 * 1e3);
  const extractPublicFeatureFlags = (settingsValue) => {
    const features = settingsValue?.features || {};
    return {
      communityEnabled: typeof features.communityEnabled === "boolean" ? features.communityEnabled : true,
      liveSessionsEnabled: typeof features.liveSessionsEnabled === "boolean" ? features.liveSessionsEnabled : true,
      announcementsEnabled: typeof features.announcementsEnabled === "boolean" ? features.announcementsEnabled : true,
      paymentsEnabled: typeof features.paymentsEnabled === "boolean" ? features.paymentsEnabled : true
    };
  };
  let _cachedHealth = {
    status: "unknown",
    error: null,
    checkedAt: 0
  };
  const _refreshHealthCache = async () => {
    try {
      const { error } = await supabaseAdmin.from("profiles").select("count").limit(1);
      _cachedHealth = { status: error ? "error" : "connected", error: error?.message ?? null, checkedAt: Date.now() };
    } catch (err) {
      _cachedHealth = { status: "failed", error: err.message, checkedAt: Date.now() };
    }
  };
  void _refreshHealthCache();
  setInterval(() => {
    void _refreshHealthCache();
  }, 3e4);
  app.get("/api/health", (_req, res) => {
    const checkUrl = (key) => {
      const raw = (process.env[key] ?? "").trim();
      if (!raw) return { status: "missing", hint: `Add ${key} to environment variables` };
      if (!raw.startsWith("https://") && !raw.startsWith("http://"))
        return { status: "invalid", hint: `${key} must start with https:// (got: ${raw.slice(0, 20)}...)` };
      return { status: "set" };
    };
    const checkSecret = (key, hint) => {
      const raw = (process.env[key] ?? "").trim();
      if (!raw) return { status: "missing", hint: hint ?? `Add ${key} to environment variables` };
      return { status: "set" };
    };
    const vars = {
      core: {
        VITE_SUPABASE_URL: checkUrl("VITE_SUPABASE_URL"),
        VITE_SUPABASE_ANON_KEY: checkSecret("VITE_SUPABASE_ANON_KEY", "Frontend Supabase key \u2014 required for login"),
        SUPABASE_SERVICE_ROLE_KEY: checkSecret("SUPABASE_SERVICE_ROLE_KEY", "Backend-only service role key")
      },
      ai: {
        GEMINI_API_KEY: (() => {
          const replit = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "").trim();
          const direct = (process.env.GEMINI_API_KEY ?? "").trim();
          if (replit || direct) return { status: "set" };
          return { status: "missing", hint: "Set GEMINI_API_KEY for AI quiz/content features" };
        })()
      },
      email: {
        BREVO_API_KEY: checkSecret("BREVO_API_KEY", "2FA verification emails require this"),
        BREVO_SENDER_EMAIL: checkSecret("BREVO_SENDER_EMAIL", "Must match a verified sender in Brevo"),
        BREVO_SENDER_NAME: checkSecret("BREVO_SENDER_NAME", "Display name shown in email inbox")
      },
      alerts: {
        TELEGRAM_BOT_TOKEN: checkSecret("TELEGRAM_BOT_TOKEN", "Optional \u2014 enables error alerts via Telegram"),
        TELEGRAM_CHAT_ID: checkSecret("TELEGRAM_CHAT_ID", "Optional \u2014 Telegram chat to receive alerts")
      },
      database: {
        DATABASE_URL: checkSecret("DATABASE_URL", "Optional \u2014 direct pg pool for migrations/raw SQL")
      }
    };
    const allVars = Object.values(vars).flatMap((g2) => Object.values(g2));
    const missingCritical = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => vars.core[k].status !== "set");
    const invalidCount = allVars.filter((v2) => v2.status === "invalid").length;
    const missingCount = allVars.filter((v2) => v2.status === "missing").length;
    const overallStatus = missingCritical.length > 0 || invalidCount > 0 ? "error" : missingCount > 0 ? "degraded" : "ok";
    const supabaseUrlRaw = (process.env.VITE_SUPABASE_URL ?? "").trim();
    res.status(overallStatus === "error" ? 503 : 200).json({
      status: overallStatus,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      node: process.version,
      env: process.env.NODE_ENV ?? "development",
      summary: {
        total: allVars.length,
        set: allVars.filter((v2) => v2.status === "set").length,
        missing: missingCount,
        invalid: invalidCount
      },
      vars,
      supabase: {
        urlPrefix: supabaseUrlRaw ? supabaseUrlRaw.replace(/^(https?:\/\/[^.]+).*/, "$1") + "\u2026" : null,
        connectivity: _cachedHealth.status,
        error: _cachedHealth.error,
        cachedAgoMs: _cachedHealth.checkedAt ? Date.now() - _cachedHealth.checkedAt : null
      }
    });
  });
  app.get("/api/platform/features", async (_req, res) => {
    try {
      const settings = await getConfigSection("settings");
      res.json({ success: true, features: extractPublicFeatureFlags(settings) });
    } catch (e) {
      if (isPlatformConfigMissing(e)) {
        return res.json({
          success: true,
          features: extractPublicFeatureFlags(null)
        });
      }
      res.status(500).json({ error: e?.message || "Failed to load feature flags" });
    }
  });
  app.get("/api/platform/branding", async (_req, res) => {
    const fallback = {
      success: true,
      logoUrl: null,
      faviconUrl: null,
      schoolName: "QuizMaster",
      colors: null,
      typography: null,
      copy: null,
      darkMode: false
    };
    try {
      const [branding, settings] = await Promise.all([
        getConfigSection("branding").catch(() => null),
        getConfigSection("settings").catch(() => null)
      ]);
      const b = branding || {};
      const s = settings || {};
      const schoolName = typeof s?.general?.school_name === "string" && s.general.school_name.trim() || typeof b?.schoolName === "string" && b.schoolName.trim() || "QuizMaster";
      res.json({
        success: true,
        logoUrl: typeof b.logoUrl === "string" ? b.logoUrl : null,
        faviconUrl: typeof b.faviconUrl === "string" ? b.faviconUrl : null,
        logoText: typeof b.logoText === "string" ? b.logoText.trim().toUpperCase() : null,
        schoolName,
        colors: b.colors && typeof b.colors === "object" ? b.colors : null,
        typography: b.typography && typeof b.typography === "object" ? b.typography : null,
        copy: b.copy && typeof b.copy === "object" ? b.copy : null,
        darkMode: Boolean(b.darkMode)
      });
    } catch (e) {
      if (isPlatformConfigMissing(e)) return res.json(fallback);
      res.status(500).json({ error: e?.message || "Failed to load branding" });
    }
  });
  app.get("/api/platform/runtime", async (_req, res) => {
    try {
      const settings = await getConfigSection("settings");
      const features = extractPublicFeatureFlags(settings);
      const maintenanceMode = Boolean(
        settings && typeof settings === "object" && settings.advanced && typeof settings.advanced === "object" && settings.advanced.maintenance
      );
      const schoolName = settings && typeof settings === "object" && settings.general && typeof settings.general === "object" && typeof settings.general.school_name === "string" ? settings.general.school_name : "QuizMaster";
      res.json({
        success: true,
        features,
        maintenanceMode,
        schoolName
      });
    } catch (e) {
      if (isPlatformConfigMissing(e)) {
        return res.json({
          success: true,
          features: extractPublicFeatureFlags(null),
          maintenanceMode: false,
          schoolName: "QuizMaster"
        });
      }
      res.status(500).json({ error: e?.message || "Failed to load platform runtime config" });
    }
  });
  app.get("/api/platform/init", async (_req, res) => {
    try {
      const [settings, branding] = await Promise.all([
        getConfigSection("settings").catch(() => null),
        getConfigSection("branding").catch(() => null)
      ]);
      const s = settings || {};
      const b = branding || {};
      const features = extractPublicFeatureFlags(settings);
      const maintenanceMode = Boolean(s?.advanced?.maintenance);
      const schoolName = typeof s?.general?.school_name === "string" && s.general.school_name.trim() || typeof b?.schoolName === "string" && b.schoolName.trim() || "QuizMaster";
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
        darkMode: Boolean(b.darkMode)
      });
    } catch (e) {
      if (isPlatformConfigMissing(e)) {
        res.set("Cache-Control", "public, max-age=60");
        return res.json({
          success: true,
          features: extractPublicFeatureFlags(null),
          maintenanceMode: false,
          schoolName: "QuizMaster",
          logoUrl: null,
          faviconUrl: null,
          logoText: null,
          colors: null,
          typography: null,
          copy: null,
          darkMode: false
        });
      }
      res.status(500).json({ error: e?.message || "Failed to load platform config" });
    }
  });
  const twoFactorCodes = /* @__PURE__ */ new Map();
  const TWOFA_TTL_MS = 5 * 60 * 1e3;
  const TWOFA_MAX_ATTEMPTS = 5;
  const twoFaVerifiedUsers = /* @__PURE__ */ new Map();
  const TWOFA_SESSION_TTL_MS = 12 * 60 * 60 * 1e3;
  const jwtIatMs = (token) => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return 0;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return (payload.iat || 0) * 1e3;
    } catch {
      return 0;
    }
  };
  const isTwoFactorRequiredForRole = async (_role) => false;
  app.get("/api/auth/2fa/required", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      const required = await isTwoFactorRequiredForRole(caller.role);
      if (!required) return res.json({ success: true, required: false });
      const bearerToken = (req.headers["authorization"] || "").replace(/^Bearer /, "");
      const sessionStartMs = jwtIatMs(bearerToken);
      const cached = twoFaVerifiedUsers.get(caller.userId);
      if (cached && cached.expiry > Date.now() && cached.verifiedAt >= sessionStartMs) {
        return res.json({ success: true, required: false });
      }
      if (cached !== void 0) twoFaVerifiedUsers.delete(caller.userId);
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(caller.userId);
        const meta = authData?.user?.user_metadata || {};
        const verifiedAt = typeof meta.twofa_verified_at === "number" ? meta.twofa_verified_at : 0;
        if (verifiedAt && verifiedAt >= sessionStartMs && Date.now() - verifiedAt < TWOFA_SESSION_TTL_MS) {
          twoFaVerifiedUsers.set(caller.userId, { expiry: verifiedAt + TWOFA_SESSION_TTL_MS, verifiedAt });
          return res.json({ success: true, required: false });
        }
      } catch {
      }
      res.json({ success: true, required: true });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to check 2FA requirement" });
    }
  });
  app.post("/api/auth/2fa/challenge", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      const required = await isTwoFactorRequiredForRole(caller.role);
      if (!required) return res.json({ success: true, required: false });
      const code = String(Math.floor(1e5 + Math.random() * 9e5));
      twoFactorCodes.set(caller.userId, {
        code,
        expiresAt: Date.now() + TWOFA_TTL_MS,
        attempts: 0
      });
      let email = "";
      let displayName = "";
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(caller.userId);
        email = data?.user?.email || "";
        const meta = data?.user?.user_metadata || {};
        displayName = String(meta.display_name || meta.full_name || "").trim();
      } catch {
      }
      twoFaVerifiedUsers.delete(caller.userId);
      try {
        await supabaseAdmin.auth.admin.updateUserById(caller.userId, {
          user_metadata: { twofa_verified_at: null }
        });
      } catch {
      }
      const maskedEmail = email ? email.replace(/(.{1,2})([^@]*)(@.*)/, (_m, a, b, c) => `${a}${"*".repeat(Math.max(b.length, 3))}${c}`) : "your email";
      console.log(`[2FA] code for ${email || caller.userId}: ${code}`);
      res.json({
        success: true,
        required: true,
        maskedEmail,
        delivered: false,
        devCode: code
      });
    } catch (e) {
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
        return res.status(400).json({ error: "No active code \u2014 please request a new one" });
      }
      if (entry.expiresAt < Date.now()) {
        twoFactorCodes.delete(caller.userId);
        return res.status(400).json({ error: "Code expired \u2014 please request a new one" });
      }
      if (entry.attempts >= TWOFA_MAX_ATTEMPTS) {
        twoFactorCodes.delete(caller.userId);
        return res.status(429).json({ error: "Too many attempts \u2014 please request a new code" });
      }
      entry.attempts += 1;
      if (entry.code !== code) {
        const remaining = TWOFA_MAX_ATTEMPTS - entry.attempts;
        return res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
      }
      twoFactorCodes.delete(caller.userId);
      const verifiedAt = Date.now();
      twoFaVerifiedUsers.set(caller.userId, { expiry: verifiedAt + TWOFA_SESSION_TTL_MS, verifiedAt });
      try {
        await supabaseAdmin.auth.admin.updateUserById(caller.userId, {
          user_metadata: { twofa_verified_at: verifiedAt }
        });
      } catch (metaErr) {
        console.warn("[2FA] Could not persist verified_at to user metadata:", metaErr?.message);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to verify 2FA code" });
    }
  });
  app.get("/api/teacher/permissions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const roles = await getConfigSection("roles");
      const perms = roles && typeof roles === "object" && roles.perms && typeof roles.perms === "object" && roles.perms[caller.role] && typeof roles.perms[caller.role] === "object" ? roles.perms[caller.role] : {};
      res.json({
        success: true,
        role: caller.role,
        permissions: perms
      });
    } catch (e) {
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
    } catch (e) {
      if (isPlatformConfigMissing(e)) {
        return res.status(400).json({
          error: "platform_config table is missing. Please run the updated database_setup.sql script."
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
      if (value === void 0) {
        return res.status(400).json({ error: "value is required" });
      }
      let prevMaintenance = null;
      let nextMaintenance = null;
      if (section === "settings") {
        try {
          const prev = await getConfigSection("settings");
          prevMaintenance = Boolean(prev?.advanced?.maintenance);
        } catch {
        }
        if (value && typeof value === "object" && value.advanced && typeof value.advanced === "object") {
          nextMaintenance = Boolean(value.advanced.maintenance);
        }
      }
      const data = await upsertConfigSection(section, value);
      if (section === "settings" && prevMaintenance !== null && nextMaintenance !== null && prevMaintenance !== nextMaintenance) {
        void dispatchNotifyEvent("maintenanceAlert", {
          maintenanceEnabled: nextMaintenance
        });
      }
      res.json({ success: true, config: data });
    } catch (e) {
      if (isPlatformConfigMissing(e)) {
        return res.status(400).json({
          error: "platform_config table is missing. Please run the updated database_setup.sql script."
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
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", caller.userId).maybeSingle();
      if (error) throw error;
      res.json({ success: true, profile: data || null });
    } catch (e) {
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
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", caller.userId).maybeSingle();
      if (error) throw error;
      res.json({ success: true, profile: data || null });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to save profile" });
    }
  });
  app.get("/api/admin/students", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const page = Math.max(0, parseInt(String(req.query.page ?? "0")) || 0);
      const limit = Math.min(200, Math.max(10, parseInt(String(req.query.limit ?? "100")) || 100));
      const rangeStart = page * limit;
      const rangeEnd = rangeStart + limit - 1;
      const [profilesRes, teachersRes, coursesRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*", { count: "exact" }).eq("role", "student").range(rangeStart, rangeEnd),
        supabaseAdmin.from("teachers").select("user_id, first_name, last_name"),
        supabaseAdmin.from("courses").select("id, student_ids, teacher_id")
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (teachersRes.error) throw teachersRes.error;
      const teacherMap = {};
      const teacherOptions = [];
      (teachersRes.data || []).forEach((t) => {
        const name = `${t.first_name} ${t.last_name}`.trim();
        teacherMap[t.user_id] = name;
        teacherOptions.push({ id: t.user_id, name });
      });
      const enrolledCountMap = {};
      if (coursesRes.error) {
        if (!isMissingCoursesStudentIdsError(coursesRes.error)) throw coursesRes.error;
        const { data: classRows, error: classesErr } = await supabaseAdmin.from("classes").select("course_id, student_ids");
        if (classesErr) throw classesErr;
        const perStudent = /* @__PURE__ */ new Map();
        (classRows || []).forEach((cl) => {
          const cid = cl.course_id != null ? String(cl.course_id) : "";
          (Array.isArray(cl.student_ids) ? cl.student_ids : []).forEach((sid) => {
            const s = String(sid || "");
            if (!s || !cid) return;
            if (!perStudent.has(s)) perStudent.set(s, /* @__PURE__ */ new Set());
            perStudent.get(s).add(cid);
          });
        });
        perStudent.forEach((set, sid) => {
          enrolledCountMap[sid] = set.size;
        });
      } else {
        (coursesRes.data || []).forEach((c) => {
          (c.student_ids || []).forEach((sid) => {
            enrolledCountMap[sid] = (enrolledCountMap[sid] || 0) + 1;
          });
        });
      }
      const students = (profilesRes.data || []).map((p) => ({
        uid: p.id,
        email: p.email,
        displayName: p.display_name,
        role: p.role,
        teacherId: p.teacher_id,
        status: p.status || "active",
        createdAt: p.created_at,
        teacherName: p.teacher_id ? teacherMap[p.teacher_id] || "\u2014" : "\u2014",
        enrolledCourseCount: enrolledCountMap[p.id] || 0
      }));
      res.json({ success: true, students, teacherOptions, total: profilesRes.count ?? students.length, page, limit });
    } catch (error) {
      console.error("Error fetching students:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/admin/teachers", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });
      const tPage = Math.max(0, parseInt(String(req.query.page ?? "0")) || 0);
      const tLimit = Math.min(200, Math.max(10, parseInt(String(req.query.limit ?? "100")) || 100));
      const tRangeStart = tPage * tLimit;
      const tRangeEnd = tRangeStart + tLimit - 1;
      const [profilesRes, teachersRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*", { count: "exact" }).eq("role", "teacher").range(tRangeStart, tRangeEnd),
        supabaseAdmin.from("teachers").select("id, user_id")
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (teachersRes.error) throw teachersRes.error;
      const teacherIdByUserId = {};
      (teachersRes.data || []).forEach((t) => {
        if (t?.user_id && t?.id) {
          teacherIdByUserId[t.user_id] = t.id;
        }
      });
      const teachers = (profilesRes.data || []).map((p) => ({
        uid: p.id,
        teacherId: teacherIdByUserId[p.id] || null,
        email: p.email,
        displayName: p.display_name,
        role: p.role,
        status: p.status || "active",
        createdAt: p.created_at
      }));
      res.json({ success: true, teachers, total: profilesRes.count ?? teachers.length, page: tPage, limit: tLimit });
    } catch (error) {
      console.error("Error fetching teachers:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/admin/seed", async (req, res) => {
    const adminEmail = "britanicaschool@gmail.com";
    const adminPassword = "Admin123!";
    try {
      const { count } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).then((r) => ({ count: r.count ?? 0 }));
      if (count > 0) {
        const caller = await assertAuthenticated(req, res);
        if (!caller) return;
        if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });
      }
      const { error: tableCheckError } = await supabaseAdmin.from("profiles").select("id").limit(1);
      if (tableCheckError && tableCheckError.code === "PGRST116") {
      } else if (tableCheckError && tableCheckError.message.includes("does not exist")) {
        return res.status(400).send(`
          <h1>Database Table Missing</h1>
          <p>The <b>profiles</b> table does not exist in your Supabase database.</p>
          <p>Please go to your Supabase SQL Editor and run the SQL script provided in the chat to create the tables.</p>
        `);
      }
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { displayName: "Super Admin", role: "admin" }
      });
      let userId = authData.user?.id;
      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find((u) => u.email === adminEmail);
          if (existingUser) {
            userId = existingUser.id;
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              password: adminPassword,
              user_metadata: { displayName: "Super Admin", role: "admin" }
            });
          }
        }
      }
      if (!userId) {
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email: adminEmail,
        display_name: "Super Admin",
        role: "admin",
        status: "active",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (profileError) throw profileError;
      await supabaseAdmin.from("teachers").upsert({
        user_id: userId,
        first_name: "Super",
        last_name: "Admin",
        email: adminEmail,
        specialization: "System Administration",
        status: "active"
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
    } catch (error) {
      console.error("Error seeding admin:", error);
      res.status(500).send(`
        <h1>Seed Failed</h1>
        <p>Error: ${error.message}</p>
        <p>Please check your Supabase URL and Service Role Key in the Secrets menu.</p>
      `);
    }
  });
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
      const { data: nonAdminProfiles } = await supabaseAdmin.from("profiles").select("id").neq("role", "admin");
      const nonAdminIds = (nonAdminProfiles || []).map((p) => p.id);
      const authDeletions = nonAdminIds.map(
        (id) => supabaseAdmin.auth.admin.deleteUser(id).catch(() => null)
      );
      await Promise.all(authDeletions);
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
        "error_alert_context"
      ];
      const errors = [];
      for (const table of tables) {
        try {
          const { error } = await supabaseAdmin.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (error && !error.message.includes("does not exist") && !error.message.includes("relation")) {
            errors.push(`${table}: ${error.message}`);
          }
        } catch {
        }
      }
      await supabaseAdmin.from("profiles").delete().neq("role", "admin");
      console.log(`[clear-database] Cleared by admin ${adminId}. Errors: ${errors.length ? errors.join("; ") : "none"}`);
      return res.json({
        success: true,
        message: "Database cleared. All data deleted except admin accounts.",
        deletedUsers: nonAdminIds.length,
        errors
      });
    } catch (err) {
      console.error("[clear-database] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to clear database" });
    }
  });
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
      const baseSlug = (req.body.title || "course").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = `${baseSlug}-${Date.now()}`;
      const payloadBase = {
        ...sanitizeCoursePayload(req.body),
        slug,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      let createdCourse = null;
      let lastForeignKeyError = null;
      for (const teacherId of teacherIdCandidates) {
        const payload = { ...payloadBase, teacher_id: teacherId };
        const { data, error } = await supabaseAdmin.from("courses").insert(payload).select().single();
        if (!error) {
          createdCourse = data;
          break;
        }
        const isTeacherFkError = error.code === "23503" && typeof error.message === "string" && error.message.includes("courses_teacher_id_fkey");
        if (!isTeacherFkError) {
          throw error;
        }
        lastForeignKeyError = error;
      }
      if (!createdCourse) {
        if (lastForeignKeyError) {
          return res.status(400).json({
            error: "Selected teacher is invalid for courses. Please re-select a teacher and try again."
          });
        }
        throw new Error("Could not create course for the selected teacher.");
      }
      const selectedClassId = typeof req.body?.class_id === "string" ? req.body.class_id.trim() : "";
      if (selectedClassId) {
        const { data: classRow, error: classErr } = await supabaseAdmin.from("classes").select("id, teacher_id, student_ids").eq("id", selectedClassId).maybeSingle();
        if (classErr) throw classErr;
        if (!classRow) {
          return res.status(400).json({ error: "Selected class was not found." });
        }
        const classTeacherId = String(classRow.teacher_id || "");
        if (!teacherIdCandidates.includes(classTeacherId)) {
          return res.status(403).json({ error: "Selected class is not owned by this teacher." });
        }
        const classStudentIds = Array.isArray(classRow.student_ids) ? classRow.student_ids.map((sid) => String(sid)).filter(Boolean) : [];
        const uniqueStudentIds = Array.from(new Set(classStudentIds));
        const { data: updatedCourse, error: visibilityErr } = await supabaseAdmin.from("courses").update({
          student_ids: uniqueStudentIds,
          total_students: uniqueStudentIds.length,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", createdCourse.id).select().single();
        if (visibilityErr) throw visibilityErr;
        createdCourse = updatedCourse || createdCourse;
      }
      res.json({ success: true, course: createdCourse });
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({ error: error.message });
    }
  });
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
        let updatedCourse = null;
        let lastForeignKeyError = null;
        for (const teacherId of teacherIdCandidates) {
          const candidateUpdates = { ...updates, teacher_id: teacherId };
          const { data: data2, error: error2 } = await supabaseAdmin.from("courses").update(candidateUpdates).eq("id", id).select().single();
          if (!error2) {
            updatedCourse = data2;
            break;
          }
          const isTeacherFkError = error2.code === "23503" && typeof error2.message === "string" && error2.message.includes("courses_teacher_id_fkey");
          if (!isTeacherFkError) {
            throw error2;
          }
          lastForeignKeyError = error2;
        }
        if (!updatedCourse) {
          if (lastForeignKeyError) {
            return res.status(400).json({
              error: "Selected teacher is invalid for courses. Please re-select a teacher and try again."
            });
          }
          throw new Error("Could not update course teacher.");
        }
        return res.json({ success: true, course: updatedCourse });
      }
      const { data, error } = await supabaseAdmin.from("courses").update(updates).eq("id", id).select().single();
      if (error) throw error;
      res.json({ success: true, course: data });
    } catch (error) {
      console.error("Error updating course:", error);
      res.status(500).json({ error: error.message });
    }
  });
  const sendUserCredentials = async (opts) => {
    try {
      const settings = await getConfigSection("settings");
      const channels = settings?.notification_channels || {};
      const brandName = settings?.general?.school_name || "QuizMaster";
      const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : settings?.general?.website || "http://localhost:5000";
      const loginUrl = `${baseUrl}/login?email=${encodeURIComponent(opts.email)}&pw=${encodeURIComponent(opts.password)}`;
      const plainText = [
        `P\xEBrsh\xEBndetje ${opts.name},`,
        opts.role === "teacher" ? `Ju jeni ftuar si m\xEBsues n\xEB platform\xEBn ${brandName}.` : `Llogaria juaj si student n\xEB ${brandName} \xEBsht\xEB krijuar me sukses.`,
        ``,
        `Kredencialet tuaja:`,
        `Email: ${opts.email}`,
        `Fjal\xEBkalim: ${opts.password}`,
        `Ky\xE7uni: ${loginUrl}`,
        ``,
        `Ju mir\xEBpresim! \u2014 Ekipi i ${brandName}`
      ].join("\n");
      const results = {};
      if (channels.email_enabled !== false) {
        try {
          if (isEmailConfigured()) {
            const tpl = renderCredentialEmail({ name: opts.name, email: opts.email, password: opts.password, role: opts.role, loginUrl, brandName });
            await sendEmail({ to: opts.email, toName: opts.name, subject: tpl.subject, htmlContent: tpl.htmlContent, textContent: tpl.textContent });
            results.email = "sent";
          } else {
            results.email = "not_configured";
          }
        } catch (e) {
          results.email = `error: ${e.message}`;
        }
      }
      if (channels.viber_enabled && channels.viber_token && opts.phone) {
        try {
          const vRes = await fetch("https://chatapi.viber.com/pa/send_message", {
            method: "POST",
            headers: { "X-Viber-Auth-Token": String(channels.viber_token), "Content-Type": "application/json" },
            body: JSON.stringify({ receiver: opts.phone.replace(/[^0-9]/g, ""), type: "text", text: plainText })
          });
          const vJson = await vRes.json().catch(() => ({}));
          results.viber = vJson.status === 0 ? "sent" : `error: ${vJson.status_message || vRes.status}`;
        } catch (e) {
          results.viber = `error: ${e.message}`;
        }
      }
      if (channels.whatsapp_enabled && channels.whatsapp_token && channels.whatsapp_phone_id && opts.phone) {
        try {
          const waRes = await fetch(`https://graph.facebook.com/v19.0/${channels.whatsapp_phone_id}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${channels.whatsapp_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: opts.phone.replace(/[^0-9]/g, ""),
              type: "text",
              text: { body: plainText }
            })
          });
          const waJson = await waRes.json().catch(() => ({}));
          results.whatsapp = waJson.messages?.[0]?.id ? "sent" : `error: ${JSON.stringify(waJson.error || waJson)}`;
        } catch (e) {
          results.whatsapp = `error: ${e.message}`;
        }
      }
      if (channels.gmail_enabled && channels.gmail_user && channels.gmail_password) {
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.default.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: { user: String(channels.gmail_user), pass: String(channels.gmail_password) }
          });
          const tpl = renderCredentialEmail({ name: opts.name, email: opts.email, password: opts.password, role: opts.role, loginUrl, brandName });
          await transporter.sendMail({
            from: `"${brandName}" <${channels.gmail_user}>`,
            to: opts.email,
            subject: tpl.subject,
            html: tpl.htmlContent,
            text: tpl.textContent
          });
          results.gmail = "sent";
        } catch (e) {
          results.gmail = `error: ${e.message}`;
        }
      }
      console.log(`[credentials] ${opts.role} ${opts.email} \u2192`, JSON.stringify(results));
      return results;
    } catch (e) {
      console.error("[credentials] sendUserCredentials error:", e.message);
      return {};
    }
  };
  app.post("/api/admin/create-teacher", async (req, res) => {
    const { name, email, password, phone, specialization } = req.body;
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: name, role: "teacher" }
      });
      let userId = authData.user?.id;
      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find((u) => u.email === email);
          if (existingUser) {
            userId = existingUser.id;
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: { displayName: name, role: "teacher" }
            });
          }
        }
      }
      if (!userId) {
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email,
        display_name: name,
        role: "teacher",
        status: "active",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (profileError) throw profileError;
      const names = name.split(" ");
      const firstName = names[0];
      const lastName = names.slice(1).join(" ") || "Teacher";
      const teacherPayload = {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email,
        status: "active"
      };
      if (phone) teacherPayload.phone = phone;
      if (specialization) teacherPayload.specialization = specialization;
      const { error: teacherError } = await supabaseAdmin.from("teachers").upsert(teacherPayload);
      if (teacherError) throw teacherError;
      res.json({ success: true, uid: userId });
      void sendUserCredentials({ name, email, password, role: "teacher", phone: phone || void 0 });
    } catch (error) {
      console.error("Error creating teacher:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/admin/reset-all-welcome", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Admin only" });
      let page = 1;
      const resetIds = [];
      while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1e3 });
        if (error) throw error;
        for (const u of data.users) {
          if (u.user_metadata?.role === "student") resetIds.push(u.id);
        }
        if (data.users.length < 1e3) break;
        page++;
      }
      await Promise.all(
        resetIds.map(
          (id) => supabaseAdmin.auth.admin.updateUserById(id, { user_metadata: { welcomed: false } })
        )
      );
      return res.json({ success: true, count: resetIds.length });
    } catch (e) {
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
        user_metadata: { welcomed: false }
      });
      if (error) throw error;
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to reset welcome flag" });
    }
  });
  app.post("/api/admin/create-student", async (req, res) => {
    const {
      name,
      email,
      password,
      teacherId,
      phone,
      dateOfBirth,
      gender,
      preferredLanguage,
      currentLevel,
      notes,
      classId
    } = req.body;
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin" && caller.role !== "teacher") {
        return res.status(403).json({ error: "Forbidden: admin or teacher role required" });
      }
      const resolvedTeacherId = caller.role === "teacher" ? caller.userId : typeof teacherId === "string" ? teacherId.trim() : "";
      if (!resolvedTeacherId) throw new Error("Could not determine teacher identity.");
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: name, role: "student" }
      });
      let userId = authData.user?.id;
      if (!userId) {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (!listError) {
          const existingUser = usersData.users.find((u) => u.email === email);
          if (existingUser) {
            userId = existingUser.id;
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: { displayName: name, role: "student" }
            });
          }
        }
      }
      if (!userId) {
        if (authError) throw authError;
        throw new Error("Could not find or create user in Supabase Auth.");
      }
      const profilePayload = {
        id: userId,
        email,
        display_name: name,
        role: "student",
        teacher_id: resolvedTeacherId,
        status: "active"
      };
      const { error: upsertError } = await supabaseAdmin.from("profiles").upsert(profilePayload, { onConflict: "id" });
      if (!upsertError) {
        await supabaseAdmin.from("profiles").update({ teacher_id: resolvedTeacherId, role: "student", display_name: name, status: "active", email }).eq("id", userId);
      } else {
        throw upsertError;
      }
      const names = name.trim().split(" ");
      const firstName = names[0];
      const lastName = names.slice(1).join(" ") || "";
      const studentPayload = {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email,
        status: "active",
        joined_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (phone) studentPayload.phone = phone;
      if (dateOfBirth) studentPayload.date_of_birth = dateOfBirth;
      if (gender) studentPayload.gender = gender;
      if (preferredLanguage) studentPayload.preferred_language = preferredLanguage;
      if (currentLevel) studentPayload.current_level = currentLevel;
      const { error: studentError } = await supabaseAdmin.from("students").upsert(studentPayload);
      if (studentError) throw studentError;
      const normalizedClassId = typeof classId === "string" ? classId.trim() : "";
      if (normalizedClassId) {
        const teacherIdCandidates = await getTeacherIdCandidates(resolvedTeacherId);
        const scopedTeacherIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [resolvedTeacherId];
        const classSnap = await supabaseAdmin.from("classes").select("id, teacher_id, student_ids, course_id").eq("id", normalizedClassId).maybeSingle();
        if (classSnap.error) throw classSnap.error;
        const cls = classSnap.data;
        if (!cls) throw new Error("Selected class was not found.");
        const classTeacherId = String(cls.teacher_id || "").trim();
        if (classTeacherId && !scopedTeacherIds.includes(classTeacherId)) {
          throw new Error("You cannot assign this student to the selected class.");
        }
        const classStudentIds = [...new Set(
          (Array.isArray(cls.student_ids) ? cls.student_ids : []).map((sid) => String(sid)).filter(Boolean)
        )];
        if (!classStudentIds.includes(userId)) {
          const capacity = cls.capacity != null && cls.capacity !== "" ? Number(cls.capacity) : 30;
          if (classStudentIds.length >= capacity) {
            return res.status(400).json({ error: `This class is full (${classStudentIds.length}/${capacity}). No free spots available.` });
          }
          const nextClassStudentIds = [...classStudentIds, userId];
          const classUpdate = await supabaseAdmin.from("classes").update({ student_ids: nextClassStudentIds }).eq("id", normalizedClassId);
          if (classUpdate.error) throw classUpdate.error;
        }
        const classCourseId = String(cls.course_id || "").trim();
        if (classCourseId) {
          const courseSnap = await supabaseAdmin.from("courses").select("id, student_ids, total_students").eq("id", classCourseId).maybeSingle();
          if (!courseSnap.error && courseSnap.data) {
            const course = courseSnap.data;
            const courseStudentIds = Array.isArray(course.student_ids) ? course.student_ids.map((sid) => String(sid)) : [];
            if (!courseStudentIds.includes(userId)) {
              const nextCourseStudentIds = [.../* @__PURE__ */ new Set([...courseStudentIds, userId])];
              const nextTotalStudents = Math.max(nextCourseStudentIds.length, Number(course.total_students || 0));
              const courseUpdate = await supabaseAdmin.from("courses").update({ student_ids: nextCourseStudentIds, total_students: nextTotalStudents }).eq("id", classCourseId);
              if (courseUpdate.error) throw courseUpdate.error;
            }
          }
        }
      }
      res.json({ success: true, uid: userId });
      void sendUserCredentials({ name, email, password, role: "student", phone: phone || void 0 });
    } catch (error) {
      console.error("Error creating student:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/admin/courses", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });
      const { data, error } = await supabaseAdmin.from("courses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ success: true, courses: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/courses/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Forbidden: admin role required" });
      const { data, error } = await supabaseAdmin.from("courses").select("*").eq("id", req.params.id).single();
      if (error) return res.status(404).json({ error: "Course not found" });
      res.json({ success: true, course: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/courses-list", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("courses").select("id, title").order("title");
      if (error) throw error;
      res.json({ success: true, courses: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/courses", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];
      const { data, error } = await supabaseAdmin.from("courses").select("*").in("teacher_id", scopedIds).order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ success: true, courses: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/courses", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const teacherId = caller.userId;
      const teacherIdCandidates = await getTeacherIdCandidates(teacherId);
      if (teacherIdCandidates.length === 0) {
        return res.status(400).json({ error: "Teacher account not found." });
      }
      const baseSlug = (req.body.title || "course").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = `${baseSlug}-${Date.now()}`;
      const payloadBase = {
        ...sanitizeCoursePayload(req.body),
        slug,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      let createdCourse = null;
      for (const tid of teacherIdCandidates) {
        const { data, error } = await supabaseAdmin.from("courses").insert({ ...payloadBase, teacher_id: tid }).select().single();
        if (!error) {
          createdCourse = data;
          break;
        }
        if (!(error.code === "23503" && typeof error.message === "string" && error.message.includes("courses_teacher_id_fkey"))) {
          throw error;
        }
      }
      if (!createdCourse) {
        return res.status(400).json({ error: "Could not create course. Please try again." });
      }
      const selectedClassId = typeof req.body?.class_id === "string" ? req.body.class_id.trim() : "";
      if (selectedClassId) {
        const { data: classRow } = await supabaseAdmin.from("classes").select("id, student_ids").eq("id", selectedClassId).maybeSingle();
        if (classRow) {
          const studentIds = Array.isArray(classRow.student_ids) ? classRow.student_ids.map((s) => String(s)).filter(Boolean) : [];
          const unique = Array.from(new Set(studentIds));
          const { data: updated } = await supabaseAdmin.from("courses").update({ student_ids: unique, total_students: unique.length, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", createdCourse.id).select().single();
          if (updated) createdCourse = updated;
        }
      }
      res.json({ success: true, course: createdCourse });
    } catch (e) {
      console.error("POST /api/teacher/courses", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/teacher/courses/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { id: courseId } = req.params;
      const gate = await assertTeacherOwnsCourse(caller.userId, courseId);
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this course." });
      const updates = {
        ...sanitizeCoursePayload(req.body),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data, error } = await supabaseAdmin.from("courses").update(updates).eq("id", courseId).select().single();
      if (error) throw error;
      res.json({ success: true, course: data });
    } catch (e) {
      console.error("PATCH /api/teacher/courses/:id", e);
      res.status(500).json({ error: e.message });
    }
  });
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
      let courseRows = [];
      const coursesWithIdsRes = await supabaseAdmin.from("courses").select("id, title, student_ids").in("teacher_id", scopedIds).order("created_at", { ascending: false });
      if (coursesWithIdsRes.error) {
        if (!isMissingCoursesStudentIdsError(coursesWithIdsRes.error)) throw coursesWithIdsRes.error;
        const fallback = await supabaseAdmin.from("courses").select("id, title").in("teacher_id", scopedIds).order("created_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        courseRows = fallback.data || [];
      } else {
        courseRows = coursesWithIdsRes.data || [];
      }
      const coursesData = (courseRows || []).map((c) => ({
        id: String(c.id),
        name: c.title != null && String(c.title).trim() !== "" ? String(c.title) : "Untitled",
        studentIds: Array.isArray(c.student_ids) ? c.student_ids.map((x) => String(x)) : []
      }));
      const courseTitleById = {};
      coursesData.forEach((c) => {
        courseTitleById[c.id] = c.name;
      });
      const enrolledIds = /* @__PURE__ */ new Set();
      coursesData.forEach((c) => {
        c.studentIds.forEach((sid) => {
          if (sid) enrolledIds.add(sid);
        });
      });
      const { data: classRows, error: classesErr } = await supabaseAdmin.from("classes").select("id, name, course_id, student_ids").in("teacher_id", scopedIds);
      if (!classesErr && Array.isArray(classRows) && classRows.length > 0) {
        classRows.forEach((cl) => {
          const cid = cl.course_id != null ? String(cl.course_id) : "";
          const linkedTitle = cid ? courseTitleById[cid] : "";
          const className = typeof cl.name === "string" && cl.name.trim() !== "" ? String(cl.name).trim() : "Class";
          (Array.isArray(cl.student_ids) ? cl.student_ids : []).forEach((sid) => {
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
              row = { id: syntheticId, name: displayName, studentIds: [] };
              coursesData.push(row);
            }
            if (!row.studentIds.includes(s)) row.studentIds.push(s);
          });
        });
      }
      const [linkedRes, enrolledRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").in("teacher_id", scopedIds).eq("role", "student").order("created_at", { ascending: false }),
        enrolledIds.size > 0 ? supabaseAdmin.from("profiles").select("*").in("id", [...enrolledIds]) : Promise.resolve({ data: [], error: null })
      ]);
      if (linkedRes.error) throw linkedRes.error;
      if (enrolledRes.error) throw enrolledRes.error;
      const byId = /* @__PURE__ */ new Map();
      (linkedRes.data || []).forEach((d) => {
        if (d?.id) byId.set(String(d.id), d);
      });
      (enrolledRes.data || []).forEach((d) => {
        if (d?.id && !byId.has(String(d.id))) byId.set(String(d.id), d);
      });
      const coursesByStudent = {};
      coursesData.forEach((c) => {
        c.studentIds.forEach((sid) => {
          if (!coursesByStudent[sid]) coursesByStudent[sid] = [];
          coursesByStudent[sid].push(c.name);
        });
      });
      const merged = [...byId.values()].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      const students = merged.map((d) => ({
        uid: String(d.id),
        email: d.email,
        displayName: d.display_name,
        role: d.role,
        teacherId: d.teacher_id,
        status: d.status || "active",
        createdAt: d.created_at,
        enrolledCourses: coursesByStudent[String(d.id)] || []
      }));
      res.json({ success: true, students, courses: coursesData });
    } catch (e) {
      console.error("GET /api/teacher/students", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/teacher/students/:studentId", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      if (caller.role !== "teacher") return res.status(403).json({ error: "Forbidden: teacher role required" });
      const studentId = String(req.params.studentId || "").trim();
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      const teacherIds = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];
      const { data: student, error: sErr } = await supabaseAdmin.from("profiles").select("id, role, teacher_id").eq("id", studentId).maybeSingle();
      if (sErr) throw sErr;
      if (!student) return res.status(404).json({ error: "Student not found" });
      if (student.role !== "student") return res.status(400).json({ error: "Target user is not a student" });
      if (!student.teacher_id || !scopedIds.includes(String(student.teacher_id))) {
        return res.status(403).json({ error: "Forbidden: student is not linked to your account" });
      }
      const body = req.body || {};
      const update = {};
      if (typeof body.display_name === "string") update.display_name = body.display_name.trim();
      if (typeof body.email === "string") update.email = body.email.trim();
      if (body.status === "active" || body.status === "inactive") update.status = body.status;
      if (Object.keys(update).length === 0) return res.status(400).json({ error: "No valid fields to update" });
      const { data, error } = await supabaseAdmin.from("profiles").update(update).eq("id", studentId).select("id, email, display_name, role, teacher_id, status, created_at").single();
      if (error) throw error;
      res.json({ success: true, student: data });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to update student" });
    }
  });
  app.delete("/api/teacher/students/:studentId", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      if (caller.role !== "teacher") return res.status(403).json({ error: "Forbidden: teacher role required" });
      const studentId = String(req.params.studentId || "").trim();
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      const teacherIds = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];
      const { data: student, error: sErr } = await supabaseAdmin.from("profiles").select("id, role, teacher_id").eq("id", studentId).maybeSingle();
      if (sErr) throw sErr;
      if (!student) return res.status(404).json({ error: "Student not found" });
      if (student.role !== "student") return res.status(400).json({ error: "Target user is not a student" });
      if (!student.teacher_id || !scopedIds.includes(String(student.teacher_id))) {
        return res.status(403).json({ error: "Forbidden: student is not linked to your account" });
      }
      const { error } = await supabaseAdmin.from("profiles").delete().eq("id", studentId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to delete student" });
    }
  });
  app.get("/api/teacher/peer-teachers", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { data, error } = await supabaseAdmin.from("profiles").select("id, display_name, email, status").eq("role", "teacher").neq("id", caller.userId).eq("status", "active").order("display_name", { ascending: true });
      if (error) throw error;
      return res.json({ teachers: data ?? [] });
    } catch (e) {
      console.error("GET /api/teacher/peer-teachers", e);
      return res.status(500).json({ error: e?.message || "Failed to load teachers" });
    }
  });
  app.post("/api/teacher/students/:studentId/transfer", async (req, res) => {
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
      const { data: student, error: sErr } = await supabaseAdmin.from("profiles").select("id, role, teacher_id, display_name, email").eq("id", studentId).maybeSingle();
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
      const { data: targetTeacher, error: tErr } = await supabaseAdmin.from("profiles").select("id, role, display_name").eq("id", targetTeacherId).maybeSingle();
      if (tErr) throw tErr;
      if (!targetTeacher) return res.status(404).json({ error: "Target teacher not found" });
      if (targetTeacher.role !== "teacher") return res.status(400).json({ error: "Target user is not a teacher" });
      const { error: updErr } = await supabaseAdmin.from("profiles").update({ teacher_id: targetTeacherId }).eq("id", studentId);
      if (updErr) throw updErr;
      const { data: fromTeacherProfile } = await supabaseAdmin.from("profiles").select("display_name, email").eq("id", caller.userId).maybeSingle();
      await supabaseAdmin.from("student_transfers").insert({
        student_id: studentId,
        student_name: student.display_name || "",
        student_email: student.email || "",
        from_teacher_id: caller.userId,
        from_teacher_name: fromTeacherProfile?.display_name || fromTeacherProfile?.email || "",
        to_teacher_id: targetTeacherId,
        to_teacher_name: targetTeacher.display_name || "",
        transferred_by: caller.userId
      }).then(({ error: logErr }) => {
        if (logErr) console.warn("[transfer] Failed to log transfer:", logErr.message);
      });
      console.log(`[transfer] Student ${studentId} transferred from teacher ${caller.userId} \u2192 ${targetTeacherId}`);
      return res.json({
        success: true,
        message: `${student.display_name || student.email} transferred to ${targetTeacher.display_name}`
      });
    } catch (e) {
      console.error("POST /api/teacher/students/:studentId/transfer", e);
      return res.status(500).json({ error: e?.message || "Failed to transfer student" });
    }
  });
  app.get("/api/admin/transfer-history", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10));
      const { data, error, count } = await supabaseAdmin.from("student_transfers").select("*", { count: "exact" }).order("transferred_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) {
        if (/does not exist|PGRST|schema cache|Could not find/i.test(error.message)) {
          return res.json({ transfers: [], total: 0 });
        }
        throw error;
      }
      return res.json({ transfers: data ?? [], total: count ?? 0 });
    } catch (e) {
      console.error("GET /api/admin/transfer-history", e);
      return res.status(500).json({ error: e?.message || "Failed to load transfer history" });
    }
  });
  app.get("/api/teacher/transfer-history", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10)));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10));
      const { data: sent, error: e1 } = await supabaseAdmin.from("student_transfers").select("*").eq("from_teacher_id", caller.userId).order("transferred_at", { ascending: false }).limit(limit);
      const { data: received, error: e2 } = await supabaseAdmin.from("student_transfers").select("*").eq("to_teacher_id", caller.userId).order("transferred_at", { ascending: false }).limit(limit);
      if (e1 && /does not exist|PGRST|schema cache|Could not find/i.test(e1.message)) {
        return res.json({ transfers: [] });
      }
      if (e2 && /does not exist|PGRST|schema cache|Could not find/i.test(e2?.message || "")) {
        return res.json({ transfers: [] });
      }
      if (e1) throw e1;
      if (e2) throw e2;
      const allById = /* @__PURE__ */ new Map();
      [...sent ?? [], ...received ?? []].forEach((t) => allById.set(t.id, t));
      const merged = Array.from(allById.values()).sort((a, b) => new Date(b.transferred_at).getTime() - new Date(a.transferred_at).getTime()).slice(offset, offset + limit);
      return res.json({ transfers: merged });
    } catch (e) {
      console.error("GET /api/teacher/transfer-history", e);
      return res.status(500).json({ error: e?.message || "Failed to load transfer history" });
    }
  });
  const teacherQuizzesGetHandler = async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];
      const rows = await loadTeacherQuizzesForScopedIds(scopedIds, userId);
      res.json({ success: true, quizzes: rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
  app.get("/api/teacher/quizzes", teacherQuizzesGetHandler);
  app.get("/api/teacher/quizzes/", teacherQuizzesGetHandler);
  app.get("/api/teacher/progress", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const requestedUserId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
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
      const teacherCourseIds = courseRows.map((c) => String(c.id || "")).filter(Boolean);
      const enrolledIds = /* @__PURE__ */ new Set();
      courseRows.forEach((c) => {
        (Array.isArray(c.student_ids) ? c.student_ids : []).forEach((sid) => {
          const s = String(sid || "").trim();
          if (s) enrolledIds.add(s);
        });
      });
      const classRowsRes = await supabaseAdmin.from("classes").select("student_ids").in("teacher_id", scopedIds);
      if (!classRowsRes.error) {
        (classRowsRes.data || []).forEach((cl) => {
          (Array.isArray(cl.student_ids) ? cl.student_ids : []).forEach((sid) => {
            const s = String(sid || "").trim();
            if (s) enrolledIds.add(s);
          });
        });
      } else if (!isClassesTableMissing(classRowsRes.error)) {
        throw classRowsRes.error;
      }
      const [linkedStudentsRes, enrolledStudentsRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id,display_name,email,teacher_id,role,status,created_at").in("teacher_id", scopedIds).eq("role", "student"),
        enrolledIds.size > 0 ? supabaseAdmin.from("profiles").select("id,display_name,email,teacher_id,role,status,created_at").in("id", [...enrolledIds]) : Promise.resolve({ data: [], error: null })
      ]);
      if (linkedStudentsRes.error) throw linkedStudentsRes.error;
      if (enrolledStudentsRes.error) throw enrolledStudentsRes.error;
      const studentById = /* @__PURE__ */ new Map();
      (linkedStudentsRes.data || []).forEach((s) => s?.id && studentById.set(String(s.id), s));
      (enrolledStudentsRes.data || []).forEach((s) => {
        const sid = String(s?.id || "");
        if (sid && !studentById.has(sid)) studentById.set(sid, s);
      });
      const allowedStudentIds = /* @__PURE__ */ new Set([...studentById.keys()]);
      let quizRows = [];
      if (teacherCourseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", teacherCourseIds);
        if (quizzesRes.error && !isAnyTableMissingError(quizzesRes.error)) throw quizzesRes.error;
        quizRows = quizzesRes.error ? [] : quizzesRes.data || [];
      }
      const quizzesCount = quizRows.length;
      const quizIds = new Set(quizRows.map((q) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc, q) => {
        const raw = q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark;
        const n = Number(raw);
        acc[String(q.id)] = Number.isFinite(n) ? n : 50;
        return acc;
      }, {});
      const attemptsRows = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds: allowedStudentIds }),
        passingScoreByQuiz
      ).filter((a) => {
        if (!quizIds.has(String(a.quiz_id || ""))) return false;
        return allowedStudentIds.has(String(a.student_id || ""));
      });
      const attemptsByStudent = {};
      attemptsRows.forEach((a) => {
        const sid = String(a.student_id || "");
        if (!sid) return;
        if (!attemptsByStudent[sid]) attemptsByStudent[sid] = { attempts: 0, passed: 0, scoreSum: 0 };
        attemptsByStudent[sid].attempts += 1;
        if (a.passed) attemptsByStudent[sid].passed += 1;
        attemptsByStudent[sid].scoreSum += toFiniteNumber(a.score_percent, 0);
      });
      let teacherAssignmentsCount = 0;
      const assignmentsByStudent = {};
      if (teacherCourseIds.length > 0) {
        try {
          const asgR = await poolQuery(
            `SELECT id FROM assignments WHERE course_id = ANY($1::uuid[])`,
            [teacherCourseIds]
          );
          const assignmentIds = asgR.rows.map((a) => String(a.id));
          teacherAssignmentsCount = assignmentIds.length;
          if (assignmentIds.length > 0 && allowedStudentIds.size > 0) {
            const subR = await poolQuery(
              `SELECT id,assignment_id,student_id,grade,status,submitted_at
               FROM assignment_submissions
               WHERE assignment_id = ANY($1::uuid[]) AND student_id = ANY($2::uuid[])`,
              [assignmentIds, [...allowedStudentIds]]
            );
            subR.rows.forEach((sub) => {
              const sid = String(sub.student_id || "");
              if (!sid || !allowedStudentIds.has(sid)) return;
              if (!assignmentsByStudent[sid]) assignmentsByStudent[sid] = { submitted: 0, graded: 0, gradeSum: 0, lastDate: null };
              assignmentsByStudent[sid].submitted += 1;
              if (sub.grade != null && sub.grade !== "") {
                assignmentsByStudent[sid].graded += 1;
                assignmentsByStudent[sid].gradeSum += Number(sub.grade) || 0;
              }
              const d = sub.submitted_at || null;
              if (d && (!assignmentsByStudent[sid].lastDate || d > assignmentsByStudent[sid].lastDate)) {
                assignmentsByStudent[sid].lastDate = d;
              }
            });
          }
        } catch {
        }
      }
      const rows = [...studentById.values()].map((s) => {
        const sid = String(s.id);
        const aggr = attemptsByStudent[sid] || { attempts: 0, passed: 0, scoreSum: 0 };
        const avgScore = aggr.attempts > 0 ? Math.round(aggr.scoreSum / aggr.attempts) : 0;
        const passRate = aggr.attempts > 0 ? Math.round(aggr.passed / aggr.attempts * 100) : 0;
        const studentAttempts = attemptsRows.filter((a) => String(a.student_id || "") === sid);
        const sortedAttempts = [...studentAttempts].sort(
          (a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime()
        );
        const lastAttemptDate = sortedAttempts[0]?.completed_at || null;
        const courseCount = {};
        studentAttempts.forEach((a) => {
          const quiz = quizRows.find((q) => String(q.id || "") === String(a.quiz_id || ""));
          if (quiz?.course_id) {
            const cid = String(quiz.course_id);
            courseCount[cid] = (courseCount[cid] || 0) + 1;
          }
        });
        const topCourseId = Object.entries(courseCount).sort(([, a], [, b]) => b - a)[0]?.[0];
        const topCourse = courseRows.find((c) => String(c.id || "") === topCourseId);
        const subAggr = assignmentsByStudent[sid] || { submitted: 0, graded: 0, gradeSum: 0, lastDate: null };
        const submissionRate = teacherAssignmentsCount > 0 ? Math.round(subAggr.submitted / teacherAssignmentsCount * 100) : 0;
        const avgGrade = subAggr.graded > 0 ? Math.round(subAggr.gradeSum / subAggr.graded) : 0;
        const lastActivityDate = (() => {
          const dates = [lastAttemptDate, subAggr.lastDate].filter(Boolean);
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
          avgGrade
        };
      });
      res.json({ success: true, rows, coursesCount, quizzesCount, assignmentsCount: teacherAssignmentsCount });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to load teacher progress" });
    }
  });
  app.get("/api/teacher/results", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const requestedUserId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!requestedUserId) {
        return res.status(400).json({ error: "userId is required" });
      }
      if (caller.role !== "admin" && caller.userId !== requestedUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];
      const teacherCourseRowsFull = await fetchTeacherCourseRows(scopedIds, true);
      const teacherCourseIds = teacherCourseRowsFull.map((c) => String(c.id || "")).filter(Boolean);
      let quizRows = [];
      if (teacherCourseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", teacherCourseIds);
        if (quizzesRes.error && !isAnyTableMissingError(quizzesRes.error)) throw quizzesRes.error;
        quizRows = quizzesRes.error ? [] : quizzesRes.data || [];
      }
      const quizIds = new Set(quizRows.map((q) => String(q.id || "")).filter(Boolean));
      const quizzes = {};
      const passingScoreByQuiz = quizRows.reduce((acc, q) => {
        const qid = String(q.id || "");
        quizzes[qid] = String(q.title || "Quiz");
        const raw = q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark;
        const parsed = Number(raw);
        acc[qid] = Number.isFinite(parsed) ? parsed : 50;
        return acc;
      }, {});
      const studentById = /* @__PURE__ */ new Map();
      const linkedStudentsRes = await supabaseAdmin.from("profiles").select("id,display_name,email").in("teacher_id", scopedIds).eq("role", "student");
      if (!linkedStudentsRes.error) {
        for (const s of linkedStudentsRes.data || []) {
          const sid = String(s.id || "");
          if (sid) studentById.set(sid, { name: String(s.display_name || "Unknown"), email: String(s.email || "") });
        }
      }
      const courseEnrolledIds = /* @__PURE__ */ new Set();
      for (const c of teacherCourseRowsFull) {
        if (Array.isArray(c.student_ids)) {
          for (const sid of c.student_ids) {
            const s = String(sid || "");
            if (s && !studentById.has(s)) courseEnrolledIds.add(s);
          }
        }
      }
      const classResForResults = await supabaseAdmin.from("classes").select("student_ids").in("teacher_id", scopedIds);
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
      if (courseEnrolledIds.size > 0) {
        const enrolledRes = await supabaseAdmin.from("profiles").select("id,display_name,email").in("id", [...courseEnrolledIds]);
        if (!enrolledRes.error) {
          for (const s of enrolledRes.data || []) {
            const sid = String(s.id || "");
            if (sid && !studentById.has(sid)) {
              studentById.set(sid, { name: String(s.display_name || "Unknown"), email: String(s.email || "") });
            }
          }
        }
      }
      const allowedStudentIds = new Set(studentById.keys());
      const students = Object.fromEntries(studentById);
      const attempts = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds: allowedStudentIds }),
        passingScoreByQuiz
      ).filter((a) => quizIds.has(String(a.quiz_id || "")) && allowedStudentIds.has(String(a.student_id || ""))).map((a) => ({
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
        correctAnswers: a.correct_answers == null ? null : toFiniteNumber(a.correct_answers, 0),
        totalQuestions: a.total_questions == null ? null : toFiniteNumber(a.total_questions, 0)
      }));
      let assignmentSubmissions = [];
      let assignments = {};
      if (teacherCourseIds.length > 0) {
        try {
          const asgRes = await poolQuery(
            `SELECT id, title FROM assignments WHERE course_id = ANY($1::uuid[])`,
            [teacherCourseIds]
          );
          asgRes.rows.forEach((a) => {
            assignments[String(a.id)] = String(a.title || "Assignment");
          });
          const asgIds = Object.keys(assignments);
          if (asgIds.length > 0 && allowedStudentIds.size > 0) {
            const subRes = await poolQuery(
              `SELECT id,assignment_id,student_id,grade,status,submitted_at
               FROM assignment_submissions
               WHERE assignment_id = ANY($1::uuid[]) AND student_id = ANY($2::uuid[])`,
              [asgIds, [...allowedStudentIds]]
            );
            assignmentSubmissions = subRes.rows.map((s) => ({
              id: String(s.id || ""),
              assignmentId: String(s.assignment_id || ""),
              studentId: String(s.student_id || ""),
              grade: s.grade != null ? Number(s.grade) : null,
              status: String(s.status || "submitted"),
              submittedAt: s.submitted_at || null
            }));
          }
        } catch {
        }
      }
      res.json({ success: true, attempts, quizzes, students, assignmentSubmissions, assignments });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to load teacher results" });
    }
  });
  app.get("/api/teacher/dashboard", async (req, res) => {
    try {
      const dashboardStartedAt = Date.now();
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const requestedUserId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!requestedUserId) {
        return res.status(400).json({ error: "userId is required" });
      }
      if (caller.role !== "admin" && caller.userId !== requestedUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const teacherDashboardCacheKey = `teacher-dashboard:${requestedUserId}`;
      const cachedTeacherDashboard = getCachedApiResponse(teacherDashboardCacheKey);
      if (cachedTeacherDashboard) return res.json(cachedTeacherDashboard);
      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];
      const courseRowsFull = await fetchTeacherCourseRows(scopedIds, true);
      const courseIds = courseRowsFull.map((c) => String(c.id || "")).filter(Boolean);
      const studentIds = /* @__PURE__ */ new Set();
      const linkedStudentsRes = await supabaseAdmin.from("profiles").select("id").in("teacher_id", scopedIds).eq("role", "student");
      if (!linkedStudentsRes.error) {
        for (const s of linkedStudentsRes.data || []) {
          const sid = String(s.id || "");
          if (sid) studentIds.add(sid);
        }
      }
      for (const c of courseRowsFull) {
        if (Array.isArray(c.student_ids)) {
          for (const sid of c.student_ids) {
            const s = String(sid || "");
            if (s) studentIds.add(s);
          }
        }
      }
      const classesRes = await supabaseAdmin.from("classes").select("student_ids").in("teacher_id", scopedIds);
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
      let quizRows = [];
      if (courseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
        if (quizzesRes.error && !isAnyTableMissingError(quizzesRes.error)) throw quizzesRes.error;
        quizRows = quizzesRes.error ? [] : quizzesRes.data || [];
      }
      const quizIds = new Set(quizRows.map((q) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc, q) => {
        const raw = q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark;
        const n = Number(raw);
        acc[String(q.id)] = Number.isFinite(n) ? n : 50;
        return acc;
      }, {});
      const attempts = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds }),
        passingScoreByQuiz
      ).filter((a) => {
        return quizIds.has(String(a.quiz_id || "")) && studentIds.has(String(a.student_id || ""));
      });
      const completedAttempts = attempts.filter((a) => String(a.status || "").toLowerCase() === "completed");
      const avgScore = completedAttempts.length ? Math.round(
        completedAttempts.reduce((sum, a) => sum + toFiniteNumber(a.score_percent, 0), 0) / completedAttempts.length
      ) : 0;
      const passRate = completedAttempts.length ? Math.round(
        completedAttempts.filter((a) => Boolean(a.passed)).length / completedAttempts.length * 100
      ) : 0;
      const durationRows = completedAttempts.filter((a) => a.started_at && a.completed_at);
      const avgDuration = durationRows.length ? Math.round(
        durationRows.reduce((sum, a) => {
          const s = new Date(String(a.started_at)).getTime();
          const e = new Date(String(a.completed_at)).getTime();
          if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return sum;
          return sum + Math.round((e - s) / 6e4);
        }, 0) / durationRows.length
      ) : 0;
      let certificatesCount = 0;
      if (studentIds.size > 0) {
        const certsRes = await supabaseAdmin.from("certificates").select("student_id").in("student_id", [...studentIds]);
        if (!certsRes.error) certificatesCount = (certsRes.data || []).length;
      }
      const now = /* @__PURE__ */ new Date();
      const trend = Array.from({ length: 7 }).map((_, idx) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (6 - idx));
        const isoDay = d.toISOString().slice(0, 10);
        const attemptsForDay = completedAttempts.filter(
          (a) => String(a.completed_at || a.created_at || "").slice(0, 10) === isoDay
        );
        return {
          day: d.toLocaleDateString("en-US", { weekday: "short" }),
          attempts: attemptsForDay.length
        };
      });
      let moduleCompletion = [];
      if (courseIds.length > 0) {
        const [modulesForCourses, courseTitles] = await Promise.all([
          supabaseAdmin.from("modules").select("id, course_id, status").in("course_id", courseIds),
          supabaseAdmin.from("courses").select("id, title").in("id", courseIds)
        ]);
        if (!modulesForCourses.error && !courseTitles.error) {
          const titleMap = {};
          for (const c of courseTitles.data || []) {
            titleMap[String(c.id)] = String(c.title || "Untitled");
          }
          const groupedByCourse = {};
          for (const m of modulesForCourses.data || []) {
            const cid = String(m.course_id || "");
            if (!groupedByCourse[cid]) groupedByCourse[cid] = { total: 0, published: 0 };
            groupedByCourse[cid].total++;
            if (String(m.status || "").toLowerCase() === "published") groupedByCourse[cid].published++;
          }
          moduleCompletion = Object.entries(groupedByCourse).map(([cid, { total, published }]) => ({
            course: titleMap[cid] || "Untitled",
            published,
            total,
            pct: total > 0 ? Math.round(published / total * 100) : 0
          })).sort((a, b) => b.pct - a.pct).slice(0, 8);
        }
      }
      let topStudents = [];
      if (completedAttempts.length > 0) {
        const byStudent = {};
        for (const a of completedAttempts) {
          const sid = String(a.student_id || "");
          if (!sid || !studentIds.has(sid)) continue;
          if (!byStudent[sid]) byStudent[sid] = { scores: [], passed: 0 };
          byStudent[sid].scores.push(toFiniteNumber(a.score_percent, 0));
          if (a.passed) byStudent[sid].passed++;
        }
        const ranked = Object.entries(byStudent).map(([id, { scores, passed }]) => ({
          id,
          avgScore: Math.round(scores.reduce((s, v2) => s + v2, 0) / scores.length),
          quizzes: scores.length,
          passed
        })).sort((a, b) => b.avgScore - a.avgScore || b.quizzes - a.quizzes).slice(0, 10);
        if (ranked.length > 0) {
          const profilesRes = await supabaseAdmin.from("profiles").select("id, display_name, email, avatar_url").in("id", ranked.map((r) => r.id));
          const profileMap = {};
          for (const p of profilesRes.data || []) {
            profileMap[String(p.id)] = {
              name: String(p.display_name || p.email || "Student"),
              avatar: p.avatar_url || null
            };
          }
          topStudents = ranked.map((r) => ({
            ...r,
            name: profileMap[r.id]?.name ?? "Student",
            avatar: profileMap[r.id]?.avatar ?? null
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
          certificates: certificatesCount
        },
        trend,
        moduleCompletion,
        topStudents
      };
      setCachedApiResponse(teacherDashboardCacheKey, payload, 3e4);
      const durationMs = Date.now() - dashboardStartedAt;
      if (durationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(
          `[perf] slow teacher dashboard requestedUserId=${requestedUserId} duration=${durationMs}ms courseIds=${courseIds.length} quizIds=${quizIds.size} attempts=${attempts.length}`
        );
      }
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to load teacher dashboard" });
    }
  });
  app.get("/api/teacher/profile", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const requestedUserId = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : caller.userId;
      if (caller.role !== "admin" && requestedUserId !== caller.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const teacherIds = await getTeacherIdCandidates(requestedUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [requestedUserId];
      const [profileRes, studentsRes, coursesRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", requestedUserId).maybeSingle(),
        supabaseAdmin.from("profiles").select("id").in("teacher_id", scopedIds).eq("role", "student"),
        supabaseAdmin.from("courses").select("id").in("teacher_id", scopedIds)
      ]);
      if (profileRes.error) throw profileRes.error;
      if (studentsRes.error) throw studentsRes.error;
      if (coursesRes.error) throw coursesRes.error;
      const profileRow = profileRes.data || {};
      const courseIds = (coursesRes.data || []).map((c) => String(c.id || "")).filter(Boolean);
      const studentIds = new Set((studentsRes.data || []).map((s) => String(s.id || "")).filter(Boolean));
      let quizRows = [];
      if (courseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
        if (quizzesRes.error) throw quizzesRes.error;
        quizRows = quizzesRes.data || [];
      }
      const quizIds = new Set(quizRows.map((q) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc, q) => {
        const raw = q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark;
        const n = Number(raw);
        acc[String(q.id)] = Number.isFinite(n) ? n : 50;
        return acc;
      }, {});
      const attempts = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds }),
        passingScoreByQuiz
      ).filter((a) => {
        return quizIds.has(String(a.quiz_id || "")) && studentIds.has(String(a.student_id || ""));
      });
      const completedAttempts = attempts.filter((a) => String(a.status || "").toLowerCase() === "completed");
      const passRate = completedAttempts.length ? Math.round(completedAttempts.filter((a) => Boolean(a.passed)).length / completedAttempts.length * 100) : 0;
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
          createdAt: String(profileRow.created_at || "")
        },
        stats: {
          students: studentIds.size,
          courses: courseIds.length,
          quizzes: quizIds.size,
          passRate
        }
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load teacher profile" });
    }
  });
  app.get("/api/teacher/quizzes/question-counts", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const requestedUserId = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : caller.userId;
      const baseUserId = caller.role === "admin" ? requestedUserId : caller.userId;
      const teacherIds = await getTeacherIdCandidates(baseUserId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [baseUserId];
      const quizRows = await loadTeacherQuizzesForScopedIds(scopedIds, baseUserId);
      const quizIds = (quizRows || []).map((q) => String(q?.id || "")).filter(Boolean);
      if (quizIds.length === 0) {
        return res.json({ success: true, counts: {} });
      }
      const { data, error } = await supabaseAdmin.from("questions").select("quiz_id").in("quiz_id", quizIds);
      if (error) throw error;
      const counts = {};
      (data || []).forEach((row) => {
        const qid = row?.quiz_id ? String(row.quiz_id) : "";
        if (!qid) return;
        counts[qid] = (counts[qid] || 0) + 1;
      });
      return res.json({ success: true, counts });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load quiz question counts" });
    }
  });
  app.get("/api/teacher/modules", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];
      const { data: courseRows, error: coursesError } = await supabaseAdmin.from("courses").select("id").in("teacher_id", scopedIds);
      if (coursesError) throw coursesError;
      const courseIds = (courseRows || []).map((c) => c?.id).filter(Boolean);
      if (courseIds.length === 0) {
        return res.json({ success: true, modules: [] });
      }
      const { data, error } = await supabaseAdmin.from("modules").select("*").in("course_id", courseIds);
      if (error) throw error;
      const rows = data || [];
      const moduleIds = rows.map((m) => String(m?.id || "")).filter(Boolean);
      const lessonCountByModule = {};
      const quizCountByCourse = {};
      if (moduleIds.length > 0) {
        const { data: lessonRows, error: lessonErr } = await supabaseAdmin.from("lessons").select("id,module_id").in("module_id", moduleIds);
        if (lessonErr) throw lessonErr;
        (lessonRows || []).forEach((l) => {
          const moduleId = String(l?.module_id || "");
          const lessonId = String(l?.id || "");
          if (!moduleId || !lessonId) return;
          lessonCountByModule[moduleId] = (lessonCountByModule[moduleId] || 0) + 1;
        });
      }
      if (courseIds.length > 0) {
        const fetchQuizRows = async () => {
          const withStatus = await supabaseAdmin.from("quizzes").select("id,course_id,status").in("course_id", courseIds);
          if (!withStatus.error) return withStatus.data || [];
          const fallback = await supabaseAdmin.from("quizzes").select("id,course_id").in("course_id", courseIds);
          if (fallback.error) throw fallback.error;
          return fallback.data || [];
        };
        const quizRows = await fetchQuizRows();
        const isAvailable = (q) => {
          const status = String(q?.status || "").toLowerCase();
          if (status) return status === "published" || status === "active";
          return true;
        };
        (quizRows || []).forEach((q) => {
          if (!isAvailable(q)) return;
          const cId = String(q?.course_id || "");
          if (!cId) return;
          quizCountByCourse[cId] = (quizCountByCourse[cId] || 0) + 1;
        });
      }
      const enrichedRows = rows.map((m) => {
        const moduleId = String(m?.id || "");
        const courseId = String(m?.course_id || "");
        return {
          ...m,
          total_lessons: lessonCountByModule[moduleId] ?? m?.total_lessons ?? 0,
          total_quizzes: quizCountByCourse[courseId] ?? 0
        };
      });
      enrichedRows.sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
      res.json({ success: true, modules: enrichedRows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  const teacherCourseDeleteHandler = async (req, res) => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!id) return res.status(400).json({ error: "Course id is required" });
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedArr = teacherIds.length > 0 ? teacherIds : [userId];
      const { data: deleted, error: delError } = await supabaseAdmin.from("courses").delete().eq("id", id).in("teacher_id", scopedArr).select("id");
      if (delError) {
        if (delError.code === "23503") {
          return res.status(409).json({
            error: "This course cannot be deleted because other data still references it. Remove linked quizzes, classes, or enrollments first."
          });
        }
        throw delError;
      }
      if (!deleted || deleted.length === 0) {
        return res.status(404).json({
          error: "Course not found or you do not have permission to delete it. Use the app URL printed when you run npm run dev (Express + API on the same port)."
        });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("/api/teacher/courses delete", e);
      res.status(500).json({ error: e.message });
    }
  };
  app.delete("/api/teacher/courses/:id", teacherCourseDeleteHandler);
  app.post("/api/teacher/courses/:id/delete", teacherCourseDeleteHandler);
  const assertTeacherOwnsCourse = async (userId, courseId) => {
    const teacherIds = await getTeacherIdCandidates(userId);
    const scoped = new Set((teacherIds.length > 0 ? teacherIds : [userId]).map((x) => String(x)));
    const { data: course, error } = await supabaseAdmin.from("courses").select("id, teacher_id").eq("id", courseId).maybeSingle();
    if (error) throw error;
    if (!course) return { ok: false, reason: "not_found" };
    if (!scoped.has(String(course.teacher_id ?? ""))) {
      return { ok: false, reason: "forbidden" };
    }
    return { ok: true, course };
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
      const { data, error } = await supabaseAdmin.from("courses").update({ status: nextStatus, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", courseId).select("*").single();
      if (error) throw error;
      return res.json({ success: true, course: data });
    } catch (e) {
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
          error: gate.reason === "not_found" ? "Course not found (check that this course exists in Supabase and matches your account)." : "You do not have access to this course.",
          code: gate.reason
        });
      }
      const slugIn = typeof req.body.slug === "string" && req.body.slug.trim() ? req.body.slug.trim() : String(title).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
      const description = req.body.description === null || req.body.description === void 0 || req.body.description === "" ? null : String(req.body.description);
      const order = Number(req.body.order) || 1;
      const status = req.body.status === "inactive" || req.body.status === "active" ? req.body.status : "active";
      const insertRow = {
        course_id: String(course_id),
        title: title.trim(),
        slug: slugIn || null,
        description,
        status
      };
      insertRow["order"] = order;
      if (typeof req.body.publish_at === "string" && req.body.publish_at) {
        insertRow.publish_at = req.body.publish_at;
      }
      const { data, error } = await supabaseAdmin.from("modules").insert(insertRow).select().single();
      if (error) {
        console.error("POST /api/teacher/modules insert", error);
        const msg = [error.message, error.details, error.hint].filter((x) => typeof x === "string" && x).join(" \u2014 ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, module: data });
    } catch (e) {
      console.error("POST /api/teacher/modules", e);
      const msg = typeof e?.message === "string" && e.message ? e.message : String(e?.details || e || "Server error");
      res.status(500).json({ error: msg });
    }
  });
  app.patch("/api/teacher/modules/:id", async (req, res) => {
    try {
      const moduleId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!moduleId) return res.status(400).json({ error: "Module id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: mod, error: mErr } = await supabaseAdmin.from("modules").select("id, course_id").eq("id", moduleId).maybeSingle();
      if (mErr) throw mErr;
      if (!mod) return res.status(404).json({ error: "Module not found." });
      const gate = await assertTeacherOwnsCourse(userId, String(mod.course_id));
      if (!gate.ok) {
        return res.status(403).json({ error: "You do not have access to this module." });
      }
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (typeof req.body.title === "string") updates.title = req.body.title.trim();
      if (req.body.description !== void 0) {
        updates.description = req.body.description === null || req.body.description === "" ? null : String(req.body.description);
      }
      if (typeof req.body.slug === "string") updates.slug = req.body.slug.trim() || null;
      if (req.body.order !== void 0) updates["order"] = Number(req.body.order) || 1;
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
    } catch (e) {
      console.error("PATCH /api/teacher/modules/:id", e);
      res.status(500).json({ error: e.message });
    }
  });
  const teacherModuleDeleteHandler = async (req, res) => {
    try {
      const moduleId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!moduleId) return res.status(400).json({ error: "Module id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: mod, error: mErr } = await supabaseAdmin.from("modules").select("id, course_id").eq("id", moduleId).maybeSingle();
      if (mErr) throw mErr;
      if (!mod) return res.status(404).json({ error: "Module not found." });
      const gate = await assertTeacherOwnsCourse(userId, String(mod.course_id));
      if (!gate.ok) {
        return res.status(403).json({ error: "You do not have access to this module." });
      }
      const { error: dErr } = await supabaseAdmin.from("modules").delete().eq("id", moduleId);
      if (dErr) throw dErr;
      res.json({ success: true });
    } catch (e) {
      console.error("DELETE /api/teacher/modules/:id", e);
      res.status(500).json({ error: e.message });
    }
  };
  app.delete("/api/teacher/modules/:id", teacherModuleDeleteHandler);
  app.post("/api/teacher/modules/:id/delete", teacherModuleDeleteHandler);
  app.post("/api/teacher/modules/bulk-status", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const moduleIds = Array.isArray(req.body?.moduleIds) ? req.body.moduleIds.filter((id) => typeof id === "string" && id) : [];
      const status = req.body?.status === "active" || req.body?.status === "inactive" ? req.body.status : null;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!moduleIds.length) return res.status(400).json({ error: "moduleIds required" });
      if (!status) return res.status(400).json({ error: "status must be active or inactive" });
      const { data: mods } = await supabaseAdmin.from("modules").select("id,course_id").in("id", moduleIds);
      const courseIds = [...new Set((mods || []).map((m) => String(m.course_id)))];
      for (const cid of courseIds) {
        const gate = await assertTeacherOwnsCourse(userId, cid);
        if (!gate.ok) return res.status(403).json({ error: "Access denied" });
      }
      const { error } = await supabaseAdmin.from("modules").update({ status, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).in("id", moduleIds);
      if (error) throw error;
      res.json({ success: true, updated: moduleIds.length });
    } catch (e) {
      console.error("POST /api/teacher/modules/bulk-status", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });
  app.post("/api/teacher/modules/:id/duplicate", async (req, res) => {
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
      const newOrder = (maxOrd?.order ?? 0) + 1;
      const ts = Date.now();
      const slugBase = String(mod.slug || mod.title || "module").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: newMod, error: newErr } = await supabaseAdmin.from("modules").insert({ course_id: mod.course_id, title: `${mod.title} (Copy)`, slug: `${slugBase}-copy-${ts}`, description: mod.description, status: "inactive", order: newOrder }).select("id").single();
      if (newErr) throw newErr;
      const { data: lessons } = await supabaseAdmin.from("lessons").select("*").eq("module_id", moduleId).order("order");
      if (lessons && lessons.length > 0) {
        const newLessons = lessons.map((l) => ({
          course_id: l.course_id,
          module_id: newMod.id,
          title: l.title,
          slug: `${String(l.slug || l.title || "lesson").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ts}`,
          type: l.type,
          short_description: l.short_description,
          order: l.order,
          status: l.status,
          duration_minutes: l.duration_minutes,
          is_free_preview: l.is_free_preview
        }));
        const { data: createdLessons } = await supabaseAdmin.from("lessons").insert(newLessons).select("id");
        if (createdLessons) {
          for (let i = 0; i < lessons.length; i++) {
            const newId = createdLessons[i]?.id;
            if (!newId) continue;
            const { data: contents } = await supabaseAdmin.from("lesson_contents").select("type,content_type,text_content,content,position").eq("lesson_id", lessons[i].id);
            if (contents?.length) await supabaseAdmin.from("lesson_contents").insert(contents.map((c) => ({ ...c, lesson_id: newId })));
          }
        }
      }
      res.json({ success: true, moduleId: newMod.id });
    } catch (e) {
      console.error("POST /api/teacher/modules/:id/duplicate", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });
  app.post("/api/teacher/lessons/:id/regenerate-content", async (req, res) => {
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
      const levelSlug = slugMatch ? slugMatch[1] : url.match(/headway_([a-z]+)_students/) ? "beg" : "preint4";
      const dlPage = `${OUP_BASE}/student/headway/${levelSlug}/download${CC_STR}`;
      const zipLink = url ? `<p style="margin:10px 0 4px;font-size:12px">or download directly:</p><a href="${url}" target="_blank" rel="noopener noreferrer" style="font-size:12px;font-weight:600;text-decoration:underline">\u2B07 Direct ZIP download</a>` : "";
      let html = "";
      if (isAudioDL) {
        html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #99f6e4;border-radius:16px;background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);text-align:center;font-family:system-ui,sans-serif"><div style="font-size:40px;margin-bottom:10px">\u{1F3A7}</div><p style="margin:0 0 4px;color:#0f766e;font-size:17px;font-weight:700">${title}</p><p style="margin:0 0 6px;color:#115e59;font-size:13px">${desc}</p><p style="margin:0 0 20px;color:#0d9488;font-size:12px;background:#ccfbf1;display:inline-block;padding:4px 12px;border-radius:99px;border:1px solid #5eead4">\u{1F4E6} MP3 audio files</p><br/><a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#0d9488;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">\u{1F517} Open Downloads Page</a>${zipLink}<p style="margin:14px 0 0;color:#5eead4;font-size:11px">Oxford University Press \xB7 elt.oup.com</p></div>`;
      } else {
        html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #bae6fd;border-radius:16px;background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);text-align:center;font-family:system-ui,sans-serif"><div style="font-size:40px;margin-bottom:10px">\u{1F3AC}</div><p style="margin:0 0 4px;color:#0369a1;font-size:17px;font-weight:700">${title}</p><p style="margin:0 0 6px;color:#075985;font-size:13px">${desc}</p><p style="margin:0 0 20px;color:#0284c7;font-size:12px;background:#e0f2fe;display:inline-block;padding:4px 12px;border-radius:99px;border:1px solid #7dd3fc">\u{1F4E6} MP4 video clips</p><br/><a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#0284c7;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">\u{1F517} Open Downloads Page</a>${zipLink}<p style="margin:14px 0 0;color:#7dd3fc;font-size:11px">Oxford University Press \xB7 elt.oup.com</p></div>`;
      }
      const { data: existing } = await supabaseAdmin.from("lesson_contents").select("id").eq("lesson_id", lessonId).maybeSingle();
      if (existing?.id) {
        await supabaseAdmin.from("lesson_contents").update({ text_content: html, content: html }).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("lesson_contents").insert({ lesson_id: lessonId, type: "text", content_type: "text", text_content: html, content: html, position: 1 });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("POST /api/teacher/lessons/:id/regenerate-content", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });
  app.post("/api/teacher/students/:studentId/reset-progress", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const studentId = req.params.studentId;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const courseId = typeof req.body?.courseId === "string" && req.body.courseId ? req.body.courseId.trim() : null;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: teacherCourses } = await supabaseAdmin.from("courses").select("id").eq("teacher_id", userId);
      const allowedIds = (teacherCourses || []).map((c) => String(c.id));
      if (courseId && !allowedIds.includes(courseId)) return res.status(403).json({ error: "Access denied" });
      const scopedCourseIds = courseId ? [courseId] : allowedIds;
      const { data: quizzes } = await supabaseAdmin.from("quizzes").select("id").in("course_id", scopedCourseIds);
      const quizIds = (quizzes || []).map((q) => String(q.id));
      let deletedAttempts = 0;
      if (quizIds.length) {
        const { data: d } = await supabaseAdmin.from("quiz_attempts").delete().eq("student_id", studentId).in("quiz_id", quizIds).select("id");
        deletedAttempts = d?.length ?? 0;
      }
      const { data: lessons } = await supabaseAdmin.from("lessons").select("id").in("course_id", scopedCourseIds);
      const lessonIds = (lessons || []).map((l) => String(l.id));
      let deletedProgress = 0;
      if (lessonIds.length) {
        const { data: d } = await supabaseAdmin.from("lesson_progress").delete().eq("student_id", studentId).in("lesson_id", lessonIds).select("id");
        deletedProgress = d?.length ?? 0;
      }
      res.json({ success: true, deletedAttempts, deletedProgress });
    } catch (e) {
      console.error("POST /api/teacher/students/:studentId/reset-progress", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });
  app.get("/api/teacher/courses/:courseId/module-completion", async (req, res) => {
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
        supabaseAdmin.from("courses").select("id, student_ids").eq("id", courseId).maybeSingle()
      ]);
      if (modulesRes.error) throw modulesRes.error;
      if (lessonsRes.error) throw lessonsRes.error;
      const modules = modulesRes.data || [];
      const lessons = lessonsRes.data || [];
      const studentIds = Array.isArray(courseRes.data?.student_ids) ? courseRes.data.student_ids.filter(Boolean) : [];
      if (studentIds.length === 0 || lessons.length === 0) {
        return res.json({ success: true, modules, studentCount: studentIds.length, completion: [] });
      }
      const profilesRes = await supabaseAdmin.from("profiles").select("id, display_name, email").in("id", studentIds);
      const profiles = profilesRes.data || [];
      const lessonIds = lessons.map((l) => String(l.id));
      const progressRes = await supabaseAdmin.from("lesson_progress").select("student_id, lesson_id, completed").in("lesson_id", lessonIds).in("student_id", studentIds);
      const progressRows = progressRes.data || [];
      const completionMap = {};
      for (const row of progressRows) {
        const sid = String(row.student_id);
        const lid = String(row.lesson_id);
        if (!completionMap[sid]) completionMap[sid] = {};
        completionMap[sid][lid] = Boolean(row.completed);
      }
      const lessonToModule = {};
      for (const lesson of lessons) {
        if (lesson.module_id) lessonToModule[String(lesson.id)] = String(lesson.module_id);
      }
      const completion = profiles.map((profile) => {
        const sid = profile.id;
        const studentProgress = completionMap[sid] || {};
        const modulesProgress = modules.map((mod) => {
          const modLessons = lessons.filter((l) => String(l.module_id) === String(mod.id));
          const completedCount = modLessons.filter((l) => studentProgress[String(l.id)]).length;
          return {
            moduleId: String(mod.id),
            moduleTitle: String(mod.title || ""),
            total: modLessons.length,
            completed: completedCount,
            percent: modLessons.length > 0 ? Math.round(completedCount / modLessons.length * 100) : 0
          };
        });
        const totalCompleted = modulesProgress.reduce((s, m) => s + m.completed, 0);
        const totalLessons = lessons.length;
        return {
          studentId: sid,
          studentName: String(profile.display_name || profile.email || sid),
          studentEmail: String(profile.email || ""),
          overallPercent: totalLessons > 0 ? Math.round(totalCompleted / totalLessons * 100) : 0,
          modules: modulesProgress
        };
      });
      return res.json({ success: true, modules, studentCount: studentIds.length, completion });
    } catch (e) {
      console.error("GET /api/teacher/courses/:courseId/module-completion", e);
      return res.status(500).json({ error: e.message || "Server error" });
    }
  });
  app.get("/api/teacher/lessons", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const userId = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : caller.userId;
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const teacherIds = await getTeacherIdCandidates(userId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [userId];
      const { data: courseRows, error: coursesError } = await supabaseAdmin.from("courses").select("id").in("teacher_id", scopedIds);
      if (coursesError) throw coursesError;
      const courseIds = (courseRows || []).map((c) => c?.id).filter(Boolean);
      if (courseIds.length === 0) return res.json({ success: true, lessons: [] });
      const { data, error } = await supabaseAdmin.from("lessons").select("*").in("course_id", courseIds).order("order", { ascending: true });
      if (error) throw error;
      res.json({ success: true, lessons: data || [] });
    } catch (e) {
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
      const payload = {
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
        publish_at: publish_at ? new Date(publish_at).toISOString() : null
      };
      const { data, error } = await supabaseAdmin.from("lessons").insert(payload).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" \u2014 ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e) {
      console.error("POST /api/teacher/lessons", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });
  app.post("/api/teacher/courses/:courseId/clear-modules", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { courseId } = req.params;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const gate = await assertTeacherOwnsCourse(userId, courseId);
      if (!gate.ok) return res.status(403).json({ error: "Access denied" });
      const { data: mods, error: mErr } = await supabaseAdmin.from("modules").select("id").eq("course_id", courseId);
      if (mErr) throw mErr;
      if (!mods || mods.length === 0) return res.json({ deleted: 0 });
      const moduleIds = mods.map((m) => m.id);
      await supabaseAdmin.from("lessons").delete().in("module_id", moduleIds);
      try {
        await supabaseAdmin.from("quizzes").delete().in("module_id", moduleIds);
      } catch {
      }
      const { error: dErr } = await supabaseAdmin.from("modules").delete().in("id", moduleIds);
      if (dErr) throw dErr;
      res.json({ success: true, deleted: moduleIds.length });
    } catch (e) {
      console.error("POST /api/teacher/courses/:courseId/clear-modules", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });
  app.post("/api/teacher/courses/:courseId/headway-populate", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { courseId } = req.params;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const level = typeof req.body?.level === "string" ? req.body.level.trim() : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!level) return res.status(400).json({ error: "level is required" });
      if (!canAccessTeacherCourses(caller, userId)) return res.status(403).json({ error: "Forbidden" });
      const gate = await assertTeacherOwnsCourse(userId, courseId);
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this course." });
      const rawOpts = req.body?.options ?? {};
      const includeGrammar = rawOpts.grammar !== false;
      const includeVocabulary = rawOpts.vocabulary !== false;
      const includeEverydayEnglish = rawOpts.everydayEnglish !== false;
      const includeAudioDownload = rawOpts.audioDownload !== false;
      const includeVideoDownload = rawOpts.videoDownload !== false;
      const includeTestBuilder = rawOpts.testBuilder !== false;
      const OUP3 = "https://elt.oup.com";
      const CC3 = "?cc=global&selLanguage=en";
      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown Headway level: "${level}". Valid: ${Object.keys(HEADWAY_FULL_DATA).join(", ")}` });
      const slugify = (s) => s.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
      const wantStream = req.body?.stream === true;
      const total = levelData.units.length;
      const emit = (obj) => {
        if (wantStream) res.write(`data: ${JSON.stringify(obj)}

`);
      };
      if (wantStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
      }
      let totalLessons = 0;
      let totalModules = 0;
      const unitModuleIds = [];
      for (let i = 0; i < levelData.units.length; i++) {
        const unit = levelData.units[i];
        emit({ type: "progress", unit: i + 1, total, title: unit.title, phase: "module" });
        const { data: modRows, error: modErr } = await supabaseAdmin.from("modules").insert([{
          course_id: courseId,
          title: unit.title,
          slug: slugify(unit.title),
          description: unit.description,
          order: i + 1,
          status: "active"
        }]).select("id, order");
        if (modErr || !modRows?.length) {
          const msg = modErr ? [modErr.message, modErr.details, modErr.hint].filter(Boolean).join(" \u2014 ") : "Module not created";
          emit({ type: "error", message: msg });
          if (!wantStream) return res.status(400).json({ error: msg });
          res.end();
          return;
        }
        const mod = modRows[0];
        unitModuleIds[i] = String(mod.id);
        totalModules++;
        emit({ type: "progress", unit: i + 1, total, title: unit.title, phase: "lessons" });
        const lessonRows = [];
        const lessonUrls = [];
        let ord = 0;
        const hwTag = `
headway:${level}:${unit.num}`;
        if (includeGrammar) {
          for (const gr of unit.grammar) {
            const url = `${OUP3}${gr.path}${CC3}`;
            lessonRows.push({ course_id: courseId, module_id: mod.id, title: `Grammar: ${gr.topic}`, slug: slugify(`u${unit.num}-gr-${gr.topic}`), type: "text", short_description: `Oxford Headway exercise \u2014 ${gr.topic}
${url}${hwTag}`, order: ++ord, status: "published", duration_minutes: 20, is_free_preview: ord === 1 });
            lessonUrls.push(url);
          }
        }
        if (includeVocabulary) {
          for (const vc of unit.vocabulary) {
            const url = `${OUP3}${vc.path}${CC3}`;
            lessonRows.push({ course_id: courseId, module_id: mod.id, title: `Vocabulary: ${vc.topic}`, slug: slugify(`u${unit.num}-vc-${vc.topic}`), type: "text", short_description: `Oxford Headway vocabulary \u2014 ${vc.topic}
${url}${hwTag}`, order: ++ord, status: "published", duration_minutes: 15, is_free_preview: false });
            lessonUrls.push(url);
          }
        }
        if (includeEverydayEnglish) {
          const eeUrl = `${OUP3}/student/headway/${levelData.slug}/everydayenglish/${unit.eeSlug}/${CC3}`;
          lessonRows.push({ course_id: courseId, module_id: mod.id, title: "Everyday English", slug: slugify(`u${unit.num}-everyday-english`), type: "video", short_description: `Listen and practise dialogues from Unit ${unit.num}.
${eeUrl}${hwTag}`, order: ++ord, status: "published", duration_minutes: 20, is_free_preview: false });
          lessonUrls.push(eeUrl);
        }
        if (includeAudioDownload && unit.audioZip) {
          lessonRows.push({ course_id: courseId, module_id: mod.id, title: "Student's Book Audio \u2014 Download", slug: slugify(`u${unit.num}-audio`), type: "text", short_description: `Download Student's Book audio for Unit ${unit.num}.
${unit.audioZip}${hwTag}`, order: ++ord, status: "published", duration_minutes: 0, is_free_preview: false });
          lessonUrls.push(unit.audioZip);
        }
        if (includeVideoDownload && unit.videoZip) {
          lessonRows.push({ course_id: courseId, module_id: mod.id, title: "Video \u2014 Download", slug: slugify(`u${unit.num}-video`), type: "video", short_description: `Download video for Unit ${unit.num}.
${unit.videoZip}${hwTag}`, order: ++ord, status: "published", duration_minutes: 0, is_free_preview: false });
          lessonUrls.push(unit.videoZip);
        }
        const { data: createdLessons, error: lessonErr } = await supabaseAdmin.from("lessons").insert(lessonRows).select("id");
        if (lessonErr) {
          const msg = [lessonErr.message, lessonErr.details, lessonErr.hint].filter(Boolean).join(" \u2014 ");
          emit({ type: "error", message: msg || "Failed to create lessons" });
          if (!wantStream) return res.status(400).json({ error: msg });
          res.end();
          return;
        }
        totalLessons += lessonRows.length;
        if (Array.isArray(createdLessons) && createdLessons.length > 0) {
          const contentRows = createdLessons.map((l, li) => {
            const url = lessonUrls[li] || "";
            const lsn = lessonRows[li];
            const title = lsn?.title || "";
            const desc = lsn?.short_description?.split("\n")[0] || "";
            const isAudioDL = title.includes("Audio") && url.endsWith(".zip");
            const isVideoDL = title.includes("Video") && url.endsWith(".zip");
            const isEE = title === "Everyday English";
            const isGrammar = title.startsWith("Grammar:");
            const isVocab = title.startsWith("Vocabulary:");
            let html = "";
            if (isAudioDL) {
              const dlPage = `${OUP3}/student/headway/${levelData.slug}/audiodl${CC3}`;
              const audioTracks = [
                { label: "Student's Book Audio", icon: "\u{1F4D7}", desc: `All listening tracks for Unit ${unit.num} \u2014 dialogues, reading texts & exercises` },
                { label: "Pronunciation Practice", icon: "\u{1F399}\uFE0F", desc: `Sounds, word stress & intonation drills from Unit ${unit.num}` },
                { label: "Listening Activities", icon: "\u{1F3B5}", desc: `Graded listening tasks and comprehension exercises` },
                { label: "Everyday English Dialogue", icon: "\u{1F4AC}", desc: `Functional language & real-life conversation practice` }
              ];
              const trackRows = audioTracks.map((t) => `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#f0fdfa;border-radius:10px;border:1px solid #99f6e4;text-align:left">
  <span style="font-size:20px;line-height:1">${t.icon}</span>
  <div><p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#0f766e">${t.label}</p><p style="margin:0;font-size:11px;color:#115e59">${t.desc}</p></div>
</div>`).join("");
              html = `<div style="margin:0 auto;max-width:560px;padding:28px 24px;border:1.5px solid #99f6e4;border-radius:18px;background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);font-family:system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#0d9488,#0f766e);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">\u{1F3A7}</div>
    <div>
      <p style="margin:0 0 2px;color:#0f766e;font-size:17px;font-weight:800">${unit.title} \u2014 Audio Downloads</p>
      <p style="margin:0;color:#115e59;font-size:12px">Oxford Headway \xB7 Student's Book &amp; Workbook Audio \xB7 MP3</p>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    <span style="background:#ccfbf1;color:#0f766e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #5eead4">\u{1F3B5} MP3 Format</span>
    <span style="background:#ccfbf1;color:#0f766e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #5eead4">\u{1F4DA} Unit ${unit.num}</span>
    <span style="background:#ccfbf1;color:#0f766e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #5eead4">\u{1F3EB} Oxford University Press</span>
  </div>
  <div style="display:grid;gap:8px;margin-bottom:20px">${trackRows}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px">\u{1F517} Open Audio Downloads</a>
    <a href="${url}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#fff;color:#0f766e;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px;border:2px solid #5eead4">\u2B07 Direct ZIP Download</a>
  </div>
  <p style="margin:14px 0 0;color:#5eead4;font-size:11px;text-align:center">Oxford University Press \xB7 elt.oup.com \u2014 for educational use</p>
</div>`;
            } else if (isVideoDL) {
              const dlPage = `${OUP3}/student/headway/${levelData.slug}/video_bandw${CC3}`;
              const videoItems = [
                { label: "Unit Video Clip", icon: "\u{1F3AC}", desc: `Main video for Unit ${unit.num} \u2014 watch & understand real-life situations` },
                { label: "Video Script", icon: "\u{1F4C4}", desc: `Full transcript of the video dialogue for study and review` },
                { label: "Video Tasks", icon: "\u270F\uFE0F", desc: `Comprehension questions and follow-up activities` },
                { label: "MP4 Download", icon: "\u{1F4BE}", desc: `Download the video ZIP for offline classroom use` }
              ];
              const videoRows = videoItems.map((v2) => `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;text-align:left">
  <span style="font-size:20px;line-height:1">${v2.icon}</span>
  <div><p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#0369a1">${v2.label}</p><p style="margin:0;font-size:11px;color:#075985">${v2.desc}</p></div>
</div>`).join("");
              html = `<div style="margin:0 auto;max-width:560px;padding:28px 24px;border:1.5px solid #bae6fd;border-radius:18px;background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);font-family:system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#0284c7,#0369a1);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">\u{1F3AC}</div>
    <div>
      <p style="margin:0 0 2px;color:#0369a1;font-size:17px;font-weight:800">${unit.title} \u2014 Video Downloads</p>
      <p style="margin:0;color:#075985;font-size:12px">Oxford Headway \xB7 Classroom Video \xB7 MP4 &amp; Scripts</p>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #7dd3fc">\u{1F3A5} MP4 Format</span>
    <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #7dd3fc">\u{1F4DA} Unit ${unit.num}</span>
    <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #7dd3fc">\u{1F3EB} Oxford University Press</span>
  </div>
  <div style="display:grid;gap:8px;margin-bottom:20px">${videoRows}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <a href="${dlPage}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px">\u25B6 Open Video Page</a>
    <a href="${url}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:160px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#fff;color:#0369a1;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px;border:2px solid #7dd3fc">\u2B07 Direct ZIP Download</a>
  </div>
  <p style="margin:14px 0 0;color:#7dd3fc;font-size:11px;text-align:center">Oxford University Press \xB7 elt.oup.com \u2014 for educational use</p>
</div>`;
            } else if (isEE) {
              html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #ddd6fe;border-radius:16px;background:linear-gradient(135deg,#faf5ff 0%,#ede9fe 100%);text-align:center;font-family:system-ui,sans-serif">
  <div style="font-size:40px;margin-bottom:10px">\u{1F3A4}</div>
  <p style="margin:0 0 4px;color:#6d28d9;font-size:17px;font-weight:700">Everyday English</p>
  <p style="margin:0 0 20px;color:#7c3aed;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">\u25B6 Watch &amp; Listen</a>
  <p style="margin:14px 0 0;color:#c4b5fd;font-size:11px">Interactive dialogue \xB7 Oxford Headway Online</p>
</div>`;
            } else if (isGrammar) {
              const topic = title.replace("Grammar: ", "");
              html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #c7d2fe;border-radius:16px;background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%);text-align:center;font-family:system-ui,sans-serif">
  <div style="font-size:40px;margin-bottom:10px">\u{1F4D8}</div>
  <p style="margin:0 0 4px;color:#3730a3;font-size:17px;font-weight:700">Grammar: ${topic}</p>
  <p style="margin:0 0 20px;color:#4338ca;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Open Grammar Exercise \u2192</a>
  <p style="margin:14px 0 0;color:#a5b4fc;font-size:11px">Interactive practice \xB7 Oxford Headway Online</p>
</div>`;
            } else if (isVocab) {
              const topic = title.replace("Vocabulary: ", "");
              html = `<div style="margin:0 auto;max-width:480px;padding:28px 24px;border:1.5px solid #bbf7d0;border-radius:16px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);text-align:center;font-family:system-ui,sans-serif">
  <div style="font-size:40px;margin-bottom:10px">\u{1F33F}</div>
  <p style="margin:0 0 4px;color:#166534;font-size:17px;font-weight:700">Vocabulary: ${topic}</p>
  <p style="margin:0 0 20px;color:#15803d;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#16a34a;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Open Vocabulary Exercise \u2192</a>
  <p style="margin:14px 0 0;color:#86efac;font-size:11px">Interactive practice \xB7 Oxford Headway Online</p>
</div>`;
            } else {
              const isZip = url.endsWith(".zip");
              html = `<div style="margin:0 auto;max-width:480px;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;text-align:center;font-family:system-ui,sans-serif">
  <p style="margin:0 0 8px;color:#334155;font-size:15px;font-weight:600">${title}</p>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">${desc}</p>
  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#6366f1;color:#fff;padding:11px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">${isZip ? "\u2B07 Download ZIP" : "Open \u2192"}</a>
</div>`;
            }
            return { lesson_id: l.id, type: "text", content_type: "text", text_content: html, content: html, position: 1 };
          });
          try {
            await supabaseAdmin.from("lesson_contents").insert(contentRows);
          } catch {
          }
        }
        emit({ type: "progress", unit: i + 1, total, title: unit.title, phase: "done" });
      }
      if (false) {
        emit({ type: "status", message: "Creating Test Builder quizzes with questions..." });
        const buildUnitQuestions2 = (u) => {
          const questions = [];
          let order = 0;
          for (const gr of u.grammar) {
            const topic = gr.topic;
            const url = `${OUP3}${gr.path}${CC3}`;
            questions.push({
              text: `Which of the following best demonstrates correct use of "${topic}" from Unit ${u.num}?`,
              question_text: `Which of the following best demonstrates correct use of "${topic}" from Unit ${u.num}?`,
              type: "multiple-choice",
              options: JSON.stringify([
                `Practice exercise on "${topic}" \u2014 see Oxford Headway: ${url}`,
                `An incorrect form that ignores the rules of "${topic}"`,
                `A sentence that mixes "${topic}" with an incompatible tense`,
                `A phrase that avoids "${topic}" altogether`
              ]),
              correct_answer: `0`,
              points: 1,
              explanation: `The correct answer links to the Oxford Headway interactive exercise on "${topic}". Visit: ${url}`,
              order: order++
            });
          }
          for (const vc of u.vocabulary) {
            const topic = vc.topic;
            const url = `${OUP3}${vc.path}${CC3}`;
            questions.push({
              text: `Which sentence uses vocabulary from the "${topic}" set in Unit ${u.num} correctly?`,
              question_text: `Which sentence uses vocabulary from the "${topic}" set in Unit ${u.num} correctly?`,
              type: "multiple-choice",
              options: JSON.stringify([
                `Correct use of a word from the "${topic}" group \u2014 practise here: ${url}`,
                `Incorrect word chosen from a different category`,
                `A synonym used in the wrong register or context`,
                `A word that looks similar but has a different meaning`
              ]),
              correct_answer: `0`,
              points: 1,
              explanation: `The first option is correct. Review the "${topic}" vocabulary set at: ${url}`,
              order: order++
            });
          }
          questions.push({
            text: `What is the main topic of ${u.title}?`,
            question_text: `What is the main topic of ${u.title}?`,
            type: "multiple-choice",
            options: JSON.stringify([
              u.description,
              `A lesson about a completely different theme unrelated to ${u.title}`,
              `An advanced grammar topic not covered in this unit`,
              `A revision unit with no new content`
            ]),
            correct_answer: `0`,
            points: 1,
            explanation: u.description,
            order: order++
          });
          const tbUrl = `${OUP3}/student/headway/${levelData.slug}/testbuilder${CC3}`;
          questions.push({
            text: `Where can you find the Oxford Headway Test Builder for ${u.title}?`,
            question_text: `Where can you find the Oxford Headway Test Builder for ${u.title}?`,
            type: "multiple-choice",
            options: JSON.stringify([
              tbUrl,
              `https://www.cambridge.org/elt/headway`,
              `https://www.bbc.co.uk/learningenglish`,
              `https://www.longman.com/english`
            ]),
            correct_answer: `0`,
            points: 1,
            explanation: `Oxford Headway Test Builder is at: ${tbUrl}`,
            order: order++
          });
          return questions;
        };
        for (let qi = 0; qi < levelData.units.length; qi++) {
          const u = levelData.units[qi];
          emit({ type: "status", message: `Creating quiz for ${u.title}\u2026` });
          const { data: quizData } = await insertCompatibleQuizAdmin({
            course_id: courseId,
            teacher_id: userId,
            module_id: unitModuleIds[qi] || null,
            title: `${u.title.replace(/^Unit \d+ — /, "")} \u2014 Test Builder`,
            description: `Grammar and vocabulary test for ${u.title}. Also open the Oxford Headway Test Builder: ${OUP3}/student/headway/${levelData.slug}/testbuilder${CC3}`,
            time_limit: 20,
            passing_score: 70,
            published: false,
            status: "draft"
          }, userId);
          if (!quizData?.id) {
            console.error("[headway-populate] quiz insert failed (all retries exhausted)");
            continue;
          }
          const questionRows = buildUnitQuestions2(u).map((q) => ({ ...q, quiz_id: quizData.id }));
          if (questionRows.length > 0) {
            let { error: iqErr } = await supabaseAdmin.from("questions").insert(questionRows);
            if (iqErr && /question_text|null value.*text/i.test(iqErr.message + (iqErr.details || ""))) {
              const fallback = questionRows.map((q) => {
                const r = { ...q };
                delete r["text"];
                return r;
              });
              ({ error: iqErr } = await supabaseAdmin.from("questions").insert(fallback));
            }
            if (iqErr) console.error("[headway-populate] questions insert failed:", iqErr.message);
          }
        }
      }
      try {
        await supabaseAdmin.from("courses").update({ level }).eq("id", courseId);
      } catch {
      }
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      try {
        await supabaseAdmin.from("platform_config").upsert(
          { section: `headway_sync:${courseId}`, value: { syncedAt, level, modules: totalModules, lessons: totalLessons }, updated_at: syncedAt },
          { onConflict: "section" }
        );
      } catch {
      }
      emit({ type: "done", modules: totalModules, lessons: totalLessons, level, syncedAt, success: true });
      if (wantStream) {
        res.end();
      } else {
        res.json({ success: true, modules: totalModules, lessons: totalLessons, level });
      }
    } catch (e) {
      console.error("POST /api/teacher/courses/:courseId/headway-populate", e);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", message: e?.message || "Server error" })}

`);
        res.end();
      } else res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.post("/api/teacher/headway/save-unit-quiz", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const courseId = typeof req.body?.courseId === "string" ? req.body.courseId.trim() : "";
      const level = typeof req.body?.level === "string" ? req.body.level.trim() : "";
      const unitNum = Number(req.body?.unitNum ?? 0);
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!courseId) return res.status(400).json({ error: "courseId is required" });
      if (!level) return res.status(400).json({ error: "level is required" });
      if (!unitNum) return res.status(400).json({ error: "unitNum is required" });
      if (!canAccessTeacherCourses(caller, userId)) return res.status(403).json({ error: "Forbidden" });
      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find((u) => u.num === unitNum);
      if (!unit) return res.status(404).json({ error: `Unit ${unitNum} not found` });
      const OUP3 = "https://elt.oup.com";
      const CC3 = "?cc=global&selLanguage=en";
      const tbUrl = `${OUP3}/student/headway/${levelData.slug}/testbuilder${CC3}`;
      const { data: quizData, error: quizErr } = await insertCompatibleQuizAdmin({
        course_id: courseId,
        teacher_id: userId,
        title: `${unit.title.replace(/^Unit \d+ — /, "")} \u2014 Test Builder`,
        description: `Grammar and vocabulary test for ${unit.title}. Also open the Oxford Headway Test Builder: ${tbUrl}
headway:${level}:${unitNum}`,
        time_limit: 20,
        passing_score: 70,
        published: false,
        status: "draft"
      }, userId);
      if (!quizData?.id) {
        const msg = quizErr ? quizErr?.message || String(quizErr) : "Quiz could not be created";
        return res.status(400).json({ error: msg });
      }
      const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      let questionRows = [];
      if (aiApiKey && (unit.grammar.length > 0 || unit.vocabulary.length > 0)) {
        try {
          const cefrMap = {
            "Beginner": "A1",
            "Elementary": "A2",
            "Pre-Intermediate": "B1",
            "Intermediate": "B1+",
            "Upper-Intermediate": "B2",
            "Advanced": "C1"
          };
          const cefr = cefrMap[level] || "B1";
          const topics = [
            ...unit.grammar.map((g2) => ({ type: "grammar", topic: g2.topic })),
            ...unit.vocabulary.map((v2) => ({ type: "vocabulary", topic: v2.topic }))
          ];
          const prompt = `You are an Oxford Headway English language test generator.
Level: ${level} (${cefr}) \u2014 ${unit.title}
Unit theme: ${unit.description}

Generate ONE fill-in-the-blank multiple-choice question for each topic below.
Each question must be a realistic English sentence with _____ (5 underscores) for the blank.
Provide 4 plausible options where exactly ONE is correct.

Topics:
${topics.map((t, i) => `${i + 1}. [${t.type}] ${t.topic}`).join("\n")}

Return ONLY a valid JSON array \u2014 no markdown, no code fences:
[{"topic":"...","type":"grammar","text":"She _____ to work.","options":["goes","is going","went","has gone"],"correct":0,"explanation":"..."}]`;
          const { GoogleGenAI } = await import("@google/genai");
          const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
          const ai = geminiBaseUrl ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } }) : new GoogleGenAI({ apiKey: aiApiKey });
          const aiResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { temperature: 0.4 }
          });
          const raw = (aiResult.text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            questionRows = parsed.filter((q) => q && typeof q.text === "string" && Array.isArray(q.options)).map((q, idx) => {
              const correctIdx = Math.max(0, Math.min(3, Number(q.correct) || 0));
              const opts = q.options.slice(0, 4);
              const correctText = opts[correctIdx];
              const shuffled = [...opts].sort(() => Math.random() - 0.5);
              const foundIdx = shuffled.indexOf(correctText);
              const safeIdx = foundIdx === -1 ? 0 : foundIdx;
              const optionObjects = shuffled.map((text, i) => ({ id: String(i + 1), text }));
              return {
                quiz_id: quizData.id,
                type: "multiple-choice",
                text: String(q.text),
                question_text: String(q.text),
                options: optionObjects,
                correct_answer: String(safeIdx + 1),
                explanation: String(q.explanation || ""),
                points: 1,
                order: idx
              };
            });
          }
        } catch (aiErr) {
          console.warn("[save-unit-quiz] AI generation failed, using static bank:", aiErr?.message);
        }
      }
      if (questionRows.length === 0) {
        questionRows = buildUnitQuestions(unit, levelData.slug).map((q, idx) => {
          const correctText = q.options[q.correctIndex];
          const shuffled = [...q.options].sort(() => Math.random() - 0.5);
          const foundIdx = shuffled.indexOf(correctText);
          const safeIdx = foundIdx === -1 ? 0 : foundIdx;
          const optionObjects = shuffled.map((text, i) => ({ id: String(i + 1), text }));
          return {
            quiz_id: quizData.id,
            type: "multiple-choice",
            text: q.questionText,
            question_text: q.questionText,
            options: optionObjects,
            correct_answer: String(safeIdx + 1),
            explanation: q.explanation,
            points: 1,
            order: idx
          };
        });
      }
      if (questionRows.length > 0) {
        const pointsEach = Math.round(100 / questionRows.length);
        questionRows = questionRows.map((r) => ({ ...r, points: pointsEach }));
      }
      if (questionRows.length > 0) {
        let { error: iqErr } = await supabaseAdmin.from("questions").insert(questionRows);
        if (iqErr && /question_text|null value.*text/i.test(iqErr.message + (iqErr.details || ""))) {
          const fallback = questionRows.map((q) => {
            const r = { ...q };
            delete r["text"];
            return r;
          });
          ({ error: iqErr } = await supabaseAdmin.from("questions").insert(fallback));
        }
        if (iqErr) console.warn("[save-unit-quiz] questions insert warning:", iqErr.message);
      }
      try {
        await supabaseAdmin.from("courses").update({ level }).eq("id", courseId);
      } catch {
      }
      return res.json({ success: true, quizId: quizData.id, questions: questionRows.length });
    } catch (e) {
      console.error("POST /api/teacher/headway/save-unit-quiz", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.get("/api/teacher/headway-preview", (req, res) => {
    try {
      const level = typeof req.query.level === "string" ? req.query.level.trim() : "";
      const unitNum = parseInt(String(req.query.unit ?? "1"), 10);
      if (!level) return res.status(400).json({ error: "level query param required" });
      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find((u) => u.num === unitNum);
      if (!unit) return res.status(404).json({ error: `Unit ${unitNum} not found for level "${level}"` });
      const questions = buildUnitQuestions(unit, levelData.slug);
      return res.json({ level, unit: unitNum, title: unit.title, description: unit.description, questions });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.post("/api/teacher/headway/generate-questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const level = typeof req.body?.level === "string" ? req.body.level.trim() : "";
      const unitNum = Number(req.body?.unitNum ?? 0);
      if (!level) return res.status(400).json({ error: "level is required" });
      if (!unitNum) return res.status(400).json({ error: "unitNum is required" });
      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find((u) => u.num === unitNum);
      if (!unit) return res.status(404).json({ error: `Unit ${unitNum} not found` });
      const apiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ error: "AI not configured \u2014 set GEMINI_API_KEY in Secrets." });
      const topics = [
        ...unit.grammar.map((g2) => ({ type: "grammar", topic: g2.topic })),
        ...unit.vocabulary.map((v2) => ({ type: "vocabulary", topic: v2.topic }))
      ];
      if (topics.length === 0) {
        return res.json({ level, unitNum, title: unit.title, questions: [] });
      }
      const cefrMap = {
        "Beginner": "A1",
        "Elementary": "A2",
        "Pre-Intermediate": "B1",
        "Intermediate": "B1+",
        "Upper-Intermediate": "B2",
        "Advanced": "C1"
      };
      const cefr = cefrMap[level] || "B1";
      const prompt = `You are an Oxford Headway English language test generator.
Level: ${level} (${cefr}) \u2014 ${unit.title}
Unit theme: ${unit.description}

Generate ONE fill-in-the-blank multiple-choice question for each topic below.
Each question must be a realistic English sentence with _____ (5 underscores) for the blank.
Provide 4 plausible options where exactly ONE is correct. Use vocabulary and grammar appropriate for ${cefr} learners.

Topics:
${topics.map((t, i) => `${i + 1}. [${t.type}] ${t.topic}`).join("\n")}

Return ONLY a valid JSON array \u2014 no markdown, no code fences, no extra text:
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
      const ai = geminiBaseUrl ? new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } }) : new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.4 }
      });
      const raw = (result.text || "").trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      let questions;
      try {
        questions = JSON.parse(cleaned);
      } catch {
        console.error("[headway/generate-questions] JSON parse error. Raw:", cleaned.slice(0, 300));
        return res.status(500).json({ error: "AI returned invalid JSON. Please try again." });
      }
      if (!Array.isArray(questions)) {
        return res.status(500).json({ error: "AI did not return an array." });
      }
      const sanitised = questions.filter((q) => q && typeof q.text === "string" && Array.isArray(q.options)).map((q, idx) => {
        const correctIdx = Math.max(0, Math.min(3, Number(q.correct) || 0));
        const opts = q.options.slice(0, 4);
        const correctText = opts[correctIdx];
        const shuffled = [...opts].sort(() => Math.random() - 0.5);
        const foundIdx = shuffled.indexOf(correctText);
        const safeIdx = foundIdx === -1 ? 0 : foundIdx;
        return {
          order: idx,
          type: q.type === "vocabulary" ? "vocabulary" : "grammar",
          topic: String(q.topic || ""),
          questionText: String(q.text || ""),
          text: String(q.text || ""),
          options: shuffled,
          correctIndex: safeIdx,
          correct_answer: shuffled[safeIdx],
          explanation: String(q.explanation || ""),
          oxfordUrl: `${OUP}/student/headway/${levelData.slug}/testbuilder${CC}`
        };
      });
      return res.json({ level, unitNum, title: unit.title, questions: sanitised });
    } catch (e) {
      console.error("POST /api/teacher/headway/generate-questions", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.get("/api/teacher/headway/media", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const levelSlug = typeof req.query.levelSlug === "string" ? req.query.levelSlug.trim() : "";
      const unitNum = parseInt(String(req.query.unitNum ?? "0"), 10);
      if (!levelSlug || !unitNum) return res.status(400).json({ error: "levelSlug and unitNum required" });
      const { data: rows, error } = await supabaseAdmin.from("headway_media").select("title, file_name, url, mime_type, type").ilike("level", levelSlug).eq("unit_number", unitNum);
      if (error) {
        if (error.code === "42P01") return res.json({ files: [] });
        throw new Error(error.message);
      }
      const files = (rows ?? []).map((r) => ({
        name: r.file_name || r.title,
        path: r.url,
        url: r.url,
        // Normalise type: student_audio / workbook_audio → "audio", video → "video"
        type: String(r.type || "").includes("video") ? "video" : "audio"
      }));
      return res.json({ files });
    } catch (e) {
      console.error("GET /api/teacher/headway/media", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.post("/api/teacher/headway/media/upload-url", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const levelSlug = typeof req.body?.levelSlug === "string" ? req.body.levelSlug.trim() : "";
      const unitNum = Number(req.body?.unitNum ?? 0);
      const type = req.body?.type === "video" ? "video" : "audio";
      const rawName = typeof req.body?.filename === "string" ? req.body.filename.trim() : "file";
      if (!levelSlug || !unitNum) return res.status(400).json({ error: "levelSlug and unitNum required" });
      const safe = rawName.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_");
      const storagePath = `${levelSlug}/${unitNum}/${type}/${safe}`;
      const { data, error } = await supabaseAdmin.storage.from("headway-media").createSignedUploadUrl(storagePath);
      if (error || !data) {
        return res.status(500).json({ error: error?.message || "Could not create upload URL" });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
      return res.json({ signedUrl: data.signedUrl, path: storagePath, publicUrl });
    } catch (e) {
      console.error("POST /api/teacher/headway/media/upload-url", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.delete("/api/teacher/headway/media", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const path3 = typeof req.body?.path === "string" ? req.body.path.trim() : "";
      if (!path3) return res.status(400).json({ error: "path required" });
      if (path3.includes("..")) return res.status(400).json({ error: "Invalid path" });
      const { error } = await supabaseAdmin.storage.from("headway-media").remove([path3]);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    } catch (e) {
      console.error("DELETE /api/teacher/headway/media", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.post("/api/teacher/headway/import-unit-audio", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const level = typeof req.body?.level === "string" ? req.body.level.trim() : "";
      const levelSlug = typeof req.body?.levelSlug === "string" ? req.body.levelSlug.trim() : "";
      const unitNum = Number(req.body?.unitNum ?? 0);
      const mediaType = req.body?.type === "video" ? "video" : "audio";
      if (!level || !levelSlug || !unitNum) {
        return res.status(400).json({ error: "level, levelSlug, and unitNum are required" });
      }
      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level: ${level}` });
      const unit = levelData.units.find((u) => u.num === unitNum);
      if (!unit) return res.status(400).json({ error: `Unit ${unitNum} not found in level ${level}` });
      const zipUrl = mediaType === "video" ? unit.videoZip : unit.audioZip;
      if (!zipUrl) return res.status(400).json({ error: `No ${mediaType} ZIP available for ${level} Unit ${unitNum}` });
      const zipRes = await fetch(zipUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Headway-Importer/1.0)" },
        signal: AbortSignal.timeout(6e4)
      });
      if (!zipRes.ok) {
        return res.status(502).json({ error: `OUP server returned ${zipRes.status}: ${zipRes.statusText}` });
      }
      const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
      const unzipper = _require("unzipper");
      const directory = await unzipper.Open.buffer(zipBuffer);
      const allowedExts = mediaType === "video" ? [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"] : [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
      const mediaFiles = directory.files.filter((f) => {
        if (f.type !== "File") return false;
        const ext = f.path.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
        return allowedExts.includes(ext);
      });
      if (mediaFiles.length === 0) {
        return res.status(422).json({ error: "No audio/video files found in the ZIP" });
      }
      const prefix = `${levelSlug}/${unitNum}/${mediaType}`;
      const { data: existing } = await supabaseAdmin.storage.from("headway-media").list(prefix);
      const existingNames = new Set((existing ?? []).map((f) => f.name));
      const results = [];
      for (const file of mediaFiles) {
        const rawName = file.path.split("/").pop() ?? file.path;
        const safe = rawName.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_");
        const storagePath = `${prefix}/${safe}`;
        if (existingNames.has(safe)) {
          const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
          results.push({ name: safe, path: storagePath, url: publicUrl, type: mediaType });
          continue;
        }
        const content = await file.buffer();
        const mimeType = mediaType === "video" ? "video/mp4" : "audio/mpeg";
        const { error: uploadErr } = await supabaseAdmin.storage.from("headway-media").upload(storagePath, content, { contentType: mimeType, upsert: false });
        if (!uploadErr) {
          const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
          results.push({ name: safe, path: storagePath, url: publicUrl, type: mediaType });
        }
      }
      return res.json({ files: results, imported: results.length });
    } catch (e) {
      console.error("POST /api/teacher/headway/import-unit-audio", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.get("/api/teacher/headway/drive-config", (_req, res) => {
    return res.json({ configured: Boolean(process.env.GOOGLE_API_KEY?.trim()) });
  });
  app.post("/api/teacher/headway/drive-import/start", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const apiKey = process.env.GOOGLE_API_KEY?.trim();
      if (!apiKey) return res.status(503).json({ error: "GOOGLE_API_KEY not configured in Replit Secrets" });
      const level = String(req.body?.level || "Beginner").trim();
      const courseId = typeof req.body?.courseId === "string" ? req.body.courseId.trim() : void 0;
      const jobId = `hw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const job = { status: "running", total: 0, done: 0, skipped: 0, errors: [], logs: [] };
      driveImportJobs.set(jobId, job);
      console.log(`[drive-import] Starting job ${jobId} for level="${level}"${courseId ? ` courseId=${courseId}` : ""}`);
      try {
        await supabaseAdmin.rpc("exec_sql", {
          sql: "ALTER TABLE headway_media ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;"
        });
      } catch {
      }
      const levelFolders = LEVEL_DRIVE_FOLDERS[level] ?? LEVEL_DRIVE_FOLDERS["Beginner"];
      job.logs.push(`\u{1F4DA} Level: ${level}${courseId ? " \xB7 linked to course" : ""} \u2014 ${Object.keys(levelFolders).length} folder(s) configured`);
      res.json({ jobId });
      (async () => {
        for (const [type, folderId] of Object.entries(levelFolders)) {
          try {
            job.logs.push(`\u{1F4C2} Listing ${type} folder\u2026`);
            const allEntries = await listDriveFolder(folderId, apiKey);
            const zipFiles = allEntries.filter((f) => /\.zip$/i.test(f.name));
            const plainMedia = allEntries.filter(
              (f) => !f.name.toLowerCase().endsWith(".zip") && f.mimeType !== "application/vnd.google-apps.folder" && MEDIA_EXTS.has((f.name.split(".").pop() || "").toLowerCase())
            );
            job.logs.push(`   \u21B3 ${zipFiles.length} ZIP(s), ${plainMedia.length} plain media file(s)`);
            for (const zipFile of zipFiles) {
              try {
                job.logs.push(`\u{1F4E6} Downloading ZIP: ${zipFile.name}\u2026`);
                const zipBuf = await downloadDriveFileBuffer(zipFile.id, apiKey);
                job.logs.push(`   \u21B3 ${(zipBuf.length / 1024 / 1024).toFixed(1)} MB \u2014 extracting\u2026`);
                await processZipEntries(zipBuf, zipFile.name, zipFile.id, type, level, job, courseId);
              } catch (err) {
                job.errors.push(`${zipFile.name}: ${err?.message}`);
                job.logs.push(`\u2717 ${zipFile.name}: ${err?.message}`);
              }
              await new Promise((r) => setTimeout(r, 200));
            }
            for (const driveFile of plainMedia) {
              try {
                const compositeId = driveFile.id;
                const { data: existing } = await supabaseAdmin.from("headway_media").select("id").eq("drive_file_id", compositeId).maybeSingle();
                if (existing) {
                  job.skipped++;
                  job.logs.push(`\u21B7 Skip (exists): ${driveFile.name}`);
                  continue;
                }
                const unitNum = detectUnitNumber(driveFile.name);
                const ext = (driveFile.name.split(".").pop() || "").toLowerCase();
                const mime = mimeForExt(ext);
                const fileBuf = await downloadDriveFileBuffer(driveFile.id, apiKey);
                const safeName = driveFile.name.replace(/\s+/g, "_");
                const storagePath = `headway/${level}/${type}/unit${unitNum ?? 0}/${safeName}`;
                const { error: uploadErr } = await supabaseAdmin.storage.from("headway-media").upload(storagePath, fileBuf, { contentType: mime, upsert: true });
                if (uploadErr) throw new Error(`Storage: ${uploadErr.message}`);
                const { data: { publicUrl } } = supabaseAdmin.storage.from("headway-media").getPublicUrl(storagePath);
                const title = safeName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim();
                const insertRow = {
                  level,
                  unit_number: unitNum,
                  type,
                  title,
                  file_name: safeName,
                  drive_file_id: compositeId,
                  url: publicUrl,
                  mime_type: mime,
                  size_bytes: fileBuf.length
                };
                if (courseId) insertRow.course_id = courseId;
                let insResult2 = await supabaseAdmin.from("headway_media").insert(insertRow);
                if (insertRow.course_id && isMissingColumnError(insResult2.error, "course_id")) {
                  const { course_id: _dropped, ...rowWithoutCourse } = insertRow;
                  insResult2 = await supabaseAdmin.from("headway_media").insert(rowWithoutCourse);
                }
                if (insResult2.error) {
                  if (insResult2.error.code === "42P01") throw new Error("headway_media table not found \u2014 run migration 014");
                  throw new Error(insResult2.error.message);
                }
                job.done++;
                job.total++;
                job.logs.push(`\u2713 ${driveFile.name}${unitNum ? ` \u2192 Unit ${unitNum}` : ""}`);
              } catch (err) {
                job.errors.push(`${driveFile.name}: ${err?.message}`);
                job.logs.push(`\u2717 ${driveFile.name}: ${err?.message}`);
              }
            }
          } catch (err) {
            job.errors.push(`${type}: ${err?.message}`);
            job.logs.push(`\u2717 Folder ${type}: ${err?.message}`);
          }
        }
        job.status = job.done === 0 && job.errors.length > 0 ? "error" : "done";
        job.logs.push(`\u{1F3C1} Done \u2014 ${job.done} imported, ${job.skipped} skipped, ${job.errors.length} errors`);
        console.log(`[drive-import] Job ${jobId} finished \u2014 done=${job.done} skipped=${job.skipped} errors=${job.errors.length}`);
        if (job.errors.length > 0) console.warn("[drive-import] Errors:", job.errors.slice(0, 5).join(" | "));
      })().catch((err) => {
        job.status = "error";
        job.errors.push(String(err?.message || err));
        job.logs.push(`\u2717 Fatal: ${err?.message}`);
        console.error(`[drive-import] Job ${jobId} fatal error:`, err?.message);
      });
    } catch (e) {
      console.error("POST /api/teacher/headway/drive-import/start", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.get("/api/teacher/headway/drive-import/:jobId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const job = driveImportJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      return res.json(job);
    } catch (e) {
      return res.status(500).json({ error: e?.message });
    }
  });
  app.post("/api/teacher/headway/lessons-media-summary", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const lessonIds = Array.isArray(req.body?.lessonIds) ? req.body.lessonIds.slice(0, 200) : [];
      if (lessonIds.length === 0) return res.json({ summary: {} });
      const summary = {};
      const { data: byId, error: e1 } = await supabaseAdmin.from("headway_media").select("lesson_id, type, level, unit_number").in("lesson_id", lessonIds);
      if (e1 && e1.code !== "42P01") throw e1;
      for (const row of byId ?? []) {
        const lid = String(row.lesson_id || "");
        if (!lid) continue;
        if (!summary[lid]) summary[lid] = { audioCount: 0, videoCount: 0, level: row.level || "", unit: row.unit_number ?? null };
        if (String(row.type || "").includes("video")) summary[lid].videoCount++;
        else summary[lid].audioCount++;
      }
      const unresolved = lessonIds.filter((id) => !summary[id]);
      if (unresolved.length > 0) {
        const { data: lessonRows } = await supabaseAdmin.from("lessons").select("id, short_description").in("id", unresolved);
        const tagGroups = /* @__PURE__ */ new Map();
        for (const row of lessonRows ?? []) {
          const desc = String(row.short_description || "");
          const m = desc.match(/headway:([^:\n\s]+):(\d+)/i);
          if (!m) continue;
          const lvl = m[1].trim();
          const unit = parseInt(m[2], 10);
          const key = `${lvl.toLowerCase()}:${unit}`;
          if (!tagGroups.has(key)) tagGroups.set(key, { level: lvl, unit, lessonIds: [] });
          tagGroups.get(key).lessonIds.push(String(row.id));
        }
        for (const { level: lvl, unit, lessonIds: lids } of tagGroups.values()) {
          const { data: mediaRows } = await supabaseAdmin.from("headway_media").select("type, level").ilike("level", lvl).eq("unit_number", unit);
          if (!mediaRows?.length) continue;
          let audioCount = 0, videoCount = 0;
          for (const mr of mediaRows) {
            if (String(mr.type || "").includes("video")) videoCount++;
            else audioCount++;
          }
          if (audioCount === 0 && videoCount === 0) continue;
          const levelDisplay = mediaRows[0].level || lvl;
          for (const lid of lids) {
            summary[lid] = { audioCount, videoCount, level: levelDisplay, unit };
          }
        }
      }
      return res.json({ summary });
    } catch (e) {
      console.error("POST /api/teacher/headway/lessons-media-summary", e);
      return res.status(500).json({ error: e?.message });
    }
  });
  app.get("/api/teacher/headway/lesson-media/:lessonId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const lessonId = String(req.params.lessonId || "").trim();
      if (!lessonId) return res.status(400).json({ error: "lessonId required" });
      const { data: byLesson, error: e1 } = await supabaseAdmin.from("headway_media").select("id, title, file_name, url, mime_type, type, level, unit_number").eq("lesson_id", lessonId).order("type", { ascending: true }).order("file_name", { ascending: true });
      if (e1 && e1.code !== "42P01") throw e1;
      const { data: lessonRow } = await supabaseAdmin.from("lessons").select("short_description").eq("id", lessonId).maybeSingle();
      let byUnit = [];
      const desc = String(lessonRow?.short_description || "");
      const hwMatch = desc.match(/headway:([^:\n]+):(\d+)/i);
      if (hwMatch) {
        const levelSlug = hwMatch[1].trim();
        const unitNum = parseInt(hwMatch[2], 10);
        const { data: unitRows } = await supabaseAdmin.from("headway_media").select("id, title, file_name, url, mime_type, type, level, unit_number").ilike("level", levelSlug).eq("unit_number", unitNum).order("type", { ascending: true }).order("file_name", { ascending: true });
        byUnit = unitRows ?? [];
      }
      const allRows = [...byLesson ?? [], ...byUnit];
      const seen = /* @__PURE__ */ new Set();
      const files = allRows.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      }).map((r) => ({
        id: r.id,
        name: r.file_name || r.title || "Media",
        url: r.url,
        type: String(r.type || "").includes("video") ? "video" : "audio",
        mime_type: r.mime_type,
        level: r.level,
        unit_number: r.unit_number
      }));
      return res.json({ files });
    } catch (e) {
      console.error("GET /api/teacher/headway/lesson-media", e);
      return res.status(500).json({ error: e?.message });
    }
  });
  app.get("/api/teacher/headway/drive-media", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const level = typeof req.query.level === "string" ? req.query.level : "Beginner";
      const unitNum = req.query.unit ? parseInt(String(req.query.unit), 10) : void 0;
      const type = typeof req.query.type === "string" ? req.query.type : void 0;
      const courseId = typeof req.query.courseId === "string" ? req.query.courseId.trim() : void 0;
      let q = supabaseAdmin.from("headway_media").select("*").eq("level", level).order("unit_number", { ascending: true, nullsFirst: false }).order("file_name", { ascending: true });
      if (unitNum) q = q.eq("unit_number", unitNum);
      if (type) q = q.eq("type", type);
      if (courseId) q = q.eq("course_id", courseId);
      const { data, error } = await q;
      if (error) {
        if (error.code === "42P01") return res.json({ media: [] });
        if (isMissingColumnError(error, "course_id")) return res.json({ media: [] });
        throw error;
      }
      return res.json({ media: data ?? [] });
    } catch (e) {
      console.error("GET /api/teacher/headway/drive-media", e);
      return res.status(500).json({ error: e?.message });
    }
  });
  app.delete("/api/teacher/headway/drive-media/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const { error } = await supabaseAdmin.from("headway_media").delete().eq("id", req.params.id);
      if (error) throw error;
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message });
    }
  });
  app.delete("/api/teacher/headway/drive-media", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const level = typeof req.query.level === "string" ? req.query.level.trim() : "";
      let query = supabaseAdmin.from("headway_media").delete();
      if (level) {
        query = query.ilike("level", level);
      } else {
        const confirm = req.headers["x-confirm-delete-all"];
        if (confirm !== "yes") {
          return res.status(400).json({ error: "Pass header x-confirm-delete-all: yes to delete all media" });
        }
        query = query.neq("id", "00000000-0000-0000-0000-000000000000");
      }
      const { error, count } = await query.select("id", { count: "exact", head: true });
      let delQuery = supabaseAdmin.from("headway_media").delete();
      if (level) {
        delQuery = delQuery.ilike("level", level);
      } else {
        delQuery = delQuery.neq("id", "00000000-0000-0000-0000-000000000000");
      }
      const { error: delErr } = await delQuery;
      if (delErr) throw delErr;
      return res.json({ success: true, level: level || "all" });
    } catch (e) {
      console.error("DELETE /api/teacher/headway/drive-media (bulk)", e);
      return res.status(500).json({ error: e?.message });
    }
  });
  app.get("/api/teacher/headway/drive-stream/:fileId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const fileId = String(req.params.fileId || "").trim();
      if (!fileId) return res.status(400).json({ error: "fileId required" });
      const apiKey = process.env.GOOGLE_API_KEY?.trim();
      const downloadUrl = apiKey ? `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&key=${apiKey}` : `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      const reqHeaders = { "User-Agent": "Mozilla/5.0" };
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
      const reader = driveRes.body.getReader();
      const pump = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          pump();
        }).catch(() => {
          try {
            res.end();
          } catch {
          }
        });
      };
      pump();
    } catch (e) {
      console.error("GET /api/teacher/headway/drive-stream", e);
      if (!res.headersSent) res.status(500).json({ error: e?.message });
    }
  });
  app.post("/api/teacher/exams/:id/generate-ai-questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!["admin", "teacher"].includes(caller.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const examId = req.params.id?.trim();
      if (!examId) return res.status(400).json({ error: "examId is required" });
      const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
      const level = typeof req.body?.level === "string" ? req.body.level.trim() : "intermediate";
      const count = Math.min(30, Math.max(1, parseInt(req.body?.count ?? "10", 10)));
      const language = typeof req.body?.language === "string" ? req.body.language.trim() : "English";
      if (!topic) return res.status(400).json({ error: "topic is required" });
      const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      if (!aiApiKey) {
        const levelMap = {
          beginner: "Beginner",
          elementary: "Elementary",
          "pre-intermediate": "Pre-Intermediate",
          intermediate: "Intermediate",
          "upper-intermediate": "Upper-Intermediate",
          advanced: "Advanced"
        };
        const normLevel = levelMap[level.toLowerCase()] ?? "Intermediate";
        let staticQs = getQuestionsForSection(normLevel, topic, count);
        if (staticQs.length < count) {
          const usedTexts = new Set(staticQs.map((q) => q.text));
          const levelSections = HEADWAY_QUESTIONS[normLevel] ?? [];
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
        const valid2 = staticQs.map((q, i) => {
          const correctText = q.options[q.correct] ?? q.options[0];
          const shuffledOpts = [...q.options].sort(() => Math.random() - 0.5);
          return {
            text: q.text,
            options: shuffledOpts,
            correct_answer: correctText,
            explanation: q.explanation || "",
            order: i,
            points: 1
          };
        });
        console.log(`[exam-builder] Static bank fallback: ${valid2.length} questions for topic="${topic}" level="${normLevel}"`);
        return res.json({ questions: valid2 });
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
- Return ONLY valid JSON \u2014 no explanation, no markdown fences.

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
      const ai = geminiBaseUrl ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } }) : new GoogleGenAI({ apiKey: aiApiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.7, maxOutputTokens: 8192 }
      });
      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      let questions = [];
      try {
        questions = JSON.parse(cleaned);
        if (!Array.isArray(questions)) throw new Error("Not an array");
      } catch {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) questions = JSON.parse(match[0]);
        else return res.status(502).json({ error: "AI returned invalid JSON", raw: cleaned.slice(0, 500) });
      }
      const valid = questions.filter((q) => q && typeof q.text === "string" && Array.isArray(q.options) && q.options.length >= 2).slice(0, count).map((q, i) => ({
        text: q.text,
        options: q.options.slice(0, 4),
        correct_answer: q.correct_answer || q.options[0],
        explanation: q.explanation || "",
        order: i,
        points: 1
      }));
      return res.json({ questions: valid });
    } catch (e) {
      console.error("POST /api/teacher/exams/:id/generate-ai-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to generate questions" });
    }
  });
  app.post("/api/teacher/exams/question-counts", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === "string") : [];
      if (ids.length === 0) return res.json({ counts: {} });
      const { data, error } = await supabaseAdmin.from("questions").select("quiz_id").in("quiz_id", ids);
      if (error) throw error;
      const counts = {};
      (data || []).forEach((r) => {
        if (r?.quiz_id) counts[r.quiz_id] = (counts[r.quiz_id] || 0) + 1;
      });
      return res.json({ counts });
    } catch (e) {
      console.error("POST /api/teacher/exams/question-counts", e);
      return res.status(500).json({ error: e?.message || "Failed to count questions" });
    }
  });
  app.post("/api/teacher/exams/:id/save-questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const examId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!examId) return res.status(400).json({ error: "Exam id is required" });
      const rows = req.body?.questions;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "Body must include questions: []" });
      }
      const { data: examRow, error: examErr } = await supabaseAdmin.from("quizzes").select("id").eq("id", examId).maybeSingle();
      if (examErr) throw examErr;
      if (!examRow?.id) return res.status(404).json({ error: "Exam not found." });
      const { error: delErr } = await supabaseAdmin.from("questions").delete().eq("quiz_id", examId);
      if (delErr) throw delErr;
      if (rows.length === 0) return res.json({ success: true });
      const qtext = (r) => {
        const raw = r.text ?? r.question_text;
        if (typeof raw === "string" && raw.trim()) return raw.trim();
        return " ";
      };
      const buildRows = (mode) => rows.map((r, idx) => {
        const t = qtext(r);
        const row = {
          quiz_id: examId,
          type: "multiple-choice",
          options: r.options ?? null,
          correct_answer: r.correct_answer ?? null,
          explanation: r.explanation ?? null,
          points: (() => {
            const n = Number(r.points);
            return Number.isFinite(n) ? n : 1;
          })(),
          order: typeof r.order === "number" ? r.order : idx
        };
        if (mode === "both") {
          row.text = t;
          row.question_text = t;
        } else {
          row[mode] = t;
        }
        return row;
      });
      const errStr = (e) => e ? [e.message, e.details, e.hint, e.code].filter(Boolean).join(" \u2014 ") : "";
      let { error: insErr } = await supabaseAdmin.from("questions").insert(buildRows("text"));
      if (insErr && (/question_text/i.test(errStr(insErr)) || /null value[^\n]*question_text/i.test(errStr(insErr)) || /column[^\n]*\btext\b.*does not exist/i.test(errStr(insErr)))) {
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(buildRows("question_text")));
      }
      if (insErr && (/null value[^\n]*\btext\b/i.test(errStr(insErr)) || /column[^\n]*question_text.*does not exist/i.test(errStr(insErr)))) {
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(buildRows("both")));
      }
      if (insErr) {
        const msg = [insErr.message, insErr.details, insErr.hint].filter(Boolean).join(" \u2014 ") || "Insert failed";
        return res.status(400).json({ error: msg });
      }
      return res.json({ success: true, count: rows.length });
    } catch (e) {
      console.error("POST /api/teacher/exams/:id/save-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to save questions" });
    }
  });
  app.post("/api/teacher/headway/regenerate-quiz", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const quizId = typeof req.body?.quizId === "string" ? req.body.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "quizId is required" });
      const { data: quiz, error: qErr } = await supabaseAdmin.from("quizzes").select("id, description").eq("id", quizId).maybeSingle();
      if (qErr || !quiz) return res.status(404).json({ error: "Quiz not found" });
      const match = String(quiz.description || "").match(/headway:([^:\n]+):(\d+)/);
      if (!match) return res.status(400).json({ error: "Quiz is not a Headway unit quiz" });
      const level = match[1];
      const unitNum = parseInt(match[2], 10);
      const levelData = HEADWAY_FULL_DATA[level];
      if (!levelData) return res.status(400).json({ error: `Unknown level "${level}"` });
      const unit = levelData.units.find((u) => u.num === unitNum);
      if (!unit) return res.status(404).json({ error: `Unit ${unitNum} not found` });
      const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      if (!aiApiKey) return res.status(503).json({ error: "AI not configured \u2014 set GEMINI_API_KEY in Secrets." });
      const cefrMap = {
        "Beginner": "A1",
        "Elementary": "A2",
        "Pre-Intermediate": "B1",
        "Intermediate": "B1+",
        "Upper-Intermediate": "B2",
        "Advanced": "C1"
      };
      const cefr = cefrMap[level] || "B1";
      const topics = [
        ...unit.grammar.map((g2) => ({ type: "grammar", topic: g2.topic })),
        ...unit.vocabulary.map((v2) => ({ type: "vocabulary", topic: v2.topic }))
      ];
      if (topics.length === 0) return res.status(400).json({ error: "Unit has no grammar/vocabulary topics" });
      const prompt = `You are an Oxford Headway English language test generator.
Level: ${level} (${cefr}) \u2014 ${unit.title}
Unit theme: ${unit.description}

Generate ONE fill-in-the-blank multiple-choice question for each topic below.
Each question must be a realistic English sentence with _____ (5 underscores) for the blank.
Provide 4 plausible options where exactly ONE is correct. Use vocabulary and grammar appropriate for ${cefr} learners.

Topics:
${topics.map((t, i) => `${i + 1}. [${t.type}] ${t.topic}`).join("\n")}

Return ONLY a valid JSON array \u2014 no markdown, no code fences, no extra text:
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
      const ai = geminiBaseUrl ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } }) : new GoogleGenAI({ apiKey: aiApiKey });
      const aiResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.5 }
      });
      const raw = (aiResult.text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(500).json({ error: "AI returned invalid JSON. Please try again." });
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return res.status(500).json({ error: "AI did not return valid questions." });
      }
      const rawRows = parsed.filter((q) => q && typeof q.text === "string" && Array.isArray(q.options)).map((q, idx) => {
        const correctIdx = Math.max(0, Math.min(3, Number(q.correct) || 0));
        const opts = q.options.slice(0, 4);
        const correctText = opts[correctIdx];
        const shuffled = [...opts].sort(() => Math.random() - 0.5);
        const foundIdx = shuffled.indexOf(correctText);
        const safeIdx = foundIdx === -1 ? 0 : foundIdx;
        const optionObjects = shuffled.map((text, i) => ({ id: String(i + 1), text }));
        return {
          quiz_id: quizId,
          type: "multiple-choice",
          text: String(q.text),
          question_text: String(q.text),
          options: optionObjects,
          correct_answer: String(safeIdx + 1),
          explanation: String(q.explanation || ""),
          points: 1,
          order: idx
        };
      });
      const pointsEach = rawRows.length > 0 ? Math.round(100 / rawRows.length) : 10;
      const newRows = rawRows.map((r) => ({ ...r, points: pointsEach }));
      await supabaseAdmin.from("questions").delete().eq("quiz_id", quizId);
      let { error: insErr } = await supabaseAdmin.from("questions").insert(newRows);
      if (insErr && /question_text|null value.*text/i.test(insErr.message + (insErr.details || ""))) {
        const fallback = newRows.map((r) => {
          const x = { ...r };
          delete x["text"];
          return x;
        });
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(fallback));
      }
      if (insErr) {
        console.warn("[regenerate-quiz] insert warning:", insErr.message);
        return res.status(500).json({ error: insErr.message });
      }
      return res.json({ success: true, quizId, questions: newRows.length, level, unitNum });
    } catch (e) {
      console.error("POST /api/teacher/headway/regenerate-quiz", e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });
  app.get("/api/teacher/headway/saved-quizzes", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { data: quizzes } = await supabaseAdmin.from("quizzes").select("id, description").ilike("description", "%headway:%");
      const saved = [];
      for (const quiz of quizzes ?? []) {
        const match = String(quiz.description || "").match(/headway:([^:\n]+):(\d+)/);
        if (match) {
          saved.push({ level: match[1], unitNum: parseInt(match[2], 10), quizId: quiz.id });
        }
      }
      return res.json({ saved });
    } catch (e) {
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
      const { data: lesson, error: lErr } = await supabaseAdmin.from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
      if (lErr) throw lErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found." });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this lesson." });
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (typeof req.body.title === "string") updates.title = req.body.title.trim();
      if (req.body.slug !== void 0) updates.slug = req.body.slug || null;
      if (req.body.short_description !== void 0) updates.short_description = req.body.short_description || null;
      if (req.body.type !== void 0) updates.type = req.body.type;
      if (req.body.duration_minutes !== void 0) updates.duration_minutes = Number(req.body.duration_minutes) || 0;
      if (req.body.order !== void 0) updates.order = Number(req.body.order) || 1;
      if (req.body.status !== void 0) updates.status = req.body.status;
      if (req.body.is_free_preview !== void 0) updates.is_free_preview = Boolean(req.body.is_free_preview);
      if (req.body.module_id !== void 0) updates.module_id = req.body.module_id;
      if ("publish_at" in req.body) updates.publish_at = req.body.publish_at ? new Date(req.body.publish_at).toISOString() : null;
      if (req.body.course_id !== void 0) {
        const cg = await assertTeacherOwnsCourse(userId, req.body.course_id);
        if (!cg.ok) return res.status(403).json({ error: "Invalid course for this lesson." });
        updates.course_id = req.body.course_id;
      }
      const { data, error } = await supabaseAdmin.from("lessons").update(updates).eq("id", lessonId).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" \u2014 ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e) {
      console.error("PATCH /api/teacher/lessons/:id", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });
  const teacherLessonDeleteHandler = async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const lessonId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      const userId = typeof (req.query.userId ?? req.body?.userId) === "string" ? String(req.query.userId ?? req.body?.userId).trim() : "";
      if (!lessonId) return res.status(400).json({ error: "Lesson id is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!canAccessTeacherCourses(caller, userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { data: lesson, error: lErr } = await supabaseAdmin.from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
      if (lErr) throw lErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found." });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id));
      if (!gate.ok) return res.status(403).json({ error: "You do not have access to this lesson." });
      const { error } = await supabaseAdmin.from("lessons").delete().eq("id", lessonId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      console.error("DELETE /api/teacher/lessons/:id", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  };
  app.delete("/api/teacher/lessons/:id", teacherLessonDeleteHandler);
  app.post("/api/teacher/lessons/:id/delete", teacherLessonDeleteHandler);
  const isLessonContentsTableMissing = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && hay.includes("lesson_contents") || error?.code === "42P01" && hay.includes("lesson_contents") || hay.includes("could not find the table 'public.lesson_contents'");
  };
  const getMissingLessonContentsColumn = (error) => {
    const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    let m = msg.match(/column\s+(?:"([^"]+)"|'([^']+)'|(\w+))\s+of\s+relation\s+(?:"lesson_contents"|'lesson_contents'|lesson_contents)/i);
    if (m?.[1] || m?.[2] || m?.[3]) return String(m[1] || m[2] || m[3] || "").toLowerCase();
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
  const normalizeLessonContentRow = (row, index) => {
    const rawType = String(row?.type || row?.content_type || "").toLowerCase();
    const type = rawType === "video" || rawType === "audio" || rawType === "pdf" || rawType === "text" || rawType === "link" ? rawType : "text";
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
      size_bytes: firstSize !== void 0 ? Number(firstSize) : null,
      text_content: row?.text_content ?? row?.content_text ?? row?.content ?? null,
      pdf_page: firstPage !== void 0 ? Math.max(1, Number(firstPage)) : null,
      duration_seconds: firstDuration !== void 0 ? Math.max(0, Number(firstDuration)) : null,
      position: firstPosition !== void 0 ? Math.max(1, Number(firstPosition)) : index + 1,
      created_at: row?.created_at ?? null,
      updated_at: row?.updated_at ?? null
    };
  };
  const normalizeLessonContentRows = (rows) => (rows || []).map((row, index) => normalizeLessonContentRow(row, index));
  const mutateLessonContentsWithFallback = async (execute, basePayload) => {
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
  const fetchLessonContentsWithFallbackOrder = async (lessonId) => {
    let orderColumn = "position";
    for (let attempts = 0; attempts < 4; attempts += 1) {
      let query = supabaseAdmin.from("lesson_contents").select("*").eq("lesson_id", lessonId);
      if (orderColumn) {
        query = query.order(orderColumn, { ascending: true });
      }
      const contentsRes = await query;
      if (!contentsRes.error) return contentsRes;
      if (isLessonContentsTableMissing(contentsRes.error)) return contentsRes;
      const missingColumn = getMissingLessonContentsColumn(contentsRes.error);
      if (orderColumn === "position" && missingColumn === "position") {
        orderColumn = "created_at";
        continue;
      }
      if (orderColumn === "created_at" && missingColumn === "created_at") {
        orderColumn = null;
        continue;
      }
      return contentsRes;
    }
    return await supabaseAdmin.from("lesson_contents").select("*").eq("lesson_id", lessonId);
  };
  const isLessonProgressTableMissing = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && hay.includes("lesson_progress") || error?.code === "42P01" && hay.includes("lesson_progress") || hay.includes("could not find the table 'public.lesson_progress'");
  };
  const toLessonCompleted = (row) => {
    if (typeof row?.completed === "boolean") return row.completed;
    const progressPercent = Number(row?.progress_percent);
    if (Number.isFinite(progressPercent)) return progressPercent >= 100;
    const status = String(row?.status || "").toLowerCase();
    if (status) return status === "completed" || status === "done";
    return false;
  };
  const fetchLessonProgressRows = async (studentId, lessonIds) => {
    if (!lessonIds.length) return { rows: [], storage: "database" };
    const primary = await supabaseAdmin.from("lesson_progress").select("student_id,lesson_id,completed,last_video_position,last_opened_at,updated_at").eq("student_id", studentId).in("lesson_id", lessonIds);
    if (!primary.error) {
      return {
        rows: (primary.data || []).map((row) => ({ ...row, completed: toLessonCompleted(row) })),
        storage: "database"
      };
    }
    if (isLessonProgressTableMissing(primary.error)) {
      return { rows: [], storage: "table_missing" };
    }
    if (!isRecoverableSchemaColumnError(primary.error)) throw primary.error;
    const fallback = await supabaseAdmin.from("lesson_progress").select("student_id,lesson_id,last_video_position,last_opened_at,updated_at,progress_percent,status").eq("student_id", studentId).in("lesson_id", lessonIds);
    if (fallback.error) {
      if (isLessonProgressTableMissing(fallback.error)) {
        return { rows: [], storage: "table_missing" };
      }
      throw fallback.error;
    }
    return {
      rows: (fallback.data || []).map((row) => ({ ...row, completed: toLessonCompleted(row) })),
      storage: "database"
    };
  };
  const fetchLessonProgressSingle = async (studentId, lessonId) => {
    const many = await fetchLessonProgressRows(studentId, [lessonId]);
    return { row: many.rows[0] || null, storage: many.storage };
  };
  const upsertLessonProgressWithFallback = async (studentId, lessonId, completed, lastVideoPosition) => {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const primary = await supabaseAdmin.from("lesson_progress").upsert(
      {
        student_id: studentId,
        lesson_id: lessonId,
        completed,
        last_video_position: lastVideoPosition,
        last_opened_at: nowIso,
        updated_at: nowIso
      },
      { onConflict: "student_id,lesson_id" }
    ).select("student_id,lesson_id,completed,last_video_position,last_opened_at,updated_at").single();
    if (!primary.error) {
      return { row: { ...primary.data, completed: toLessonCompleted(primary.data) }, storage: "database" };
    }
    if (isLessonProgressTableMissing(primary.error)) {
      return { row: null, storage: "table_missing" };
    }
    if (!isRecoverableSchemaColumnError(primary.error)) throw primary.error;
    const fallback = await supabaseAdmin.from("lesson_progress").upsert(
      {
        student_id: studentId,
        lesson_id: lessonId,
        last_video_position: lastVideoPosition,
        progress_percent: completed ? 100 : 0,
        status: completed ? "completed" : "in_progress",
        last_opened_at: nowIso,
        updated_at: nowIso
      },
      { onConflict: "student_id,lesson_id" }
    ).select("student_id,lesson_id,last_video_position,last_opened_at,updated_at,progress_percent,status").single();
    if (fallback.error) {
      if (isLessonProgressTableMissing(fallback.error)) {
        return { row: null, storage: "table_missing" };
      }
      throw fallback.error;
    }
    return { row: { ...fallback.data, completed: toLessonCompleted(fallback.data) }, storage: "database" };
  };
  const ensureLessonMediaBucket = async () => {
    await supabaseAdmin.storage.createBucket("lesson-media", { public: false }).catch(() => {
    });
  };
  app.get("/api/teacher/lessons/:lessonId/contents", async (req, res) => {
    try {
      const lessonId = typeof req.params.lessonId === "string" ? req.params.lessonId.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!lessonId) return res.status(400).json({ error: "lessonId is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: lesson, error: lessonErr } = await supabaseAdmin.from("lessons").select("id,course_id").eq("id", lessonId).maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id || ""));
      if (!gate.ok) return res.status(403).json({ error: "Forbidden: no access to this lesson" });
      const contentsRes = await fetchLessonContentsWithFallbackOrder(lessonId);
      if (contentsRes.error) {
        if (isLessonContentsTableMissing(contentsRes.error)) {
          return res.json({ success: true, contents: [], storage: "table_missing" });
        }
        throw contentsRes.error;
      }
      const contentRows = normalizeLessonContentRows(contentsRes.data || []).map((row) => ({
        ...row,
        signed_url: typeof row?.storage_path === "string" && /^https?:\/\//i.test(row.storage_path) ? row.storage_path : null
      }));
      await ensureLessonMediaBucket();
      for (const row of contentRows) {
        const path3 = String(row?.storage_path || "").trim();
        if (!path3 || /^https?:\/\//i.test(path3)) continue;
        const signed = await supabaseAdmin.storage.from("lesson-media").createSignedUrl(path3, 3600);
        row.signed_url = signed.error ? null : signed.data?.signedUrl || null;
      }
      return res.json({
        success: true,
        contents: contentRows,
        storage: "database"
      });
    } catch (e) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ""}
${e?.stack || ""}`),
          message: e?.message || "Failed to load lesson contents",
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"],
          source: "api.teacher.lesson-contents.list"
        },
        res
      );
      return res.status(500).json({ error: e?.message || "Failed to load lesson contents" });
    }
  });
  app.post("/api/teacher/lessons/:lessonId/contents", async (req, res) => {
    try {
      const lessonId = typeof req.params.lessonId === "string" ? req.params.lessonId.trim() : "";
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!lessonId) return res.status(400).json({ error: "lessonId is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: lesson, error: lessonErr } = await supabaseAdmin.from("lessons").select("id,course_id").eq("id", lessonId).maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id || ""));
      if (!gate.ok) return res.status(403).json({ error: "Forbidden: no access to this lesson" });
      const normalizedType = String(req.body?.type || req.body?.content_type || "text");
      const normalizedStoragePath = typeof req.body?.storage_path === "string" ? req.body.storage_path.trim() || null : typeof req.body?.file_url === "string" ? req.body.file_url.trim() || null : null;
      const normalizedTextContent = typeof req.body?.text_content === "string" ? req.body.text_content : typeof req.body?.content === "string" ? req.body.content : null;
      const payload = {
        lesson_id: lessonId,
        type: normalizedType,
        content_type: normalizedType,
        title: typeof req.body?.title === "string" ? req.body.title.trim() || null : null,
        description: typeof req.body?.description === "string" ? req.body.description.trim() || null : null,
        storage_path: normalizedStoragePath,
        file_url: normalizedStoragePath,
        mime_type: typeof req.body?.mime_type === "string" ? req.body.mime_type.trim() || null : null,
        size_bytes: Number.isFinite(Number(req.body?.size_bytes)) ? Number(req.body.size_bytes) : null,
        text_content: normalizedTextContent,
        content: normalizedTextContent,
        pdf_page: Number.isFinite(Number(req.body?.pdf_page)) ? Math.max(1, Number(req.body.pdf_page)) : null,
        duration_seconds: Number.isFinite(Number(req.body?.duration_seconds)) ? Math.max(0, Number(req.body.duration_seconds)) : null,
        position: Number.isFinite(Number(req.body?.position)) ? Math.max(1, Number(req.body.position)) : 1,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { result: ins } = await mutateLessonContentsWithFallback(
        (insPayload) => supabaseAdmin.from("lesson_contents").insert(insPayload).select("*").single(),
        payload
      );
      if (ins.error) {
        if (isLessonContentsTableMissing(ins.error)) {
          return res.status(501).json({ error: "lesson_contents table is not available in this database yet." });
        }
        throw ins.error;
      }
      return res.json({ success: true, content: normalizeLessonContentRow(ins.data, 0) });
    } catch (e) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ""}
${e?.stack || ""}`),
          message: e?.message || "Failed to create lesson content",
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"],
          source: "api.teacher.lesson-contents.create"
        },
        res
      );
      return res.status(500).json({ error: e?.message || "Failed to create lesson content" });
    }
  });
  app.patch("/api/teacher/lessons/:lessonId/contents/:contentId", async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || "").trim();
      const contentId = String(req.params.contentId || "").trim();
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      if (!lessonId || !contentId) return res.status(400).json({ error: "lessonId and contentId are required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: lesson, error: lessonErr } = await supabaseAdmin.from("lessons").select("id,course_id").eq("id", lessonId).maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id || ""));
      if (!gate.ok) return res.status(403).json({ error: "Forbidden: no access to this lesson" });
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (req.body?.type !== void 0 || req.body?.content_type !== void 0) {
        const normalizedType = String(req.body?.type || req.body?.content_type || "text");
        updates.type = normalizedType;
        updates.content_type = normalizedType;
      }
      if (req.body?.title !== void 0) updates.title = typeof req.body.title === "string" ? req.body.title.trim() || null : null;
      if (req.body?.description !== void 0) updates.description = typeof req.body.description === "string" ? req.body.description.trim() || null : null;
      if (req.body?.storage_path !== void 0 || req.body?.file_url !== void 0) {
        const normalizedStoragePath = typeof req.body?.storage_path === "string" ? req.body.storage_path.trim() || null : typeof req.body?.file_url === "string" ? req.body.file_url.trim() || null : null;
        updates.storage_path = normalizedStoragePath;
        updates.file_url = normalizedStoragePath;
      }
      if (req.body?.mime_type !== void 0) updates.mime_type = typeof req.body.mime_type === "string" ? req.body.mime_type.trim() || null : null;
      if (req.body?.size_bytes !== void 0) updates.size_bytes = Number.isFinite(Number(req.body.size_bytes)) ? Number(req.body.size_bytes) : null;
      if (req.body?.text_content !== void 0 || req.body?.content !== void 0) {
        const normalizedTextContent = typeof req.body?.text_content === "string" ? req.body.text_content : typeof req.body?.content === "string" ? req.body.content : null;
        updates.text_content = normalizedTextContent;
        updates.content = normalizedTextContent;
      }
      if (req.body?.pdf_page !== void 0) updates.pdf_page = Number.isFinite(Number(req.body.pdf_page)) ? Math.max(1, Number(req.body.pdf_page)) : null;
      if (req.body?.duration_seconds !== void 0) updates.duration_seconds = Number.isFinite(Number(req.body.duration_seconds)) ? Math.max(0, Number(req.body.duration_seconds)) : null;
      if (req.body?.position !== void 0) updates.position = Number.isFinite(Number(req.body.position)) ? Math.max(1, Number(req.body.position)) : 1;
      const { result: upd } = await mutateLessonContentsWithFallback(
        (updPayload) => supabaseAdmin.from("lesson_contents").update(updPayload).eq("id", contentId).eq("lesson_id", lessonId).select("*").single(),
        updates
      );
      if (upd.error) {
        if (isLessonContentsTableMissing(upd.error)) {
          return res.status(501).json({ error: "lesson_contents table is not available in this database yet." });
        }
        throw upd.error;
      }
      const normalizedRow = normalizeLessonContentRow(upd.data, 0);
      const storagePath = String(normalizedRow?.storage_path || "").trim();
      if (storagePath && !/^https?:\/\//i.test(storagePath)) {
        await ensureLessonMediaBucket();
        const signed = await supabaseAdmin.storage.from("lesson-media").createSignedUrl(storagePath, 3600);
        normalizedRow.signed_url = signed.error ? null : signed.data?.signedUrl || null;
      } else if (/^https?:\/\//i.test(storagePath)) {
        normalizedRow.signed_url = storagePath;
      }
      return res.json({ success: true, content: normalizedRow });
    } catch (e) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ""}
${e?.stack || ""}`),
          message: e?.message || "Failed to update lesson content",
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"],
          source: "api.teacher.lesson-contents.update"
        },
        res
      );
      return res.status(500).json({ error: e?.message || "Failed to update lesson content" });
    }
  });
  app.delete("/api/teacher/lessons/:lessonId/contents/:contentId", async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || "").trim();
      const contentId = String(req.params.contentId || "").trim();
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!lessonId || !contentId) return res.status(400).json({ error: "lessonId and contentId are required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const { data: lesson, error: lessonErr } = await supabaseAdmin.from("lessons").select("id,course_id").eq("id", lessonId).maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id || ""));
      if (!gate.ok) return res.status(403).json({ error: "Forbidden: no access to this lesson" });
      const del = await supabaseAdmin.from("lesson_contents").delete().eq("id", contentId).eq("lesson_id", lessonId);
      if (del.error) {
        if (isLessonContentsTableMissing(del.error)) {
          return res.status(501).json({ error: "lesson_contents table is not available in this database yet." });
        }
        throw del.error;
      }
      return res.json({ success: true });
    } catch (e) {
      void logSystemError(
        {
          layer: detectErrorLayer(`${e?.message || ""}
${e?.stack || ""}`),
          message: e?.message || "Failed to delete lesson content",
          stack: e?.stack,
          url: req.originalUrl,
          userAgent: req.headers["user-agent"],
          source: "api.teacher.lesson-contents.delete"
        },
        res
      );
      return res.status(500).json({ error: e?.message || "Failed to delete lesson content" });
    }
  });
  app.put("/api/teacher/lessons/:lessonId/contents/reorder", async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || "").trim();
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map((x) => String(x)) : [];
      if (!lessonId) return res.status(400).json({ error: "lessonId is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!orderedIds.length) return res.status(400).json({ error: "orderedIds is required" });
      const { data: lesson, error: lessonErr } = await supabaseAdmin.from("lessons").select("id,course_id").eq("id", lessonId).maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id || ""));
      if (!gate.ok) return res.status(403).json({ error: "Forbidden: no access to this lesson" });
      for (let i = 0; i < orderedIds.length; i += 1) {
        const id = orderedIds[i];
        let reorderPayload = { position: i + 1, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        let upd = await supabaseAdmin.from("lesson_contents").update(reorderPayload).eq("id", id).eq("lesson_id", lessonId);
        for (let attempts = 0; upd.error && attempts < 4; attempts += 1) {
          const missingColumn = getMissingLessonContentsColumn(upd.error);
          if (missingColumn === "position") {
            return res.json({ success: true, storage: "legacy_no_position" });
          }
          if (!missingColumn || !Object.prototype.hasOwnProperty.call(reorderPayload, missingColumn)) break;
          const { [missingColumn]: _omit, ...nextPayload } = reorderPayload;
          reorderPayload = nextPayload;
          upd = await supabaseAdmin.from("lesson_contents").update(reorderPayload).eq("id", id).eq("lesson_id", lessonId);
        }
        if (upd.error) {
          if (isLessonContentsTableMissing(upd.error)) {
            return res.status(501).json({ error: "lesson_contents table is not available in this database yet." });
          }
          throw upd.error;
        }
      }
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to reorder lesson contents" });
    }
  });
  app.post("/api/teacher/lessons/:lessonId/contents/upload-url", async (req, res) => {
    try {
      const lessonId = String(req.params.lessonId || "").trim();
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
      const contentType = typeof req.body?.contentType === "string" ? req.body.contentType.trim() : "application/octet-stream";
      if (!lessonId) return res.status(400).json({ error: "lessonId is required" });
      if (!userId) return res.status(400).json({ error: "userId is required" });
      if (!fileName) return res.status(400).json({ error: "fileName is required" });
      const { data: lesson, error: lessonErr } = await supabaseAdmin.from("lessons").select("id,course_id").eq("id", lessonId).maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const gate = await assertTeacherOwnsCourse(userId, String(lesson.course_id || ""));
      if (!gate.ok) return res.status(403).json({ error: "Forbidden: no access to this lesson" });
      const ALLOWED_CONTENT_TYPES = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "video/mp4",
        "video/webm",
        "video/ogg",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "application/pdf",
        "text/plain",
        "text/html",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint"
      ];
      const MAX_FILE_SIZE = 500 * 1024 * 1024;
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return res.status(400).json({ error: `File type not allowed: ${contentType}` });
      }
      const fileSize = typeof req.body?.fileSize === "number" ? req.body.fileSize : null;
      if (fileSize !== null && fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ error: "File exceeds maximum allowed size of 500 MB." });
      }
      const cleanName = fileName.replace(/[^\w.\-]/g, "_");
      const storagePath = `lesson/${lessonId}/${Date.now()}_${cleanName}`;
      await ensureLessonMediaBucket();
      const signed = await supabaseAdmin.storage.from("lesson-media").createSignedUploadUrl(storagePath);
      if (signed.error) throw signed.error;
      return res.json({
        success: true,
        bucket: "lesson-media",
        storagePath,
        signedUrl: signed.data.signedUrl,
        token: signed.data.token,
        contentType
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to create upload URL" });
    }
  });
  app.get("/api/admin/analytics", async (req, res) => {
    try {
      const analyticsStartedAt = Date.now();
      const adminAnalyticsCacheKey = "admin-analytics:global";
      const cachedAdminAnalytics = getCachedApiResponse(adminAnalyticsCacheKey);
      if (cachedAdminAnalytics) return res.json(cachedAdminAnalytics);
      const certsPromise = (async () => {
        const certRows = await fetchCertificatesSelectWithFallback([
          "id, status, created_at",
          "id, status",
          "id, created_at",
          "id"
        ]);
        return {
          data: certRows.map((c) => ({
            id: c.id,
            status: c.status ?? "issued",
            created_at: c.created_at ?? null
          })),
          error: null
        };
      })();
      const classesPromise = (async () => {
        const selects = [
          "id, status, created_at, student_ids, capacity",
          "id, created_at, student_ids, capacity",
          "id, created_at, student_ids",
          "id, created_at"
        ];
        for (const sel of selects) {
          const res2 = await supabaseAdmin.from("classes").select(sel);
          if (!res2.error) {
            return {
              data: (res2.data || []).map((c) => ({
                id: c.id,
                status: c.status ?? "active",
                created_at: c.created_at ?? null,
                student_ids: Array.isArray(c.student_ids) ? c.student_ids : [],
                capacity: typeof c.capacity === "number" ? c.capacity : 0
              })),
              error: null
            };
          }
          if (res2.error.code !== "42703") return res2;
        }
        return { data: [], error: null };
      })();
      const quizzesPromise = (async () => ({
        data: await loadQuizzesRowsForAnalytics(),
        error: null
      }))();
      const [profilesRes, coursesRes, classesRes, quizzesRes, certsRes, assignmentsRes, lessonsRes, attendanceRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, role, created_at, status"),
        supabaseAdmin.from("courses").select("id, category, status, created_at, total_students, level"),
        classesPromise,
        quizzesPromise,
        certsPromise,
        supabaseAdmin.from("assignments").select("id, status, created_at"),
        supabaseAdmin.from("lessons").select("id, created_at, type"),
        supabaseAdmin.from("attendance").select("id, status, date")
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
      const activeClasses = classes.filter((c) => c.status === "active").length;
      const upcomingClasses = classes.filter((c) => c.status === "upcoming").length;
      const totalClassEnrollments = classes.reduce((sum, c) => sum + ((c.student_ids || []).length || 0), 0);
      const avgClassFillRate = classes.length > 0 ? Math.round(classes.reduce((sum, c) => {
        const enrolled = (c.student_ids || []).length || 0;
        const capacity = Number(c.capacity) > 0 ? Number(c.capacity) : 0;
        if (!capacity) return sum;
        return sum + Math.min(enrolled / capacity * 100, 100);
      }, 0) / classes.length) : 0;
      const attempts = normalizeAttempts(await fetchAllAttemptRows());
      const completedAttempts = attempts.filter((a) => a.status === "completed");
      const passedAttempts = completedAttempts.filter((a) => a.passed);
      const passRate = completedAttempts.length > 0 ? Math.round(passedAttempts.length / completedAttempts.length * 100) : 0;
      const avgScore = completedAttempts.length > 0 ? Math.round(completedAttempts.reduce((sum, a) => sum + a.score_percent, 0) / completedAttempts.length) : 0;
      const now = /* @__PURE__ */ new Date();
      const days30 = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days30.push(d.toISOString().slice(0, 10));
      }
      const signupMap = Object.fromEntries(days30.map((d) => [d, 0]));
      profiles.filter((p) => p.role === "student").forEach((p) => {
        const day = (p.created_at || "").slice(0, 10);
        if (signupMap[day] !== void 0) signupMap[day]++;
      });
      const attemptsMap = Object.fromEntries(days30.map((d) => [d, 0]));
      attempts.forEach((a) => {
        const day = (a.started_at || "").slice(0, 10);
        if (attemptsMap[day] !== void 0) attemptsMap[day]++;
      });
      const trend = days30.map((date) => ({
        date: date.slice(5),
        // MM-DD
        signups: signupMap[date],
        attempts: attemptsMap[date]
      }));
      const catMap = {};
      courses.forEach((c) => {
        catMap[c.category || "Other"] = (catMap[c.category || "Other"] || 0) + 1;
      });
      const courseByCategory = Object.entries(catMap).map(([name, value]) => ({ name, value }));
      const lvlMap = {};
      courses.forEach((c) => {
        lvlMap[c.level || "beginner"] = (lvlMap[c.level || "beginner"] || 0) + 1;
      });
      const courseByLevel = Object.entries(lvlMap).map(([name, value]) => ({ name, value }));
      const buckets = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
      completedAttempts.forEach((a) => {
        const pct = a.score_percent;
        if (pct <= 20) buckets["0-20"]++;
        else if (pct <= 40) buckets["21-40"]++;
        else if (pct <= 60) buckets["41-60"]++;
        else if (pct <= 80) buckets["61-80"]++;
        else buckets["81-100"]++;
      });
      const scoreDistribution = Object.entries(buckets).map(([range, count]) => ({ range, count }));
      const presentCount = attendance.filter((a) => a.status === "present").length;
      const attendanceRate = attendance.length > 0 ? Math.round(presentCount / attendance.length * 100) : 0;
      const payload = {
        success: true,
        overview: {
          totalStudents: profiles.filter((p) => p.role === "student").length,
          activeStudents: profiles.filter((p) => p.role === "student" && p.status === "active").length,
          totalTeachers: profiles.filter((p) => p.role === "teacher").length,
          totalClasses: classes.length,
          activeClasses,
          upcomingClasses,
          totalClassEnrollments,
          avgClassFillRate,
          totalCourses: courses.length,
          publishedCourses: courses.filter((c) => c.status === "published").length,
          totalQuizzes: quizzes.length,
          // Legacy DBs may not have quizzes.published; avoid column dependency.
          publishedQuizzes: quizzes.length,
          totalAttempts: attempts.length,
          completedAttempts: completedAttempts.length,
          totalCertificates: certs.filter((c) => c.status === "issued").length,
          totalLessons: lessons.length,
          totalAssignments: assignments.length,
          passRate,
          avgScore,
          attendanceRate,
          totalAttendance: attendance.length
        },
        trend,
        courseByCategory,
        courseByLevel,
        scoreDistribution
      };
      setCachedApiResponse(adminAnalyticsCacheKey, payload, 3e5);
      const durationMs = Date.now() - analyticsStartedAt;
      if (durationMs > PERF_SLOW_THRESHOLD_MS) {
        console.warn(
          `[perf] slow admin analytics duration=${durationMs}ms profiles=${profiles.length} courses=${courses.length} classes=${classes.length} attempts=${attempts.length}`
        );
      }
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/reports/students", async (req, res) => {
    try {
      const rptStudentsCacheKey = "admin-reports:students";
      const rptStudentsCached = getCachedApiResponse(rptStudentsCacheKey);
      if (rptStudentsCached) return res.json(rptStudentsCached);
      const [studentsRes, enrollmentsResWithIds, certs] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, display_name, email, status, created_at").eq("role", "student"),
        supabaseAdmin.from("courses").select("id, student_ids"),
        loadCertificateRowsForReports()
      ]);
      if (studentsRes.error) throw studentsRes.error;
      let courses = [];
      if (enrollmentsResWithIds.error) {
        if (!isMissingCoursesStudentIdsError(enrollmentsResWithIds.error)) {
          throw enrollmentsResWithIds.error;
        }
      } else {
        courses = enrollmentsResWithIds.data || [];
      }
      const students = studentsRes.data || [];
      const attempts = normalizeAttempts(await fetchAllAttemptRows());
      const enrollmentMap = {};
      courses.forEach((c) => {
        (c.student_ids || []).forEach((sid) => {
          enrollmentMap[sid] = (enrollmentMap[sid] || 0) + 1;
        });
      });
      const report = students.map((s) => {
        const myAttempts = attempts.filter((a) => a.student_id === s.id && a.status === "completed");
        const avgScore = myAttempts.length > 0 ? Math.round(myAttempts.reduce((sum, a) => sum + a.score_percent, 0) / myAttempts.length) : null;
        return {
          id: s.id,
          name: s.display_name,
          email: s.email,
          status: s.status,
          joinedAt: s.created_at,
          enrolledCourses: enrollmentMap[s.id] || 0,
          totalAttempts: attempts.filter((a) => a.student_id === s.id).length,
          completedQuizzes: myAttempts.length,
          avgScore,
          certificates: certs.filter((c) => c.student_id === s.id && c.status === "issued").length
        };
      });
      const rptStudentsPayload = { success: true, report };
      setCachedApiResponse(rptStudentsCacheKey, rptStudentsPayload, 18e4);
      res.json(rptStudentsPayload);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/reports/courses", async (req, res) => {
    try {
      const [coursesResWithIds, lessonsRes, certs] = await Promise.all([
        supabaseAdmin.from("courses").select("id, title, category, level, status, created_at, total_students, teacher_id, student_ids"),
        supabaseAdmin.from("lessons").select("course_id"),
        loadCertificateRowsForReports()
      ]);
      if (lessonsRes.error) throw lessonsRes.error;
      let courses = [];
      let usesStudentIds = true;
      if (coursesResWithIds.error) {
        if (!isMissingCoursesStudentIdsError(coursesResWithIds.error)) throw coursesResWithIds.error;
        const coursesResFallback = await supabaseAdmin.from("courses").select("id, title, category, level, status, created_at, total_students, teacher_id");
        if (coursesResFallback.error) throw coursesResFallback.error;
        courses = coursesResFallback.data || [];
        usesStudentIds = false;
      } else {
        courses = coursesResWithIds.data || [];
      }
      const lessonsList = lessonsRes.data || [];
      const report = courses.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category || "Other",
        level: c.level || "beginner",
        status: c.status,
        createdAt: c.created_at,
        enrolledStudents: usesStudentIds ? (c.student_ids || []).length : Number(c.total_students || 0),
        totalLessons: lessonsList.filter((l) => l.course_id === c.id).length,
        certificatesIssued: certs.filter((cert) => cert.course_id === c.id && cert.status === "issued").length
      }));
      res.json({ success: true, report });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/quizzes", async (req, res) => {
    try {
      const [quizzesRes, coursesRes, teachersRes, questionsRes] = await Promise.all([
        supabaseAdmin.from("quizzes").select("*").order("created_at", { ascending: false }),
        supabaseAdmin.from("courses").select("id,title,teacher_id"),
        supabaseAdmin.from("teachers").select("user_id,first_name,last_name"),
        supabaseAdmin.from("questions").select("quiz_id")
      ]);
      if (quizzesRes.error) throw quizzesRes.error;
      if (coursesRes.error) throw coursesRes.error;
      const teacherMap = {};
      if (!teachersRes.error) {
        (teachersRes.data || []).forEach((t) => {
          const fullName = `${String(t?.first_name || "").trim()} ${String(t?.last_name || "").trim()}`.trim();
          teacherMap[String(t?.user_id || "")] = fullName || "\u2014";
        });
      }
      const courseMap = {};
      const courseOptions = [];
      (coursesRes.data || []).forEach((c) => {
        const cid = String(c?.id || "");
        if (!cid) return;
        const name = String(c?.title || "Untitled");
        courseMap[cid] = { name, teacher: teacherMap[String(c?.teacher_id || "")] || "\u2014" };
        courseOptions.push({ id: cid, name });
      });
      const questionCountMap = {};
      if (!questionsRes.error) {
        (questionsRes.data || []).forEach((q) => {
          const qid = String(q?.quiz_id || "");
          if (!qid) return;
          questionCountMap[qid] = (questionCountMap[qid] || 0) + 1;
        });
      }
      const quizzes = (quizzesRes.data || []).map((q) => {
        const qid = String(q?.id || "");
        const courseId = String(q?.course_id || "");
        return {
          id: qid,
          title: String(q?.title || "Untitled Quiz"),
          description: typeof q?.description === "string" ? q.description : void 0,
          courseId,
          courseName: courseMap[courseId]?.name || "Unknown",
          teacherName: courseMap[courseId]?.teacher || "\u2014",
          questionCount: questionCountMap[qid] || 0,
          timeLimit: Number(q?.time_limit || 0),
          published: Boolean(q?.published),
          settings: q?.settings && typeof q.settings === "object" ? q.settings : {},
          createdAt: String(q?.created_at || "")
        };
      });
      return res.json({ success: true, quizzes, courses: courseOptions });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load admin quizzes" });
    }
  });
  app.get("/api/admin/reports/quizzes", async (req, res) => {
    try {
      const { data: quizzesData, error: quizzesError } = await supabaseAdmin.from("quizzes").select("*");
      if (quizzesError) throw quizzesError;
      const quizzes = quizzesData || [];
      const passingScoreByQuiz = quizzes.reduce((acc, q) => {
        const value = Number(q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark);
        acc[q.id] = Number.isFinite(value) ? value : 50;
        return acc;
      }, {});
      const attempts = normalizeAttempts(await fetchAllAttemptRows(), passingScoreByQuiz);
      const report = quizzes.map((q) => {
        const myAttempts = attempts.filter((a) => a.quiz_id === q.id);
        const completed = myAttempts.filter((a) => a.status === "completed");
        const passed = completed.filter((a) => a.passed);
        const avgScore = completed.length > 0 ? Math.round(completed.reduce((sum, a) => sum + a.score_percent, 0) / completed.length) : null;
        const uniqueStudents = new Set(myAttempts.map((a) => a.student_id)).size;
        return {
          id: q.id,
          title: q.title,
          published: q.published,
          createdAt: q.created_at,
          passingScore: Number(q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark ?? q?.passMark) || 50,
          totalAttempts: myAttempts.length,
          completedAttempts: completed.length,
          passedAttempts: passed.length,
          passRate: completed.length > 0 ? Math.round(passed.length / completed.length * 100) : null,
          avgScore,
          uniqueStudents
        };
      });
      res.json({ success: true, report });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/reports/roles", async (req, res) => {
    try {
      const rptRolesCacheKey = "admin-reports:roles";
      const rptRolesCached = getCachedApiResponse(rptRolesCacheKey);
      if (rptRolesCached) return res.json(rptRolesCached);
      const [profilesRes, coursesRes, quizzesRes, certs] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, role, status, created_at"),
        supabaseAdmin.from("courses").select("teacher_id"),
        supabaseAdmin.from("quizzes").select("teacher_id"),
        loadCertificateRowsForReports()
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (quizzesRes.error) throw quizzesRes.error;
      const profiles = profilesRes.data || [];
      const courses = coursesRes.data || [];
      const quizzes = quizzesRes.data || [];
      const attempts = normalizeAttempts(await fetchAllAttemptRows());
      const roleByUserId = {};
      profiles.forEach((p) => {
        const role = p?.role === "admin" || p?.role === "teacher" ? p.role : "student";
        roleByUserId[p.id] = role;
      });
      const roleStats = {
        admin: { role: "admin", users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
        teacher: { role: "teacher", users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 },
        student: { role: "student", users: 0, activeUsers: 0, newUsers30d: 0, coursesCreated: 0, quizzesCreated: 0, attempts: 0, certificates: 0 }
      };
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1e3;
      profiles.forEach((p) => {
        const role = p?.role === "admin" || p?.role === "teacher" ? p.role : "student";
        roleStats[role].users += 1;
        if (p?.status === "active") roleStats[role].activeUsers += 1;
        const created = p?.created_at ? new Date(p.created_at).getTime() : 0;
        if (created > 0 && now - created <= thirtyDaysMs) roleStats[role].newUsers30d += 1;
      });
      courses.forEach((c) => {
        const ownerRole = roleByUserId[c?.teacher_id] || "teacher";
        roleStats[ownerRole].coursesCreated += 1;
      });
      quizzes.forEach((q) => {
        const ownerRole = roleByUserId[q?.teacher_id] || "teacher";
        roleStats[ownerRole].quizzesCreated += 1;
      });
      attempts.forEach((a) => {
        const role = roleByUserId[a?.student_id] || "student";
        roleStats[role].attempts += 1;
      });
      certs.forEach((c) => {
        if (c?.status !== "issued") return;
        const role = roleByUserId[c?.student_id] || "student";
        roleStats[role].certificates += 1;
      });
      const report = [roleStats.admin, roleStats.teacher, roleStats.student];
      const rptRolesPayload = { success: true, report };
      setCachedApiResponse(rptRolesCacheKey, rptRolesPayload, 18e4);
      res.json(rptRolesPayload);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/payments", async (req, res) => {
    try {
      const [teachersRes, studentsRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, display_name, email").eq("role", "teacher"),
        supabaseAdmin.from("profiles").select("id, display_name, email, teacher_id").eq("role", "student")
      ]);
      if (teachersRes.error) throw teachersRes.error;
      if (studentsRes.error) throw studentsRes.error;
      const paymentsRes = await supabaseAdmin.from("payments").select("id, teacher_id, student_id, amount, currency, status, method, payment_date, description, reference, created_at").order("payment_date", { ascending: false });
      let paymentsRows = [];
      if (paymentsRes.error) {
        const message = String(paymentsRes.error?.message || "");
        const isMissingPaymentsTable = paymentsRes.error?.code === "42P01" || message.includes("Could not find the table 'public.payments'") || message.includes("Could not find the table 'payments'");
        if (!isMissingPaymentsTable) throw paymentsRes.error;
      } else {
        paymentsRows = paymentsRes.data || [];
      }
      const teacherMap = {};
      (teachersRes.data || []).forEach((t) => {
        teacherMap[t.id] = {
          name: t.display_name || t.email || "Unknown teacher",
          email: t.email || ""
        };
      });
      const studentMap = {};
      (studentsRes.data || []).forEach((s) => {
        studentMap[s.id] = {
          name: s.display_name || s.email || "Unknown student",
          email: s.email || "",
          teacher_id: s.teacher_id || null
        };
      });
      const payments = paymentsRows.map((p) => ({
        ...p,
        teacher_name: p.teacher_id ? teacherMap[p.teacher_id]?.name || "\u2014" : "\u2014",
        student_name: p.student_id ? studentMap[p.student_id]?.name || "\u2014" : "\u2014",
        student_email: p.student_id ? studentMap[p.student_id]?.email || "" : ""
      }));
      const teacherOptions = (teachersRes.data || []).map((t) => ({
        id: t.id,
        name: t.display_name || t.email || "Unnamed teacher"
      }));
      const studentOptions = (studentsRes.data || []).map((s) => ({
        id: s.id,
        name: s.display_name || s.email || "Unnamed student",
        email: s.email || "",
        teacherId: s.teacher_id || null
      }));
      res.json({ success: true, payments, teacherOptions, studentOptions });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load payments" });
    }
  });
  app.post("/api/admin/payments", async (req, res) => {
    try {
      const {
        teacher_id,
        student_id,
        amount,
        currency = "USD",
        status = "completed",
        method = "bank",
        payment_date,
        description = "",
        reference = ""
      } = req.body || {};
      if (!teacher_id) return res.status(400).json({ error: "Teacher is required" });
      if (!student_id) return res.status(400).json({ error: "Student is required" });
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "Amount must be greater than zero" });
      }
      if (!payment_date) return res.status(400).json({ error: "Payment date is required" });
      const { data: studentProfile, error: studentErr } = await supabaseAdmin.from("profiles").select("id, teacher_id").eq("id", student_id).eq("role", "student").single();
      if (studentErr || !studentProfile) return res.status(400).json({ error: "Invalid student selected" });
      if (studentProfile.teacher_id !== teacher_id) {
        return res.status(400).json({ error: "Selected student does not belong to this teacher" });
      }
      const { data, error } = await supabaseAdmin.from("payments").insert({
        teacher_id,
        student_id,
        amount: numericAmount,
        currency,
        status,
        method,
        payment_date,
        description,
        reference
      }).select("id").single();
      if (error) throw error;
      const paymentId = data?.id;
      if (paymentId) {
        const invStatus = paymentStatusToInvoiceRowStatus(String(status));
        const issued = String(payment_date).slice(0, 10);
        let due = issued;
        if (invStatus === "paid") due = issued;
        else if (invStatus === "pending") due = addDaysToYmd(issued, 14);
        else due = addDaysToYmd(issued, 30);
        const paidDate = invStatus === "paid" ? issued : null;
        const lineDesc = String(description || "").trim() || `Payment \u2014 ${String(method).replace(/_/g, " ")}`;
        const courseTitle = String(description || "").trim().slice(0, 160) || "Program / services";
        const items = [{ description: lineDesc, qty: 1, unit_price: numericAmount }];
        const noteLines = ["Auto-generated from payment registration."];
        if (String(reference || "").trim()) noteLines.push(`Reference: ${String(reference).trim()}`);
        if (String(status) !== "completed") noteLines.push(`Payment record status: ${String(status)}.`);
        let invoiceNumber;
        try {
          invoiceNumber = await nextInvoiceNumberForPaymentDate(issued);
        } catch (invNumErr) {
          await supabaseAdmin.from("payments").delete().eq("id", paymentId);
          throw invNumErr;
        }
        const invInsert = await supabaseAdmin.from("invoices").insert({
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
          notes: noteLines.join("\n"),
          student_address: "",
          student_phone: ""
        }).select("id, invoice_number").single();
        if (invInsert.error) {
          await supabaseAdmin.from("payments").delete().eq("id", paymentId);
          const im = String(invInsert.error?.message || "");
          if (invInsert.error?.code === "42P01" || im.includes("Could not find the table 'public.invoices'")) {
            return res.status(400).json({
              error: "Could not create invoice: table 'invoices' is missing. Run sql/add_invoices_table.sql in Supabase, then try again."
            });
          }
          throw invInsert.error;
        }
        await dispatchNotifyEvent("paymentReceived", {
          studentId: String(student_id),
          teacherId: String(teacher_id),
          paymentId: String(paymentId),
          amount: numericAmount,
          currency
        });
        return res.json({
          success: true,
          id: paymentId,
          invoice_id: invInsert.data?.id,
          invoice_number: invInsert.data?.invoice_number
        });
      }
      await dispatchNotifyEvent("paymentReceived", {
        studentId: String(student_id),
        teacherId: String(teacher_id),
        paymentId: data?.id ? String(data.id) : void 0,
        amount: numericAmount,
        currency
      });
      res.json({ success: true, id: data?.id });
    } catch (e) {
      const message = String(e?.message || "");
      if (e?.code === "42P01" || message.includes("Could not find the table 'public.payments'") || message.includes("Could not find the table 'payments'")) {
        return res.status(400).json({
          error: "Payments are not available yet because table 'payments' is missing. Run sql/add_payments_table.sql in Supabase, then try again."
        });
      }
      res.status(500).json({ error: e.message || "Failed to create payment" });
    }
  });
  app.patch("/api/admin/payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "Payment ID is required" });
      const {
        amount,
        currency,
        status,
        method,
        payment_date,
        description,
        reference
      } = req.body || {};
      const updates = {};
      if (amount !== void 0) {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0)
          return res.status(400).json({ error: "Amount must be greater than zero" });
        updates.amount = numericAmount;
      }
      if (currency !== void 0) updates.currency = currency;
      if (status !== void 0) updates.status = status;
      if (method !== void 0) updates.method = method;
      if (payment_date !== void 0) updates.payment_date = payment_date;
      if (description !== void 0) updates.description = description;
      if (reference !== void 0) updates.reference = reference;
      const { error } = await supabaseAdmin.from("payments").update(updates).eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to update payment" });
    }
  });
  app.delete("/api/admin/payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "Payment ID is required" });
      const { error } = await supabaseAdmin.from("payments").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to delete payment" });
    }
  });
  app.get("/api/admin/student-payments", async (req, res) => {
    try {
      const { month } = req.query;
      const monthYear = month || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const [studentsRes, paymentsRes, teachersResult] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, display_name, email, teacher_id").eq("role", "student").order("display_name"),
        supabaseAdmin.from("student_monthly_payments").select("*").eq("month_year", monthYear).order("paid_at", { ascending: false }),
        supabaseAdmin.from("profiles").select("id, display_name, email").eq("role", "teacher")
      ]);
      if (studentsRes.error) throw studentsRes.error;
      const payments = paymentsRes.data || [];
      const teacherMap = {};
      (teachersResult.data || []).forEach((t) => {
        teacherMap[t.id] = t.display_name || t.email || "Unknown";
      });
      const paidSet = new Set(payments.map((p) => p.student_id));
      const paymentByStudent = {};
      payments.forEach((p) => {
        paymentByStudent[p.student_id] = p;
      });
      const students = (studentsRes.data || []).map((s) => ({
        id: s.id,
        name: s.display_name || s.email || "Unnamed",
        email: s.email || "",
        teacher_id: s.teacher_id || null,
        teacher_name: s.teacher_id ? teacherMap[s.teacher_id] || "\u2014" : "\u2014",
        paid: paidSet.has(s.id),
        payment: paymentByStudent[s.id] || null
      }));
      res.json({ success: true, students, month_year: monthYear });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load student payments" });
    }
  });
  app.post("/api/admin/student-payments", async (req, res) => {
    try {
      const { student_id, month_year, amount = 0, notes = "", send_invoice = true } = req.body || {};
      if (!student_id) return res.status(400).json({ error: "student_id is required" });
      const monthYear = month_year || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const { data: student, error: sErr } = await supabaseAdmin.from("profiles").select("id, display_name, email, teacher_id").eq("id", student_id).single();
      if (sErr || !student) return res.status(400).json({ error: "Student not found" });
      const { data: inserted, error: insErr } = await supabaseAdmin.from("student_monthly_payments").upsert({ student_id, month_year: monthYear, amount: Number(amount) || 0, notes: notes || "", paid_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "student_id,month_year" }).select("id").single();
      if (insErr) throw insErr;
      const paymentId = inserted?.id;
      const studentName = student.display_name || student.email || "Student";
      const [yr, mo] = monthYear.split("-");
      const monthLabel = new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
      const notifs = [{
        user_id: student_id,
        type: "payment_confirmed",
        title: "Pagesa u konfirmua",
        message: `Pagesa juaj p\xEBr muajin ${monthLabel} u konfirmua me sukses.`,
        read: false
      }];
      if (student.teacher_id) {
        notifs.push({
          user_id: student.teacher_id,
          type: "payment_confirmed",
          title: "Pagesa e studentit u konfirmua",
          message: `Pagesa e ${studentName} p\xEBr muajin ${monthLabel} u konfirmua.`,
          read: false
        });
      }
      await supabaseAdmin.from("notifications").insert(notifs).then(() => {
      });
      if (send_invoice && student.email && isEmailConfigured()) {
        const settings = await getConfigSection("settings").catch(() => ({}));
        const brandName = settings?.general?.school_name || "QuizMaster";
        const paidAt = (/* @__PURE__ */ new Date()).toISOString();
        const tpl = renderInvoiceEmail({
          studentName,
          amount: Number(amount) || 0,
          monthLabel,
          notes: notes || void 0,
          paidAt,
          brandName
        });
        sendEmail({ to: student.email, toName: studentName, subject: tpl.subject, htmlContent: tpl.htmlContent, textContent: tpl.textContent }).catch((e) => console.error("[invoice-email] failed:", e.message));
      }
      res.json({ success: true, id: paymentId, invoice_sent: !!(send_invoice && student.email && isEmailConfigured()) });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to record payment" });
    }
  });
  app.post("/api/admin/student-payments/send-reminders", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!isAdmin(caller)) return res.status(403).json({ error: "Admin only" });
      const result = await runPaymentDeadlineReminders({ force: true });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to send reminders" });
    }
  });
  app.delete("/api/admin/student-payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabaseAdmin.from("student_monthly_payments").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to delete payment" });
    }
  });
  app.get("/api/auth/check-student-payment", async (req, res) => {
    try {
      const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "student") return res.json({ required: false, paid: true });
      const monthYear = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const { data: payRow } = await supabaseAdmin.from("student_monthly_payments").select("id").eq("student_id", user.id).eq("month_year", monthYear).maybeSingle();
      res.json({ required: true, paid: !!payRow });
    } catch (e) {
      res.json({ required: false, paid: true });
    }
  });
  app.get("/api/admin/teacher-hours", async (req, res) => {
    try {
      const { teacher_id, month } = req.query;
      const monthYear = month || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const [yr, mo] = monthYear.split("-");
      const startDate = `${yr}-${mo}-01`;
      const endDate = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);
      let hoursQuery = supabaseAdmin.from("teacher_hours").select("*").gte("work_date", startDate).lte("work_date", endDate).order("work_date", { ascending: false });
      if (teacher_id) hoursQuery = hoursQuery.eq("teacher_id", teacher_id);
      const [hoursRes, teachersRes] = await Promise.all([
        hoursQuery,
        supabaseAdmin.from("profiles").select("id, display_name, email").eq("role", "teacher").order("display_name")
      ]);
      const rows = hoursRes.data || [];
      const teacherMap = {};
      (teachersRes.data || []).forEach((t) => {
        teacherMap[t.id] = t.display_name || t.email || "Unknown";
      });
      const hours = rows.map((r) => ({
        ...r,
        teacher_name: teacherMap[r.teacher_id] || "\u2014",
        hours: Number(r.hours),
        rate_per_hour: Number(r.rate_per_hour),
        total: Number(r.hours) * Number(r.rate_per_hour)
      }));
      const summaryMap = {};
      hours.forEach((r) => {
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
        month_year: monthYear
      });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load teacher hours" });
    }
  });
  app.post("/api/admin/teacher-hours", async (req, res) => {
    try {
      const { teacher_id, work_date, hours, rate_per_hour = 40, notes = "" } = req.body || {};
      if (!teacher_id) return res.status(400).json({ error: "teacher_id is required" });
      if (!work_date) return res.status(400).json({ error: "work_date is required" });
      const numHours = Number(hours);
      if (!Number.isFinite(numHours) || numHours <= 0) return res.status(400).json({ error: "hours must be greater than 0" });
      const [wd_yr, wd_mo] = work_date.split("-");
      const monthStart = `${wd_yr}-${wd_mo}-01`;
      const monthEnd = new Date(Number(wd_yr), Number(wd_mo), 0).toISOString().slice(0, 10);
      if (work_date < monthStart || work_date > monthEnd) {
        return res.status(400).json({ error: "Data e pun\xEBs nuk \xEBsht\xEB e vlefshme" });
      }
      const { data: inserted, error: insErr } = await supabaseAdmin.from("teacher_hours").insert({ teacher_id, work_date, hours: numHours, rate_per_hour: Number(rate_per_hour) || 40, notes: notes || "" }).select("id").single();
      if (insErr) throw insErr;
      res.json({ success: true, id: inserted?.id });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to record hours" });
    }
  });
  app.patch("/api/admin/teacher-hours/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { hours, rate_per_hour, notes, work_date } = req.body || {};
      const updates = {};
      if (hours !== void 0) updates.hours = Number(hours);
      if (rate_per_hour !== void 0) updates.rate_per_hour = Number(rate_per_hour);
      if (notes !== void 0) updates.notes = notes;
      if (work_date !== void 0) updates.work_date = work_date;
      if (!Object.keys(updates).length) return res.json({ success: true });
      const { error } = await supabaseAdmin.from("teacher_hours").update(updates).eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to update hours" });
    }
  });
  app.delete("/api/admin/teacher-hours/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabaseAdmin.from("teacher_hours").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to delete hours" });
    }
  });
  app.get("/api/admin/teacher-hours/invoice", async (req, res) => {
    try {
      const { teacher_id, month } = req.query;
      if (!teacher_id) return res.status(400).json({ error: "teacher_id is required" });
      const monthYear = month || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const [yr, mo] = monthYear.split("-");
      const startDate = `${yr}-${mo}-01`;
      const endDate = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);
      const [teacherRes, hoursRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, display_name, email").eq("id", teacher_id).single(),
        supabaseAdmin.from("teacher_hours").select("*").eq("teacher_id", teacher_id).gte("work_date", startDate).lte("work_date", endDate).order("work_date")
      ]);
      if (teacherRes.error) throw teacherRes.error;
      const rows = hoursRes.data || [];
      const total_hours = rows.reduce((s, r) => s + Number(r.hours), 0);
      const total_amount = rows.reduce((s, r) => s + Number(r.hours) * Number(r.rate_per_hour), 0);
      res.json({
        success: true,
        teacher: teacherRes.data,
        month_year: monthYear,
        rows: rows.map((r) => ({ ...r, hours: Number(r.hours), rate_per_hour: Number(r.rate_per_hour), total: Number(r.hours) * Number(r.rate_per_hour) })),
        total_hours,
        total_amount
      });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to generate invoice" });
    }
  });
  app.get("/api/teacher/earnings", async (req, res) => {
    try {
      const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const monthYear = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const [yr, mo] = monthYear.split("-");
      const startDate = `${yr}-${mo}-01`;
      const endDate = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);
      const { data: earningsData } = await supabaseAdmin.from("teacher_hours").select("hours, rate_per_hour, work_date").eq("teacher_id", user.id).gte("work_date", startDate).lte("work_date", endDate);
      const rows = earningsData || [];
      const total_hours = rows.reduce((s, r) => s + Number(r.hours), 0);
      const total_amount = rows.reduce((s, r) => s + Number(r.hours) * Number(r.rate_per_hour), 0);
      res.json({ success: true, total_hours, total_amount, month_year: monthYear });
    } catch (e) {
      res.json({ success: true, total_hours: 0, total_amount: 0, month_year: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7) });
    }
  });
  app.get("/api/admin/invoices", async (req, res) => {
    try {
      const invRes = await supabaseAdmin.from("invoices").select(
        "id, payment_id, invoice_number, teacher_id, student_id, currency, status, issued_date, due_date, paid_date, course_title, items, notes, student_address, student_phone, created_at"
      ).order("issued_date", { ascending: false });
      if (invRes.error) {
        const msg = String(invRes.error?.message || "");
        if (invRes.error?.code === "42P01" || msg.includes("Could not find the table 'public.invoices'")) {
          return res.json({ success: true, invoices: [] });
        }
        throw invRes.error;
      }
      const rows = invRes.data || [];
      const ids = /* @__PURE__ */ new Set();
      rows.forEach((r) => {
        if (r.student_id) ids.add(r.student_id);
        if (r.teacher_id) ids.add(r.teacher_id);
      });
      const idList = [...ids];
      let profMap = {};
      if (idList.length) {
        const { data: profs, error: pErr } = await supabaseAdmin.from("profiles").select("id, display_name, email").in("id", idList);
        if (pErr) throw pErr;
        (profs || []).forEach((p) => {
          profMap[p.id] = {
            name: p.display_name || p.email || "Unknown",
            email: p.email || ""
          };
        });
      }
      const invoices = rows.map((r) => {
        const dueYmd = String(r.due_date || "").slice(0, 10);
        const displayStatus = resolveInvoiceDisplayStatus(String(r.status || "draft"), dueYmd);
        const rawItems = Array.isArray(r.items) ? r.items : [];
        const items = rawItems.map((it) => ({
          description: String(it?.description ?? ""),
          qty: Math.max(1, Number(it?.qty) || 1),
          unit_price: Number(it?.unit_price) || 0
        }));
        const stu = profMap[r.student_id] || { name: "\u2014", email: "" };
        const tea = profMap[r.teacher_id] || { name: "\u2014", email: "" };
        return {
          id: r.id,
          payment_id: r.payment_id,
          invoice_number: r.invoice_number,
          student_name: stu.name,
          student_email: stu.email,
          student_address: r.student_address || "",
          student_phone: r.student_phone || "",
          teacher_name: tea.name,
          teacher_email: tea.email,
          course_title: r.course_title || "",
          status: displayStatus,
          currency: r.currency || "USD",
          issued_date: String(r.issued_date || "").slice(0, 10),
          due_date: dueYmd,
          paid_date: r.paid_date ? String(r.paid_date).slice(0, 10) : null,
          items,
          notes: r.notes || ""
        };
      });
      res.json({ success: true, invoices });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load invoices" });
    }
  });
  const teacherQuizzesPostHandler = async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const courseId = typeof body.course_id === "string" ? body.course_id.trim() : "";
      const title = typeof body.title === "string" ? body.title.trim() : String(body.title ?? "").trim();
      if (!courseId) return res.status(400).json({ error: "course_id is required" });
      if (!title) return res.status(400).json({ error: "title is required" });
      const { data: course, error: cErr } = await supabaseAdmin.from("courses").select("id, teacher_id").eq("id", courseId).maybeSingle();
      if (cErr) throw cErr;
      if (!course?.id) return res.status(404).json({ error: "Course not found" });
      if (caller.role !== "admin") {
        const scopedIds = await getTeacherIdCandidates(caller.userId);
        const tid = course.teacher_id != null ? String(course.teacher_id) : "";
        if (!tid || !scopedIds.includes(tid) && tid !== caller.userId) {
          return res.status(403).json({ error: "Forbidden: you do not own this course" });
        }
      }
      const description = typeof body.description === "string" ? body.description : body.description != null ? String(body.description) : "";
      const payload = {
        title,
        description,
        course_id: courseId,
        teacher_id: course.teacher_id != null ? String(course.teacher_id) : caller.userId,
        time_limit: typeof body.time_limit === "number" && !Number.isNaN(body.time_limit) ? body.time_limit : Number(body.time_limit) || 0
      };
      if (body.type !== void 0 && body.type !== null) payload.type = String(body.type);
      if (body.pass_mark !== void 0 && body.pass_mark !== null && !Number.isNaN(Number(body.pass_mark))) {
        payload.pass_mark = Number(body.pass_mark);
      }
      if (body.max_attempts !== void 0 && body.max_attempts !== null && !Number.isNaN(Number(body.max_attempts))) {
        payload.max_attempts = Number(body.max_attempts);
      }
      if (body.published !== void 0) payload.published = Boolean(body.published);
      if (body.settings !== void 0 && body.settings !== null) payload.settings = body.settings;
      if ("publish_at" in body) payload.publish_at = body.publish_at ? new Date(String(body.publish_at)).toISOString() : null;
      const { data: inserted, error: insErr } = await insertCompatibleQuizAdmin(payload, caller.userId);
      if (insErr) throw insErr;
      if (!inserted?.id) return res.status(500).json({ error: "Quiz insert returned no id" });
      res.json({ success: true, quiz: { id: inserted.id } });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to create quiz" });
    }
  };
  app.post("/api/teacher/quizzes", teacherQuizzesPostHandler);
  app.post("/api/teacher/quizzes/", teacherQuizzesPostHandler);
  app.post("/api/teacher/ai/generate-questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { content, questionTypes } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "content is required" });
      const geminiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      const QUIZ_MAX = 16e3;
      const clipped = content.trim().slice(0, QUIZ_MAX);
      const types = Array.isArray(questionTypes) && questionTypes.length > 0 ? questionTypes : ["multiple-choice", "true-false", "fill-in-the-blank"];
      const words = (clipped.match(/[A-Za-z0-9]+/g) || []).length;
      const autoCount = words <= 120 ? 3 : words <= 250 ? 4 : words <= 450 ? 5 : words <= 850 ? 7 : 9;
      const count = Math.max(types.length, autoCount);
      const TYPE_LABELS = {
        "multiple-choice": "Multiple Choice",
        "multiple-answer": "Multiple Answer",
        "true-false": "True / False",
        "fill-in-the-blank": "Fill in the Blank",
        "short-answer": "Short Answer",
        "long-answer": "Essay",
        "matching": "Matching",
        "ordering": "Ordering",
        "word-bank": "Word Bank",
        "sentence-building": "Sentence Building",
        "drag-drop": "Drag & Drop",
        "cloze": "Cloze Test",
        "listening": "Listening Questions",
        "audio-fill-blank": "Audio Fill in Blank",
        "dictation": "Dictation",
        "speaking": "Speaking",
        "pronunciation": "Pronunciation Check",
        "reading-comprehension": "Reading Comprehension"
      };
      const TYPE_SCHEMAS = {
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
        "pronunciation": `{"type":"pronunciation","question":"Say the following word clearly:","correct_answer":"necessary","explanation":"..."}`
      };
      const onlyMC = types.length === 1 && types[0] === "multiple-choice";
      const typeLabels = types.map((t) => TYPE_LABELS[t] || t).join(", ");
      const schemaDesc = types.map((t) => `- ${TYPE_LABELS[t] || t}: ${TYPE_SCHEMAS[t] || `{"type":"${t}","question":"...","correct_answer":"...","explanation":"..."}`}`).join("\n");
      const systemPrompt = `You are an expert quiz creator for an LMS platform. You always respond with ONLY a valid JSON array of question objects \u2014 no markdown, no explanation, no extra text.`;
      const userPrompt = onlyMC ? `Create exactly ${count} multiple-choice quiz questions using ONLY the content below. Each question needs exactly 4 options and 1 correct answer. Return a JSON array:
[{"type":"multiple-choice","question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]
Content:
"""${clipped}"""` : `Generate exactly ${count} quiz questions using ONLY the content below.
Types to use: ${typeLabels} (distribute evenly, ~${Math.ceil(count / types.length)} per type).
Rules: For fill-in-the-blank use ___ for the blank. For matching provide pairs array. For ordering/drag-drop provide items and correct_order. For word-bank provide word_bank array. For multiple-choice: 4 options, 1 correct. Always include explanation.
Schemas:
${schemaDesc}
Return ONLY a JSON array:
[...questions]
Content:
"""${clipped}"""`;
      let rawText = "";
      if (geminiKey) {
        const { GoogleGenAI } = await import("@google/genai");
        const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
        const ai = geminiBaseUrl ? new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } }) : new GoogleGenAI({ apiKey: geminiKey });
        const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: `${systemPrompt}

${userPrompt}` });
        rawText = (result.text || "").trim();
      } else {
        const pollinationsRes = await fetch("https://text.pollinations.ai/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            model: "openai",
            jsonMode: true
          })
        });
        if (!pollinationsRes.ok) throw new Error(`AI service error: ${pollinationsRes.status}`);
        rawText = (await pollinationsRes.text()).trim();
      }
      const parseJsonFromText = (text) => {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const clean = (fenced ? fenced[1] : text).trim();
        try {
          const p = JSON.parse(clean);
          return Array.isArray(p) ? p : p?.questions ?? [];
        } catch {
        }
        let depth = 0, start = -1;
        for (let i = 0; i < clean.length; i++) {
          if (clean[i] === "[") {
            if (start === -1) start = i;
            depth++;
          } else if (clean[i] === "]" && start !== -1) {
            depth--;
            if (depth === 0) {
              try {
                const p = JSON.parse(clean.slice(start, i + 1));
                return Array.isArray(p) ? p : [];
              } catch {
              }
            }
          }
        }
        return [];
      };
      const parsed = parseJsonFromText(rawText);
      const questions = parsed.map((item) => {
        const type = String(item.type || "multiple-choice");
        const text = String(item.question || item.text || "").trim();
        if (!text) return null;
        const q = { type, text, explanation: String(item.explanation || "").trim(), points: 1 };
        if (type === "multiple-choice" || type === "reading-comprehension" || type === "listening") {
          const opts = Array.isArray(item.options) ? item.options.map(String) : [];
          q.options = opts.slice(0, 4).map((t, i) => ({ id: String(i + 1), text: t }));
          const ca = String(item.correct_answer || opts[0] || "");
          const caIdx = q.options.findIndex((o) => o.text === ca);
          q.correctAnswer = caIdx >= 0 ? String(caIdx + 1) : "1";
          if (type !== "multiple-choice") q.passage = String(item.passage || item.audio_transcript || "");
        } else if (type === "multiple-answer") {
          const opts = Array.isArray(item.options) ? item.options.map(String) : [];
          q.options = opts.slice(0, 4).map((t, i) => ({ id: String(i + 1), text: t }));
          const cas = Array.isArray(item.correct_answers) ? item.correct_answers.map(String) : [String(item.correct_answer || opts[0] || "")];
          q.correctAnswer = cas.map((ca) => {
            const idx = q.options.findIndex((o) => o.text === ca);
            return idx >= 0 ? String(idx + 1) : "1";
          });
        } else if (type === "true-false") {
          q.options = [{ id: "1", text: "True" }, { id: "2", text: "False" }];
          q.correctAnswer = String(item.correct_answer || "True").toLowerCase().startsWith("t") ? "1" : "2";
        } else if (["fill-in-the-blank", "short-answer", "audio-fill-blank", "dictation", "pronunciation"].includes(type)) {
          q.correctAnswer = String(item.correct_answer || item.audio_transcript || "").trim();
          if (item.audio_transcript) q.audioTranscript = String(item.audio_transcript);
        } else if (type === "long-answer" || type === "speaking") {
          q.points = 2;
        } else if (type === "matching") {
          q.pairs = Array.isArray(item.pairs) ? item.pairs.filter((p) => p.left && p.right) : [];
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
    } catch (e) {
      console.error("POST /api/teacher/ai/generate-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to generate questions" });
    }
  });
  app.post("/api/teacher/smart-quiz/generate", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const body = req.body;
      const { level, selectedSections, courseId, title } = body;
      const timeLimit = Number(body.timeLimit) || 30;
      const passmark = Number(body.passmark) || 70;
      const questionsPerSection = Math.min(Math.max(Number(body.questionsPerSection) || 3, 2), 8);
      const questionTypes = Array.isArray(body.questionTypes) && body.questionTypes.length > 0 ? body.questionTypes : ["multiple-choice"];
      const useAI = Boolean((process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim());
      if (!level || !Array.isArray(selectedSections) || selectedSections.length === 0) {
        return res.status(400).json({ error: "level and selectedSections are required" });
      }
      if (!courseId) return res.status(400).json({ error: "courseId is required" });
      if (!title?.trim()) return res.status(400).json({ error: "title is required" });
      if (caller.role !== "admin") {
        const { data: course } = await supabaseAdmin.from("courses").select("teacher_id").eq("id", courseId).maybeSingle();
        if (!course) return res.status(404).json({ error: "Course not found" });
        const scopedIds = await getTeacherIdCandidates(caller.userId);
        const tid = course.teacher_id ? String(course.teacher_id) : "";
        if (tid && !scopedIds.includes(tid) && tid !== caller.userId) {
          return res.status(403).json({ error: "You do not own this course" });
        }
      }
      let questions = [];
      if (useAI) {
        const aiApiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
        const TYPE_LABELS = {
          "multiple-choice": "Multiple Choice",
          "multiple-answer": "Multiple Answer",
          "true-false": "True / False",
          "fill-in-the-blank": "Fill in the Blank",
          "short-answer": "Short Answer",
          "long-answer": "Essay",
          "matching": "Matching",
          "ordering": "Ordering",
          "word-bank": "Word Bank",
          "sentence-building": "Sentence Building",
          "drag-drop": "Drag & Drop",
          "cloze": "Cloze Test",
          "listening": "Listening Questions",
          "audio-fill-blank": "Audio Fill in Blank",
          "dictation": "Dictation",
          "speaking": "Speaking",
          "pronunciation": "Pronunciation Check",
          "reading-comprehension": "Reading Comprehension"
        };
        const typeLabels = questionTypes.map((t) => TYPE_LABELS[t] || t).join(", ");
        const totalCount = selectedSections.length * questionsPerSection;
        const perType = Math.ceil(totalCount / questionTypes.length);
        const sectionList = selectedSections.map((s) => `- ${s.unitTitle}: ${s.type} (${s.topic})`).join("\n");
        const smartSysPrompt = `You are an expert English language teacher creating a Headway-style quiz. Respond ONLY with a valid JSON array \u2014 no markdown, no extra text.`;
        const smartUserPrompt = `Generate exactly ${totalCount} English language questions for ${level} level students based on these topics:
${sectionList}

Types: ${typeLabels} (~${perType} per type).
Rules: fill-in-the-blank uses ___. matching needs pairs array. ordering/drag-drop needs items+correct_order. word-bank needs word_bank array. Always include explanation.
Return ONLY a JSON array:
[...questions]`;
        let rawAI = "";
        let aiSucceeded = false;
        if (aiApiKey) {
          const { GoogleGenAI } = await import("@google/genai");
          const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
          const ai = geminiBaseUrl ? new GoogleGenAI({ apiKey: aiApiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } }) : new GoogleGenAI({ apiKey: aiApiKey });
          const maxRetries = 3;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 2e3));
              const aiResult = await ai.models.generateContent({ model: "gemini-2.0-flash-lite", contents: `${smartSysPrompt}

${smartUserPrompt}` });
              rawAI = (aiResult.text || "").trim();
              aiSucceeded = true;
              break;
            } catch (aiErr) {
              const status = aiErr?.status ?? aiErr?.code ?? 0;
              const isRetryable = status === 503 || status === 429 || String(aiErr?.message || "").includes("UNAVAILABLE") || String(aiErr?.message || "").includes("overloaded");
              console.warn(`[smart-quiz] Gemini attempt ${attempt + 1} failed (${status}): ${aiErr?.message}`);
              if (!isRetryable || attempt === maxRetries - 1) break;
            }
          }
        }
        if (!aiSucceeded) {
          console.warn("[smart-quiz] AI unavailable \u2014 falling back to static question bank");
        }
        const parseArr = (text) => {
          const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
          const clean = (fenced ? fenced[1] : text).trim();
          try {
            const p = JSON.parse(clean);
            return Array.isArray(p) ? p : [];
          } catch {
          }
          let depth = 0, start = -1;
          for (let i = 0; i < clean.length; i++) {
            if (clean[i] === "[") {
              if (start === -1) start = i;
              depth++;
            } else if (clean[i] === "]" && start !== -1) {
              depth--;
              if (depth === 0) {
                try {
                  const p = JSON.parse(clean.slice(start, i + 1));
                  return Array.isArray(p) ? p : [];
                } catch {
                }
              }
            }
          }
          return [];
        };
        if (aiSucceeded && rawAI) {
          const parsed = parseArr(rawAI);
          questions = parsed.map((item) => {
            const type = String(item.type || "multiple-choice");
            const text = String(item.question || item.text || "").trim();
            if (!text) return null;
            return { type, text, options: Array.isArray(item.options) ? item.options.map(String) : [], correct_answer: String(item.correct_answer || ""), explanation: String(item.explanation || ""), ...item };
          }).filter(Boolean);
          console.log(`[smart-quiz] AI generated ${questions.length} questions for ${selectedSections.length} sections (level=${level}, types=${questionTypes.join(",")})`);
        }
      }
      if (questions.length === 0) {
        if (useAI) console.warn("[smart-quiz] AI returned no questions \u2014 using static bank as fallback");
        const transformToType = (q, qType, qIndex) => {
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
      const quizPayload = {
        title: title.trim(),
        description: `Smart Test Builder \u2014 ${level} \xB7 ${selectedSections.length} sections \xB7 ${questionTypes.join(", ")}`,
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
            questionTypes
          }
        }
      };
      const { data: inserted, error: insErr } = await insertCompatibleQuizAdmin(quizPayload, caller.userId);
      if (insErr || !inserted?.id) {
        console.error("[smart-quiz] quiz insert error:", insErr);
        return res.status(500).json({ error: insErr?.message || "Failed to create quiz" });
      }
      const quizId = inserted.id;
      const DB_ALLOWED_TYPES = /* @__PURE__ */ new Set(["multiple-choice", "true-false", "open-text", "fill-in-the-blank", "matching", "ordering", "image", "video", "reading", "instruction"]);
      const normalizeQType = (t) => {
        if (DB_ALLOWED_TYPES.has(t)) return t;
        const map = {
          "word-bank": "fill-in-the-blank",
          "cloze": "fill-in-the-blank",
          "audio-fill-blank": "fill-in-the-blank",
          "sentence-building": "open-text",
          "short-answer": "open-text",
          "long-answer": "open-text",
          "dictation": "open-text",
          "speaking": "open-text",
          "pronunciation": "open-text",
          "listening": "open-text",
          "drag-drop": "ordering",
          "multiple-answer": "multiple-choice",
          "reading-comprehension": "reading"
        };
        return map[t] ?? "multiple-choice";
      };
      const questionRows = questions.map((q, idx) => ({
        quiz_id: quizId,
        type: normalizeQType(String(q.type || "multiple-choice")),
        text: String(q.text || q.question || "").trim() || " ",
        question_text: String(q.text || q.question || "").trim() || " ",
        options: Array.isArray(q.options) ? q.options : [],
        correct_answer: q.correct_answer ?? (Array.isArray(q.options) ? q.options[0] : ""),
        explanation: q.explanation ?? null,
        points: ["long-answer", "speaking", "matching"].includes(String(q.type)) ? 2 : 1,
        order: idx
      }));
      let { error: qInsErr } = await supabaseAdmin.from("questions").insert(
        questionRows.map(({ question_text: _qt, ...r }) => r)
      );
      if (qInsErr && /question_text|does not exist|PGRST204/i.test(qInsErr.message || "")) {
        ({ error: qInsErr } = await supabaseAdmin.from("questions").insert(
          questionRows.map(({ text: _t, ...r }) => ({ ...r, question_text: r.question_text }))
        ));
      }
      if (qInsErr) {
        console.warn("[smart-quiz] question insert warning:", qInsErr.message);
      }
      console.log(`[smart-quiz] Created quiz ${quizId} with ${questions.length} questions for level=${level}`);
      return res.json({ success: true, quizId, questionCount: questions.length });
    } catch (e) {
      console.error("POST /api/teacher/smart-quiz/generate", e);
      return res.status(500).json({ error: e?.message || "Failed to generate smart quiz" });
    }
  });
  app.post("/api/teacher/quizzes/:id/regenerate-questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const quizId = req.params.id;
      let quiz = null;
      let quizErr = null;
      ({ data: quiz, error: quizErr } = await supabaseAdmin.from("quizzes").select("id, settings, course_id").eq("id", quizId).maybeSingle());
      if (quizErr || !quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }
      const meta = quiz.settings?.smartTestMeta;
      if (!meta?.level || !Array.isArray(meta?.sections) || meta.sections.length === 0) {
        return res.status(400).json({ error: "This quiz was not created with Smart Test Builder. No regeneration metadata found." });
      }
      const { level, sections: selectedSections, questionsPerSection = 3 } = meta;
      const questions = [];
      for (const sec of selectedSections) {
        const staticQs = getQuestionsForSection(level, sec.topic, questionsPerSection);
        for (const q of staticQs) {
          questions.push({ text: q.text, options: q.options, correct_answer: String((q.correct ?? 0) + 1), explanation: q.explanation });
        }
      }
      console.log(`[regen] Static bank regenerated ${questions.length} questions for quiz ${quizId} (level=${level})`);
      if (questions.length === 0) {
        return res.status(400).json({ error: "Could not generate questions." });
      }
      await supabaseAdmin.from("questions").delete().eq("quiz_id", quizId);
      const questionRows = questions.map((q, idx) => ({
        quiz_id: quizId,
        type: "multiple-choice",
        text: q.text,
        question_text: q.text,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation || null,
        points: 1,
        order: idx
      }));
      let { error: qInsErr } = await supabaseAdmin.from("questions").insert(
        questionRows.map(({ question_text: _qt, ...r }) => r)
      );
      if (qInsErr && /question_text|does not exist|PGRST204/i.test(qInsErr.message || "")) {
        ({ error: qInsErr } = await supabaseAdmin.from("questions").insert(
          questionRows.map(({ text: _t, ...r }) => ({ ...r, question_text: r.question_text }))
        ));
      }
      console.log(`[regen] Replaced questions for quiz ${quizId}: ${questions.length} new questions`);
      return res.json({ success: true, questionCount: questions.length });
    } catch (e) {
      console.error("POST /api/teacher/quizzes/:id/regenerate-questions", e);
      return res.status(500).json({ error: e?.message || "Failed to regenerate questions" });
    }
  });
  app.get("/api/teacher/quizzes/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const quizId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id required" });
      const { data: qz, error: qzErr } = await supabaseAdmin.from("quizzes").select("id, title, description, time_limit, pass_mark, course_id, published, status, type, settings").eq("id", quizId).maybeSingle();
      if (qzErr) return res.status(500).json({ error: qzErr.message });
      if (!qz) return res.status(404).json({ error: "Exam not found" });
      let courseName = "";
      if (qz.course_id) {
        const { data: c } = await supabaseAdmin.from("courses").select("title").eq("id", qz.course_id).maybeSingle();
        courseName = c?.title || "";
      }
      const { data: qs } = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId).order("order", { ascending: true });
      return res.json({ success: true, quiz: { ...qz, courseName }, questions: qs || [] });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to load quiz" });
    }
  });
  app.patch("/api/teacher/quizzes/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const quizId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id required" });
      const body = req.body;
      const updates = {};
      if (body.title !== void 0) updates.title = String(body.title);
      if (body.description !== void 0) updates.description = body.description != null ? String(body.description) : null;
      if (body.course_id !== void 0) updates.course_id = body.course_id;
      if (body.time_limit !== void 0) updates.time_limit = Number(body.time_limit) || 0;
      if (body.published !== void 0) updates.published = Boolean(body.published);
      if (body.settings !== void 0 && body.settings !== null) updates.settings = body.settings;
      if ("publish_at" in body) updates.publish_at = body.publish_at ? new Date(String(body.publish_at)).toISOString() : null;
      let payload = { ...updates };
      for (let i = 0; i < 8; i++) {
        const { error } = await supabaseAdmin.from("quizzes").update(payload).eq("id", quizId);
        if (!error) return res.json({ success: true });
        const e = error;
        const msg = (e.message || "").toLowerCase();
        if ((e.code === "PGRST204" || /schema cache|could not find|does not exist/i.test(msg)) && msg.includes("settings") && "settings" in payload) {
          const { settings: _s, ...rest } = payload;
          void _s;
          payload = rest;
          continue;
        }
        if (missingQuizzesPublishedColumn(e) && "published" in payload) {
          const { published: _p, ...rest } = payload;
          void _p;
          payload = rest;
          continue;
        }
        if ((e.code === "PGRST204" || e.code === "42703") && msg.includes("publish_at") && "publish_at" in payload) {
          const { publish_at: _pa, ...rest } = payload;
          void _pa;
          payload = rest;
          continue;
        }
        return res.status(500).json({ error: e.message || "Failed to update quiz" });
      }
      return res.status(500).json({ error: "Quiz update: max retries" });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to update quiz" });
    }
  });
  app.get("/api/teacher/quizzes/:quizId/questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const quizId = typeof req.params.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id is required" });
      const { data: quizRow, error: qErr } = await supabaseAdmin.from("quizzes").select("id, course_id").eq("id", quizId).maybeSingle();
      if (qErr) throw qErr;
      if (!quizRow?.id) return res.status(404).json({ error: "Quiz not found." });
      if (caller.role !== "admin") {
        const gate = await assertTeacherOwnsCourse(caller.userId, String(quizRow.course_id));
        if (!gate.ok) {
          return res.status(403).json({ error: "You do not have access to this quiz." });
        }
      }
      let qRes = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId).order("order", { ascending: true }).order("created_at", { ascending: true });
      if (qRes.error) {
        qRes = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId).order("created_at", { ascending: true });
      }
      if (qRes.error) {
        qRes = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId);
      }
      if (qRes.error) throw qRes.error;
      res.json({ success: true, questions: qRes.data || [] });
    } catch (e) {
      console.error("GET /api/teacher/quizzes/:quizId/questions", e);
      res.status(500).json({ error: e?.message || "Failed to load questions" });
    }
  });
  app.post("/api/teacher/quizzes/:quizId/save-questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const quizId = typeof req.params.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id is required" });
      const rows = req.body?.questions;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "Body must include questions: []" });
      }
      const { data: quizRow, error: qErr } = await supabaseAdmin.from("quizzes").select("id, course_id").eq("id", quizId).maybeSingle();
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
      const normalizeQuestionBody = (r) => {
        const raw = r.text ?? r.question_text;
        if (typeof raw === "string" && raw.trim()) return raw.trim();
        if (typeof raw === "string") return raw.length ? raw : " ";
        return " ";
      };
      const buildInsertRows = (mode) => rows.map((r, idx) => {
        const orderVal = typeof r.order === "number" ? r.order : typeof r["order"] === "number" ? r["order"] : idx;
        const qtext = normalizeQuestionBody(r);
        const row = {
          quiz_id: quizId,
          type: typeof r.type === "string" && r.type.trim() ? r.type.trim() : "multiple-choice",
          media_url: r.media_url ?? null,
          media_type: r.media_type ?? null,
          reading_passage: r.reading_passage ?? null,
          options: r.options ?? null,
          correct_answer: r.correct_answer ?? null,
          points: (() => {
            const raw = r.points;
            const n = typeof raw === "number" && !Number.isNaN(raw) ? raw : Number(raw);
            return Number.isFinite(n) ? n : 1;
          })(),
          explanation: r.explanation ?? null,
          order: orderVal
        };
        if (mode === "both") {
          row.text = qtext;
          row.question_text = qtext;
        } else {
          row[mode] = qtext;
        }
        return row;
      });
      const errToStr = (e) => e ? [e.message, e.details, e.hint, e.code].filter(Boolean).join(" \u2014 ") : "";
      let insertRows = buildInsertRows("text");
      let { error: insErr } = await supabaseAdmin.from("questions").insert(insertRows);
      let errStr = errToStr(insErr);
      const looksLikeQuestionTextMissing = insErr && (/question_text/i.test(errStr) || /null value[^\n]*question_text/i.test(errStr) || /column[^\n]*\btext\b.*does not exist|PGRST204[^\n]*\btext\b/i.test(errStr));
      if (looksLikeQuestionTextMissing) {
        insertRows = buildInsertRows("question_text");
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(insertRows));
        errStr = errToStr(insErr);
      }
      const looksLikeTextMissingAfterLegacy = insErr && (/null value[^\n]*\btext\b/i.test(errStr) || /column[^\n]*question_text\b.*does not exist|PGRST204[^\n]*question_text/i.test(errStr));
      if (looksLikeTextMissingAfterLegacy) {
        insertRows = buildInsertRows("both");
        ({ error: insErr } = await supabaseAdmin.from("questions").insert(insertRows));
      }
      if (insErr) {
        const msg = [insErr.message, insErr.details, insErr.hint].filter(Boolean).join(" \u2014 ") || insErr.code || "Insert failed";
        return res.status(400).json({ error: msg });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("POST /api/teacher/quizzes/:quizId/save-questions", e);
      res.status(500).json({ error: e?.message || "Failed to save questions" });
    }
  });
  const teacherQuizDeleteHandler = async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const quizId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id is required" });
      const { data: quizRow, error: qErr } = await supabaseAdmin.from("quizzes").select("id, course_id").eq("id", quizId).maybeSingle();
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
        const code = String(qaRes.error.code || "");
        const missingTable = code === "42P01" || code === "PGRST205" || /could not find the table|does not exist/i.test(msg);
        if (!missingTable) throw qaRes.error;
      }
      const attRes = await supabaseAdmin.from("attempts").delete().eq("quiz_id", quizId);
      if (attRes.error) {
        const code = String(attRes.error.code || "");
        const msg = String(attRes.error.message || "");
        const missingTable = code === "42P01" || code === "PGRST205" || /does not exist|could not find the table/i.test(msg);
        if (!missingTable) throw attRes.error;
      }
      const { data: deleted, error: dErr } = await supabaseAdmin.from("quizzes").delete().eq("id", quizId).select("id");
      if (dErr) {
        if (dErr.code === "23503") {
          return res.status(409).json({
            error: "This quiz cannot be deleted because something still references it (e.g. a lesson). Remove that link first."
          });
        }
        throw dErr;
      }
      if (!deleted?.length) {
        return res.status(404).json({ error: "Quiz not found or already deleted." });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("DELETE /api/teacher/quizzes/:id", e);
      res.status(500).json({ error: e?.message || "Failed to delete quiz" });
    }
  };
  app.delete("/api/teacher/quizzes/:id", teacherQuizDeleteHandler);
  app.post("/api/teacher/quizzes/:id/delete", teacherQuizDeleteHandler);
  const isQuizSectionsMissing = (e) => {
    const msg = String(e?.message || "");
    const code = String(e?.code || "");
    return code === "42P01" || code === "PGRST205" || /does not exist|could not find the table/i.test(msg);
  };
  app.get("/api/teacher/quizzes/:id/sections", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const quizId = String(req.params.id || "").trim();
      if (!quizId) return res.status(400).json({ error: "Quiz id required" });
      const { data, error } = await supabaseAdmin.from("quiz_sections").select("*").eq("quiz_id", quizId).order("order_index", { ascending: true });
      if (error) {
        if (isQuizSectionsMissing(error)) return res.json({ success: true, sections: [] });
        throw error;
      }
      return res.json({ success: true, sections: data || [] });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to load sections" });
    }
  });
  app.post("/api/teacher/quizzes/:id/sections/sync", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const quizId = String(req.params.id || "").trim();
      if (!quizId) return res.status(400).json({ error: "Quiz id required" });
      const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
      const delRes = await supabaseAdmin.from("quiz_sections").delete().eq("quiz_id", quizId);
      if (delRes.error && !isQuizSectionsMissing(delRes.error)) throw delRes.error;
      if (sections.length === 0) return res.json({ success: true, sections: [] });
      const rows = sections.map((s, idx) => ({
        quiz_id: quizId,
        title: String(s.title || "Section").trim() || "Section",
        type: String(s.type || "general").trim(),
        instructions: s.instructions ? String(s.instructions).trim() : null,
        audio_url: s.audio_url ? String(s.audio_url).trim() : null,
        order_index: idx
      }));
      const { data: inserted, error: insErr } = await supabaseAdmin.from("quiz_sections").insert(rows).select();
      if (insErr) {
        if (isQuizSectionsMissing(insErr)) return res.json({ success: true, sections: [] });
        throw insErr;
      }
      return res.json({ success: true, sections: inserted || [] });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to sync sections" });
    }
  });
  app.get("/api/student/quizzes/:id/sections", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const quizId = String(req.params.id || "").trim();
      if (!quizId) return res.status(400).json({ error: "Quiz id required" });
      const { data, error } = await supabaseAdmin.from("quiz_sections").select("id,title,type,instructions,audio_url,order_index").eq("quiz_id", quizId).order("order_index", { ascending: true });
      if (error) {
        if (isQuizSectionsMissing(error)) return res.json({ success: true, sections: [] });
        throw error;
      }
      return res.json({ success: true, sections: data || [] });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to load sections" });
    }
  });
  app.get("/api/admin/users", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const adminUsersCacheKey = "admin-users:teachers";
      const cachedAdminUsers = getCachedApiResponse(adminUsersCacheKey);
      if (cachedAdminUsers) return res.json(cachedAdminUsers);
      const { data, error } = await supabaseAdmin.from("profiles").select("id, email, display_name, role, teacher_id, status, created_at").eq("role", "teacher").order("created_at", { ascending: false });
      if (error) throw error;
      const payload = { success: true, users: data || [] };
      setCachedApiResponse(adminUsersCacheKey, payload, 15e3);
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load users" });
    }
  });
  app.patch("/api/admin/users/:userId/status", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const userId = String(req.params.userId || "").trim();
      const status = req.body?.status;
      if (!userId) return res.status(400).json({ error: "userId required" });
      if (status !== "active" && status !== "inactive") {
        return res.status(400).json({ error: "status must be active or inactive" });
      }
      const { data: profile, error: pErr } = await supabaseAdmin.from("profiles").select("id, role").eq("id", userId).maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: "User not found" });
      if (profile.role !== "teacher") {
        return res.status(400).json({ error: "Only teacher accounts can be updated from this action" });
      }
      const { error: uErr } = await supabaseAdmin.from("profiles").update({ status }).eq("id", userId);
      if (uErr) throw uErr;
      let cascadedCount = 0;
      if (status === "inactive") {
        const { data: students, error: cErr } = await supabaseAdmin.from("profiles").update({ status: "inactive" }).eq("teacher_id", userId).select("id");
        if (cErr) throw cErr;
        cascadedCount = students?.length ?? 0;
      }
      res.json({ success: true, cascadedCount });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to update status" });
    }
  });
  app.patch("/api/admin/students/:studentId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const studentId = String(req.params.studentId || "").trim();
      if (!studentId) return res.status(400).json({ error: "studentId required" });
      const { data: profile, error: pErr } = await supabaseAdmin.from("profiles").select("id, role").eq("id", studentId).maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: "Student not found" });
      if (profile.role !== "student") return res.status(400).json({ error: "Target user is not a student" });
      const body = req.body || {};
      const update = {};
      if (typeof body.display_name === "string") update.display_name = body.display_name.trim();
      if (typeof body.email === "string") update.email = body.email.trim();
      if (body.status === "active" || body.status === "inactive") update.status = body.status;
      if (typeof body.teacher_id === "string" || body.teacher_id === null) update.teacher_id = body.teacher_id;
      if (Object.keys(update).length === 0) return res.status(400).json({ error: "No valid fields to update" });
      const { data, error } = await supabaseAdmin.from("profiles").update(update).eq("id", studentId).select("id, email, display_name, role, teacher_id, status, created_at").single();
      if (error) throw error;
      res.json({ success: true, student: data });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to update student" });
    }
  });
  app.delete("/api/admin/students/:studentId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const studentId = String(req.params.studentId || "").trim();
      if (!studentId) return res.status(400).json({ error: "studentId required" });
      const { data: profile, error: pErr } = await supabaseAdmin.from("profiles").select("id, role").eq("id", studentId).maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: "Student not found" });
      if (profile.role !== "student") return res.status(400).json({ error: "Target user is not a student" });
      const { error } = await supabaseAdmin.from("profiles").delete().eq("id", studentId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to delete student" });
    }
  });
  app.patch("/api/admin/teachers/:teacherId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const teacherId = String(req.params.teacherId || "").trim();
      if (!teacherId) return res.status(400).json({ error: "teacherId required" });
      const { data: profile, error: pErr } = await supabaseAdmin.from("profiles").select("id, role").eq("id", teacherId).maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: "Teacher not found" });
      if (profile.role !== "teacher") return res.status(400).json({ error: "Target user is not a teacher" });
      const body = req.body || {};
      const update = {};
      if (typeof body.display_name === "string") update.display_name = body.display_name.trim();
      if (typeof body.email === "string") update.email = body.email.trim();
      if (body.status === "active" || body.status === "inactive") update.status = body.status;
      if (Object.keys(update).length === 0) return res.status(400).json({ error: "No valid fields to update" });
      const { data, error } = await supabaseAdmin.from("profiles").update(update).eq("id", teacherId).select("id, email, display_name, role, status, created_at").single();
      if (error) throw error;
      res.json({ success: true, teacher: data });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to update teacher" });
    }
  });
  app.delete("/api/admin/teachers/:teacherId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const teacherId = String(req.params.teacherId || "").trim();
      if (!teacherId) return res.status(400).json({ error: "teacherId required" });
      const { data: profile, error: pErr } = await supabaseAdmin.from("profiles").select("id, role").eq("id", teacherId).maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: "Teacher not found" });
      if (profile.role !== "teacher") return res.status(400).json({ error: "Target user is not a teacher" });
      const { error } = await supabaseAdmin.from("profiles").delete().eq("id", teacherId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e?.message || "Failed to delete teacher" });
    }
  });
  const isLiveSessionsStartedAtColumnMissing = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""} ${error?.code || ""}`.toLowerCase();
    if (!hay.includes("started_at")) return false;
    if (/schema cache|could not find|does not exist|42703|undefined column/.test(hay)) return true;
    if (hay.includes("can only be updated to default")) return true;
    return false;
  };
  app.post("/api/jitsi-token", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { roomName, moderator = false, displayName } = req.body;
      const appId = process.env.JAAS_APP_ID;
      const keyId = process.env.JAAS_API_KEY_ID;
      const privateKey = process.env.JAAS_PRIVATE_KEY;
      if (!appId || !keyId || !privateKey) {
        return res.json({ token: null, domain: "meet.jit.si", appId: null });
      }
      const now = Math.floor(Date.now() / 1e3);
      const payload = {
        iss: "chat",
        aud: "jitsi",
        iat: now - 10,
        nbf: now - 10,
        exp: now + 7200,
        sub: appId,
        room: roomName || "*",
        context: {
          user: {
            moderator: String(moderator),
            name: displayName || caller.displayName || caller.email || "User",
            id: caller.id,
            avatar: "",
            email: caller.email || ""
          },
          features: {
            livestreaming: "false",
            "outbound-call": "false",
            "sip-outbound-call": "false",
            transcription: "false",
            recording: "false"
          }
        }
      };
      const pemKey = privateKey.replace(/\\n/g, "\n");
      const token = jwt.sign(payload, pemKey, {
        algorithm: "RS256",
        header: { alg: "RS256", kid: `${appId}/${keyId}`, typ: "JWT" }
      });
      res.json({ token, domain: "8x8.vc", appId });
    } catch (err) {
      console.error("[jitsi-token] error:", err.message);
      res.json({ token: null, domain: "meet.jit.si", appId: null });
    }
  });
  app.get("/api/teacher/live-sessions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const { host_id } = req.query;
      const effectiveHostId = caller.role === "admin" ? host_id : caller.userId;
      let query = supabaseAdmin.from("live_sessions").select("*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)").order("scheduled_at", { ascending: false });
      if (effectiveHostId) query = query.eq("host_id", effectiveHostId);
      const { data, error } = await query;
      if (error) throw error;
      const ids = (data || []).map((s) => s.id);
      const invitedCounts = {};
      const joinedCounts = {};
      if (ids.length > 0) {
        const { data: pData, error: pErr } = await supabaseAdmin.from("session_participants").select("session_id,joined_at").in("session_id", ids);
        if (pErr && !isSessionParticipantsTableMissing(pErr)) throw pErr;
        (pData || []).forEach((p) => {
          invitedCounts[p.session_id] = (invitedCounts[p.session_id] || 0) + 1;
          if (p.joined_at) joinedCounts[p.session_id] = (joinedCounts[p.session_id] || 0) + 1;
        });
      }
      const sessions = (data || []).map((s) => ({
        ...s,
        participant_count: s.status === "ended" ? joinedCounts[s.id] || 0 : invitedCounts[s.id] || 0,
        invited_count: invitedCounts[s.id] || 0,
        joined_count: joinedCounts[s.id] || 0
      }));
      res.json({ success: true, sessions });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden: teacher role required" });
      const { participant_ids, class_id, class_ids, ...sessionData } = req.body;
      const classIds = Array.isArray(class_ids) ? class_ids.map((x) => String(x || "").trim()).filter(Boolean) : class_id ? [String(class_id).trim()] : [];
      const payload = {
        ...sessionData,
        host_id: caller.userId,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data: session, error } = await supabaseAdmin.from("live_sessions").insert(payload).select().single();
      if (error) throw error;
      const inviteIds = Array.isArray(participant_ids) ? [...participant_ids] : [];
      for (const cid of classIds) {
        const { data: classRow } = await supabaseAdmin.from("classes").select("student_ids, course_id").eq("id", cid).maybeSingle();
        const classStudentIds = Array.isArray(classRow?.student_ids) ? classRow.student_ids.filter(Boolean) : [];
        if (classStudentIds.length > 0) {
          classStudentIds.forEach((uid) => {
            if (!inviteIds.includes(uid)) inviteIds.push(uid);
          });
        } else if (classRow?.course_id) {
          const { data: courseRow } = await supabaseAdmin.from("courses").select("student_ids").eq("id", classRow.course_id).maybeSingle();
          (courseRow?.student_ids || []).forEach((uid) => {
            if (uid && !inviteIds.includes(uid)) inviteIds.push(uid);
          });
        }
      }
      if (inviteIds.length > 0) {
        const participantRows = inviteIds.map((uid) => ({
          session_id: session.id,
          user_id: uid,
          role: "student",
          invited_at: (/* @__PURE__ */ new Date()).toISOString(),
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        }));
        const upsertRes = await supabaseAdmin.from("session_participants").upsert(participantRows, { onConflict: "session_id,user_id" });
        if (upsertRes.error && !isSessionParticipantsTableMissing(upsertRes.error)) {
          throw upsertRes.error;
        }
        const notifRows = inviteIds.map((uid) => ({
          user_id: uid,
          title: "Live Session Invitation",
          message: `You've been invited to "${session.title}" \u2014 join now`,
          type: "info",
          action_url: `/student/live-sessions/${session.id}`,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        }));
        await notifInsert(notifRows);
      }
      res.json({ success: true, session });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/teacher/live-sessions/:id", async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const ALLOWED_FIELDS = ["status", "title", "description", "scheduled_at", "duration_minutes", "recording_url", "jitsi_room_name", "started_at", "chat_enabled", "reactions_enabled", "raise_hand_enabled"];
      const update = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      for (const key of ALLOWED_FIELDS) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (Object.keys(update).length === 1) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }
      if (req.body.status === "live" && !update.started_at) {
        update.started_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      if (update.recording_url) {
        const { data: existing } = await supabaseAdmin.from("live_sessions").select("recording_urls").eq("id", req.params.id).single();
        const existingUrls = Array.isArray(existing?.recording_urls) ? existing.recording_urls : [];
        const newUrl = String(update.recording_url);
        if (!existingUrls.includes(newUrl)) {
          update.recording_urls = [...existingUrls, newUrl];
        }
      }
      let updateResult = await supabaseAdmin.from("live_sessions").update(update).eq("id", req.params.id).select().single();
      if (updateResult.error && isLiveSessionsStartedAtColumnMissing(updateResult.error) && "started_at" in update) {
        const { started_at: _startedAt, ...fallbackUpdate } = update;
        updateResult = await supabaseAdmin.from("live_sessions").update(fallbackUpdate).eq("id", req.params.id).select().single();
      }
      const { data, error } = updateResult;
      if (error) throw error;
      if (req.body.status === "live") {
        const { data: parts, error: partsErr } = await supabaseAdmin.from("session_participants").select("user_id").eq("session_id", req.params.id);
        if (partsErr && !isSessionParticipantsTableMissing(partsErr)) throw partsErr;
        if (parts && parts.length > 0) {
          const notifRows = parts.map((p) => ({
            user_id: p.user_id,
            title: "Session is Live Now!",
            message: `"${data.title}" has started \u2014 join now`,
            type: "info",
            action_url: `/student/live-sessions/${req.params.id}`,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          }));
          await notifInsert(notifRows);
        }
      }
      res.json({ success: true, session: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/teacher/live-sessions/:id", async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { error } = await supabaseAdmin.from("live_sessions").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  const assertSessionParticipantAccess = async (req, res, sessionId) => {
    const caller = await getAuthUser(req);
    if (!caller) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    if (caller.role === "admin") return caller.userId;
    const { data: sessionRow } = await supabaseAdmin.from("live_sessions").select("host_id").eq("id", sessionId).single();
    if (!sessionRow) {
      res.status(404).json({ error: "Session not found" });
      return null;
    }
    if (sessionRow.host_id === caller.userId) return caller.userId;
    const { data: participationRows, error: partErr } = await supabaseAdmin.from("session_participants").select("id,is_removed").eq("session_id", sessionId).eq("user_id", caller.userId).limit(1);
    if (partErr && !isSessionParticipantsTableMissing(partErr)) {
      throw partErr;
    }
    const participation = Array.isArray(participationRows) ? participationRows[0] ?? null : null;
    if (participation && participation.is_removed) {
      res.status(403).json({ error: "Forbidden: you have been removed from this session" });
      return null;
    }
    if (participation) return caller.userId;
    res.status(403).json({ error: "Forbidden: join this live session first or ask the host to invite you" });
    return null;
  };
  const assertSessionAccess = async (req, res, sessionId) => {
    const caller = await getAuthUser(req);
    if (!caller) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    if (caller.role === "admin") return caller.userId;
    const sessionRes = await supabaseAdmin.from("live_sessions").select("host_id,course_id,status").eq("id", sessionId).single();
    if (sessionRes.error) {
      res.status(404).json({ error: "Session not found" });
      return null;
    }
    const sessionRow = sessionRes.data || {};
    if (sessionRow.host_id === caller.userId) return caller.userId;
    let participantsTableMissing = false;
    const { data: participationRows, error: partErr } = await supabaseAdmin.from("session_participants").select("id,is_removed").eq("session_id", sessionId).eq("user_id", caller.userId).limit(1);
    const participation = Array.isArray(participationRows) ? participationRows[0] ?? null : null;
    if (partErr) {
      if (isSessionParticipantsTableMissing(partErr)) {
        participantsTableMissing = true;
      } else {
        throw partErr;
      }
    }
    if (participation) {
      const p = participation;
      if (p.is_removed) {
        res.status(403).json({ error: "Forbidden: you have been removed from this session" });
        return null;
      }
      return caller.userId;
    }
    if (sessionRow.course_id) {
      const { data: courseRow } = await supabaseAdmin.from("courses").select("student_ids").eq("id", sessionRow.course_id).single();
      if (courseRow && Array.isArray(courseRow.student_ids) && courseRow.student_ids.includes(caller.userId)) {
        return caller.userId;
      }
      const { data: classRows } = await supabaseAdmin.from("classes").select("student_ids").eq("course_id", sessionRow.course_id);
      if (Array.isArray(classRows)) {
        for (const cl of classRows) {
          if (Array.isArray(cl.student_ids) && cl.student_ids.includes(caller.userId)) {
            return caller.userId;
          }
        }
      }
    }
    if (participantsTableMissing && sessionRow.host_id) {
      const teacherIdCandidates = await getTeacherIdCandidates(sessionRow.host_id);
      const scopedIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [sessionRow.host_id];
      const { data: linkedProfile } = await supabaseAdmin.from("profiles").select("id").eq("id", caller.userId).in("teacher_id", scopedIds).maybeSingle();
      if (linkedProfile) return caller.userId;
    }
    res.status(403).json({ error: "Forbidden: you are not a participant of this session" });
    return null;
  };
  app.get("/api/student/live-sessions/:id", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { data, error } = await supabaseAdmin.from("live_sessions").select("*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)").eq("id", req.params.id).single();
      if (error || !data) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json({ success: true, session: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/student/live-sessions/:id/recording", async (req, res) => {
    try {
      const userId = await assertSessionAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin.from("live_sessions").select("id,title,recording_url,status,scheduled_at").eq("id", req.params.id).single();
      if (error) throw error;
      if (!data.recording_url) return res.json({ success: true, recording_url: null });
      res.json({ success: true, recording_url: data.recording_url, title: data.title });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/live-sessions/:id", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { data, error } = await supabaseAdmin.from("live_sessions").select("*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)").eq("id", req.params.id).single();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      if (caller.role !== "admin" && data.host_id !== caller.userId) {
        const { data: part } = await supabaseAdmin.from("session_participants").select("id,is_removed").eq("session_id", req.params.id).eq("user_id", caller.userId).limit(1).maybeSingle();
        if (!part || part.is_removed) {
          res.status(403).json({ error: "Forbidden: you are not the host or an invited participant" });
          return;
        }
      }
      res.json({ success: true, session: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/live-sessions/:id/participants", async (req, res) => {
    try {
      const userId = await assertSessionParticipantAccess(req, res, req.params.id);
      if (!userId) return;
      const { data, error } = await supabaseAdmin.from("session_participants").select("*, user:profiles!user_id(id,display_name,email,avatar_url)").eq("session_id", req.params.id);
      if (error) throw error;
      res.json({ success: true, participants: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions/:id/invite", async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { user_ids, class_id } = req.body;
      const inviteIds = Array.isArray(user_ids) ? [...user_ids] : [];
      if (class_id) {
        const { data: classRow } = await supabaseAdmin.from("classes").select("student_ids").eq("id", class_id).single();
        (classRow?.student_ids || []).forEach((uid) => {
          if (!inviteIds.includes(uid)) inviteIds.push(uid);
        });
      }
      if (inviteIds.length === 0) return res.status(400).json({ error: "No user IDs provided" });
      const { data: session } = await supabaseAdmin.from("live_sessions").select("title").eq("id", req.params.id).single();
      const rows = inviteIds.map((uid) => ({
        session_id: req.params.id,
        user_id: uid,
        role: "student",
        invited_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }));
      await supabaseAdmin.from("session_participants").upsert(rows, { onConflict: "session_id,user_id" });
      const notifRows = inviteIds.map((uid) => ({
        user_id: uid,
        title: "Live Session Invitation",
        message: `You've been invited to "${session?.title || "a session"}" \u2014 join now`,
        type: "info",
        action_url: `/student/live-sessions/${req.params.id}`,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }));
      await notifInsert(notifRows);
      res.json({ success: true, invited: inviteIds.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/teacher/live-sessions/:id/participants/:userId", async (req, res) => {
    try {
      const { id, userId } = req.params;
      const caller = await getAuthUser(req);
      if (!caller) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const isSelfLeave = caller.userId === userId;
      if (isSelfLeave) {
        const { left_at, is_hand_raised } = req.body;
        if (left_at === void 0 && is_hand_raised === void 0) {
          return res.status(403).json({ error: "Forbidden: participants may only set their own left_at or is_hand_raised" });
        }
        const selfUpdate = {};
        if (left_at !== void 0) selfUpdate.left_at = left_at;
        if (is_hand_raised !== void 0) selfUpdate.is_hand_raised = is_hand_raised;
        const { data: data2, error: error2 } = await supabaseAdmin.from("session_participants").update(selfUpdate).eq("session_id", id).eq("user_id", userId).select().single();
        if (error2) throw error2;
        return res.json({ success: true, participant: data2 });
      }
      const sessionRow = await assertSessionHost(req, res, id);
      if (!sessionRow) return;
      const HOST_FIELDS = ["is_muted", "is_pinned", "left_at", "is_removed", "is_hand_raised"];
      const update = {};
      for (const key of HOST_FIELDS) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }
      const { data, error } = await supabaseAdmin.from("session_participants").update(update).eq("session_id", id).eq("user_id", userId).select().single();
      if (error) throw error;
      res.json({ success: true, participant: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions/:id/join", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: "user_id is required" });
      if (caller.userId !== user_id && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: can only log own attendance" });
      }
      const { data: sessionRow, error: sErr } = await supabaseAdmin.from("live_sessions").select("id,status,host_id").eq("id", req.params.id).single();
      if (sErr || !sessionRow) return res.status(404).json({ error: "Session not found" });
      const isHost = caller.userId === sessionRow.host_id || caller.role === "admin";
      if (sessionRow.status !== "live" && !isHost) {
        return res.status(403).json({ error: "Session is not live" });
      }
      if (!isHost) {
        const { data: pRow, error: pErr } = await supabaseAdmin.from("session_participants").select("id,is_removed").eq("session_id", req.params.id).eq("user_id", user_id).maybeSingle();
        const tableMissing = pErr && isSessionParticipantsTableMissing(pErr);
        if (pErr && !tableMissing) throw pErr;
        if (pRow && pRow.is_removed) return res.status(403).json({ error: "You have been removed from this session" });
        if (!pRow && !tableMissing) {
        }
      }
      const upsertRes = await supabaseAdmin.from("session_participants").upsert({ session_id: req.params.id, user_id, role: "student", joined_at: (/* @__PURE__ */ new Date()).toISOString(), created_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "session_id,user_id" }).select().single();
      if (upsertRes.error && !isSessionParticipantsTableMissing(upsertRes.error)) throw upsertRes.error;
      res.json({ success: true, participant: upsertRes.data || { session_id: req.params.id, user_id } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions/:id/leave", async (req, res) => {
    try {
      const caller = await getAuthUser(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: "user_id is required" });
      if (caller.userId !== user_id && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: can only log own attendance" });
      }
      const { data: sessionRow, error: sErr } = await supabaseAdmin.from("live_sessions").select("id,status,host_id").eq("id", req.params.id).single();
      if (sErr || !sessionRow) return res.status(404).json({ error: "Session not found" });
      const isHost = caller.userId === sessionRow.host_id || caller.role === "admin";
      if (!isHost) {
        const { data: pRow, error: pErr } = await supabaseAdmin.from("session_participants").select("id,is_removed,joined_at").eq("session_id", req.params.id).eq("user_id", user_id).maybeSingle();
        const tableMissing = pErr && isSessionParticipantsTableMissing(pErr);
        if (pErr && !tableMissing) throw pErr;
        if (pRow && pRow.is_removed) return res.status(403).json({ error: "You have been removed from this session" });
      }
      const leaveRes = await supabaseAdmin.from("session_participants").update({ left_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("session_id", req.params.id).eq("user_id", user_id).select().single();
      if (leaveRes.error && !isSessionParticipantsTableMissing(leaveRes.error)) throw leaveRes.error;
      res.json({ success: true, participant: leaveRes.data || { session_id: req.params.id, user_id } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/live-sessions/:id/chat", async (req, res) => {
    try {
      const caller = await assertSessionAccess(req, res, req.params.id);
      if (!caller) return;
      const { data, error } = await supabaseAdmin.from("session_chat_messages").select("*, sender:profiles!sender_id(id,display_name,avatar_url)").eq("session_id", req.params.id).order("created_at", { ascending: true });
      if (error && !isSessionChatTableMissing(error)) throw error;
      res.json({ success: true, messages: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions/:id/chat", async (req, res) => {
    try {
      const accessUserId = await assertSessionAccess(req, res, req.params.id);
      if (!accessUserId) return;
      const caller = await getAuthUser(req);
      if (!caller) return;
      const { sender_id, message } = req.body;
      const text = typeof message === "string" ? message.trim() : "";
      if (!text) {
        return res.status(400).json({ error: "message is required" });
      }
      if (caller.userId !== sender_id) {
        return res.status(403).json({ error: "Forbidden: sender_id must match authenticated user" });
      }
      const { data, error } = await supabaseAdmin.from("session_chat_messages").insert({ session_id: req.params.id, sender_id, message: text, created_at: (/* @__PURE__ */ new Date()).toISOString(), sender_display_name: caller.displayName ?? null }).select("*, sender:profiles!sender_id(id,display_name,avatar_url)").single();
      if (error && !isSessionChatTableMissing(error)) throw error;
      const echoed = data || { id: `local-${Date.now()}`, session_id: req.params.id, sender_id, message: text, created_at: (/* @__PURE__ */ new Date()).toISOString(), sender: { id: sender_id, display_name: "You", avatar_url: null } };
      res.json({ success: true, message: echoed });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions/:id/reactions", async (req, res) => {
    try {
      const userId = await assertSessionAccess(req, res, req.params.id);
      if (!userId) return;
      const caller = await getAuthUser(req);
      if (!caller) return;
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: "emoji required" });
      const { data, error } = await supabaseAdmin.from("session_reactions").insert({ session_id: req.params.id, user_id: caller.userId, emoji, created_at: (/* @__PURE__ */ new Date()).toISOString() }).select().single();
      if (error && !isSessionReactionsTableMissing(error)) throw error;
      res.json({ success: true, reaction: data || { session_id: req.params.id, user_id: caller.userId, emoji } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions/:id/push-quiz", async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { quizId, quizTitle } = req.body;
      if (!quizId || !quizTitle) return res.status(400).json({ error: "quizId and quizTitle required" });
      const { error: patchErr } = await supabaseAdmin.from("live_sessions").update({ live_quiz_id: quizId, live_quiz_title: quizTitle }).eq("id", req.params.id);
      if (patchErr) {
        console.warn("[push-quiz] live_sessions update skipped (column missing?):", patchErr.message);
      }
      const { data: participants } = await supabaseAdmin.from("session_participants").select("user_id").eq("session_id", req.params.id).is("left_at", null);
      if (participants && participants.length > 0) {
        const notifs = participants.map((p) => ({
          user_id: p.user_id,
          title: "\u{1F4DD} Kuiz i ri",
          message: `M\xEBsuesi ka nisur kuizin: ${quizTitle}`,
          type: "quiz",
          action_url: `/student/quiz/${quizId}`,
          read: false,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        }));
        await supabaseAdmin.from("notifications").insert(notifs).catch(() => {
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/live-sessions/:id/upload-url", async (req, res) => {
    try {
      const hostId = await assertSessionHost(req, res, req.params.id);
      if (!hostId) return;
      const { id } = req.params;
      const filename = `session-${id}-${Date.now()}.webm`;
      const storagePath = `recordings/${filename}`;
      await supabaseAdmin.storage.createBucket("live-recordings", { public: true }).catch(() => {
      });
      const { data, error } = await supabaseAdmin.storage.from("live-recordings").createSignedUploadUrl(storagePath);
      if (error) {
        await supabaseAdmin.storage.createBucket("recordings", { public: true }).catch(() => {
        });
        const { data: d2, error: e2 } = await supabaseAdmin.storage.from("recordings").createSignedUploadUrl(storagePath);
        if (e2) throw e2;
        const { data: { publicUrl: publicUrl2 } } = supabaseAdmin.storage.from("recordings").getPublicUrl(storagePath);
        return res.json({ success: true, signedUrl: d2.signedUrl, publicUrl: publicUrl2, bucket: "recordings" });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from("live-recordings").getPublicUrl(storagePath);
      res.json({ success: true, signedUrl: data.signedUrl, publicUrl, bucket: "live-recordings" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/users/search", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { q, role } = req.query;
      let query = supabaseAdmin.from("profiles").select("id, display_name, email, role, avatar_url");
      if (role) query = query.eq("role", role);
      if (q) query = query.or(`display_name.ilike.%${q}%,email.ilike.%${q}%`);
      query = query.limit(20);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, users: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/classes/students", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const rawIds = typeof req.query.classIds === "string" ? req.query.classIds : "";
      const classIds = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
      if (classIds.length === 0) return res.json({ success: true, studentsByClass: {} });
      const teacherIdCandidates = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [caller.userId];
      const { data: classRows, error: classErr } = await supabaseAdmin.from("classes").select("id, student_ids, course_id, teacher_id").in("id", classIds);
      if (classErr) throw classErr;
      const courseIdSet = /* @__PURE__ */ new Set();
      (classRows || []).forEach((cl) => {
        if (cl.course_id) courseIdSet.add(String(cl.course_id));
      });
      const courseStudentMap = /* @__PURE__ */ new Map();
      if (courseIdSet.size > 0) {
        const { data: courseRows, error: courseErr } = await supabaseAdmin.from("courses").select("id, student_ids").in("id", [...courseIdSet]);
        if (!courseErr) {
          (courseRows || []).forEach((c) => {
            const ids = Array.isArray(c.student_ids) ? c.student_ids.map(String).filter(Boolean) : [];
            if (ids.length > 0) courseStudentMap.set(String(c.id), ids);
          });
        }
      }
      const { data: linkedProfiles } = await supabaseAdmin.from("profiles").select("id, teacher_id").in("teacher_id", scopedIds).eq("role", "student");
      const allTeacherStudentIds = (linkedProfiles || []).map((p) => String(p.id));
      const studentsByClass = {};
      for (const cl of classRows || []) {
        const classId = String(cl.id);
        const directIds = Array.isArray(cl.student_ids) ? cl.student_ids.map(String).filter(Boolean) : [];
        const courseIds = cl.course_id ? courseStudentMap.get(String(cl.course_id)) || [] : [];
        const combined = Array.from(/* @__PURE__ */ new Set([...directIds, ...courseIds]));
        studentsByClass[classId] = combined.length > 0 ? combined : allTeacherStudentIds;
      }
      return res.json({ success: true, studentsByClass });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/classes", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { teacher_id } = req.query;
      const baseTeacherId = caller.role === "admin" ? typeof teacher_id === "string" ? teacher_id : "" : caller.userId;
      const teacherIdCandidates = await getTeacherIdCandidates(baseTeacherId || caller.userId);
      let query = supabaseAdmin.from("classes").select("*").order("created_at", { ascending: false });
      if (teacherIdCandidates.length > 0) query = query.in("teacher_id", teacherIdCandidates);
      const { data, error } = await query;
      if (error) throw error;
      const deduped = (data || []).map((cls) => ({
        ...cls,
        student_ids: Array.isArray(cls.student_ids) ? [...new Set(cls.student_ids.map((s) => String(s)).filter(Boolean))] : []
      }));
      res.json({ success: true, classes: deduped });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/classes/save", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher or admin role required" });
      }
      const body = req.body || {};
      const mode = body.mode === "update" ? "update" : "insert";
      const classId = typeof body.id === "string" ? body.id.trim() : "";
      const payload = body.payload || {};
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      if (!name) return res.status(400).json({ error: "Class name is required" });
      const teacherIdCandidates = [];
      const pushCandidate = (v2) => {
        const s = String(v2 || "").trim();
        if (!s) return;
        if (!teacherIdCandidates.includes(s)) teacherIdCandidates.push(s);
      };
      const { data: teacherRows, error: teacherRowsErr } = await supabaseAdmin.from("teachers").select("id, user_id").eq("user_id", caller.userId).limit(20);
      if (teacherRowsErr) throw teacherRowsErr;
      (teacherRows || []).forEach((t) => {
        pushCandidate(t?.id);
        pushCandidate(t?.user_id);
      });
      if (!teacherIdCandidates.length) {
        const { data: profileRow, error: profileErr } = await supabaseAdmin.from("profiles").select("id, email").eq("id", caller.userId).maybeSingle();
        if (profileErr) throw profileErr;
        if (profileRow?.id && profileRow?.email) {
          const ins = await supabaseAdmin.from("teachers").insert({ user_id: profileRow.id, email: profileRow.email }).select("id, user_id").single();
          if (!ins.error && ins.data) {
            pushCandidate(ins.data.id);
            pushCandidate(ins.data.user_id);
          }
        }
      }
      const fallbackCandidates = await getTeacherIdCandidates(caller.userId);
      fallbackCandidates.forEach((id) => pushCandidate(id));
      if (!teacherIdCandidates.length) {
        return res.status(400).json({ error: "No valid teacher id candidates were found." });
      }
      const baseRow = {
        name,
        description: typeof payload.description === "string" ? payload.description.trim() || null : payload.description ?? null,
        course_id: payload.course_id ?? null,
        status: payload.status ?? "upcoming",
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        capacity: Number.isFinite(Number(payload.capacity)) ? Number(payload.capacity) : 30
      };
      if (mode === "insert") {
        baseRow.student_ids = Array.isArray(payload.student_ids) ? payload.student_ids : [];
      }
      let lastError = null;
      for (const teacherIdCandidate of teacherIdCandidates) {
        const row = { ...baseRow, teacher_id: teacherIdCandidate };
        const result = mode === "update" ? await supabaseAdmin.from("classes").update(row).eq("id", classId).select("id").maybeSingle() : await supabaseAdmin.from("classes").insert(row).select("id").single();
        if (!result.error) {
          return res.json({ success: true, class: result.data || null });
        }
        const msg = `${result.error.message || ""} ${result.error.details || ""}`;
        const isTeacherFk = result.error.code === "23503" && /classes_teacher_id_fkey|table "teachers"|table "profiles"/i.test(msg);
        if (!isTeacherFk) {
          return res.status(400).json({ error: [result.error.message, result.error.details, result.error.hint].filter(Boolean).join(" \u2014 ") || "Failed to save class" });
        }
        lastError = result.error;
      }
      return res.status(400).json({
        error: [lastError?.message, lastError?.details, lastError?.hint].filter(Boolean).join(" \u2014 ") || "Could not resolve a valid teacher_id for classes table foreign key."
      });
    } catch (e) {
      console.error("POST /api/teacher/classes/save", e);
      return res.status(500).json({ error: e?.message || "Failed to save class" });
    }
  });
  app.post("/api/teacher/classes/:classId/enroll-csv", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: teacher role required" });
      }
      const classId = String(req.params.classId || "").trim();
      if (!classId) return res.status(400).json({ error: "classId is required" });
      let rawEmails = [];
      if (Array.isArray(req.body?.emails)) {
        rawEmails = req.body.emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
      } else if (typeof req.body?.emails === "string") {
        rawEmails = req.body.emails.split(/[\n,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
      }
      if (rawEmails.length === 0) return res.status(400).json({ error: "No emails provided" });
      const classSnap = await supabaseAdmin.from("classes").select("id, teacher_id, student_ids, course_id").eq("id", classId).maybeSingle();
      if (classSnap.error) throw classSnap.error;
      const cls = classSnap.data;
      if (!cls) return res.status(404).json({ error: "Class not found" });
      const teacherIdCandidates = await getTeacherIdCandidates(caller.userId);
      const scopedIds = teacherIdCandidates.length > 0 ? teacherIdCandidates : [caller.userId];
      if (cls.teacher_id && !scopedIds.includes(String(cls.teacher_id))) {
        return res.status(403).json({ error: "Access denied to this class" });
      }
      const profilesRes = await supabaseAdmin.from("profiles").select("id, email, role").in("email", rawEmails);
      if (profilesRes.error) throw profilesRes.error;
      const profiles = profilesRes.data || [];
      const foundEmails = new Set(profiles.map((p) => p.email.toLowerCase()));
      const notFound = rawEmails.filter((e) => !foundEmails.has(e));
      const studentProfiles = profiles.filter((p) => p.role === "student" || p.role === "admin");
      const existingIds = Array.isArray(cls.student_ids) ? cls.student_ids.map((s) => String(s)) : [];
      const newIds = studentProfiles.map((p) => p.id).filter((id) => !existingIds.includes(id));
      const mergedIds = [.../* @__PURE__ */ new Set([...existingIds, ...newIds])];
      const classUpdate = await supabaseAdmin.from("classes").update({ student_ids: mergedIds }).eq("id", classId);
      if (classUpdate.error) throw classUpdate.error;
      if (cls.course_id && newIds.length > 0) {
        const courseSnap = await supabaseAdmin.from("courses").select("id, student_ids, total_students").eq("id", String(cls.course_id)).maybeSingle();
        if (!courseSnap.error && courseSnap.data) {
          const course = courseSnap.data;
          const courseStudentIds = Array.isArray(course.student_ids) ? course.student_ids.map((s) => String(s)) : [];
          const nextCourseIds = [.../* @__PURE__ */ new Set([...courseStudentIds, ...newIds])];
          await supabaseAdmin.from("courses").update({ student_ids: nextCourseIds, total_students: nextCourseIds.length }).eq("id", String(cls.course_id));
        }
      }
      return res.json({
        success: true,
        enrolled: newIds.length,
        alreadyEnrolled: existingIds.filter((id) => studentProfiles.map((p) => p.id).includes(id)).length,
        notFound,
        notStudents: profiles.filter((p) => p.role !== "student" && p.role !== "admin").map((p) => p.email)
      });
    } catch (e) {
      console.error("POST /api/teacher/classes/:classId/enroll-csv", e);
      return res.status(500).json({ error: e?.message || "Failed to enroll students" });
    }
  });
  app.get("/api/student/courses/available", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student role required" });
      }
      const { data: profile, error: profileErr } = await supabaseAdmin.from("profiles").select("teacher_id").eq("id", caller.userId).single();
      if (profileErr) throw profileErr;
      const linkedTeacherId = profile?.teacher_id ? String(profile.teacher_id) : "";
      const fetchAllPublished = async () => {
        let res2 = await supabaseAdmin.from("courses").select("id, title, description, level, language, status, teacher_id, student_ids, total_students, total_lessons, short_description, category, created_at").eq("status", "published").order("created_at", { ascending: false });
        if (res2.error && isMissingCoursesStudentIdsError(res2.error)) {
          res2 = await supabaseAdmin.from("courses").select("id, title, description, level, language, status, teacher_id, total_students, total_lessons, short_description, category, created_at").eq("status", "published").order("created_at", { ascending: false });
        }
        return res2;
      };
      if (!linkedTeacherId) {
        const fallbackRes = await fetchAllPublished();
        const courses2 = (fallbackRes.data || []).map((c) => ({
          ...c,
          student_ids: Array.isArray(c.student_ids) ? c.student_ids : []
        }));
        return res.json({ success: true, courses: courses2 });
      }
      const teacherIds = await getTeacherIdCandidates(linkedTeacherId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [linkedTeacherId];
      let coursesRes = await supabaseAdmin.from("courses").select("id, title, description, level, language, status, teacher_id, student_ids, total_students, total_lessons, short_description, category, created_at").in("teacher_id", scopedIds).eq("status", "published").order("created_at", { ascending: false });
      if (coursesRes.error) {
        if (isMissingCoursesStudentIdsError(coursesRes.error)) {
          coursesRes = await supabaseAdmin.from("courses").select("id, title, description, level, language, status, teacher_id, total_students, total_lessons, short_description, category, created_at").in("teacher_id", scopedIds).eq("status", "published").order("created_at", { ascending: false });
        }
        if (coursesRes.error) {
          const fallbackRes = await fetchAllPublished();
          if (!fallbackRes.error) {
            const courses2 = (fallbackRes.data || []).map((c) => ({
              ...c,
              student_ids: Array.isArray(c.student_ids) ? c.student_ids : []
            }));
            return res.json({ success: true, courses: courses2 });
          }
          throw coursesRes.error;
        }
      }
      const courses = (coursesRes.data || []).map((c) => ({
        ...c,
        student_ids: Array.isArray(c.student_ids) ? c.student_ids : []
      }));
      return res.json({ success: true, courses });
    } catch (e) {
      console.error("GET /api/student/courses/available", e);
      return res.status(500).json({ error: e?.message || "Failed to load available courses" });
    }
  });
  app.post("/api/student/courses/:courseId/enroll", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const courseId = String(req.params.courseId || "").trim();
      if (!courseId) return res.status(400).json({ error: "courseId is required" });
      const { data: profile, error: profileErr } = await supabaseAdmin.from("profiles").select("teacher_id").eq("id", caller.userId).single();
      if (profileErr) throw profileErr;
      const linkedTeacherId = profile?.teacher_id ? String(profile.teacher_id) : "";
      if (!linkedTeacherId) {
        return res.status(403).json({ error: "Student has no assigned teacher" });
      }
      const teacherIds = await getTeacherIdCandidates(linkedTeacherId);
      const scopedIds = teacherIds.length > 0 ? teacherIds : [linkedTeacherId];
      const { data: course, error: courseErr } = await supabaseAdmin.from("courses").select("id, title, teacher_id, status, student_ids, total_students").eq("id", courseId).single();
      if (courseErr) throw courseErr;
      if (!course) return res.status(404).json({ error: "Course not found" });
      const courseTeacherId = String(course.teacher_id || "");
      if (!scopedIds.includes(courseTeacherId)) {
        return res.status(403).json({ error: "Forbidden: this course is not from your assigned teacher" });
      }
      if (String(course.status || "").toLowerCase() !== "published") {
        return res.status(403).json({ error: "Only published courses can be enrolled" });
      }
      const studentIds = Array.isArray(course.student_ids) ? course.student_ids.map((sid) => String(sid)) : [];
      const alreadyEnrolled = studentIds.includes(caller.userId);
      if (!alreadyEnrolled) {
        const nextStudentIds = [...studentIds, caller.userId];
        const nextTotalStudents = Math.max(nextStudentIds.length, Number(course.total_students || 0) + 1);
        const { error: updErr } = await supabaseAdmin.from("courses").update({
          student_ids: nextStudentIds,
          total_students: nextTotalStudents,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", courseId);
        if (updErr) throw updErr;
      }
      const classIds = [];
      let classAssignment = "skipped";
      const loadCourseClasses = async () => {
        let classRes = await supabaseAdmin.from("classes").select("id,status,student_ids,capacity,start_date,created_at").eq("course_id", courseId);
        if (classRes.error && isRecoverableSchemaColumnError(classRes.error)) {
          classRes = await supabaseAdmin.from("classes").select("id,status,student_ids,capacity,created_at").eq("course_id", courseId);
        }
        if (classRes.error && isRecoverableSchemaColumnError(classRes.error)) {
          classRes = await supabaseAdmin.from("classes").select("id,student_ids,created_at").eq("course_id", courseId);
        }
        if (classRes.error) throw classRes.error;
        return classRes.data || [];
      };
      try {
        const classRows = await loadCourseClasses();
        if (classRows.length > 0) {
          const statusWeight = (status) => {
            const normalized = String(status || "").toLowerCase();
            if (normalized === "active") return 0;
            if (normalized === "upcoming") return 1;
            if (normalized === "completed") return 2;
            if (normalized === "archived") return 3;
            return 4;
          };
          const classCandidates = (classRows || []).map((row) => {
            const ids = Array.isArray(row?.student_ids) ? row.student_ids.map((sid) => String(sid)) : [];
            const capacity = Number(row?.capacity);
            const hasCapacity = !Number.isFinite(capacity) || capacity <= 0 || ids.length < capacity;
            return {
              id: String(row?.id || ""),
              status: String(row?.status || ""),
              startDate: row?.start_date ? String(row.start_date) : "",
              createdAt: row?.created_at ? String(row.created_at) : "",
              studentIds: ids,
              hasCapacity
            };
          }).filter((row) => row.id);
          const existingClasses = classCandidates.filter((row) => row.studentIds.includes(caller.userId));
          if (existingClasses.length > 0) {
            existingClasses.forEach((row) => classIds.push(row.id));
            classAssignment = "already_assigned";
          } else {
            classCandidates.sort((a, b) => {
              const statusDelta = statusWeight(a.status) - statusWeight(b.status);
              if (statusDelta !== 0) return statusDelta;
              const startA = a.startDate ? Date.parse(a.startDate) : Number.POSITIVE_INFINITY;
              const startB = b.startDate ? Date.parse(b.startDate) : Number.POSITIVE_INFINITY;
              if (startA !== startB) return startA - startB;
              const createdA = a.createdAt ? Date.parse(a.createdAt) : 0;
              const createdB = b.createdAt ? Date.parse(b.createdAt) : 0;
              return createdA - createdB;
            });
            const targetClass = classCandidates.find((row) => row.hasCapacity);
            if (targetClass) {
              const nextClassStudentIds = Array.from(/* @__PURE__ */ new Set([...targetClass.studentIds, caller.userId]));
              const { error: classUpdateErr } = await supabaseAdmin.from("classes").update({ student_ids: nextClassStudentIds }).eq("id", targetClass.id);
              if (classUpdateErr) throw classUpdateErr;
              classIds.push(targetClass.id);
              classAssignment = "assigned";
            } else {
              classAssignment = "no_class_available";
            }
          }
        }
      } catch (classError) {
        if (!isClassesTableMissing(classError)) throw classError;
      }
      if (!alreadyEnrolled) {
        await dispatchNotifyEvent("newEnrollment", {
          studentId: caller.userId,
          teacherId: courseTeacherId,
          courseId,
          courseTitle: String(course.title || "")
        });
      }
      return res.json({
        success: true,
        enrolled: !alreadyEnrolled,
        alreadyEnrolled,
        classAssignment,
        classIds
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to enroll in course" });
    }
  });
  app.post("/api/notifications/event", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const eventKey = String(req.body?.event || "").trim();
      const ctxIn = req.body?.ctx ?? {};
      const ALLOWED = ["quizSubmitted", "certificateIssued"];
      if (!ALLOWED.includes(eventKey)) {
        return res.status(400).json({ error: "Unsupported event" });
      }
      const studentId = String(ctxIn.studentId || "").trim();
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      if (eventKey === "quizSubmitted") {
        if (caller.role !== "student" || caller.userId !== studentId) {
          return res.status(403).json({ error: "Forbidden" });
        }
      } else if (eventKey === "certificateIssued") {
        if (caller.role !== "teacher" && caller.role !== "admin") {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const ctx = {
        studentId,
        teacherId: ctxIn.teacherId ? String(ctxIn.teacherId) : void 0,
        courseId: ctxIn.courseId ? String(ctxIn.courseId) : void 0,
        courseTitle: ctxIn.courseTitle ? String(ctxIn.courseTitle) : void 0,
        quizId: ctxIn.quizId ? String(ctxIn.quizId) : void 0,
        quizTitle: ctxIn.quizTitle ? String(ctxIn.quizTitle) : void 0,
        attemptId: ctxIn.attemptId ? String(ctxIn.attemptId) : void 0,
        score: typeof ctxIn.score === "number" ? ctxIn.score : void 0,
        totalPoints: typeof ctxIn.totalPoints === "number" ? ctxIn.totalPoints : void 0,
        passed: typeof ctxIn.passed === "boolean" ? ctxIn.passed : void 0,
        certificateId: ctxIn.certificateId ? String(ctxIn.certificateId) : void 0,
        certificateNumber: ctxIn.certificateNumber ? String(ctxIn.certificateNumber) : void 0
      };
      if (eventKey === "certificateIssued" && caller.role === "teacher") {
        ctx.teacherId = caller.userId;
      }
      if (eventKey === "quizSubmitted" && (!ctx.teacherId || !ctx.courseId)) {
        try {
          const { data: quizRow } = await supabaseAdmin.from("quizzes").select("teacher_id, course_id, title").eq("id", ctx.quizId || "").maybeSingle();
          if (quizRow) {
            ctx.teacherId = ctx.teacherId || (quizRow.teacher_id ? String(quizRow.teacher_id) : void 0);
            ctx.courseId = ctx.courseId || (quizRow.course_id ? String(quizRow.course_id) : void 0);
            ctx.quizTitle = ctx.quizTitle || (quizRow.title ? String(quizRow.title) : void 0);
          }
        } catch {
        }
      }
      if (eventKey === "certificateIssued" && ctx.courseId && (!ctx.courseTitle || !ctx.teacherId)) {
        try {
          const { data: courseRow } = await supabaseAdmin.from("courses").select("title, teacher_id").eq("id", ctx.courseId).maybeSingle();
          if (courseRow?.title && !ctx.courseTitle) ctx.courseTitle = String(courseRow.title);
          if (courseRow?.teacher_id && !ctx.teacherId) ctx.teacherId = String(courseRow.teacher_id);
        } catch {
        }
      }
      await dispatchNotifyEvent(eventKey, ctx);
      return res.json({ success: true });
    } catch (e) {
      console.error("POST /api/notifications/event", e);
      return res.status(500).json({ error: e?.message || "Failed to dispatch notification event" });
    }
  });
  app.get("/api/student/courses/content-counts", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const raw = typeof req.query.courseIds === "string" ? req.query.courseIds : "";
      const courseIds = raw.split(",").map((x) => x.trim()).filter(Boolean);
      if (courseIds.length === 0) return res.json({ success: true, counts: {} });
      let quizRowsByCourse = [];
      const [{ data: modules }, { data: lessonsDirect }] = await Promise.all([
        supabaseAdmin.from("modules").select("id,course_id").in("course_id", courseIds),
        supabaseAdmin.from("lessons").select("id,course_id,module_id").in("course_id", courseIds)
      ]);
      let quizRes = await supabaseAdmin.from("quizzes").select("id, course_id, lesson_id").in("course_id", courseIds).or("status.eq.published,status.eq.active");
      if (quizRes.error && isRecoverableSchemaColumnError(quizRes.error)) {
        quizRes = await supabaseAdmin.from("quizzes").select("id, course_id, lesson_id").in("course_id", courseIds);
      }
      if (quizRes.error) throw quizRes.error;
      quizRowsByCourse = quizRes.data || [];
      const moduleToCourse = {};
      (modules || []).forEach((m) => {
        const mid = String(m?.id || "");
        const cid = String(m?.course_id || "");
        if (mid && cid) moduleToCourse[mid] = cid;
      });
      const lessonCountByCourse = {};
      const lessonToCourse = {};
      (lessonsDirect || []).forEach((l) => {
        const lid = String(l?.id || "");
        const directCourseId = String(l?.course_id || "");
        const mappedCourseId = directCourseId || moduleToCourse[String(l?.module_id || "")] || "";
        if (!lid || !mappedCourseId) return;
        lessonToCourse[lid] = mappedCourseId;
        lessonCountByCourse[mappedCourseId] = (lessonCountByCourse[mappedCourseId] || 0) + 1;
      });
      const lessonIds = Object.keys(lessonToCourse);
      const quizRowsByLesson = lessonIds.length > 0 ? await supabaseAdmin.from("quizzes").select("id,lesson_id").in("lesson_id", lessonIds) : { data: [] };
      const quizSetByCourse = {};
      (quizRowsByCourse || []).forEach((q) => {
        const cid = String(q?.course_id || "");
        const qid = String(q?.id || "");
        if (!cid || !qid) return;
        if (!quizSetByCourse[cid]) quizSetByCourse[cid] = /* @__PURE__ */ new Set();
        quizSetByCourse[cid].add(qid);
      });
      (quizRowsByLesson.data || []).forEach((q) => {
        const lid = String(q?.lesson_id || "");
        const qid = String(q?.id || "");
        const cid = lessonToCourse[lid];
        if (!cid || !qid) return;
        if (!quizSetByCourse[cid]) quizSetByCourse[cid] = /* @__PURE__ */ new Set();
        quizSetByCourse[cid].add(qid);
      });
      const counts = {};
      courseIds.forEach((cid) => {
        counts[cid] = {
          lessons: lessonCountByCourse[cid] || 0,
          quizzes: quizSetByCourse[cid] ? quizSetByCourse[cid].size : 0
        };
      });
      return res.json({ success: true, counts });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load course content counts" });
    }
  });
  app.post("/api/student/quiz/auto-certificate", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { attemptId } = req.body;
      if (!attemptId) return res.status(400).json({ error: "attemptId is required" });
      const { data: attempt, error: attErr } = await supabaseAdmin.from("quiz_attempts").select("id, quiz_id, student_id, score, total_points, passed, score_percent").eq("id", attemptId).maybeSingle().catch(() => ({ data: null, error: null }));
      if (attErr) return res.status(500).json({ error: "Could not fetch attempt" });
      if (!attempt) return res.status(404).json({ error: "Attempt not found" });
      if (attempt.student_id !== caller.userId) return res.status(403).json({ error: "Forbidden" });
      if (!attempt.passed) return res.status(400).json({ error: "Student did not pass this quiz" });
      const { data: quiz } = await supabaseAdmin.from("quizzes").select("id, title, course_id, teacher_id, type").eq("id", attempt.quiz_id).maybeSingle().catch(() => ({ data: null }));
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const courseId = quiz.course_id ? String(quiz.course_id) : null;
      const isExam = String(quiz.type || "").toLowerCase() === "exam";
      const dupCheck = isExam ? await supabaseAdmin.from("certificates").select("id, grade, score, certificate_number").eq("student_id", caller.userId).contains("meta", { quiz_id: quiz.id }).limit(1).maybeSingle().catch(() => ({ data: null })) : courseId ? await supabaseAdmin.from("certificates").select("id, grade, score, certificate_number").eq("student_id", caller.userId).eq("course_id", courseId).not("meta", "cs", '{"quiz_type":"exam"}').limit(1).maybeSingle().catch(() => ({ data: null })) : await supabaseAdmin.from("certificates").select("id, grade, score, certificate_number").eq("student_id", caller.userId).contains("meta", { quiz_id: quiz.id }).limit(1).maybeSingle().catch(() => ({ data: null }));
      if (dupCheck?.data?.id) {
        const dup = dupCheck.data;
        return res.json({ ok: true, duplicate: true, certificateId: dup.id, grade: dup.grade, score: dup.score, certificateNumber: dup.certificate_number });
      }
      const pct = attempt.score_percent != null ? Number(attempt.score_percent) : attempt.total_points > 0 ? Math.round(attempt.score / attempt.total_points * 100) : 0;
      const grade = pct >= 97 ? "A+" : pct >= 93 ? "A" : pct >= 90 ? "A-" : pct >= 87 ? "B+" : pct >= 83 ? "B" : pct >= 80 ? "B-" : pct >= 77 ? "C+" : pct >= 73 ? "C" : pct >= 70 ? "C-" : "D";
      const level = grade === "A+" || grade === "A" ? "Outstanding" : grade === "A-" || grade === "B+" ? "Excellent" : grade === "B" || grade === "B-" ? "Very Good" : grade === "C+" || grade === "C" ? "Good" : grade === "C-" ? "Satisfactory" : "Pass";
      const certYear = (/* @__PURE__ */ new Date()).getFullYear();
      const certRand = Math.random().toString(36).toUpperCase().slice(2, 8);
      const certNumber = `CERT-${certYear}-${certRand}`;
      let certTitle = quiz.title;
      if (!isExam && courseId) {
        const { data: course } = await supabaseAdmin.from("courses").select("title").eq("id", courseId).maybeSingle().catch(() => ({ data: null }));
        if (course?.title) certTitle = String(course.title);
      }
      const { data: cert, error: certErr } = await supabaseAdmin.from("certificates").insert({
        student_id: caller.userId,
        course_id: courseId,
        title: certTitle,
        issued_at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        certificate_number: certNumber,
        grade,
        score: pct,
        status: "issued",
        meta: {
          quiz_id: quiz.id,
          quiz_title: quiz.title,
          quiz_type: quiz.type || "standard",
          level,
          score: attempt.score,
          total_points: attempt.total_points
        }
      }).select("id").maybeSingle();
      if (certErr || !cert?.id) {
        console.error("[auto-certificate] insert error:", certErr?.message);
        return res.status(500).json({ error: certErr?.message || "Failed to create certificate" });
      }
      try {
        const teacherId = quiz.teacher_id ? String(quiz.teacher_id) : void 0;
        await notifyEvent(
          supabaseAdmin,
          { isEventEnabled: isNotificationEnabled },
          "certificateIssued",
          {
            studentId: caller.userId,
            teacherId,
            courseId: courseId ?? void 0,
            courseTitle: certTitle,
            certificateId: cert.id,
            certificateNumber: certNumber
          }
        );
      } catch {
      }
      return res.json({ ok: true, duplicate: false, certificateId: cert.id, certificateNumber: certNumber, grade, level, score: pct, totalPoints: attempt.total_points, earnedPoints: attempt.score });
    } catch (e) {
      console.error("[auto-certificate]", e?.message);
      return res.status(500).json({ error: "Server error" });
    }
  });
  app.get("/api/student/certificate/by-quiz", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const quizId = typeof req.query.quizId === "string" ? req.query.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "quizId is required" });
      const { data: cert } = await supabaseAdmin.from("certificates").select("id, grade, score, certificate_number, title, issued_at, meta, status").eq("student_id", caller.userId).contains("meta", { quiz_id: quizId }).eq("status", "issued").limit(1).maybeSingle().catch(() => ({ data: null }));
      if (!cert) return res.json({ cert: null });
      const meta = cert.meta || {};
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
          earnedPoints: meta.score ?? null
        }
      });
    } catch (e) {
      console.error("[cert-by-quiz]", e?.message);
      return res.status(500).json({ error: "Server error" });
    }
  });
  app.get("/api/student/headway-test/topics", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const level = typeof req.query.level === "string" ? req.query.level.trim() : "Pre-Intermediate";
      const topics = getTopicsForLevel(level).map((s) => ({ topic: s.topic, type: s.type, count: s.questions.length }));
      return res.json({ level, topics });
    } catch (e) {
      console.error("[headway-test/topics]", e?.message);
      return res.status(500).json({ error: "Server error" });
    }
  });
  app.post("/api/student/headway-test/submit", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const body = req.body;
      const { level, selectedTopics, answers, score, total } = body;
      if (!level || !Array.isArray(answers)) {
        return res.status(400).json({ error: "level and answers are required" });
      }
      const percentage = total > 0 ? Math.round(score / total * 100) : 0;
      await supabaseAdmin.rpc("exec_sql", {
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
      }).catch(() => null);
      const { data: row, error: insErr } = await supabaseAdmin.from("headway_test_results").insert({
        user_id: caller.userId,
        level,
        selected_topics: selectedTopics ?? [],
        answers,
        score,
        total,
        percentage,
        time_taken_seconds: body.timeTakenSeconds ?? null
      }).select("id, created_at").maybeSingle();
      if (insErr) {
        console.warn("[headway-test/submit] DB insert warning:", insErr.message);
        return res.json({ ok: true, stored: false, percentage, message: "Score calculated but not saved to DB \u2014 table may need migration." });
      }
      return res.json({ ok: true, stored: true, id: row?.id, percentage });
    } catch (e) {
      console.error("[headway-test/submit]", e?.message);
      return res.status(500).json({ error: "Server error" });
    }
  });
  app.get("/api/student/quizzes", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const requestedCourseId = typeof req.query.courseId === "string" ? req.query.courseId.trim() : "";
      let enrolledCourses = [];
      {
        const { data: ecData, error: ecErr } = await supabaseAdmin.from("courses").select("id,title,level").contains("student_ids", [caller.userId]);
        if (ecErr) {
          if (!isMissingCoursesStudentIdsError(ecErr)) throw ecErr;
          enrolledCourses = [];
        } else {
          enrolledCourses = ecData || [];
        }
      }
      const { data: enrolledClasses, error: classErr } = await supabaseAdmin.from("classes").select("id,course_id,student_ids").contains("student_ids", [caller.userId]);
      if (classErr && !isClassesTableMissing(classErr)) throw classErr;
      const classCourseIds = (enrolledClasses || []).map((row) => String(row?.course_id || "").trim()).filter(Boolean);
      const enrolledCourseIds = Array.from(/* @__PURE__ */ new Set([
        ...(enrolledCourses || []).map((c) => String(c.id)).filter(Boolean),
        ...classCourseIds
      ]));
      if (enrolledCourseIds.length === 0) return res.json({ success: true, quizzes: [] });
      const courseIds = requestedCourseId ? enrolledCourseIds.includes(requestedCourseId) ? [requestedCourseId] : [] : enrolledCourseIds;
      if (courseIds.length === 0) return res.json({ success: true, quizzes: [] });
      const courseTitleById = {};
      const courseLevelById = {};
      (enrolledCourses || []).forEach((course) => {
        courseTitleById[String(course.id)] = String(course.title || "Course");
        courseLevelById[String(course.id)] = String(course.level || "");
      });
      if (classCourseIds.length > 0) {
        const missingTitleIds = classCourseIds.filter((cid) => !courseTitleById[cid]);
        if (missingTitleIds.length > 0) {
          const { data: classLinkedCourses } = await supabaseAdmin.from("courses").select("id,title,level").in("id", missingTitleIds);
          (classLinkedCourses || []).forEach((course) => {
            courseTitleById[String(course.id)] = String(course.title || "Course");
            courseLevelById[String(course.id)] = String(course.level || "");
          });
        }
      }
      const { data: modules, error: modulesErr } = await supabaseAdmin.from("modules").select("id,course_id").in("course_id", courseIds);
      if (modulesErr) throw modulesErr;
      const moduleToCourse = {};
      (modules || []).forEach((m) => {
        const mid = String(m?.id || "");
        const cid = String(m?.course_id || "");
        if (mid && cid) moduleToCourse[mid] = cid;
      });
      const moduleIds = Object.keys(moduleToCourse);
      let lessonsByCourseRes = await supabaseAdmin.from("lessons").select("id,course_id,module_id").in("course_id", courseIds);
      if (lessonsByCourseRes.error && isRecoverableSchemaColumnError(lessonsByCourseRes.error)) {
        lessonsByCourseRes = { data: [], error: null };
      }
      if (lessonsByCourseRes.error) throw lessonsByCourseRes.error;
      const lessonsByModule = moduleIds.length > 0 ? await supabaseAdmin.from("lessons").select("id,module_id").in("module_id", moduleIds) : { data: [], error: null };
      if (lessonsByModule.error && !isRecoverableSchemaColumnError(lessonsByModule.error)) throw lessonsByModule.error;
      const lessonToCourse = {};
      (lessonsByCourseRes.data || []).forEach((l) => {
        const lid = String(l?.id || "");
        const cid = String(l?.course_id || "") || moduleToCourse[String(l?.module_id || "")] || "";
        if (lid && cid) lessonToCourse[lid] = cid;
      });
      (lessonsByModule.data || []).forEach((l) => {
        const lid = String(l?.id || "");
        const cid = moduleToCourse[String(l?.module_id || "")] || "";
        if (lid && cid && !lessonToCourse[lid]) lessonToCourse[lid] = cid;
      });
      const lessonIds = Object.keys(lessonToCourse);
      let quizByCourseRes = await supabaseAdmin.from("quizzes").select("*").in("course_id", courseIds);
      if (quizByCourseRes.error && isRecoverableSchemaColumnError(quizByCourseRes.error)) {
        quizByCourseRes = { data: [], error: null };
      }
      if (quizByCourseRes.error) throw quizByCourseRes.error;
      let quizByLessonRes = lessonIds.length > 0 ? await supabaseAdmin.from("quizzes").select("*").in("lesson_id", lessonIds) : { data: [], error: null };
      if (quizByLessonRes.error && isRecoverableSchemaColumnError(quizByLessonRes.error)) {
        quizByLessonRes = { data: [], error: null };
      }
      if (quizByLessonRes.error) throw quizByLessonRes.error;
      const combined = [...quizByCourseRes.data || [], ...quizByLessonRes.data || []];
      const deduped = {};
      combined.forEach((row) => {
        const qid = String(row?.id || "");
        if (!qid) return;
        if (!deduped[qid]) deduped[qid] = row;
      });
      const quizzes = Object.values(deduped).filter((row) => {
        const status = String(row?.status || "").trim().toLowerCase();
        if (status) return status === "published" || status === "active";
        if (typeof row?.published === "boolean") return row.published;
        const publishedText = String(row?.published || "").trim().toLowerCase();
        if (publishedText) return publishedText === "true" || publishedText === "1" || publishedText === "yes";
        return true;
      }).map((row) => {
        const resolvedCourseId = String(row?.course_id || "") || lessonToCourse[String(row?.lesson_id || "")] || "";
        return {
          ...row,
          course_id: resolvedCourseId,
          course_title: courseTitleById[resolvedCourseId] || "Course",
          course_level: courseLevelById[resolvedCourseId] || ""
        };
      });
      return res.json({ success: true, quizzes });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load student quizzes" });
    }
  });
  app.get("/api/student/quizzes/:quizId/questions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const quizId = typeof req.params.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "Quiz id is required" });
      const { data: quizRow, error: quizErr } = await supabaseAdmin.from("quizzes").select("id,course_id,lesson_id,settings").eq("id", quizId).maybeSingle();
      if (quizErr) throw quizErr;
      if (!quizRow?.id) return res.status(404).json({ error: "Quiz not found" });
      const quizSettings = quizRow?.settings;
      const doShuffleQuestions = quizSettings?.shuffleQuestions === true;
      const doShuffleAnswers = quizSettings?.shuffleAnswers === true;
      let resolvedCourseId = String(quizRow?.course_id || "").trim();
      if (!resolvedCourseId) {
        const lessonId = String(quizRow?.lesson_id || "").trim();
        if (lessonId) {
          const { data: lessonRow, error: lessonErr } = await supabaseAdmin.from("lessons").select("course_id,module_id").eq("id", lessonId).maybeSingle();
          if (lessonErr && !isRecoverableSchemaColumnError(lessonErr)) throw lessonErr;
          resolvedCourseId = String(lessonRow?.course_id || "").trim();
          if (!resolvedCourseId) {
            const moduleId = String(lessonRow?.module_id || "").trim();
            if (moduleId) {
              const { data: moduleRow } = await supabaseAdmin.from("modules").select("course_id").eq("id", moduleId).maybeSingle();
              resolvedCourseId = String(moduleRow?.course_id || "").trim();
            }
          }
        }
      }
      if (!resolvedCourseId) {
        return res.status(403).json({ error: "Quiz is not linked to an enrolled course" });
      }
      let hasDirectAccess = false;
      const { data: directCourseRows, error: directErr } = await supabaseAdmin.from("courses").select("id").eq("id", resolvedCourseId).contains("student_ids", [caller.userId]);
      if (directErr) {
        if (!isMissingCoursesStudentIdsError(directErr)) throw directErr;
        hasDirectAccess = false;
      } else {
        hasDirectAccess = (directCourseRows || []).length > 0;
      }
      const { data: classRows, error: classErr } = await supabaseAdmin.from("classes").select("id,course_id,student_ids").eq("course_id", resolvedCourseId).contains("student_ids", [caller.userId]);
      if (classErr && !isClassesTableMissing(classErr)) throw classErr;
      const isMissingDirectCheck = !!(directErr && isMissingCoursesStudentIdsError(directErr));
      const hasAccess = hasDirectAccess || (classRows || []).length > 0 || caller.role === "admin" || isMissingDirectCheck;
      if (!hasAccess) return res.status(403).json({ error: "You do not have access to this quiz" });
      let qRes = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId).order("order", { ascending: true }).order("created_at", { ascending: true });
      if (qRes.error) {
        qRes = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId).order("created_at", { ascending: true });
      }
      if (qRes.error) {
        qRes = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId);
      }
      if (qRes.error) throw qRes.error;
      let questions = qRes.data || [];
      if (doShuffleQuestions || doShuffleAnswers) {
        const seed = `${caller.userId}:${quizId}`;
        if (doShuffleQuestions) {
          questions = seededShuffle(questions, seed);
        }
        if (doShuffleAnswers) {
          questions = questions.map((q) => ({
            ...q,
            options: Array.isArray(q.options) && q.options.length > 1 ? seededShuffle(q.options, `${seed}:${String(q.id)}`) : q.options
          }));
        }
      }
      return res.json({
        success: true,
        questions,
        shuffled: { questions: doShuffleQuestions, answers: doShuffleAnswers }
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load quiz questions" });
    }
  });
  app.get("/api/student/quizzes-debug", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const requestedCourseId = typeof req.query.courseId === "string" ? req.query.courseId.trim() : "";
      const { data: enrolledCourses, error: ecErr } = await supabaseAdmin.from("courses").select("id,title,student_ids").contains("student_ids", [caller.userId]);
      if (ecErr) throw ecErr;
      const { data: enrolledClasses, error: classErr } = await supabaseAdmin.from("classes").select("id,name,course_id,student_ids").contains("student_ids", [caller.userId]);
      if (classErr && !isClassesTableMissing(classErr)) throw classErr;
      const classCourseIds = (enrolledClasses || []).map((row) => String(row?.course_id || "").trim()).filter(Boolean);
      const enrolledCourseIds = Array.from(/* @__PURE__ */ new Set([
        ...(enrolledCourses || []).map((c) => String(c.id)).filter(Boolean),
        ...classCourseIds
      ]));
      const scopedCourseIds = requestedCourseId ? enrolledCourseIds.includes(requestedCourseId) ? [requestedCourseId] : [] : enrolledCourseIds;
      const { data: directQuizzes } = scopedCourseIds.length > 0 ? await supabaseAdmin.from("quizzes").select("id,title,course_id,lesson_id,status").in("course_id", scopedCourseIds) : { data: [] };
      const { data: modules } = scopedCourseIds.length > 0 ? await supabaseAdmin.from("modules").select("id,course_id").in("course_id", scopedCourseIds) : { data: [] };
      const moduleToCourse = {};
      (modules || []).forEach((m) => {
        const mid = String(m?.id || "");
        const cid = String(m?.course_id || "");
        if (mid && cid) moduleToCourse[mid] = cid;
      });
      const moduleIds = Object.keys(moduleToCourse);
      const lessonsByModule = moduleIds.length > 0 ? await supabaseAdmin.from("lessons").select("id,module_id").in("module_id", moduleIds) : { data: [], error: null };
      const lessonToCourse = {};
      (lessonsByModule.data || []).forEach((l) => {
        const lid = String(l?.id || "");
        const cid = moduleToCourse[String(l?.module_id || "")] || "";
        if (lid && cid) lessonToCourse[lid] = cid;
      });
      const lessonIds = Object.keys(lessonToCourse);
      const quizzesByLesson = lessonIds.length > 0 ? await supabaseAdmin.from("quizzes").select("id,title,course_id,lesson_id,status").in("lesson_id", lessonIds) : { data: [], error: null };
      const allQuizzes = [...directQuizzes || [], ...quizzesByLesson.data || []];
      const unique = {};
      allQuizzes.forEach((q) => {
        const qid = String(q?.id || "");
        if (!qid || unique[qid]) return;
        unique[qid] = q;
      });
      const normalized = Object.values(unique).map((row) => {
        const status = String(row?.status || "").toLowerCase();
        const published = typeof row?.published === "boolean" ? row.published : null;
        const visible = status ? status === "published" || status === "active" : published !== null ? published : true;
        const resolvedCourseId = String(row?.course_id || "") || lessonToCourse[String(row?.lesson_id || "")] || "";
        return {
          id: String(row?.id || ""),
          title: String(row?.title || ""),
          status,
          published,
          resolvedCourseId,
          lessonId: String(row?.lesson_id || ""),
          visible
        };
      });
      return res.json({
        success: true,
        userId: caller.userId,
        requestedCourseId,
        enrolledCourseIds,
        scopedCourseIds,
        classLinks: (enrolledClasses || []).map((c) => ({
          id: String(c?.id || ""),
          name: String(c?.name || ""),
          courseId: String(c?.course_id || ""),
          studentCount: Array.isArray(c?.student_ids) ? c.student_ids.length : 0
        })),
        counts: {
          directQuizzes: (directQuizzes || []).length,
          lessonMappedQuizzes: (quizzesByLesson.data || []).length,
          dedupedQuizzes: normalized.length,
          visibleAfterPublishFilter: normalized.filter((q) => q.visible).length
        },
        quizzes: normalized
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to debug student quizzes" });
    }
  });
  app.post("/api/student/quiz-violation", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const quizId = typeof req.body?.quizId === "string" ? req.body.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "quizId is required" });
      const violationType = typeof req.body?.type === "string" ? req.body.type.trim() : "unknown";
      const questionIndex = Number.isFinite(Number(req.body?.questionIndex)) ? Number(req.body.questionIndex) : null;
      const remainingSeconds = Number.isFinite(Number(req.body?.remainingSeconds)) ? Number(req.body.remainingSeconds) : null;
      const violationCount = Number.isFinite(Number(req.body?.violationCount)) ? Number(req.body.violationCount) : null;
      let quizRes = await supabaseAdmin.from("quizzes").select("id,title,teacher_id,course_id").eq("id", quizId).maybeSingle();
      if (quizRes.error && missingQuizzesTeacherIdColumn(quizRes.error)) {
        quizRes = await supabaseAdmin.from("quizzes").select("id,title,course_id").eq("id", quizId).maybeSingle();
      }
      if (quizRes.error) throw quizRes.error;
      if (!quizRes.data) return res.status(404).json({ error: "Quiz not found" });
      const quizRow = quizRes.data;
      const quizTitle = String(quizRow?.title || "Quiz");
      let teacherId = String(quizRow?.teacher_id || "").trim();
      const courseId = String(quizRow?.course_id || "").trim();
      if (!teacherId && courseId) {
        const { data: courseRow } = await supabaseAdmin.from("courses").select("teacher_id").eq("id", courseId).maybeSingle();
        teacherId = String(courseRow?.teacher_id || "").trim();
      }
      if (!teacherId) {
        return res.json({ success: true, notified: false, reason: "missing_teacher" });
      }
      const { data: studentProfile } = await supabaseAdmin.from("profiles").select("display_name,email").eq("id", caller.userId).maybeSingle();
      const studentLabel = String(studentProfile?.display_name || "").trim() || String(studentProfile?.email || "").trim() || "A student";
      const violationInfo = [
        `Type: ${violationType || "unknown"}`,
        questionIndex !== null ? `Question: ${questionIndex + 1}` : "",
        remainingSeconds !== null ? `Remaining time: ${remainingSeconds}s` : "",
        violationCount !== null ? `Warnings: ${violationCount}` : ""
      ].filter(Boolean).join(" | ");
      await notifInsert({
        user_id: teacherId,
        title: "Quiz Integrity Alert",
        message: `${studentLabel} triggered a quiz violation in "${quizTitle}". ${violationInfo}`.trim(),
        type: "warning",
        action_url: `/teacher/results`,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return res.json({ success: true, notified: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to report quiz violation" });
    }
  });
  const isQuizRuntimeStateTableMissing = (error) => {
    const haystack = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    return error?.code === "PGRST205" && haystack.includes("quiz_runtime_state") || error?.code === "42P01" && haystack.includes("quiz_runtime_state") || haystack.includes("could not find the table 'public.quiz_runtime_state'");
  };
  app.get("/api/student/quiz-runtime/:quizId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const quizId = typeof req.params?.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "quizId is required" });
      let runtimeRes = await supabaseAdmin.from("quiz_runtime_state").select("quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,answers,updated_at").eq("quiz_id", quizId).eq("student_id", caller.userId).maybeSingle();
      if (runtimeRes.error && /answers/i.test(String(runtimeRes.error.message))) {
        runtimeRes = await supabaseAdmin.from("quiz_runtime_state").select("quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,updated_at").eq("quiz_id", quizId).eq("student_id", caller.userId).maybeSingle();
      }
      if (runtimeRes.error) {
        if (isQuizRuntimeStateTableMissing(runtimeRes.error)) {
          return res.json({ success: true, runtime: null, storage: "table_missing" });
        }
        throw runtimeRes.error;
      }
      return res.json({ success: true, runtime: runtimeRes.data || null, storage: "database" });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to fetch quiz runtime state" });
    }
  });
  app.put("/api/student/quiz-runtime/:quizId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const quizId = typeof req.params?.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "quizId is required" });
      const startedAt = typeof req.body?.startedAt === "string" ? req.body.startedAt : null;
      const expiresAtMs = Number.isFinite(Number(req.body?.expiresAtMs)) ? Number(req.body.expiresAtMs) : null;
      const violationCount = Number.isFinite(Number(req.body?.violationCount)) ? Number(req.body.violationCount) : 0;
      const currentQuestionIndex = Number.isFinite(Number(req.body?.currentQuestionIndex)) ? Math.max(0, Number(req.body.currentQuestionIndex)) : 0;
      const answers = req.body?.answers && typeof req.body.answers === "object" && !Array.isArray(req.body.answers) ? req.body.answers : null;
      const baseRow = {
        quiz_id: quizId,
        student_id: caller.userId,
        started_at: startedAt,
        expires_at_ms: expiresAtMs,
        violation_count: Math.max(0, violationCount),
        current_question_index: currentQuestionIndex,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      let upsertRes = await supabaseAdmin.from("quiz_runtime_state").upsert(
        answers !== null ? { ...baseRow, answers } : baseRow,
        { onConflict: "quiz_id,student_id" }
      ).select("quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,answers,updated_at").single();
      if (upsertRes.error && /answers/i.test(String(upsertRes.error.message))) {
        upsertRes = await supabaseAdmin.from("quiz_runtime_state").upsert(baseRow, { onConflict: "quiz_id,student_id" }).select("quiz_id,student_id,started_at,expires_at_ms,violation_count,current_question_index,updated_at").single();
      }
      if (upsertRes.error) {
        if (isQuizRuntimeStateTableMissing(upsertRes.error)) {
          return res.json({ success: true, runtime: null, storage: "table_missing" });
        }
        throw upsertRes.error;
      }
      return res.json({ success: true, runtime: upsertRes.data, storage: "database" });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to update quiz runtime state" });
    }
  });
  app.delete("/api/student/quiz-runtime/:quizId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const quizId = typeof req.params?.quizId === "string" ? req.params.quizId.trim() : "";
      if (!quizId) return res.status(400).json({ error: "quizId is required" });
      const deleteRes = await supabaseAdmin.from("quiz_runtime_state").delete().eq("quiz_id", quizId).eq("student_id", caller.userId);
      if (deleteRes.error && !isQuizRuntimeStateTableMissing(deleteRes.error)) {
        throw deleteRes.error;
      }
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to clear quiz runtime state" });
    }
  });
  app.get("/api/student/profile", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student role required" });
      }
      const uid = caller.userId;
      const [profileRes, enrolledRes, certificatesRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabaseAdmin.from("courses").select("id").contains("student_ids", [uid]),
        supabaseAdmin.from("certificates").select("id").eq("student_id", uid)
      ]);
      if (profileRes.error) throw profileRes.error;
      const profileRow = profileRes.data || {};
      const enrolledCourseIds = (enrolledRes.data || []).map((c) => String(c.id));
      const certCount = (certificatesRes.data || []).length;
      let lessonsCompleted = 0;
      if (enrolledCourseIds.length > 0) {
        const { data: progressRows } = await supabaseAdmin.from("lesson_progress").select("id").eq("student_id", uid).eq("completed", true);
        lessonsCompleted = (progressRows || []).length;
      }
      let quizzesTaken = 0;
      try {
        const { data: attemptRows } = await supabaseAdmin.from("quiz_attempts").select("id").eq("student_id", uid);
        quizzesTaken = (attemptRows || []).length;
      } catch {
      }
      return res.json({
        success: true,
        profile: {
          displayName: String(profileRow.display_name || ""),
          bio: String(profileRow.bio || ""),
          phone: String(profileRow.phone || ""),
          website: String(profileRow.website || ""),
          avatarUrl: String(profileRow.avatar_url || ""),
          email: String(profileRow.email || ""),
          createdAt: String(profileRow.created_at || "")
        },
        stats: {
          coursesEnrolled: enrolledCourseIds.length,
          lessonsCompleted,
          quizzesTaken,
          certificatesEarned: certCount
        }
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load student profile" });
    }
  });
  app.get("/api/student/modules", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const uid = caller.userId;
      let courseIds = [];
      const directRes = await supabaseAdmin.from("courses").select("id,title,level,status").contains("student_ids", [uid]).eq("status", "published");
      if (!directRes.error) {
        courseIds = (directRes.data || []).map((c) => String(c.id));
      }
      const classRes = await supabaseAdmin.from("classes").select("course_id").contains("student_ids", [uid]);
      if (!classRes.error && classRes.data?.length) {
        const classCourseIds = classRes.data.map((r) => String(r.course_id)).filter(Boolean);
        const missing = classCourseIds.filter((id) => !courseIds.includes(id));
        if (missing.length) {
          const extraRes = await supabaseAdmin.from("courses").select("id").in("id", missing).eq("status", "published");
          if (!extraRes.error) courseIds.push(...(extraRes.data || []).map((c) => String(c.id)));
        }
      }
      if (!courseIds.length) {
        const profileRes = await supabaseAdmin.from("profiles").select("teacher_id").eq("id", uid).single();
        const teacherId = profileRes.data?.teacher_id;
        if (teacherId) {
          const teacherCourses = await supabaseAdmin.from("courses").select("id").eq("teacher_id", teacherId).eq("status", "published");
          if (!teacherCourses.error) courseIds.push(...(teacherCourses.data || []).map((c) => String(c.id)));
        }
        if (!courseIds.length) {
          const allRes = await supabaseAdmin.from("courses").select("id").eq("status", "published");
          if (!allRes.error) courseIds.push(...(allRes.data || []).map((c) => String(c.id)));
        }
      }
      courseIds = [...new Set(courseIds)];
      if (!courseIds.length) return res.json({ success: true, modules: [], courses: [] });
      const [coursesRes, modulesRes] = await Promise.all([
        supabaseAdmin.from("courses").select("id,title,level").in("id", courseIds),
        supabaseAdmin.from("modules").select("id,title,description,order,status,course_id,created_at").in("course_id", courseIds).order("order", { ascending: true })
      ]);
      const moduleIds = (modulesRes.data || []).map((m) => String(m.id));
      const lessonsRes = moduleIds.length ? await supabaseAdmin.from("lessons").select("id,module_id").in("module_id", moduleIds) : { data: [] };
      const lessonsByModule = {};
      (lessonsRes.data || []).forEach((l) => {
        lessonsByModule[l.module_id] = (lessonsByModule[l.module_id] || 0) + 1;
      });
      const courseTitleMap = {};
      const courseLevelMap = {};
      (coursesRes.data || []).forEach((c) => {
        courseTitleMap[c.id] = c.title || "";
        courseLevelMap[c.id] = c.level || "";
      });
      const modules = (modulesRes.data || []).map((m) => ({
        id: m.id,
        title: m.title || "Untitled Module",
        description: m.description || "",
        order: m.order ?? 0,
        status: m.status || "active",
        course_id: m.course_id,
        courseTitle: courseTitleMap[m.course_id] || "Course",
        courseLevel: courseLevelMap[m.course_id] || "",
        lessonCount: lessonsByModule[m.id] || 0,
        createdAt: m.created_at || ""
      }));
      const courses = (coursesRes.data || []).map((c) => ({ id: c.id, title: c.title || "Course", level: c.level || "" }));
      return res.json({ success: true, modules, courses });
    } catch (e) {
      console.error("GET /api/student/modules", e);
      return res.status(500).json({ error: e?.message || "Failed to load modules" });
    }
  });
  app.get("/api/student/lessons", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const requestedCourseId = typeof req.query.courseId === "string" ? req.query.courseId.trim() : "";
      const { data: enrolledCourses, error: ecErr } = await supabaseAdmin.from("courses").select("id,title").contains("student_ids", [caller.userId]);
      if (ecErr) throw ecErr;
      const enrolledCourseIds = (enrolledCourses || []).map((c) => String(c.id));
      if (enrolledCourseIds.length === 0) return res.json({ success: true, lessons: [] });
      const scopedCourseIds = requestedCourseId ? enrolledCourseIds.includes(requestedCourseId) ? [requestedCourseId] : [] : enrolledCourseIds;
      if (scopedCourseIds.length === 0) return res.json({ success: true, lessons: [] });
      const { data: modules, error: modErr } = await supabaseAdmin.from("modules").select("id,title,course_id").in("course_id", scopedCourseIds);
      if (modErr) throw modErr;
      let lessonsRes = await supabaseAdmin.from("lessons").select("*").in("course_id", scopedCourseIds).eq("status", "published").order("order", { ascending: true });
      if (lessonsRes.error && isRecoverableSchemaColumnError(lessonsRes.error)) {
        lessonsRes = await supabaseAdmin.from("lessons").select("*").in("course_id", scopedCourseIds).order("order", { ascending: true });
      }
      if (lessonsRes.error) throw lessonsRes.error;
      let lessonRows = lessonsRes.data || [];
      if (lessonRows.length === 0) {
        const moduleIds = (modules || []).map((m) => String(m.id)).filter(Boolean);
        if (moduleIds.length > 0) {
          let byModuleRes = await supabaseAdmin.from("lessons").select("*").in("module_id", moduleIds).eq("status", "published").order("order", { ascending: true });
          if (byModuleRes.error && isRecoverableSchemaColumnError(byModuleRes.error)) {
            byModuleRes = await supabaseAdmin.from("lessons").select("*").in("module_id", moduleIds).order("order", { ascending: true });
          }
          if (byModuleRes.error) throw byModuleRes.error;
          lessonRows = byModuleRes.data || [];
        }
      }
      const moduleMap = {};
      (modules || []).forEach((m) => {
        moduleMap[String(m.id)] = { title: String(m.title || ""), courseId: String(m.course_id || "") };
      });
      const courseMap = {};
      (enrolledCourses || []).forEach((c) => {
        courseMap[String(c.id)] = String(c.title || "Course");
      });
      const allowedCourseIds = new Set(scopedCourseIds);
      const lessonIds = (lessonRows || []).map((l) => String(l.id)).filter(Boolean);
      let progressMap = {};
      if (lessonIds.length > 0) {
        const progressRes = await fetchLessonProgressRows(caller.userId, lessonIds);
        (progressRes.rows || []).forEach((p) => {
          const lid = String(p.lesson_id || "");
          if (!lid) return;
          progressMap[lid] = {
            completed: toLessonCompleted(p),
            last_video_position: Number(p.last_video_position || 0)
          };
        });
      }
      const lessons = (lessonRows || []).map((l) => {
        const mod = moduleMap[String(l.module_id)] || { title: "", courseId: "" };
        const resolvedCourseId = String(l.course_id || mod.courseId || "");
        const progress = progressMap[String(l.id)] || { completed: false, last_video_position: 0 };
        return {
          ...l,
          module_title: mod.title,
          course_id: resolvedCourseId,
          course_title: courseMap[resolvedCourseId] || "Course",
          progress_completed: progress.completed,
          last_video_position: progress.last_video_position
        };
      }).filter((l) => allowedCourseIds.has(String(l.course_id || "")));
      return res.json({ success: true, lessons });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load student lessons" });
    }
  });
  app.get("/api/student/lessons/:lessonId/detail", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const lessonId = String(req.params.lessonId || "").trim();
      if (!lessonId) return res.status(400).json({ error: "lessonId is required" });
      const { data: lesson, error: lessonErr } = await supabaseAdmin.from("lessons").select("*").eq("id", lessonId).maybeSingle();
      if (lessonErr) throw lessonErr;
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const lessonCourseId = String(lesson.course_id || "").trim();
      if (!lessonCourseId) return res.status(400).json({ error: "Lesson is missing course_id" });
      const { data: enrolledRows, error: enrollErr } = await supabaseAdmin.from("courses").select("id,title").contains("student_ids", [caller.userId]);
      if (enrollErr) throw enrollErr;
      const enrolledSet = new Set((enrolledRows || []).map((c) => String(c.id)));
      if (!enrolledSet.has(lessonCourseId) && caller.role !== "admin") {
        return res.status(403).json({ error: "You are not enrolled in this lesson course" });
      }
      const { data: moduleRow } = await supabaseAdmin.from("modules").select("id,title").eq("id", lesson.module_id).maybeSingle();
      const contentsRes = await fetchLessonContentsWithFallbackOrder(lessonId);
      if (contentsRes.error && !isLessonContentsTableMissing(contentsRes.error)) throw contentsRes.error;
      const progressRes = await fetchLessonProgressSingle(caller.userId, lessonId);
      const contentRows = normalizeLessonContentRows(contentsRes.data || []).map((row) => ({
        ...row,
        signed_url: typeof row?.storage_path === "string" && /^https?:\/\//i.test(row.storage_path) ? row.storage_path : null
      }));
      for (const row of contentRows) {
        const path3 = String(row?.storage_path || "").trim();
        if (!path3 || /^https?:\/\//i.test(path3)) continue;
        await ensureLessonMediaBucket();
        const signed = await supabaseAdmin.storage.from("lesson-media").createSignedUrl(path3, 3600);
        row.signed_url = signed.error ? null : signed.data?.signedUrl || null;
      }
      return res.json({
        success: true,
        lesson: {
          ...lesson,
          module_title: moduleRow?.title || "",
          course_title: (enrolledRows || []).find((c) => String(c.id) === lessonCourseId)?.title || "Course"
        },
        contents: contentRows,
        progress: progressRes.row || null
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load lesson detail" });
    }
  });
  app.get("/api/student/lessons/:lessonId/progress", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const lessonId = String(req.params.lessonId || "").trim();
      if (!lessonId) return res.status(400).json({ error: "lessonId is required" });
      const progressRes = await fetchLessonProgressSingle(caller.userId, lessonId);
      return res.json({ success: true, progress: progressRes.row || null, storage: progressRes.storage });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load lesson progress" });
    }
  });
  app.put("/api/student/lessons/:lessonId/progress", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const lessonId = String(req.params.lessonId || "").trim();
      if (!lessonId) return res.status(400).json({ error: "lessonId is required" });
      const completed = Boolean(req.body?.completed);
      const lastVideoPosition = Number.isFinite(Number(req.body?.lastVideoPosition)) ? Math.max(0, Number(req.body.lastVideoPosition)) : 0;
      const upsertRes = await upsertLessonProgressWithFallback(caller.userId, lessonId, completed, lastVideoPosition);
      let autoCertificateIssued = false;
      if (completed) {
        try {
          const lessonSnap = await supabaseAdmin.from("lessons").select("course_id").eq("id", lessonId).maybeSingle();
          const courseId = lessonSnap.data?.course_id ? String(lessonSnap.data.course_id) : "";
          if (courseId) {
            const allLessonsRes = await supabaseAdmin.from("lessons").select("id").eq("course_id", courseId).eq("status", "published");
            const allLessonIds = (allLessonsRes.data || []).map((l) => String(l.id));
            if (allLessonIds.length > 0) {
              const progressRes = await fetchLessonProgressRows(caller.userId, allLessonIds);
              const completedIds = new Set(
                (progressRes.rows || []).filter((p) => toLessonCompleted(p)).map((p) => String(p.lesson_id))
              );
              const allComplete = allLessonIds.every((id) => completedIds.has(id));
              if (allComplete) {
                const existingCert = await supabaseAdmin.from("certificates").select("id").eq("student_id", caller.userId).eq("course_id", courseId).maybeSingle();
                if (!existingCert.error && !existingCert.data) {
                  await supabaseAdmin.from("certificates").insert({
                    student_id: caller.userId,
                    course_id: courseId,
                    status: "issued",
                    issued_date: (/* @__PURE__ */ new Date()).toISOString()
                  });
                  autoCertificateIssued = true;
                  console.log(`[auto-cert] Certificate issued student=${caller.userId} course=${courseId}`);
                }
              }
            }
          }
        } catch (certErr) {
          console.warn("[auto-cert] Failed to issue certificate:", certErr?.message);
        }
      }
      return res.json({ success: true, progress: upsertRes.row, storage: upsertRes.storage, autoCertificateIssued });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to update lesson progress" });
    }
  });
  app.get("/api/student/courses/:courseId/progress", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const courseId = String(req.params.courseId || "").trim();
      if (!courseId) return res.status(400).json({ error: "courseId is required" });
      const lessonRowsRes = await supabaseAdmin.from("lessons").select("id").eq("course_id", courseId).eq("status", "published");
      if (lessonRowsRes.error && !isRecoverableSchemaColumnError(lessonRowsRes.error)) throw lessonRowsRes.error;
      const lessonRows = lessonRowsRes.data || [];
      const lessonIds = lessonRows.map((l) => String(l.id)).filter(Boolean);
      if (!lessonIds.length) return res.json({ success: true, totalLessons: 0, completedLessons: 0, progressPercent: 0 });
      const progressRes = await fetchLessonProgressRows(caller.userId, lessonIds);
      if (progressRes.storage === "table_missing") {
        return res.json({ success: true, totalLessons: lessonIds.length, completedLessons: 0, progressPercent: 0, storage: "table_missing" });
      }
      const completedSet = new Set(
        (progressRes.rows || []).filter((p) => toLessonCompleted(p)).map((p) => String(p.lesson_id))
      );
      const completedLessons = completedSet.size;
      const totalLessons = lessonIds.length;
      const progressPercent = totalLessons > 0 ? Math.round(completedLessons / totalLessons * 100) : 0;
      return res.json({ success: true, totalLessons, completedLessons, progressPercent });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load course progress" });
    }
  });
  app.get("/api/student/live-sessions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: student or admin role required" });
      }
      const { status } = req.query;
      const studentLiveSessionsCacheKey = `student-live-sessions:${caller.userId}:${String(status || "all")}`;
      const cachedLiveSessions = getCachedApiResponse(studentLiveSessionsCacheKey);
      if (cachedLiveSessions) return res.json(cachedLiveSessions);
      const { data: participantRows, error: pErr } = await supabaseAdmin.from("session_participants").select("session_id,is_removed").eq("user_id", caller.userId);
      if (pErr && !isSessionParticipantsTableMissing(pErr)) throw pErr;
      const invitedSessionIds = (participantRows || []).filter((p) => !p.is_removed).map((p) => p.session_id);
      const [{ data: enrolledCourses }, { data: enrolledClasses }] = await Promise.all([
        supabaseAdmin.from("courses").select("id").contains("student_ids", [caller.userId]),
        supabaseAdmin.from("classes").select("id").contains("student_ids", [caller.userId])
      ]);
      const courseIds = (enrolledCourses || []).map((c) => c.id);
      const classIds = (enrolledClasses || []).map((c) => c.id);
      let enrolledSessionIds = [];
      if (courseIds.length > 0) {
        const { data: rows } = await supabaseAdmin.from("live_sessions").select("id").in("course_id", courseIds).eq("status", "ended");
        enrolledSessionIds.push(...(rows || []).map((s) => s.id));
      }
      const allSessionIds = Array.from(/* @__PURE__ */ new Set([...invitedSessionIds, ...enrolledSessionIds]));
      if (allSessionIds.length === 0) return res.json({ success: true, sessions: [] });
      let query = supabaseAdmin.from("live_sessions").select("id, title, status, scheduled_at, duration_minutes, meeting_url, recording_url, max_participants, course_id, host:profiles!host_id(id,display_name)").in("id", allSessionIds).order("scheduled_at", { ascending: false });
      if (status) query = query.eq("status", status);
      let { data, error } = await query;
      if (error) {
        const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
        const classIdCacheErr = error.code === "PGRST204" || msg.includes("class_id") && (msg.includes("schema cache") || msg.includes("could not find") || msg.includes("does not exist"));
        if (!classIdCacheErr) throw error;
        let fallbackQuery = supabaseAdmin.from("live_sessions").select("id, title, status, scheduled_at, duration_minutes, meeting_url, recording_url, max_participants, course_id, host_id").in("id", allSessionIds).order("scheduled_at", { ascending: false });
        if (status) fallbackQuery = fallbackQuery.eq("status", status);
        const fallback = await fallbackQuery;
        if (fallback.error) throw fallback.error;
        const hostIds = Array.from(new Set((fallback.data || []).map((r) => String(r.host_id || "")).filter(Boolean)));
        let hostMap = {};
        if (hostIds.length > 0) {
          const hostsRes = await supabaseAdmin.from("profiles").select("id,display_name").in("id", hostIds);
          if (!hostsRes.error) {
            hostMap = Object.fromEntries(
              (hostsRes.data || []).map((h) => [String(h.id), { id: String(h.id), display_name: String(h.display_name || "Teacher") }])
            );
          }
        }
        data = (fallback.data || []).map((row) => ({
          ...row,
          host: row.host_id ? hostMap[String(row.host_id)] || null : null
        }));
      }
      const payload = { success: true, sessions: data || [] };
      setCachedApiResponse(studentLiveSessionsCacheKey, payload, 15e3);
      res.json(payload);
    } catch (e) {
      console.error("GET /api/student/live-sessions", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/live-sessions/:id/upload-url", async (req, res) => {
    try {
      const { id } = req.params;
      const filename = `session-${id}-${Date.now()}.webm`;
      const storagePath = `recordings/${filename}`;
      await supabaseAdmin.storage.createBucket("recordings", { public: true }).catch(() => {
      });
      const { data, error } = await supabaseAdmin.storage.from("recordings").createSignedUploadUrl(storagePath);
      if (error) throw error;
      const { data: { publicUrl } } = supabaseAdmin.storage.from("recordings").getPublicUrl(storagePath);
      res.json({ success: true, signedUrl: data.signedUrl, publicUrl });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/live-sessions/:id", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("live_sessions").select("*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)").eq("id", req.params.id).single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/live-sessions", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("live_sessions").select("*, host:profiles!host_id(id,display_name,email), course:courses!course_id(id,title)").order("scheduled_at", { ascending: false });
      if (error) throw error;
      res.json({ success: true, sessions: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/live-sessions", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("live_sessions").insert({ ...req.body, created_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).select().single();
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/admin/live-sessions/:id", async (req, res) => {
    try {
      const adminUpdatePayload = { ...req.body, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      let updateResult = await supabaseAdmin.from("live_sessions").update(adminUpdatePayload).eq("id", req.params.id).select().single();
      if (updateResult.error && isLiveSessionsStartedAtColumnMissing(updateResult.error) && "started_at" in adminUpdatePayload) {
        const { started_at: _startedAt, ...fallbackUpdate } = adminUpdatePayload;
        updateResult = await supabaseAdmin.from("live_sessions").update(fallbackUpdate).eq("id", req.params.id).select().single();
      }
      const { data, error } = updateResult;
      if (error) throw error;
      res.json({ success: true, session: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/admin/live-sessions/:id", async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("live_sessions").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  const missingCommunityPostsClassIdColumn = (error) => {
    const hay = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
    if (!hay.includes("class_id")) return false;
    return /schema cache|could not find|does not exist|42703|undefined column|column/i.test(hay);
  };
  const sortCommunityPosts = (rows) => {
    return [...rows || []].sort((a, b) => {
      const aPinned = String(a?.status || "") === "pinned" ? 1 : 0;
      const bPinned = String(b?.status || "") === "pinned" ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = new Date(String(a?.created_at || 0)).getTime();
      const bTime = new Date(String(b?.created_at || 0)).getTime();
      return bTime - aTime;
    });
  };
  const selectCommunityPostsCompat = async () => {
    const withClass = await supabaseAdmin.from("community_posts").select("*, author:profiles!author_id(id,display_name,email), class_target:classes!class_id(id,name)").order("created_at", { ascending: false });
    if (!withClass.error) {
      return { data: sortCommunityPosts(withClass.data || []), error: null };
    }
    if (!missingCommunityPostsClassIdColumn(withClass.error)) {
      return { data: null, error: withClass.error };
    }
    const fallback = await supabaseAdmin.from("community_posts").select("*, author:profiles!author_id(id,display_name,email)").order("created_at", { ascending: false });
    if (fallback.error) return { data: null, error: fallback.error };
    const normalized = (fallback.data || []).map((row) => ({
      ...row,
      class_id: null,
      class_target: null
    }));
    return { data: sortCommunityPosts(normalized), error: null };
  };
  const insertCommunityPostCompat = async (payload) => {
    let current = { ...payload, created_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    for (let i = 0; i < 4; i += 1) {
      const res = await supabaseAdmin.from("community_posts").insert(current).select().single();
      if (!res.error) return res;
      if (missingCommunityPostsClassIdColumn(res.error) && "class_id" in current) {
        if (current.class_id) {
          return {
            data: null,
            error: new Error("Community class targeting needs the SQL in sql/add_community_post_class_id.sql.")
          };
        }
        const next = { ...current };
        delete next.class_id;
        current = next;
        continue;
      }
      return res;
    }
    return { data: null, error: new Error("Community insert: compatibility retries exhausted") };
  };
  const updateCommunityPostCompat = async (id, payload) => {
    let current = { ...payload, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    for (let i = 0; i < 4; i += 1) {
      const res = await supabaseAdmin.from("community_posts").update(current).eq("id", id).select().single();
      if (!res.error) return res;
      if (missingCommunityPostsClassIdColumn(res.error) && "class_id" in current) {
        if (current.class_id) {
          return {
            data: null,
            error: new Error("Community class targeting needs the SQL in sql/add_community_post_class_id.sql.")
          };
        }
        const next = { ...current };
        delete next.class_id;
        current = next;
        continue;
      }
      return res;
    }
    return { data: null, error: new Error("Community update: compatibility retries exhausted") };
  };
  app.get("/api/admin/community", async (req, res) => {
    try {
      const { data, error } = await selectCommunityPostsCompat();
      if (error) throw error;
      res.json({ success: true, posts: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/community", async (req, res) => {
    try {
      const { data, error } = await insertCommunityPostCompat(req.body || {});
      if (error) throw error;
      res.json({ success: true, post: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/admin/community/:id", async (req, res) => {
    try {
      const { data, error } = await updateCommunityPostCompat(req.params.id, req.body || {});
      if (error) throw error;
      res.json({ success: true, post: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/admin/community/:id", async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("community_posts").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  const canModerateDiscussion = (role) => role === "teacher" || role === "admin";
  const canMarkBestAnswer = (role) => role === "teacher" || role === "admin";
  const canUseDiscussion = (role) => role === "student" || role === "teacher" || role === "admin";
  const asInt = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const awardDiscussionBadges = async (userId) => {
    try {
      const [statsRes, badgesRes] = await Promise.all([
        poolQuery(`SELECT * FROM discussion_user_stats WHERE user_id = $1`, [userId]),
        poolQuery(`SELECT * FROM discussion_badges`)
      ]);
      const stats = statsRes.rows[0];
      const badgeRows = badgesRes.rows;
      if (!stats || badgeRows.length === 0) return;
      for (const badge of badgeRows) {
        const key = String(badge.key || "");
        const threshold = asInt(badge.threshold, 1);
        const answersCount = asInt(stats.answers_count, 0);
        const bestAnswers = asInt(stats.best_answers_count, 0);
        const helpfulReceived = asInt(stats.helpful_reactions_received, 0);
        const shouldGrant = key === "first_answer" && answersCount >= threshold || key === "helpful_contributor" && helpfulReceived >= threshold || key === "mentor" && bestAnswers >= threshold;
        if (shouldGrant) {
          await poolQuery(
            `INSERT INTO discussion_user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT (user_id, badge_id) DO NOTHING`,
            [userId, String(badge.id || "")]
          ).catch(() => {
          });
        }
      }
    } catch {
    }
  };
  const rqSessions = /* @__PURE__ */ new Map();
  const rqPins = /* @__PURE__ */ new Map();
  const rqCompletedSessions = /* @__PURE__ */ new Map();
  const RQ_REPORT_SECTION_PREFIX = "rq_report:";
  const rqPersistReport = async (report) => {
    try {
      await supabaseAdmin.from("platform_config").upsert(
        { section: `${RQ_REPORT_SECTION_PREFIX}${report.id}`, value: report, updated_at: (/* @__PURE__ */ new Date()).toISOString() },
        { onConflict: "section" }
      );
    } catch (e) {
      console.warn("[rq] persist report failed:", e);
    }
  };
  const rqRestoreReportsFromDB = async () => {
    try {
      const { data } = await supabaseAdmin.from("platform_config").select("section, value").like("section", `${RQ_REPORT_SECTION_PREFIX}%`);
      if (!data) return;
      let count = 0;
      for (const row of data) {
        const r = row.value;
        if (!r?.id) continue;
        rqCompletedSessions.set(r.id, r);
        count++;
      }
      if (count > 0) console.log(`[rq] Restored ${count} completed quiz report(s) from DB`);
    } catch (e) {
      console.warn("[rq] restoreReportsFromDB failed:", e);
    }
  };
  const buildRQReport = (session) => {
    const parts = [...session.participants.values()];
    const leaderboard = parts.map((p) => {
      const totalAnswers = Object.keys(p.answers).length;
      const correctAnswers = Object.values(p.answers).filter((a) => a.isCorrect).length;
      return {
        userId: p.userId,
        displayName: p.displayName,
        score: p.score,
        correctAnswers,
        totalAnswers,
        accuracy: totalAnswers > 0 ? Math.round(correctAnswers / totalAnswers * 100) : 0,
        rank: 0
      };
    }).sort((a, b) => b.score - a.score).map((p, i) => ({ ...p, rank: i + 1 }));
    const questionStats = session.questions.map((q) => {
      const answers = parts.map((p) => p.answers[q.index]).filter(Boolean);
      const correctCount = answers.filter((a) => a.isCorrect).length;
      return {
        index: q.index,
        body: q.body,
        correctAnswer: q.correctAnswer,
        options: q.options,
        totalAnswered: answers.length,
        correctCount,
        accuracy: answers.length > 0 ? Math.round(correctCount / answers.length * 100) : 0
      };
    });
    return {
      id: session.id,
      quizId: session.quizId,
      quizTitle: session.quizTitle,
      hostId: session.hostId,
      pin: session.pin,
      totalQuestions: session.questions.length,
      participantCount: parts.length,
      endedAt: Date.now(),
      createdAt: session.createdAt,
      leaderboard,
      questionStats
    };
  };
  const generatePin = () => {
    let pin;
    do {
      pin = String(Math.floor(1e5 + Math.random() * 9e5));
    } while (rqPins.has(pin));
    return pin;
  };
  const rqBroadcast = async (sessionId, event, payload) => {
    try {
      await supabaseAdmin.channel(`quiz:${sessionId}`).send({ type: "broadcast", event, payload });
    } catch (_) {
    }
  };
  const rqLeaderboard = (session) => [...session.participants.values()].sort((a, b) => b.score - a.score).map((p, i) => ({ rank: i + 1, userId: p.userId, displayName: p.displayName, score: p.score }));
  const BADGE_DEFS = [
    { id: "first_quiz", name: "Quiz Taker", description: "Completed your first quiz", icon: "\u{1F3AF}", color: "from-blue-400 to-blue-600", rarity: "common" },
    { id: "perfect_score", name: "Perfectionist", description: "Got 100% on a quiz", icon: "\u2B50", color: "from-amber-400 to-yellow-500", rarity: "rare" },
    { id: "speed_demon", name: "Speed Demon", description: "Answered a live question in under 5s", icon: "\u26A1", color: "from-violet-500 to-purple-600", rarity: "rare" },
    { id: "live_player", name: "Live Participant", description: "Joined a live quiz session", icon: "\u{1F4E1}", color: "from-emerald-400 to-teal-500", rarity: "common" },
    { id: "champion", name: "Champion", description: "Finished #1 in a live quiz", icon: "\u{1F3C6}", color: "from-amber-500 to-orange-500", rarity: "epic" },
    { id: "quiz_marathon", name: "Marathon Runner", description: "Completed 5 quizzes", icon: "\u{1F3C3}", color: "from-sky-400 to-indigo-500", rarity: "uncommon" },
    { id: "high_achiever", name: "High Achiever", description: "Scored 90%+ on a quiz", icon: "\u{1F31F}", color: "from-rose-400 to-pink-500", rarity: "uncommon" },
    { id: "consistent", name: "Consistent Learner", description: "Passed 3 quizzes in a row", icon: "\u{1F525}", color: "from-orange-400 to-red-500", rarity: "uncommon" }
  ];
  const studentBadges = /* @__PURE__ */ new Map();
  const studentQuizCount = /* @__PURE__ */ new Map();
  const studentPassStreak = /* @__PURE__ */ new Map();
  const BADGE_SECTION_PREFIX = "rq_badge:";
  const rqPersistBadgeState = async (userId) => {
    try {
      const badges = [...studentBadges.get(userId) ?? []];
      const quizCount = studentQuizCount.get(userId) ?? 0;
      const passStreak = studentPassStreak.get(userId) ?? 0;
      await supabaseAdmin.from("platform_config").upsert(
        { section: `${BADGE_SECTION_PREFIX}${userId}`, value: { badges, quizCount, passStreak }, updated_at: (/* @__PURE__ */ new Date()).toISOString() },
        { onConflict: "section" }
      );
    } catch {
    }
  };
  const rqRestoreBadgeStateFromDB = async () => {
    try {
      const { data } = await supabaseAdmin.from("platform_config").select("section, value").like("section", `${BADGE_SECTION_PREFIX}%`);
      if (!data) return;
      let restored = 0;
      for (const row of data) {
        const userId = row.section.slice(BADGE_SECTION_PREFIX.length);
        const d = row.value;
        if (!userId || !d) continue;
        if (Array.isArray(d.badges)) studentBadges.set(userId, new Set(d.badges));
        if (typeof d.quizCount === "number") studentQuizCount.set(userId, d.quizCount);
        if (typeof d.passStreak === "number") studentPassStreak.set(userId, d.passStreak);
        restored++;
      }
      if (restored > 0) console.log(`[badges] Restored badge state for ${restored} user(s)`);
    } catch {
    }
  };
  rqRestoreBadgeStateFromDB().catch(() => {
  });
  const awardBadge = (userId, badgeId) => {
    if (!studentBadges.has(userId)) studentBadges.set(userId, /* @__PURE__ */ new Set());
    studentBadges.get(userId).add(badgeId);
  };
  const checkAndAwardBadges = (userId, opts) => {
    const count = (studentQuizCount.get(userId) ?? 0) + 1;
    studentQuizCount.set(userId, count);
    if (count === 1) awardBadge(userId, "first_quiz");
    if (count >= 5) awardBadge(userId, "quiz_marathon");
    const pct = opts.total && opts.total > 0 ? (opts.score ?? 0) / opts.total * 100 : 0;
    if (pct >= 90) awardBadge(userId, "high_achiever");
    if (pct >= 100) awardBadge(userId, "perfect_score");
    if (opts.isLive) {
      awardBadge(userId, "live_player");
      if (opts.rank === 1) awardBadge(userId, "champion");
      if (opts.answerTimeMs !== void 0 && opts.answerTimeMs < 5e3) awardBadge(userId, "speed_demon");
    }
    const prevStreak = studentPassStreak.get(userId) ?? 0;
    const newStreak = pct >= 50 ? prevStreak + 1 : 0;
    studentPassStreak.set(userId, newStreak);
    if (newStreak >= 3) awardBadge(userId, "consistent");
    rqPersistBadgeState(userId).catch(() => {
    });
  };
  const rqSessionPublic = (session) => ({
    id: session.id,
    quizId: session.quizId,
    quizTitle: session.quizTitle,
    pin: session.pin,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    questionStartedAt: session.questionStartedAt,
    totalQuestions: session.questions.length,
    participantCount: session.participants.size
  });
  const rqCurrentQuestionForStudent = (session) => {
    if (session.status !== "active") return null;
    const q = session.questions[session.currentQuestionIndex];
    if (!q) return null;
    const elapsed = session.questionStartedAt ? (Date.now() - session.questionStartedAt) / 1e3 : 0;
    const remaining = Math.max(0, q.timerSeconds - elapsed);
    return {
      index: q.index,
      body: q.body,
      options: q.options,
      points: q.points,
      timerSeconds: q.timerSeconds,
      remainingSeconds: remaining,
      type: q.type
    };
  };
  const rqScheduleAutoNext = (sessionId) => {
    const session = rqSessions.get(sessionId);
    if (!session || session.status !== "active") return;
    const q = session.questions[session.currentQuestionIndex];
    if (!q) return;
    if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
    session.autoNextTimer = setTimeout(async () => {
      const s = rqSessions.get(sessionId);
      if (!s || s.status !== "active") return;
      const nextIndex = s.currentQuestionIndex + 1;
      if (nextIndex >= s.questions.length) {
        s.status = "ended";
        rqPins.delete(s.pin);
        const _autoReport1 = buildRQReport(s);
        rqCompletedSessions.set(s.id, _autoReport1);
        rqPersistReport(_autoReport1).catch(() => {
        });
        const board = rqLeaderboard(s);
        await rqBroadcast(sessionId, "session_ended", { leaderboard: board });
        rqDeleteSessionFromDB(sessionId).catch(() => {
        });
      } else {
        s.currentQuestionIndex = nextIndex;
        s.questionStartedAt = Date.now();
        const nq = s.questions[nextIndex];
        await rqBroadcast(sessionId, "question_started", {
          index: nq.index,
          body: nq.body,
          options: nq.options,
          points: nq.points,
          timerSeconds: nq.timerSeconds,
          startedAt: s.questionStartedAt
        });
        rqPersistSession(s).catch(() => {
        });
        rqScheduleAutoNext(sessionId);
      }
    }, q.timerSeconds * 1e3 + 500);
  };
  const RQ_SESSION_SECTION_PREFIX = "teacher/live-quiz:";
  const RQ_SESSION_SECTION_PREFIX_LEGACY = "rq_session:";
  const rqSectionForSession = (sessionId) => `${RQ_SESSION_SECTION_PREFIX}${sessionId}`;
  const rqLegacySectionForSession = (sessionId) => `${RQ_SESSION_SECTION_PREFIX_LEGACY}${sessionId}`;
  const rqSerializeSession = (s) => ({
    id: s.id,
    quizId: s.quizId,
    quizTitle: s.quizTitle,
    hostId: s.hostId,
    pin: s.pin,
    status: s.status,
    currentQuestionIndex: s.currentQuestionIndex,
    questionStartedAt: s.questionStartedAt,
    questions: s.questions,
    createdAt: s.createdAt,
    teamsEnabled: s.teamsEnabled,
    teamCount: s.teamCount,
    teamNames: s.teamNames,
    participantTeams: s.participantTeams,
    teamScores: s.teamScores,
    participants: Object.fromEntries(s.participants.entries())
  });
  const rqPersistSession = async (s) => {
    try {
      await supabaseAdmin.from("platform_config").upsert(
        { section: rqSectionForSession(s.id), value: rqSerializeSession(s), updated_at: (/* @__PURE__ */ new Date()).toISOString() },
        { onConflict: "section" }
      );
      await supabaseAdmin.from("platform_config").delete().eq("section", rqLegacySectionForSession(s.id));
    } catch (e) {
      console.warn("[rq] persist failed:", e);
    }
  };
  const rqDeleteSessionFromDB = async (sessionId) => {
    try {
      await supabaseAdmin.from("platform_config").delete().in("section", [rqSectionForSession(sessionId), rqLegacySectionForSession(sessionId)]);
    } catch (e) {
      console.warn("[rq] delete from DB failed:", e);
    }
  };
  const rqRestoreSingleSessionFromDB = async (sessionId) => {
    try {
      const { data, error } = await supabaseAdmin.from("platform_config").select("section, value").in("section", [rqSectionForSession(sessionId), rqLegacySectionForSession(sessionId)]).maybeSingle();
      if (error || !data?.value) return null;
      const d = data.value;
      if (!d?.id || d.id !== sessionId || !d?.status) return null;
      if (d.status === "ended") {
        await supabaseAdmin.from("platform_config").delete().eq("section", data.section);
        return null;
      }
      const session = {
        id: d.id,
        quizId: d.quizId,
        quizTitle: d.quizTitle,
        hostId: d.hostId,
        pin: d.pin,
        status: d.status,
        currentQuestionIndex: d.currentQuestionIndex ?? 0,
        questionStartedAt: d.questionStartedAt ?? null,
        questions: d.questions ?? [],
        createdAt: d.createdAt ?? Date.now(),
        teamsEnabled: Boolean(d.teamsEnabled),
        teamCount: d.teamCount ?? 2,
        teamNames: Array.isArray(d.teamNames) ? d.teamNames : ["Red", "Blue"],
        participantTeams: d.participantTeams ?? {},
        teamScores: d.teamScores ?? {},
        participants: new Map(Object.entries(d.participants ?? {}))
      };
      rqSessions.set(session.id, session);
      rqPins.set(session.pin, session.id);
      if (session.status === "active") rqScheduleAutoNext(session.id);
      return session;
    } catch {
      return null;
    }
  };
  const rqRestoreSessionsFromDB = async () => {
    try {
      const { data, error } = await supabaseAdmin.from("platform_config").select("section, value").or(`section.like.${RQ_SESSION_SECTION_PREFIX}%,section.like.${RQ_SESSION_SECTION_PREFIX_LEGACY}%`);
      if (error || !data) return;
      let restored = 0;
      for (const row of data) {
        try {
          const d = row.value;
          if (!d?.id || !d?.status) continue;
          if (d.status === "ended") {
            await supabaseAdmin.from("platform_config").delete().eq("section", row.section);
            continue;
          }
          const msLeft = (d.createdAt ?? 0) + 3 * 60 * 60 * 1e3 - Date.now();
          if (msLeft <= 0) {
            await supabaseAdmin.from("platform_config").delete().eq("section", row.section);
            continue;
          }
          const session = {
            id: d.id,
            quizId: d.quizId,
            quizTitle: d.quizTitle,
            hostId: d.hostId,
            pin: d.pin,
            status: d.status,
            currentQuestionIndex: d.currentQuestionIndex ?? 0,
            questionStartedAt: d.questionStartedAt ?? null,
            questions: d.questions ?? [],
            createdAt: d.createdAt ?? Date.now(),
            teamsEnabled: Boolean(d.teamsEnabled),
            teamCount: d.teamCount ?? 2,
            teamNames: Array.isArray(d.teamNames) ? d.teamNames : ["Red", "Blue"],
            participantTeams: d.participantTeams ?? {},
            teamScores: d.teamScores ?? {},
            participants: new Map(Object.entries(d.participants ?? {}))
          };
          rqSessions.set(session.id, session);
          rqPins.set(session.pin, session.id);
          if (session.status === "active") {
            rqScheduleAutoNext(session.id);
          }
          setTimeout(() => {
            const s = rqSessions.get(session.id);
            if (s) {
              rqPins.delete(s.pin);
              rqSessions.delete(session.id);
            }
            rqDeleteSessionFromDB(session.id).catch(() => {
            });
          }, msLeft);
          restored++;
        } catch (e) {
          console.warn("[rq] restore session failed:", e);
        }
      }
      if (restored > 0) console.log(`[rq] Restored ${restored} live quiz session(s) from DB`);
    } catch (e) {
      console.warn("[rq] restoreSessionsFromDB failed:", e);
    }
  };
  rqRestoreSessionsFromDB().catch(() => {
  });
  rqRestoreReportsFromDB().catch(() => {
  });
  app.post("/api/teacher/realtime-quiz/start", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") {
        return res.status(403).json({ error: "Teacher or admin role required." });
      }
      const { quizId, timerPerQuestion } = req.body;
      if (!quizId) return res.status(400).json({ error: "quizId is required." });
      const { data: quizRow, error: qErr } = await supabaseAdmin.from("quizzes").select("id, title, time_limit").eq("id", quizId).maybeSingle();
      if (qErr) throw qErr;
      if (!quizRow) return res.status(404).json({ error: "Quiz not found." });
      const { data: qRows, error: qqErr } = await supabaseAdmin.from("questions").select("*").eq("quiz_id", quizId).order("order", { ascending: true });
      if (qqErr) throw qqErr;
      const rawQs = qRows ?? [];
      const liveTypes = /* @__PURE__ */ new Set(["multiple-choice", "true-false"]);
      const normalizeRqOption = (o) => o && typeof o === "object" ? String(o.text ?? o.label ?? "") : String(o ?? "");
      const rqQuestions = rawQs.filter((r) => liveTypes.has(r.type)).map((r, idx) => {
        const rawOpts = Array.isArray(r.options) ? r.options : [];
        const opts = rawOpts.map(normalizeRqOption);
        const rawCorrect = String(r.correct_answer ?? "");
        const matchedOpt = rawOpts.find((o) => o && typeof o === "object" && o.id === rawCorrect);
        const correctAnswer = matchedOpt ? normalizeRqOption(matchedOpt) : rawCorrect;
        return {
          id: r.id,
          index: idx,
          body: String(r.question_text ?? r.text ?? ""),
          options: opts,
          correctAnswer,
          points: typeof r.points === "number" ? r.points : 1,
          timerSeconds: typeof timerPerQuestion === "number" && timerPerQuestion > 0 ? timerPerQuestion : 30,
          type: r.type
        };
      });
      if (rqQuestions.length === 0) {
        return res.status(400).json({ error: "Quiz has no multiple-choice or true/false questions suitable for live play." });
      }
      const sessionId = `rqs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const pin = generatePin();
      const { teamsEnabled, teamCount } = req.body;
      const tCount = Math.min(6, Math.max(2, Number(teamCount) || 2));
      const defaultTeamNames = ["Red", "Blue", "Green", "Yellow", "Purple", "Orange"];
      const teamNames = defaultTeamNames.slice(0, tCount);
      const teamScores = {};
      teamNames.forEach((n) => {
        teamScores[n] = 0;
      });
      const session = {
        id: sessionId,
        quizId,
        quizTitle: String(quizRow.title ?? "Untitled Quiz"),
        hostId: caller.userId,
        pin,
        status: "waiting",
        currentQuestionIndex: 0,
        questionStartedAt: null,
        questions: rqQuestions,
        participants: /* @__PURE__ */ new Map(),
        createdAt: Date.now(),
        teamsEnabled: Boolean(teamsEnabled),
        teamCount: tCount,
        teamNames,
        participantTeams: {},
        teamScores
      };
      rqSessions.set(sessionId, session);
      rqPins.set(pin, sessionId);
      await rqPersistSession(session);
      setTimeout(() => {
        const s = rqSessions.get(sessionId);
        if (s) {
          rqPins.delete(s.pin);
          rqSessions.delete(sessionId);
        }
        rqDeleteSessionFromDB(sessionId).catch(() => {
        });
      }, 3 * 60 * 60 * 1e3);
      res.json({ success: true, sessionId, pin, quizTitle: session.quizTitle, totalQuestions: rqQuestions.length });
    } catch (err) {
      console.error("[rq] start error:", err);
      res.status(500).json({ error: "Failed to start session." });
    }
  });
  app.get("/api/teacher/realtime-quiz/:sessionId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId) ?? await rqRestoreSingleSessionFromDB(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found." });
      if (session.hostId !== caller.userId && caller.role !== "admin") {
        return res.status(403).json({ error: "Access denied." });
      }
      const q = session.questions[session.currentQuestionIndex] ?? null;
      const elapsed = session.questionStartedAt ? (Date.now() - session.questionStartedAt) / 1e3 : 0;
      res.json({
        success: true,
        session: rqSessionPublic(session),
        currentQuestion: q ? {
          index: q.index,
          body: q.body,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points,
          timerSeconds: q.timerSeconds,
          type: q.type,
          remainingSeconds: Math.max(0, q.timerSeconds - elapsed)
        } : null,
        participants: [...session.participants.values()].map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          score: p.score,
          status: p.status,
          answeredCurrent: p.answers[session.currentQuestionIndex] !== void 0
        })),
        leaderboard: rqLeaderboard(session)
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get session." });
    }
  });
  app.get("/api/teacher/realtime-quiz/sessions/list", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const sessions = [...rqSessions.values()].filter((s) => s.hostId === caller.userId || caller.role === "admin").map(rqSessionPublic);
      res.json({ success: true, sessions });
    } catch (err) {
      res.status(500).json({ error: "Failed to list sessions." });
    }
  });
  const rqSyncReportsFromDB = async () => {
    try {
      const { data } = await supabaseAdmin.from("platform_config").select("section, value").like("section", `${RQ_REPORT_SECTION_PREFIX}%`);
      if (!data) return;
      for (const row of data) {
        const r = row.value;
        if (!r?.id || rqCompletedSessions.has(r.id)) continue;
        rqCompletedSessions.set(r.id, r);
      }
    } catch (_) {
    }
  };
  app.get("/api/teacher/rq-reports", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      await rqSyncReportsFromDB();
      const reports = [...rqCompletedSessions.values()].filter((r) => r.hostId === caller.userId || caller.role === "admin").sort((a, b) => b.endedAt - a.endedAt).map((r) => ({
        id: r.id,
        quizId: r.quizId,
        quizTitle: r.quizTitle,
        pin: r.pin,
        totalQuestions: r.totalQuestions,
        participantCount: r.participantCount,
        endedAt: r.endedAt,
        createdAt: r.createdAt,
        avgScore: r.leaderboard.length > 0 ? Math.round(r.leaderboard.reduce((s, p) => s + p.score, 0) / r.leaderboard.length) : 0,
        avgAccuracy: r.leaderboard.length > 0 ? Math.round(r.leaderboard.reduce((s, p) => s + p.accuracy, 0) / r.leaderboard.length) : 0
      }));
      res.json({ success: true, reports });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch reports." });
    }
  });
  app.get("/api/teacher/rq-reports/:sessionId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      let report = rqCompletedSessions.get(req.params.sessionId);
      if (!report) {
        try {
          const { data } = await supabaseAdmin.from("platform_config").select("value").eq("section", `${RQ_REPORT_SECTION_PREFIX}${req.params.sessionId}`).maybeSingle();
          if (data?.value) {
            report = data.value;
            rqCompletedSessions.set(report.id, report);
          }
        } catch (_) {
        }
      }
      if (!report) return res.status(404).json({ error: "Report not found." });
      if (report.hostId !== caller.userId && caller.role !== "admin") {
        return res.status(403).json({ error: "Access denied." });
      }
      res.json({ success: true, report });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch report." });
    }
  });
  app.patch("/api/teacher/realtime-quiz/:sessionId/next", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId) ?? await rqRestoreSingleSessionFromDB(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found." });
      if (session.hostId !== caller.userId && caller.role !== "admin") {
        return res.status(403).json({ error: "Access denied." });
      }
      if (session.status === "waiting") {
        session.status = "active";
        session.currentQuestionIndex = 0;
        session.questionStartedAt = Date.now();
        const q = session.questions[0];
        await rqBroadcast(session.id, "question_started", {
          index: q.index,
          body: q.body,
          options: q.options,
          points: q.points,
          timerSeconds: q.timerSeconds,
          startedAt: session.questionStartedAt
        });
        rqPersistSession(session).catch(() => {
        });
        rqScheduleAutoNext(session.id);
        return res.json({ success: true, status: "active", questionIndex: 0 });
      }
      if (session.status === "active") {
        if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
        const nextIndex = session.currentQuestionIndex + 1;
        if (nextIndex >= session.questions.length) {
          session.status = "ended";
          rqPins.delete(session.pin);
          const _nextReport = buildRQReport(session);
          rqCompletedSessions.set(session.id, _nextReport);
          rqPersistReport(_nextReport).catch(() => {
          });
          const board = rqLeaderboard(session);
          await rqBroadcast(session.id, "session_ended", { leaderboard: board });
          rqDeleteSessionFromDB(session.id).catch(() => {
          });
          return res.json({ success: true, status: "ended", leaderboard: board });
        }
        session.currentQuestionIndex = nextIndex;
        session.questionStartedAt = Date.now();
        const nq = session.questions[nextIndex];
        await rqBroadcast(session.id, "question_started", {
          index: nq.index,
          body: nq.body,
          options: nq.options,
          points: nq.points,
          timerSeconds: nq.timerSeconds,
          startedAt: session.questionStartedAt
        });
        rqPersistSession(session).catch(() => {
        });
        rqScheduleAutoNext(session.id);
        return res.json({ success: true, status: "active", questionIndex: nextIndex });
      }
      res.status(400).json({ error: "Session is already ended." });
    } catch (err) {
      res.status(500).json({ error: "Failed to advance question." });
    }
  });
  app.post("/api/teacher/realtime-quiz/:sessionId/end", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId) ?? await rqRestoreSingleSessionFromDB(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found." });
      if (session.hostId !== caller.userId && caller.role !== "admin") {
        return res.status(403).json({ error: "Access denied." });
      }
      if (session.autoNextTimer) clearTimeout(session.autoNextTimer);
      session.status = "ended";
      rqPins.delete(session.pin);
      const _endReport = buildRQReport(session);
      rqCompletedSessions.set(session.id, _endReport);
      rqPersistReport(_endReport).catch(() => {
      });
      const board = rqLeaderboard(session);
      await rqBroadcast(session.id, "session_ended", { leaderboard: board });
      rqDeleteSessionFromDB(session.id).catch(() => {
      });
      res.json({ success: true, leaderboard: board });
    } catch (err) {
      res.status(500).json({ error: "Failed to end session." });
    }
  });
  app.post("/api/student/realtime-quiz/join", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { pin, displayName } = req.body;
      if (!pin) return res.status(400).json({ error: "PIN is required." });
      const sessionId = rqPins.get(String(pin).trim());
      if (!sessionId) return res.status(404).json({ error: "Invalid PIN. No active quiz found." });
      const session = rqSessions.get(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found." });
      if (session.status === "ended") return res.status(400).json({ error: "This quiz session has already ended." });
      const name = String(displayName ?? "Student").slice(0, 40);
      let participant = session.participants.get(caller.userId);
      if (!participant) {
        participant = { userId: caller.userId, displayName: name, score: 0, answers: {}, status: "connected", joinedAt: Date.now() };
        session.participants.set(caller.userId, participant);
        await rqBroadcast(sessionId, "participant_joined", {
          displayName: name,
          participantCount: session.participants.size
        });
        rqPersistSession(session).catch(() => {
        });
      } else {
        participant.status = "connected";
        participant.displayName = name;
      }
      if (session.teamsEnabled && !session.participantTeams[caller.userId]) {
        const teamMemberCounts = session.teamNames.map(
          (t) => Object.values(session.participantTeams).filter((v2) => v2 === t).length
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
          Object.entries(participant.answers).map(([k, v2]) => [k, v2.optionText])
        ),
        score: participant.score,
        teamName: session.teamsEnabled ? session.participantTeams[caller.userId] ?? null : null,
        teamsEnabled: session.teamsEnabled
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to join session." });
    }
  });
  app.get("/api/student/realtime-quiz/:sessionId/state", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found." });
      const participant = session.participants.get(caller.userId);
      if (!participant) return res.status(403).json({ error: "You have not joined this session." });
      if (participant.status === "disconnected") participant.status = "connected";
      const currentQ = rqCurrentQuestionForStudent(session);
      const board = session.status === "ended" ? rqLeaderboard(session) : null;
      res.json({
        success: true,
        sessionId: session.id,
        quizTitle: session.quizTitle,
        status: session.status,
        totalQuestions: session.questions.length,
        currentQuestion: currentQ,
        submittedAnswers: Object.fromEntries(
          Object.entries(participant.answers).map(([k, v2]) => [k, v2.optionText])
        ),
        score: participant.score,
        leaderboard: board
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get state." });
    }
  });
  const rqAnswerProcessing = /* @__PURE__ */ new Set();
  app.post("/api/student/realtime-quiz/:sessionId/answer", async (req, res) => {
    let _rqKey = "";
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found." });
      if (session.status !== "active") return res.status(400).json({ error: "Quiz is not active." });
      const participant = session.participants.get(caller.userId);
      if (!participant) return res.status(403).json({ error: "You have not joined this session." });
      const { questionIndex, optionText } = req.body;
      if (typeof questionIndex !== "number") return res.status(400).json({ error: "questionIndex required." });
      if (questionIndex !== session.currentQuestionIndex) {
        return res.status(400).json({ error: "This question is no longer active." });
      }
      if (participant.answers[questionIndex] !== void 0) {
        return res.status(400).json({ error: "Already answered this question." });
      }
      _rqKey = `${req.params.sessionId}:${caller.userId}:${questionIndex}`;
      if (rqAnswerProcessing.has(_rqKey)) {
        return res.status(429).json({ error: "Answer is being processed, please wait." });
      }
      rqAnswerProcessing.add(_rqKey);
      const q = session.questions[questionIndex];
      if (!q) return res.status(400).json({ error: "Invalid question." });
      if (session.questionStartedAt) {
        const elapsed = (Date.now() - session.questionStartedAt) / 1e3;
        if (elapsed > q.timerSeconds + 1) {
          return res.status(400).json({ error: "Time is up for this question." });
        }
      }
      const isCorrect = String(optionText ?? "").trim() === String(q.correctAnswer ?? "").trim();
      let pointsEarned = 0;
      if (isCorrect && session.questionStartedAt) {
        const elapsed = (Date.now() - session.questionStartedAt) / 1e3;
        const speedBonus = Math.max(0, 1 - elapsed / q.timerSeconds);
        pointsEarned = Math.round(q.points * (0.5 + 0.5 * speedBonus));
      }
      participant.answers[questionIndex] = {
        optionText: String(optionText ?? ""),
        isCorrect,
        pointsEarned,
        answeredAt: Date.now()
      };
      participant.score += pointsEarned;
      if (session.teamsEnabled && session.participantTeams[caller.userId]) {
        const team = session.participantTeams[caller.userId];
        session.teamScores[team] = (session.teamScores[team] ?? 0) + pointsEarned;
      }
      const answeredMs = session.questionStartedAt ? Date.now() - session.questionStartedAt : 99999;
      checkAndAwardBadges(caller.userId, { isLive: true, answerTimeMs: answeredMs });
      const teamLeaderboard = session.teamsEnabled ? session.teamNames.map((t) => ({ team: t, score: session.teamScores[t] ?? 0 })).sort((a, b) => b.score - a.score) : null;
      await rqBroadcast(session.id, "leaderboard_updated", {
        leaderboard: rqLeaderboard(session),
        teamLeaderboard,
        teamScores: session.teamScores
      });
      rqPersistSession(session).catch(() => {
      });
      res.json({
        success: true,
        isCorrect,
        pointsEarned,
        correctAnswer: q.correctAnswer,
        score: participant.score,
        teamScore: session.teamsEnabled && session.participantTeams[caller.userId] ? session.teamScores[session.participantTeams[caller.userId]] : null
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to submit answer." });
    } finally {
      if (_rqKey) rqAnswerProcessing.delete(_rqKey);
    }
  });
  app.get("/api/realtime-quiz/:sessionId/leaderboard", async (req, res) => {
    try {
      const session = rqSessions.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found." });
      res.json({ success: true, leaderboard: rqLeaderboard(session), status: session.status });
    } catch (err) {
      res.status(500).json({ error: "Failed to get leaderboard." });
    }
  });
  const classInviteCodes = /* @__PURE__ */ new Map();
  const classIdToCodes = /* @__PURE__ */ new Map();
  const generateInviteCode = (classId) => {
    if (classIdToCodes.has(classId)) return classIdToCodes.get(classId);
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    do {
      code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    } while (classInviteCodes.has(code));
    classInviteCodes.set(code, classId);
    classIdToCodes.set(classId, code);
    return code;
  };
  app.get("/api/teacher/classes/:classId/invite-code", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { classId } = req.params;
      const code = generateInviteCode(classId);
      const domain = process.env.REPLIT_DEV_DOMAIN || "";
      const link = domain ? `https://${domain}/student/join-class?code=${code}` : `/student/join-class?code=${code}`;
      res.json({ success: true, code, link });
    } catch {
      res.status(500).json({ error: "Failed to generate invite code." });
    }
  });
  app.get("/api/classes/invite/:code", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const code = String(req.params.code).toUpperCase().trim();
      const classId = classInviteCodes.get(code);
      if (!classId) return res.status(404).json({ error: "Invalid or expired invite code." });
      const { data: cls, error: clsErr } = await supabaseAdmin.from("classes").select("*").eq("id", classId).maybeSingle();
      if (clsErr || !cls) return res.status(404).json({ error: "Class not found." });
      const studentIds = Array.isArray(cls.student_ids) ? cls.student_ids : [];
      let courseName;
      if (cls.course_id) {
        const { data: course } = await supabaseAdmin.from("courses").select("title").eq("id", cls.course_id).maybeSingle();
        courseName = course?.title;
      }
      res.json({ success: true, class: {
        id: cls.id,
        name: cls.name,
        description: cls.description,
        status: cls.status,
        capacity: cls.capacity ?? 30,
        studentCount: studentIds.length,
        courseName
      } });
    } catch {
      res.status(500).json({ error: "Failed to look up class." });
    }
  });
  app.post("/api/student/classes/join-by-code", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Code is required." });
      const classId = classInviteCodes.get(String(code).toUpperCase().trim());
      if (!classId) return res.status(404).json({ error: "Invalid or expired invite code." });
      const { data: cls, error: clsErr } = await supabaseAdmin.from("classes").select("*").eq("id", classId).maybeSingle();
      if (clsErr || !cls) return res.status(404).json({ error: "Class not found." });
      const currentIds = Array.isArray(cls.student_ids) ? cls.student_ids : [];
      if (currentIds.includes(caller.userId)) return res.json({ success: true, message: "Already enrolled." });
      const { error: updateErr } = await supabaseAdmin.from("classes").update({ student_ids: [...currentIds, caller.userId] }).eq("id", classId);
      if (updateErr) throw updateErr;
      res.json({ success: true, message: "Joined class successfully." });
    } catch {
      res.status(500).json({ error: "Failed to join class." });
    }
  });
  app.get("/api/student/badges", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const earned = studentBadges.get(caller.userId) ?? /* @__PURE__ */ new Set();
      const badges = BADGE_DEFS.map((b) => ({ ...b, earned: earned.has(b.id), earnedAt: earned.has(b.id) ? (/* @__PURE__ */ new Date()).toISOString() : null }));
      res.json({ success: true, badges, earnedCount: earned.size, totalCount: BADGE_DEFS.length });
    } catch {
      res.status(500).json({ error: "Failed to get badges." });
    }
  });
  const addDiscussionNotification = async (userId, title, message, actionUrl) => {
    await notifInsert({
      user_id: userId,
      title,
      message: message.slice(0, 240),
      type: "info",
      action_url: actionUrl,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  };
  const resolveQuestionOrdering = (sort) => {
    if (sort === "helpful") return { col: "helpful_score", asc: false };
    if (sort === "recent") return { col: "last_activity_at", asc: false };
    return { col: "created_at", asc: false };
  };
  app.get("/api/student/community", async (_req, res) => {
    res.json({ success: true, posts: [], deprecated: true, message: "Use lesson discussion endpoints." });
  });
  const supabaseEnrichAuthors = async (rows) => {
    if (!rows.length) return rows;
    const missingIds = [...new Set(
      rows.filter((r) => !r?.author?.display_name).map((r) => String(r?.author_id || "")).filter(Boolean)
    )];
    if (!missingIds.length) return rows;
    try {
      const { data } = await supabaseAdmin.from("profiles").select("id, display_name, email").in("id", missingIds);
      if (!data?.length) return rows;
      const profileMap = new Map(data.map((p) => [String(p.id), p]));
      return rows.map((row) => {
        if (row?.author?.display_name) return row;
        const authorId = String(row?.author_id || "");
        if (!authorId) return row;
        const profile = profileMap.get(authorId);
        if (!profile) return row;
        return { ...row, author: { id: profile.id, display_name: profile.display_name, email: profile.email } };
      });
    } catch {
      return rows;
    }
  };
  const pgGetQuestion = async (questionId) => {
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
  const pgGetAnswer = async (answerId) => {
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
  const pgUpsertStats = async (userId, delta) => {
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
  app.get("/api/student/lessons/:lessonId/discussions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canUseDiscussion(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const lessonId = String(req.params.lessonId || "").trim();
      const q = String(req.query.q || "").trim().toLowerCase();
      const sort = String(req.query.sort || "recent").trim();
      const limit = Math.min(50, Math.max(1, asInt(req.query.limit, 20)));
      const cursor = String(req.query.cursor || "").trim();
      const order = resolveQuestionOrdering(sort);
      const orderDir = order.asc ? "ASC" : "DESC";
      const params = [lessonId, limit + 1];
      let cursorClause = "";
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
      let rows = result.rows;
      if (sort === "unanswered") rows = rows.filter((row) => asInt(row?.answers_count, 0) === 0);
      if (q) rows = rows.filter((row) => `${row?.title || ""} ${row?.body || ""}`.toLowerCase().includes(q));
      const hasMore = rows.length > limit;
      let pageRows = hasMore ? rows.slice(0, limit) : rows;
      pageRows = await supabaseEnrichAuthors(pageRows);
      const nextCursor = hasMore ? String(rows.slice(0, limit)[rows.slice(0, limit).length - 1]?.[order.col] || "") : null;
      res.json({ success: true, questions: pageRows, hasMore, nextCursor });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load lesson discussions" });
    }
  });
  app.post("/api/student/lessons/:lessonId/discussions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canUseDiscussion(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const lessonId = String(req.params.lessonId || "").trim();
      const title = String(req.body?.title || "").trim();
      const body = String(req.body?.body || "").trim();
      if (!lessonId || !title || !body) return res.status(400).json({ error: "lessonId, title, and body are required" });
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const r = await poolQuery(
        `INSERT INTO lesson_discussion_questions (lesson_id, author_id, title, body, is_pinned, created_at, updated_at, last_activity_at)
         VALUES ($1,$2,$3,$4,false,$5,$5,$5) RETURNING *`,
        [lessonId, caller.userId, title, body, now]
      );
      const question = await pgGetQuestion(String(r.rows[0]?.id || ""));
      res.json({ success: true, question: question || r.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to create question" });
    }
  });
  app.get("/api/student/discussions/questions/:questionId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || "").trim();
      const [question, answersRes] = await Promise.all([
        pgGetQuestion(questionId),
        poolQuery(
          `SELECT a.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
           FROM lesson_discussion_answers a
           LEFT JOIN profiles p ON p.id = a.author_id
           WHERE a.question_id = $1 AND a.deleted_at IS NULL
           ORDER BY a.is_best DESC, a.helpful_score DESC, a.created_at ASC`,
          [questionId]
        )
      ]);
      let answers = answersRes.rows;
      answers = await supabaseEnrichAuthors(answers);
      const answerIds = answers.map((a) => String(a.id)).filter(Boolean);
      let replies = [];
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
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load thread" });
    }
  });
  app.patch("/api/student/discussions/questions/:questionId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || "").trim();
      const current = await pgGetQuestion(questionId);
      if (!current) return res.status(404).json({ error: "Question not found" });
      if (String(current.author_id || "") !== caller.userId && !canModerateDiscussion(caller.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const sets = ["updated_at = now()"];
      const params = [];
      if (typeof req.body?.title === "string") {
        params.push(String(req.body.title).trim());
        sets.push(`title = $${params.length}`);
      }
      if (typeof req.body?.body === "string") {
        params.push(String(req.body.body).trim());
        sets.push(`body = $${params.length}`);
      }
      params.push(questionId);
      await poolQuery(`UPDATE lesson_discussion_questions SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
      const question = await pgGetQuestion(questionId);
      res.json({ success: true, question });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to update question" });
    }
  });
  app.delete("/api/student/discussions/questions/:questionId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || "").trim();
      const current = await poolQuery(`SELECT id, author_id FROM lesson_discussion_questions WHERE id = $1`, [questionId]);
      const row = current.rows[0];
      if (!row) return res.status(404).json({ error: "Question not found" });
      if (String(row.author_id || "") !== caller.userId && !canModerateDiscussion(caller.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await poolQuery(`UPDATE lesson_discussion_questions SET deleted_at = now(), updated_at = now() WHERE id = $1`, [questionId]);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to delete question" });
    }
  });
  app.post("/api/student/discussions/questions/:questionId/answers", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const questionId = String(req.params.questionId || "").trim();
      const body = String(req.body?.body || "").trim();
      if (!body) return res.status(400).json({ error: "body is required" });
      const qRes = await poolQuery(`SELECT id, author_id, answers_count FROM lesson_discussion_questions WHERE id = $1`, [questionId]);
      const question = qRes.rows[0];
      const aRes = await poolQuery(
        `INSERT INTO lesson_discussion_answers (question_id, author_id, body, created_at, updated_at)
         VALUES ($1,$2,$3,now(),now()) RETURNING *`,
        [questionId, caller.userId, body]
      );
      const answer = await pgGetAnswer(String(aRes.rows[0]?.id || ""));
      await poolQuery(
        `UPDATE lesson_discussion_questions SET answers_count = answers_count + 1, last_activity_at = now(), updated_at = now() WHERE id = $1`,
        [questionId]
      );
      await pgUpsertStats(caller.userId, { answers: 1, reputation: 2 });
      if (question && String(question.author_id || "") && String(question.author_id || "") !== caller.userId) {
        await addDiscussionNotification(String(question.author_id || ""), "New answer to your question", body, `/student/community?question=${questionId}`);
      }
      await awardDiscussionBadges(caller.userId);
      res.json({ success: true, answer: answer || aRes.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to add answer" });
    }
  });
  app.post("/api/student/discussions/answers/:answerId/replies", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const answerId = String(req.params.answerId || "").trim();
      const body = String(req.body?.body || "").trim();
      const parentReplyId = req.body?.parent_reply_id ? String(req.body.parent_reply_id).trim() : null;
      if (!body) return res.status(400).json({ error: "body is required" });
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
      const fullReply = await poolQuery(
        `SELECT r.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS author
         FROM lesson_discussion_replies r LEFT JOIN profiles p ON p.id = r.author_id WHERE r.id = $1`,
        [String(replyRow?.id || "")]
      );
      await poolQuery(`UPDATE lesson_discussion_answers SET replies_count = replies_count + 1, updated_at = now() WHERE id = $1`, [answerId]);
      if (answer && String(answer.author_id || "") && String(answer.author_id || "") !== caller.userId) {
        await addDiscussionNotification(String(answer.author_id || ""), "New reply to your answer", body, `/student/community?question=${String(answer.question_id || "")}`);
      }
      res.json({ success: true, reply: fullReply.rows[0] || replyRow });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to add reply" });
    }
  });
  app.post("/api/teacher/discussions/questions/:questionId/best-answer/:answerId", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canMarkBestAnswer(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const questionId = String(req.params.questionId || "").trim();
      const answerId = String(req.params.answerId || "").trim();
      await poolQuery(`UPDATE lesson_discussion_answers SET is_best = false, updated_at = now() WHERE question_id = $1`, [questionId]);
      await poolQuery(`UPDATE lesson_discussion_answers SET is_best = true, updated_at = now() WHERE id = $1`, [answerId]);
      const answerRow = await poolQuery(`SELECT id, author_id FROM lesson_discussion_answers WHERE id = $1`, [answerId]);
      await poolQuery(`UPDATE lesson_discussion_questions SET best_answer_id = $1, updated_at = now() WHERE id = $2`, [answerId, questionId]);
      const question = await pgGetQuestion(questionId);
      const answerAuthorId = String(answerRow.rows[0]?.author_id || "");
      if (answerAuthorId) {
        await pgUpsertStats(answerAuthorId, { best_answers: 1, reputation: 10 });
        await awardDiscussionBadges(answerAuthorId);
      }
      res.json({ success: true, question });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to mark best answer" });
    }
  });
  app.post("/api/teacher/discussions/questions/:questionId/pin", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canModerateDiscussion(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const questionId = String(req.params.questionId || "").trim();
      const isPinned = Boolean(req.body?.is_pinned ?? true);
      await poolQuery(`UPDATE lesson_discussion_questions SET is_pinned = $1, updated_at = now() WHERE id = $2`, [isPinned, questionId]);
      const question = await pgGetQuestion(questionId);
      res.json({ success: true, question });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to pin question" });
    }
  });
  app.post("/api/student/discussions/reactions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const targetType = String(req.body?.target_type || "").trim();
      const targetId = String(req.body?.target_id || "").trim();
      const reactionType = String(req.body?.reaction_type || "like").trim();
      if (!targetType || !targetId) return res.status(400).json({ error: "target_type and target_id are required" });
      const r = await poolQuery(
        `INSERT INTO lesson_discussion_reactions (user_id, target_type, target_id, reaction_type)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
        [caller.userId, targetType, targetId, reactionType]
      );
      res.json({ success: true, reaction: r.rows[0] || null });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to add reaction" });
    }
  });
  app.delete("/api/student/discussions/reactions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const targetType = String(req.body?.target_type || "").trim();
      const targetId = String(req.body?.target_id || "").trim();
      const reactionType = String(req.body?.reaction_type || "like").trim();
      await poolQuery(
        `DELETE FROM lesson_discussion_reactions WHERE user_id=$1 AND target_type=$2 AND target_id=$3 AND reaction_type=$4`,
        [caller.userId, targetType, targetId, reactionType]
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to remove reaction" });
    }
  });
  app.post("/api/student/discussions/reports", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const targetType = String(req.body?.target_type || "").trim();
      const targetId = String(req.body?.target_id || "").trim();
      const reason = String(req.body?.reason || "").trim();
      const details = req.body?.details ? String(req.body.details) : null;
      if (!targetType || !targetId || !reason) return res.status(400).json({ error: "target_type, target_id and reason are required" });
      const r = await poolQuery(
        `INSERT INTO lesson_discussion_reports (reporter_id, target_type, target_id, reason, details, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'open',now(),now()) RETURNING *`,
        [caller.userId, targetType, targetId, reason, details]
      );
      res.json({ success: true, report: r.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to submit report" });
    }
  });
  app.get("/api/teacher/discussions/reports", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canModerateDiscussion(caller.role)) return res.status(403).json({ error: "Forbidden" });
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
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load reports" });
    }
  });
  app.post("/api/teacher/discussions/moderate", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (!canModerateDiscussion(caller.role)) return res.status(403).json({ error: "Forbidden" });
      const targetType = String(req.body?.target_type || "").trim();
      const targetId = String(req.body?.target_id || "").trim();
      const actionType = String(req.body?.action_type || "").trim();
      const reason = req.body?.reason ? String(req.body.reason) : null;
      if (!targetType || !targetId || !actionType) return res.status(400).json({ error: "target_type, target_id, action_type are required" });
      const deletedAt = actionType === "restore" ? null : (/* @__PURE__ */ new Date()).toISOString();
      if (targetType === "question") {
        await poolQuery(`UPDATE lesson_discussion_questions SET deleted_at=$1, is_locked=$2, updated_at=now() WHERE id=$3`, [deletedAt, actionType === "lock", targetId]);
      } else if (targetType === "answer") {
        await poolQuery(`UPDATE lesson_discussion_answers SET deleted_at=$1, updated_at=now() WHERE id=$2`, [deletedAt, targetId]);
      } else if (targetType === "reply") {
        await poolQuery(`UPDATE lesson_discussion_replies SET deleted_at=$1, updated_at=now() WHERE id=$2`, [deletedAt, targetId]);
      }
      await poolQuery(
        `INSERT INTO discussion_moderation_actions (actor_id, target_type, target_id, action_type, reason, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [caller.userId, targetType, targetId, actionType, reason, JSON.stringify(req.body?.metadata || {})]
      ).catch(() => {
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to moderate content" });
    }
  });
  app.get("/api/admin/discussions/moderation", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden: admin role required" });
      const r = await poolQuery(
        `SELECT ma.*, json_build_object('id',p.id,'display_name',p.display_name,'email',p.email) AS actor
         FROM discussion_moderation_actions ma
         LEFT JOIN profiles p ON p.id = ma.actor_id
         ORDER BY ma.created_at DESC LIMIT 200`
      );
      res.json({ success: true, actions: r.rows });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load moderation actions" });
    }
  });
  app.get("/api/student/discussions/me/stats", async (req, res) => {
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
        )
      ]);
      res.json({ success: true, stats: statsRes.rows[0] || null, badges: badgesRes.rows });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to load discussion stats" });
    }
  });
  app.get("/api/admin/modules", async (req, res) => {
    try {
      const [modulesSnap, coursesSnap, teachersSnap] = await Promise.all([
        supabaseAdmin.from("modules").select("*").order("order", { ascending: true }),
        supabaseAdmin.from("courses").select("id, title, teacher_id"),
        supabaseAdmin.from("teachers").select("user_id, first_name, last_name")
      ]);
      if (modulesSnap.error) throw modulesSnap.error;
      if (coursesSnap.error) throw coursesSnap.error;
      if (teachersSnap.error) throw teachersSnap.error;
      let lessonsSnap = await supabaseAdmin.from("lessons").select("*").order("order", { ascending: true });
      if (lessonsSnap.error) {
        lessonsSnap = await supabaseAdmin.from("lessons").select("*").order("created_at", { ascending: true });
      }
      if (lessonsSnap.error) throw lessonsSnap.error;
      res.json({
        success: true,
        modules: modulesSnap.data || [],
        courses: coursesSnap.data || [],
        teachers: teachersSnap.data || [],
        lessons: lessonsSnap.data || []
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/modules", async (req, res) => {
    try {
      const payload = {
        ...req.body,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data, error } = await supabaseAdmin.from("modules").insert(payload).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/admin/modules/:id", async (req, res) => {
    try {
      const payload = {
        ...req.body,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data, error } = await supabaseAdmin.from("modules").update(payload).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json({ success: true, module: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/admin/modules/:id", async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("modules").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/lessons", async (req, res) => {
    try {
      const { title, short_description, course_id, module_id, type, duration_minutes, status, is_free_preview, slug, order } = req.body || {};
      if (!course_id || !module_id || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "course_id, module_id and title are required" });
      }
      const slugFinal = typeof slug === "string" && slug.trim() ? slug.trim() : title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const payload = {
        title: title.trim(),
        short_description: short_description ?? null,
        course_id: String(course_id),
        module_id: String(module_id),
        type: type || "video",
        duration_minutes: Number(duration_minutes) || 0,
        status: status || "published",
        is_free_preview: Boolean(is_free_preview),
        slug: slugFinal,
        order: Number(order) || 1,
        created_at: now,
        updated_at: now
      };
      const { data, error } = await supabaseAdmin.from("lessons").insert(payload).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" \u2014 ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/admin/lessons/:id", async (req, res) => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!id) return res.status(400).json({ error: "Lesson id is required" });
      const { title, short_description, course_id, module_id, type, duration_minutes, status, is_free_preview, order } = req.body || {};
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (typeof title === "string") updates.title = title.trim();
      if (short_description !== void 0) updates.short_description = short_description;
      if (course_id !== void 0) updates.course_id = String(course_id);
      if (module_id !== void 0) updates.module_id = String(module_id);
      if (type !== void 0) updates.type = type;
      if (duration_minutes !== void 0) updates.duration_minutes = Number(duration_minutes) || 0;
      if (status !== void 0) updates.status = status;
      if (is_free_preview !== void 0) updates.is_free_preview = Boolean(is_free_preview);
      if (order !== void 0) updates.order = Number(order) || 1;
      const { data, error } = await supabaseAdmin.from("lessons").update(updates).eq("id", id).select().single();
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" \u2014 ") || error.code || "Database error";
        return res.status(400).json({ error: msg, code: error.code });
      }
      res.json({ success: true, lesson: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/admin/lessons/:id", async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("lessons").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  const sendAnnouncementNotifications = async ({
    title,
    content,
    priority,
    audience,
    classIds,
    studentIds,
    sendEmail: shouldSendEmail = false
  }) => {
    const recipientIds = /* @__PURE__ */ new Set();
    studentIds.forEach((sid) => recipientIds.add(sid));
    for (const cid of classIds) {
      const { data: classRow } = await supabaseAdmin.from("classes").select("student_ids").eq("id", cid).maybeSingle();
      (classRow?.student_ids || []).forEach((uid) => recipientIds.add(String(uid)));
    }
    let profilesById = /* @__PURE__ */ new Map();
    if (recipientIds.size > 0) {
      const { data: invitedProfiles } = await supabaseAdmin.from("profiles").select("id, role, email, display_name").in("id", [...recipientIds]);
      profilesById = new Map((invitedProfiles || []).map((p) => [
        String(p.id),
        { role: String(p.role || "").toLowerCase(), email: String(p.email || ""), name: String(p.display_name || p.email || "") }
      ]));
    } else {
      const normalizedAudience = String(audience || "all").toLowerCase();
      const targetRoles = normalizedAudience === "students" ? ["student"] : normalizedAudience === "teachers" ? ["teacher"] : ["student", "teacher"];
      const { data: audienceProfiles } = await supabaseAdmin.from("profiles").select("id, role, email, display_name").in("role", targetRoles);
      profilesById = new Map((audienceProfiles || []).map((p) => [
        String(p.id),
        { role: String(p.role || "").toLowerCase(), email: String(p.email || ""), name: String(p.display_name || p.email || "") }
      ]));
      profilesById.forEach((_, uid) => recipientIds.add(uid));
    }
    if (recipientIds.size === 0) return 0;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const notifRows = [...recipientIds].map((uid) => {
      const profile = profilesById.get(uid);
      const role = profile?.role || "student";
      const actionUrl = role === "teacher" ? "/teacher/announcements" : role === "admin" ? "/admin/announcements" : "/student";
      return {
        user_id: uid,
        title: `Announcement: ${String(title || "New announcement")}`,
        message: String(content || "").slice(0, 240),
        type: priority === "urgent" ? "warning" : "info",
        action_url: actionUrl,
        created_at: createdAt
      };
    });
    await notifInsert(notifRows);
    if (shouldSendEmail) {
      try {
        if (isEmailConfigured()) {
          const shortContent = String(content || "").slice(0, 800);
          const emailSubject = `\u{1F4E2} ${String(title || "New Announcement")}`;
          const htmlContent = `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 28px;">
<div style="font-size:22px;margin-bottom:4px;">\u{1F4E2}</div>
<h1 style="margin:0;font-size:20px;color:#ffffff;font-weight:700;">${String(title || "New Announcement")}</h1>
<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">${priority === "urgent" ? "\u{1F6A8} Urgent" : priority === "important" ? "\u26A0\uFE0F Important" : "\u{1F4CC} Notice"}</div>
</td></tr>
<tr><td style="padding:24px 28px;">
<div style="font-size:14px;line-height:1.7;color:#475569;white-space:pre-wrap;">${shortContent}</div>
</td></tr>
<tr><td style="padding:12px 28px 24px;border-top:1px solid #f1f5f9;">
<div style="font-size:11px;color:#94a3b8;">This announcement was sent via QuizMaster. You received it because you are a member of this platform.</div>
</td></tr>
</table></td></tr></table>
</body></html>`;
          const textContent = `${String(title || "New Announcement")}

${shortContent}`;
          const recipients = [...recipientIds].map((uid) => profilesById.get(uid)).filter((p) => !!p?.email);
          const emailPromises = recipients.map(
            (p) => sendEmail({ to: p.email, toName: p.name, subject: emailSubject, htmlContent, textContent }).catch(() => null)
          );
          await Promise.allSettled(emailPromises);
        }
      } catch (emailErr) {
        console.warn("[announcements] Email sending skipped:", emailErr);
      }
    }
    return recipientIds.size;
  };
  app.get("/api/student/announcements", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { data: classRows } = await supabaseAdmin.from("classes").select("id").contains("student_ids", [caller.userId]);
      const myClassIds = (classRows || []).map((c) => c.id);
      let query = supabaseAdmin.from("announcements").select("*, author:profiles!author_id(id,display_name,email)").eq("status", "published").in("target_audience", ["all", "students"]).order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      const now = /* @__PURE__ */ new Date();
      const visible = (data || []).filter((a) => {
        if (a.expires_at && new Date(a.expires_at) < now) return false;
        return true;
      });
      res.json({ success: true, announcements: visible, classIds: myClassIds });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/student/announcements/unread-count", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const { count, error } = await supabaseAdmin.from("announcements").select("id", { count: "exact", head: true }).eq("status", "published").in("target_audience", ["all", "students"]).or(`expires_at.is.null,expires_at.gt.${now}`);
      if (error) throw error;
      res.json({ success: true, count: count ?? 0 });
    } catch (e) {
      res.json({ success: false, count: 0 });
    }
  });
  app.get("/api/admin/announcements", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("announcements").select("*, author:profiles!author_id(id,display_name,email)").order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ success: true, announcements: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  const annInsert = async (payload) => {
    const r = await supabaseAdmin.from("announcements").insert(payload).select().single();
    if (r.error && /schema cache|column/i.test(r.error.message)) {
      const { ann_type, scheduled_at, ...safe } = payload;
      return supabaseAdmin.from("announcements").insert(safe).select().single();
    }
    return r;
  };
  const annUpdate = async (id, payload) => {
    const r = await supabaseAdmin.from("announcements").update(payload).eq("id", id).select().single();
    if (r.error && /schema cache|column/i.test(r.error.message)) {
      const { ann_type, scheduled_at, ...safe } = payload;
      return supabaseAdmin.from("announcements").update(safe).eq("id", id).select().single();
    }
    return r;
  };
  app.post("/api/admin/announcements", async (req, res) => {
    try {
      const { class_ids, student_ids, send_email, ...body } = req.body || {};
      const payload = {
        ...body,
        published_at: body.status === "published" ? (/* @__PURE__ */ new Date()).toISOString() : null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data, error } = await annInsert(payload);
      if (error) throw error;
      if (body.status === "published") {
        const classIds = Array.isArray(class_ids) ? class_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        const studentIds = Array.isArray(student_ids) ? student_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        await sendAnnouncementNotifications({
          title: String(body.title || ""),
          content: String(body.content || ""),
          priority: String(body.priority || "normal"),
          audience: String(body.target_audience || "all"),
          classIds,
          studentIds,
          sendEmail: Boolean(send_email)
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/admin/announcements/:id", async (req, res) => {
    try {
      const { class_ids, student_ids, send_email, ...body } = req.body || {};
      const payload = {
        ...body,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        ...body.status === "published" ? { published_at: (/* @__PURE__ */ new Date()).toISOString() } : {}
      };
      const { data, error } = await annUpdate(req.params.id, payload);
      if (error) throw error;
      if (body.status === "published") {
        const classIds = Array.isArray(class_ids) ? class_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        const studentIds = Array.isArray(student_ids) ? student_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        await sendAnnouncementNotifications({
          title: String((body.title ?? data?.title) || ""),
          content: String((body.content ?? data?.content) || ""),
          priority: String((body.priority ?? data?.priority) || "normal"),
          audience: String((body.target_audience ?? data?.target_audience) || "all"),
          classIds,
          studentIds,
          sendEmail: Boolean(send_email)
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/admin/announcements/:id", async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from("announcements").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/admin/brevo/status", async (_req, res) => {
    const configured = isEmailConfigured();
    if (!configured) {
      return res.json({ configured: false, connected: false, reason: "BREVO_API_KEY, BREVO_SENDER_EMAIL or BREVO_SENDER_NAME is missing from environment secrets." });
    }
    try {
      const apiKey = process.env.BREVO_API_KEY || "";
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": apiKey, "accept": "application/json" }
      });
      const json = await r.json();
      if (!r.ok) {
        return res.json({ configured: true, connected: false, reason: json?.message || `Brevo returned ${r.status}` });
      }
      const senderEmail = process.env.BREVO_SENDER_EMAIL || "";
      const senderName = process.env.BREVO_SENDER_NAME || "";
      res.json({ configured: true, connected: true, email: json?.email, plan: json?.plan?.[0]?.title, senderEmail, senderName });
    } catch (e) {
      res.json({ configured: true, connected: false, reason: e.message });
    }
  });
  app.post("/api/admin/announcements/:id/resend", async (req, res) => {
    try {
      const { data: ann, error } = await supabaseAdmin.from("announcements").select("*").eq("id", req.params.id).maybeSingle();
      if (error) throw error;
      if (!ann) return res.status(404).json({ error: "Announcement not found" });
      const count = await sendAnnouncementNotifications({
        title: String(ann.title || ""),
        content: String(ann.content || ""),
        priority: String(ann.priority || "normal"),
        audience: String(ann.target_audience || "all"),
        classIds: [],
        studentIds: []
      });
      res.json({ success: true, count });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/announcements", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { data, error } = await supabaseAdmin.from("announcements").select("*, author:profiles!author_id(id,display_name,email)").order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ success: true, announcements: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/announcements", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { class_ids, student_ids, send_email, ...body } = req.body || {};
      const payload = {
        ...body,
        author_id: body.author_id || caller.userId,
        published_at: body.status === "published" ? (/* @__PURE__ */ new Date()).toISOString() : null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data, error } = await annInsert(payload);
      if (error) throw error;
      if (body.status === "published") {
        const classIds = Array.isArray(class_ids) ? class_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        const studentIds = Array.isArray(student_ids) ? student_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        await sendAnnouncementNotifications({
          title: String(body.title || ""),
          content: String(body.content || ""),
          priority: String(body.priority || "normal"),
          audience: String(body.target_audience || "all"),
          classIds,
          studentIds,
          sendEmail: Boolean(send_email)
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/teacher/announcements/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { class_ids, student_ids, send_email, ...body } = req.body || {};
      const payload = {
        ...body,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        ...body.status === "published" ? { published_at: (/* @__PURE__ */ new Date()).toISOString() } : {}
      };
      const { data, error } = await annUpdate(req.params.id, payload);
      if (error) throw error;
      if (body.status === "published") {
        const classIds = Array.isArray(class_ids) ? class_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        const studentIds = Array.isArray(student_ids) ? student_ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
        await sendAnnouncementNotifications({
          title: String((body.title ?? data?.title) || ""),
          content: String((body.content ?? data?.content) || ""),
          priority: String((body.priority ?? data?.priority) || "normal"),
          audience: String((body.target_audience ?? data?.target_audience) || "all"),
          classIds,
          studentIds,
          sendEmail: Boolean(send_email)
        });
      }
      res.json({ success: true, announcement: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/teacher/announcements/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { error } = await supabaseAdmin.from("announcements").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/announcements/:id/resend", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { data: ann, error } = await supabaseAdmin.from("announcements").select("*").eq("id", req.params.id).maybeSingle();
      if (error) throw error;
      if (!ann) return res.status(404).json({ error: "Announcement not found" });
      const count = await sendAnnouncementNotifications({
        title: String(ann.title || ""),
        content: String(ann.content || ""),
        priority: String(ann.priority || "normal"),
        audience: String(ann.target_audience || "all"),
        classIds: [],
        studentIds: [],
        sendEmail: false
      });
      res.json({ success: true, count });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/brevo/status", async (_req, res) => {
    const configured = isEmailConfigured();
    if (!configured) return res.json({ configured: false, connected: false, reason: "BREVO_API_KEY, BREVO_SENDER_EMAIL or BREVO_SENDER_NAME is missing." });
    try {
      const apiKey = process.env.BREVO_API_KEY || "";
      const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": apiKey, "accept": "application/json" } });
      const json = await r.json();
      if (!r.ok) return res.json({ configured: true, connected: false, reason: json?.message || `Brevo returned ${r.status}` });
      res.json({ configured: true, connected: true, email: json?.email, plan: json?.plan?.[0]?.title, senderEmail: process.env.BREVO_SENDER_EMAIL || "", senderName: process.env.BREVO_SENDER_NAME || "" });
    } catch (e) {
      res.json({ configured: true, connected: false, reason: e.message });
    }
  });
  app.post("/api/teacher/students/:studentId/reset-password", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const studentId = String(req.params.studentId || "").trim();
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : "";
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      const { data: student, error: sErr } = await supabaseAdmin.from("profiles").select("id, role, teacher_id, display_name, email").eq("id", studentId).maybeSingle();
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
    } catch (e) {
      console.error("POST /api/teacher/students/:studentId/reset-password", e);
      return res.status(500).json({ error: e?.message || "Failed to reset password" });
    }
  });
  app.get("/api/teacher/students/:studentId/detail", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const studentId = String(req.params.studentId || "").trim();
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      const { data: profile, error: pErr } = await supabaseAdmin.from("profiles").select("id,display_name,email,role,status,teacher_id,created_at").eq("id", studentId).maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return res.status(404).json({ error: "Student not found" });
      if (profile.role !== "student") return res.status(400).json({ error: "Target user is not a student" });
      if (caller.role === "teacher") {
        const teacherIds = await getTeacherIdCandidates(caller.userId);
        const scopedIds = teacherIds.length > 0 ? teacherIds : [caller.userId];
        const isLinked = scopedIds.includes(String(profile.teacher_id || ""));
        if (!isLinked) {
          const courseRowsCk = await fetchTeacherCourseRows(scopedIds, true);
          const studentInCourse = courseRowsCk.some(
            (c) => Array.isArray(c.student_ids) && c.student_ids.map(String).includes(studentId)
          );
          const classRowsCk = await supabaseAdmin.from("classes").select("student_ids").in("teacher_id", scopedIds);
          const studentInClass = (classRowsCk.data || []).some(
            (cl) => Array.isArray(cl.student_ids) && cl.student_ids.map(String).includes(studentId)
          );
          if (!studentInCourse && !studentInClass) {
            return res.status(403).json({ error: "Forbidden: student is not linked to your account" });
          }
        }
      }
      const courseRowsRes = await supabaseAdmin.from("courses").select("id,title,student_ids").not("student_ids", "is", null);
      const allCourses = courseRowsRes.data || [];
      const enrolledCourses = allCourses.filter((c) => Array.isArray(c.student_ids) && c.student_ids.map(String).includes(studentId)).map((c) => ({ id: String(c.id), title: String(c.title || "Untitled"), role: "student" }));
      const teacherIds2 = caller.role === "teacher" ? await getTeacherIdCandidates(caller.userId).then((ids) => ids.length > 0 ? ids : [caller.userId]) : null;
      const teacherCourseIds = teacherIds2 ? (await fetchTeacherCourseRows(teacherIds2)).map((c) => String(c.id || "")).filter(Boolean) : [];
      let quizRows = [];
      if (teacherCourseIds.length > 0) {
        const quizzesRes = await supabaseAdmin.from("quizzes").select("id,title,course_id,settings,passing_score,pass_mark").in("course_id", teacherCourseIds);
        if (!quizzesRes.error) quizRows = quizzesRes.data || [];
      }
      const quizIds = new Set(quizRows.map((q) => String(q.id || "")).filter(Boolean));
      const passingScoreByQuiz = quizRows.reduce((acc, q) => {
        const raw = q?.settings?.passingScore ?? q?.passing_score ?? q?.pass_mark;
        acc[String(q.id)] = Number.isFinite(Number(raw)) ? Number(raw) : 50;
        return acc;
      }, {});
      const attemptRows = normalizeAttempts(
        await fetchFilteredAttemptRows({ quizIds, studentIds: /* @__PURE__ */ new Set([studentId]) }),
        passingScoreByQuiz
      ).filter((a) => String(a.student_id || "") === studentId && quizIds.has(String(a.quiz_id || "")));
      const attempts = attemptRows.length;
      const passed = attemptRows.filter((a) => a.passed).length;
      const failed = attempts - passed;
      const scoreSum = attemptRows.reduce((s, a) => s + (Number(a.score_percent) || 0), 0);
      const avgScore = attempts > 0 ? Math.round(scoreSum / attempts) : 0;
      const passRate = attempts > 0 ? Math.round(passed / attempts * 100) : 0;
      const sorted = [...attemptRows].sort(
        (a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime()
      );
      const lastAttemptDate = sorted[0]?.completed_at || null;
      const quizHistory = sorted.map((a) => {
        const quiz = quizRows.find((q) => String(q.id || "") === String(a.quiz_id || ""));
        return {
          quizId: String(a.quiz_id || ""),
          quizTitle: quiz?.title || "Quiz",
          score: Math.round(Number(a.score_percent) || 0),
          passed: Boolean(a.passed),
          completedAt: a.completed_at || null
        };
      });
      const now = Date.now();
      const weeklyActivity = Array.from({ length: 7 }).map((_, i) => {
        const day = new Date(now - (6 - i) * 864e5);
        const label = day.toLocaleDateString("en-US", { weekday: "short" });
        const dayStr = day.toISOString().slice(0, 10);
        const dayAttempts = attemptRows.filter((a) => {
          const d = a.completed_at ? new Date(a.completed_at).toISOString().slice(0, 10) : "";
          return d === dayStr;
        });
        const dayAvg = dayAttempts.length > 0 ? Math.round(dayAttempts.reduce((s, a) => s + (Number(a.score_percent) || 0), 0) / dayAttempts.length) : 0;
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
          weeklyActivity
        }
      });
    } catch (e) {
      console.error("GET /api/teacher/students/:studentId/detail", e);
      return res.status(500).json({ error: e?.message || "Failed to load student details" });
    }
  });
  app.get("/api/student/assignments", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "student" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { data: profile } = await supabaseAdmin.from("profiles").select("teacher_id").eq("id", caller.userId).maybeSingle();
      const teacherId = profile?.teacher_id || null;
      console.log(`[student/assignments] student=${caller.userId} teacher_id=${teacherId}`);
      if (!teacherId) {
        console.log("[student/assignments] no teacher_id on profile \u2014 returning empty");
        return res.json({ success: true, assignments: [] });
      }
      let teacherIds = [teacherId];
      try {
        const candidates = await getTeacherIdCandidates(teacherId);
        if (candidates.length > 0) teacherIds = candidates;
      } catch {
      }
      console.log(`[student/assignments] querying teacher_ids=${JSON.stringify(teacherIds)}`);
      let assignments = [];
      try {
        const countResult = await poolQuery(
          `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='published') AS published FROM public.assignments WHERE teacher_id = ANY($1::uuid[])`,
          [teacherIds]
        );
        const { total, published } = countResult.rows[0] || {};
        console.log(`[student/assignments] teacher has ${total} total assignments, ${published} published`);
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
          const result = await poolQuery(
            `SELECT a.* FROM public.assignments a
             WHERE a.teacher_id = ANY($1::uuid[])
               AND a.status = 'published'
             ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
            [teacherIds]
          );
          assignments = result.rows.map((r) => ({ ...r, course_title: "" }));
        }
        console.log(`[student/assignments] returning ${assignments.length} assignments (join=${didJoin})`);
      } catch (sqlErr) {
        console.warn("[student/assignments] poolQuery failed entirely:", sqlErr?.message);
        try {
          const { data, error } = await supabaseAdmin.from("assignments").select("*").eq("status", "published").order("created_at", { ascending: false });
          if (error) throw error;
          const filtered = (data || []).filter(
            (a) => a.teacher_id && teacherIds.includes(String(a.teacher_id))
          );
          assignments = filtered.map((a) => ({ ...a, course_title: "" }));
          console.log(`[student/assignments] supabaseAdmin fallback: ${assignments.length} of ${data?.length || 0}`);
        } catch (fbErr) {
          console.error("[student/assignments] all methods failed:", fbErr?.message);
        }
      }
      return res.json({ success: true, assignments });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/student/assignments/:assignmentId/submission", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const result = await poolQuery(
        `SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 LIMIT 1`,
        [assignmentId, caller.userId]
      );
      res.json({ success: true, submission: result.rows[0] || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/student/assignments/:assignmentId/submit", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const { content, file_urls, link_urls } = req.body;
      let assignment = null;
      try {
        const r = await poolQuery(
          `SELECT id, due_date, allow_late_submission, status FROM assignments WHERE id=$1`,
          [assignmentId]
        );
        if (r.rows[0]) assignment = r.rows[0];
      } catch {
        const { data: aFull } = await supabaseAdmin.from("assignments").select("id, due_date, allow_late_submission, status").eq("id", assignmentId).maybeSingle();
        if (aFull) assignment = aFull;
        else {
          const { data: aBasic } = await supabaseAdmin.from("assignments").select("id, due_date, status").eq("id", assignmentId).maybeSingle();
          if (aBasic) assignment = { ...aBasic, allow_late_submission: false };
        }
      }
      if (!assignment || assignment.status !== "published") {
        return res.status(400).json({ error: "Assignment not available" });
      }
      const isLate = assignment.due_date ? /* @__PURE__ */ new Date() > new Date(assignment.due_date) : false;
      if (isLate && !assignment.allow_late_submission) {
        return res.status(400).json({ error: "Deadline has passed and late submissions are not allowed" });
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const fileUrlsJson = JSON.stringify(Array.isArray(file_urls) ? file_urls : []);
      const linkUrlsJson = JSON.stringify(Array.isArray(link_urls) ? link_urls : []);
      let existingId = null;
      try {
        const r = await poolQuery(
          `SELECT id FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 LIMIT 1`,
          [assignmentId, caller.userId]
        );
        existingId = r.rows[0]?.id || null;
      } catch {
        existingId = null;
      }
      let rowData;
      try {
        if (existingId) {
          const r = await poolQuery(
            `UPDATE assignment_submissions
             SET content=$1, file_urls=$2::jsonb, link_urls=$3::jsonb,
                 status='submitted', is_late=$4, submitted_at=$5, updated_at=$5,
                 draft_content=NULL, draft_file_urls='[]'::jsonb, draft_link_urls='[]'::jsonb
             WHERE id=$6
             RETURNING *`,
            [content || "", fileUrlsJson, linkUrlsJson, isLate, now, existingId]
          );
          rowData = r.rows[0];
        } else {
          const r = await poolQuery(
            `INSERT INTO assignment_submissions
               (assignment_id, student_id, content, file_urls, link_urls, status, is_late, submitted_at, created_at, updated_at)
             VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,'submitted',$6,$7,$7,$7)
             RETURNING *`,
            [assignmentId, caller.userId, content || "", fileUrlsJson, linkUrlsJson, isLate, now]
          );
          rowData = r.rows[0];
        }
      } catch (sqlErr) {
        if (existingId) {
          const r = await poolQuery(
            `UPDATE assignment_submissions SET content=$1, status='submitted', is_late=$2, submitted_at=$3, updated_at=$3 WHERE id=$4 RETURNING *`,
            [content || "", isLate, now, existingId]
          );
          rowData = r.rows[0];
        } else {
          const r = await poolQuery(
            `INSERT INTO assignment_submissions (assignment_id, student_id, content, status, is_late, submitted_at, created_at, updated_at)
             VALUES ($1,$2,$3,'submitted',$4,$5,$5,$5) RETURNING *`,
            [assignmentId, caller.userId, content || "", isLate, now]
          );
          rowData = r.rows[0];
        }
      }
      return res.json({ success: true, submission: rowData });
    } catch (e) {
      console.error("POST /api/student/assignments/:id/submit", e.message);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/student/assignments/:assignmentId/save-draft", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const { draft_content, draft_file_urls, draft_link_urls } = req.body;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const dfJson = JSON.stringify(Array.isArray(draft_file_urls) ? draft_file_urls : []);
      const dlJson = JSON.stringify(Array.isArray(draft_link_urls) ? draft_link_urls : []);
      const exRes = await poolQuery(
        `SELECT id, status FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 LIMIT 1`,
        [assignmentId, caller.userId]
      );
      const ex = exRes.rows[0];
      if (!ex) {
        await poolQuery(
          `INSERT INTO assignment_submissions
             (assignment_id, student_id, content, status, draft_content, draft_file_urls, draft_link_urls, draft_saved_at, submitted_at, created_at, updated_at)
           VALUES ($1,$2,'','draft',$3,$4::jsonb,$5::jsonb,$6,$6,$6,$6)`,
          [assignmentId, caller.userId, draft_content || "", dfJson, dlJson, now]
        );
      } else if (ex.status !== "submitted") {
        await poolQuery(
          `UPDATE assignment_submissions SET draft_content=$1, draft_file_urls=$2::jsonb, draft_link_urls=$3::jsonb, draft_saved_at=$4, updated_at=$4 WHERE id=$5`,
          [draft_content || "", dfJson, dlJson, now, ex.id]
        );
      }
      return res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/assignments/trigger-autopublish", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      await runAutoPublishAssignments();
      return res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/assignments", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      let scopedIds = [caller.userId];
      try {
        const teacherIds = await getTeacherIdCandidates(caller.userId);
        if (teacherIds.length > 0) scopedIds = teacherIds;
      } catch {
      }
      try {
        const result = caller.role === "teacher" ? await poolQuery(
          `SELECT * FROM assignments WHERE teacher_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
          [scopedIds]
        ) : await poolQuery(`SELECT * FROM assignments ORDER BY created_at DESC`);
        console.log(`[assignments] GET via poolQuery: ${result.rows.length} rows (role=${caller.role})`);
        return res.json({ success: true, assignments: result.rows });
      } catch (sqlErr) {
        console.warn("[assignments] poolQuery failed, falling back to supabaseAdmin:", sqlErr?.message);
      }
      let query = supabaseAdmin.from("assignments").select("*").order("created_at", { ascending: false });
      if (caller.role === "teacher") query = query.in("teacher_id", scopedIds);
      const { data, error } = await query;
      if (error) {
        console.warn("[assignments] supabaseAdmin GET error:", error.message);
        return res.json({ success: true, assignments: [] });
      }
      console.log(`[assignments] GET via supabaseAdmin: ${(data || []).length} rows`);
      return res.json({ success: true, assignments: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/teacher/assignments", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const b = req.body;
      if (!b.title) return res.status(400).json({ error: "Title is required" });
      const publishAt = "publish_at" in b && b.publish_at ? new Date(String(b.publish_at)).toISOString() : null;
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
            b.type || "homework",
            b.due_date || null,
            Number(b.max_score) || 100,
            b.status || "draft",
            b.allow_late_submission ? true : false,
            b.submission_config != null ? JSON.stringify(b.submission_config) : null,
            publishAt
          ]
        );
        return res.json({ success: true, assignment: { id: result.rows[0].id } });
      } catch {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        let payload = {
          title: String(b.title),
          description: b.description != null ? String(b.description) : null,
          course_id: b.course_id || null,
          class_id: b.class_id || null,
          teacher_id: b.teacher_id || caller.userId,
          type: b.type || "homework",
          due_date: b.due_date || null,
          max_score: Number(b.max_score) || 100,
          status: b.status || "draft",
          allow_late_submission: Boolean(b.allow_late_submission),
          instructions: b.instructions != null ? String(b.instructions) : null,
          submission_config: b.submission_config != null ? b.submission_config : null,
          created_at: now,
          updated_at: now
        };
        if (publishAt) payload.publish_at = publishAt;
        const STRIP_COLS = ["publish_at", "allow_late_submission", "instructions", "submission_config"];
        for (let i = 0; i < STRIP_COLS.length + 2; i++) {
          const { data, error } = await supabaseAdmin.from("assignments").insert(payload).select("id").single();
          if (!error && data?.id) return res.json({ success: true, assignment: { id: data.id } });
          if (!error) return res.status(500).json({ error: "Insert returned no id" });
          const em = (error.message || "").toLowerCase();
          const hit = STRIP_COLS.find((c) => em.includes(c) && c in payload);
          if (hit) {
            const { [hit]: _d, ...rest } = payload;
            payload = rest;
            continue;
          }
          return res.status(500).json({ error: error.message });
        }
        return res.status(500).json({ error: "Failed to insert assignment" });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/teacher/assignments/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const aId = req.params.id?.trim();
      if (!aId) return res.status(400).json({ error: "Assignment id required" });
      const b = req.body;
      try {
        const sets = ["updated_at = now()"];
        const params = [];
        let pi = 1;
        const col = (name, val) => {
          sets.push(`${name} = $${pi++}`);
          params.push(val);
        };
        if (b.title !== void 0) col("title", String(b.title));
        if (b.description !== void 0) col("description", b.description != null ? String(b.description) : null);
        if (b.course_id !== void 0) col("course_id", b.course_id || null);
        if (b.class_id !== void 0) col("class_id", b.class_id || null);
        if (b.type !== void 0) col("type", b.type);
        if (b.due_date !== void 0) col("due_date", b.due_date || null);
        if (b.max_score !== void 0) col("max_score", Number(b.max_score) || 100);
        if (b.status !== void 0) col("status", b.status);
        if (b.instructions !== void 0) col("instructions", b.instructions != null ? String(b.instructions) : null);
        if (b.allow_late_submission !== void 0) col("allow_late_submission", Boolean(b.allow_late_submission));
        if (b.submission_config !== void 0) col("submission_config", b.submission_config != null ? JSON.stringify(b.submission_config) : null);
        if ("publish_at" in b) col("publish_at", b.publish_at ? new Date(String(b.publish_at)).toISOString() : null);
        params.push(aId);
        await poolQuery(`UPDATE assignments SET ${sets.join(", ")} WHERE id = $${pi}`, params);
        return res.json({ success: true });
      } catch {
        let payload = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        if (b.title !== void 0) payload.title = String(b.title);
        if (b.description !== void 0) payload.description = b.description != null ? String(b.description) : null;
        if (b.course_id !== void 0) payload.course_id = b.course_id || null;
        if (b.class_id !== void 0) payload.class_id = b.class_id || null;
        if (b.type !== void 0) payload.type = b.type;
        if (b.due_date !== void 0) payload.due_date = b.due_date || null;
        if (b.max_score !== void 0) payload.max_score = Number(b.max_score) || 100;
        if (b.status !== void 0) payload.status = b.status;
        if (b.instructions !== void 0) payload.instructions = b.instructions != null ? String(b.instructions) : null;
        if (b.allow_late_submission !== void 0) payload.allow_late_submission = Boolean(b.allow_late_submission);
        if (b.submission_config !== void 0) payload.submission_config = b.submission_config;
        if ("publish_at" in b && b.publish_at) payload.publish_at = new Date(String(b.publish_at)).toISOString();
        const STRIP_COLS = ["publish_at", "allow_late_submission", "instructions", "submission_config"];
        for (let i = 0; i < STRIP_COLS.length + 2; i++) {
          const { error } = await supabaseAdmin.from("assignments").update(payload).eq("id", aId);
          if (!error) return res.json({ success: true });
          const em = (error.message || "").toLowerCase();
          const hit = STRIP_COLS.find((c) => em.includes(c) && c in payload);
          if (hit) {
            const { [hit]: _d, ...rest } = payload;
            payload = rest;
            continue;
          }
          return res.status(500).json({ error: error.message });
        }
        return res.status(500).json({ error: "Failed to update assignment" });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/teacher/assignments/:id", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      if (caller.role !== "teacher" && caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const aId = req.params.id?.trim();
      if (!aId) return res.status(400).json({ error: "Assignment id required" });
      const { error } = await supabaseAdmin.from("assignments").delete().eq("id", aId);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/teacher/assignments/:assignmentId/submissions", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { assignmentId } = req.params;
      const subRes = await poolQuery(
        `SELECT * FROM assignment_submissions WHERE assignment_id=$1 ORDER BY submitted_at DESC`,
        [assignmentId]
      );
      const rawRows = subRes.rows;
      const studentIds = [...new Set(rawRows.map((s) => s.student_id))];
      let profileMap = {};
      if (studentIds.length > 0) {
        const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name, email, avatar_url").in("id", studentIds);
        (profiles || []).forEach((p) => {
          profileMap[p.id] = p;
        });
      }
      const enriched = rawRows.map((s) => ({
        ...s,
        student: profileMap[s.student_id] || { display_name: "Unknown", email: "" }
      }));
      res.json({ success: true, submissions: enriched });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.patch("/api/teacher/assignments/submissions/:subId/grade", async (req, res) => {
    try {
      const caller = await assertAuthenticated(req, res);
      if (!caller) return;
      const { subId } = req.params;
      const { grade, feedback } = req.body;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const result = await poolQuery(
        `UPDATE assignment_submissions SET grade=$1, feedback=$2, status='graded', graded_at=$3, updated_at=$3 WHERE id=$4 RETURNING *`,
        [grade !== void 0 && grade !== "" ? Number(grade) : null, feedback || null, now, subId]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Submission not found" });
      res.json({ success: true, submission: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  async function ensurePresentationsTable() {
    try {
      const { error } = await supabaseAdmin.from("presentations").select("id").limit(1);
      if (error && (error.message.includes("does not exist") || error.code === "42P01")) {
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
        console.log("[presentations] Table created \u2713");
      } else {
        await poolQuery(`ALTER TABLE presentations ADD COLUMN IF NOT EXISTS assignment_id UUID`).catch(() => null);
      }
    } catch (e) {
      console.warn("[presentations] Migration check:", e?.message);
    }
  }
  void ensurePresentationsTable();
  app.get("/api/presentations", async (req, res) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace("Bearer ", "") || ""
      );
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
      let query = supabaseAdmin.from("presentations").select("id, user_id, title, description, theme, language, education_level, is_public, slides, assignment_id, created_at, updated_at").order("created_at", { ascending: false });
      if (profile?.role !== "admin") {
        query = query.eq("user_id", user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, presentations: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/presentations/:id", async (req, res) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace("Bearer ", "") || ""
      );
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const { data, error } = await supabaseAdmin.from("presentations").select("*").eq("id", req.params.id).single();
      if (error) throw error;
      const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin" && data.user_id !== user.id && !data.is_public) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json({ success: true, presentation: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/presentations", async (req, res) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace("Bearer ", "") || ""
      );
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const { title, description, theme, language, education_level, slides, is_public, assignment_id } = req.body;
      const insertPayload = {
        user_id: user.id,
        title,
        description,
        theme: theme || "modern",
        language: language || "en",
        education_level,
        slides: slides || [],
        is_public: is_public || false,
        assignment_id: assignment_id || null
      };
      let { data, error } = await supabaseAdmin.from("presentations").insert(insertPayload).select().single();
      if (error && error.message?.includes("assignment_id")) {
        const { assignment_id: _drop, ...payloadWithout } = insertPayload;
        ({ data, error } = await supabaseAdmin.from("presentations").insert(payloadWithout).select().single());
      }
      if (error) throw error;
      res.json({ success: true, presentation: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.put("/api/presentations/:id", async (req, res) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace("Bearer ", "") || ""
      );
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const { data: existing } = await supabaseAdmin.from("presentations").select("user_id").eq("id", req.params.id).single();
      const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin" && existing?.user_id !== user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { title, description, theme, language, education_level, slides, is_public, assignment_id } = req.body;
      const updatePayload = {
        title,
        description,
        theme,
        language,
        education_level,
        slides,
        is_public,
        assignment_id: assignment_id ?? null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      let { data, error } = await supabaseAdmin.from("presentations").update(updatePayload).eq("id", req.params.id).select().single();
      if (error && error.message?.includes("assignment_id")) {
        const { assignment_id: _drop, ...payloadWithout } = updatePayload;
        ({ data, error } = await supabaseAdmin.from("presentations").update(payloadWithout).eq("id", req.params.id).select().single());
      }
      if (error) throw error;
      res.json({ success: true, presentation: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/api/presentations/:id", async (req, res) => {
    try {
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace("Bearer ", "") || ""
      );
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const { data: existing } = await supabaseAdmin.from("presentations").select("user_id").eq("id", req.params.id).single();
      const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin" && existing?.user_id !== user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { error } = await supabaseAdmin.from("presentations").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/presentations/generate", async (req, res) => {
    try {
      let safeParseJSON = function(raw) {
        if (!raw || !raw.trim()) return null;
        let text = raw.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start === -1 || end === -1 || end <= start) return null;
        text = text.slice(start, end + 1);
        try {
          return JSON.parse(text);
        } catch {
        }
        let result = "";
        let inStr = false;
        let escape = false;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (escape) {
            result += ch;
            escape = false;
            continue;
          }
          if (ch === "\\" && inStr) {
            result += ch;
            escape = true;
            continue;
          }
          if (ch === '"') {
            inStr = !inStr;
            result += ch;
            continue;
          }
          if (inStr) {
            if (ch === "\n") {
              result += "\\n";
              continue;
            }
            if (ch === "\r") {
              result += "\\r";
              continue;
            }
            if (ch === "	") {
              result += "\\t";
              continue;
            }
          }
          result += ch;
        }
        try {
          return JSON.parse(result);
        } catch {
        }
        const stripped = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
        try {
          return JSON.parse(stripped);
        } catch {
          return null;
        }
      };
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
        req.headers.authorization?.replace("Bearer ", "") || ""
      );
      if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
      const { topic, language, slideCount, style, educationLevel } = req.body;
      if (!topic) return res.status(400).json({ error: "Topic is required" });
      const count = Math.min(Math.max(Number(slideCount) || 8, 3), 20);
      const apiKey = (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
      const prompt = `You are an expert educational presentation creator. Generate a complete presentation about "${topic}".

Requirements:
- Language: ${language || "English"}
- Number of slides: ${count}
- Style: ${style || "modern"} (modern = clean & bold, business = formal & structured, education = colorful & engaging, minimal = simple & elegant)
- Education level: ${educationLevel || "general"}

CRITICAL JSON RULES \u2014 you must follow these exactly:
- Output ONLY raw JSON. No markdown, no code fences, no explanation before or after.
- Every string value must be on a single line \u2014 NO literal newlines inside strings.
- Use \\n (backslash-n) if you need a line break inside a string value.
- Do NOT use any control characters inside strings.

Output this exact structure:
{"title":"Presentation Title","slides":[{"order":1,"type":"title","title":"Slide Title","content":["bullet 1","bullet 2","bullet 3"],"notes":"Speaker notes as a single line. Multiple sentences separated by spaces, not newlines.","emoji":"\u{1F3AF}"}]}

Slide types: "title" (first slide only), "content" (main slides), "stats", "quote", "summary" (last slide only).
Each content/stats/quote slide must have 3-5 bullet points.
Speaker notes: 2-3 sentences on a single line with no line breaks.`;
      let rawText = "";
      if (apiKey) {
        const { GoogleGenAI } = await import("@google/genai");
        const geminiBaseUrl = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "").trim();
        const ai = new GoogleGenAI(
          geminiBaseUrl ? { apiKey, httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } } : { apiKey }
        );
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: prompt
        });
        rawText = response.text ?? "";
      } else {
        const pollinationsRes = await fetch("https://text.pollinations.ai/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            model: "openai",
            seed: 42,
            jsonMode: true
          })
        });
        if (!pollinationsRes.ok) {
          throw new Error(`Pollinations AI error: ${pollinationsRes.status}`);
        }
        rawText = await pollinationsRes.text();
      }
      console.log(`[presentations/generate] rawText length=${rawText.length}, preview=${rawText.slice(0, 120).replace(/\n/g, " ")}`);
      const parsed = safeParseJSON(rawText);
      if (!parsed) {
        console.error("[presentations/generate] safeParseJSON returned null. rawText (first 500):", rawText.slice(0, 500));
        return res.status(500).json({ error: "AI did not return valid JSON. Please try again." });
      }
      res.json({ success: true, data: parsed });
    } catch (e) {
      console.error("[presentations/generate]", e?.message);
      res.status(500).json({ error: e?.message || "AI generation failed" });
    }
  });
  app.use((err, req, res, next) => {
    if (!err) return next();
    const status = Number(err?.status || err?.statusCode || 500);
    const normalizedStatus = Number.isFinite(status) ? Math.max(400, status) : 500;
    const layer = detectErrorLayer(`${err?.message || ""}
${err?.stack || ""}`);
    void logSystemError(
      {
        layer,
        message: err?.message || "Unhandled backend error",
        stack: err?.stack,
        file: err?.fileName,
        line: Number.isFinite(Number(err?.lineNumber)) ? Number(err.lineNumber) : void 0,
        url: req.originalUrl,
        userAgent: req.headers["user-agent"],
        source: "express.error-middleware"
      },
      res
    );
    if (res.headersSent) return next(err);
    return res.status(normalizedStatus).json({ error: err?.message || "Internal server error" });
  });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      console.error(`[404] No API route matched: ${req.method} ${req.path}`);
      return res.status(404).json({
        error: `No API route matched for ${req.method} ${req.path}. Start the app with npm run dev (tsx server.ts) and open the app at the URL printed in the terminal (same host/port as the API). If you set VITE_API_BASE_URL, it must match that URL (e.g. if the server says port 5002, use http://localhost:5002 \u2014 not a stale port). Restart the server after git pull.`,
        method: req.method,
        path: req.path
      });
    }
    next();
  });
  if (includeFrontend) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer } = await import("vite");
      const isReplit = !!(process.env.REPL_ID || process.env.REPLIT_DEV_DOMAIN);
      let hmrConfig;
      if (isReplit) {
        hmrConfig = {
          ...options.httpServer ? { server: options.httpServer } : {},
          protocol: "wss",
          host: process.env.REPLIT_DEV_DOMAIN || void 0,
          clientPort: 443
        };
      } else {
        hmrConfig = options.httpServer ? { server: options.httpServer } : true;
      }
      const vite = await createServer({
        configFile: false,
        root: process.cwd(),
        plugins: [
          (await import("@vitejs/plugin-react")).default(),
          (await import("@tailwindcss/vite")).default()
        ],
        resolve: {
          alias: { "@": process.cwd() },
          dedupe: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"]
        },
        optimizeDeps: {
          include: [
            "react",
            "react-dom",
            "react-dom/client",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-router-dom",
            "react-hook-form",
            "react-i18next",
            "@hookform/resolvers/zod",
            "zod",
            "lucide-react",
            "clsx",
            "tailwind-merge",
            "sonner",
            "motion/react",
            "date-fns",
            "recharts",
            "i18next",
            "i18next-browser-languagedetector",
            "@supabase/supabase-js",
            "@dnd-kit/core",
            "@dnd-kit/sortable",
            "@dnd-kit/utilities",
            "canvas-confetti",
            "dompurify"
          ]
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
              "**/*.json"
            ]
          }
        },
        appType: "spa"
      });
      app.use("/node_modules/.vite/deps/", (_req, res, next) => {
        res.set("Cache-Control", "no-store");
        next();
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path2.join(process.cwd(), "dist");
      app.use("/assets", express.static(path2.join(distPath, "assets"), {
        maxAge: "1y",
        immutable: true
      }));
      app.use(express.static(distPath, { maxAge: 0 }));
      app.get("*", (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.sendFile(path2.join(distPath, "index.html"));
      });
    }
  }
  return app;
}
var DISCUSSION_MIGRATION_SQL = `
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
var DISCUSSION_RLS_SQL = `
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
var _discussionTablesReady = false;
async function runDiscussionMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("[migration] DATABASE_URL not set \u2014 skipping discussion table auto-setup");
    return false;
  }
  try {
    const check = await poolQuery(
      `SELECT to_regclass('public.lesson_discussion_questions') AS tbl`
    );
    if (!check.rows[0]?.tbl) {
      console.log("[migration] creating discussion tables\u2026");
      await poolQuery(DISCUSSION_MIGRATION_SQL);
      console.log("[migration] discussion tables created \u2713");
    } else {
      console.log("[migration] discussion tables already exist \u2014 ensuring RLS policies\u2026");
    }
    await poolQuery(DISCUSSION_RLS_SQL).catch((e) => {
      console.warn("[migration] RLS policy setup warning:", e?.message);
    });
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {
    });
    _discussionTablesReady = true;
    console.log("[migration] discussion setup complete \u2713");
    return true;
  } catch (err) {
    console.error("[migration] discussion table setup failed:", err?.message || err);
    return false;
  }
}
async function runAnnouncementColumnsMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;
  const attempts = [
    `SET search_path TO public; ALTER TABLE announcements ADD COLUMN IF NOT EXISTS ann_type text NOT NULL DEFAULT 'general'; ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NULL;`,
    `ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS ann_type text NOT NULL DEFAULT 'general'; ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NULL;`
  ];
  for (const sql of attempts) {
    try {
      await poolQuery(sql);
      await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {
      });
      console.log("[migration] announcements columns (ann_type, scheduled_at) ensured \u2713");
      return;
    } catch (err) {
      console.warn("[migration] announcements column attempt failed:", err?.message?.split("\n")[0]);
    }
  }
  console.log("[migration] announcements columns: will use graceful fallback in API handlers");
}
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
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {
    });
    console.log("[migration] student_monthly_payments table ensured \u2713");
  } catch (err) {
    console.warn("[migration] student_monthly_payments:", err?.message?.split("\n")[0]);
  }
}
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
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {
    });
    console.log("[migration] teacher_hours table ensured \u2713");
  } catch (err) {
    console.warn("[migration] teacher_hours:", err?.message?.split("\n")[0]);
  }
}
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
    console.log("[migration] student_transfers table ensured \u2713");
  } catch (err) {
    console.warn("[migration] student_transfers table:", err?.message?.split("\n")[0]);
  }
}
async function runAssignmentSubmissionsMigration() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return;
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
    console.log("[migration] assignments table ensured \u2713");
  } catch (err) {
    console.warn("[migration] assignments table:", err?.message?.split("\n")[0]);
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
    console.log("[migration] assignment_submissions table ensured \u2713");
  } catch (err) {
    console.warn("[migration] assignment_submissions table:", err?.message?.split("\n")[0]);
  }
  try {
    await poolQuery(`SELECT pg_notify('pgrst', 'reload schema')`);
    console.log("[migration] PostgREST schema cache reloaded \u2713");
  } catch {
  }
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS instructions text`);
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS allow_late_submission boolean DEFAULT false`);
    console.log("[migration] assignments extra columns ensured \u2713");
  } catch (err) {
    console.warn("[migration] assignments extra columns:", err?.message?.split("\n")[0]);
  }
  try {
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS file_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS link_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_content text`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_file_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_link_urls jsonb DEFAULT '[]'`);
    await poolQuery(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS draft_saved_at timestamptz`);
    console.log("[migration] assignment_submissions rich columns ensured \u2713");
  } catch (err) {
    console.warn("[migration] assignment_submissions rich columns:", err?.message?.split("\n")[0]);
  }
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS submission_config jsonb`);
    console.log("[migration] assignments submission_config ensured \u2713");
  } catch (err) {
    console.warn("[migration] assignments submission_config:", err?.message?.split("\n")[0]);
  }
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log("[migration] assignments.publish_at column ensured \u2713");
  } catch (err) {
    if (!String(err?.message || "").toLowerCase().includes("already exists")) {
      console.warn("[migration] assignments.publish_at:", err?.message?.split("\n")[0]);
    } else {
      console.log("[migration] assignments.publish_at column already exists \u2713");
    }
  }
}
async function runModulesPublishAtMigration() {
  try {
    await poolQuery(`ALTER TABLE modules ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log("[migration] modules.publish_at column ensured \u2713");
    return;
  } catch {
  }
  try {
    const probe = await supabaseAdmin.from("modules").select("publish_at").limit(1);
    if (!probe.error) {
      console.log("[migration] modules.publish_at column already exists \u2713");
      return;
    }
    const rpcResult = await supabaseAdmin.rpc("exec_sql", {
      sql: "ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL"
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log("[migration] modules.publish_at added via RPC \u2713");
  } catch (err) {
    console.warn("[migration] modules.publish_at column could not be auto-created:", err?.message?.split("\n")[0]);
    console.warn("[migration] Run manually: ALTER TABLE modules ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL");
  }
}
async function runQuizSectionsMigration() {
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
    console.log("[migration] quiz_sections table + questions.section_id ensured \u2713");
  } catch (err) {
    try {
      const probe = await supabaseAdmin.from("quiz_sections").select("id").limit(1);
      if (!probe.error) {
        console.log("[migration] quiz_sections already exists \u2713");
        return;
      }
    } catch {
    }
    console.warn("[migration] quiz_sections: could not auto-create \u2014 run migrations/012_quiz_sections.sql manually.");
    console.warn("[migration] Error:", err?.message?.split?.("\n")?.[0]);
  }
}
async function runQuizzesPublishAtMigration() {
  try {
    await poolQuery(`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log("[migration] quizzes.publish_at column ensured \u2713");
    return;
  } catch {
  }
  try {
    const probe = await supabaseAdmin.from("quizzes").select("publish_at").limit(1);
    if (!probe.error) {
      console.log("[migration] quizzes.publish_at column already exists \u2713");
      return;
    }
    const rpcResult = await supabaseAdmin.rpc("exec_sql", {
      sql: "ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL"
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log("[migration] quizzes.publish_at added via RPC \u2713");
  } catch (err) {
    console.warn("[migration] quizzes.publish_at column could not be auto-created:", err?.message?.split("\n")[0]);
    console.warn("[migration] Run manually: ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL");
  }
}
async function runLessonsPublishAtMigration() {
  try {
    await poolQuery(`ALTER TABLE lessons ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log("[migration] lessons.publish_at column ensured \u2713");
    return;
  } catch {
  }
  try {
    const probe = await supabaseAdmin.from("lessons").select("publish_at").limit(1);
    if (!probe.error) {
      console.log("[migration] lessons.publish_at column already exists \u2713");
      return;
    }
    const rpcResult = await supabaseAdmin.rpc("exec_sql", {
      sql: "ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL"
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log("[migration] lessons.publish_at added via RPC \u2713");
  } catch (err) {
    console.warn("[migration] lessons.publish_at column could not be auto-created:", err?.message?.split("\n")[0]);
    console.warn("[migration] Run manually: ALTER TABLE lessons ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL");
  }
}
async function runAssignmentsPublishAtMigration() {
  try {
    await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
    console.log("[migration] assignments.publish_at column ensured \u2713");
    return;
  } catch {
  }
  try {
    const probe = await supabaseAdmin.from("assignments").select("publish_at").limit(1);
    if (!probe.error) {
      console.log("[migration] assignments.publish_at column already exists \u2713");
      return;
    }
    const rpcResult = await supabaseAdmin.rpc("exec_sql", {
      sql: "ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL"
    });
    if (rpcResult.error) throw rpcResult.error;
    console.log("[migration] assignments.publish_at added via RPC \u2713");
  } catch (err) {
    console.warn("[migration] assignments.publish_at column could not be auto-created:", err?.message?.split("\n")[0]);
  }
}
async function runNotificationsColumnsMigration() {
  const cols = [
    { name: "title", ddl: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''` },
    { name: "read", ddl: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT FALSE` }
  ];
  for (const col of cols) {
    try {
      await poolQuery(col.ddl);
      console.log(`[migration] notifications.${col.name} column ensured \u2713`);
    } catch {
      try {
        const probe = await supabaseAdmin.from("notifications").select(col.name).limit(1);
        if (!probe.error) {
          console.log(`[migration] notifications.${col.name} column already exists \u2713`);
          continue;
        }
        const rpc = await supabaseAdmin.rpc("exec_sql", { sql: col.ddl });
        if (rpc.error) throw rpc.error;
        console.log(`[migration] notifications.${col.name} added via RPC \u2713`);
      } catch (err) {
        console.warn(`[migration] notifications.${col.name} could not be auto-created:`, err?.message?.split("\n")[0]);
      }
    }
  }
}
async function runLiveSessionsRecordingUrlsMigration() {
  const ddl = `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS recording_urls JSONB NOT NULL DEFAULT '[]'::jsonb`;
  try {
    await poolQuery(ddl);
    console.log("[migration] live_sessions.recording_urls column ensured \u2713");
    return;
  } catch {
  }
  try {
    const probe = await supabaseAdmin.from("live_sessions").select("recording_urls").limit(1);
    if (!probe.error) {
      console.log("[migration] live_sessions.recording_urls column already exists \u2713");
      return;
    }
    const rpc = await supabaseAdmin.rpc("exec_sql", { sql: ddl });
    if (rpc.error) throw rpc.error;
    console.log("[migration] live_sessions.recording_urls added via RPC \u2713");
  } catch (err) {
    console.warn("[migration] live_sessions.recording_urls could not be auto-created:", err?.message?.split("\n")[0]);
    console.warn("[migration] Run manually:", ddl);
  }
}
async function runLiveSessionsControlsMigration() {
  const ddls = [
    `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS reactions_enabled BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS raise_hand_enabled BOOLEAN NOT NULL DEFAULT true`
  ];
  try {
    for (const ddl of ddls) await poolQuery(ddl);
    console.log("[migration] live_sessions controls columns ensured \u2713");
    return;
  } catch {
  }
  try {
    for (const ddl of ddls) {
      const rpc = await supabaseAdmin.rpc("exec_sql", { sql: ddl });
      if (rpc.error && !String(rpc.error.message).includes("already exists")) throw rpc.error;
    }
    console.log("[migration] live_sessions controls columns added via RPC \u2713");
  } catch (err) {
    console.warn("[migration] live_sessions controls columns could not be auto-created:", err?.message?.split("\n")[0]);
  }
}
async function runSessionParticipantsHandRaisedMigration() {
  const ddl = `ALTER TABLE public.session_participants ADD COLUMN IF NOT EXISTS is_hand_raised BOOLEAN NOT NULL DEFAULT false`;
  try {
    await poolQuery(ddl);
    console.log("[migration] session_participants.is_hand_raised column ensured \u2713");
    return;
  } catch {
  }
  try {
    const probe = await supabaseAdmin.from("session_participants").select("is_hand_raised").limit(1);
    if (!probe.error) {
      console.log("[migration] session_participants.is_hand_raised already exists \u2713");
      return;
    }
    const rpc = await supabaseAdmin.rpc("exec_sql", { sql: ddl });
    if (rpc.error) throw rpc.error;
    console.log("[migration] session_participants.is_hand_raised added via RPC \u2713");
  } catch (err) {
    console.warn("[migration] session_participants.is_hand_raised could not be auto-created:", err?.message?.split("\n")[0]);
  }
}
async function ensureHeadwayMediaTable() {
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
    console.log("[migration] headway_media table ensured \u2713");
  } catch {
  }
  try {
    const probe = await supabaseAdmin.from("headway_media").select("id").limit(1);
    if (probe.error) {
      const rpc = await supabaseAdmin.rpc("exec_sql", { sql: ddl });
      if (rpc.error) throw rpc.error;
      console.log("[migration] headway_media table created via RPC \u2713");
    } else {
      console.log("[migration] headway_media table already exists \u2713");
    }
  } catch (err) {
    console.warn("[migration] headway_media table could not be auto-created:", err?.message?.split("\n")[0]);
  }
  try {
    await poolQuery(`ALTER TABLE headway_media ADD COLUMN IF NOT EXISTS course_id UUID`);
    await poolQuery(`CREATE INDEX IF NOT EXISTS idx_headway_media_course_id ON headway_media (course_id) WHERE course_id IS NOT NULL`);
    await poolQuery(`NOTIFY pgrst, 'reload schema'`).catch(() => {
    });
    console.log("[migration] headway_media.course_id column + index ensured \u2713");
  } catch (err) {
    console.warn("[migration] headway_media.course_id column could not be added:", err?.message?.split("\n")[0]);
  }
}
async function ensureHeadwayMediaBucket() {
  try {
    const { error } = await supabaseAdmin.storage.createBucket("headway-media", { public: true });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      const { error: e2 } = await supabaseAdmin.storage.createBucket("headway-media", {});
      if (e2 && !e2.message.toLowerCase().includes("already exists")) {
        console.warn("[storage] headway-media bucket setup:", e2.message);
        return;
      }
    }
    console.log("[storage] headway-media bucket ready \u2713");
  } catch (e) {
    console.warn("[storage] headway-media bucket failed:", e?.message);
  }
}
async function ensureAssignmentFilesBucket() {
  try {
    const { error } = await supabaseAdmin.storage.createBucket("assignment-files", {
      public: true,
      fileSizeLimit: 52428800
    });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      console.warn("[storage] assignment-files bucket setup:", error.message);
    } else {
      console.log("[storage] assignment-files bucket ready \u2713");
    }
  } catch (e) {
    console.warn("[storage] assignment-files bucket failed:", e?.message);
  }
}
async function fixHeadwayQuizCorrectAnswers() {
  try {
    const { data: rows, error } = await supabaseAdmin.from("questions").select("id, options, correct_answer").eq("type", "multiple-choice");
    if (error || !rows || rows.length === 0) return;
    const updates = [];
    for (const row of rows) {
      const opts = row.options;
      if (!Array.isArray(opts) || opts.length === 0) continue;
      const ca = String(row.correct_answer ?? "");
      const firstOpt = opts[0];
      if (firstOpt && typeof firstOpt === "object" && "id" in firstOpt && "text" in firstOpt) {
        const optObjs = opts;
        if (optObjs.some((o) => o.id === ca)) continue;
        const caLower = ca.toLowerCase();
        const match = optObjs.find((o) => o.text === ca) ?? optObjs.find((o) => o.text.toLowerCase() === caLower);
        if (match) {
          updates.push({ id: row.id, correct_answer: match.id });
        }
        continue;
      }
      if (typeof firstOpt === "string") {
        const optStrs = opts;
        const optionObjects = optStrs.map((text, i) => ({ id: String(i + 1), text }));
        if (optionObjects.some((o) => o.id === ca)) {
          updates.push({ id: row.id, correct_answer: ca, options: optionObjects });
          continue;
        }
        const caLower = ca.toLowerCase();
        const match = optionObjects.find((o) => o.text === ca) ?? optionObjects.find((o) => o.text.toLowerCase() === caLower);
        if (match) {
          updates.push({ id: row.id, correct_answer: match.id, options: optionObjects });
          continue;
        }
        if (!ca || ca === "0" || ca === "null") {
          updates.push({ id: row.id, correct_answer: "1", options: optionObjects });
        }
      }
    }
    if (updates.length === 0) return;
    for (const upd of updates) {
      const patch = { correct_answer: upd.correct_answer };
      if (upd.options) patch.options = upd.options;
      await supabaseAdmin.from("questions").update(patch).eq("id", upd.id);
    }
    console.log(`[migration] fixed correct_answer for ${updates.length} quiz question(s) \u2713`);
  } catch (e) {
    console.warn("[migration] fixHeadwayQuizCorrectAnswers:", e?.message);
  }
}
function logEnvValidation() {
  const checks = [
    { key: "VITE_SUPABASE_URL", level: "required", isUrl: true },
    { key: "VITE_SUPABASE_ANON_KEY", level: "required" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", level: "required" },
    { key: "GEMINI_API_KEY", level: "optional" },
    { key: "BREVO_API_KEY", level: "optional" },
    { key: "BREVO_SENDER_EMAIL", level: "optional" },
    { key: "TELEGRAM_BOT_TOKEN", level: "optional" },
    { key: "DATABASE_URL", level: "optional" }
  ];
  const errors = [];
  const warnings = [];
  for (const { key, level, isUrl } of checks) {
    const raw = key === "GEMINI_API_KEY" ? ((process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "") || (process.env.GEMINI_API_KEY ?? "")).trim() : (process.env[key] ?? "").trim();
    if (!raw) {
      if (level === "required") errors.push(`  \u2717 ${key} \u2014 MISSING (required)`);
      else warnings.push(`  \u26A0 ${key} \u2014 not set (optional)`);
      continue;
    }
    if (isUrl && !raw.startsWith("https://") && !raw.startsWith("http://")) {
      errors.push(`  \u2717 ${key} \u2014 INVALID URL: must start with https:// (got: "${raw.slice(0, 30)}\u2026")`);
      continue;
    }
    const preview = isUrl ? raw.replace(/^(https?:\/\/[^.]+).*/, "$1") + "\u2026" : `${raw.slice(0, 4)}${"*".repeat(Math.max(0, raw.length - 4))}`;
    console.log(`  \u2713 ${key} \u2014 ${preview}`);
  }
  for (const w of warnings) console.warn(w);
  if (errors.length) {
    for (const e of errors) console.error(e);
    console.error(`[env] ${errors.length} required variable(s) missing or invalid \u2014 the app may not work correctly.`);
  } else {
    console.log("[env] All required environment variables are set \u2713");
  }
}
async function startServer() {
  console.log("[env] Validating environment variables\u2026");
  logEnvValidation();
  const parsedPort = Number(process.env.PORT);
  const preferredPort = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5e3;
  const preferredHost = process.env.HOST || "0.0.0.0";
  const hostCandidates = preferredHost === "0.0.0.0" ? [preferredHost] : [preferredHost, "0.0.0.0"];
  const maxPortAttempts = 10;
  const recoverableListenErrors = /* @__PURE__ */ new Set(["EACCES", "EADDRINUSE"]);
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
  let appHandler = null;
  const httpServer = http.createServer((req, res) => {
    if (appHandler) {
      appHandler(req, res);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Starting up, please wait\u2026</p></body></html>');
    }
  });
  const tryListen = (port, host) => new Promise((resolve, reject) => {
    const onError = (error) => {
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
  let lastRecoverableError = null;
  let boundPort = null;
  for (let portOffset = 0; portOffset < maxPortAttempts; portOffset++) {
    const portToTry = preferredPort + portOffset;
    for (const hostToTry of hostCandidates) {
      try {
        await tryListen(portToTry, hostToTry);
        boundPort = portToTry;
        break;
      } catch (error) {
        const listenError = error;
        if (!listenError.code || !recoverableListenErrors.has(listenError.code)) {
          throw listenError;
        }
        lastRecoverableError = listenError;
        const triedFinalCandidate = portOffset === maxPortAttempts - 1 && hostToTry === hostCandidates[hostCandidates.length - 1];
        if (!triedFinalCandidate) {
          console.warn(
            `Could not bind to ${hostToTry}:${portToTry} (${listenError.code}). Trying another address...`
          );
        }
      }
    }
    if (boundPort !== null) break;
  }
  if (boundPort === null) {
    throw new Error(
      `Unable to start server after trying ports ${preferredPort}-${preferredPort + maxPortAttempts - 1}. Last error: ${lastRecoverableError?.code ?? "unknown"}`
    );
  }
  console.log("[startup] Initialising Express + Vite app\u2026");
  createApp({ includeFrontend: true, httpServer }).then((app) => {
    appHandler = app;
    console.log("[startup] App ready \u2014 all requests now served by Express + Vite");
  }).catch((err) => {
    console.error("[startup] createApp failed:", err);
  });
  if (process.env.REPL_ID) {
    const replitProxyServer = http.createServer((req, res) => {
      if (appHandler) {
        appHandler(req, res);
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Starting up, please wait\u2026</p></body></html>');
      }
    });
    replitProxyServer.listen(24678, "0.0.0.0", () => {
      console.log("Replit proxy listener also running on port 24678");
    });
    replitProxyServer.on("error", (e) => {
      if (e.code !== "EADDRINUSE") {
        console.warn("Replit proxy port 24678 error:", e.code);
      }
    });
  }
}
var _reminderSentThisMonth = /* @__PURE__ */ new Set();
async function runPaymentDeadlineReminders({ force = false } = {}) {
  const now = /* @__PURE__ */ new Date();
  const dayOfMonth = now.getDate();
  const monthYear = now.toISOString().slice(0, 7);
  if (!force && dayOfMonth < 5) {
    return { sent: 0, skipped: 0, monthYear };
  }
  let brandName = "QuizMaster";
  let baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000";
  try {
    const cfgRes = await supabaseAdmin.from("platform_config").select("value").eq("section", "settings").maybeSingle();
    const settings = cfgRes.data?.value ?? {};
    if (settings?.general?.school_name) brandName = settings.general.school_name;
    if (!process.env.REPLIT_DEV_DOMAIN && settings?.general?.website) baseUrl = settings.general.website;
  } catch {
  }
  const loginUrl = `${baseUrl}/login`;
  const [yr, mo] = monthYear.split("-");
  const monthLabel = new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  const { data: allStudents, error: sErr } = await supabaseAdmin.from("profiles").select("id, display_name, email").eq("role", "student").eq("status", "active");
  if (sErr || !allStudents) return { sent: 0, skipped: 0, monthYear };
  const { data: paidRows } = await supabaseAdmin.from("student_monthly_payments").select("student_id").eq("month_year", monthYear);
  const paidSet = new Set((paidRows || []).map((r) => r.student_id));
  const unpaid = allStudents.filter((s) => !paidSet.has(s.id) && s.email);
  let sent = 0;
  let skipped = 0;
  if (!isEmailConfigured()) {
    console.log(`[payment-reminder] Email not configured \u2014 skipping ${unpaid.length} reminders`);
    return { sent: 0, skipped: unpaid.length, monthYear };
  }
  for (const student of unpaid) {
    const cacheKey = `${student.id}:${monthYear}`;
    if (!force && _reminderSentThisMonth.has(cacheKey)) {
      skipped++;
      continue;
    }
    const studentName = student.display_name || student.email || "Student";
    const tpl = renderPaymentReminderEmail({ studentName, monthLabel, dayOfMonth, brandName, loginUrl });
    try {
      await sendEmail({ to: student.email, toName: studentName, subject: tpl.subject, htmlContent: tpl.htmlContent, textContent: tpl.textContent });
      _reminderSentThisMonth.add(cacheKey);
      sent++;
    } catch (e) {
      console.error(`[payment-reminder] Failed to email ${student.email}:`, e.message);
      skipped++;
    }
  }
  if (sent > 0 || skipped > 0) {
    console.log(`[payment-reminder] ${monthYear}: sent=${sent}, skipped=${skipped}`);
  }
  return { sent, skipped, monthYear };
}
async function runAutoPublishQuizzes() {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data, error } = await supabaseAdmin.from("quizzes").select("id, title").lte("publish_at", now).neq("published", true);
    if (error || !data || data.length === 0) return;
    const ids = data.map((q) => q.id);
    const { error: batchErr } = await supabaseAdmin.from("quizzes").update({ published: true, publish_at: null, updated_at: now }).in("id", ids);
    if (batchErr) {
      console.error("[auto-publish] Failed to batch-publish quizzes:", batchErr.message);
    } else {
      console.log(`[auto-publish] Published ${ids.length} quiz(zes):`, data.map((q) => q.title).join(", "));
    }
  } catch (e) {
    console.error("[auto-publish] Quizzes scheduler error:", e?.message);
  }
}
async function runAutoPublishLessons() {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data, error } = await supabaseAdmin.from("lessons").select("id, title").lte("publish_at", now).neq("status", "published");
    if (error || !data || data.length === 0) return;
    const ids = data.map((l) => l.id);
    const { error: batchErr } = await supabaseAdmin.from("lessons").update({ status: "published", publish_at: null, updated_at: now }).in("id", ids);
    if (batchErr) {
      console.error("[auto-publish] Failed to batch-publish lessons:", batchErr.message);
    } else {
      console.log(`[auto-publish] Published ${ids.length} lesson(s):`, data.map((l) => l.title).join(", "));
    }
  } catch (e) {
    console.error("[auto-publish] Lessons scheduler error:", e?.message);
  }
}
async function runAutoPublishAssignments() {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
    } catch (sqlErr) {
      if (String(sqlErr?.message || "").includes("publish_at")) {
        try {
          await poolQuery(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz NULL`);
          console.log("[auto-publish] Added missing publish_at column \u2713");
        } catch {
        }
      }
      console.warn("[auto-publish] poolQuery failed, falling back to supabaseAdmin:", sqlErr?.message?.split("\n")[0]);
    }
    const { data, error } = await supabaseAdmin.from("assignments").select("id, title").lte("publish_at", now).neq("status", "published");
    if (error) {
      console.warn("[auto-publish] assignments query error (publish_at may be missing):", error.message?.split("\n")[0]);
      return;
    }
    if (!data || data.length === 0) return;
    for (const a of data) {
      const { error: updErr } = await supabaseAdmin.from("assignments").update({ status: "published", publish_at: null, updated_at: now }).eq("id", a.id);
      if (updErr) {
        console.error(`[auto-publish] Failed to publish assignment "${a.title}":`, updErr.message);
      } else {
        console.log(`[auto-publish] Published assignment "${a.title}" (${a.id})`);
      }
    }
  } catch (e) {
    console.error("[auto-publish] Assignments scheduler error:", e?.message);
  }
}
async function runAutoPublishModules() {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data, error } = await supabaseAdmin.from("modules").select("id, title").lte("publish_at", now).neq("status", "active");
    if (error || !data || data.length === 0) return;
    const ids = data.map((m) => m.id);
    const { error: batchErr } = await supabaseAdmin.from("modules").update({ status: "active", publish_at: null, updated_at: now }).in("id", ids);
    if (batchErr) {
      console.error("[auto-publish] Failed to batch-publish modules:", batchErr.message);
    } else {
      console.log(`[auto-publish] Published ${ids.length} module(s):`, data.map((m) => m.title).join(", "));
    }
  } catch (e) {
    console.error("[auto-publish] Scheduler error:", e?.message);
  }
}
if (!process.env.VERCEL) {
  setInterval(() => {
    void runAutoPublishModules();
  }, 6e4);
  void runAutoPublishModules();
  setInterval(() => {
    void runAutoPublishLessons();
  }, 6e4);
  void runAutoPublishLessons();
  setInterval(() => {
    void runAutoPublishQuizzes();
  }, 6e4);
  void runAutoPublishQuizzes();
  setInterval(() => {
    void runAutoPublishAssignments();
  }, 6e4);
  void runAutoPublishAssignments();
  setInterval(() => {
    void flushFailedTelegramAlerts();
  }, TELEGRAM_RETRY_INTERVAL_MS);
  void flushFailedTelegramAlerts();
  setInterval(() => {
    void runPaymentDeadlineReminders();
  }, 6 * 60 * 60 * 1e3);
  void runPaymentDeadlineReminders();
  process.on("unhandledRejection", (reason) => {
    const details = serializeUnknownError(reason);
    console.error("[runtime] unhandledRejection:", details);
    void logSystemError({
      layer: detectErrorLayer(details, "BACKEND"),
      message: "Unhandled Promise Rejection",
      stack: details,
      source: "process.unhandledRejection"
    });
  });
  process.on("uncaughtException", (error) => {
    const details = serializeUnknownError(error);
    console.error("[runtime] uncaughtException:", details);
    void logSystemError({
      layer: detectErrorLayer(details, "BACKEND"),
      message: "Uncaught Exception",
      stack: details,
      source: "process.uncaughtException"
    });
  });
}
if (!process.env.VERCEL) {
  startServer();
}
export {
  createApp
};
