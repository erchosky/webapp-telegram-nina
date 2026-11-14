import "server-only";

import { readBoundedJson } from "@/lib/api/json";
import { ServiceError } from "@/lib/api/respond";
import { marketplaceInterestInputSchema } from "@/lib/marketplace/interestServer";

export const MAX_MARKETPLACE_INTEREST_BODY_BYTES = 16 * 1024;

export async function parseMarketplaceInterestRequest(req: Request) {
  const body = await readBoundedJson(req, {
    maxBytes: MAX_MARKETPLACE_INTEREST_BODY_BYTES,
  });
  const parsed = marketplaceInterestInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(400, "invalid_interest_input", "Datos de interés inválidos", {
      publicMessage: "Revisa el producto y el mensaje antes de enviarlo.",
    });
  }
  return parsed.data;
}
