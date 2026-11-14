import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { startFakeTelegramServer } from "../test/support/fake-telegram-server.mts";

type LocalStatus = {
  API_URL: string;
  SERVICE_ROLE_KEY: string;
};

const appPort = process.env.E2E_APP_PORT ?? "3100";
const telegramPort = Number.parseInt(process.env.FAKE_TELEGRAM_PORT ?? "4010", 10);
const botToken =
  process.env.TELEGRAM_BOT_TOKEN ??
  "123456789:fixture_bot_token_2026";

const output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const jsonStart = output.indexOf("{");
if (jsonStart < 0) throw new Error("Supabase local is not running or did not return JSON status");
const status = JSON.parse(output.slice(jsonStart)) as LocalStatus;

const fakeTelegram = await startFakeTelegramServer({
  host: "127.0.0.1",
  port: telegramPort,
  botToken,
});

const nextBin = resolve("node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", appPort], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    E2E_TEST_MODE: "1",
    TEST_TELEGRAM_API_ROOT: fakeTelegram.origin,
    SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN: botToken,
    TELEGRAM_WEBHOOK_SECRET: "fixture_webhook_secret_2026",
    TELEGRAM_GROUP_CHAT_ID: "-100700000001",
    TELEGRAM_ADMIN_ALERT_CHAT_ID: "-100700000099",
    ADMIN_PASSWORD: "Fixture-admin-password-2026",
    SESSION_SECRET: "fixture-session-secret-2026-at-least-32-characters",
    CRON_SECRET: "fixture-cron-secret-2026",
    NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS: "true",
    NEXT_PUBLIC_ENABLE_REFERRALS: "true",
    NEXT_PUBLIC_ADMIN_CONTACT: "fixture_admin",
  },
});

let stopping = false;
async function stop(signal?: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  if (!child.killed) child.kill(signal ?? "SIGTERM");
  await fakeTelegram.close();
}

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));
child.once("error", async (error) => {
  console.error("e2e_next_start_failed", error);
  await stop();
  process.exitCode = 1;
});
child.once("exit", async (code, signal) => {
  await stop();
  if (!stopping || (code !== 0 && code !== null)) {
    console.error("e2e_next_stopped", { code, signal });
  }
  process.exitCode = code ?? (signal ? 1 : 0);
});
