import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-session";
import { SectionHeader, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/admin/status-badge";
import { positivePage } from "@/lib/admin/params";

export const dynamic = "force-dynamic";

const pageSize = 50;
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString("es-ES") : "—";

function pageHref(page: number) {
  return page > 1 ? `/admin/vip-guard/subscriptions?page=${page}` : "/admin/vip-guard/subscriptions";
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const page = positivePage(params.page);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await createAdminClient()
    .from("subscriptions")
    .select("id,status,starts_at,ends_at,source,updated_at,telegram_users(first_name,last_name,telegram_username,telegram_user_id)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const hasNext = count ? to + 1 < count : false;

  return (
    <>
      <SectionHeader title="Suscripciones" description="Historial y fechas de acceso." />
      <div className="mb-4 flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Página {page} · mostrando hasta {pageSize} suscripciones</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={pageHref(page - 1)} className="min-h-10 rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Anterior</Link> : null}
          {hasNext ? <Link href={pageHref(page + 1)} className="min-h-10 rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Siguiente</Link> : null}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {data?.map((subscription) => {
          const user = relationOne(subscription.telegram_users);
          const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.telegram_username || String(user?.telegram_user_id ?? "Usuario");
          return (
            <Card key={subscription.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{name}</p>
                  <p className="mt-1 text-xs text-muted">ID {user?.telegram_user_id ?? "—"}</p>
                </div>
                <StatusBadge status={subscription.status} />
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Inicio</dt><dd className="text-right">{fmt(subscription.starts_at)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Caducidad</dt><dd className="text-right">{fmt(subscription.ends_at)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Origen</dt><dd>{subscription.source}</dd></div>
              </dl>
            </Card>
          );
        })}
      </div>

      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="text-muted">
            <tr><th className="pb-3">Usuario</th><th>Estado</th><th>Inicio</th><th>Caducidad</th><th>Origen</th></tr>
          </thead>
          <tbody>
            {data?.map((subscription) => {
              const user = relationOne(subscription.telegram_users);
              return (
                <tr key={subscription.id} className="border-t border-borderSoft">
                  <td className="py-3">
                    {user?.first_name} {user?.last_name}
                    <span className="block text-xs text-muted">{user?.telegram_user_id ?? "—"}</span>
                  </td>
                  <td><StatusBadge status={subscription.status} /></td>
                  <td>{fmt(subscription.starts_at)}</td>
                  <td>{fmt(subscription.ends_at)}</td>
                  <td>{subscription.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
