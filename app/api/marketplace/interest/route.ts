import { withAuth } from "@/lib/api/respond";
import { parseMarketplaceInterestRequest } from "@/lib/api/marketplace-interest-request";
import { createMarketplaceInterest } from "@/lib/marketplace/interestServer";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (ctx, req) => {
    const input = await parseMarketplaceInterestRequest(req);
    return createMarketplaceInterest(ctx, input);
  },
  { rateLimit: { limit: 5, windowMs: 10 * 60 * 1000 } },
);
