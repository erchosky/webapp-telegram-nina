import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalEnv = { ...process.env };

function setWebhookEnv() {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-with-enough-length",
    TELEGRAM_BOT_TOKEN: "telegram-bot-token-with-enough-length",
    TELEGRAM_WEBHOOK_SECRET: "webhook_secret_123",
    TELEGRAM_GROUP_CHAT_ID: "-1001234567890",
  };
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_DASHBOARD_PASSWORD;
  delete process.env.SESSION_SECRET;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.CRON_SECRET;
}

describe("webhookEnv", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("no requiere secretos exclusivos de admin ni cron", async () => {
    setWebhookEnv();
    const { webhookEnv } = await import("./env");

    expect(webhookEnv()).toMatchObject({
      SUPABASE_URL: "https://example.supabase.co",
      TELEGRAM_WEBHOOK_SECRET: "webhook_secret_123",
      TELEGRAM_GROUP_CHAT_ID: -1001234567890,
    });
  });
});
