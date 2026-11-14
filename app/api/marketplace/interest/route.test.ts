import { describe, expect, it } from "vitest";
import {
  MAX_MARKETPLACE_INTEREST_BODY_BYTES,
  parseMarketplaceInterestRequest,
} from "@/lib/api/marketplace-interest-request";

const ITEM_ID = "3c1a2d0e-f2bd-4be1-a262-2bf5c46a0e99";

describe("marketplace interest HTTP contract", () => {
  it("accepts only the bounded public payload", async () => {
    await expect(parseMarketplaceInterestRequest(jsonRequest(JSON.stringify({
      itemId: ITEM_ID,
      message: "  Me interesa  ",
    })))).resolves.toEqual({ itemId: ITEM_ID, message: "Me interesa" });
  });

  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["wrong types", JSON.stringify({ itemId: 42, message: false })],
    ["extra keys", JSON.stringify({ itemId: ITEM_ID, message: "Hola", metadata: { userId: "attacker" } })],
  ])("rejects %s without reaching the service contract", async (_label, body) => {
    await expect(parseMarketplaceInterestRequest(jsonRequest(body))).rejects.toMatchObject({
      status: 400,
      code: "invalid_interest_input",
    });
  });

  it("rejects malformed JSON", async () => {
    await expect(parseMarketplaceInterestRequest(jsonRequest("{broken"))).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it("rejects the real body size even with a smaller declaration", async () => {
    const body = JSON.stringify({ itemId: ITEM_ID, message: "x".repeat(MAX_MARKETPLACE_INTEREST_BODY_BYTES) });
    await expect(parseMarketplaceInterestRequest(jsonRequest(body, {
      "content-length": "2",
    }))).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
  });

  it.each([
    ["wrong content type", { "content-type": "text/plain" }, "unsupported_media_type"],
    ["compressed body", { "content-encoding": "br" }, "unsupported_content_encoding"],
  ])("rejects %s", async (_label, headers, code) => {
    await expect(parseMarketplaceInterestRequest(jsonRequest(JSON.stringify({ itemId: ITEM_ID }), headers))).rejects.toMatchObject({
      status: 415,
      code,
    });
  });
});

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/marketplace/interest", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
