import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin-session";
import { auditLog } from "@/lib/logs";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionRow } from "@/lib/domain/types";

type ExportUser = {
  first_name: string | null;
  last_name: string | null;
  telegram_username: string | null;
  telegram_user_id: number | string;
  first_subscription_at: string | null;
  internal_notes: string | null;
  tags: string[] | null;
  subscriptions: Array<{
    status: "active" | "pending" | "needs_manual_review" | "expired" | "cancelled";
    starts_at: string | null;
    ends_at: string | null;
    created_at: string;
  }>;
};

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { data, error } = await createAdminClient()
    .from("telegram_users")
    .select(
      "first_name,last_name,telegram_username,telegram_user_id,first_subscription_at,internal_notes,tags," +
        "subscriptions(status,starts_at,ends_at,created_at)",
    )
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: "Export failed" }, { status: 500 });
  const header = ["nombre","username","telegram_id","estado","fecha_inicio","fecha_fin","miembro_desde","notas_internas","etiquetas"];
  const rows = ((data ?? []) as unknown as ExportUser[]).map((user) => {
    const subscription = selectCurrentSubscription(user.subscriptions as unknown as SubscriptionRow[]);
    return [[user.first_name,user.last_name].filter(Boolean).join(" "), user.telegram_username ? `@${user.telegram_username}` : "", user.telegram_user_id, subscription?.status ?? "sin_acceso", subscription?.starts_at, subscription?.ends_at, user.first_subscription_at, user.internal_notes, (user.tags ?? []).join(" | ")].map(csvCell).join(",");
  });
  await auditLog("users_csv_exported", "Listado de usuarios exportado a CSV");
  return new NextResponse(`\uFEFF${header.map(csvCell).join(",")}\n${rows.join("\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="usuarios-vip-${new Date().toISOString().slice(0,10)}.csv"`, "Cache-Control": "no-store" } });
}
