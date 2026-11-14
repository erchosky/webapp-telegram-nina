import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./origin";

describe("origin validation", () => {
  it("acepta mismo Origin/Host", () => {
    expect(isSameOrigin("https://vip.example.com", "vip.example.com", "https")).toBe(true);
  });

  it("rechaza origen cruzado", () => {
    expect(isSameOrigin("https://evil.example.com", "vip.example.com", "https")).toBe(false);
  });

  it("rechaza origin ausente", () => {
    expect(isSameOrigin(null, "vip.example.com", "https")).toBe(false);
  });
});
