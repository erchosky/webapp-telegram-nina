import { describe, expect, it } from "vitest";
import { DEV_SCENARIOS, VISIBLE_DEV_SCENARIOS, devInvite, devMe, devReferrals } from "@/lib/dev/mockData";

describe("dev mock data", () => {
  it("includes every requested local scenario", () => {
    expect(DEV_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "onboarding",
      "no_vip",
      "choosing_plan",
      "active_vip",
      "expired_vip",
      "payment_pending",
      "invite_available",
      "invite_used",
      "invite_expired",
      "api_error",
      "loading",
    ]);
  });

  it("keeps referral scenarios out of the visible local panel", () => {
    expect(VISIBLE_DEV_SCENARIOS.map((scenario) => scenario.id)).toEqual(
      DEV_SCENARIOS.map((scenario) => scenario.id),
    );
  });

  it("models pending payment with an open intent timestamp", () => {
    const me = devMe("payment_pending");
    expect(me.hasOpenPaymentIntent).toBe(true);
    expect(me.paymentIntent?.status).toBe("requested");
    expect(me.paymentIntent?.createdAt).toBeTruthy();
  });

  it("does not expose used or expired invite links as available", () => {
    expect(devInvite("invite_used").inviteLink).toBeNull();
    expect(devInvite("invite_expired").inviteLink).toBeNull();
    expect(devInvite("invite_available").inviteLink).toMatch(/^https:\/\/t\.me\//);
  });

  it("separates referral empty and generated states", () => {
    expect(devReferrals("active_vip").code).toBeNull();
  });
});
