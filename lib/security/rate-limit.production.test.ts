import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("production rate limit", () => {
  it("usa el RPC distribuido check_rate_limit en produccion", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("admin-login:203.0.113.10", 5, 60_000);

    expect(result.allowed).toBe(true);
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "admin-login:203.0.113.10",
      p_limit: 5,
      p_window_ms: 60_000
    });
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/supabase/admin");
  });
});
