import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/subscription-rules", () => ({ renewalEnd: (now: Date) => new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) }));

import { createAdminClient } from "@/lib/supabase/admin";
import { activateFor30Days, changeEndDate, getPendingExpulsions, renewFor30Days, saveExistingMember } from "./subscriptions";

describe("persistencia de accesos", () => {
  it("validar pago crea suscripción manual_payment y rellena first_subscription_at", async () => {
    const inserted: unknown[] = [], userUpdates: unknown[] = [];
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
          insert: (payload: unknown) => { inserted.push(payload); return { select: () => ({ single: async () => ({ data: { id: "sub-1", ...(payload as object) }, error: null }) }) }; }
        };
        if (table === "vip_groups") return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: "group-1" }, error: null }) }) }) }) };
        if (table === "telegram_users") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { first_subscription_at: null, current_streak_months: 0 }, error: null }) }) }),
          update: (payload: unknown) => { userUpdates.push(payload); return { eq: async () => ({ error: null }) }; }
        };
        if (table === "scheduled_messages") return { insert: async () => ({ error: null }) };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };
    const now = new Date("2026-06-22T10:00:00Z");

    const result = await activateFor30Days("user-1", db as never, now);

    expect(inserted[0]).toMatchObject({ source: "manual_payment", status: "active", starts_at: now.toISOString(), ends_at: "2026-07-22T10:00:00.000Z" });
    expect(userUpdates[0]).toEqual({ first_subscription_at: now.toISOString(), current_streak_months: 1 });
    expect(result.id).toBe("sub-1");
  });

  it("validar pago consecutivo incrementa la racha si caduca justo ahora", async () => {
    const updates: unknown[] = [], userUpdates: unknown[] = [];
    const existing = {
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      status: "active",
      starts_at: "2026-05-22T10:00:00.000Z",
      ends_at: "2026-06-22T10:00:00.000Z",
      updated_at: "2026-06-01T10:00:00.000Z"
    };
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) }) }),
          update: (payload: unknown) => { updates.push(payload); return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "sub-1", ...(payload as object) }, error: null }) }) }) }; }
        };
        if (table === "telegram_users") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { first_subscription_at: "2026-05-22T10:00:00.000Z", current_streak_months: 2 }, error: null }) }) }),
          update: (payload: unknown) => { userUpdates.push(payload); return { eq: async () => ({ error: null }) }; }
        };
        if (table === "scheduled_messages") return { insert: async () => ({ error: null }) };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };
    const now = new Date("2026-06-22T10:00:00Z");

    await activateFor30Days("user-1", db as never, now);

    expect(updates[0]).toMatchObject({ status: "active", ends_at: "2026-07-22T10:00:00.000Z" });
    expect(userUpdates[0]).toEqual({ first_subscription_at: "2026-05-22T10:00:00.000Z", current_streak_months: 3 });
  });

  it("validar pago tras hueco reinicia la racha", async () => {
    const userUpdates: unknown[] = [];
    const existing = {
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      status: "expired",
      starts_at: "2026-04-01T10:00:00.000Z",
      ends_at: "2026-05-01T10:00:00.000Z",
      updated_at: "2026-05-02T10:00:00.000Z"
    };
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) }) }),
          update: (payload: unknown) => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: "sub-1", ...(payload as object) }, error: null }) }) }) })
        };
        if (table === "telegram_users") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { first_subscription_at: "2026-04-01T10:00:00.000Z", current_streak_months: 4 }, error: null }) }) }),
          update: (payload: unknown) => { userUpdates.push(payload); return { eq: async () => ({ error: null }) }; }
        };
        if (table === "scheduled_messages") return { insert: async () => ({ error: null }) };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };

    await activateFor30Days("user-1", db as never, new Date("2026-06-22T10:00:00Z"));

    expect(userUpdates[0]).toEqual({ first_subscription_at: "2026-04-01T10:00:00.000Z", current_streak_months: 1 });
  });

  it("doble validar reciente reutiliza la suscripción activa y no crea otra", async () => {
    const inserts: unknown[] = [], updates: unknown[] = [];
    const existing = {
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      status: "active",
      starts_at: "2026-06-22T10:00:00.000Z",
      ends_at: "2026-07-22T10:00:00.000Z",
      updated_at: "2026-06-22T10:00:05.000Z"
    };
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) }) }),
          insert: (payload: unknown) => { inserts.push(payload); return { select: () => ({ single: async () => ({ data: payload, error: null }) }) }; },
          update: (payload: unknown) => { updates.push(payload); return { eq: () => ({ select: () => ({ single: async () => ({ data: payload, error: null }) }) }) }; }
        };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };

    const result = await activateFor30Days("user-1", db as never, new Date("2026-06-22T10:00:10.000Z"));

    expect(result).toBe(existing);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("validar pago con suscripción activa antigua tampoco extiende ni duplica", async () => {
    const updates: unknown[] = [];
    const existing = {
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      status: "active",
      starts_at: "2026-06-01T10:00:00.000Z",
      ends_at: "2026-08-01T10:00:00.000Z",
      updated_at: "2026-06-01T10:00:00.000Z"
    };
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) }) }),
          update: (payload: unknown) => { updates.push(payload); return { eq: () => ({ select: () => ({ single: async () => ({ data: payload, error: null }) }) }) }; }
        };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };

    const result = await activateFor30Days("user-1", db as never, new Date("2026-06-22T10:00:00.000Z"));

    expect(result).toBe(existing);
    expect(updates).toHaveLength(0);
  });

  it("dos llamadas concurrentes simuladas no crean dos active si Supabase aplica el índice único", async () => {
    let readCount = 0;
    const active = {
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      status: "active",
      starts_at: "2026-06-22T10:00:00.000Z",
      ends_at: "2026-07-22T10:00:00.000Z"
    };
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: readCount++ === 0 ? null : active, error: null }) }) }) }) }),
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) }) })
        };
        if (table === "vip_groups") return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: "group-1" }, error: null }) }) }) }) };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };

    const result = await activateFor30Days("user-1", db as never, new Date("2026-06-22T10:00:00.000Z"));

    expect(result).toBe(active);
  });

  it("migración crea un miembro activo existente sin ninguna dependencia de invitación", async () => {
    const subscriptionInserts: unknown[] = [], profileUpdates: unknown[] = [], auditInserts: unknown[] = [];
    const db = {
      from(table: string) {
        if (table === "telegram_users") return {
          upsert: () => ({ select: () => ({ single: async () => ({ data: { id: "user-1" }, error: null }) }) }),
          update: (payload: unknown) => { profileUpdates.push(payload); return { eq: async () => ({ error: null }) }; }
        };
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
          insert: (payload: unknown) => { subscriptionInserts.push(payload); return { select: () => ({ single: async () => ({ data: { id: "sub-1", ...(payload as object) }, error: null }) }) }; }
        };
        if (table === "vip_groups") return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: "group-1" }, error: null }) }) }) }) };
        if (table === "admin_audit_logs") return {
          insert: (payload: unknown) => { auditInserts.push(payload); return { error: null }; }
        };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };

    const result = await saveExistingMember({ telegramUserId: 123, telegramUsername: "@ada", memberSince: new Date("2025-01-01T10:00:00Z"), endsAt: new Date("2026-08-01T10:00:00Z"), internalNotes: "Ya estaba en el grupo" }, db as never);

    expect(subscriptionInserts[0]).toMatchObject({ status: "active", source: "migration", starts_at: "2025-01-01T10:00:00.000Z" });
    expect(profileUpdates[0]).toMatchObject({ first_subscription_at: "2025-01-01T10:00:00.000Z", internal_notes: "Ya estaba en el grupo", operational_status: "active_in_group" });
    expect(auditInserts[0]).toMatchObject({
      action: "existing_member_created",
      target_user_id: "user-1",
      metadata: expect.objectContaining({ no_invite_sent: true, ends_at: "2026-08-01T10:00:00.000Z" })
    });
    expect(result.subscription.id).toBe("sub-1");
  });

  it("migración sin caducidad crea suscripción needs_manual_review y audit log", async () => {
    const subscriptionInserts: unknown[] = [], profileUpdates: unknown[] = [], auditInserts: unknown[] = [];
    const db = {
      from(table: string) {
        if (table === "telegram_users") return {
          upsert: () => ({ select: () => ({ single: async () => ({ data: { id: "user-1" }, error: null }) }) }),
          update: (payload: unknown) => { profileUpdates.push(payload); return { eq: async () => ({ error: null }) }; }
        };
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
          insert: (payload: unknown) => { subscriptionInserts.push(payload); return { select: () => ({ single: async () => ({ data: { id: "sub-1", ...(payload as object) }, error: null }) }) }; }
        };
        if (table === "vip_groups") return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: "group-1" }, error: null }) }) }) }) };
        if (table === "admin_audit_logs") return {
          insert: (payload: unknown) => { auditInserts.push(payload); return { error: null }; }
        };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };

    const result = await saveExistingMember({ telegramUserId: 456, telegramUsername: null, memberSince: new Date("2025-01-01T10:00:00Z"), endsAt: null, internalNotes: "Pendiente de revisar" }, db as never);

    expect(subscriptionInserts[0]).toMatchObject({
      status: "needs_manual_review",
      source: "migration",
      starts_at: "2025-01-01T10:00:00.000Z",
      ends_at: null,
      expulsion_status: "not_required"
    });
    expect(profileUpdates[0]).toMatchObject({ operational_status: "expired_manual_review" });
    expect(auditInserts[0]).toMatchObject({
      action: "existing_member_needs_manual_review",
      target_user_id: "user-1",
      metadata: expect.objectContaining({ no_invite_sent: true, ends_at: null })
    });
    expect(result.subscription.status).toBe("needs_manual_review");
  });

  it("renovar usuario caducado vuelve a active y genera nuevo ends_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    const updates: unknown[] = [];
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: "sub-1", telegram_user_id: "user-1", vip_group_id: "group-1", status: "expired", starts_at: "2026-05-01T10:00:00.000Z", ends_at: "2026-06-01T10:00:00.000Z" }, error: null }) }) }) }) }),
          update: (payload: unknown) => { updates.push(payload); return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "sub-1", ...(payload as object) }, error: null }) }) }) }; }
        };
        if (table === "telegram_users") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_streak_months: 0 }, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) })
        };
        if (table === "scheduled_messages") return { insert: async () => ({ error: null }) };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await renewFor30Days("user-1");

    expect(updates[0]).toMatchObject({
      status: "active",
      ends_at: "2026-07-23T10:00:00.000Z",
      expiration_detected_at: null,
      expulsion_status: "not_required",
      expulsion_attempts: 0,
      last_expulsion_attempt_at: null,
      last_expulsion_error: null,
      expelled_at: null
    });
    expect(result.status).toBe("active");
    vi.useRealTimers();
  });

  it("doble renovar reciente no añade otro mes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:10Z"));
    const updates: unknown[] = [];
    const existing = {
      id: "sub-1",
      telegram_user_id: "user-1",
      vip_group_id: "group-1",
      status: "active",
      starts_at: "2026-06-01T10:00:00.000Z",
      ends_at: "2026-08-01T10:00:00.000Z",
      updated_at: "2026-06-23T10:00:05.000Z"
    };
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) }) }),
          update: (payload: unknown) => { updates.push(payload); return { eq: () => ({ select: () => ({ single: async () => ({ data: payload, error: null }) }) }) }; }
        };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await renewFor30Days("user-1");

    expect(result).toBe(existing);
    expect(updates).toHaveLength(0);
    vi.useRealTimers();
  });

  it("changeEndDate rechaza cambios con updated_at obsoleto", async () => {
    const updates: unknown[] = [];
    const current = {
      id: "sub-1",
      telegram_user_id: "user-1",
      status: "active",
      ends_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-06-24T10:00:00.000Z"
    };
    const db = {
      from(table: string) {
        if (table === "subscriptions") return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: current, error: null }) }) }) }) }),
          update: (payload: unknown) => {
            updates.push(payload);
            return { eq: async () => ({ error: null }) };
          }
        };
        throw new Error(`Tabla inesperada: ${table}`);
      }
    };
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    await expect(changeEndDate("user-1", "2026-08-01T10:00:00.000Z", "2026-06-24T09:59:00.000Z")).rejects.toThrow("La suscripción cambió");
    expect(updates).toHaveLength(0);
  });

  it("autoexpulsión no selecciona suscripciones sin ends_at", async () => {
    const calls: Array<[string, string, unknown]> = [];
    const selects: string[] = [];
    const query = {
      eq(column: string, value: unknown) { calls.push(["eq", column, value]); return query; },
      in(column: string, value: unknown) { calls.push(["in", column, value]); return query; },
      not(column: string, operator: string, value: unknown) { calls.push(["not", `${column}:${operator}`, value]); return query; },
      order: () => query,
      then(resolve: (value: unknown) => void) { resolve({ data: [], error: null }); }
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        select: (columns: string) => { selects.push(columns); return query; }
      })
    } as never);

    await getPendingExpulsions();

    expect(selects[0]).toContain("vip_groups!inner(*)");
    expect(calls).toContainEqual(["eq", "status", "expired"]);
    expect(calls).toContainEqual(["not", "ends_at:is", null]);
    expect(calls).toContainEqual(["eq", "vip_groups.automatic_expulsion_enabled", true]);
  });
});
