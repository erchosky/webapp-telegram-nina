import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("sensitive rate limit usage", () => {
  it("admin, cron and bot use the shared async rate-limit wrapper", () => {
    const files = [
      "app/admin/actions.ts",
      "lib/admin/webappActions.ts",
      "app/api/cron/check-expired/route.ts",
      "lib/telegram/bot.ts"
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, `${file} debe usar checkRateLimit`).toContain("checkRateLimit");
      expect(source, `${file} no debe usar rateLimit() directo`).not.toMatch(/[^A-Za-z0-9_]rateLimit\(/);
    }
  });
});
