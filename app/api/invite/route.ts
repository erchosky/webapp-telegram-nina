import { withAuth } from "@/lib/api/respond";
import { getInvite } from "@/lib/services/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth((ctx) => getInvite(ctx), {
  rateLimit: { limit: 30, windowMs: 60 * 1000 },
});
