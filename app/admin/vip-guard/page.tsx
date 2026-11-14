import Link from "next/link";
import { logoutAllSessionsAction, logoutOtherSessionsAction, runCheckExpiredAction, userAction } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionHeader } from "@/components/ui/Card";
import { currentAdminSessionId, requireAdmin } from "@/lib/auth/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dashboardTexts, operationalStatusDescription, operationalStatusLabel } from "@/lib/dashboard/texts";

export const dynamic = "force-dynamic";

const fmt = (date: string) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

function RenewButton({ userId }: { userId: string }) {
  return (
    <form action={userAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value="renew" />
      <input type="hidden" name="returnTo" value="/admin" />
      <Button size="sm">Renovar</Button>
    </form>
  );
}

function IncidentAction({ userId, action, label }: { userId: string; action: string; label: string }) {
  return (
    <form action={userAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value="/admin" />
      <Button size="sm" variant="secondary">{label}</Button>
    </form>
  );
}

function CronButton() {
  return (
    <form action={runCheckExpiredAction}>
      <Button size="sm" variant="secondary">Ejecutar revisión ahora</Button>
    </form>
  );
}

function browserLabel(userAgent?: string | null) {
  const ua = userAgent ?? "";
  const browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Safari") ? "Safari" : ua.includes("Firefox") ? "Firefox" : ua ? "Navegador" : "Desconocido";
  const device = /Mobile|iPhone|Android/i.test(ua) ? "móvil" : "escritorio";
  return `${browser} · ${device}`;
}

function Notice({ tone, title, children }: { tone: "danger" | "warning" | "accent"; title: string; children: React.ReactNode }) {
  const classes = {
    danger: "border-danger/40 bg-danger/10 text-danger",
    warning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    accent: "border-accent/30 bg-accent/10 text-accent"
  };
  return (
    <div className={`rounded-xl border p-4 ${classes[tone]}`}>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: number | null | undefined; helper?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value ?? 0}</p>
      {helper ? <p className="mt-2 text-xs text-muted">{helper}</p> : null}
    </Card>
  );
}

export default async function Dashboard() {
  await requireAdmin();
  const currentSessionId = await currentAdminSessionId();
  const db = createAdminClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 3_600_000).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [active, pending, expired, expiring, newUsers, renewals, botLogs, audit, unbanEvents, groupSettings, incidents, cronJob, botHealth, sessions] = await Promise.all([
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").or(`ends_at.is.null,ends_at.gt.${now.toISOString()}`),
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "expired"),
    db.from("subscriptions").select("id,ends_at,telegram_users(id,first_name,last_name,telegram_username)").eq("status", "active").gt("ends_at", now.toISOString()).lte("ends_at", soon).order("ends_at", { ascending: true }).limit(12),
    db.from("telegram_users").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    db.from("admin_audit_logs").select("id", { count: "exact", head: true }).eq("action", "renew").gte("created_at", monthStart),
    db.from("bot_logs").select("id,message,level,created_at").order("created_at", { ascending: false }).limit(5),
    db.from("admin_audit_logs").select("id,message,performed_by,created_at").order("created_at", { ascending: false }).limit(5),
    db.from("bot_logs").select("id,action,telegram_user_id,telegram_users(first_name,last_name,telegram_user_id)").in("action", ["user_unban_failed_after_kick", "user_unban_failed_after_manual_kick", "user_manually_unbanned", "user_unbanned_after_kick"]).order("created_at", { ascending: false }).limit(40),
    db.from("vip_groups").select("automatic_expulsion_enabled,read_only_mode,beta_mode").eq("is_active", true).limit(1).maybeSingle(),
    db.from("telegram_users").select("id,telegram_user_id,telegram_username,first_name,last_name,operational_status,updated_at").in("operational_status", ["invite_delivery_failed", "bot_blocked", "expulsion_failed", "unban_failed", "expulsion_pending", "invite_sent_pending_join"]).order("updated_at", { ascending: false }).limit(12),
    db.from("system_jobs").select("last_success_at").eq("job_name", "check-expired").maybeSingle(),
    db.from("bot_health_checks").select("ok,error_message").order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("admin_sessions").select("id,user_agent,created_at,last_seen_at,expires_at").is("revoked_at", null).gt("expires_at", now.toISOString()).order("last_seen_at", { ascending: false, nullsFirst: false }).limit(6)
  ]);

  const latestUnbanEvent = new Map<string, NonNullable<typeof unbanEvents.data>[number]>();
  for (const event of unbanEvents.data ?? []) {
    if (event.telegram_user_id && !latestUnbanEvent.has(event.telegram_user_id)) latestUnbanEvent.set(event.telegram_user_id, event);
  }
  const unresolvedUnbans = [...latestUnbanEvent.values()].filter((event) => event.action.startsWith("user_unban_failed"));
  const cronLastSuccess = cronJob.data?.last_success_at ? new Date(cronJob.data.last_success_at) : null;
  const cronStale = !cronLastSuccess || now.getTime() - cronLastSuccess.getTime() > 2 * 3_600_000;

  return (
    <>
      <SectionHeader title={dashboardTexts.pages.dashboardTitle} description={dashboardTexts.pages.dashboardDescription} action={<CronButton />} />

      <div className="mb-6 grid gap-3">
        {botHealth.data && !botHealth.data.ok ? (
          <Notice tone="danger" title="El bot no puede operar el grupo VIP">
            {botHealth.data.error_message ?? "Revisa permisos, Chat ID y que el bot siga siendo administrador."}
          </Notice>
        ) : null}
        {cronStale ? (
          <Notice tone="danger" title="Cron de caducidades sin señal reciente">
            Último éxito: {cronLastSuccess ? fmt(cronLastSuccess.toISOString()) : "nunca"}. Ejecuta una revisión manual y revisa Vercel si se repite.
          </Notice>
        ) : null}
        {unresolvedUnbans.length ? (
          <Notice tone="danger" title="Usuarios que podrían seguir bloqueados">
            {unresolvedUnbans.length} incidencia(s) de desbloqueo pendiente. Revisa la ficha antes de enviar nuevos enlaces.
          </Notice>
        ) : null}
        {groupSettings.data?.read_only_mode ? (
          <Notice tone="warning" title="Modo solo lectura activo">
            Puedes consultar datos, pero validar pagos, renovar, enviar enlaces, expulsar, migrar o cambiar ajustes está bloqueado.
          </Notice>
        ) : null}
        {groupSettings.data?.beta_mode ? (
          <Notice tone="accent" title="Modo beta activo">
            Las acciones peligrosas requieren pruebas previas; no actives autoexpulsión sin prueba de grupo OK.
          </Notice>
        ) : null}
        {!groupSettings.data?.automatic_expulsion_enabled ? (
          <Notice tone="warning" title="Modo migración: expulsión automática desactivada">
            El cron avisa y registra caducidades, pero no expulsa a nadie.
          </Notice>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Miembros activos" value={active.count} helper="Suscripción activa, con caducidad futura o sin caducidad" />
        <MetricCard label="Miembros pendientes" value={pending.count} helper="Registrados, pendientes de validar" />
        <MetricCard label="Caducados" value={expired.count} />
        <MetricCard label="Renovaciones este mes" value={renewals.count} />
        <MetricCard label="Nuevos este mes" value={newUsers.count} />
        <MetricCard label="Caducan en 7 días" value={expiring.data?.length ?? 0} />
      </div>

      {incidents.data?.length ? (
        <Card className="mt-6 border-danger/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-danger">{dashboardTexts.incidents.title}</h2>
              <p className="mt-1 text-sm text-muted">{dashboardTexts.incidents.description}</p>
            </div>
            <Link href="/admin/vip-guard/incidents" className="text-sm text-accent hover:underline">Ver incidencias</Link>
          </div>
          <div className="mt-4 grid gap-3">
            {incidents.data.map((user) => {
              const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.telegram_username || String(user.telegram_user_id);
              const isExpulsion = ["expulsion_failed", "unban_failed", "expulsion_pending"].includes(user.operational_status);
              return (
                <div key={user.id} className="rounded-lg border border-borderSoft bg-black/10 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="mt-1 text-sm text-muted">Causa: {operationalStatusLabel(user.operational_status)}</p>
                      <p className="text-xs text-muted">{operationalStatusDescription(user.operational_status)}</p>
                      <p className="text-xs text-muted">Detectado/actualizado: {fmt(user.updated_at)}</p>
                      <p className="mt-2 text-xs text-muted">Acción recomendada: {isExpulsion ? dashboardTexts.incidents.actionExpulsion : dashboardTexts.incidents.actionInvite}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/vip-guard/users/${user.id}`} className="inline-flex min-h-10 items-center rounded-md border border-borderSoft px-3 text-sm hover:bg-panelSoft">Ver ficha</Link>
                      {isExpulsion ? (
                        <>
                          <IncidentAction userId={user.id} action="retry_expulsion" label="Reintentar expulsión" />
                          <IncidentAction userId={user.id} action="unban" label="Intentar desbloquear" />
                          <IncidentAction userId={user.id} action="resolve_expulsion" label="Marcar resuelto" />
                        </>
                      ) : (
                        <IncidentAction userId={user.id} action="send_invite" label={dashboardTexts.labels.retryInvite} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,.9fr)]">
        <Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Caducan pronto</h2>
              <p className="mt-1 text-sm text-muted">Próximos 7 días, ordenados por fecha.</p>
            </div>
            <Link href="/admin/vip-guard/users?status=active" className="text-sm text-accent hover:underline">Ver todos</Link>
          </div>
          <div className="mt-4 space-y-3">
            {expiring.data?.map((subscription) => {
              const userRelation = subscription.telegram_users;
              const user = Array.isArray(userRelation) ? userRelation[0] : userRelation;
              if (!user) return null;
              const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.telegram_username || "Usuario";
              return (
                <div key={subscription.id} className="flex flex-col gap-3 rounded-lg border border-borderSoft bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted">Caduca {fmt(subscription.ends_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <RenewButton userId={user.id} />
                    <Link href={`/admin/vip-guard/users/${user.id}`} className="inline-flex min-h-10 items-center rounded-md border border-borderSoft px-3 text-sm hover:bg-panelSoft">Ver usuario</Link>
                  </div>
                </div>
              );
            })}
            {!expiring.data?.length ? <p className="text-sm text-muted">Nadie caduca en los próximos 7 días.</p> : null}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Sesiones activas</h2>
              <p className="mt-1 text-sm text-muted">Dispositivos con sesión admin vigente. La IP se guarda solo como hash.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={logoutOtherSessionsAction}>
                <ConfirmSubmitButton message="¿Cerrar las otras sesiones admin activas?" className="min-h-10 rounded-md border border-borderSoft bg-tg-secondaryBg px-3 py-2 text-sm font-medium text-ink hover:bg-[#282828]">Cerrar otras</ConfirmSubmitButton>
              </form>
              <form action={logoutAllSessionsAction}>
                <ConfirmSubmitButton message="¿Cerrar todas las sesiones admin, incluida esta?" className="min-h-10 rounded-md border border-danger/30 bg-danger/15 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/25">Cerrar todas</ConfirmSubmitButton>
              </form>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {sessions.data?.map((session) => (
              <div key={session.id} className="rounded-lg border border-borderSoft bg-black/10 p-3 text-sm">
                <p className="font-medium">{browserLabel(session.user_agent)} {session.id === currentSessionId ? <span className="text-accent">· sesión actual</span> : null}</p>
                <p className="mt-1 text-xs text-muted">Login: {fmt(session.created_at)}</p>
                <p className="text-xs text-muted">Última actividad: {session.last_seen_at ? fmt(session.last_seen_at) : "—"} · Expira: {fmt(session.expires_at)}</p>
              </div>
            ))}
            {!sessions.data?.length ? <p className="text-sm text-muted">No hay sesiones activas.</p> : null}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Actividad del bot</h2>
          <div className="mt-4 space-y-3">
            {botLogs.data?.map((log) => (
              <div key={log.id} className="border-b border-borderSoft pb-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span>{log.message}</span>
                  <StatusBadge status={log.level === "error" ? "expired" : log.level === "warning" ? "pending" : "active"} />
                </div>
                <p className="mt-1 text-xs text-muted">{fmt(log.created_at)}</p>
              </div>
            ))}
            {!botLogs.data?.length ? <p className="text-sm text-muted">Aún no hay actividad.</p> : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Acciones admin</h2>
          <div className="mt-4 space-y-3">
            {audit.data?.map((log) => (
              <div key={log.id} className="border-b border-borderSoft pb-3 text-sm">
                <p>{log.message}</p>
                <p className="mt-1 text-xs text-muted">{fmt(log.created_at)} · {log.performed_by ?? "admin"}</p>
              </div>
            ))}
            {!audit.data?.length ? <p className="text-sm text-muted">Aún no hay acciones.</p> : null}
          </div>
        </Card>
      </div>
    </>
  );
}
