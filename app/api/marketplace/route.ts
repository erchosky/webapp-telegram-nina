import { jsonError, jsonOk, ServiceError } from "@/lib/api/respond";
import { getPublicMarketplaceCatalog } from "@/lib/marketplace/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await getPublicMarketplaceCatalog());
  } catch (err) {
    if (err instanceof ServiceError) {
      console.error("[miniapp] marketplace route error", err.context ?? err.message);
      return jsonError(err.status, err.code, err.publicMessage);
    }
    console.error("[miniapp] marketplace route error", err);
    return jsonError(500, "internal_error", "No se pudo cargar el catálogo.");
  }
}
