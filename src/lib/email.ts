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
