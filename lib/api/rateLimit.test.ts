import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/telegram/auth";
import { checkRateLimit, clientIp } from "@/lib/api/rateLimit";

describe("checkRateLimit", () => {
  it("blocks repeated requests after the policy limit", async () => {
    const ctx = {
      user: { telegram_user_id: 424242 },
    } as AuthContext;
    const req = new Request("https://miniapp.test/api/rate-limit-test", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    });

    await checkRateLimit(req, ctx, { limit: 1, windowMs: 60_000 });

    await expect(checkRateLimit(req, ctx, { limit: 1, windowMs: 60_000 }))
      .rejects.toThrow("Too many requests for this endpoint");
  });

  it("uses the first x-forwarded-for address as the client IP", () => {
    const req = new Request("https://miniapp.test/api/rate-limit-test", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.2, 10.0.0.3" },
    });

    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("does not let an authenticated user bypass a quota by changing forwarded headers", async () => {
    const ctx = { user: { telegram_user_id: 778899 } } as AuthContext;
    const first = new Request("https://miniapp.test/api/rate-limit-header-test", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    const spoofed = new Request("https://miniapp.test/api/rate-limit-header-test", {
      headers: { "cf-connecting-ip": "198.51.100.99", "x-forwarded-for": "198.51.100.99" },
    });

    await checkRateLimit(first, ctx, { limit: 1, windowMs: 60_000 });
    await expect(checkRateLimit(spoofed, ctx, { limit: 1, windowMs: 60_000 }))
      .rejects.toThrow("Too many requests for this endpoint");
  });
});
