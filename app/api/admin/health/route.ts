import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin-session";
import { appVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";
const configured = (name: string) => Boolean(process.env[name]?.trim());
const configuredAny = (...names: string[]) => names.some(configured);
const paymentIntentsEnabled = () => process.env.NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS === "true";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({
    ok: true,
    app_version: appVersion(),
    hasSupabaseUrl: configured("SUPABASE_URL"),
    hasServiceRole: configured("SUPABASE_SERVICE_ROLE_KEY"),
    hasTelegramToken: configured("TELEGRAM_BOT_TOKEN"),
    hasWebhookSecret: configured("TELEGRAM_WEBHOOK_SECRET"),
    hasCronSecret: configured("CRON_SECRET"),
    hasAdminPassword: configuredAny("ADMIN_PASSWORD", "ADMIN_DASHBOARD_PASSWORD"),
    hasSessionSecret: configuredAny("SESSION_SECRET", "ADMIN_SESSION_SECRET"),
    hasTelegramGroupChatId: configured("TELEGRAM_GROUP_CHAT_ID"),
    paymentIntents: paymentIntentsEnabled() ? "experimental_enabled_no_admin_resolution_inbox" : "disabled",
    paymentIntentsResolutionInbox: false
  }, { headers: { "Cache-Control": "no-store" } });
}
