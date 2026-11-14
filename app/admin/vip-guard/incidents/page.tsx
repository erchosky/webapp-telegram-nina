import Link from "next/link";
import { incidentAction, userAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Card, SectionHeader } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/auth/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function IncidentStatusForm({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={incidentAction} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="incidentId" value={id} />
      <input type="hidden" name="status" value={status} />
      <input name="resolutionNote" placeholder="Nota opcional" className="min-h-10 rounded-md border border-borderSoft bg-black/20 px-3 text-sm" />
      <Button size="sm" variant="secondary">{label}</Button>
    </form>
  );
}

function UnbanForm({ userId }: { userId?: string | null }) {
  if (!userId) return null;
  return (
    <form action={userAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value="unban" />
      <input type="hidden" name="returnTo" value="/admin/vip-guard/incidents" />
      <Button size="sm" variant="danger">Intentar desbloquear</Button>
    </form>
  );
}

function filterHref(filter: string) {
  return `/admin/vip-guard/incidents?filter=${filter}`;
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const filter = params.filter === "all" || params.filter === "resolved" ? params.filter : "open";
  let query = createAdminClient()
    .from("operational_incidents")
    .select("id,severity,status,title,description,created_at,resolved_at,metadata,code,telegram_users(id,first_name,last_name,telegram_username,telegram_user_id),vip_groups(name,telegram_chat_id)")
    .order("resolved_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(50);
  if (filter === "open") query = query.in("status", ["open", "investigating", "acknowledged"]);
  if (filter === "resolved") query = query.in("status", ["resolved", "ignored"]);
  const { data, error } = await query;
  if (error) throw error;

  return (
    <>
      <SectionHeader title="Incidencias operativas" description="Problemas reales que necesitan revisión antes de dar el sistema por sano." />
      {params.error ? <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{params.error}</div> : null}
      {params.success ? <div className="mb-4 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">{params.success}</div> : null}
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link className={`rounded-md border border-borderSoft px-3 py-2 ${filter === "open" ? "bg-panelSoft text-ink" : "text-muted hover:text-ink"}`} href={filterHref("open")}>Abiertas</Link>
        <Link className={`rounded-md border border-borderSoft px-3 py-2 ${filter === "all" ? "bg-panelSoft text-ink" : "text-muted hover:text-ink"}`} href={filterHref("all")}>Todas</Link>
        <Link className={`rounded-md border border-borderSoft px-3 py-2 ${filter === "resolved" ? "bg-panelSoft text-ink" : "text-muted hover:text-ink"}`} href={filterHref("resolved")}>Resueltas</Link>
      </nav>
      <div className="space-y-4">
        {(data ?? []).map((incident) => {
          const user = relationOne(incident.telegram_users);
          const group = relationOne(incident.vip_groups);
          const name = user ? ([user.first_name, user.last_name].filter(Boolean).join(" ") || user.telegram_username || String(user.telegram_user_id)) : "Sin usuario";
          return (
            <Card key={incident.id} className={incident.severity === "critical" ? "border-danger/30" : undefined}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[.2em] text-muted">{incident.severity} · {incident.status}</p>
                  <h2 className="mt-1 font-semibold">{incident.title}</h2>
                  <p className="mt-1 text-sm text-muted">{incident.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    Usuario: {user ? <Link className="text-accent hover:underline" href={`/admin/vip-guard/users/${user.id}`}>{name}</Link> : name} · Grupo: {group?.name ?? group?.telegram_chat_id ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted">Creada: {fmt(incident.created_at)} · Resuelta: {fmt(incident.resolved_at)}</p>
                  <details className="mt-3 text-xs text-muted">
                    <summary className="cursor-pointer hover:text-ink">metadata</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-3">{JSON.stringify(incident.metadata ?? {}, null, 2)}</pre>
                  </details>
                </div>
                <div className="flex flex-wrap gap-2">
                  <IncidentStatusForm id={incident.id} status="investigating" label="Marcar en revisión" />
                  <IncidentStatusForm id={incident.id} status="resolved" label="Resolver" />
                  <IncidentStatusForm id={incident.id} status="ignored" label="Ignorar" />
                  {incident.code?.includes("unban") ? <UnbanForm userId={user?.id} /> : null}
                </div>
              </div>
            </Card>
          );
        })}
        {!data?.length ? <Card><p className="text-sm text-muted">No hay incidencias registradas.</p></Card> : null}
      </div>
    </>
  );
}
