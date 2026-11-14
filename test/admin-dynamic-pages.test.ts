import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dynamicAdminFiles = [
  "app/admin/login/page.tsx",
  "app/admin/vip-guard/layout.tsx",
  "app/admin/vip-guard/page.tsx",
  "app/admin/vip-guard/logs/page.tsx",
  "app/admin/vip-guard/incidents/page.tsx",
  "app/admin/vip-guard/migration/page.tsx",
  "app/admin/vip-guard/settings/page.tsx",
  "app/admin/vip-guard/subscriptions/page.tsx",
  "app/admin/vip-guard/users/page.tsx",
  "app/admin/vip-guard/users/[id]/page.tsx",
];

describe("admin dynamic rendering", () => {
  it("forces dynamic rendering for admin routes that depend on cookies or Supabase", () => {
    for (const file of dynamicAdminFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
    }
  });
});
