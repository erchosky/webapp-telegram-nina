import { describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isTelegramRateLimitError, telegramErrorMetadata, telegramRetryAfter } from "./error-metadata";

describe("telegram error metadata", () => {
  it("detecta 429 y conserva retry_after sin tratarlo como fallo definitivo", () => {
    const error = Object.assign(new Error("Too Many Requests: retry after 23"), {
      error_code: 429,
      parameters: { retry_after: 23 }
    });

    const metadata = telegramErrorMetadata(error, { method: "sendMessage", chat_id: 123, telegram_user_id: 123, subscription_id: "sub-1" });

    expect(isTelegramRateLimitError(error)).toBe(true);
    expect(telegramRetryAfter(error)).toBe(23);
    expect(metadata).toMatchObject({
      method: "sendMessage",
      telegram_error_code: 429,
      retry_after: 23,
      subscription_id: "sub-1"
    });
  });
});
