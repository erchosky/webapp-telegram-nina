import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("incidents dashboard filtering", () => {
  it("muestra abiertas por defecto y conserva acceso a resueltas", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/vip-guard/incidents/page.tsx"), "utf8");

    expect(source).toContain('params.filter === "all" || params.filter === "resolved" ? params.filter : "open"');
    expect(source).toContain('href={filterHref("resolved")}');
    expect(source).toContain('.in("status", ["open", "investigating", "acknowledged"])');
  });
});
