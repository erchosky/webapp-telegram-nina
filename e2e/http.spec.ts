import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { localClients } from "../integration/support/local-supabase";
import {
  createTelegramInitData,
  createTelegramUpdate,
  tamperInitDataHash,
  TEST_TELEGRAM_USERS,
} from "../test/support/telegram-simulator";

const PUBLIC_ITEM = "70000000-0000-4000-8000-000000000001";
const HIDDEN_ITEM = "70000000-0000-4000-8000-000000000002";
const WEBHOOK_SECRET = "fixture_webhook_secret_2026";
const CRON_SECRET = "fixture-cron-secret-2026";
const fakeTelegramOrigin = "http://127.0.0.1:4010";

function telegramHeaders(initData = createTelegramInitData()) {
  return { authorization: `tma ${initData}` };
}

test.describe("real HTTP surfaces", () => {
  const { service } = localClients();

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "HTTP surface is browser-independent and runs once");
    await service.from("rate_limit_buckets").delete().like("key", "/api/%");
    await service.from("rate_limit_buckets").delete().eq("key", "cron:check-expired");
  });

  test.afterAll(async () => {
    await service.from("telegram_users").delete().eq("telegram_user_id", 700009999);
    await service.from("telegram_users").delete().eq("telegram_user_id", 700008888);
  });

  test("authenticates valid Telegram credentials and rejects absent, altered, old and future ones", async ({ request }) => {
    const valid = await request.get("/api/me", { headers: telegramHeaders() });
    expect(valid.status()).toBe(200);
    expect(valid.headers()["cache-control"]).toContain("no-store");

    const absent = await request.get("/api/me");
    const altered = await request.get("/api/me", {
      headers: telegramHeaders(tamperInitDataHash(createTelegramInitData())),
    });
    const old = await request.get("/api/me", {
      headers: telegramHeaders(createTelegramInitData({ authDate: Math.floor(Date.now() / 1000) - 7_201 })),
    });
    const future = await request.get("/api/me", {
      headers: telegramHeaders(createTelegramInitData({ authDate: Math.floor(Date.now() / 1000) + 61 })),
    });
    expect([absent.status(), altered.status(), old.status(), future.status()]).toEqual([401, 401, 401, 401]);
  });

  test("binds identity to initData and rejects malformed marketplace bodies and direct hidden IDs", async ({ request }) => {
    const otherHeaders = {
      ...telegramHeaders(createTelegramInitData({ user: TEST_TELEGRAM_USERS.otherMember })),
      "content-type": "application/json",
    };
    for (const data of ["null", "[]", JSON.stringify({ itemId: PUBLIC_ITEM, extra: true })]) {
      const response = await request.post("/api/marketplace/interest", { headers: otherHeaders, data });
      expect(response.status()).toBe(400);
    }
    const wrongType = await request.post("/api/marketplace/interest", {
      headers: { ...telegramHeaders(), "content-type": "text/plain" },
      data: JSON.stringify({ itemId: PUBLIC_ITEM }),
    });
    expect(wrongType.status()).toBe(415);
    const oversized = await request.post("/api/marketplace/interest", {
      headers: otherHeaders,
      data: JSON.stringify({ itemId: PUBLIC_ITEM, message: "x".repeat(20_000) }),
    });
    expect(oversized.status()).toBe(413);
    const hidden = await request.post("/api/marketplace/interest", {
      headers: otherHeaders,
      data: JSON.stringify({ itemId: HIDDEN_ITEM }),
    });
    expect(hidden.status()).toBe(404);
    await expect(hidden.json()).resolves.toMatchObject({ ok: false, error: { code: "item_not_visible" } });

    expect((await request.get("/api/marketplace/interest", { headers: telegramHeaders() })).status()).toBe(405);
    expect((await request.post("/api/marketplace", { data: "{}" })).status()).toBe(405);
  });

  test("rate limiting cannot be bypassed by forged forwarding headers", async ({ request }) => {
    const initData = createTelegramInitData({
      user: {
        id: 700008888,
        first_name: "Rate Limit Fixture",
        username: "rate_limit_fixture",
      },
    });
    const calls = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      request.post("/api/marketplace/interest", {
        headers: {
          ...telegramHeaders(initData),
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${index + 1}`,
        },
        data: JSON.stringify({ itemId: HIDDEN_ITEM }),
      })));
    expect(calls.filter((response) => response.status() === 429)).toHaveLength(1);
  });

  test("protects cron secret and observes the global database lease over HTTP", async ({ request }) => {
    expect((await request.post("/api/cron/check-expired", {
      headers: { authorization: "Bearer wrong-secret" },
    })).status()).toBe(401);

    const claimed = await service.rpc("claim_system_job_lock", {
      p_job_name: "check-expired",
      p_lease_seconds: 120,
    });
    expect(claimed.error).toBeNull();
    const token = Array.isArray(claimed.data) ? claimed.data[0]?.lease_token as string | undefined : undefined;
    expect(token).toBeTruthy();
    try {
      const skipped = await request.post("/api/cron/check-expired", {
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
          "x-forwarded-for": "203.0.113.250",
        },
      });
      expect(skipped.status()).toBe(200);
      await expect(skipped.json()).resolves.toMatchObject({ ok: true, skipped: true, reason: "already_running" });
    } finally {
      if (token) await service.rpc("release_system_job_lock", {
        p_job_name: "check-expired",
        p_lease_token: token,
      });
    }
  });

  test("handles valid, duplicate and concurrent webhook delivery exactly once", async ({ request }) => {
    await service.from("processed_telegram_updates").delete().in("update_id", [910009999, 910010000]);
    await service.from("telegram_users").delete().eq("telegram_user_id", 700009999);
    await fetch(`${fakeTelegramOrigin}/__test__/reset`, { method: "POST", body: "{}" });
    const webhookHeaders = {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
    };
    const user = { id: 700009999, first_name: "Webhook Fixture", username: "webhook_fixture" };
    const update = createTelegramUpdate({ updateId: 910009999, user, text: "/start" });
    const first = await request.post("/api/telegram/webhook", {
      headers: webhookHeaders,
      data: JSON.stringify(update),
    });
    expect(first.status()).toBe(200);
    const duplicate = await request.post("/api/telegram/webhook", {
      headers: webhookHeaders,
      data: JSON.stringify(update),
    });
    expect(duplicate.status()).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({ ok: true, duplicate: true });

    await fetch(`${fakeTelegramOrigin}/__test__/delay-next`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "sendMessage", delayMs: 350 }),
    });
    const concurrent = createTelegramUpdate({ updateId: 910010000, user, text: "/estado" });
    const stateBefore = await fetch(`${fakeTelegramOrigin}/__test__/state`).then((response) => response.json()) as {
      counts?: Record<string, number>;
    };
    const sendMessageBefore = stateBefore.counts?.sendMessage ?? 0;
    const firstConcurrent = request.post("/api/telegram/webhook", {
      headers: webhookHeaders,
      data: JSON.stringify(concurrent),
    });
    await expect.poll(async () => {
      const state = await fetch(`${fakeTelegramOrigin}/__test__/state`).then((response) => response.json()) as {
        counts?: Record<string, number>;
      };
      return state.counts?.sendMessage ?? 0;
    }).toBeGreaterThan(sendMessageBefore);
    const secondConcurrent = await request.post("/api/telegram/webhook", {
      headers: webhookHeaders,
      data: JSON.stringify(concurrent),
    });
    const responses = [await firstConcurrent, secondConcurrent];
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 503]);
  });

  test("rejects webhook secret, invalid shapes, oversized and compressed bodies", async ({ request }) => {
    const update = createTelegramUpdate({ updateId: 910010001 });
    const wrongSecret = await request.post("/api/telegram/webhook", {
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "wrong" },
      data: JSON.stringify(update),
    });
    expect(wrongSecret.status()).toBe(401);

    const headers = {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
    };
    for (const data of ["{bad", "null", "[]"]) {
      const response = await request.post("/api/telegram/webhook", { headers, data });
      expect(response.status()).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: false, retryable: false });
    }
    const oversizedBody = JSON.stringify({ ...update, padding: "x".repeat(1_048_576) });
    const oversized = await request.post("/api/telegram/webhook", { headers, data: oversizedBody });
    expect(oversized.status()).toBe(200);

    const compressed = gzipSync(oversizedBody);
    const compressedResponse = await request.post("/api/telegram/webhook", {
      headers: { ...headers, "content-encoding": "gzip" },
      data: compressed,
    });
    expect(compressedResponse.status()).toBe(200);
    await expect(compressedResponse.json()).resolves.toMatchObject({ ok: false, retryable: false });
  });
});
