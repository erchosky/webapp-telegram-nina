import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logs", () => ({ auditLog: vi.fn(), botLog: vi.fn() }));
vi.mock("@/lib/telegram/api", () => ({ getBotInfo: vi.fn().mockResolvedValue({ username: "VipGuardBot" }) }));
vi.mock("./config/features", () => ({ ENABLE_REFERRALS: true }));

import { recordReferralStart, referralLinkForUser, rewardReferralIfEligible } from "./referrals";

function dbMock(options: { existingRewardStatus?: string; activeReferrer?: boolean } = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown>; id?: string }> = [];
  const db = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              if (table === "referral_codes" && column === "telegram_user_id") {
                return { maybeSingle: async () => ({ data: null, error: null }) };
              }
              if (table === "referral_codes" && column === "code") {
                return { maybeSingle: async () => ({ data: { id: "code-1", telegram_user_id: value === "SELF" ? "user-1" : "referrer-1", code: value }, error: null }) };
              }
              if (table === "referral_attributions" && column === "referred_user_id") {
                return { maybeSingle: async () => ({ data: { id: "attr-1", referrer_user_id: "referrer-1", referred_user_id: value }, error: null }) };
              }
              if (table === "referral_rewards" && column === "attribution_id") {
                return {
                  maybeSingle: async () => ({
                    data: options.existingRewardStatus ? { id: "reward-1", status: options.existingRewardStatus } : null,
                    error: null,
                  }),
                };
              }
              if (table === "subscriptions" && column === "telegram_user_id") {
                return {
                  eq: () => ({
                    gt: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => ({
                            data: options.activeReferrer ? { id: "sub-1", ends_at: "2026-07-01T10:00:00.000Z" } : null,
                            error: null
                          })
                        })
                      })
                    })
                  })
                };
              }
              return { maybeSingle: async () => ({ data: null, error: null }) };
            }
          };
        },
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return { select: () => ({ single: async () => ({ data: { id: `${table}-1`, ...payload }, error: null }) }), then: (resolve: (value: unknown) => unknown) => resolve({ error: null }) };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: (_column: string, id: string) => {
              updates.push({ table, payload, id });
              return { error: null };
            }
          };
        }
      };
    }
  };
  return { db, inserts, updates };
}

describe("referidos", () => {
  it("genera enlace único del bot", async () => {
    const { db } = dbMock();
    const link = await referralLinkForUser("user-1", db as never);
    expect(link).toMatch(/^https:\/\/t\.me\/VipGuardBot\?start=ref_/);
  });

  it("no permite autorreferido", async () => {
    const { db } = dbMock();
    const result = await recordReferralStart("user-1", "SELF", db as never);
    expect(result).toEqual({ recorded: false, reason: "self_referral" });
  });

  it("no duplica recompensa si ya existe", async () => {
    const { db } = dbMock({ existingRewardStatus: "applied", activeReferrer: true });
    const result = await rewardReferralIfEligible("referred-1", db as never);
    expect(result).toEqual({ rewarded: false, reason: "already_rewarded" });
  });

  it("permite aplicar más tarde una recompensa previamente saltada", async () => {
    const { db, updates } = dbMock({ existingRewardStatus: "skipped", activeReferrer: true });
    const result = await rewardReferralIfEligible("referred-1", db as never, new Date("2026-06-24T10:00:00.000Z"));
    expect(result).toMatchObject({ rewarded: true, referrerUserId: "referrer-1" });
    expect(updates.some((item) => item.table === "referral_rewards" && item.payload.status === "applied")).toBe(true);
  });

  it("aplica +5 días cuando el referido se activa y el referidor está activo", async () => {
    const { db, updates } = dbMock({ activeReferrer: true });
    const result = await rewardReferralIfEligible("referred-1", db as never, new Date("2026-06-24T10:00:00.000Z"));
    expect(result).toMatchObject({ rewarded: true, referrerUserId: "referrer-1" });
    expect(updates.some((item) => item.table === "subscriptions" && item.payload.ends_at === "2026-07-06T10:00:00.000Z")).toBe(true);
    expect(updates.some((item) => item.table === "referral_rewards" && item.payload.status === "applied")).toBe(true);
  });
});
