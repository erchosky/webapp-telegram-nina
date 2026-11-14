import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OFFICIAL_TELEGRAM_API_ROOT,
  telegramApiMethodUrl,
  telegramApiRoot,
  TEST_TELEGRAM_API_ROOT_ENV,
} from "./client-config";

describe("Telegram API root guard", () => {
  beforeEach(() => {
    vi.stubEnv("E2E_TEST_MODE", "");
    vi.stubEnv(TEST_TELEGRAM_API_ROOT_ENV, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the official API by default", () => {
    expect(telegramApiRoot()).toBe(OFFICIAL_TELEGRAM_API_ROOT);
  });

  it("ignores a custom root outside the explicit E2E mode", () => {
    vi.stubEnv(TEST_TELEGRAM_API_ROOT_ENV, "http://127.0.0.1:4010");

    expect(telegramApiRoot()).toBe(OFFICIAL_TELEGRAM_API_ROOT);
  });

  it.each([
    ["http://127.0.0.1:4010/", "http://127.0.0.1:4010"],
    ["http://127.20.30.40:4010", "http://127.20.30.40:4010"],
    ["http://localhost:4010", "http://localhost:4010"],
    ["https://[::1]:4010", "https://[::1]:4010"],
  ])("accepts and normalizes an E2E loopback origin %s", (configured, expected) => {
    vi.stubEnv("E2E_TEST_MODE", "1");
    vi.stubEnv(TEST_TELEGRAM_API_ROOT_ENV, configured);

    expect(telegramApiRoot()).toBe(expected);
  });

  it.each([
    "https://api.telegram.org",
    "http://example.com:4010",
    "http://localhost.evil.example:4010",
    "http://0.0.0.0:4010",
    "ftp://127.0.0.1:4010",
    "http://user:pass@127.0.0.1:4010",
    "http://127.0.0.1:4010/base",
    "http://127.0.0.1:4010?debug=1",
    "not-a-url",
  ])("rejects an unsafe E2E root %s", (configured) => {
    vi.stubEnv("E2E_TEST_MODE", "1");
    vi.stubEnv(TEST_TELEGRAM_API_ROOT_ENV, configured);

    expect(() => telegramApiRoot()).toThrow(TEST_TELEGRAM_API_ROOT_ENV);
  });

  it("builds method URLs from the guarded root", () => {
    vi.stubEnv("E2E_TEST_MODE", "1");
    vi.stubEnv(TEST_TELEGRAM_API_ROOT_ENV, "http://127.0.0.1:4010");

    expect(telegramApiMethodUrl("123:test-token", "sendMessage"))
      .toBe("http://127.0.0.1:4010/bot123:test-token/sendMessage");
    expect(() => telegramApiMethodUrl("123:test-token", "../getMe"))
      .toThrow("Invalid Telegram Bot API method name");
  });
});
