import { describe, expect, it, vi } from "vitest";

describe("referidos desactivados", () => {
  it("no registra atribución ni recompensa cuando el feature flag está apagado", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/logs", () => ({ auditLog: vi.fn(), botLog: vi.fn() }));
    vi.doMock("@/lib/telegram/api", () => ({ getBotInfo: vi.fn() }));
    vi.doMock("./config/features", () => ({ ENABLE_REFERRALS: false }));
    const { recordReferralStart, rewardReferralIfEligible } = await import("./referrals");
    const db = { from: vi.fn() };

    await expect(recordReferralStart("user-1", "ref_CODE", db as never)).resolves.toEqual({
      recorded: false,
      reason: "referrals_disabled",
    });
    await expect(rewardReferralIfEligible("user-1", db as never)).resolves.toEqual({
      rewarded: false,
      reason: "referrals_disabled",
    });
    expect(db.from).not.toHaveBeenCalled();
  });
});
