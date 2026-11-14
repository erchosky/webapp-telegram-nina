import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TestInitDataError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    createAdminClient: vi.fn(),
    telegramEnv: vi.fn(),
    validateInitData: vi.fn(),
    InitDataError: TestInitDataError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ telegramEnv: mocks.telegramEnv }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/telegram/initData", () => ({
  InitDataError: mocks.InitDataError,
  validateInitData: mocks.validateInitData,
}));

import { authenticate } from "@/lib/telegram/auth";

const userRow = {
  id: "internal-user-id",
  telegram_user_id: 4242,
  telegram_username: "nina",
  first_name: "Nina",
  last_name: null,
  language_code: "es",
  first_seen_at: "2026-07-01T00:00:00.000Z",
  started_bot_at: null,
  last_seen_at: new Date().toISOString(),
  first_subscription_at: null,
  current_streak_months: 0,
  operational_status: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

describe("authenticate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.telegramEnv.mockReturnValue({ TELEGRAM_BOT_TOKEN: "123:token", TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: 7200 });
    mocks.validateInitData.mockReturnValue({
      user: { id: 4242, first_name: "Nina", username: "nina", language_code: "es" },
      authDate: new Date(),
      startParam: "ref_ABC",
    });
  });

  it("derives the database identity from signed initData instead of a client resource id", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: userRow, error: null }),
    };
    const db = { from: vi.fn(() => query) };
    mocks.createAdminClient.mockReturnValue(db);

    const ctx = await authenticate(new Request("https://vip.example.com/api/me", {
      headers: { authorization: "tma signed-telegram-data" },
    }));

    expect(ctx.user.id).toBe("internal-user-id");
    expect(ctx.tgUser.id).toBe(4242);
    expect(ctx.startParam).toBe("ref_ABC");
    expect(db.from).toHaveBeenCalledWith("telegram_users");
    expect(mocks.validateInitData).toHaveBeenCalledWith("signed-telegram-data", "123:token", { maxAgeSeconds: 7200 });
  });

  it("rejects direct calls without initData", async () => {
    await expect(authenticate(new Request("https://vip.example.com/api/me")))
      .rejects.toMatchObject({ status: 401, code: "missing_init_data" });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("maps altered or replayed Telegram data to a non-disclosing 401", async () => {
    mocks.validateInitData.mockImplementation(() => {
      throw new mocks.InitDataError("expired");
    });

    await expect(authenticate(new Request("https://vip.example.com/api/me", {
      headers: { "x-telegram-init-data": "replayed-or-tampered" },
    }))).rejects.toMatchObject({ status: 401, code: "init_data_expired" });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
