import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-session";
import { SectionHeader, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { isUuid, positivePage } from "@/lib/admin/params";

export const dynamic = "force-dynamic";

type LogRow = {
  id: string;
  message: string | null;
  action: string;
  created_at: string;
  metadata?: unknown;
};

function MetadataBlock({ metadata }: { metadata: unknown }) {
  if (!metadata) return null;
  return (
    <details className="mt-2 rounded-md border border-borderSoft bg-black/20 p-2 text-xs">
      <summary className="cursor-pointer text-muted">Ver metadata</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-muted">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  );
}

const pageSize = 50;

function pageHref(page: number, user?: string) {
  const params = new URLSearchParams();
  if (user) params.set("user", user);
  if (page > 1) params.set("page", String(page));
  return `/admin/vip-guard/logs${params.size ? `?${params}` : ""}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ user?: string; page?: string }> }) {
  await requireAdmin();
  const db = createAdminClient();
  const { user: rawUser, page: rawPage } = await searchParams;
  const user = isUuid(rawUser) ? rawUser : undefined;
  const page = positivePage(rawPage);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let botQuery = db.from("bot_logs").select("id,message,action,created_at,metadata", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  let adminQuery = db.from("admin_audit_logs").select("id,message,action,created_at,metadata", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (user) {
    botQuery = botQuery.eq("telegram_user_id", user);
    adminQuery = adminQuery.eq("target_user_id", user);
  }
  const [bot, admin] = await Promise.all([botQuery, adminQuery]);
  if (bot.error) throw bot.error;
  if (admin.error) throw admin.error;
  const sections: Array<[string, LogRow[] | null]> = [["Bot", bot.data], ["Admin", admin.data]];
  const hasNext = Math.max(bot.count ?? 0, admin.count ?? 0) > to + 1;
  return (
    <>
      <SectionHeader title={user ? "Actividad del usuario" : "Actividad"} description="Registro técnico y acciones de administración." />
      <div className="mb-4 flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Página {page} · mostrando hasta {pageSize} registros por sección</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={pageHref(page - 1, user)} className="rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Anterior</Link> : null}
          {hasNext ? <Link href={pageHref(page + 1, user)} className="rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Siguiente</Link> : null}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {sections.map(([title, logs]) => (
          <Card key={title}>
            <h2 className="font-semibold">{title}</h2>
            <div className="mt-4 space-y-3">
              {logs?.map((log) => (
                <div key={log.id} className="border-t border-borderSoft pt-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span>{log.message}</span>
                    <Badge>{log.action}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{new Date(log.created_at).toLocaleString("es-ES")}</p>
                  <MetadataBlock metadata={log.metadata} />
                </div>
              ))}
              {!logs?.length ? <p className="text-sm text-muted">Sin registros.</p> : null}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
