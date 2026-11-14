import { describe, expect, it } from "vitest";
import { ServiceError } from "@/lib/api/respond";
import { readBoundedJson } from "@/lib/api/json";

describe("readBoundedJson", () => {
  it("accepts application/json with charset and identity encoding", async () => {
    const body = JSON.stringify({ value: "á" });
    const request = requestWith(body, {
      "content-type": "Application/JSON; charset=utf-8",
      "content-encoding": "identity",
      "content-length": String(Buffer.byteLength(body)),
    });

    await expect(readBoundedJson(request, { maxBytes: 64 })).resolves.toEqual({ value: "á" });
  });

  it.each([
    ["missing", {}],
    ["wrong", { "content-type": "text/plain" }],
  ])("rejects a %s JSON Content-Type", async (_label, headers) => {
    await expect(readBoundedJson(requestWith("{}", headers), { maxBytes: 64 })).rejects.toMatchObject({
      status: 415,
      code: "unsupported_media_type",
    });
  });

  it("rejects compressed bodies before reading them", async () => {
    await expect(readBoundedJson(requestWith("{}", {
      "content-type": "application/json",
      "content-encoding": "gzip",
    }), { maxBytes: 64 })).rejects.toMatchObject({
      status: 415,
      code: "unsupported_content_encoding",
    });
  });

  it("rejects an invalid declared length", async () => {
    await expect(readBoundedJson(requestWith("{}", {
      "content-type": "application/json",
      "content-length": "not-a-number",
    }), { maxBytes: 64 })).rejects.toMatchObject({
      status: 400,
      code: "invalid_content_length",
    });
  });

  it("rejects an oversized declared length before consuming the body", async () => {
    await expect(readBoundedJson(requestWith("{}", {
      "content-type": "application/json",
      "content-length": "65",
    }), { maxBytes: 64 })).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("counts real UTF-8 bytes even if Content-Length declares less", async () => {
    const body = JSON.stringify({ value: "éééé" });
    await expect(readBoundedJson(requestWith(body, {
      "content-type": "application/json",
      "content-length": "2",
    }), { maxBytes: 8 })).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("rejects malformed JSON", async () => {
    await expect(readBoundedJson(requestWith("{nope", {
      "content-type": "application/json",
    }), { maxBytes: 64 })).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it("rejects invalid UTF-8 JSON", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xc3, 0x28]),
    });

    await expect(readBoundedJson(request, { maxBytes: 64 })).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it("rejects an invalid configured limit as a programmer error", async () => {
    await expect(readBoundedJson(requestWith("{}", {
      "content-type": "application/json",
    }), { maxBytes: 0 })).rejects.toBeInstanceOf(RangeError);
  });

  it("uses ServiceError for client request failures", async () => {
    await expect(readBoundedJson(requestWith("null", {
      "content-type": "text/plain",
    }), { maxBytes: 64 })).rejects.toBeInstanceOf(ServiceError);
  });
});

function requestWith(body: BodyInit, headers: HeadersInit): Request {
  return new Request("https://example.test/api", { method: "POST", headers, body });
}
