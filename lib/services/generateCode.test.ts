import { describe, expect, it } from "vitest";
import {
  REFERRAL_CODE_PATTERN,
  generateReferralCode,
} from "@/lib/services/generateCode";

describe("generateReferralCode", () => {
  it("produces codes matching the VIP Guard constraint", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(REFERRAL_CODE_PATTERN);
      expect(code).toHaveLength(8);
    }
  });

  it("respects a custom length", () => {
    expect(generateReferralCode(12)).toHaveLength(12);
  });

  it("rejects out-of-range lengths", () => {
    expect(() => generateReferralCode(4)).toThrow(RangeError);
    expect(() => generateReferralCode(40)).toThrow(RangeError);
  });

  it("is sufficiently random (no trivial collisions)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateReferralCode());
    expect(seen.size).toBeGreaterThan(990);
  });
});
