import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  handleUpdate: vi.fn(),
  botLog: vi.fn(),
  webhookEnv: vi.fn(),
  getTelegramBot: vi.fn(),
  rateLimit: vi.fn(),
  claimTelegramUpdate: vi.fn(),
  completeTelegramUpdate: vi.fn(),
  releaseTelegramUpdate: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  webhookEnv: mocks.webhookEnv
}));
vi.mock("@/lib/telegram/bot", () => ({ getTelegramBot: mocks.getTelegramBot }));
vi.mock("@/lib/logs", () => ({ safeBotLog: mocks.botLog }));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  requestIp: () => "127.0.0.1"
}));
vi.mock("@/lib/telegram/processed-updates", () => ({
  claimTelegramUpdate: mocks.claimTelegramUpdate,
  completeTelegramUpdate: mocks.completeTelegramUpdate,
  releaseTelegramUpdate: mocks.releaseTelegramUpdate
}));
vi.mock("@/lib/security/secrets", () => ({ safeEqual: (received: unknown, expected: string) => received === expected }));
vi.mock("@/lib/app-version", () => ({ appVersion: () => "test-version" }));
vi.mock("server-only", () => ({}));

import { POST } from "./route";
import { MAX_WEBHOOK_BODY_BYTES, parseWebhookPayload } from "@/lib/telegram/webhook-payload";

const update = {
  update_id: 42,
  message: {
    message_id: 1,
    date: 1,
    text: "/start",
    from: { id: 123, is_bot: false, first_name: "Ada", username: "ada" },
    chat: { id: 123, type: "private" }
  }
};

function request(secret = "webhook-secret-value") {
  return requestWithBody(update, secret);
}

function requestWithBody(body: unknown, secret = "webhook-secret-value") {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(body)
  });
}

function requestWithoutSecret(body: unknown = update) {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret-value");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret-value");
    mocks.webhookEnv.mockReset().mockReturnValue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
      TELEGRAM_BOT_TOKEN: "123456789:telegram-bot-secret-value",
      TELEGRAM_WEBHOOK_SECRET: "webhook-secret-value"
    });
    mocks.getTelegramBot.mockReset().mockResolvedValue({ handleUpdate: mocks.handleUpdate });
    mocks.handleUpdate.mockReset();
    mocks.botLog.mockReset().mockResolvedValue(true);
    mocks.rateLimit.mockReset().mockReturnValue({ allowed: false, retryAfter: 60 });
    mocks.claimTelegramUpdate.mockReset().mockResolvedValue({
      claimed: true,
      token: "00000000-0000-4000-8000-000000000042",
      leaseUntil: "2026-07-10T12:02:00.000Z"
    });
    mocks.completeTelegramUpdate.mockReset().mockResolvedValue(undefined);
    mocks.releaseTelegramUpdate.mockReset().mockResolvedValue(true);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("devuelve 401 si el secret de Telegram es incorrecto", async () => {
    const response = await POST(request("incorrecto"));
    expect(response.status).toBe(401);
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("devuelve 401 si falta el secret de Telegram", async () => {
    const response = await POST(requestWithoutSecret());
    expect(response.status).toBe(401);
    expect(mocks.webhookEnv).toHaveBeenCalled();
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("usa webhookEnv como fuente del secret, no process.env directo", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "otro-secret-en-process-env");
    mocks.webhookEnv.mockReturnValueOnce({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
      TELEGRAM_BOT_TOKEN: "123456789:telegram-bot-secret-value",
      TELEGRAM_WEBHOOK_SECRET: "webhook-secret-value"
    });

    const response = await POST(request("webhook-secret-value"));

    expect(response.status).toBe(200);
    expect(mocks.handleUpdate).toHaveBeenCalledWith(update);
  });

  it("entrega un /start válido al bot", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.claimTelegramUpdate).toHaveBeenCalledWith(42);
    expect(mocks.completeTelegramUpdate).toHaveBeenCalledWith(42, "00000000-0000-4000-8000-000000000042");
    expect(mocks.handleUpdate).toHaveBeenCalledWith(update);
    expect(mocks.claimTelegramUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.handleUpdate.mock.invocationCallOrder[0]);
    expect(mocks.handleUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.completeTelegramUpdate.mock.invocationCallOrder[0]);
  });

  it("responde ok sin reprocesar updates ya vistos por update_id", async () => {
    mocks.claimTelegramUpdate.mockResolvedValueOnce({ claimed: false, duplicate: true, inProgress: false, leaseUntil: null });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, duplicate: true });
    expect(mocks.getTelegramBot).not.toHaveBeenCalled();
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
    expect(mocks.completeTelegramUpdate).not.toHaveBeenCalled();
  });

  it("libera el claim de un update cuyo handler falla para permitir retry", async () => {
    mocks.handleUpdate.mockRejectedValueOnce(new Error("fallo temporal"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.completeTelegramUpdate).not.toHaveBeenCalled();
    expect(mocks.releaseTelegramUpdate).toHaveBeenCalledWith(42, "00000000-0000-4000-8000-000000000042");
  });

  it("devuelve 503 sin efectos si otro worker mantiene el lease", async () => {
    mocks.claimTelegramUpdate.mockResolvedValueOnce({
      claimed: false,
      duplicate: false,
      inProgress: true,
      leaseUntil: "2026-07-10T12:02:00.000Z"
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(body).toEqual({ ok: false, retryable: true, in_progress: true });
    expect(mocks.getTelegramBot).not.toHaveBeenCalled();
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
    expect(mocks.completeTelegramUpdate).not.toHaveBeenCalled();
  });

  it("dos entregas concurrentes ejecutan los efectos una sola vez", async () => {
    let finishFirst: (() => void) | undefined;
    mocks.handleUpdate.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    mocks.claimTelegramUpdate
      .mockResolvedValueOnce({ claimed: true, token: "00000000-0000-4000-8000-000000000042", leaseUntil: "2026-07-10T12:02:00.000Z" })
      .mockResolvedValueOnce({ claimed: false, duplicate: false, inProgress: true, leaseUntil: "2026-07-10T12:02:00.000Z" });

    const firstResponse = POST(request());
    await vi.waitFor(() => expect(mocks.handleUpdate).toHaveBeenCalledTimes(1));
    const secondResponse = await POST(request());
    finishFirst?.();
    const completedFirstResponse = await firstResponse;

    expect(completedFirstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(503);
    expect(mocks.handleUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.completeTelegramUpdate).toHaveBeenCalledTimes(1);
  });

  it("no aplica rate limit por IP al webhook autenticado", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.handleUpdate).toHaveBeenCalledWith(update);
  });

  it("acepta campos extra de Telegram sin romper validación", async () => {
    const extraUpdate = {
      ...update,
      unexpected_future_field: { nested: true },
      message: { ...update.message, extra_message_field: "ok" }
    };
    const response = await POST(requestWithBody(extraUpdate));
    expect(response.status).toBe(200);
    expect(mocks.handleUpdate).toHaveBeenCalledWith(extraUpdate);
  });

  it("guarda metadata no-null y responde 500 retryable cuando falla el handler", async () => {
    mocks.handleUpdate.mockRejectedValueOnce(new Error("falló con service-role-secret-value"));
    const response = await POST(request());
    const body = await response.json();
    const options = mocks.botLog.mock.calls[0]?.[2];

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, logged: true, retryable: true });
    expect(options.metadata).toMatchObject({
      error_message: "falló con [REDACTED]",
      error_name: "Error",
      update_id: 42,
      message_text: "/start",
      telegram_user_id: 123,
      telegram_username: "ada",
      chat_id: 123,
      chat_type: "private",
      current_step: "handle_update"
    });
    expect(options.metadata).not.toBeNull();
  });

  it("devuelve error de configuración si webhookEnv falla antes de autenticar", async () => {
    mocks.webhookEnv.mockImplementationOnce(() => { throw new Error("Falta TELEGRAM_BOT_TOKEN"); });
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "configuration_error" });
    expect(mocks.botLog).not.toHaveBeenCalled();
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
  });

  it("loguea un fallo de inicialización del bot y responde 500 para que Telegram reintente", async () => {
    mocks.getTelegramBot.mockRejectedValueOnce(new Error("Bot initialization failed"));
    const response = await POST(request());
    const body = await response.json();
    const options = mocks.botLog.mock.calls[0]?.[2];

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, logged: true, retryable: true });
    expect(options.metadata).toMatchObject({
      error_message: "Bot initialization failed",
      current_step: "initialize_bot",
      message_text: "/start",
      telegram_user_id: 123
    });
  });

  it("payloads raros autenticados no rompen el webhook y quedan logueados", async () => {
    const response = await POST(requestWithBody({ update_id: 99 }));
    const body = await response.json();
    const options = mocks.botLog.mock.calls[0]?.[2];

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: false, logged: true, retryable: false });
    expect(mocks.handleUpdate).not.toHaveBeenCalled();
    expect(options.metadata).toMatchObject({
      update_id: 99,
      message_text: null,
      telegram_user_id: null,
      chat_id: null,
      current_step: "validate_update"
    });
  });

  it("sanitiza y recorta contenido malicioso antes de guardarlo en metadata", async () => {
    const malicious = `/start 123456789:telegram-bot-secret-value ${"A".repeat(900)}\u0000<script>alert(1)</script>`;
    mocks.handleUpdate.mockRejectedValueOnce(new Error("boom"));

    await POST(requestWithBody({
      ...update,
      message: {
        ...update.message,
        text: malicious
      }
    }));

    const metadata = mocks.botLog.mock.calls[0]?.[2]?.metadata;
    expect(metadata.message_text).not.toContain("telegram-bot-secret-value");
    expect(metadata.message_text).not.toContain("\u0000");
    expect(metadata.message_text).toContain("[REDACTED]");
    expect(metadata.message_text.length).toBeLessThanOrEqual(512);
  });
});
