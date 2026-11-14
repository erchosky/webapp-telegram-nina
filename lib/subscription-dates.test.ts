import { describe, expect, it } from "vitest";
import { addNaturalMonths, quickExpiryBase, quickExpiryPresetValues, quickSubscriptionEndDate } from "./subscription-dates";

describe("subscription date helpers", () => {
  it.each([
    ["2026-07-05T12:06:00.000Z", "2026-08-05T12:06:00.000Z"],
    ["2026-01-31T12:06:00.000Z", "2026-02-28T12:06:00.000Z"],
    ["2028-01-31T12:06:00.000Z", "2028-02-29T12:06:00.000Z"],
    ["2026-03-30T12:06:00.000Z", "2026-04-30T12:06:00.000Z"]
  ])("+1 mes natural: %s → %s", (input, expected) => {
    expect(addNaturalMonths(new Date(input), 1).toISOString()).toBe(expected);
  });

  it.each([
    ["plus_2_months", "2026-07-05T12:06:00.000Z", "2026-09-05T12:06:00.000Z"],
    ["plus_3_months", "2026-07-05T12:06:00.000Z", "2026-10-05T12:06:00.000Z"],
    ["plus_3_months", "2026-11-30T12:06:00.000Z", "2027-02-28T12:06:00.000Z"],
    ["plus_2_months", "2027-12-31T12:06:00.000Z", "2028-02-29T12:06:00.000Z"]
  ])("%s usa meses naturales: %s → %s", (preset, input, expected) => {
    expect(quickSubscriptionEndDate(preset as never, { status: "active", ends_at: input }, new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe(expected);
  });

  it("si está activo suma desde ends_at", () => {
    const result = quickSubscriptionEndDate("plus_1_month", {
      status: "active",
      ends_at: "2026-07-05T12:06:00.000Z"
    }, new Date("2026-06-01T10:00:00.000Z"));

    expect(result.toISOString()).toBe("2026-08-05T12:06:00.000Z");
  });

  it("si está caducado suma desde ahora", () => {
    const result = quickSubscriptionEndDate("plus_1_month", {
      status: "expired",
      ends_at: "2026-05-05T12:06:00.000Z"
    }, new Date("2026-06-10T09:30:00.000Z"));

    expect(result.toISOString()).toBe("2026-07-10T09:30:00.000Z");
  });

  it("si está pendiente suma desde ahora", () => {
    const base = quickExpiryBase({ status: "pending", ends_at: null }, new Date("2026-06-10T09:30:00.000Z"));

    expect(base.toISOString()).toBe("2026-06-10T09:30:00.000Z");
  });

  it("+15 días y +7 días usan la base correcta", () => {
    const subscription = { status: "active", ends_at: "2026-06-10T09:30:00.000Z" };

    expect(quickSubscriptionEndDate("plus_15_days", subscription, new Date("2026-06-01T00:00:00.000Z")).toISOString()).toBe("2026-06-25T09:30:00.000Z");
    expect(quickSubscriptionEndDate("plus_7_days", subscription, new Date("2026-06-01T00:00:00.000Z")).toISOString()).toBe("2026-06-17T09:30:00.000Z");
  });

  it("todos los presets visibles en UI están en la lista aceptada por backend", () => {
    expect([...quickExpiryPresetValues]).toEqual([
      "plus_1_month",
      "plus_2_months",
      "plus_3_months",
      "plus_15_days",
      "plus_7_days"
    ]);
  });
});
