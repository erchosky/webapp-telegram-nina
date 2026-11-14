import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/telegram/auth";
import type { ReferralCodeRow, TelegramUserRow } from "@/lib/domain/types";
import { ensureReferralCode } from "@/lib/services/referrals";

describe("ensureReferralCode", () => {
  it("returns the raced user code when insert hits unique violation", async () => {
    const ctx = ctxWith({
      codeResults: [
        { data: null, error: null },
        { data: codeRow("NINA2026"), error: null },
      ],
      insertResult: {
        data: null,
        error: { code: "23505", message: "duplicate" },
      },
    });

    await expect(ensureReferralCode(ctx)).resolves.toBe("NINA2026");
  });
});

function ctxWith({
  codeResults,
  insertResult,
}: {
  codeResults: Array<{ data: ReferralCodeRow | null; error: null | { message: string } }>;
  insertResult: { data: ReferralCodeRow | null; error: null | { code?: string; message: string } };
}): AuthContext {
  let codeIndex = 0;
  const supabase = {
    from(table: string) {
      if (table !== "referral_codes") throw new Error(`Unexpected table ${table}`);
      let inserting = false;
      return chain(() => (inserting ? insertResult : codeResults[codeIndex++]), () => {
        inserting = true;
      });
    },
  };
  return { supabase: supabase as never, tgUser: { id: 123 }, user: user() };
}

function chain(result: () => unknown, onInsert: () => void): Record<string, unknown> {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    insert: () => {
      onInsert();
      return self;
    },
    maybeSingle: () => Promise.resolve(result()),
    single: () => Promise.resolve(result()),
  };
  return self;
}

function codeRow(code: string): ReferralCodeRow {
  return { id: "code-1", telegram_user_id: "user-1", code };
}

function user(): TelegramUserRow {
  return {
    id: "user-1",
    telegram_user_id: 123,
    telegram_username: "nina",
    first_name: "Creator",
    last_name: null,
    language_code: "es",
    first_seen_at: null,
    started_bot_at: null,
    last_seen_at: null,
    first_subscription_at: null,
    current_streak_months: 0,
    operational_status: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}
