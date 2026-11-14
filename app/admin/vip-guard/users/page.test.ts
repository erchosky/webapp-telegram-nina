import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("users dashboard CSV export link", () => {
  it("apunta a la ruta protegida real de exportación", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/vip-guard/users/page.tsx"), "utf8");

    expect(source).toContain('href="/api/admin/users/export"');
    expect(source).not.toContain('href="/api/admin/vip-guard/users/export"');
  });
});
