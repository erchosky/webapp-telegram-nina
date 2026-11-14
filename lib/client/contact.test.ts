import { describe, expect, it } from "vitest";
import { resolveContactTarget } from "@/lib/client/contact";

describe("resolveContactTarget", () => {
  it("converts Telegram usernames into t.me URLs", () => {
    expect(resolveContactTarget("@creator_dev")).toEqual({
      kind: "telegram",
      url: "https://t.me/creator_dev",
    });
  });

  it("keeps t.me links on the Telegram channel", () => {
    expect(resolveContactTarget("https://t.me/creator_dev")).toMatchObject({
      kind: "telegram",
    });
  });

  it("allows safe external https URLs", () => {
    expect(resolveContactTarget("https://example.com/help")).toMatchObject({
      kind: "external",
    });
  });

  it("rejects unsafe URLs", () => {
    expect(resolveContactTarget("javascript:alert(1)")).toMatchObject({
      kind: "invalid",
    });
  });
});
