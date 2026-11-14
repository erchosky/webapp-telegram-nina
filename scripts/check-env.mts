import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.argv[2] ?? ".env.local";
const envPath = resolve(process.cwd(), envFile);

const required = [
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_GROUP_CHAT_ID",
  "TELEGRAM_ADMIN_ALERT_CHAT_ID",
  "CRON_SECRET",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
  "TELEGRAM_INIT_DATA_MAX_AGE_SECONDS",
  "NEXT_PUBLIC_ENABLE_REFERRALS",
  "NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS",
  "NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES",
  "NEXT_PUBLIC_CREATOR_NAME",
  "NEXT_PUBLIC_PRODUCT_NAME",
  "NEXT_PUBLIC_ADMIN_CONTACT",
] as const;

const placeholderPattern = /replace_with|TU_DOMINIO|tu-proyecto|usuario_admin|Nombre creadora|Mi VIP/i;

if (!existsSync(envPath)) {
  console.error(`No existe ${envFile}. Copia .env.example a ${envFile} y rellena staging.`);
  process.exit(1);
}

const env = parseEnv(readFileSync(envPath, "utf8"));
const problems: string[] = [];

for (const key of required) {
  const value = env[key]?.trim();
  if (!value) {
    problems.push(`${key}: falta valor`);
  } else if (placeholderPattern.test(value)) {
    problems.push(`${key}: parece placeholder`);
  }
}

const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
if (webhookSecret && !/^[A-Za-z0-9_-]{16,}$/.test(webhookSecret)) {
  problems.push("TELEGRAM_WEBHOOK_SECRET: usa al menos 16 caracteres A-Z, a-z, 0-9, _ o -");
}

const groupChatId = env.TELEGRAM_GROUP_CHAT_ID;
if (groupChatId && !placeholderPattern.test(groupChatId) && !/^-?\d+$/.test(groupChatId)) {
  problems.push("TELEGRAM_GROUP_CHAT_ID: debe ser numerico, normalmente empieza por -100");
}

const alertChatId = env.TELEGRAM_ADMIN_ALERT_CHAT_ID;
if (alertChatId && !placeholderPattern.test(alertChatId) && !/^-?\d+$/.test(alertChatId)) {
  problems.push("TELEGRAM_ADMIN_ALERT_CHAT_ID: debe ser numerico");
}

const appUrl = env.NEXT_PUBLIC_APP_URL;
if (appUrl) {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      problems.push("NEXT_PUBLIC_APP_URL: staging/produccion debe usar https");
    }
  } catch {
    problems.push("NEXT_PUBLIC_APP_URL: URL invalida");
  }
}

for (const key of ["NEXT_PUBLIC_ENABLE_REFERRALS", "NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS", "NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES"] as const) {
  const value = env[key];
  if (value !== "true" && value !== "false") {
    problems.push(`${key}: usa true o false`);
  }
}

const initDataAge = Number(env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS);
if (!Number.isInteger(initDataAge) || initDataAge < 60 || initDataAge > 10_800) {
  problems.push("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: debe estar entre 60 y 10800");
}

if (problems.length) {
  console.error(`Env no listo para staging (${envFile}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Env staging basico OK: ${envFile}`);

function parseEnv(source: string) {
  const output: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}
