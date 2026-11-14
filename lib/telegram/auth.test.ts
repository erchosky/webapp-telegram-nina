import { describe, expect, it } from "vitest";
import { extractInitData } from "@/lib/telegram/auth";

describe("extractInitData", () => {
  it("reads tma authorization headers", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { authorization: "tma auth_date=1&hash=abc" },
    });

    expect(extractInitData(req)).toBe("auth_date=1&hash=abc");
  });

  it("falls back to x-telegram-init-data", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { "x-telegram-init-data": "auth_date=1&hash=abc" },
    });

    expect(extractInitData(req)).toBe("auth_date=1&hash=abc");
  });
});
