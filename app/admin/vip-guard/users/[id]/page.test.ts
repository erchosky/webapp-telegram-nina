import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("user detail destructive actions", () => {
  it("exige confirmación fuerte para cancelar suscripción", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/vip-guard/users/[id]/page.tsx"), "utf8");

    expect(source).toContain('name="cancel_confirmation"');
    expect(source).toContain("Escribe CANCELAR");
  });
});
