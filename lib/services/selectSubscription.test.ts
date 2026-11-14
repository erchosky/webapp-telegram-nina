import { describe, expect, it } from "vitest";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import type { SubscriptionRow, SubscriptionStatus } from "@/lib/domain/types";

const fixedNow = new Date("2026-06-26T00:00:00Z");

function sub(
  partial: Partial<SubscriptionRow> & { status: SubscriptionStatus },
): SubscriptionRow {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    telegram_user_id: "u1",
    vip_group_id: "g1",
    status: partial.status,
    starts_at: partial.starts_at ?? null,
    ends_at: partial.ends_at ?? null,
    created_at: partial.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00Z",
  };
}

describe("selectCurrentSubscription", () => {
  it("returns null when there are no subscriptions", () => {
    expect(selectCurrentSubscription([])).toBeNull();
  });

  it("prefers active over expired", () => {
    const result = selectCurrentSubscription(
      [
        sub({ id: "expired", status: "expired", ends_at: "2026-12-01T00:00:00Z" }),
        sub({ id: "active", status: "active", ends_at: "2026-07-01T00:00:00Z" }),
      ],
      fixedNow,
    );
    expect(result?.id).toBe("active");
  });

  it("prefers an older valid active subscription over a newer pending one", () => {
    const result = selectCurrentSubscription(
      [
        sub({ id: "pending-new", status: "pending", created_at: "2026-06-25T00:00:00Z" }),
        sub({ id: "active-old", status: "active", ends_at: "2026-08-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z" }),
      ],
      fixedNow,
    );
    expect(result?.id).toBe("active-old");
  });

  it("treats an active subscription without ends_at as current", () => {
    const result = selectCurrentSubscription(
      [
        sub({ id: "pending-new", status: "pending", created_at: "2026-06-25T00:00:00Z" }),
        sub({ id: "active-open", status: "active", ends_at: null, created_at: "2026-05-01T00:00:00Z" }),
      ],
      fixedNow,
    );
    expect(result?.id).toBe("active-open");
  });

  it("prefers a valid old active subscription over a newer cancelled one", () => {
    const result = selectCurrentSubscription(
      [
        sub({ id: "cancelled-new", status: "cancelled", created_at: "2026-06-25T00:00:00Z" }),
        sub({ id: "active-old", status: "active", ends_at: "2026-08-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z" }),
      ],
      fixedNow,
    );
    expect(result?.id).toBe("active-old");
  });

  it("does not prefer an active row whose end date has passed", () => {
    const result = selectCurrentSubscription(
      [
        sub({ id: "stale-active", status: "active", ends_at: "2026-01-01T00:00:00Z" }),
        sub({ id: "pending", status: "pending", ends_at: "2026-07-01T00:00:00Z" }),
      ],
      fixedNow,
    );
    expect(result?.id).toBe("pending");
  });

  it("among same status, prefers the one ending latest", () => {
    const result = selectCurrentSubscription(
      [
        sub({ id: "early", status: "active", ends_at: "2026-07-01T00:00:00Z" }),
        sub({ id: "late", status: "active", ends_at: "2026-09-01T00:00:00Z" }),
      ],
      fixedNow,
    );
    expect(result?.id).toBe("late");
  });

  it("falls back to newest created_at when end dates tie", () => {
    const result = selectCurrentSubscription([
      sub({ id: "old", status: "pending", created_at: "2026-01-01T00:00:00Z" }),
      sub({ id: "new", status: "pending", created_at: "2026-03-01T00:00:00Z" }),
    ]);
    expect(result?.id).toBe("new");
  });
});
