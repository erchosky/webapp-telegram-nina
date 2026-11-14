import { ServiceError, withAuth } from "@/lib/api/respond";
import { ENABLE_REFERRALS } from "@/lib/config/features";
import { ensureReferralCode } from "@/lib/services/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (ctx) => {
  if (!ENABLE_REFERRALS) {
    throw new ServiceError(404, "referrals_disabled", "Referrals are disabled");
  }
  const code = await ensureReferralCode(ctx);
  return { code };
}, {
  rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 },
});
