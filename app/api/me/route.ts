import { withAuth } from "@/lib/api/respond";
import { getMe } from "@/lib/services/me";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth((ctx) => getMe(ctx), {
  rateLimit: { limit: 60, windowMs: 60 * 1000 },
});
