import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("production-only route boundaries", () => {
  it("mantiene rutas dev fuera de producción sin redirigirlas a una página real", () => {
    const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
    const devPage = readFileSync(join(process.cwd(), "app/dev/page.tsx"), "utf8");

    expect(config).not.toMatch(/source:\s*["']\/dev/);
    expect(devPage).toMatch(/process\.env\.NODE_ENV\s*!==\s*["']development["']\)\s*notFound\(\)/);
  });
});
