import Link from "next/link";
import { notFound } from "next/navigation";
import { updateUserProfileAction, userAction } from "@/app/admin/actions";
import { ConfirmKickForm } from "@/components/admin/confirm-kick-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubscriptionDateManager } from "@/components/admin/subscription-date-manager";
import { Button } from "@/components/ui/Button";
import { Card, SectionHeader } from "@/components/ui/Card";
import { renewalNeedsInvite } from "@/lib/subscription-rules";
import { requireAdmin } from "@/lib/auth/admin-session";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { userAccessStatus } from "@/lib/user-access";
import { dashboardActionLabel, dashboardErrorMessage, dashboardTexts, operationalStatusLabel } from "@/lib/dashboard/texts";
import { isUuid } from "@/lib/admin/params";
import { CopyValueButton } from "@/components/admin/CopyValueButton";

export const dynamic = "force-dynamic";

const date = (value?: string | null, withTime = false) =>
  value ? new Intl.DateTimeFormat("es-ES", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" } : { dateStyle: "long", timeZone: "Europe/Madrid" }).format(new Date(value)) : "—";

function Action({ userId, action, children, primary = false }: { userId: string; action: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <form action={userAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value={`/admin/vip-guard/users/${userId}`} />
      <Button size="sm" variant={primary ? "primary" : "secondary"}>{children}</Button>
    </form>
  );
}

function CustomActivation({ userId }: { userId: string }) {
  return (
    <form action={userAction} className="mt-3 grid gap-3 rounded-md border border-borderSoft bg-black/10 p-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value="activate_custom" />
      <input type="hidden" name="returnTo" value={`/admin/vip-guard/users/${userId}`} />
      <label className="text-xs text-muted">
        Días
        <input name="customDays" type="number" min={1} max={730} placeholder="37" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
      </label>
      <label className="text-xs text-muted">
        O fecha exacta de fin
        <input name="customEndsAt" type="datetime-local" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
      </label>
      <Button size="sm" variant="secondary">Validar personalizado</Button>
      <p className="text-xs text-muted sm:col-span-3">Si rellenas fecha exacta, se usa esa fecha. Si no, se usan los días personalizados.</p>
    </form>
  );
}

function CancelSubscriptionForm({ userId }: { userId: string }) {
  return (
    <form action={userAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value="cancelled" />
      <input type="hidden" name="returnTo" value={`/admin/vip-guard/users/${userId}`} />
      <label className="text-xs text-muted">
        Escribe CANCELAR
        <input name="cancel_confirmation" className="ml-2 w-28 rounded-md border border-borderSoft bg-black/20 px-2 py-1 text-xs text-ink" placeholder="CANCELAR" />
      </label>
      <Button size="sm" variant="danger">{dashboardTexts.labels.cancel}</Button>
    </form>
  );
}

function DetailItem({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-borderSoft/70 bg-black/10 p-3">
      <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className={`mt-1 text-sm ${accent ? "font-semibold text-accent" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function Alert({
  tone,
  children,
  action
}: {
  tone: "warning" | "danger";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const classes = tone === "danger"
    ? "border-danger/30 bg-danger/10 text-danger"
    : "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return (
    <div className={`mb-4 flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${classes}`}>
      <span>{children}</span>
      {action}
    </div>
  );
}

export default async function UserDetail({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  if (!isUuid(id)) notFound();
  const db = createAdminClient();

  const [userResult, auditResult, botResult, paymentsResult, incidentsResult, referralResult, rewardsResult, inviteResult] = await Promise.all([
    db.from("telegram_users").select("id,telegram_user_id,telegram_username,first_name,last_name,language_code,started_bot_at,first_subscription_at,current_streak_months,operational_status,internal_notes,tags,subscriptions(*)").eq("id", id).maybeSingle(),
    db.from("admin_audit_logs").select("id,action,message,metadata,created_at,performed_by").eq("target_user_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("bot_logs").select("id,action,message,metadata,created_at").eq("telegram_user_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("manual_payments").select("id,notes,amount_cents,currency,payment_method,payment_reference,created_at").eq("telegram_user_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("operational_incidents").select("id,action:code,title,description,status,metadata,created_at").eq("telegram_user_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("referral_attributions").select("id,referrer_user_id,referred_user_id,created_at").or(`referrer_user_id.eq.${id},referred_user_id.eq.${id}`).order("created_at", { ascending: false }).limit(20),
    db.from("referral_rewards").select("id,referrer_user_id,referred_user_id,reward_days,status,applied_at,created_at").or(`referrer_user_id.eq.${id},referred_user_id.eq.${id}`).order("created_at", { ascending: false }).limit(20),
    db.from("invite_links").select("id,invite_link,expire_at,sent_at,delivery_error,created_at").eq("telegram_user_id", id).is("revoked_at", null).is("used_at", null).gt("expire_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  if (!userResult.data) notFound();

  const user = userResult.data;
  const incidents = incidentsResult.error ? [] : incidentsResult.data ?? [];
  const incidentsLoadError = incidentsResult.error ? "No se pudieron cargar las incidencias relacionadas. Revisa logs o Supabase." : null;
  if (referralResult.error) throw referralResult.error;
  if (rewardsResult.error) throw rewardsResult.error;
  const referralUserIds = [...new Set((referralResult.data ?? []).flatMap((item) => [item.referrer_user_id, item.referred_user_id]).filter((value): value is string => Boolean(value)))];
  const referralUsersResult = referralUserIds.length
    ? await db.from("telegram_users").select("id,telegram_user_id,telegram_username,first_name,last_name").in("id", referralUserIds)
    : { data: [], error: null };
  if (referralUsersResult.error) throw referralUsersResult.error;
  const referralUsers = new Map((referralUsersResult.data ?? []).map((item) => [item.id, item]));
  const referralName = (userId: string) => {
    const item = referralUsers.get(userId);
    return item ? ([item.first_name, item.last_name].filter(Boolean).join(" ") || item.telegram_username || String(item.telegram_user_id)) : userId;
  };
  const subscription = selectCurrentSubscription(user.subscriptions ?? []);
  const accessStatus = userAccessStatus(subscription);
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || String(user.telegram_user_id);
  const renewalLabel = renewalNeedsInvite(new Date(), subscription?.status, subscription?.ends_at) ? dashboardTexts.labels.renewAndInvite : dashboardTexts.labels.renew;
  const nowIso = new Date().toISOString();
  const actionError = dashboardErrorMessage(query.error);
  const showGenericActionError = actionError && !["payment_validated_invite_failed", "invite_delivery_failed", "telegram_rate_limited", "invite_mark_failed", "invite_inactive"].includes(query.error ?? "");

  const primaryActions = accessStatus === "pending_validation"
    ? (
      <>
        <Action userId={id} action="activate_7d">Validar 7 días</Action>
        <Action userId={id} action="activate_15d">Validar 15 días</Action>
        <Action userId={id} action="activate" primary>{dashboardTexts.labels.validatePayment}</Action>
        <Action userId={id} action="activate_3m">Validar 3 meses</Action>
      </>
    )
    : accessStatus === "active"
      ? (
        <>
          <Action userId={id} action="renew" primary>{renewalLabel}</Action>
          <Action userId={id} action="send_invite">{dashboardTexts.labels.sendInvite}</Action>
        </>
      )
      : <Action userId={id} action="renew" primary>{dashboardTexts.labels.renewAndInvite}</Action>;

  const history = [
    ...(auditResult.data ?? []).map((item) => ({ ...item, actor: item.performed_by ?? "admin" })),
    ...(botResult.data ?? []).map((item) => ({ ...item, actor: "bot" })),
    ...(paymentsResult.data ?? []).map((item) => ({
      ...item,
      action: "manual_payment",
      message: item.notes ?? "Pago manual",
      actor: "admin",
      metadata: {
        amount_cents: item.amount_cents,
        currency: item.currency,
        payment_method: item.payment_method,
        payment_reference: item.payment_reference
      }
    })),
    ...incidents.map((item) => ({ ...item, action: "operational_incident", message: item.title, actor: "sistema" }))
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <Link href="/admin/vip-guard/users" className="mb-4 inline-block text-sm text-muted hover:text-ink">← Volver a usuarios</Link>
      <SectionHeader
        title={name}
        description="Ficha completa del usuario, suscripción, acciones e historial."
        action={<StatusBadge status={accessStatus} />}
      />

      {showGenericActionError ? (
        <Alert
          tone="warning"
          action={query.error?.includes("unban") || query.error?.startsWith("manual_") ? <Action userId={id} action="unban">Intentar desbloquear</Action> : null}
        >
          {actionError}
        </Alert>
      ) : null}
      {query.error === "payment_validated_invite_failed" ? (
        <Alert tone="danger" action={<Action userId={id} action="send_invite">Reintentar envío de enlace</Action>}>
          {dashboardTexts.errors.paymentValidatedInviteFailed}
        </Alert>
      ) : null}
      {query.error === "invite_delivery_failed" ? (
        <Alert tone="danger" action={<Action userId={id} action="send_invite">Reintentar envío de enlace</Action>}>
          {dashboardTexts.errors.inviteDeliveryFailed}
        </Alert>
      ) : null}
      {query.error === "telegram_rate_limited" ? (
        <Alert tone="warning" action={<Action userId={id} action="send_invite">Reintentar envío de enlace</Action>}>
          {dashboardTexts.errors.telegramRateLimited}
        </Alert>
      ) : null}
      {query.error === "invite_mark_failed" ? <Alert tone="warning">{dashboardTexts.errors.inviteMarkFailed}</Alert> : null}
      {query.error === "invite_inactive" ? <Alert tone="warning">{dashboardTexts.errors.inviteInactive}</Alert> : null}
      {user.operational_status === "unban_failed" ? (
        <Alert tone="danger" action={<Action userId={id} action="unban">Reintentar desbloqueo</Action>}>
          El último desbloqueo falló. Reintenta el unban antes de enviar nuevos enlaces.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Resumen de acceso</h2>
                <p className="mt-1 text-sm text-muted">Estado visible para operar el acceso de este usuario.</p>
              </div>
              <StatusBadge status={accessStatus} />
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <DetailItem label="Username" value={user.telegram_username ? `@${user.telegram_username}` : "Sin username"} />
              <DetailItem label={dashboardTexts.labels.operational} value={operationalStatusLabel(user.operational_status)} />
              <DetailItem label={dashboardTexts.labels.memberSince} value={date(user.first_subscription_at)} accent />
              <DetailItem label="Último /start" value={date(user.started_bot_at, true)} />
              <DetailItem label="Racha" value={`${user.current_streak_months ?? 0} mes(es)`} />
              <DetailItem label="Idioma" value={user.language_code ?? "—"} />
              <DetailItem label="Dato técnico" value={<span className="break-all">Telegram ID {user.telegram_user_id}</span>} />
            </dl>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Suscripción actual</h2>
            <p className="mt-1 text-sm text-muted">Fechas y estado de la suscripción más reciente.</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailItem label="Estado" value={subscription?.status ?? "Sin suscripción"} />
              <DetailItem label="Inicio" value={date(subscription?.starts_at, true)} />
              <DetailItem label={dashboardTexts.labels.expiresAt} value={date(subscription?.ends_at, true)} accent />
              <DetailItem label="Última actualización" value={date(subscription?.updated_at, true)} />
            </dl>
            <p className="mt-4 text-xs text-muted">“{dashboardTexts.labels.memberSince}” se rellena al validar el primer acceso. “{dashboardTexts.labels.expiresAt}” aparece cuando existe una suscripción.</p>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Acciones principales</h2>
            <p className="mt-1 text-sm text-muted">Acciones habituales y reversibles del día a día.</p>
            <div className="mt-4 flex flex-wrap gap-2">{primaryActions}</div>
            {accessStatus === "pending_validation" ? <CustomActivation userId={id} /> : null}
            {inviteResult.error ? <p className="mt-4 text-sm text-danger">No se pudo cargar la invitación vigente. Consulta logs e inténtalo de nuevo.</p> : null}
            {inviteResult.data ? <div className="mt-4 rounded-md border border-borderSoft bg-black/10 p-3"><p className="text-sm font-medium">Invitación vigente</p><p className="mt-1 text-xs text-muted">Caduca {date(inviteResult.data.expire_at, true)}{inviteResult.data.delivery_error ? " · el envío automático falló; puedes copiarla y entregarla por el canal verificado" : ""}</p><div className="mt-3 flex flex-wrap items-center gap-2"><code className="max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">{inviteResult.data.invite_link}</code><CopyValueButton value={inviteResult.data.invite_link} label="Copiar invitación" /></div></div> : null}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Cambios rápidos de caducidad</h2>
            <p className="mt-1 text-sm text-muted">Ajustes de fecha con confirmación. Mantén el campo manual para casos especiales.</p>
            {subscription ? (
              <SubscriptionDateManager
                userId={id}
                userName={name}
                status={subscription.status}
                currentEndsAt={subscription.ends_at}
                currentUpdatedAt={subscription.updated_at}
                nowIso={nowIso}
              />
            ) : (
              <p className="mt-4 rounded-md border border-borderSoft bg-black/10 p-3 text-sm text-muted">Este usuario todavía no tiene suscripción. Valida o renueva primero para crear una caducidad.</p>
            )}
          </Card>

          <Card className="border-danger/20">
            <h2 className="text-lg font-semibold">Seguridad y expulsión</h2>
            <p className="mt-1 text-sm text-muted">Acciones sensibles. Mantienen las confirmaciones server-side existentes.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {accessStatus === "active" ? <CancelSubscriptionForm userId={id} /> : null}
              <Action userId={id} action="unban">{dashboardTexts.labels.unblock}</Action>
              {accessStatus === "active" ? <ConfirmKickForm userId={id} name={name} returnTo={`/admin/vip-guard/users/${id}`} activeUntil={subscription?.ends_at} /> : null}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Notas internas y etiquetas</h2>
            <p className="mt-1 text-sm text-muted">Solo son visibles para la administración.</p>
            <form action={updateUserProfileAction} className="mt-4 space-y-4">
              <input type="hidden" name="userId" value={id} />
              <label className="block text-sm">
                Notas internas
                <textarea name="internalNotes" defaultValue={user.internal_notes ?? ""} rows={7} placeholder="Pagos, acuerdos, contexto personal, próxima renovación…" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 outline-none focus:border-accent" />
              </label>
              <label className="block text-sm">
                Etiquetas separadas por comas
                <input name="tags" defaultValue={(user.tags ?? []).join(", ")} placeholder="VIP Antiguo, Amigo, Regalo" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 outline-none focus:border-accent" />
              </label>
              <Button>Guardar ficha</Button>
            </form>
            {user.tags?.length ? <div className="mt-4 flex flex-wrap gap-2">{user.tags.map((tag: string) => <span key={tag} className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">{tag}</span>)}</div> : null}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Referidos</h2>
            <p className="mt-1 text-sm text-muted">Relación de referidor/referido y recompensas aplicadas.</p>
            <div className="mt-4 space-y-3">
              {(referralResult.data ?? []).map((item) => {
                const isReferred = item.referred_user_id === id;
                return (
                  <div key={item.id} className="rounded-lg border border-borderSoft bg-black/10 p-3 text-sm">
                    <p>{isReferred ? "Vino referido por" : "Ha referido a"} <span className="font-medium text-ink">{referralName(isReferred ? item.referrer_user_id : item.referred_user_id)}</span></p>
                    <p className="mt-1 text-xs text-muted">{date(item.created_at, true)}</p>
                  </div>
                );
              })}
              {!referralResult.data?.length ? <p className="text-sm text-muted">Sin referidos registrados.</p> : null}
            </div>
            {rewardsResult.data?.length ? (
              <details className="mt-4 text-sm text-muted">
                <summary className="cursor-pointer hover:text-ink">Ver recompensas</summary>
                <div className="mt-3 space-y-2">
                  {rewardsResult.data.map((reward) => (
                    <p key={reward.id} className="rounded-md border border-borderSoft bg-black/10 p-2">
                      {reward.status} · +{reward.reward_days} días · {date(reward.applied_at ?? reward.created_at, true)}
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-semibold">Incidencias relacionadas</h2>
            <p className="mt-1 text-sm text-muted">Problemas operativos registrados para este usuario.</p>
            <div className="mt-4 space-y-3">
              {incidentsLoadError ? <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{incidentsLoadError}</p> : null}
              {incidents.map((incident) => (
                <div key={incident.id} className="rounded-lg border border-borderSoft bg-black/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{incident.title}</span>
                    <span className="rounded-full border border-borderSoft px-2 py-0.5 text-xs text-muted">{incident.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{date(incident.created_at, true)}</p>
                  {incident.description ? <p className="mt-2 text-sm text-muted">{incident.description}</p> : null}
                </div>
              ))}
              {!incidentsLoadError && !incidents.length ? <p className="text-sm text-muted">Sin incidencias para este usuario.</p> : null}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Historial / timeline</h2>
            <p className="mt-1 text-sm text-muted">Auditoría, bot, pagos e incidencias ordenados por fecha.</p>
            <div className="mt-4 max-h-[44rem] space-y-3 overflow-auto pr-1">
              {history.map((event) => (
                <div key={`${event.actor}-${event.id}`} className="border-l border-borderSoft pl-3">
                  <p className="text-sm">{dashboardActionLabel(event.action)} · {event.message ?? ""}</p>
                  <p className="mt-1 text-xs text-muted">{date(event.created_at, true)} · {event.actor === "bot" ? "Bot" : event.actor}</p>
                  {event.metadata ? (
                    <details className="mt-1 text-xs text-muted">
                      <summary className="cursor-pointer hover:text-ink">metadata</summary>
                      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2">{JSON.stringify(event.metadata, null, 2)}</pre>
                    </details>
                  ) : null}
                </div>
              ))}
              {!history.length ? <p className="text-sm text-muted">Aún no hay eventos.</p> : null}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Últimos logs del bot</h2>
            <div className="mt-4 space-y-3">
              {(botResult.data ?? []).slice(0, 8).map((log) => (
                <div key={log.id} className="border-t border-borderSoft pt-3">
                  <p className="text-sm">{log.message}</p>
                  <p className="mt-1 text-xs text-muted">{date(log.created_at, true)}</p>
                </div>
              ))}
              {!botResult.data?.length ? <p className="text-sm text-muted">Sin logs recientes.</p> : null}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
