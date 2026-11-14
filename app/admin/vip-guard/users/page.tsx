import Link from "next/link";
import { userAction } from "@/app/admin/actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionHeader } from "@/components/ui/Card";
import { renewalNeedsInvite } from "@/lib/subscription-rules";
import { requireAdmin } from "@/lib/auth/admin-session";
import { adminUserStatusValues, listAdminUsers } from "@/lib/admin/users-query";
import { dashboardErrorMessage, dashboardTexts, operationalStatusLabel } from "@/lib/dashboard/texts";
import { isUuid, positivePage } from "@/lib/admin/params";

export const dynamic = "force-dynamic";

const fmt = (date?: string | null) =>
  date ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(date)) : "—";

const filters = [
  ["all", "Todos"],
  ["active", "Activos"],
  ["pending_validation", "Pendientes de validar"],
  ["expired", "Caducados"],
  ["cancelled", "Cancelados"]
];

function ActionForm({ userId, action, label, primary = false }: { userId: string; action: string; label: string; primary?: boolean }) {
  return (
    <form action={userAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value="/admin/vip-guard/users" />
      <Button size="sm" variant={primary ? "primary" : "secondary"}>{label}</Button>
    </form>
  );
}

function ActivationActions({ userId }: { userId: string }) {
  return (
    <>
      <ActionForm userId={userId} action="activate_7d" label="Validar 7 días" />
      <ActionForm userId={userId} action="activate_15d" label="Validar 15 días" />
      <ActionForm userId={userId} action="activate" label={dashboardTexts.labels.validatePayment} primary />
      <ActionForm userId={userId} action="activate_3m" label="Validar 3 meses" />
    </>
  );
}

function Field({ label, value, highlight = false }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className={`mt-1 text-sm ${highlight ? "font-medium text-ink" : "text-muted"}`}>{value}</dd>
    </div>
  );
}

function TechnicalData({ telegramUserId }: { telegramUserId: number }) {
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer select-none hover:text-ink">Dato técnico</summary>
      <p className="mt-1 rounded-md border border-borderSoft bg-black/15 px-2 py-1">Telegram ID: {telegramUserId}</p>
    </details>
  );
}

function ErrorNotice({ error, userId }: { error?: string; userId?: string }) {
  const message = dashboardErrorMessage(error);
  if (!message) return null;
  const isDanger = error?.includes("failed") || error?.startsWith("manual_");
  const canRetryInvite = error === "payment_validated_invite_failed" || error === "invite_delivery_failed" || error === "telegram_rate_limited";
  const canUnban = error?.includes("unban") || error?.startsWith("manual_");

  return (
    <div className={`mb-4 flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${isDanger ? "border-danger/30 bg-danger/10 text-danger" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
      <span>{message}</span>
      {userId && canRetryInvite ? <ActionForm userId={userId} action="send_invite" label={dashboardTexts.labels.retryInvite} /> : null}
      {userId && canUnban ? <ActionForm userId={userId} action="unban" label={dashboardTexts.labels.unblock} /> : null}
    </div>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; q?: string; user?: string; page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const pageSize = 50;
  const now = new Date();
  const page = positivePage(params.page);
  const result = await listAdminUsers({ status: params.status, search: params.q, page, pageSize, now });
  const selected = result.selected;
  const filterHref = (value: string) => {
    const search = new URLSearchParams();
    if (value !== "all") search.set("status", value);
    if (params.q && value !== selected) search.set("q", params.q);
    return `/admin/vip-guard/users${search.size ? `?${search}` : ""}`;
  };
  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (selected !== "all") search.set("status", selected);
    if (params.q) search.set("q", params.q);
    if (nextPage > 1) search.set("page", String(nextPage));
    return `/admin/vip-guard/users${search.size ? `?${search}` : ""}`;
  };
  const hasNext = page * pageSize < result.count;

  return (
    <>
      <SectionHeader
        title={dashboardTexts.pages.usersTitle}
        description={dashboardTexts.pages.usersDescription}
        action={<a href="/api/admin/users/export" className="inline-flex h-10 items-center rounded-md border border-borderSoft bg-panelSoft px-4 text-sm font-medium hover:bg-[#282828]">Exportar CSV</a>}
      />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input type="hidden" name="status" value={selected === "all" ? "" : selected} />
        <input name="q" defaultValue={params.q} placeholder="Buscar por nombre, username o Telegram ID" className="h-10 min-w-0 flex-1 rounded-md border border-borderSoft bg-panel px-3 text-sm outline-none focus:border-accent" />
        <Button type="submit" className="w-full sm:w-auto">Buscar</Button>
        {params.q ? <Link href={filterHref(selected)} className="inline-flex h-10 items-center justify-center px-3 text-sm text-muted hover:text-ink">Limpiar</Link> : null}
      </form>
      <div className="mb-5 flex flex-wrap gap-2">
        {filters.filter(([value]) => (adminUserStatusValues as readonly string[]).includes(value)).map(([value, label]) => (
          <Link key={value} href={filterHref(value)} className={`rounded-md px-3 py-2 text-sm ${selected === value ? "bg-accent text-black" : "border border-borderSoft bg-panel text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </div>
      <ErrorNotice error={params.error} userId={isUuid(params.user) ? params.user : undefined} />
      <div className="mb-4 flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Página {page} · mostrando hasta {pageSize} usuarios</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Anterior</Link> : null}
          {hasNext ? <Link href={pageHref(page + 1)} className="rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Siguiente</Link> : null}
        </div>
      </div>
      <div className="space-y-5">
        {result.rows.map((user) => {
          const sub = user.subscription;
          const accessStatus = user.access_status;
          const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || String(user.telegram_user_id);
          const renewalLabel = renewalNeedsInvite(now, typeof sub?.status === "string" ? sub.status : undefined, typeof sub?.ends_at === "string" ? sub.ends_at : undefined) ? dashboardTexts.labels.renewAndInvite : dashboardTexts.labels.renew;
          const quickActions = accessStatus === "pending_validation"
            ? (
              <>
                <ActivationActions userId={user.id} />
                <Link href={`/admin/vip-guard/users/${user.id}`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-borderSoft px-3 text-sm hover:bg-panelSoft">Ver ficha</Link>
              </>
            )
            : accessStatus === "active"
              ? (
                <>
                  <ActionForm userId={user.id} action="renew" label={renewalLabel} primary />
                  <ActionForm userId={user.id} action="send_invite" label={dashboardTexts.labels.sendInvite} />
                  <Link href={`/admin/vip-guard/users/${user.id}`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-borderSoft px-3 text-sm hover:bg-panelSoft">Ver ficha</Link>
                </>
              )
              : (
                <>
                  <ActionForm userId={user.id} action="renew" label={dashboardTexts.labels.renewAndInvite} primary />
                  <Link href={`/admin/vip-guard/users/${user.id}`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-borderSoft px-3 text-sm hover:bg-panelSoft">Ver ficha</Link>
                </>
              );
          return (
            <Card key={user.id} className="p-4 transition hover:border-accent/30 hover:bg-panel">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/vip-guard/users/${user.id}`} className="truncate text-base font-semibold hover:text-accent">{name}</Link>
                    <StatusBadge status={accessStatus} />
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">{user.telegram_username ? `@${user.telegram_username}` : "Sin username"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(user.tags ?? []).slice(0, 3).map((tag: string) => <span key={tag} className="rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">{tag}</span>)}
                  </div>
                  <div className="mt-3"><TechnicalData telegramUserId={user.telegram_user_id} /></div>
                </div>

                <dl className="grid grid-cols-2 gap-3 rounded-lg border border-borderSoft/70 bg-black/10 p-3 sm:grid-cols-3 lg:grid-cols-2">
                  <Field label={dashboardTexts.labels.expiresAt} value={fmt(typeof sub?.ends_at === "string" ? sub.ends_at : undefined)} highlight />
                  <Field label={dashboardTexts.labels.memberSince} value={fmt(user.first_subscription_at)} />
                  <Field label={dashboardTexts.labels.operational} value={operationalStatusLabel(user.operational_status)} />
                  <Field label="Ficha" value={<Link href={`/admin/vip-guard/users/${user.id}`} className="text-accent hover:underline">Ver ficha</Link>} />
                </dl>

                <details className="group rounded-lg border border-borderSoft bg-panelSoft/45 lg:min-w-48">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium hover:text-accent">
                    Acciones rápidas
                    <span className="text-muted transition group-open:rotate-180">⌄</span>
                  </summary>
                  <div className="grid gap-2 border-t border-borderSoft p-3 sm:grid-cols-2 lg:grid-cols-1">
                    {quickActions}
                    <p className="text-xs text-muted sm:col-span-2 lg:col-span-1">Expulsar, cancelar y cambiar fechas están en la ficha completa.</p>
                  </div>
                </details>
              </div>

              {user.internal_notes ? (
                <div className="mt-4 rounded-md border border-borderSoft/70 bg-black/10 px-3 py-2 text-sm text-muted">
                  <span className="text-xs uppercase tracking-[0.16em]">Nota</span>
                  <p className="mt-1 line-clamp-2">{user.internal_notes}</p>
                </div>
              ) : null}
            </Card>
          );
        })}
        {!result.rows.length ? <Card><p className="text-sm text-muted">No hay usuarios que coincidan.</p></Card> : null}
      </div>
    </>
  );
}
