import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("service-role boundaries", () => {
  it("creates the service-role client only in a server-only module", () => {
    const source = read("lib/supabase/admin.ts");
    expect(source).toMatch(/^import "server-only";/);
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).toContain("persistSession: false");
  });

  it("keeps service-role imports and secret names out of Client Components", () => {
    const clientFiles = [
      "components/AppShell.tsx",
      "components/TelegramProvider.tsx",
      "components/screens/AccessScreen.tsx",
      "components/screens/ContactScreen.tsx",
      "components/screens/InviteScreen.tsx",
      "components/screens/JourneyScreen.tsx",
      "components/screens/MarketplaceScreen.tsx",
      "components/screens/RenewScreen.tsx",
      "components/screens/StatusScreen.tsx",
      "lib/client/api.ts",
    ];
    for (const file of clientFiles) {
      const source = read(file);
      expect(source, file).not.toMatch(/@\/lib\/supabase\/admin|SUPABASE_SERVICE_ROLE_KEY|createAdminClient/);
    }
  });

  it("keeps user-facing API routes behind the shared Telegram authentication wrapper", () => {
    for (const file of [
      "app/api/me/route.ts",
      "app/api/invite/route.ts",
      "app/api/payments/intent/route.ts",
      "app/api/referrals/route.ts",
      "app/api/referrals/code/route.ts",
      "app/api/marketplace/interest/route.ts",
    ]) {
      expect(read(file), file).toContain("withAuth(");
    }
  });
});
