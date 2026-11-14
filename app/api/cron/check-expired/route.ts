import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { checkExpired } from "@/lib/cron/checkExpired";
import { safeBotLog } from "@/lib/logs";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { safeEqual } from "@/lib/security/secrets";
import { claimCronExecution, releaseCronExecution } from "@/lib/cron/execution-lock";
export const maxDuration = 60;

async function handleCron(request: NextRequest) {
  if (!safeEqual(request.headers.get("authorization"), `Bearer ${serverEnv().CRON_SECRET}`)) return NextResponse.json({ ok: false }, { status: 401 });
  // A cron credential identifies one global caller. Forwarding headers are
  // attacker-controlled outside a trusted proxy and must not partition quota.
  const limited = await checkRateLimit("cron:check-expired", 4, 60_000);
  if (!limited.allowed) return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  let lockToken: string | undefined;
  try {
    const lock = await claimCronExecution();
    if (!lock.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running" });
    lockToken = lock.token;
    return NextResponse.json(await checkExpired());
  } catch {
    await safeBotLog("cron_error", "Error general ejecutando el cron", { level: "error" });
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  } finally {
    if (lockToken) {
      try {
        const released = await releaseCronExecution(lockToken);
        if (!released) await safeBotLog("cron_lock_release_error", "El cron terminó sin poder liberar su lease", { level: "error" });
      } catch {
        await safeBotLog("cron_lock_release_error", "El cron terminó con un error liberando su lease", { level: "error" });
      }
    }
  }
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
