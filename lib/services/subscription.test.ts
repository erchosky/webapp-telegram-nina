import { describe, expect, it } from "vitest";
import type { SubscriptionRow } from "@/lib/domain/types";
import {
  getEffectiveSubscriptionStatus,
  isActiveSubscription,
} from "@/lib/services/subscription";

describe("isActiveSubscription", () => {
  it("requires active status", () => {
    expect(isActiveSubscription(sub({ status: "expired" }))).toBe(false);
  });

  it("rejects active but expired subscriptions", () => {
    expect(
      isActiveSubscription(
        sub({ status: "active", ends_at: "2026-01-01T00:00:00Z" }),
        new Date("2026-06-26T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("accepts active non-expired subscriptions", () => {
    expect(
      isActiveSubscription(
        sub({ status: "active", ends_at: "2026-07-01T00:00:00Z" }),
        new Date("2026-06-26T00:00:00Z"),
      ),
    ).toBe(true);
  });

  it("reports effective expired status when an active row ended", () => {
    expect(
      getEffectiveSubscriptionStatus(
        sub({ status: "active", ends_at: "2026-06-25T23:59:59Z" }),
        new Date("2026-06-26T00:00:00Z"),
      ),
    ).toBe("expired");
  });
});

function sub(partial: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "sub-1",
    telegram_user_id: "user-1",
    vip_group_id: "group-1",
    status: "active",
    starts_at: null,
    ends_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}
