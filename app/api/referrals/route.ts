import { ServiceError, withAuth } from "@/lib/api/respond";
import { ENABLE_REFERRALS } from "@/lib/config/features";
import { getReferrals } from "@/lib/services/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth((ctx) => {
  if (!ENABLE_REFERRALS) {
    throw new ServiceError(404, "referrals_disabled", "Referrals are disabled");
  }
  return getReferrals(ctx);
}, {
  rateLimit: { limit: 30, windowMs: 60 * 1000 },
});
