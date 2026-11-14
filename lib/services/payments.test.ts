import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/telegram/auth";
import type { PaymentIntentRow, SubscriptionRow, TelegramUserRow } from "@/lib/domain/types";
import { createPaymentIntent } from "@/lib/services/payments";

function user(): TelegramUserRow {
  return {
    id: "user-1",
    telegram_user_id: 123,
    telegram_username: "nina",
    first_name: "Creator",
    last_name: null,
    language_code: "es",
    first_seen_at: null,
    started_bot_at: null,
    last_seen_at: null,
    first_subscription_at: null,
    current_streak_months: 0,
    operational_status: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function intent(id = "intent-1"): PaymentIntentRow {
  return {
    id,
    telegram_user_id: "user-1",
    vip_group_id: "group-1",
    subscription_id: "sub-1",
    status: "requested",
    source: "miniapp",
    note: null,
    user_note: null,
    admin_note: null,
    selected_plan_id: null,
    amount_expected: null,
    currency: null,
    payment_method: null,
    seen_at: null,
    resolved_at: null,
    resolved_by: null,
    created_at: "2026-06-26T10:00:00Z",
    updated_at: "2026-06-26T10:00:00Z",
  };
}

function subscription(): SubscriptionRow {
  return {
    id: "sub-1",
    telegram_user_id: "user-1",
    vip_group_id: "group-1",
    status: "active",
    starts_at: "2026-06-01T00:00:00Z",
    ends_at: "2026-07-01T00:00:00Z",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  };
}

describe("createPaymentIntent", () => {
  it("returns an existing open intent without inserting", async () => {
    let inserted = false;
    const ctx = ctxWithSupabase({
      openResults: [{ data: intent(), error: null }],
      insertResult: { data: null, error: null },
      onInsert: () => {
        inserted = true;
      },
    });

    const result = await createPaymentIntent(ctx);

    expect(result).toEqual({
      status: "requested",
      createdAt: intent().created_at,
      selectedPlanId: null,
    });
    expect(inserted).toBe(false);
  });

  it("refetches and returns the open intent after unique violation 23505", async () => {
    const ctx = ctxWithSupabase({
      openResults: [
        { data: null, error: null },
        { data: intent("raced"), error: null },
      ],
      insertResult: {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      },
    });

    const result = await createPaymentIntent(ctx);

    expect(result).toEqual({
      status: "requested",
      createdAt: intent("raced").created_at,
      selectedPlanId: null,
    });
  });

  it("stores selected plan metadata derived by the server", async () => {
    let insertedPayload: Record<string, unknown> | null = null;
    const created = intent("created");
    const ctx = ctxWithSupabase({
      openResults: [{ data: null, error: null }],
      insertResult: {
        data: {
          ...created,
          selected_plan_id: "vip_3m",
          amount_expected: 120,
          currency: "EUR",
        },
        error: null,
      },
      onInsert: (payload) => {
        insertedPayload = payload;
      },
    });

    const result = await createPaymentIntent(ctx, { selectedPlanId: "vip_3m" });

    expect(result.selectedPlanId).toBe("vip_3m");
    expect(insertedPayload).toMatchObject({
      selected_plan_id: "vip_3m",
      amount_expected: 120,
      currency: "EUR",
      status: "requested",
      source: "miniapp",
    });
  });
});

function ctxWithSupabase({
  openResults,
  insertResult,
  onInsert,
}: {
  openResults: Array<{ data: PaymentIntentRow | null; error: null | { code?: string; message: string } }>;
  insertResult: { data: PaymentIntentRow | null; error: null | { code?: string; message: string } };
  onInsert?: (payload: Record<string, unknown>) => void;
}): AuthContext {
  let openIndex = 0;
  const supabase = {
    from(table: string) {
      if (table === "subscriptions") {
        return chain({ data: [subscription()], error: null });
      }
      if (table === "payment_intents") {
        let inserting = false;
        return chain(
          () => (inserting ? insertResult : openResults[openIndex++]),
          (payload) => {
            inserting = true;
            onInsert?.(payload);
          },
        );
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase: supabase as never, tgUser: { id: 123 }, user: user() };
}

function chain(
  result: unknown | (() => unknown),
  onInsert?: (payload: Record<string, unknown>) => void,
): Record<string, unknown> {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    in: () => self,
    order: () => self,
    limit: () => self,
    insert: (payload: Record<string, unknown>) => {
      onInsert?.(payload);
      return self;
    },
    maybeSingle: () => Promise.resolve(value(result)),
    single: () => Promise.resolve(value(result)),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(value(result)).then(resolve, reject),
  };
  return self;
}

function value(result: unknown | (() => unknown)): unknown {
  return typeof result === "function" ? (result as () => unknown)() : result;
}
