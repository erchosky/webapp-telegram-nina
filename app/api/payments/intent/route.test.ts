import { describe, expect, it } from "vitest";
import {
  MAX_PAYMENT_INTENT_BODY_BYTES,
  parsePaymentIntentRequest,
} from "@/lib/api/payment-intent-request";

describe("payment intent HTTP contract", () => {
  it("accepts a known server-side plan", async () => {
    await expect(parsePaymentIntentRequest(jsonRequest(JSON.stringify({
      selectedPlanId: "vip_3m",
    })))).resolves.toEqual({ selectedPlanId: "vip_3m" });
  });

  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["missing plan", "{}"],
    ["wrong type", JSON.stringify({ selectedPlanId: 42 })],
    ["unknown plan", JSON.stringify({ selectedPlanId: "attacker-plan" })],
    ["extra keys", JSON.stringify({ selectedPlanId: "vip_3m", amountExpected: 1 })],
  ])("rejects %s", async (_label, body) => {
    await expect(parsePaymentIntentRequest(jsonRequest(body))).rejects.toMatchObject({
      status: 400,
      code: "invalid_payment_intent_input",
    });
  });

  it("rejects malformed JSON instead of creating a plan-less intent", async () => {
    await expect(parsePaymentIntentRequest(jsonRequest("{broken"))).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it("rejects an oversized body based on its real bytes", async () => {
    const body = JSON.stringify({ selectedPlanId: "vip_3m", padding: "x".repeat(MAX_PAYMENT_INTENT_BODY_BYTES) });
    await expect(parsePaymentIntentRequest(jsonRequest(body, {
      "content-length": "1",
    }))).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
  });

  it.each([
    ["missing content type", { "content-type": "" }, "unsupported_media_type"],
    ["wrong content type", { "content-type": "application/x-www-form-urlencoded" }, "unsupported_media_type"],
    ["compressed body", { "content-encoding": "gzip" }, "unsupported_content_encoding"],
  ])("rejects %s", async (_label, headers, code) => {
    await expect(parsePaymentIntentRequest(jsonRequest(JSON.stringify({ selectedPlanId: "vip_3m" }), headers))).rejects.toMatchObject({
      status: 415,
      code,
    });
  });
});

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/payments/intent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
