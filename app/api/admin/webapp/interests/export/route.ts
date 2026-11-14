import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin-session";
import { auditLog } from "@/lib/logs";
import { listAdminInterests } from "@/lib/admin/webappData";

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await listAdminInterests({
    status: params.get("status") ?? undefined,
    q: params.get("q") ?? undefined,
    categoryId: params.get("category") ?? undefined,
    itemId: params.get("item") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    page: 1,
    pageSize: 5_000,
  });
  if (result.error) return NextResponse.json({ ok: false, error: "Export failed" }, { status: 500 });
  const header = ["fecha", "estado", "usuario", "username", "telegram_id", "articulo", "categoria_historica", "mensaje", "notas_internas"];
  const rows = result.data.map((row) => {
    const item = relationOne(row.marketplace_items);
    const category = relationOne(row.marketplace_categories);
    return [row.created_at, row.status, row.user_name, row.telegram_username, row.telegram_user_numeric_id, item?.title, category?.title, row.message, row.internal_notes].map(csvCell).join(",");
  });
  await auditLog("webapp_interests_csv_exported", "Intereses WebApp exportados a CSV", undefined, { module: "webapp", exported: rows.length });
  return new NextResponse(`\uFEFF${header.map(csvCell).join(",")}\n${rows.join("\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="intereses-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function relationOne(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
