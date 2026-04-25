import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const baseFromEnv = process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "");
const pathSuffix = "/api/telegram/error-webhook";

function usage(): void {
  console.log(`
Usage:
  npm run telegram:set-webhook

Requires in .env:
  TELEGRAM_BOT_TOKEN=...
  TELEGRAM_WEBHOOK_BASE_URL=https://your-public-host   (no trailing slash; e.g. ngrok URL)

Optional CLI override (full webhook URL):
  npx tsx scripts/set-telegram-webhook.ts https://abc.ngrok-free.app/api/telegram/error-webhook

Telegram requires HTTPS and a reachable public URL (localhost is not enough unless tunneled).
`);
}

async function main(): Promise<void> {
  const cliUrl = process.argv[2]?.trim();
  if (!token) {
    console.error("Missing TELEGRAM_BOT_TOKEN in .env");
    usage();
    process.exit(1);
  }

  const webhookUrl = cliUrl
    ? cliUrl
    : baseFromEnv
      ? `${baseFromEnv}${pathSuffix}`
      : "";

  if (!webhookUrl) {
    console.error("Missing webhook URL. Set TELEGRAM_WEBHOOK_BASE_URL in .env or pass full URL as argument.");
    usage();
    process.exit(1);
  }

  if (!/^https:\/\//i.test(webhookUrl)) {
    console.error("Webhook URL must start with https://");
    process.exit(1);
  }

  const setUrl = `https://api.telegram.org/bot${encodeURIComponent(token)}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
  const res = await fetch(setUrl, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok || json?.ok === false) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
