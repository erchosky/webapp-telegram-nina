import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("webapp interests dashboard", () => {
  it("carga producto y categoría para que el interés sea accionable", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/webapp/interests/page.tsx"), "utf8");
    const dataSource = readFileSync(join(process.cwd(), "lib/admin/webappData.ts"), "utf8");

    expect(dataSource).toContain("marketplace_items(id, title, status");
    expect(source).toContain("<strong>Producto:</strong>");
    expect(source).toContain("<strong>Categoría:</strong>");
    expect(source).toContain("Exportar CSV filtrado");
    expect(source).toContain("pageSize: 25");
  });
});
