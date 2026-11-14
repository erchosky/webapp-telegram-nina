import { describe, expect, it } from "vitest";
import { daysUntil } from "@/lib/util/dates";

describe("daysUntil", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");

  it("returns null for null/invalid input", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("not-a-date", now)).toBeNull();
  });

  it("counts whole days until a future date", () => {
    expect(daysUntil("2026-06-29T12:00:00.000Z", now)).toBe(3);
  });

  it("rounds partial days up", () => {
    expect(daysUntil("2026-06-27T00:00:00.000Z", now)).toBe(1);
  });

  it("returns negative for past dates", () => {
    expect(daysUntil("2026-06-24T12:00:00.000Z", now)).toBe(-2);
  });

  it("returns negative as soon as a date is in the past", () => {
    expect(daysUntil("2026-06-26T11:59:59.000Z", now)).toBe(-1);
  });
});
