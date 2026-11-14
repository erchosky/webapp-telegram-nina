import "server-only";
import type { AuthContext } from "@/lib/telegram/auth";
import { ServiceError } from "@/lib/api/respond";
import { checkRateLimit as checkSharedRateLimit } from "@/lib/security/rate-limit";

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export async function checkRateLimit(
  req: Request,
  ctx: AuthContext,
  policy: RateLimitPolicy,
): Promise<void> {
  const endpoint = new URL(req.url).pathname;
  // initData binds this route to a Telegram account. Do not let a caller
  // escape a per-account quota by spoofing forwarding headers.
  const key = `${endpoint}:${ctx.user.telegram_user_id}`;
  const result = await checkSharedRateLimit(key, policy.limit, policy.windowMs);
  if (!result.allowed) {
    throw new ServiceError(
      429,
      "rate_limited",
      "Too many requests for this endpoint",
      { publicMessage: "Demasiados intentos. Espera un poco y vuelve a probar." },
    );
  }
}

export function clientIp(req: Request): string {
  const cloudflare = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";

  const chain = forwarded
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return chain[0] ?? "unknown";
}
