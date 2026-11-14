import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_AGE_SECONDS,
  InitDataError,
  MAX_INIT_DATA_BYTES,
  signInitData,
  validateInitData,
} from "@/lib/telegram/initData";

const BOT_TOKEN = "test-bot-token-abcdefghijklmnop";

function buildInitData(overrides: Record<string, string> = {}, token = BOT_TOKEN) {
  const authDate = String(Math.floor(Date.now() / 1000));
  const fields: Record<string, string> = {
    auth_date: authDate,
    query_id: "AAEtest",
    user: JSON.stringify({
      id: 4242,
      first_name: "Creator",
      username: "nina",
      language_code: "es",
    }),
    ...overrides,
  };
  return signInitData(fields, token);
}

describe("validateInitData", () => {
  it("accepts a correctly signed payload and extracts the user", () => {
    const initData = buildInitData();
    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.user.id).toBe(4242);
    expect(result.user.username).toBe("nina");
    expect(result.user.language_code).toBe("es");
    expect(result.authDate).toBeInstanceOf(Date);
  });

  it("extracts start_param when present", () => {
    const initData = buildInitData({ start_param: "ref_ABC123" });
    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.startParam).toBe("ref_ABC123");
  });

  it("accepts signed payloads that include Telegram signature", () => {
    const initData = buildInitData({ signature: "ed25519-signature-placeholder" });
    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.user.id).toBe(4242);
  });

  it("rejects a tampered hash", () => {
    const initData = buildInitData() + "00";
    expect(() => validateInitData(initData, BOT_TOKEN)).toThrowError(InitDataError);
  });

  it("rejects a duplicate field even when the original credential remains correctly signed", () => {
    const initData = buildInitData();
    const duplicate = `${initData}&auth_date=${Math.floor(Date.now() / 1000)}`;

    try {
      validateInitData(duplicate, BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("duplicate_field");
    }
  });

  it("rejects oversized credentials before cryptographic processing", () => {
    const oversized = `query_id=${"x".repeat(MAX_INIT_DATA_BYTES)}`;

    try {
      validateInitData(oversized, BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("too_large");
    }
  });

  it("rejects when signed with a different bot token", () => {
    const initData = buildInitData({}, "other-token-abcdefghijklmnop");
    try {
      validateInitData(initData, BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InitDataError);
      expect((err as InitDataError).code).toBe("bad_hash");
    }
  });

  it("rejects mutated field values (data_check_string mismatch)", () => {
    const initData = buildInitData();
    const params = new URLSearchParams(initData);
    params.set("user", JSON.stringify({ id: 9999, first_name: "Eve" }));
    const tampered = params.toString();
    expect(() => validateInitData(tampered, BOT_TOKEN)).toThrowError(InitDataError);
  });

  it("rejects expired auth_date", () => {
    const old = String(Math.floor(Date.now() / 1000) - DEFAULT_MAX_AGE_SECONDS - 60);
    const initData = buildInitData({ auth_date: old });
    try {
      validateInitData(initData, BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("expired");
    }
  });

  it("rejects auth_date too far in the future", () => {
    const now = new Date("2026-06-28T12:00:00.000Z");
    const future = String(Math.floor(now.getTime() / 1000) + 61);
    const initData = buildInitData({ auth_date: future });
    try {
      validateInitData(initData, BOT_TOKEN, { now });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("future_auth_date");
    }
  });

  it("rejects auth_date older than a custom maxAgeSeconds", () => {
    const now = new Date("2026-06-28T12:00:00.000Z");
    const old = String(Math.floor(now.getTime() / 1000) - 60 * 60 - 1);
    const initData = buildInitData({ auth_date: old });
    try {
      validateInitData(initData, BOT_TOKEN, { now, maxAgeSeconds: 60 * 60 });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("expired");
    }
  });

  it("accepts an old auth_date with a custom maxAgeSeconds", () => {
    const old = String(Math.floor(Date.now() / 1000) - DEFAULT_MAX_AGE_SECONDS - 60);
    const initData = buildInitData({ auth_date: old });
    const result = validateInitData(initData, BOT_TOKEN, {
      maxAgeSeconds: DEFAULT_MAX_AGE_SECONDS * 2,
    });
    expect(result.user.id).toBe(4242);
  });

  it("rejects empty initData", () => {
    try {
      validateInitData("", BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("missing");
    }
  });

  it("rejects initData without a hash", () => {
    const params = new URLSearchParams({ auth_date: "1700000000", user: "{}" });
    try {
      validateInitData(params.toString(), BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("missing_hash");
    }
  });

  it("rejects payloads without a numeric user id", () => {
    const initData = buildInitData({ user: JSON.stringify({ first_name: "NoId" }) });
    try {
      validateInitData(initData, BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("missing_user");
    }
  });

  it("rejects Telegram bot users", () => {
    const initData = buildInitData({
      user: JSON.stringify({ id: 4242, first_name: "Bot", is_bot: true }),
    });
    try {
      validateInitData(initData, BOT_TOKEN);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as InitDataError).code).toBe("bot_user");
    }
  });

  it("sanitizes bounded user profile fields", () => {
    const initData = buildInitData({
      user: JSON.stringify({
        id: 4242,
        first_name: ` Creator\u0000${"x".repeat(80)}`,
        last_name: "  Test\u0007  ",
        username: "@nina<script>",
        language_code: " es-ES-extra-long ",
      }),
    });
    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.user.first_name).toHaveLength(64);
    expect(result.user.first_name?.startsWith("Creator")).toBe(true);
    expect(result.user.last_name).toBe("Test");
    expect(result.user.username).toBe("ninascript");
    expect(result.user.language_code).toBe("es-ES-extra-long");
  });
});
