/**
 * Lightweight transactional email helper backed by Brevo (formerly Sendinblue).
 *
 * Required environment variables:
 *   BREVO_API_KEY        — API key from Brevo (Settings → SMTP & API → API Keys)
 *   BREVO_SENDER_EMAIL   — Verified sender email (Senders & IP → Senders)
 *   BREVO_SENDER_NAME    — Display name shown in inbox (e.g. "QuizMaster")
 *
 * If any of these are missing, `isEmailConfigured()` returns false and `sendEmail`
 * throws — callers should guard with `isEmailConfigured()` and surface a dev fallback.
 */

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export interface SendEmailResult {
  messageId?: string;
}

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface BrevoOverride {
  apiKey?: string;
  senderEmail?: string;
  senderName?: string;
}

function pick(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveConfig(override?: BrevoOverride) {
  const apiKey = pick(override?.apiKey) || pick(process.env.BREVO_API_KEY);
  const senderEmail = pick(override?.senderEmail) || pick(process.env.BREVO_SENDER_EMAIL);
  const senderName =
    pick(override?.senderName) || pick(process.env.BREVO_SENDER_NAME) || "QuizMaster";
  return { apiKey, senderEmail, senderName };
}

export function isEmailConfigured(override?: BrevoOverride): boolean {
  const { apiKey, senderEmail } = resolveConfig(override);
  return Boolean(apiKey && senderEmail);
}

export async function sendEmail(
  msg: EmailMessage,
  override?: BrevoOverride,
): Promise<SendEmailResult> {
  const { apiKey, senderEmail, senderName } = resolveConfig(override);
  if (!apiKey || !senderEmail) {
    throw new Error("Brevo is not configured (missing API key or sender email)");
  }

  const body = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: msg.to, name: msg.toName || msg.to }],
    subject: msg.subject,
    htmlContent: msg.htmlContent,
    textContent: msg.textContent,
  };

  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let parsed: any = null;
    try { parsed = errText ? JSON.parse(errText) : null; } catch { /* ignore */ }
    const message = parsed?.message || errText || `Brevo responded ${res.status}`;
    throw new Error(`Brevo send failed: ${message}`);
  }

  const json = await res.json().catch(() => ({}));
  return { messageId: json?.messageId };
}

/** Renders the standard 6-digit verification email (HTML + plain text). */
export function renderVerificationEmail(opts: {
  code: string;
  brandName?: string;
  ttlMinutes?: number;
}) {
  const brand = (opts.brandName || "QuizMaster").trim();
  const ttl = opts.ttlMinutes ?? 5;
  const code = String(opts.code || "");

  const subject = `Your ${brand} verification code: ${code}`;

  const textContent = [
    `${brand} verification code`,
    ``,
    `Your one-time verification code is: ${code}`,
    ``,
    `This code expires in ${ttl} minutes. If you did not try to sign in, you can ignore this message.`,
  ].join("\n");

  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0b13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b13;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#15151f;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px;">
            <tr><td>
              <div style="font-size:11px;font-weight:600;color:#a78bfa;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;">${brand} Security</div>
              <h1 style="margin:0 0 12px;font-size:22px;color:#ffffff;font-weight:700;letter-spacing:-0.01em;">Verify it's you</h1>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#94a3b8;">
                Use the code below to finish signing in. It expires in <strong style="color:#ffffff;">${ttl} minutes</strong>.
              </p>

              <div style="background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.3);border-radius:14px;padding:24px;text-align:center;margin:0 0 28px;">
                <div style="font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:34px;letter-spacing:0.5em;color:#ffffff;font-weight:700;padding-left:0.5em;">
                  ${code.split("").join("")}
                </div>
              </div>

              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                Didn't try to sign in? You can safely ignore this email — your account stays locked until the correct code is entered.
              </p>
            </td></tr>
          </table>
          <div style="margin-top:18px;font-size:11px;color:#475569;">Sent by ${brand}</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, htmlContent, textContent };
}

/** Renders credential email for a newly created teacher or student (Albanian). */
export function renderCredentialEmail(opts: {
  name: string;
  email: string;
  password: string;
  role: 'teacher' | 'student';
  loginUrl: string;
  brandName?: string;
}) {
  const brand = (opts.brandName || 'QuizMaster').trim();
  const isTeacher = opts.role === 'teacher';

  const subject = isTeacher
    ? `Ftesë për akses në ${brand}`
    : `Llogaria juaj në ${brand} është krijuar`;

  const roleLabel = isTeacher ? 'mësues' : 'student';
  const accentColor = isTeacher ? '#6366f1' : '#10b981';
  const greeting = isTeacher
    ? `Ju jeni ftuar si <strong>${roleLabel}</strong> në platformën <strong>${brand}</strong>.`
    : `Llogaria juaj si <strong>${roleLabel}</strong> në platformën <strong>${brand}</strong> është krijuar me sukses.`;

  const textContent = [
    `Përshëndetje ${opts.name},`,
    ``,
    greeting.replace(/<[^>]+>/g, ''),
    ``,
    `Kredencialet tuaja janë:`,
    `  Email: ${opts.email}`,
    `  Fjalëkalim: ${opts.password}`,
    ``,
    `Klikoni këtu për t'u kyçur: ${opts.loginUrl}`,
    ``,
    `Ju mirëpresim!`,
    `Ekipi i ${brand}`,
  ].join('\n');

  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:${accentColor};padding:32px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">${isTeacher ? 'Ftesë Mësuesi' : 'Llogari e Re Studenti'}</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">Përshëndetje, ${opts.name}!</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">${greeting}</p>

          <!-- Credentials box -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Kredencialet e aksesit</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;width:90px;">📧 Email</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${opts.email}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">🔑 Fjalëkalim</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;font-family:'Courier New',monospace;">${opts.password}</td>
              </tr>
            </table>
          </div>

          <!-- Login button -->
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${opts.loginUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;">
              🔗 Kyçu tani
            </a>
          </div>

          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            Nëse keni pyetje, na kontaktoni. Mos e ndani fjalëkalimin tuaj me askënd tjetër.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">Dërguar nga platforma <strong>${brand}</strong> · Ju mirëpresim!</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, htmlContent, textContent };
}

/** Renders a payment invoice email for a student (Albanian). */
export function renderInvoiceEmail(opts: {
  studentName: string;
  amount: number;
  monthLabel: string;
  notes?: string;
  paidAt: string;
  brandName?: string;
}) {
  const brand = (opts.brandName || 'QuizMaster').trim();
  const subject = `Faturë pagese — ${opts.monthLabel} | ${brand}`;
  const amountStr = opts.amount > 0 ? `€${opts.amount.toFixed(2)}` : '—';
  let dateStr = opts.paidAt.slice(0, 10);
  try { dateStr = new Date(opts.paidAt).toLocaleDateString('sq-AL', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { /* keep fallback */ }

  const textContent = [
    `Faturë Pagese — ${brand}`,
    ``,
    `I nderuar/e ${opts.studentName},`,
    `Pagesa juaj për muajin ${opts.monthLabel} u konfirmua me sukses.`,
    ``,
    `Muaji: ${opts.monthLabel}`,
    `Shuma: ${amountStr}`,
    `Data: ${dateStr}`,
    opts.notes ? `Shënime: ${opts.notes}` : '',
    ``,
    `Ju faleminderit! — Ekipi i ${brand}`,
  ].filter(Boolean).join('\n');

  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:#10b981;padding:32px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Konfirmim Pagese ✓</div>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">Përshëndetje, ${opts.studentName}!</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
            Pagesa juaj për muajin <strong>${opts.monthLabel}</strong> u konfirmua me sukses.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Detajet e Faturës</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;width:110px;">📅 Muaji</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${opts.monthLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">💶 Shuma</td>
                <td style="padding:6px 0;font-size:16px;font-weight:800;color:#10b981;">${amountStr}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">🗓️ Data</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${dateStr}</td>
              </tr>
              ${opts.notes ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;">📝 Shënime</td><td style="padding:6px 0;font-size:13px;color:#374151;">${opts.notes}</td></tr>` : ''}
            </table>
          </div>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            Ruajeni këtë email si dëshmi pagese. Nëse keni pyetje, na kontaktoni.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">Dërguar nga platforma <strong>${brand}</strong> · Ju faleminderit!</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, htmlContent, textContent };
}
