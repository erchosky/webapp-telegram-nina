import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  serverEnv: vi.fn(),
  checkExpired: vi.fn(),
  checkRateLimit: vi.fn(),
  safeBotLog: vi.fn(),
  claimCronExecution: vi.fn(),
  releaseCronExecution: vi.fn()
}));

vi.mock("@/lib/env", () => ({ serverEnv: mocks.serverEnv }));
vi.mock("@/lib/cron/checkExpired", () => ({ checkExpired: mocks.checkExpired }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/security/secrets", () => ({ safeEqual: (received: unknown, expected: string) => received === expected }));
vi.mock("@/lib/logs", () => ({ safeBotLog: mocks.safeBotLog }));
vi.mock("@/lib/cron/execution-lock", () => ({
  claimCronExecution: mocks.claimCronExecution,
  releaseCronExecution: mocks.releaseCronExecution
}));

import { POST } from "./route";

function cronRequest(secret = "cron-secret") {
  return new NextRequest("https://vip.example.com/api/cron/check-expired", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` }
  });
}

describe("POST /api/cron/check-expired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverEnv.mockReturnValue({ CRON_SECRET: "cron-secret" });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    mocks.checkExpired.mockResolvedValue({ ok: true });
    mocks.safeBotLog.mockResolvedValue(true);
    mocks.claimCronExecution.mockResolvedValue({
      acquired: true,
      token: "00000000-0000-4000-8000-000000000099",
      leaseUntil: "2026-07-10T12:02:00.000Z"
    });
    mocks.releaseCronExecution.mockResolvedValue(true);
  });

  it("aplica el wrapper comun de rate limit antes de ejecutar el cron", async () => {
    const response = await POST(cronRequest());

    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("cron:check-expired", 4, 60_000);
    expect(mocks.checkExpired).toHaveBeenCalled();
    expect(mocks.releaseCronExecution).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000099");
  });

  it("no permite saltarse el límite cambiando headers de proxy", async () => {
    const first = cronRequest();
    first.headers.set("x-forwarded-for", "198.51.100.1");
    const second = cronRequest();
    second.headers.set("x-forwarded-for", "203.0.113.99");

    await POST(first);
    await POST(second);

    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(1, "cron:check-expired", 4, 60_000);
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(2, "cron:check-expired", 4, 60_000);
  });

  it("rechaza una llamada directa con un secreto de cron incorrecto", async () => {
    const response = await POST(cronRequest("incorrect-secret"));

    expect(response.status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.claimCronExecution).not.toHaveBeenCalled();
    expect(mocks.checkExpired).not.toHaveBeenCalled();
  });

  it("devuelve 429 si el rate limit distribuido bloquea la llamada", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 30 });

    const response = await POST(cronRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(mocks.claimCronExecution).not.toHaveBeenCalled();
    expect(mocks.checkExpired).not.toHaveBeenCalled();
  });

  it("omite una segunda ejecución mientras el lock global está activo", async () => {
    mocks.claimCronExecution.mockResolvedValueOnce({ acquired: false, leaseUntil: "2026-07-10T12:02:00.000Z" });

    const response = await POST(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, skipped: true, reason: "already_running" });
    expect(mocks.checkExpired).not.toHaveBeenCalled();
    expect(mocks.releaseCronExecution).not.toHaveBeenCalled();
  });

  it("dos llamadas concurrentes ejecutan checkExpired una sola vez", async () => {
    let finishFirst: (() => void) | undefined;
    mocks.checkExpired.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = () => resolve({ ok: true }); }));
    mocks.claimCronExecution
      .mockResolvedValueOnce({ acquired: true, token: "00000000-0000-4000-8000-000000000099", leaseUntil: "2026-07-10T12:02:00.000Z" })
      .mockResolvedValueOnce({ acquired: false, leaseUntil: "2026-07-10T12:02:00.000Z" });

    const firstResponse = POST(cronRequest());
    await vi.waitFor(() => expect(mocks.checkExpired).toHaveBeenCalledTimes(1));
    const secondResponse = await POST(cronRequest());
    finishFirst?.();
    const completedFirstResponse = await firstResponse;

    expect(completedFirstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual({ ok: true, skipped: true, reason: "already_running" });
    expect(mocks.checkExpired).toHaveBeenCalledTimes(1);
    expect(mocks.releaseCronExecution).toHaveBeenCalledTimes(1);
  });

  it("libera el lock incluso cuando checkExpired falla", async () => {
    mocks.checkExpired.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(cronRequest());

    expect(response.status).toBe(500);
    expect(mocks.releaseCronExecution).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000099");
  });
});
