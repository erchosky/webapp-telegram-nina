import { describe, expect, it } from "vitest";
import { MINIAPP_PLANS, planById } from "@/lib/miniapp/plans";

describe("miniapp plans", () => {
  it("keeps plans configurable and addressable by id", () => {
    expect(MINIAPP_PLANS).toHaveLength(3);
    expect(planById("vip_entry_30d")?.amountExpected).toBe(50);
    expect(planById("vip_monthly_renewal")?.amountExpected).toBe(45);
    expect(planById("vip_3m")?.amountExpected).toBe(120);
    expect(planById("vip_monthly_renewal")?.highlighted).toBe(true);
  });

  it("returns null for unknown plans", () => {
    expect(planById("missing")).toBeNull();
  });
});
