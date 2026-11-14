import "server-only";
import { readBoundedJson } from "@/lib/api/json";

/** Telegram updates are small; reject oversized bodies before JSON parsing. */
export const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

export async function parseWebhookPayload(request: Request): Promise<unknown> {
  return readBoundedJson(request, { maxBytes: MAX_WEBHOOK_BODY_BYTES });
}
