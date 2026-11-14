import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logs", () => ({ botLog: vi.fn(), auditLog: vi.fn() }));
vi.mock("@/lib/telegram/api", () => ({ banUser: vi.fn(), unbanUser: vi.fn() }));
vi.mock("@/lib/telegram/error-metadata", () => ({
  telegramErrorMetadata: (error: unknown, context: Record<string, unknown>) => {
    const payload = typeof error === "object" && error !== null && "payload" in error ? (error as { payload?: { error_code?: number; description?: string } }).payload : undefined;
    return {
      method: context.method,
      chat_id: context.chat_id,
      telegram_user_id: context.telegram_user_id,
      subscription_id: context.subscription_id,
      error_message: error instanceof Error ? error.message : String(error),
      error_name: error instanceof Error ? error.name : "UnknownError",
      telegram_error_code: payload?.error_code ?? null,
      telegram_description: payload?.description ?? null
    };
  }
}));

import { manualExpelUser, manualUnbanUser } from "./manual-expel";

function telegramError(description: string, code = 400) {
  const error = new Error(description) as Error & { payload?: { error_code: number; description: string } };
  error.payload = { error_code: code, description };
  return error;
}

function fakeDb(options: {
  user?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  group?: Record<string, unknown> | null;
  failSuccessSubscriptionUpdate?: boolean;
  failUnbanFailedSubscriptionUpdate?: boolean;
  failGroup?: boolean;
} = {}) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const user = options.user === undefined ? { id: "user-1", telegram_user_id: 978543967 } : options.user;
  const subscription = options.subscription === undefined ? { id: "sub-1", telegram_user_id: "user-1", vip_group_id: "group-1", expulsion_attempts: 0 } : options.subscription;
  const group = options.group === undefined ? { id: "group-1", telegram_chat_id: -1001234567890, is_active: true } : options.group;

  return {
    updates,
    db: {
      from(table: string) {
        if (table === "telegram_users") return {
          select: () => ({ eq: () => ({ single: async () => ({ data: user, error: user ? null : new Error("missing user") }) }) }),
          update: (payload: Record<string, unknown>) => {
            updates.push({ table, payload });
            return { eq: async () => ({ error: null }) };
          }
        };
        if (table === "subscriptions") return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: subscription, error: null }) }) })
            })
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push({ table, payload });
            return {
              eq: async () => ({
                error: options.failSuccessSubscriptionUpdate && payload.expulsion_status === "succeeded"
                  ? new Error("Supabase update failed")
                  : options.failUnbanFailedSubscriptionUpdate && payload.expulsion_status === "unban_failed"
                  ? new Error("Supabase update failed")
                  : null
              })
            };
          }
        };
        if (table === "vip_groups") return {
          select: () => {
            const query = {
              eq: () => query,
              limit: () => query,
              single: async () => ({ data: options.failGroup ? null : group, error: options.failGroup || !group ? new Error("missing group") : null })
            };
            return query;
          }
        };
        throw new Error(`Unexpected table ${table}`);
      }
    }
  };
}

function deps(db: unknown, overrides: Partial<{
  ban: ReturnType<typeof vi.fn>;
  unban: ReturnType<typeof vi.fn>;
  botLog: ReturnType<typeof vi.fn>;
  auditLog: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    db,
    ban: overrides.ban ?? vi.fn().mockResolvedValue(undefined),
    unban: overrides.unban ?? vi.fn().mockResolvedValue(undefined),
    botLog: overrides.botLog ?? vi.fn().mockResolvedValue(undefined),
    auditLog: overrides.auditLog ?? vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-06-24T10:00:00.000Z")
  } as never;
}

describe("manualExpelUser", () => {
  it("ban ok + unban ok no lanza 500 y marca succeeded/expelled", async () => {
    const { db, updates } = fakeDb();
    const unban = vi.fn().mockResolvedValue(undefined);

    const result = await manualExpelUser("user-1", deps(db, { unban }));

    expect(result).toMatchObject({ ok: true, status: "succeeded" });
    expect(unban).toHaveBeenCalledWith(-1001234567890, 978543967);
    expect(updates.some((item) => item.table === "subscriptions" && item.payload.expulsion_status === "succeeded" && item.payload.status === "expired")).toBe(true);
    expect(updates.some((item) => item.table === "telegram_users" && item.payload.operational_status === "expelled")).toBe(true);
  });

  it("ban falla no lanza 500 y marca expulsion_failed", async () => {
    const { db, updates } = fakeDb();
    const ban = vi.fn().mockRejectedValue(telegramError("not enough rights"));
    const unban = vi.fn();

    const result = await manualExpelUser("user-1", deps(db, { ban, unban }));

    expect(result).toMatchObject({ ok: false, status: "failed", uiError: "manual_expel_failed" });
    expect(unban).not.toHaveBeenCalled();
    expect(updates.some((item) => item.table === "subscriptions" && item.payload.expulsion_status === "failed")).toBe(true);
    expect(updates.some((item) => item.table === "telegram_users" && item.payload.operational_status === "expulsion_failed")).toBe(true);
    expect(result.metadata).toMatchObject({ telegram_description: "not enough rights", expulsion_status_final: "failed" });
  });

  it("ban ok + unban falla no lanza 500 y marca unban_failed crítico", async () => {
    const { db, updates } = fakeDb();
    const unban = vi.fn().mockRejectedValue(telegramError("unban failed"));

    const result = await manualExpelUser("user-1", deps(db, { unban }));

    expect(result).toMatchObject({ ok: false, status: "unban_failed", uiError: "manual_expel_unban_failed" });
    expect(updates.some((item) => item.table === "subscriptions" && item.payload.expulsion_status === "unban_failed")).toBe(true);
    expect(updates.some((item) => item.table === "telegram_users" && item.payload.operational_status === "unban_failed")).toBe(true);
    expect(result.metadata).toMatchObject({ critical: true, telegram_description: "unban failed" });
  });

  it("si falla guardar unban_failed no asume que el estado quedó persistido", async () => {
    const { db } = fakeDb({ failUnbanFailedSubscriptionUpdate: true });
    const unban = vi.fn().mockRejectedValue(telegramError("unban failed"));

    const result = await manualExpelUser("user-1", deps(db, { unban }));

    expect(result).toMatchObject({
      ok: false,
      status: "state_update_failed",
      uiError: "manual_expel_unban_state_failed"
    });
    expect(result.metadata).toMatchObject({
      critical: true,
      state_persisted: false,
      current_step: "persist_unban_failed"
    });
  });

  it("si botLog falla después de ban no lanza 500 y aun así intenta unban", async () => {
    const { db } = fakeDb();
    const unban = vi.fn().mockResolvedValue(undefined);
    const botLog = vi.fn().mockRejectedValue(new Error("bot log failed"));

    const result = await manualExpelUser("user-1", deps(db, { unban, botLog }));

    expect(result).toMatchObject({ ok: true, status: "succeeded" });
    expect(unban).toHaveBeenCalledTimes(1);
  });

  it("si Supabase falla después de ban intenta unban y devuelve error controlado", async () => {
    const { db } = fakeDb({ failSuccessSubscriptionUpdate: true });
    const unban = vi.fn().mockResolvedValue(undefined);

    const result = await manualExpelUser("user-1", deps(db, { unban }));

    expect(unban).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, status: "state_update_failed", uiError: "manual_expel_state_failed" });
  });

  it("sin grupo activo no lanza 500 y no llama Telegram", async () => {
    const { db } = fakeDb({ failGroup: true });
    const ban = vi.fn();
    const unban = vi.fn();

    const result = await manualExpelUser("user-1", deps(db, { ban, unban }));

    expect(result).toMatchObject({ ok: false, status: "precondition_failed", uiError: "manual_expel_missing_group" });
    expect(ban).not.toHaveBeenCalled();
    expect(unban).not.toHaveBeenCalled();
  });

  it("usa la suscripción efectiva aunque haya una pending más nueva", async () => {
    const { db } = fakeDb({
      subscription: [
        {
          id: "sub-pending",
          telegram_user_id: "user-1",
          vip_group_id: "group-pending",
          status: "pending",
          starts_at: null,
          ends_at: null,
          created_at: "2026-06-24T10:00:00.000Z",
          updated_at: "2026-06-24T10:00:00.000Z"
        },
        {
          id: "sub-active",
          telegram_user_id: "user-1",
          vip_group_id: "group-1",
          status: "active",
          starts_at: "2026-06-01T10:00:00.000Z",
          ends_at: "2026-08-01T10:00:00.000Z",
          created_at: "2026-06-01T10:00:00.000Z",
          updated_at: "2026-06-01T10:00:00.000Z",
          expulsion_attempts: 0
        }
      ]
    });
    const ban = vi.fn().mockResolvedValue(undefined);

    const result = await manualExpelUser("user-1", deps(db, { ban }));

    expect(result).toMatchObject({ ok: true, status: "succeeded" });
    expect(ban).toHaveBeenCalledWith(-1001234567890, 978543967);
  });

  it("aborta si hay suscripciones activas en varios grupos", async () => {
    const { db } = fakeDb({
      subscription: [
        {
          id: "sub-active-1",
          telegram_user_id: "user-1",
          vip_group_id: "group-1",
          status: "active",
          starts_at: "2026-06-01T10:00:00.000Z",
          ends_at: "2026-08-01T10:00:00.000Z",
          created_at: "2026-06-01T10:00:00.000Z",
          updated_at: "2026-06-01T10:00:00.000Z"
        },
        {
          id: "sub-active-2",
          telegram_user_id: "user-1",
          vip_group_id: "group-2",
          status: "active",
          starts_at: "2026-06-02T10:00:00.000Z",
          ends_at: null,
          created_at: "2026-06-02T10:00:00.000Z",
          updated_at: "2026-06-02T10:00:00.000Z"
        }
      ]
    });
    const ban = vi.fn();

    const result = await manualExpelUser("user-1", deps(db, { ban }));

    expect(result).toMatchObject({ ok: false, status: "precondition_failed", uiError: "manual_expel_ambiguous_subscription" });
    expect(ban).not.toHaveBeenCalled();
  });

  it("bot sin permisos queda como incidencia clara", async () => {
    const { db } = fakeDb();
    const ban = vi.fn().mockRejectedValue(telegramError("Bad Request: not enough rights to restrict/unrestrict chat member", 400));

    const result = await manualExpelUser("user-1", deps(db, { ban }));

    expect(result).toMatchObject({ ok: false, uiError: "manual_expel_failed" });
    expect(result.metadata).toMatchObject({
      method: "banChatMember",
      telegram_error_code: 400,
      telegram_description: "Bad Request: not enough rights to restrict/unrestrict chat member"
    });
  });
});

describe("manualUnbanUser", () => {
  it("desbloqueo manual llama unban y marca la incidencia como resuelta", async () => {
    const { db, updates } = fakeDb();
    const unban = vi.fn().mockResolvedValue(undefined);

    const result = await manualUnbanUser("user-1", deps(db, { unban }));

    expect(result).toMatchObject({ ok: true, status: "succeeded" });
    expect(unban).toHaveBeenCalledWith(-1001234567890, 978543967);
    expect(updates.some((item) => item.table === "subscriptions" && item.payload.expulsion_status === "resolved_manual")).toBe(true);
    expect(updates.some((item) => item.table === "telegram_users" && item.payload.operational_status === "resolved_manual")).toBe(true);
  });

  it("no usa fallback silencioso si la suscripción no tiene vip_group_id", async () => {
    const { db } = fakeDb({ subscription: { id: "sub-1", telegram_user_id: "user-1" } });
    const unban = vi.fn();

    const result = await manualUnbanUser("user-1", deps(db, { unban }));

    expect(result).toMatchObject({ ok: false, status: "precondition_failed", uiError: "manual_unban_missing_subscription_group" });
    expect(unban).not.toHaveBeenCalled();
  });
});
