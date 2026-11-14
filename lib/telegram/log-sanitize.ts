import "server-only";
const SECRET_NAMES = [
  "TELEGRAM_BOT_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "CRON_SECRET",
  "TELEGRAM_WEBHOOK_SECRET",
  "ADMIN_PASSWORD"
];

export function sanitizeTelegramLogText(value: string, maxLength = 500) {
  let sanitized = value;
  for (const secret of SECRET_NAMES.map((name) => process.env[name]).filter(Boolean)) {
    sanitized = sanitized.replaceAll(secret!, "[REDACTED]");
  }
  sanitized = sanitized
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\b(TELEGRAM_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SESSION_SECRET|CRON_SECRET|TELEGRAM_WEBHOOK_SECRET|ADMIN_PASSWORD)\b["']?\s*[:=]\s*["']?[^\s,;"']+/gi, "$1=[REDACTED]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}…[truncated]` : sanitized;
}
