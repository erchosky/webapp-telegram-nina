import { describe, expect, it } from "vitest";
import { MAX_WEBHOOK_BODY_BYTES, parseWebhookPayload } from "@/lib/telegram/webhook-payload";

describe("parseWebhookPayload", () => {
  it("rejects bodies exceeding the explicit payload limit before parsing JSON", async () => {
    const request = new Request("https://vip.example.com/api/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1),
      },
      body: "{}",
    });

    await expect(parseWebhookPayload(request)).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
  });

  it("rejects malformed JSON without including the raw body in the error", async () => {
    const request = new Request("https://vip.example.com/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{secret-payload",
    });

    await expect(parseWebhookPayload(request)).rejects.toMatchObject({ status: 400, code: "invalid_json" });
  });

  it("uses the real decoded body size even if a proxy declares a smaller compressed size", async () => {
    const request = new Request("https://vip.example.com/api/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "2",
        "content-encoding": "gzip",
      },
      body: "{}",
    });

    await expect(parseWebhookPayload(request)).rejects.toMatchObject({
      status: 415,
      code: "unsupported_content_encoding",
    });
  });

  it("rejects a non-JSON Content-Type", async () => {
    const request = new Request("https://vip.example.com/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    await expect(parseWebhookPayload(request)).rejects.toMatchObject({
      status: 415,
      code: "unsupported_media_type",
    });
  });
});
