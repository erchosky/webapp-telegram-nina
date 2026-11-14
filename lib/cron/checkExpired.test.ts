import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getExpiringSoon: vi.fn(),
  getExpiredActiveSubscriptions: vi.fn(),
  getPendingExpulsions: vi.fn(),
  botLog: vi.fn(),
  auditLog: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  sendMessage: vi.fn(),
  jobStarted: vi.fn(),
  jobFinished: vi.fn(),
  dueWarning: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/subscription-rules", () => ({ dueWarning: mocks.dueWarning }));
vi.mock("@/lib/subscriptions", () => ({
  getExpiringSoon: mocks.getExpiringSoon,
  getExpiredActiveSubscriptions: mocks.getExpiredActiveSubscriptions,
  getPendingExpulsions: mocks.getPendingExpulsions
}));
vi.mock("@/lib/logs", () => ({
  botLog: mocks.botLog,
  auditLog: mocks.auditLog,
  safeBotLog: (...args: unknown[]) => mocks.botLog(...args).then(() => true).catch(() => false),
  safeAuditLog: (...args: unknown[]) => mocks.auditLog(...args).then(() => true).catch(() => false),
  safeLog: (operation: () => Promise<unknown>) => Promise.resolve(operation()).catch(() => false)
}));
vi.mock("@/lib/telegram/api", () => ({ banUser: mocks.banUser, unbanUser: mocks.unbanUser, sendMessage: mocks.sendMessage }));
vi.mock("@/lib/telegram/error-metadata", () => ({
  telegramErrorMetadata: (error: unknown, context: Record<string, unknown>) => ({
    ...context,
    error_message: error instanceof Error ? error.message : "mocked",
    telegram_error_code: (error as { error_code?: number })?.error_code ?? null,
    retry_after: (error as { parameters?: { retry_after?: number } })?.parameters?.retry_after ?? null
  }),
  isTelegramRateLimitError: (error: unknown) => (error as { error_code?: number })?.error_code === 429
}));
vi.mock("@/lib/telegram/messages", () => ({
  telegramMessages: { warning48h: () => "2 días", accessExpired: () => "caducado" },
  messagesFor: () => ({ warning48h: () => "2 días", accessExpired: () => "caducado", renewalFallback: () => "renueva", renewalButton: "Renovar" }),
  renewalUrl: () => null
}));
vi.mock("../telegram/message-settings", () => ({ getTelegramMessageContext: async () => ({}) }));
vi.mock("@/lib/system-jobs", () => ({ jobStarted: mocks.jobStarted, jobFinished: mocks.jobFinished }));

import { attemptExpulsion, checkExpired } from "./checkExpired";

function conditionalSubscriptionUpdate(result: { data?: unknown; error?: unknown } = { data: { id: "updated" }, error: null }) {
  const chain = {
    eq: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    select: vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
    }))
  };
  return chain;
}

describe("cron checkExpired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"));
    mocks.getExpiringSoon.mockResolvedValue([]);
    mocks.getExpiredActiveSubscriptions.mockResolvedValue([]);
    mocks.getPendingExpulsions.mockResolvedValue([]);
    mocks.dueWarning.mockReturnValue(null);
    mocks.botLog.mockResolvedValue(undefined);
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.banUser.mockResolvedValue(undefined);
    mocks.unbanUser.mockResolvedValue(undefined);
    mocks.sendMessage.mockResolvedValue(undefined);
  });

  it("con automatic_expulsion_enabled=false marca expired y no llama ban/unban", async () => {
    const updates: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table !== "subscriptions") throw new Error(`Tabla inesperada: ${table}`);
        return {
          update(payload: unknown) {
            updates.push(payload);
            return conditionalSubscriptionUpdate();
          }
        };
      }
    });
    mocks.getExpiredActiveSubscriptions.mockResolvedValue([{
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      ends_at: "2026-06-23T09:59:00.000Z",
      expiration_detected_at: null,
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890, automatic_expulsion_enabled: false }
    }]);

    const result = await checkExpired();

    expect(updates[0]).toMatchObject({
      status: "expired",
      expiration_detected_at: "2026-06-23T10:00:00.000Z"
    });
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(mocks.unbanUser).not.toHaveBeenCalled();
    expect(mocks.botLog).toHaveBeenCalledWith("subscription_expired_detected", expect.any(String), expect.objectContaining({
      userId: "user-1",
      groupId: "group-1"
    }));
    expect(mocks.auditLog).toHaveBeenCalledWith("subscription_expired_detected", expect.any(String), "user-1", expect.objectContaining({
      subscription_id: "sub-1"
    }));
    expect(result).toMatchObject({ expiredProcessed: 1, kicked: 0, enforcementSkipped: 1 });
  });

  it("si ban falla queda failed y se puede reintentar en siguientes crons", async () => {
    const updates: Array<{ table: string; payload: unknown }> = [];
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        return {
          update(payload: unknown) {
            updates.push({ table, payload });
            return { eq: async () => ({ error: null }) };
          }
        };
      }
    });
    mocks.banUser.mockRejectedValueOnce(new Error("Telegram ban failed"));

    const result = await attemptExpulsion({
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "pending",
      expulsion_attempts: 0,
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890 }
    } as never);

    expect(result.status).toBe("failed");
    expect(updates.some((item) => item.table === "subscriptions" && (item.payload as Record<string, unknown>).expulsion_status === "failed")).toBe(true);
    expect(updates.some((item) => item.table === "telegram_users" && (item.payload as Record<string, unknown>).operational_status === "expulsion_failed")).toBe(true);
    expect(mocks.unbanUser).not.toHaveBeenCalled();
  });

  it("si unban falla queda unban_failed y lo marca crítico", async () => {
    const updates: Array<{ table: string; payload: unknown }> = [];
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        return {
          update(payload: unknown) {
            updates.push({ table, payload });
            return { eq: async () => ({ error: null }) };
          }
        };
      }
    });
    mocks.unbanUser.mockRejectedValueOnce(new Error("Telegram unban failed"));

    const result = await attemptExpulsion({
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "pending",
      expulsion_attempts: 1,
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890 }
    } as never);

    expect(result.status).toBe("unban_failed");
    expect(updates.some((item) => item.table === "subscriptions" && (item.payload as Record<string, unknown>).expulsion_status === "unban_failed")).toBe(true);
    expect(updates.some((item) => item.table === "telegram_users" && (item.payload as Record<string, unknown>).operational_status === "unban_failed")).toBe(true);
    expect(mocks.botLog).toHaveBeenCalledWith("user_unban_failed_after_kick", expect.any(String), expect.objectContaining({ level: "error" }));
  });

  it("si unban falla y Supabase no guarda unban_failed devuelve estado controlado", async () => {
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === "operational_incidents") return {
          insert: async () => ({ error: null })
        };
        return {
          update(payload: unknown) {
            return {
              eq: async () => ({
                error: (payload as Record<string, unknown>).expulsion_status === "unban_failed"
                  ? new Error("Supabase no guardó unban_failed")
                  : null
              })
            };
          }
        };
      }
    });
    mocks.unbanUser.mockRejectedValueOnce(new Error("Telegram unban failed"));

    const result = await attemptExpulsion({
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "pending",
      expulsion_attempts: 1,
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890 }
    } as never);

    expect(result.status).toBe("state_update_failed");
    expect(mocks.unbanUser).toHaveBeenCalledWith(-1001234567890, 978543967);
    expect(mocks.botLog).toHaveBeenCalledWith("user_unban_failed_after_kick", expect.any(String), expect.objectContaining({
      level: "error",
      metadata: expect.objectContaining({ state_persisted: false })
    }));
  });

  it("si ban y unban van bien queda succeeded", async () => {
    const updates: Array<{ table: string; payload: unknown }> = [];
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        return {
          update(payload: unknown) {
            updates.push({ table, payload });
            return { eq: async () => ({ error: null }) };
          }
        };
      }
    });

    const result = await attemptExpulsion({
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "pending",
      expulsion_attempts: 2,
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890 }
    } as never);

    expect(result.status).toBe("succeeded");
    expect(updates.some((item) => item.table === "subscriptions" && (item.payload as Record<string, unknown>).expulsion_status === "succeeded")).toBe(true);
    expect(updates.some((item) => item.table === "telegram_users" && (item.payload as Record<string, unknown>).operational_status === "expelled")).toBe(true);
  });

  it("no duplica expulsión si ya estaba succeeded", async () => {
    const result = await attemptExpulsion({ expulsion_status: "succeeded" } as never);

    expect(result.status).toBe("skipped");
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(mocks.unbanUser).not.toHaveBeenCalled();
  });

  it("aplaza reintentos de expulsión si el último intento fue hace menos de una hora", async () => {
    const result = await attemptExpulsion({
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "failed",
      expulsion_attempts: 1,
      last_expulsion_attempt_at: "2026-06-23T09:30:00.000Z",
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890 }
    } as never);

    expect(result.status).toBe("retry_backoff");
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(mocks.botLog).toHaveBeenCalledWith("expulsion_retry_backoff", expect.any(String), expect.objectContaining({ level: "warning" }));
  });

  it("no expulsa si aparece una suscripción activa vigente antes del ban", async () => {
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table !== "subscriptions") throw new Error(`Tabla inesperada: ${table}`);
        return {
          select: vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: "sub-renewed", ends_at: "2026-06-24T10:00:00.000Z" }],
                error: null
              })
            };
            return chain;
          })
        };
      }
    });

    const result = await attemptExpulsion({
      id: "sub-expired",
      status: "expired",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "pending",
      expulsion_attempts: 0,
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890 }
    } as never);

    expect(result.status).toBe("active_access_found");
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(mocks.unbanUser).not.toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith("expulsion_skipped_active_access_found", expect.any(String), "user-1", expect.objectContaining({
      subscription_id: "sub-expired"
    }));
  });

  it("detiene expulsiones automáticas al alcanzar el máximo de intentos", async () => {
    const updates: unknown[] = [];
    const incidents: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === "operational_incidents") return {
          insert: (payload: unknown) => {
            incidents.push(payload);
            return Promise.resolve({ error: null });
          }
        };
        return {
          update(payload: unknown) {
            updates.push(payload);
            return { eq: async () => ({ error: null }) };
          }
        };
      }
    });

    const result = await attemptExpulsion({
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "failed",
      expulsion_attempts: 5,
      last_expulsion_attempt_at: "2026-06-23T08:00:00.000Z",
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: { telegram_chat_id: -1001234567890 }
    } as never);

    expect(result.status).toBe("retry_limit_reached");
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ expulsion_status: "failed", last_expulsion_error: "max_expulsion_attempts_reached:5" });
    expect(incidents[0]).toMatchObject({ code: "expulsion_retry_limit_reached", severity: "error" });
  });

  it("si vip_groups llega null no revienta la expulsión automática", async () => {
    const updates: unknown[] = [];
    const incidents: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === "operational_incidents") return {
          insert: (payload: unknown) => {
            incidents.push(payload);
            return Promise.resolve({ error: null });
          }
        };
        return {
          update(payload: unknown) {
            updates.push(payload);
            return { eq: async () => ({ error: null }) };
          }
        };
      }
    });

    const result = await attemptExpulsion({
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      expulsion_status: "pending",
      expulsion_attempts: 0,
      telegram_users: { telegram_user_id: 978543967 },
      vip_groups: null
    } as never);

    expect(result.status).toBe("missing_group");
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ expulsion_status: "failed", last_expulsion_error: "missing_vip_group_relation" });
    expect(incidents[0]).toMatchObject({ code: "expulsion_missing_group_relation", severity: "error" });
  });

  it("procesa como máximo CRON_BATCH_SIZE y guarda resumen con remaining_count", async () => {
    process.env.CRON_BATCH_SIZE = "2";
    const updates: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from: () => ({
        update(payload: unknown) {
          updates.push(payload);
          return conditionalSubscriptionUpdate();
        }
      })
    });
    mocks.getExpiredActiveSubscriptions.mockResolvedValue([
      { id: "sub-1", telegram_user_id: "user-1", vip_group_id: "group-1", ends_at: "2026-06-23T09:00:00.000Z", expiration_detected_at: null, telegram_users: { telegram_user_id: 1 }, vip_groups: { telegram_chat_id: -1, automatic_expulsion_enabled: false } },
      { id: "sub-2", telegram_user_id: "user-2", vip_group_id: "group-1", ends_at: "2026-06-23T09:01:00.000Z", expiration_detected_at: null, telegram_users: { telegram_user_id: 2 }, vip_groups: { telegram_chat_id: -1, automatic_expulsion_enabled: false } },
      { id: "sub-3", telegram_user_id: "user-3", vip_group_id: "group-1", ends_at: "2026-06-23T09:02:00.000Z", expiration_detected_at: null, telegram_users: { telegram_user_id: 3 }, vip_groups: { telegram_chat_id: -1, automatic_expulsion_enabled: false } }
    ]);

    const result = await checkExpired();

    expect(result).toMatchObject({ expiredProcessed: 2, processed_count: 2, remaining_count: 1, batch_size: 2 });
    expect(updates).toHaveLength(2);
    expect(mocks.jobFinished).toHaveBeenCalledWith("check-expired", expect.any(Date), expect.objectContaining({ remaining_count: 1, processed_count: 2 }));
    delete process.env.CRON_BATCH_SIZE;
  });

  it("un error en una suscripción no detiene el lote", async () => {
    process.env.CRON_BATCH_SIZE = "3";
    let calls = 0;
    mocks.createAdminClient.mockReturnValue({
      from: () => ({
        update() {
          calls++;
          return conditionalSubscriptionUpdate({
            data: calls === 1 ? null : { id: "updated" },
            error: calls === 1 ? new Error("Supabase caído para una fila") : null
          });
        }
      })
    });
    mocks.getExpiredActiveSubscriptions.mockResolvedValue([
      { id: "sub-1", telegram_user_id: "user-1", vip_group_id: "group-1", ends_at: "2026-06-23T09:00:00.000Z", expiration_detected_at: null, telegram_users: { telegram_user_id: 1 }, vip_groups: { telegram_chat_id: -1, automatic_expulsion_enabled: false } },
      { id: "sub-2", telegram_user_id: "user-2", vip_group_id: "group-1", ends_at: "2026-06-23T09:01:00.000Z", expiration_detected_at: null, telegram_users: { telegram_user_id: 2 }, vip_groups: { telegram_chat_id: -1, automatic_expulsion_enabled: false } }
    ]);

    const result = await checkExpired();

    expect(result.expiredProcessed).toBe(1);
    expect(result.errors).toContain("expiration_status_update_failed");
    expect(calls).toBeGreaterThanOrEqual(2);
    delete process.env.CRON_BATCH_SIZE;
  });

  it("un fallo de logging no aborta el lote", async () => {
    const updates: unknown[] = [];
    mocks.botLog.mockRejectedValue(new Error("bot_logs caido"));
    mocks.auditLog.mockRejectedValue(new Error("audit_logs caido"));
    mocks.createAdminClient.mockReturnValue({
      from: () => ({
        update(payload: unknown) {
          updates.push(payload);
          return conditionalSubscriptionUpdate();
        }
      })
    });
    mocks.getExpiredActiveSubscriptions.mockResolvedValue([{
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      ends_at: "2026-06-23T09:00:00.000Z",
      expiration_detected_at: null,
      telegram_users: { telegram_user_id: 1 },
      vip_groups: { telegram_chat_id: -1, automatic_expulsion_enabled: false }
    }]);

    const result = await checkExpired();

    expect(result).toMatchObject({ ok: true, expiredProcessed: 1, enforcementSkipped: 1 });
    expect(updates[0]).toMatchObject({ status: "expired" });
  });

  it("si Telegram devuelve 429 en un aviso, no lo marca como enviado y crea incidencia retry_pending", async () => {
    mocks.dueWarning.mockReturnValue("72h");
    const updates: unknown[] = [];
    const incidents: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === "operational_incidents") return {
          insert: (payload: unknown) => {
            incidents.push(payload);
            return Promise.resolve({ error: null });
          }
        };
        return {
          update(payload: unknown) {
            updates.push(payload);
            return { eq: async () => ({ error: null }) };
          }
        };
      }
    });
    const error = new Error("Too Many Requests: retry after 17") as Error & { error_code: number; parameters: { retry_after: number } };
    error.error_code = 429;
    error.parameters = { retry_after: 17 };
    mocks.sendMessage.mockRejectedValueOnce(error);
    mocks.getExpiringSoon.mockResolvedValue([{
      id: "sub-429",
      telegram_user_id: "user-429",
      vip_group_id: "group-1",
      ends_at: "2026-06-26T10:00:00.000Z",
      warned_72h_at: null,
      warned_24h_at: null,
      warned_1h_at: null,
      telegram_users: { telegram_user_id: 978543967, language_code: "es" }
    }]);

    const result = await checkExpired();

    expect(result.errors).toContain("warning_failed");
    expect(updates).toHaveLength(0);
    expect(incidents[0]).toMatchObject({
      severity: "warning",
      code: "telegram_rate_limited",
      metadata: expect.objectContaining({ retry_after: 17 })
    });
    expect(mocks.botLog).toHaveBeenCalledWith("warning_retry_pending", expect.any(String), expect.objectContaining({
      level: "warning",
      metadata: expect.objectContaining({ retry_after: 17 })
    }));
  });
});
