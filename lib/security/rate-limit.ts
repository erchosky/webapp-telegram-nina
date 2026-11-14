import "server-only";
import { MemoryRateLimitStore, type RateLimitStore } from "./rate-limit-store";
import { createAdminClient } from "@/lib/supabase/admin";

const globalStore = globalThis as typeof globalThis & { __vipGuardRateLimitStore?: RateLimitStore };
const store = globalStore.__vipGuardRateLimitStore ??= new MemoryRateLimitStore({ maxEntries: 5_000, cleanupPerHit: 25 });

export function rateLimit(key: string, limit: number, windowMs: number) {
  return store.hit(key, limit, windowMs);
}

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  if (process.env.NODE_ENV !== "production") return rateLimit(key, limit, windowMs);

  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs
  });
  if (error) {
    console.error("distributed_rate_limit_failed", { key, code: error.code, message: error.message });
    return { allowed: false, retryAfter: Math.ceil(windowMs / 1_000) };
  }
  return { allowed: data === true, retryAfter: Math.ceil(windowMs / 1_000) };
}

export function requestIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
