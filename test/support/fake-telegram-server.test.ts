import { afterEach, describe, expect, it } from "vitest";
import { Bot } from "grammy";
import {
  startFakeTelegramServer,
  type FakeTelegramServer,
} from "./fake-telegram-server.mts";

const BOT_TOKEN = "123456789:local-test-token";
let fake: FakeTelegramServer | null = null;

afterEach(async () => {
  await fake?.close();
  fake = null;
});

describe("fake Telegram Bot API server", () => {
  it("is compatible with the grammY client used by the application", async () => {
    fake = await startFakeTelegramServer({ botToken: BOT_TOKEN });
    const bot = new Bot(BOT_TOKEN, { client: { apiRoot: fake.origin } });

    await bot.init();
    const message = await bot.api.sendMessage(42, "hola desde grammY");

    expect(bot.botInfo.username).toBe("local_test_bot");
    expect(message).toMatchObject({ chat: { id: 42 }, text: "hola desde grammY" });
    expect(fake.count("getMe")).toBe(1);
    expect(fake.count("sendMessage")).toBe(1);
  });

  it("serves the minimum Bot API and records calls", async () => {
    fake = await startFakeTelegramServer({ botToken: BOT_TOKEN });

    const meResponse = await telegramCall(fake.origin, "getMe");
    const messageResponse = await telegramCall(fake.origin, "sendMessage", {
      chat_id: 42,
      text: "hola",
    });
    const inviteResponse = await telegramCall(fake.origin, "createChatInviteLink", {
      chat_id: -100_000_000_001,
      member_limit: 1,
    });

    expect(meResponse).toMatchObject({ ok: true, result: { is_bot: true } });
    expect(messageResponse).toMatchObject({ ok: true, result: { chat: { id: 42 }, text: "hola" } });
    expect(inviteResponse).toMatchObject({ ok: true, result: { invite_link: "https://t.me/+local-test-1" } });
    expect(fake.count("getMe")).toBe(1);
    expect(fake.count("sendMessage")).toBe(1);
    expect(fake.calls()[1]).toMatchObject({
      method: "sendMessage",
      token: BOT_TOKEN,
      payload: { chat_id: 42, text: "hola" },
    });
  });

  it("exposes serializable counters and one-shot failure controls", async () => {
    fake = await startFakeTelegramServer({ botToken: BOT_TOKEN });
    await fetch(`${fake.origin}/__test__/fail-next`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: "sendMessage",
        httpStatus: 429,
        errorCode: 429,
        description: "Too Many Requests",
        retryAfter: 17,
      }),
    });

    const failed = await fetch(`${fake.origin}/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: 42, text: "first" }),
    });
    const retried = await fetch(`${fake.origin}/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: 42, text: "second" }),
    });
    const state = await fetch(`${fake.origin}/__test__/state`).then((response) => response.json());

    expect(failed.status).toBe(429);
    await expect(failed.json()).resolves.toMatchObject({
      ok: false,
      parameters: { retry_after: 17 },
    });
    expect(retried.status).toBe(200);
    expect(state).toMatchObject({ ok: true, counts: { sendMessage: 2 } });
  });

  it("rejects a token other than the configured synthetic token", async () => {
    fake = await startFakeTelegramServer({ botToken: BOT_TOKEN });

    const response = await fetch(`${fake.origin}/bot999:wrong/getMe`, { method: "POST" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error_code: 401 });
  });
});

async function telegramCall(
  origin: string,
  method: string,
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(`${origin}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<Record<string, unknown>>;
}
