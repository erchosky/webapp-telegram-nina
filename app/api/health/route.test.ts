import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("solo expone liveness público y no flags internos", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, type: "liveness" });
    expect(JSON.stringify(body)).not.toContain("hasServiceRole");
    expect(JSON.stringify(body)).not.toContain("hasTelegramToken");
    expect(JSON.stringify(body)).not.toContain("app_version");
  });
});
