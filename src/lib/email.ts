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

export type EmailLanguage = 'sq' | 'en';

/** Renders a "new assignment" notification email for a student (Albanian or English). */
export function renderAssignmentEmail(opts: {
  studentName: string;
  title: string;
  description?: string | null;
  courseName?: string | null;
  className?: string | null;
  dueDate?: string | null;
  maxScore?: number | null;
  brandName?: string;
  loginUrl?: string;
  language?: EmailLanguage;
}) {
  const brand = (opts.brandName || 'QuizMaster').trim();
  const lang: EmailLanguage = opts.language === 'en' ? 'en' : 'sq';
  const isEn = lang === 'en';
  const subject = isEn ? `📝 New assignment: ${opts.title} | ${brand}` : `📝 Detyrë e re: ${opts.title} | ${brand}`;

  let dueDateStr = '';
  if (opts.dueDate) {
    try { dueDateStr = new Date(opts.dueDate).toLocaleDateString(isEn ? 'en-US' : 'sq-AL', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch { dueDateStr = String(opts.dueDate).slice(0, 10); }
  }

  const textContent = isEn ? [
    `New assignment — ${brand}`,
    ``,
    `Hi ${opts.studentName},`,
    `Your teacher has published a new assignment${opts.className ? ` for class "${opts.className}"` : ''}.`,
    ``,
    `Title: ${opts.title}`,
    opts.courseName ? `Course: ${opts.courseName}` : '',
    dueDateStr ? `Due date: ${dueDateStr}` : '',
    opts.maxScore != null ? `Max score: ${opts.maxScore}` : '',
    opts.description ? `\nDescription:\n${opts.description}` : '',
    ``,
    `Thank you! — The ${brand} Team`,
  ].filter(Boolean).join('\n') : [
    `Detyrë e re — ${brand}`,
    ``,
    `Përshëndetje ${opts.studentName},`,
    `Mësuesi juaj ka publikuar një detyrë të re${opts.className ? ` për klasën "${opts.className}"` : ''}.`,
    ``,
    `Titulli: ${opts.title}`,
    opts.courseName ? `Kursi: ${opts.courseName}` : '',
    dueDateStr ? `Afati: ${dueDateStr}` : '',
    opts.maxScore != null ? `Pikët maksimale: ${opts.maxScore}` : '',
    opts.description ? `\nPërshkrimi:\n${opts.description}` : '',
    ``,
    `Ju faleminderit! — Ekipi i ${brand}`,
  ].filter(Boolean).join('\n');

  const loginBtn = opts.loginUrl ? `
          <div style="text-align:center;margin-bottom:20px;">
            <a href="${opts.loginUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:12px;">
              🔗 ${isEn ? 'View assignment' : 'Shiko detyrën'}
            </a>
          </div>` : '';

  const t = isEn ? {
    headerTag: 'New Assignment 📝',
    greeting: `Hi, ${opts.studentName}!`,
    intro: `Your teacher has published a new assignment${opts.className ? ` for class <strong>${opts.className}</strong>` : ''}.`,
    detailsLabel: 'Assignment Details',
    titleLabel: '📌 Title', courseLabel: '📚 Course', dueLabel: '📅 Due date', scoreLabel: '🎯 Points',
    footerNote: 'This email was sent automatically when the teacher published a new assignment.',
    footer: `Sent by the <strong>${brand}</strong> platform · Thank you!`,
  } : {
    headerTag: 'Detyrë e Re 📝',
    greeting: `Përshëndetje, ${opts.studentName}!`,
    intro: `Mësuesi juaj ka publikuar një detyrë të re${opts.className ? ` për klasën <strong>${opts.className}</strong>` : ''}.`,
    detailsLabel: 'Detajet e Detyrës',
    titleLabel: '📌 Titulli', courseLabel: '📚 Kursi', dueLabel: '📅 Afati', scoreLabel: '🎯 Pikët',
    footerNote: 'Ky email dërgohet automatikisht kur mësuesi publikon një detyrë të re.',
    footer: `Dërguar nga platforma <strong>${brand}</strong> · Ju faleminderit!`,
  };

  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:#6366f1;padding:28px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">${t.headerTag}</div>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">${t.greeting}</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
            ${t.intro}
          </p>
          <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">${t.detailsLabel}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;width:110px;vertical-align:top;">${t.titleLabel}</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${opts.title}</td>
              </tr>
              ${opts.courseName ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;">${t.courseLabel}</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${opts.courseName}</td></tr>` : ''}
              ${dueDateStr ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;">${t.dueLabel}</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${dueDateStr}</td></tr>` : ''}
              ${opts.maxScore != null ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;">${t.scoreLabel}</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${opts.maxScore}</td></tr>` : ''}
            </table>
          </div>
          ${opts.description ? `<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#374151;white-space:pre-wrap;">${opts.description}</p>` : ''}
          ${loginBtn}
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            ${t.footerNote}
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">${t.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, htmlContent, textContent };
}

/** Renders a payment deadline reminder email for a student (Albanian). */
export function renderPaymentReminderEmail(opts: {
  studentName: string;
  monthLabel: string;
  dayOfMonth: number;
  brandName?: string;
  loginUrl?: string;
}) {
  const brand = (opts.brandName || 'QuizMaster').trim();
  const subject = `⏰ Kujtues pagese — ${opts.monthLabel} | ${brand}`;
  const daysLate = Math.max(0, opts.dayOfMonth - 5);
  const urgency = daysLate >= 10 ? 'Urgjente' : daysLate >= 5 ? 'Afati po afrohet' : 'Kujtues mujor';

  const textContent = [
    `${urgency} — ${brand}`,
    ``,
    `I nderuar/e ${opts.studentName},`,
    `Ju kujtojmë se pagesa juaj për muajin ${opts.monthLabel} është e papaguar.`,
    ``,
    `Ju lutemi kontaktoni administratorin tuaj sa më parë.`,
    ``,
    `Ju faleminderit! — Ekipi i ${brand}`,
  ].join('\n');

  const accentColor = daysLate >= 10 ? '#ef4444' : daysLate >= 5 ? '#f97316' : '#f59e0b';
  const bgColor    = daysLate >= 10 ? '#fef2f2' : daysLate >= 5 ? '#fff7ed' : '#fefce8';
  const borderColor= daysLate >= 10 ? '#fecaca' : daysLate >= 5 ? '#fed7aa' : '#fde68a';

  const loginBtn = opts.loginUrl ? `
          <div style="text-align:center;margin-bottom:20px;">
            <a href="${opts.loginUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:12px;">
              🔗 Kyçu dhe shiko detajet
            </a>
          </div>` : '';

  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:${accentColor};padding:28px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">${urgency} ⏰</div>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">Përshëndetje, ${opts.studentName}!</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
            Ju kujtojmë se pagesa juaj mujore për <strong>${opts.monthLabel}</strong> ende nuk është regjistruar.
          </p>
          <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:14px;padding:18px 22px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
              📅 <strong>Afati:</strong> dita e 5-të e muajit<br>
              💶 <strong>Muaji:</strong> ${opts.monthLabel}<br>
              📌 <strong>Statusi:</strong> E papaguar
            </p>
          </div>
          ${loginBtn}
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            Nëse pagesa tashmë është bërë, ju lutemi kontaktoni administratorin. Ky email dërgohet automatikisht nga sistemi.
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

/** Email informues për studentin kur krijohet llogaria me periudhë prove falas (shqip). */
export function renderTrialWelcomeEmail(opts: {
  name: string;
  email: string;
  trialDays: number;
  trialEndsAt: string;
  loginUrl?: string;
  brandName?: string;
}) {
  const brand = (opts.brandName || "QuizMaster").trim();

  let expiryDate = opts.trialEndsAt;
  try {
    const d = new Date(opts.trialEndsAt);
    if (!isNaN(d.getTime())) {
      expiryDate = d.toLocaleDateString("sq-AL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  } catch { /* fallback to raw ISO */ }

  const subject = `Mirë se vini në ${brand} — ${opts.trialDays} ditë falas nga sot`;

  const loginBtn = opts.loginUrl
    ? `<div style="text-align:center;margin-bottom:24px;"><a href="${opts.loginUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:12px;">🎓 Kyçuni tani</a></div>`
    : "";

  const textContent = [
    `Mirë se vini në ${brand}, ${opts.name}!`,
    ``,
    `Llogaria juaj është krijuar me sukses.`,
    `Keni ${opts.trialDays} ditë falas, duke filluar nga sot.`,
    ``,
    `Periudha falas mbaron më: ${expiryDate}`,
    ``,
    `Pas kësaj date duhet të bëni pagesën mujore për të vazhduar aksesimin e platformës.`,
    `Nëse pagesa nuk bëhet, aksesi do të ndalet automatikisht.`,
    ``,
    opts.loginUrl ? `Kyçuni: ${opts.loginUrl}` : ``,
    ``,
    `Ju faleminderit — Ekipi i ${brand}`,
  ].join("\n");

  const htmlContent = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:28px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.82);margin-top:4px;">Mirë se vini — periudha juaj falas 🎉</div>
        </td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a;">Përshëndetje, ${opts.name}!</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
            Llogaria juaj u krijua me sukses. Keni <strong>${opts.trialDays} ditë falas</strong> për të eksploruar platformën pa asnjë pagesë.
          </p>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:18px 22px;margin-bottom:16px;">
            <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.9;">
              📅 <strong>Fillon:</strong> sot (nga data e krijimit të llogarisë)<br>
              ⏰ <strong>Mbaron më:</strong> ${expiryDate}<br>
              🔢 <strong>Ditë falas:</strong> ${opts.trialDays} ditë
            </p>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:14px 18px;margin-bottom:24px;">
            <p style="margin:0;font-size:12px;color:#92400e;line-height:1.6;">
              ⚠️ Pas datës <strong>${expiryDate}</strong>, duhet të bëhet pagesa mujore.
              Nëse pagesa nuk kryhet, aksesi në platformë do të <strong>ndalet automatikisht</strong>.
              Kontaktoni mësuesin tuaj për ta rregulluar.
            </p>
          </div>
          ${loginBtn}
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            Llogaria: <strong>${opts.email}</strong><br>
            Ky email është dërguar automatikisht nga sistemi.
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
