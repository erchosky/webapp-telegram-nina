import "server-only";
import { headers } from "next/headers";

export function isSameOrigin(origin: string | null, host: string | null, forwardedProto?: string | null) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    const proto = forwardedProto?.split(",")[0]?.trim() || parsed.protocol.replace(":", "");
    return parsed.host === host && (process.env.NODE_ENV !== "production" || parsed.protocol === `${proto}:`);
  } catch {
    return false;
  }
}

export async function assertSameOrigin() {
  const incoming = await headers();
  const origin = incoming.get("origin");
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const proto = incoming.get("x-forwarded-proto");

  if (!origin && process.env.NODE_ENV !== "production") return;
  if (!isSameOrigin(origin, host, proto)) throw new Error("Origen no permitido para esta acción.");
}
