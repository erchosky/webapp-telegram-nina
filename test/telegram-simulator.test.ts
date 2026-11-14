import { describe, expect, it } from "vitest";
import {
  InitDataError,
  MAX_INIT_DATA_BYTES,
  validateInitData,
} from "@/lib/telegram/initData";
import {
  createCompressedOversizedWebhookBody,
  createDuplicateInitDataField,
  createLargeInitData,
  createTelegramInitData,
  createTelegramUpdate,
  tamperInitDataHash,
  TEST_TELEGRAM_BOT_TOKEN,
  TEST_TELEGRAM_USERS,
} from "./support/telegram-simulator";

describe("cryptographic Telegram fixtures", () => {
  it("covers valid, Unicode, escaped and reordered query values", () => {
    const initData = createTelegramInitData({
      reverseOrder: true,
      extraFields: [["start_param", "ref/ñ + & = ?"]],
    });

    const result = validateInitData(initData, TEST_TELEGRAM_BOT_TOKEN);
    expect(result.user).toMatchObject(TEST_TELEGRAM_USERS.member);
    expect(result.startParam).toBe("ref/ñ + & = ?");
  });

  it("can represent a different signed identity", () => {
    const initData = createTelegramInitData({ user: TEST_TELEGRAM_USERS.otherMember });
    expect(validateInitData(initData, TEST_TELEGRAM_BOT_TOKEN).user.id)
      .toBe(TEST_TELEGRAM_USERS.otherMember.id);
  });

  it.each([
    ["missing auth_date", createTelegramInitData({ omit: "auth_date" }), "missing_auth_date"],
    ["missing user", createTelegramInitData({ omit: "user" }), "missing_user"],
    ["old timestamp", createTelegramInitData({ authDate: Math.floor(Date.now() / 1000) - 7_201 }), "expired"],
    ["future timestamp", createTelegramInitData({ authDate: Math.floor(Date.now() / 1000) + 61 }), "future_auth_date"],
    ["altered hash", tamperInitDataHash(createTelegramInitData()), "bad_hash"],
    ["duplicate field", createDuplicateInitDataField(), "duplicate_field"],
    ["large payload", createLargeInitData(MAX_INIT_DATA_BYTES), "too_large"],
  ])("generates the %s adversarial case", (_name, initData, expectedCode) => {
    try {
      validateInitData(initData, TEST_TELEGRAM_BOT_TOKEN);
      throw new Error("fixture should be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(InitDataError);
      expect((error as InitDataError).code).toBe(expectedCode);
    }
  });

  it("builds deterministic duplicate, unknown and compressed update fixtures", () => {
    expect(createTelegramUpdate({ updateId: 42 }).update_id).toBe(42);
    expect(createTelegramUpdate({ updateId: 42 }).update_id).toBe(42);
    expect(createTelegramUpdate({ unknown: true })).toHaveProperty("unknown_fixture_update");
    const compressed = createCompressedOversizedWebhookBody();
    expect(compressed.headers["content-encoding"]).toBe("gzip");
    expect(compressed.body.byteLength).toBeGreaterThan(0);
  });
});
