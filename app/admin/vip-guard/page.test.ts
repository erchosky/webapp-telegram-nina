import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("vip guard dashboard metrics", () => {
  it("cuenta como activos los active con ends_at null", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/vip-guard/page.tsx"), "utf8");

    expect(source).toContain("ends_at.is.null");
    expect(source).toContain("ends_at.gt.");
  });
});
