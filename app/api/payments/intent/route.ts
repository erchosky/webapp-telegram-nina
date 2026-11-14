import { ServiceError, withAuth } from "@/lib/api/respond";
import { parsePaymentIntentRequest } from "@/lib/api/payment-intent-request";
import { ENABLE_PAYMENT_INTENTS } from "@/lib/config/features";
import { createPaymentIntent, getPaymentIntent } from "@/lib/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth((ctx) => getPaymentIntent(ctx), {
  rateLimit: { limit: 30, windowMs: 60 * 1000 },
});

export const POST = withAuth(async (ctx, req) => {
  if (!ENABLE_PAYMENT_INTENTS) {
    throw new ServiceError(404, "payment_intents_disabled", "Payment intents are disabled");
  }
  const input = await parsePaymentIntentRequest(req);
  return createPaymentIntent(ctx, input);
}, {
  rateLimit: { limit: 3, windowMs: 10 * 60 * 1000 },
});
